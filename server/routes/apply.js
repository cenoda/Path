'use strict';

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db');
const { getUploadDir }    = require('../utils/uploadRoot');
const { findUniversity }  = require('../data/universities');
const calc = require('../utils/admissionCalc');

const router = express.Router();
const SCORE_IMAGE_MAX_SIZE = 15 * 1024 * 1024;

function normalizeTrack(rawTrack) {
    if (!rawTrack) return null;
    const normalized = String(rawTrack).trim();
    if (['인문', '문과'].includes(normalized)) return '인문';
    if (['자연', '이과'].includes(normalized)) return '자연';
    return null;
}

function inferTrackFromCategory(category) {
    const c = String(category || '');
    const naturalKeywords = ['자연', '공학', '의학', '간호', '약학', '생명', '과학'];
    return naturalKeywords.some(keyword => c.includes(keyword)) ? '자연' : '인문';
}

function requireAuth(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

// ── 성적표 이미지 업로드 설정 ─────────────────────────────────────────────
const scoreDir = getUploadDir('scores');
const scoreStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, scoreDir),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `exam_${Date.now()}${ext}`);
    },
});
const imageFilter = (_req, file, cb) => {
    if (/^image\//.test(String(file.mimetype || '').toLowerCase())) return cb(null, true);
    return cb(new Error('ONLY_IMAGE_ALLOWED'));
};
const uploadScore = multer({ storage: scoreStorage, limits: { fileSize: SCORE_IMAGE_MAX_SIZE }, fileFilter: imageFilter });

function sendScoreUploadError(res, err) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: `이미지 용량은 최대 ${Math.floor(SCORE_IMAGE_MAX_SIZE / (1024 * 1024))}MB까지 가능합니다.` });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: '업로드 필드가 올바르지 않습니다.' });
        }
        return res.status(400).json({ error: '이미지 업로드 요청이 올바르지 않습니다.' });
    }

    if (err?.message === 'ONLY_IMAGE_ALLOWED') {
        return res.status(400).json({ error: '이미지 파일만 업로드할 수 있습니다.' });
    }

    console.error('apply/scores/image multer 오류:', err);
    return res.status(400).json({ error: '이미지 업로드에 실패했습니다.' });
}

// ── 점수 제출/수정 ────────────────────────────────────────────────────────
router.post('/scores', requireAuth, async (req, res) => {
    const {
        korean_std, korean_percentile, korean_subject,
        math_std, math_percentile, math_subject,
        english_grade,
        explore1_subject, explore1_std, explore1_percentile,
        explore2_subject, explore2_std, explore2_percentile,
        history_grade,
        second_lang_subject, second_lang_std, second_lang_percentile,
        source_round_name,
    } = req.body;

    // 필수: 국어/수학/영어/한국사
    if (!korean_std || !math_std || !english_grade || !history_grade) {
        return res.status(400).json({ error: '국어, 수학, 영어, 한국사 점수는 필수입니다.' });
    }

    try {
        await pool.query(`
            INSERT INTO exam_scores
                (user_id,
                 korean_std, korean_percentile, korean_subject,
                 math_std, math_percentile, math_subject,
                 english_grade,
                 explore1_subject, explore1_std, explore1_percentile,
                 explore2_subject, explore2_std, explore2_percentile,
                 history_grade,
                 second_lang_subject, second_lang_std, second_lang_percentile,
                 source_round_name, updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                korean_std=$2, korean_percentile=$3, korean_subject=$4,
                math_std=$5, math_percentile=$6, math_subject=$7,
                english_grade=$8,
                explore1_subject=$9, explore1_std=$10, explore1_percentile=$11,
                explore2_subject=$12, explore2_std=$13, explore2_percentile=$14,
                history_grade=$15,
                second_lang_subject=$16, second_lang_std=$17, second_lang_percentile=$18,
                source_round_name=$19,
                verified_status = CASE
                    WHEN exam_scores.verified_status = 'approved' THEN 'none'
                    ELSE exam_scores.verified_status
                END,
                updated_at=NOW()
        `, [
            req.session.userId,
            korean_std || null, korean_percentile || null, korean_subject || null,
            math_std || null, math_percentile || null, math_subject || null,
            english_grade || null,
            explore1_subject || null, explore1_std || null, explore1_percentile || null,
            explore2_subject || null, explore2_std || null, explore2_percentile || null,
            history_grade || null,
            second_lang_subject || null, second_lang_std || null, second_lang_percentile || null,
            source_round_name || null,
        ]);

        const row = await pool.query('SELECT * FROM exam_scores WHERE user_id = $1', [req.session.userId]);
        res.json({ ok: true, scores: row.rows[0] });
    } catch (err) {
        console.error('apply/scores POST 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 성적표 이미지 업로드 ──────────────────────────────────────────────────
router.post('/scores/image', requireAuth, (req, res) => {
    uploadScore.single('scoreImage')(req, res, async (err) => {
        if (err) return sendScoreUploadError(res, err);
        if (!req.file) return res.status(400).json({ error: '이미지를 선택해주세요.' });

        const imageUrl = `/uploads/scores/${req.file.filename}`;
        try {
            await pool.query(`
                INSERT INTO exam_scores (user_id, score_image_url, verified_status, updated_at)
                VALUES ($1, $2, 'pending', NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    score_image_url=$2, verified_status='pending', updated_at=NOW()
            `, [req.session.userId, imageUrl]);
            res.json({ ok: true, imageUrl });
        } catch (dbErr) {
            console.error('apply/scores/image 오류:', dbErr.message);
            res.status(500).json({ error: '서버 오류' });
        }
    });
});

// ── 내 점수 조회 ──────────────────────────────────────────────────────────
router.get('/scores/me', requireAuth, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM exam_scores WHERE user_id = $1', [req.session.userId]);
        res.json({ scores: result.rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 회차 목록 ─────────────────────────────────────────────────────────────
router.get('/rounds', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, exam_type, status, apply_start_at, apply_end_at, result_at, created_at
            FROM admission_rounds
            WHERE status != 'final'
            ORDER BY created_at DESC
            LIMIT 20
        `);
        res.json({ rounds: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/rounds/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, exam_type, status, apply_start_at, apply_end_at, result_at, created_at
             FROM admission_rounds WHERE id = $1`,
            [req.params.id]
        );
        if (!result.rows[0]) return res.status(404).json({ error: '회차를 찾을 수 없습니다.' });
        res.json({ round: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 칸수 조회 ─────────────────────────────────────────────────────────────
router.get('/kan', requireAuth, async (req, res) => {
    const { university, department, track } = req.query;
    if (!university) return res.status(400).json({ error: '대학명을 입력해주세요.' });

    try {
        const scoreRes = await pool.query('SELECT * FROM exam_scores WHERE user_id = $1', [req.session.userId]);
        const scores = scoreRes.rows[0];
        if (!scores) return res.status(400).json({ error: '점수를 먼저 입력해주세요.' });
        if (scores.verified_status === 'none' && !scores.korean_std) {
            return res.status(400).json({ error: '점수를 먼저 입력해주세요.' });
        }

        const info = calc.getKanInfo(scores, university, department || '', track || '인문');
        if (!info) return res.status(404).json({ error: '대학 정보를 찾을 수 없습니다.' });

        res.json(info);
    } catch (err) {
        console.error('apply/kan 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 다른 유저 칸수 엿보기 (골드 소모) ─────────────────────────────────────
const KAN_PEEK_COST = 30;

router.get('/kan/:userId', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.userId);
    const { university, department, track, round_id } = req.query;

    if (targetId === req.session.userId) return res.status(400).json({ error: '본인 칸수는 무료로 조회하세요.' });
    if (!university) return res.status(400).json({ error: '대학명을 입력해주세요.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 골드 차감
        const goldRes = await client.query(
            'UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold',
            [KAN_PEEK_COST, req.session.userId]
        );
        if (goldRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. (필요: ${KAN_PEEK_COST}G)` });
        }

        // 대상 유저 점수 조회 (인증된 유저만)
        const scoreRes = await client.query(
            `SELECT es.* FROM exam_scores es WHERE es.user_id = $1 AND es.verified_status = 'approved'`,
            [targetId]
        );
        if (!scoreRes.rows[0]) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '해당 유저는 성적표 인증을 하지 않았습니다.' });
        }

        const info = calc.getKanInfo(scoreRes.rows[0], university, department || '', track || '인문');
        if (!info) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대학 정보를 찾을 수 없습니다.' });
        }

        await client.query('COMMIT');
        res.json({ ...info, cost: KAN_PEEK_COST, remaining_gold: goldRes.rows[0].gold });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('apply/kan/:userId 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 원서 제출 ─────────────────────────────────────────────────────────────
router.post('/applications', requireAuth, async (req, res) => {
    const { round_id, university, department, group_type, track } = req.body;

    if (!round_id || !university || !department || !group_type) {
        return res.status(400).json({ error: '필수 항목이 누락되었습니다.' });
    }
    if (!['가', '나', '다'].includes(group_type)) {
        return res.status(400).json({ error: '군은 가/나/다 중 하나여야 합니다.' });
    }

    const uni = findUniversity(university);
    if (!uni) {
        return res.status(404).json({ error: '대학 정보를 찾을 수 없습니다.' });
    }
    const dept = uni.getDepartment(String(department).trim());
    if (!dept) {
        return res.status(400).json({ error: '해당 대학의 학과 정보를 찾을 수 없습니다.' });
    }

    const resolvedDepartment = dept.name;
    const resolvedTrack = normalizeTrack(track) || inferTrackFromCategory(dept.category);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 회차 확인
        const roundRes = await client.query(
            `SELECT id, status, result_at, apply_end_at FROM admission_rounds WHERE id = $1`,
            [round_id]
        );
        const round = roundRes.rows[0];
        if (!round) { await client.query('ROLLBACK'); return res.status(404).json({ error: '회차를 찾을 수 없습니다.' }); }
        if (round.status !== 'open') { await client.query('ROLLBACK'); return res.status(400).json({ error: '지원 기간이 아닙니다.' }); }

        // 점수 인증 여부 (점수 입력은 필수, 인증은 선택이지만 점수 입력은 있어야 함)
        const scoreRes = await client.query(
            `SELECT korean_std FROM exam_scores WHERE user_id = $1`,
            [req.session.userId]
        );
        if (!scoreRes.rows[0]?.korean_std) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '점수를 먼저 입력해주세요.' });
        }

        // 티켓 소모
        const ticketRes = await client.query(
            'UPDATE users SET tickets = tickets - 1 WHERE id = $1 AND tickets >= 1 RETURNING tickets',
            [req.session.userId]
        );
        if (ticketRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '원서비(티켓)가 부족합니다.' });
        }

        // 원서 저장
        const appRes = await client.query(`
            INSERT INTO applications (round_id, user_id, university, department, track, group_type, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'applied')
            ON CONFLICT (round_id, user_id, group_type) DO UPDATE SET
                university=$3, department=$4, track=$5, status='applied', cancelled_at=NULL
            RETURNING *
        `, [round_id, req.session.userId, university, resolvedDepartment, resolvedTrack, group_type]);

        await client.query('COMMIT');
        res.json({ ok: true, application: appRes.rows[0], remaining_tickets: ticketRes.rows[0].tickets });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('apply/applications POST 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 원서 취소 ─────────────────────────────────────────────────────────────
router.delete('/applications/:id', requireAuth, async (req, res) => {
    const appId = parseInt(req.params.id);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 원서 확인
        const appRes = await client.query(
            `SELECT a.*, r.result_at, r.status as round_status
             FROM applications a
             JOIN admission_rounds r ON r.id = a.round_id
             WHERE a.id = $1 AND a.user_id = $2`,
            [appId, req.session.userId]
        );
        const app = appRes.rows[0];
        if (!app) { await client.query('ROLLBACK'); return res.status(404).json({ error: '원서를 찾을 수 없습니다.' }); }
        if (app.status === 'cancelled') { await client.query('ROLLBACK'); return res.status(400).json({ error: '이미 취소된 원서입니다.' }); }
        if (app.round_status !== 'open') { await client.query('ROLLBACK'); return res.status(400).json({ error: '취소 가능한 기간이 아닙니다.' }); }

        // 결과 발표 3일 전 이후 취소 불가
        if (app.result_at) {
            const msLeft = new Date(app.result_at) - new Date();
            if (msLeft < 3 * 24 * 60 * 60 * 1000) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: '결과 발표 3일 전부터는 취소할 수 없습니다.' });
            }
        }

        await client.query(
            `UPDATE applications SET status='cancelled', cancelled_at=NOW() WHERE id=$1`,
            [appId]
        );

        // 티켓 환불
        await client.query('UPDATE users SET tickets = tickets + 1 WHERE id = $1', [req.session.userId]);

        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('apply/applications DELETE 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 내 원서 현황 ──────────────────────────────────────────────────────────
router.get('/applications/me', requireAuth, async (req, res) => {
    const { round_id } = req.query;
    try {
        let query = `
            SELECT a.*, r.name as round_name, r.status as round_status, r.result_at
            FROM applications a
            JOIN admission_rounds r ON r.id = a.round_id
            WHERE a.user_id = $1 AND a.status != 'cancelled'
        `;
        const params = [req.session.userId];
        if (round_id) { query += ` AND a.round_id = $2`; params.push(round_id); }
        query += ` ORDER BY a.created_at DESC`;

        const result = await pool.query(query, params);

        // 칸수 계산 포함
        const scoreRes = await pool.query('SELECT * FROM exam_scores WHERE user_id = $1', [req.session.userId]);
        const scores = scoreRes.rows[0];

        const applications = result.rows.map(app => {
            let kanInfo = null;
            if (scores?.korean_std) {
                kanInfo = calc.getKanInfo(scores, app.university, app.department, app.track || '인문');
            }
            return { ...app, kanInfo };
        });

        res.json({ applications });
    } catch (err) {
        console.error('apply/applications/me 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 대학 검색 + 칸수 미리보기 ────────────────────────────────────────────
router.get('/search', requireAuth, async (req, res) => {
    const { q, track } = req.query;
    if (!q || q.length < 1) return res.json({ results: [] });

    try {
        const scoreRes = await pool.query('SELECT * FROM exam_scores WHERE user_id = $1', [req.session.userId]);
        const scores = scoreRes.rows[0];
        const requestedTrack = normalizeTrack(track);

        // 대학 목록에서 검색
        const { getAllUniversities } = require('../data/universities');
        const qLower = q.toLowerCase();
        const unis = getAllUniversities().filter(u => {
            const nameHit = String(u.name || '').toLowerCase().includes(qLower);
            const aliasHit = (u.aliases || []).some(a => String(a || '').toLowerCase().includes(qLower));
            if (nameHit || aliasHit) return true;

            const fullUni = findUniversity(u.name);
            if (!fullUni || !Array.isArray(fullUni.departments)) return false;
            return fullUni.departments.some(dept =>
                String(dept?.name || '').toLowerCase().includes(qLower)
            );
        });

        const results = [];
        for (const uniMeta of unis.slice(0, 20)) {
            const fullUni = findUniversity(uniMeta.name);
            if (!fullUni) continue;

            const deptList = Array.isArray(fullUni.departments) ? fullUni.departments : [];
            const matchedDepts = deptList.filter(dept => {
                const deptNameHit = String(dept?.name || '').toLowerCase().includes(qLower);
                const uniNameHit = String(fullUni.name || '').toLowerCase().includes(qLower);
                return deptNameHit || uniNameHit;
            });

            for (const dept of matchedDepts.slice(0, 12)) {
                const deptTrack = requestedTrack || inferTrackFromCategory(dept.category);
                const kanInfo = scores?.korean_std
                    ? calc.getKanInfo(scores, fullUni.name, dept.name, deptTrack)
                    : null;

                results.push({
                    name: fullUni.name,
                    university: fullUni.name,
                    department: dept.name,
                    category: dept.category || null,
                    region: fullUni.region,
                    type: fullUni.type,
                    track: deptTrack,
                    kanInfo,
                });

                if (results.length >= 50) break;
            }
            if (results.length >= 50) break;
        }

        if (results.length === 0) {
            // 학과명이 아닌 대학명만 들어오는 경우를 위한 완만한 fallback
            for (const uniMeta of unis.slice(0, 15)) {
                const fallbackTrack = requestedTrack || '인문';
                const kanInfo = scores?.korean_std
                    ? calc.getKanInfo(scores, uniMeta.name, '', fallbackTrack)
                    : null;
                results.push({
                    name: uniMeta.name,
                    university: uniMeta.name,
                    department: null,
                    category: null,
                    region: uniMeta.region,
                    type: uniMeta.type,
                    track: fallbackTrack,
                    kanInfo,
                });
            }
        }

        res.json({ results });
    } catch (err) {
        console.error('apply/search 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 결과 조회 ─────────────────────────────────────────────────────────────
router.get('/results/me', requireAuth, async (req, res) => {
    const { round_id } = req.query;
    try {
        let query = `
            SELECT a.*, r.name as round_name, r.status as round_status, r.result_at
            FROM applications a
            JOIN admission_rounds r ON r.id = a.round_id
            WHERE a.user_id = $1 AND a.status NOT IN ('cancelled', 'applied')
        `;
        const params = [req.session.userId];
        if (round_id) { query += ` AND a.round_id = $2`; params.push(round_id); }
        query += ` ORDER BY a.result_at DESC, a.group_type`;

        const result = await pool.query(query, params);
        res.json({ results: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 추합 결과 조회 ────────────────────────────────────────────────────────
router.get('/results/supplementary/me', requireAuth, async (req, res) => {
    const { round_id } = req.query;
    try {
        // waitlisted → passed 된 것들
        const result = await pool.query(`
            SELECT a.*, r.name as round_name, r.result_at,
                   s.sub_round, s.status as sub_status
            FROM applications a
            JOIN admission_rounds r ON r.id = a.round_id
            LEFT JOIN supplementary_rounds s ON s.round_id = a.round_id
            WHERE a.user_id = $1 AND a.status = 'passed'
              ${round_id ? 'AND a.round_id = $2' : ''}
            ORDER BY a.result_at DESC
        `, round_id ? [req.session.userId, round_id] : [req.session.userId]);

        res.json({ results: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 등록 (군 선택) ────────────────────────────────────────────────────────
router.post('/enroll', requireAuth, async (req, res) => {
    const { application_id } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 합격한 원서 중 선택
        const appRes = await client.query(`
            SELECT a.*, r.status as round_status
            FROM applications a
            JOIN admission_rounds r ON r.id = a.round_id
            WHERE a.id = $1 AND a.user_id = $2 AND a.status = 'passed'
        `, [application_id, req.session.userId]);

        const app = appRes.rows[0];
        if (!app) { await client.query('ROLLBACK'); return res.status(404).json({ error: '합격한 원서를 찾을 수 없습니다.' }); }

        // 같은 회차 다른 군 declined 처리
        await client.query(`
            UPDATE applications
            SET status = 'declined'
            WHERE round_id = $1 AND user_id = $2 AND id != $3 AND status = 'passed'
        `, [app.round_id, req.session.userId, application_id]);

        // 선택 원서 enrolled 처리
        await client.query(
            `UPDATE applications SET status = 'enrolled' WHERE id = $1`,
            [application_id]
        );

        // 대학 이전
        await client.query(
            `UPDATE users SET university = $1 WHERE id = $2`,
            [app.university, req.session.userId]
        );

        // 알림
        await client.query(
            `INSERT INTO notifications (user_id, type, message) VALUES ($1, 'admission', $2)`,
            [req.session.userId, `🎓 ${app.university}${app.department ? ' ' + app.department : ''} 최종 등록 완료!`]
        );

        await client.query('COMMIT');
        res.json({ ok: true, university: app.university });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('apply/enroll 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 현재 진행 중 회차 (빠른 조회) ────────────────────────────────────────
router.get('/current-round', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, exam_type, status, apply_start_at, apply_end_at, result_at
            FROM admission_rounds
            WHERE status IN ('open', 'closed', 'announcing', 'announced')
            ORDER BY created_at DESC
            LIMIT 1
        `);
        res.json({ round: result.rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
