const express = require('express');
const pool = require('../db');
const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const router = express.Router();
const execFileAsync = promisify(execFile);
const ALWAYS_MAIN_ADMIN_NICKNAME = '낭만화1';
const ADMIN_WORLD_XY_LIMIT = 100000;
const ADMIN_WORLD_Z_MIN = -40;
const ADMIN_WORLD_Z_MAX = 500;
const ADMIN_RANDOM_SPAWN_RANGE_XY = 5800;
const ROOT_DIR = path.resolve(__dirname, '..', '..');
const UNIVERSITY_DATA_DIR = path.join(ROOT_DIR, 'server', 'data');
const UNIVERSITY_MANIFEST_PATH = path.join(UNIVERSITY_DATA_DIR, 'source-manifest.json');
const UNIVERSITY_TRUST_POLICY_PATH = path.join(UNIVERSITY_DATA_DIR, 'university-trust-policy.json');
const UNIVERSITY_PIPELINE_PATH = path.join(UNIVERSITY_DATA_DIR, 'university-pipeline.json');
const UNIVERSITY_REJECTS_PATH = path.join(UNIVERSITY_DATA_DIR, 'university-rejects.json');

async function readJsonFile(filePath, fallback = null) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') return fallback;
        throw err;
    }
}

async function writeJsonFile(filePath, payload) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function runUniversityCli(args = []) {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'university-data-cli.js');
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, ...args], {
        cwd: ROOT_DIR,
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 8,
    });
    return {
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
    };
}

async function runUniversityValidate() {
    const scriptPath = path.join(ROOT_DIR, 'scripts', 'validate-university-real-data.js');
    const realPath = path.join(ROOT_DIR, 'server', 'data', 'universities.real.json');
    const { stdout, stderr } = await execFileAsync('node', [scriptPath, realPath], {
        cwd: ROOT_DIR,
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 4,
    });
    return {
        stdout: (stdout || '').trim(),
        stderr: (stderr || '').trim(),
    };
}

function normalizeTrustPolicy(input = {}) {
    return {
        minConfidence: Number.isFinite(Number(input.minConfidence)) ? Number(input.minConfidence) : 0.75,
        requireYear: input.requireYear !== false,
        requireSourceId: input.requireSourceId !== false,
        requireSourceUrl: input.requireSourceUrl !== false,
        requireAtLeastOneScore: input.requireAtLeastOneScore !== false,
    };
}

function randomInt(min, max) {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

async function writeAdminAuditLog(client, { action, actorUserId, targetUserId = null, details = {} }) {
    await client.query(
        `INSERT INTO admin_audit_logs (action, actor_user_id, target_user_id, details)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [action, actorUserId, targetUserId, JSON.stringify(details || {})]
    );
}

function validateNickname(nickname) {
    const value = (nickname || '').trim();
    if (value.length < 2 || value.length > 20) {
        return { ok: false, error: '닉네임은 2~20자 사이여야 합니다.' };
    }
    if (!/^[a-zA-Z0-9가-힣_]+$/.test(value)) {
        return { ok: false, error: '닉네임은 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.' };
    }
    return { ok: true, value };
}

function isBlankAdminInput(value) {
    return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function parseAdminIntegerField(rawValue, fallbackValue, { min = 0, max = Number.MAX_SAFE_INTEGER, error }) {
    if (isBlankAdminInput(rawValue)) {
        return { ok: true, value: fallbackValue };
    }

    const parsed = Number.parseInt(String(rawValue), 10);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        return { ok: false, error };
    }

    return { ok: true, value: parsed };
}

function normalizeAdminTier(rawValue, fallbackValue) {
    const nextValue = String(rawValue || '').trim();
    const resolved = nextValue || String(fallbackValue || 'BRONZE').trim() || 'BRONZE';
    if (!resolved || resolved.length > 20) {
        return { ok: false, error: '티어는 1~20자 사이여야 합니다.' };
    }

    return { ok: true, value: resolved };
}

function parseAdminScoreField(rawValue, { label, min, max, required = true, allowDecimal = false }) {
    const text = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();

    if (!text) {
        if (!required) return { ok: true, value: null };
        return { ok: false, error: `${label}를 입력해주세요.` };
    }

    const parsed = Number(text);
    if (!Number.isFinite(parsed)) {
        return { ok: false, error: `${label}는 숫자여야 합니다.` };
    }

    if (!allowDecimal && !Number.isInteger(parsed)) {
        return { ok: false, error: `${label}는 정수여야 합니다.` };
    }

    if (parsed < min || parsed > max) {
        return { ok: false, error: `${label}는 ${min}~${max} 범위여야 합니다.` };
    }

    return { ok: true, value: parsed };
}

function percentileToGrade(percentile) {
    const p = Number(percentile);
    if (!Number.isFinite(p)) return 9;
    if (p >= 96) return 1;
    if (p >= 89) return 2;
    if (p >= 77) return 3;
    if (p >= 60) return 4;
    if (p >= 40) return 5;
    if (p >= 23) return 6;
    if (p >= 11) return 7;
    if (p >= 4) return 8;
    return 9;
}

async function getAdminRole(userId) {
    const result = await pool.query(
        'SELECT nickname, is_admin, admin_role FROM users WHERE id = $1',
        [userId]
    );
    const row = result.rows[0];
    if (!row) return 'none';

    if (row.nickname === ALWAYS_MAIN_ADMIN_NICKNAME) {
        if (row.is_admin !== true || row.admin_role !== 'main') {
            await pool.query(
                `UPDATE users
                 SET is_admin = TRUE,
                     admin_role = 'main'
                 WHERE id = $1`,
                [userId]
            );
        }
        return 'main';
    }

    if (row.admin_role === 'main' || row.admin_role === 'sub') return row.admin_role;
    return row.is_admin ? 'sub' : 'none';
}

async function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const role = await getAdminRole(req.session.userId);
        if (role === 'none') return res.status(403).json({ error: '관리자 권한이 없습니다.' });
        req.adminRole = role;
        next();
    } catch (err) {
        console.error('admin requireAdmin error:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
}

async function requireMainAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const role = await getAdminRole(req.session.userId);
        if (role !== 'main') return res.status(403).json({ error: '주관리자 권한이 필요합니다.' });
        req.adminRole = role;
        next();
    } catch (err) {
        console.error('admin requireMainAdmin error:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
}

router.get('/', requireAdmin, (req, res) => {
    res.json({
        ok: true,
        service: 'admin-api',
        admin_role: req.adminRole,
        message: '관리자 API가 정상 동작 중입니다.',
        endpoints: [
            'GET /api/admin/pending',
            'GET /api/admin/all-users',
            'GET /api/admin/roles',
            'GET /api/admin/audit-logs',
            'GET /api/admin/community-reports',
            'GET /api/admin/university-data/config',
            'POST /api/admin/update-user',
            'POST /api/admin/university-data/config (main only)',
            'POST /api/admin/university-data/collect (main only)',
            'POST /api/admin/university-data/export (main only)',
            'POST /api/admin/university-data/report',
            'POST /api/admin/university-data/validate',
            'POST /api/admin/teleport-random-user (main only)',
            'POST /api/admin/set-role (main only)',
            'POST /api/admin/approve-score',
            'POST /api/admin/reject-score',
            'POST /api/admin/approve-gpa',
            'POST /api/admin/reject-gpa',
            'POST /api/admin/community-reports/:id/review'
        ]
    });
});

router.get('/audit-logs', requireAdmin, async (req, res) => {
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40));
    const offset = page * limit;
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';
    const keyword = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const params = [];
    const where = [];

    if (action && action !== 'all') {
        params.push(action);
        where.push(`l.action = $${params.length}`);
    }
    if (keyword) {
        params.push(`%${keyword}%`);
        where.push(`(
            CAST(l.actor_user_id AS TEXT) ILIKE $${params.length}
            OR CAST(l.target_user_id AS TEXT) ILIKE $${params.length}
            OR COALESCE(a.nickname, '') ILIKE $${params.length}
            OR COALESCE(t.nickname, '') ILIKE $${params.length}
            OR CAST(l.details AS TEXT) ILIKE $${params.length}
        )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    try {
        const [countRes, listRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)
                 FROM admin_audit_logs l
                 LEFT JOIN users a ON a.id = l.actor_user_id
                 LEFT JOIN users t ON t.id = l.target_user_id
                 ${whereSql}`,
                params
            ),
            pool.query(
                `SELECT l.id, l.action, l.actor_user_id, l.target_user_id, l.details, l.created_at,
                        a.nickname AS actor_nickname,
                        t.nickname AS target_nickname
                 FROM admin_audit_logs l
                 LEFT JOIN users a ON a.id = l.actor_user_id
                 LEFT JOIN users t ON t.id = l.target_user_id
                 ${whereSql}
                 ORDER BY l.created_at DESC, l.id DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        return res.json({
            total: parseInt(countRes.rows[0].count, 10),
            page,
            limit,
            logs: listRes.rows,
        });
    } catch (err) {
        console.error('admin audit-logs error:', err.message);
        return res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/community-reports', requireAdmin, async (req, res) => {
    const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim() : 'pending';
    const page = Math.max(0, parseInt(req.query.page, 10) || 0);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));
    const offset = page * limit;

    const allowedStatus = new Set(['pending', 'reviewed', 'dismissed', 'all']);
    const status = allowedStatus.has(statusRaw) ? statusRaw : 'pending';

    const params = [];
    let where = '';
    if (status !== 'all') {
        params.push(status);
        where = `WHERE merged.status = $${params.length}`;
    }

    try {
        const [countRes, rowsRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)
                 FROM (
                    SELECT r.id, r.status
                    FROM community_post_reports r
                    UNION ALL
                    SELECT r.id, r.status
                    FROM community_comment_reports r
                 ) merged
                 ${where}`,
                params
            ),
            pool.query(
                `SELECT merged.id, merged.report_type, merged.post_id, merged.comment_id,
                        merged.reporter_id, merged.reported_user_id,
                        merged.reason_code, merged.detail, merged.status,
                        merged.created_at, merged.reviewed_at, merged.reviewed_by,
                        merged.post_title, merged.comment_body,
                        ru.nickname AS reporter_nickname,
                        tu.nickname AS target_nickname,
                        au.nickname AS reviewed_by_nickname
                 FROM (
                    SELECT r.id,
                           'post'::text AS report_type,
                           r.post_id,
                           NULL::integer AS comment_id,
                           r.reporter_id,
                           r.reported_user_id,
                           r.reason_code,
                           r.detail,
                           r.status,
                           r.created_at,
                           r.reviewed_at,
                           r.reviewed_by,
                           p.title AS post_title,
                           NULL::text AS comment_body
                    FROM community_post_reports r
                    LEFT JOIN community_posts p ON p.id = r.post_id

                    UNION ALL

                    SELECT r.id,
                           'comment'::text AS report_type,
                           r.post_id,
                           r.comment_id,
                           r.reporter_id,
                           r.reported_user_id,
                           r.reason_code,
                           r.detail,
                           r.status,
                           r.created_at,
                           r.reviewed_at,
                           r.reviewed_by,
                           p.title AS post_title,
                           c.body AS comment_body
                    FROM community_comment_reports r
                    LEFT JOIN community_comments c ON c.id = r.comment_id
                    LEFT JOIN community_posts p ON p.id = r.post_id
                 ) merged
                 LEFT JOIN users ru ON ru.id = merged.reporter_id
                 LEFT JOIN users tu ON tu.id = merged.reported_user_id
                 LEFT JOIN users au ON au.id = merged.reviewed_by
                 ${where}
                 ORDER BY
                    CASE WHEN merged.status = 'pending' THEN 0 ELSE 1 END,
                    merged.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        return res.json({
            total: parseInt(countRes.rows[0].count, 10),
            page,
            limit,
            status,
            reports: rowsRes.rows,
        });
    } catch (err) {
        console.error('admin community-reports error:', err.message);
        return res.status(500).json({ error: '서버 오류' });
    }
});

async function reviewCommunityReport(req, res, defaultType = '') {
    const reportType = String(req.params.type || defaultType || '').trim();
    const reportId = parseInt(req.params.id, 10);
    const decisionRaw = typeof req.body?.decision === 'string' ? req.body.decision.trim() : '';

    if (!reportId) {
        return res.status(400).json({ error: '신고 ID를 확인해주세요.' });
    }

    const typeMap = {
        post: {
            table: 'community_post_reports',
        },
        comment: {
            table: 'community_comment_reports',
        },
    };
    const target = typeMap[reportType];
    if (!target) {
        return res.status(400).json({ error: '신고 타입을 확인해주세요.' });
    }

    const decisionMap = {
        reviewed: 'reviewed',
        dismiss: 'dismissed',
        dismissed: 'dismissed',
    };
    const nextStatus = decisionMap[decisionRaw];
    if (!nextStatus) {
        return res.status(400).json({ error: 'decision 값은 reviewed 또는 dismiss 이어야 합니다.' });
    }

    try {
        const result = await pool.query(
            `UPDATE ${target.table}
             SET status = $1,
                 reviewed_at = NOW(),
                 reviewed_by = $2
             WHERE id = $3
             RETURNING id, status, reviewed_at, reviewed_by`,
            [nextStatus, req.session.userId, reportId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: '신고를 찾을 수 없습니다.' });
        }

        return res.json({ ok: true, report: result.rows[0] });
    } catch (err) {
        console.error('admin review report error:', err.message);
        return res.status(500).json({ error: '서버 오류' });
    }
}

router.post('/community-reports/:type/:id/review', requireAdmin, async (req, res) => {
    return reviewCommunityReport(req, res);
});

router.post('/community-reports/:id/review', requireAdmin, async (req, res) => {
    return reviewCommunityReport(req, res, 'post');
});

router.get('/pending', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.nickname, u.real_name, u.university, u.prev_university, u.is_n_su,
                    COALESCE(es.score_image_url, u.score_image_url) AS score_image_url,
                    CASE
                        WHEN es.verified_status = 'pending' THEN 'pending'
                        ELSE u.score_status
                    END AS score_status,
                    es.korean_std, es.korean_percentile,
                    es.math_std, es.math_percentile,
                    es.english_std, es.english_percentile, es.english_grade,
                    es.explore1_std, es.explore1_percentile,
                    es.explore2_std, es.explore2_percentile,
                    es.history_std, es.history_percentile, es.history_grade,
                    es.second_lang_std, es.second_lang_percentile,
                    u.gpa_image_url, u.gpa_status, u.gpa_score, u.created_at,
                    es.verified_status AS apply_score_status,
                    es.updated_at AS apply_score_updated_at
             FROM users u
             LEFT JOIN exam_scores es ON es.user_id = u.id
             WHERE u.score_status = 'pending'
                OR u.gpa_status = 'pending'
                OR es.verified_status = 'pending'
             ORDER BY COALESCE(es.updated_at, u.created_at) DESC`
        );
        res.json({ submissions: result.rows });
    } catch (err) {
        console.error('admin pending error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/university-data/config', requireAdmin, async (_req, res) => {
    try {
        const [manifest, trustPolicy, pipeline, rejects] = await Promise.all([
            readJsonFile(UNIVERSITY_MANIFEST_PATH, { sources: [] }),
            readJsonFile(UNIVERSITY_TRUST_POLICY_PATH, normalizeTrustPolicy()),
            readJsonFile(UNIVERSITY_PIPELINE_PATH, { sources: [], records: [] }),
            readJsonFile(UNIVERSITY_REJECTS_PATH, { totalRejected: 0, rejects: [] }),
        ]);

        return res.json({
            manifest,
            trustPolicy,
            summary: {
                sourceCount: Array.isArray(manifest?.sources) ? manifest.sources.length : 0,
                enabledSourceCount: Array.isArray(manifest?.sources)
                    ? manifest.sources.filter(s => s && s.enabled !== false).length
                    : 0,
                pipelineSourceCount: Array.isArray(pipeline?.sources) ? pipeline.sources.length : 0,
                recordCount: Array.isArray(pipeline?.records) ? pipeline.records.length : 0,
                rejectedCount: Number.isFinite(Number(rejects?.totalRejected)) ? Number(rejects.totalRejected) : 0,
                pipelineUpdatedAt: pipeline?.updatedAt || null,
            }
        });
    } catch (err) {
        console.error('admin university-data config error:', err.message);
        return res.status(500).json({ error: '대학 데이터 설정을 불러오지 못했습니다.' });
    }
});

router.post('/university-data/config', requireMainAdmin, async (req, res) => {
    const manifest = req.body?.manifest;
    const trustPolicyRaw = req.body?.trustPolicy;

    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.sources)) {
        return res.status(400).json({ error: 'manifest.sources 배열이 필요합니다.' });
    }

    const trustPolicy = normalizeTrustPolicy(trustPolicyRaw || {});
    if (!Number.isFinite(trustPolicy.minConfidence) || trustPolicy.minConfidence < 0 || trustPolicy.minConfidence > 1) {
        return res.status(400).json({ error: 'minConfidence는 0~1 사이여야 합니다.' });
    }

    try {
        await Promise.all([
            writeJsonFile(UNIVERSITY_MANIFEST_PATH, {
                ...manifest,
                updatedAt: new Date().toISOString().slice(0, 10),
            }),
            writeJsonFile(UNIVERSITY_TRUST_POLICY_PATH, trustPolicy),
        ]);

        return res.json({ ok: true });
    } catch (err) {
        console.error('admin university-data config save error:', err.message);
        return res.status(500).json({ error: '대학 데이터 설정 저장에 실패했습니다.' });
    }
});

router.post('/university-data/collect', requireMainAdmin, async (req, res) => {
    const source = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
    const dryRun = req.body?.dryRun === true;
    const args = ['collect'];
    if (source) args.push('--source', source);
    if (dryRun) args.push('--dryRun', 'true');

    try {
        const result = await runUniversityCli(args);
        return res.json({ ok: true, ...result });
    } catch (err) {
        console.error('admin university-data collect error:', err.message);
        return res.status(500).json({ error: err.message || 'collect 실행 실패' });
    }
});

router.post('/university-data/export', requireMainAdmin, async (req, res) => {
    const allowUntrusted = req.body?.allowUntrusted === true;
    const args = ['export-real'];
    if (allowUntrusted) args.push('--allowUntrusted', 'true');

    try {
        const result = await runUniversityCli(args);
        return res.json({ ok: true, ...result });
    } catch (err) {
        console.error('admin university-data export error:', err.message);
        return res.status(500).json({ error: err.message || 'export 실행 실패' });
    }
});

router.post('/university-data/report', requireAdmin, async (_req, res) => {
    try {
        const result = await runUniversityCli(['quality-report']);
        let parsed = null;
        try {
            parsed = result.stdout ? JSON.parse(result.stdout) : null;
        } catch (_) {
            parsed = null;
        }
        return res.json({ ok: true, ...result, report: parsed });
    } catch (err) {
        console.error('admin university-data report error:', err.message);
        return res.status(500).json({ error: err.message || 'report 실행 실패' });
    }
});

router.post('/university-data/validate', requireAdmin, async (_req, res) => {
    try {
        const result = await runUniversityValidate();
        return res.json({ ok: true, ...result });
    } catch (err) {
        console.error('admin university-data validate error:', err.message);
        return res.status(500).json({ error: err.message || 'validate 실행 실패' });
    }
});

router.get('/all-users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, nickname, real_name, university, prev_university, is_n_su,
                    gold, diamond, exp, tier, tickets, score_status,
                    score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public,
                    world_x, world_y, world_z,
                    is_admin, admin_role, user_code, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json({ users: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/update-user', requireAdmin, async (req, res) => {
    const isMainAdmin = req.adminRole === 'main';
    const userId = parseInt(req.body?.user_id, 10);
    const nicknameRaw = typeof req.body?.nickname === 'string' ? req.body.nickname : '';
    const realNameRaw = typeof req.body?.real_name === 'string' ? req.body.real_name : '';
    const universityRaw = typeof req.body?.university === 'string' ? req.body.university : '';
    const isNSu = req.body?.is_n_su === true || req.body?.is_n_su === 'true' || req.body?.is_n_su === 1 || req.body?.is_n_su === '1';
    const prevUniversityRaw = typeof req.body?.prev_university === 'string' ? req.body.prev_university : '';
    const goldRaw = req.body?.gold;
    const diamondRaw = req.body?.diamond;
    const expRaw = req.body?.exp;
    const tierRaw = typeof req.body?.tier === 'string' ? req.body.tier : '';
    const ticketsRaw = req.body?.tickets;
    const gpaScoreRaw = req.body?.gpa_score;
    const gpaPublic = req.body?.gpa_public === true || req.body?.gpa_public === 'true' || req.body?.gpa_public === 1 || req.body?.gpa_public === '1';
    const worldXRaw = req.body?.world_x;
    const worldYRaw = req.body?.world_y;
    const worldZRaw = req.body?.world_z;

    if (!userId) {
        return res.status(400).json({ error: '유저 ID를 확인해주세요.' });
    }

    const nickValidation = validateNickname(nicknameRaw);
    if (!nickValidation.ok) {
        return res.status(400).json({ error: nickValidation.error });
    }

    const realName = realNameRaw.trim();
    if (!realName) {
        return res.status(400).json({ error: '실명을 입력해주세요.' });
    }
    if (realName.length > 50) {
        return res.status(400).json({ error: '실명은 50자 이하여야 합니다.' });
    }

    const university = universityRaw.trim();
    if (university.length > 100) {
        return res.status(400).json({ error: '대학교명은 100자 이하여야 합니다.' });
    }

    const prevUniversity = prevUniversityRaw.trim();
    if (isNSu && !prevUniversity) {
        return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });
    }
    if (prevUniversity.length > 100) {
        return res.status(400).json({ error: '전적 대학교명은 100자 이하여야 합니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const target = await client.query(
            `SELECT id, is_admin, admin_role,
                    gold, diamond, exp, tier, tickets, gpa_score, gpa_public,
                    world_x, world_y, world_z
             FROM users WHERE id = $1`,
            [userId]
        );
        if (!target.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }
        const targetUser = target.rows[0];

        const targetRole = targetUser.admin_role === 'main' || targetUser.admin_role === 'sub'
            ? targetUser.admin_role
            : (targetUser.is_admin ? 'sub' : 'none');
        if (!isMainAdmin && targetRole !== 'none') {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '부관리자는 관리자 계정을 수정할 수 없습니다.' });
        }

        let gold = targetUser.gold;
        let diamond = targetUser.diamond;
        let exp = targetUser.exp;
        let tier = targetUser.tier;
        let tickets = targetUser.tickets;
        let gpaScore = targetUser.gpa_score;
        let nextGpaPublic = targetUser.gpa_public;
        let worldX = targetUser.world_x;
        let worldY = targetUser.world_y;
        let worldZ = targetUser.world_z;

        const goldResult = parseAdminIntegerField(goldRaw, targetUser.gold, {
            min: 0,
            error: '골드는 0 이상의 정수여야 합니다.'
        });
        if (!goldResult.ok) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: goldResult.error });
        }
        gold = goldResult.value;

        if (isMainAdmin) {
            const diamondResult = parseAdminIntegerField(diamondRaw, targetUser.diamond, {
                min: 0,
                error: '다이아는 0 이상의 정수여야 합니다.'
            });
            if (!diamondResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: diamondResult.error });
            }
            diamond = diamondResult.value;

            const expResult = parseAdminIntegerField(expRaw, targetUser.exp, {
                min: 0,
                error: 'EXP는 0 이상의 정수여야 합니다.'
            });
            if (!expResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: expResult.error });
            }
            exp = expResult.value;

            const tierResult = normalizeAdminTier(tierRaw, targetUser.tier);
            if (!tierResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: tierResult.error });
            }
            tier = tierResult.value;

            const ticketsResult = parseAdminIntegerField(ticketsRaw, targetUser.tickets, {
                min: 0,
                error: '티켓은 0 이상의 정수여야 합니다.'
            });
            if (!ticketsResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: ticketsResult.error });
            }
            tickets = ticketsResult.value;

            const gpaScoreText = gpaScoreRaw === null || gpaScoreRaw === undefined ? '' : String(gpaScoreRaw).trim();
            gpaScore = null;
            if (gpaScoreText) {
                gpaScore = parseFloat(gpaScoreText);
                if (!Number.isFinite(gpaScore) || gpaScore < 1.0 || gpaScore > 9.0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: '내신은 1.0~9.0 범위로 입력해주세요.' });
                }
            }

            nextGpaPublic = gpaPublic;

            const worldXResult = parseAdminIntegerField(worldXRaw, targetUser.world_x, {
                min: -ADMIN_WORLD_XY_LIMIT,
                max: ADMIN_WORLD_XY_LIMIT,
                error: `X 좌표는 ${-ADMIN_WORLD_XY_LIMIT}~${ADMIN_WORLD_XY_LIMIT} 범위의 정수여야 합니다.`
            });
            if (!worldXResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: worldXResult.error });
            }
            worldX = worldXResult.value;

            const worldYResult = parseAdminIntegerField(worldYRaw, targetUser.world_y, {
                min: -ADMIN_WORLD_XY_LIMIT,
                max: ADMIN_WORLD_XY_LIMIT,
                error: `Y 좌표는 ${-ADMIN_WORLD_XY_LIMIT}~${ADMIN_WORLD_XY_LIMIT} 범위의 정수여야 합니다.`
            });
            if (!worldYResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: worldYResult.error });
            }
            worldY = worldYResult.value;

            const worldZResult = parseAdminIntegerField(worldZRaw, targetUser.world_z, {
                min: ADMIN_WORLD_Z_MIN,
                max: ADMIN_WORLD_Z_MAX,
                error: `Z 좌표는 ${ADMIN_WORLD_Z_MIN}~${ADMIN_WORLD_Z_MAX} 범위의 정수여야 합니다.`
            });
            if (!worldZResult.ok) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: worldZResult.error });
            }
            worldZ = worldZResult.value;
        }

        const duplicate = await client.query(
            'SELECT id FROM users WHERE nickname = $1 AND id <> $2',
            [nickValidation.value, userId]
        );
        if (duplicate.rows.length) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
        }

        const result = await client.query(
            `UPDATE users
             SET nickname = $1,
                 real_name = $2,
                 university = $3,
                 is_n_su = $4,
                 prev_university = $5,
                 gold = $6,
                 diamond = $7,
                 exp = $8,
                 tier = $9,
                 tickets = $10,
                 gpa_score = $11,
                 gpa_public = $12,
                 world_x = $13,
                 world_y = $14,
                 world_z = $15
             WHERE id = $16
             RETURNING id, nickname, real_name, university, is_n_su, prev_university,
                       gold, diamond, exp, tier, tickets, gpa_score, gpa_public,
                       world_x, world_y, world_z,
                       is_admin, admin_role, user_code, created_at`,
            [
                nickValidation.value,
                realName,
                university || null,
                isNSu,
                isNSu ? prevUniversity : null,
                gold,
                diamond,
                exp,
                tier,
                tickets,
                gpaScore,
                nextGpaPublic,
                worldX,
                worldY,
                worldZ,
                userId,
            ]
        );

        const updatedUser = result.rows[0];
        await writeAdminAuditLog(client, {
            action: 'admin.update_user',
            actorUserId: req.session.userId,
            targetUserId: userId,
            details: {
                actor_role: req.adminRole,
                before: {
                    gold: targetUser.gold,
                    diamond: targetUser.diamond,
                    exp: targetUser.exp,
                    tier: targetUser.tier,
                    tickets: targetUser.tickets,
                    gpa_score: targetUser.gpa_score,
                    gpa_public: targetUser.gpa_public,
                    world_x: targetUser.world_x,
                    world_y: targetUser.world_y,
                    world_z: targetUser.world_z,
                },
                after: {
                    gold: updatedUser.gold,
                    diamond: updatedUser.diamond,
                    exp: updatedUser.exp,
                    tier: updatedUser.tier,
                    tickets: updatedUser.tickets,
                    gpa_score: updatedUser.gpa_score,
                    gpa_public: updatedUser.gpa_public,
                    world_x: updatedUser.world_x,
                    world_y: updatedUser.world_y,
                    world_z: updatedUser.world_z,
                }
            }
        });

        await client.query('COMMIT');

        return res.json({ ok: true, user: updatedUser });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('admin update-user error:', err.message);
        return res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/teleport-random-user', requireMainAdmin, async (req, res) => {
    const userId = parseInt(req.body?.user_id, 10);
    if (!userId) {
        return res.status(400).json({ error: '유저 ID를 확인해주세요.' });
    }

    const worldX = randomInt(-ADMIN_RANDOM_SPAWN_RANGE_XY, ADMIN_RANDOM_SPAWN_RANGE_XY);
    const worldY = randomInt(-ADMIN_RANDOM_SPAWN_RANGE_XY, ADMIN_RANDOM_SPAWN_RANGE_XY);
    const worldZ = randomInt(ADMIN_WORLD_Z_MIN, ADMIN_WORLD_Z_MAX);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const beforeRes = await client.query(
            'SELECT id, world_x, world_y, world_z FROM users WHERE id = $1',
            [userId]
        );
        if (!beforeRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        const result = await client.query(
            `UPDATE users
             SET world_x = $1,
                 world_y = $2,
                 world_z = $3
             WHERE id = $4
             RETURNING id, nickname, world_x, world_y, world_z`,
            [worldX, worldY, worldZ, userId]
        );

        const updatedUser = result.rows[0];
        await writeAdminAuditLog(client, {
            action: 'admin.teleport_random_user',
            actorUserId: req.session.userId,
            targetUserId: userId,
            details: {
                actor_role: req.adminRole,
                before: beforeRes.rows[0],
                after: {
                    world_x: updatedUser.world_x,
                    world_y: updatedUser.world_y,
                    world_z: updatedUser.world_z,
                }
            }
        });

        await client.query('COMMIT');

        return res.json({ ok: true, user: updatedUser });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('admin teleport-random-user error:', err.message);
        return res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.get('/roles', requireAdmin, async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, nickname, is_admin,
                    CASE
                        WHEN admin_role IN ('main', 'sub') THEN admin_role
                        WHEN is_admin = TRUE THEN 'sub'
                        ELSE 'none'
                    END AS admin_role
             FROM users
             WHERE is_admin = TRUE OR admin_role IN ('main', 'sub')
             ORDER BY
                 CASE
                     WHEN admin_role = 'main' THEN 0
                     WHEN admin_role = 'sub' THEN 1
                     ELSE 2
                 END,
                 id ASC`
        );
        res.json({ admins: result.rows });
    } catch (err) {
        console.error('admin roles error:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/set-role', requireMainAdmin, async (req, res) => {
    const { user_id, role } = req.body;
    const userId = parseInt(user_id, 10);
    const nextRole = typeof role === 'string' ? role.trim() : '';
    const validRoles = new Set(['none', 'sub', 'main']);

    if (!userId || !validRoles.has(nextRole)) {
        return res.status(400).json({ error: 'user_id와 role(none|sub|main)을 확인해주세요.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const targetRes = await client.query(
            'SELECT id, nickname, is_admin, admin_role FROM users WHERE id = $1',
            [userId]
        );
        if (!targetRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }
        const before = targetRes.rows[0];

        if (userId === req.session.userId && nextRole !== 'main') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '본인 계정은 main 역할로만 설정할 수 있습니다.' });
        }

        if (nextRole === 'main') {
            await client.query(
                `UPDATE users
                 SET admin_role = 'sub', is_admin = TRUE
                 WHERE admin_role = 'main' AND id <> $1`,
                [userId]
            );
        }

        const updated = await client.query(
            `UPDATE users
             SET admin_role = $1,
                 is_admin = CASE WHEN $1 IN ('main', 'sub') THEN TRUE ELSE FALSE END
             WHERE id = $2
             RETURNING id, nickname, is_admin, admin_role`,
            [nextRole, userId]
        );

        await writeAdminAuditLog(client, {
            action: 'admin.set_role',
            actorUserId: req.session.userId,
            targetUserId: userId,
            details: {
                before: {
                    is_admin: before.is_admin,
                    admin_role: before.admin_role,
                },
                after: {
                    is_admin: updated.rows[0].is_admin,
                    admin_role: updated.rows[0].admin_role,
                }
            }
        });

        await client.query('COMMIT');

        res.json({ ok: true, user: updated.rows[0] });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        console.error('admin set-role error:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/approve-score', requireAdmin, async (req, res) => {
    const userId = parseInt(req.body?.user_id, 10);
    if (!userId) {
        return res.status(400).json({ error: '유저 ID를 확인해주세요.' });
    }

    const scorePayload = req.body?.scores && typeof req.body.scores === 'object'
        ? req.body.scores
        : null;
    let approvedExamScores = null;

    if (scorePayload) {
        const koreanStd = parseAdminScoreField(scorePayload.korean_std, { label: '국어 표준점수', min: 0, max: 200 });
        if (!koreanStd.ok) return res.status(400).json({ error: koreanStd.error });
        const koreanPercentile = parseAdminScoreField(scorePayload.korean_percentile, { label: '국어 백분위', min: 0, max: 100, allowDecimal: true });
        if (!koreanPercentile.ok) return res.status(400).json({ error: koreanPercentile.error });

        const mathStd = parseAdminScoreField(scorePayload.math_std, { label: '수학 표준점수', min: 0, max: 200 });
        if (!mathStd.ok) return res.status(400).json({ error: mathStd.error });
        const mathPercentile = parseAdminScoreField(scorePayload.math_percentile, { label: '수학 백분위', min: 0, max: 100, allowDecimal: true });
        if (!mathPercentile.ok) return res.status(400).json({ error: mathPercentile.error });

        const englishStd = parseAdminScoreField(scorePayload.english_std, { label: '영어 표준점수', min: 0, max: 200 });
        if (!englishStd.ok) return res.status(400).json({ error: englishStd.error });
        const englishPercentile = parseAdminScoreField(scorePayload.english_percentile, { label: '영어 백분위', min: 0, max: 100, allowDecimal: true });
        if (!englishPercentile.ok) return res.status(400).json({ error: englishPercentile.error });

        const explore1Std = parseAdminScoreField(scorePayload.explore1_std, { label: '탐구1 표준점수', min: 0, max: 100 });
        if (!explore1Std.ok) return res.status(400).json({ error: explore1Std.error });
        const explore1Percentile = parseAdminScoreField(scorePayload.explore1_percentile, { label: '탐구1 백분위', min: 0, max: 100, allowDecimal: true });
        if (!explore1Percentile.ok) return res.status(400).json({ error: explore1Percentile.error });

        const explore2Std = parseAdminScoreField(scorePayload.explore2_std, { label: '탐구2 표준점수', min: 0, max: 100 });
        if (!explore2Std.ok) return res.status(400).json({ error: explore2Std.error });
        const explore2Percentile = parseAdminScoreField(scorePayload.explore2_percentile, { label: '탐구2 백분위', min: 0, max: 100, allowDecimal: true });
        if (!explore2Percentile.ok) return res.status(400).json({ error: explore2Percentile.error });

        const historyStd = parseAdminScoreField(scorePayload.history_std, { label: '한국사 표준점수', min: 0, max: 100 });
        if (!historyStd.ok) return res.status(400).json({ error: historyStd.error });
        const historyPercentile = parseAdminScoreField(scorePayload.history_percentile, { label: '한국사 백분위', min: 0, max: 100, allowDecimal: true });
        if (!historyPercentile.ok) return res.status(400).json({ error: historyPercentile.error });

        const secondLangStd = parseAdminScoreField(scorePayload.second_lang_std, { label: '제2외국어 표준점수', min: 0, max: 100, required: false });
        if (!secondLangStd.ok) return res.status(400).json({ error: secondLangStd.error });
        const secondLangPercentile = parseAdminScoreField(scorePayload.second_lang_percentile, { label: '제2외국어 백분위', min: 0, max: 100, allowDecimal: true, required: false });
        if (!secondLangPercentile.ok) return res.status(400).json({ error: secondLangPercentile.error });

        const hasSecondLangStd = secondLangStd.value !== null;
        const hasSecondLangPercentile = secondLangPercentile.value !== null;
        if (hasSecondLangStd !== hasSecondLangPercentile) {
            return res.status(400).json({ error: '제2외국어는 표준점수와 백분위를 함께 입력해주세요.' });
        }

        approvedExamScores = {
            korean_std: koreanStd.value,
            korean_percentile: koreanPercentile.value,
            math_std: mathStd.value,
            math_percentile: mathPercentile.value,
            english_std: englishStd.value,
            english_percentile: englishPercentile.value,
            english_grade: percentileToGrade(englishPercentile.value),
            explore1_std: explore1Std.value,
            explore1_percentile: explore1Percentile.value,
            explore2_std: explore2Std.value,
            explore2_percentile: explore2Percentile.value,
            history_std: historyStd.value,
            history_percentile: historyPercentile.value,
            history_grade: percentileToGrade(historyPercentile.value),
            second_lang_std: secondLangStd.value,
            second_lang_percentile: secondLangPercentile.value,
        };
    } else {
        return res.status(400).json({ error: '과목별 점수 payload(scores)가 필요합니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const beforeRes = await client.query(
            'SELECT id, score_status FROM users WHERE id = $1',
            [userId]
        );
        if (!beforeRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        await client.query(
            `UPDATE users SET score_status = 'approved' WHERE id = $1`,
            [userId]
        );

        if (approvedExamScores) {
            await client.query(
                `INSERT INTO exam_scores (
                    user_id,
                    korean_std, korean_percentile,
                    math_std, math_percentile,
                    english_std, english_percentile, english_grade,
                    explore1_std, explore1_percentile,
                    explore2_std, explore2_percentile,
                    history_std, history_percentile, history_grade,
                    second_lang_std, second_lang_percentile,
                    verified_status, verified_at, updated_at
                )
                VALUES (
                    $1,
                    $2, $3,
                    $4, $5,
                    $6, $7, $8,
                    $9, $10,
                    $11, $12,
                    $13, $14, $15,
                    $16, $17,
                    'approved', NOW(), NOW()
                )
                ON CONFLICT (user_id) DO UPDATE
                SET korean_std = EXCLUDED.korean_std,
                    korean_percentile = EXCLUDED.korean_percentile,
                    math_std = EXCLUDED.math_std,
                    math_percentile = EXCLUDED.math_percentile,
                    english_std = EXCLUDED.english_std,
                    english_percentile = EXCLUDED.english_percentile,
                    english_grade = EXCLUDED.english_grade,
                    explore1_std = EXCLUDED.explore1_std,
                    explore1_percentile = EXCLUDED.explore1_percentile,
                    explore2_std = EXCLUDED.explore2_std,
                    explore2_percentile = EXCLUDED.explore2_percentile,
                    history_std = EXCLUDED.history_std,
                    history_percentile = EXCLUDED.history_percentile,
                    history_grade = EXCLUDED.history_grade,
                    second_lang_std = EXCLUDED.second_lang_std,
                    second_lang_percentile = EXCLUDED.second_lang_percentile,
                    verified_status = 'approved',
                    verified_at = NOW(),
                    updated_at = NOW()`,
                [
                    userId,
                    approvedExamScores.korean_std,
                    approvedExamScores.korean_percentile,
                    approvedExamScores.math_std,
                    approvedExamScores.math_percentile,
                    approvedExamScores.english_std,
                    approvedExamScores.english_percentile,
                    approvedExamScores.english_grade,
                    approvedExamScores.explore1_std,
                    approvedExamScores.explore1_percentile,
                    approvedExamScores.explore2_std,
                    approvedExamScores.explore2_percentile,
                    approvedExamScores.history_std,
                    approvedExamScores.history_percentile,
                    approvedExamScores.history_grade,
                    approvedExamScores.second_lang_std,
                    approvedExamScores.second_lang_percentile,
                ]
            );
        } else {
            await client.query(
                `INSERT INTO exam_scores (user_id, verified_status, verified_at, updated_at)
                 VALUES ($1, 'approved', NOW(), NOW())
                 ON CONFLICT (user_id) DO UPDATE
                 SET verified_status = 'approved',
                     verified_at = COALESCE(exam_scores.verified_at, NOW()),
                     updated_at = NOW()`,
                [userId]
            );
        }

        await writeAdminAuditLog(client, {
            action: 'admin.approve_score',
            actorUserId: req.session.userId,
            targetUserId: userId,
            details: {
                before: beforeRes.rows[0],
                after: {
                    score_status: 'approved',
                    exam_scores: approvedExamScores,
                },
            }
        });

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/reject-score', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const beforeRes = await client.query(
            'SELECT id, score_status, score_image_url FROM users WHERE id = $1',
            [user_id]
        );
        if (!beforeRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        await client.query(
            `UPDATE users SET score_status = 'rejected', score_image_url = NULL WHERE id = $1`,
            [user_id]
        );
        await client.query(
            `UPDATE exam_scores
             SET verified_status = 'rejected',
                 score_image_url = NULL,
                 updated_at = NOW()
             WHERE user_id = $1`,
            [user_id]
        );

        await writeAdminAuditLog(client, {
            action: 'admin.reject_score',
            actorUserId: req.session.userId,
            targetUserId: parseInt(user_id, 10),
            details: {
                before: beforeRes.rows[0],
                after: { score_status: 'rejected', score_image_url: null },
            }
        });

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/approve-gpa', requireAdmin, async (req, res) => {
    const { user_id, gpa } = req.body;
    const g = parseFloat(gpa);
    if (!user_id || isNaN(g) || g < 1.0 || g > 9.0) {
        return res.status(400).json({ error: '유저 ID와 내신 등급(1.0~9.0)을 확인해주세요.' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const beforeRes = await client.query(
            'SELECT id, gpa_score, gpa_status FROM users WHERE id = $1',
            [user_id]
        );
        if (!beforeRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        await client.query(
            `UPDATE users SET gpa_score = $1, gpa_status = 'approved' WHERE id = $2`,
            [g, user_id]
        );

        await writeAdminAuditLog(client, {
            action: 'admin.approve_gpa',
            actorUserId: req.session.userId,
            targetUserId: parseInt(user_id, 10),
            details: {
                before: beforeRes.rows[0],
                after: { gpa_score: g, gpa_status: 'approved' },
            }
        });

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/reject-gpa', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const beforeRes = await client.query(
            'SELECT id, gpa_status, gpa_image_url FROM users WHERE id = $1',
            [user_id]
        );
        if (!beforeRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        await client.query(
            `UPDATE users SET gpa_status = 'rejected', gpa_image_url = NULL WHERE id = $1`,
            [user_id]
        );

        await writeAdminAuditLog(client, {
            action: 'admin.reject_gpa',
            actorUserId: req.session.userId,
            targetUserId: parseInt(user_id, 10),
            details: {
                before: beforeRes.rows[0],
                after: { gpa_status: 'rejected', gpa_image_url: null },
            }
        });

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) {}
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ── 입시 회차 관리 ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
const calc = require('../utils/admissionCalc');

// 회차 목록
router.get('/rounds', requireAdmin, async (_req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, u.nickname as created_by_nickname
             FROM admission_rounds r
             LEFT JOIN users u ON u.id = r.created_by
             ORDER BY r.created_at DESC LIMIT 50`
        );
        res.json({ rounds: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// 회차 생성
router.post('/rounds', requireMainAdmin, async (req, res) => {
    const { name, exam_type, apply_start_at, apply_end_at, result_at } = req.body;
    if (!name || !exam_type) return res.status(400).json({ error: 'name, exam_type은 필수입니다.' });
    if (!['수능', '평가원', '교육청'].includes(exam_type)) {
        return res.status(400).json({ error: 'exam_type은 수능/평가원/교육청 중 하나여야 합니다.' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO admission_rounds (name, exam_type, status, apply_start_at, apply_end_at, result_at, created_by)
             VALUES ($1,$2,'upcoming',$3,$4,$5,$6) RETURNING *`,
            [name, exam_type, apply_start_at || null, apply_end_at || null, result_at || null, req.session.userId]
        );
        res.json({ ok: true, round: result.rows[0] });
    } catch (err) {
        console.error('admin/rounds POST 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 회차 상태/일정 수정
router.patch('/rounds/:id', requireMainAdmin, async (req, res) => {
    const id = parseInt(req.params.id);
    const { name, status, apply_start_at, apply_end_at, result_at } = req.body;
    const validStatuses = ['upcoming','open','closed','announcing','announced','final'];
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: '유효하지 않은 status입니다.' });
    }
    try {
        const result = await pool.query(
            `UPDATE admission_rounds
             SET name = COALESCE($2, name),
                 status = COALESCE($3, status),
                 apply_start_at = COALESCE($4, apply_start_at),
                 apply_end_at = COALESCE($5, apply_end_at),
                 result_at = COALESCE($6, result_at)
             WHERE id = $1 RETURNING *`,
            [id, name || null, status || null, apply_start_at || null, apply_end_at || null, result_at || null]
        );
        if (!result.rows[0]) return res.status(404).json({ error: '회차를 찾을 수 없습니다.' });
        res.json({ ok: true, round: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// 결과 발표 (정규분포 확률 기반 일괄 판정)
router.post('/rounds/:id/announce', requireMainAdmin, async (req, res) => {
    const roundId = parseInt(req.params.id);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const roundRes = await client.query(
            `SELECT * FROM admission_rounds WHERE id = $1 FOR UPDATE`, [roundId]
        );
        const round = roundRes.rows[0];
        if (!round) { await client.query('ROLLBACK'); return res.status(404).json({ error: '회차를 찾을 수 없습니다.' }); }
        if (!['closed','open'].includes(round.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '지원 마감 후에 결과를 발표할 수 있습니다.' });
        }

        // 전체 유저 수 (A 추정에 사용)
        const totalUsersRes = await client.query('SELECT COUNT(*) as cnt FROM users');
        const siteUserCount = parseInt(totalUsersRes.rows[0].cnt);

        // 대학+학과+군별로 묶어서 처리
        const appsRes = await client.query(`
            SELECT a.id, a.user_id, a.university, a.department, a.group_type,
                   es.korean_std, es.math_std, es.english_grade,
                   es.explore1_std, es.explore2_std, es.history_grade,
                   es.math_subject, es.explore1_subject, es.explore2_subject
            FROM applications a
            JOIN exam_scores es ON es.user_id = a.user_id
            WHERE a.round_id = $1 AND a.status = 'applied'
            ORDER BY a.university, a.department, a.group_type
        `, [roundId]);

        // 그룹핑: university+department+group_type
        const groups = {};
        for (const app of appsRes.rows) {
            const key = `${app.university}||${app.department || ''}||${app.group_type}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(app);
        }

        // 이전 회차 통계 (베이지안 A 추정용)
        const historyRes = await client.query(`
            SELECT university, department, group_type, estimated_A
            FROM admission_stats
            WHERE round_id != $1
            ORDER BY round_id DESC
        `, [roundId]);

        const historyMap = {};
        for (const h of historyRes.rows) {
            const key = `${h.university}||${h.department || ''}||${h.group_type}`;
            if (!historyMap[key]) historyMap[key] = [];
            historyMap[key].push(h);
        }

        let passedCount = 0;
        let failedCount = 0;

        for (const [key, apps] of Object.entries(groups)) {
            const [university, department, group_type] = key.split('||');
            const uni = require('../data/universities').findUniversity(university);
            const basePercentile = uni ? uni.getPercentileForDept(department || '') : 50;

            // A 추정
            const history = historyMap[key] || [];
            const A = calc.estimateA(basePercentile, history);
            const V = apps.length;

            // 정원 추정
            const capacity = calc.estimateCapacity(basePercentile, siteUserCount);

            // 점수 순 정렬 (높은 순)
            apps.sort((a, b) => {
                const sa = calc.calcTotalStd(a);
                const sb = calc.calcTotalStd(b);
                return sb - sa;
            });

            let groupPassedCount = 0;

            // 각 지원자 R 계산 및 합불 판정
            for (let i = 0; i < apps.length; i++) {
                const app = apps[i];
                const r = i + 1; // 사이트 내 등수 (1부터)
                const R = calc.calcR(A, V, r);
                const passed = calc.drawResultByRank(R, capacity);

                await client.query(
                    `UPDATE applications SET status = $1, result_at = NOW() WHERE id = $2`,
                    [passed ? 'passed' : 'failed', app.id]
                );

                if (passed) {
                    passedCount++;
                    groupPassedCount++;
                    await client.query(
                        `INSERT INTO notifications (user_id, type, message)
                         VALUES ($1, 'admission_result', $2)`,
                        [app.user_id, `🎉 ${university}${department ? ` ${department}` : ''} ${group_type}군 합격! 등록 기간 내 대학을 선택하세요.`]
                    );
                } else {
                    failedCount++;
                    await client.query(
                        `INSERT INTO notifications (user_id, type, message)
                         VALUES ($1, 'admission_result', $2)`,
                        [app.user_id, `📋 ${university}${department ? ` ${department}` : ''} ${group_type}군 결과가 발표되었습니다.`]
                    );
                }
            }

            // 통계 저장
            await client.query(`
                INSERT INTO admission_stats (round_id, university, department, group_type, site_applicants, estimated_A, accepted_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (round_id, university, department, group_type)
                DO UPDATE SET site_applicants=$5, estimated_A=$6, accepted_count=$7
            `, [roundId, university, department || null, group_type, V, A, groupPassedCount]);
        }

        // 추합 라운드 1~3차 생성
        for (let sub = 1; sub <= 3; sub++) {
            await client.query(
                `INSERT INTO supplementary_rounds (round_id, sub_round, status)
                 VALUES ($1, $2, 'pending') ON CONFLICT DO NOTHING`,
                [roundId, sub]
            );
        }

        await client.query(
            `UPDATE admission_rounds SET status = 'announced' WHERE id = $1`, [roundId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, passed: passedCount, failed: failedCount });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('admin/rounds/announce 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// 추합 트리거 (1~3차)
router.post('/rounds/:id/supplementary/:sub_round', requireMainAdmin, async (req, res) => {
    const roundId   = parseInt(req.params.id);
    const subRound  = parseInt(req.params.sub_round);
    if (![1,2,3].includes(subRound)) return res.status(400).json({ error: '추합은 1~3차입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // declined (등록 포기) 된 자리 → failed 중 상위자 passed로 전환
        // 각 대학+학과+군별로 빈 자리 수 계산
        const declinedRes = await client.query(`
            SELECT university, department, group_type, COUNT(*) as declined_cnt
            FROM applications
            WHERE round_id = $1 AND status = 'declined'
            GROUP BY university, department, group_type
        `, [roundId]);

        let supplementCount = 0;

        const totalUsersRes = await client.query('SELECT COUNT(*) as cnt FROM users');
        const siteUserCount = parseInt(totalUsersRes.rows[0].cnt);

        for (const row of declinedRes.rows) {
                        const { university, department, group_type, declined_cnt } = row;
            const uni = require('../data/universities').findUniversity(university);
                        const basePercentile = uni ? uni.getPercentileForDept(department || '') : 50;
            const capacity = calc.estimateCapacity(basePercentile, siteUserCount);

                        // 같은 대학+학과+군에서 failed 상태인 지원자를 점수 순으로 가져옴
            const candidatesRes = await client.query(`
                SELECT a.id, a.user_id, a.university, a.department, a.group_type,
                       es.korean_std, es.math_std, es.explore1_std, es.explore2_std
                FROM applications a
                JOIN exam_scores es ON es.user_id = a.user_id
                                WHERE a.round_id = $1 AND a.university = $2
                                    AND COALESCE(a.department, '') = COALESCE($3, '') AND a.group_type = $4
                  AND a.status = 'failed'
                ORDER BY (COALESCE(es.korean_std,0) + COALESCE(es.math_std,0) +
                          COALESCE(es.explore1_std,0) + COALESCE(es.explore2_std,0)) DESC
                                LIMIT $5
                        `, [roundId, university, department || '', group_type, parseInt(declined_cnt)]);

            for (const candidate of candidatesRes.rows) {
                // 추합도 확률 판정 (여유있게 75%)
                if (!calc.drawResult(0.75)) continue;

                await client.query(
                    `UPDATE applications SET status = 'passed', result_at = NOW() WHERE id = $1`,
                    [candidate.id]
                );
                await client.query(
                    `INSERT INTO notifications (user_id, type, message)
                     VALUES ($1, 'supplementary', $2)`,
                    [candidate.user_id, `🎊 ${university}${department ? ` ${department}` : ''} ${group_type}군 ${subRound}차 추가합격! 오늘 안에 등록 여부를 결정해주세요.`]
                );
                supplementCount++;
            }
        }

        await client.query(
            `UPDATE supplementary_rounds SET status = 'announced', closed_at = NOW()
             WHERE round_id = $1 AND sub_round = $2`,
            [roundId, subRound]
        );

        await client.query('COMMIT');
        res.json({ ok: true, supplemented: supplementCount, sub_round: subRound });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('admin/supplementary 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// 성적표 인증 (exam_scores 테이블)
router.get('/pending-scores', requireAdmin, async (_req, res) => {
    try {
        const result = await pool.query(`
            SELECT es.*, u.nickname, u.real_name, u.university
            FROM exam_scores es
            JOIN users u ON u.id = es.user_id
            WHERE es.verified_status = 'pending'
            ORDER BY es.updated_at DESC
        `);
        res.json({ submissions: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/approve-exam-score', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
    try {
        await pool.query(
            `UPDATE exam_scores SET verified_status = 'approved', verified_at = NOW() WHERE user_id = $1`,
            [user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/reject-exam-score', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
    try {
        await pool.query(
            `UPDATE exam_scores SET verified_status = 'rejected', score_image_url = NULL WHERE user_id = $1`,
            [user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// 회차 통계
router.get('/rounds/:id/stats', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM admission_stats WHERE round_id = $1 ORDER BY university, group_type`,
            [req.params.id]
        );
        res.json({ stats: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
