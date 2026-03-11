const express = require('express');
const pool = require('../db');

const router = express.Router();
const ALWAYS_MAIN_ADMIN_NICKNAME = '낭만화1';

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
            'GET /api/admin/community-reports',
            'POST /api/admin/update-user',
            'POST /api/admin/set-role (main only)',
            'POST /api/admin/approve-score',
            'POST /api/admin/reject-score',
            'POST /api/admin/approve-gpa',
            'POST /api/admin/reject-gpa',
            'POST /api/admin/community-reports/:id/review'
        ]
    });
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
        where = `WHERE r.status = $${params.length}`;
    }

    try {
        const [countRes, rowsRes] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM community_post_reports r ${where}`, params),
            pool.query(
                `SELECT r.id, r.post_id, r.reporter_id, r.reported_user_id,
                        r.reason_code, r.detail, r.status, r.created_at, r.reviewed_at, r.reviewed_by,
                        p.title AS post_title,
                        ru.nickname AS reporter_nickname,
                        tu.nickname AS target_nickname,
                        au.nickname AS reviewed_by_nickname
                 FROM community_post_reports r
                 LEFT JOIN community_posts p ON p.id = r.post_id
                 LEFT JOIN users ru ON ru.id = r.reporter_id
                 LEFT JOIN users tu ON tu.id = r.reported_user_id
                 LEFT JOIN users au ON au.id = r.reviewed_by
                 ${where}
                 ORDER BY
                    CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
                    r.created_at DESC
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

router.post('/community-reports/:id/review', requireAdmin, async (req, res) => {
    const reportId = parseInt(req.params.id, 10);
    const decisionRaw = typeof req.body?.decision === 'string' ? req.body.decision.trim() : '';

    if (!reportId) {
        return res.status(400).json({ error: '신고 ID를 확인해주세요.' });
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
            `UPDATE community_post_reports
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
});

router.get('/pending', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, nickname, real_name, university, prev_university, is_n_su,
                    score_image_url, score_status, mock_exam_score,
                    gpa_image_url, gpa_status, gpa_score, created_at
             FROM users
             WHERE score_status = 'pending' OR gpa_status = 'pending'
             ORDER BY created_at DESC`
        );
        res.json({ submissions: result.rows });
    } catch (err) {
        console.error('admin pending error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/all-users', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, nickname, real_name, university, prev_university, is_n_su,
                    gold, exp, tier, tickets, mock_exam_score, score_status,
                    score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public,
                    is_admin, admin_role, user_code, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json({ users: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/update-user', requireAdmin, async (req, res) => {
    const userId = parseInt(req.body?.user_id, 10);
    const nicknameRaw = typeof req.body?.nickname === 'string' ? req.body.nickname : '';
    const realNameRaw = typeof req.body?.real_name === 'string' ? req.body.real_name : '';
    const universityRaw = typeof req.body?.university === 'string' ? req.body.university : '';
    const isNSu = !!req.body?.is_n_su;
    const prevUniversityRaw = typeof req.body?.prev_university === 'string' ? req.body.prev_university : '';

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
    if (!university) {
        return res.status(400).json({ error: '대학교를 입력해주세요.' });
    }
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

    try {
        const target = await pool.query(
            'SELECT id FROM users WHERE id = $1',
            [userId]
        );
        if (!target.rows.length) {
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        const duplicate = await pool.query(
            'SELECT id FROM users WHERE nickname = $1 AND id <> $2',
            [nickValidation.value, userId]
        );
        if (duplicate.rows.length) {
            return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
        }

        const result = await pool.query(
            `UPDATE users
             SET nickname = $1,
                 real_name = $2,
                 university = $3,
                 is_n_su = $4,
                 prev_university = $5
             WHERE id = $6
             RETURNING id, nickname, real_name, university, is_n_su, prev_university,
                       is_admin, admin_role, user_code, created_at`,
            [
                nickValidation.value,
                realName,
                university,
                isNSu,
                isNSu ? prevUniversity : null,
                userId,
            ]
        );

        return res.json({ ok: true, user: result.rows[0] });
    } catch (err) {
        console.error('admin update-user error:', err.message);
        return res.status(500).json({ error: '서버 오류' });
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

    try {
        const targetRes = await pool.query(
            'SELECT id, nickname, is_admin, admin_role FROM users WHERE id = $1',
            [userId]
        );
        if (!targetRes.rows.length) {
            return res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
        }

        if (userId === req.session.userId && nextRole !== 'main') {
            return res.status(400).json({ error: '본인 계정은 main 역할로만 설정할 수 있습니다.' });
        }

        if (nextRole === 'main') {
            await pool.query(
                `UPDATE users
                 SET admin_role = 'sub', is_admin = TRUE
                 WHERE admin_role = 'main' AND id <> $1`,
                [userId]
            );
        }

        const updated = await pool.query(
            `UPDATE users
             SET admin_role = $1,
                 is_admin = CASE WHEN $1 IN ('main', 'sub') THEN TRUE ELSE FALSE END
             WHERE id = $2
             RETURNING id, nickname, is_admin, admin_role`,
            [nextRole, userId]
        );

        res.json({ ok: true, user: updated.rows[0] });
    } catch (err) {
        console.error('admin set-role error:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/approve-score', requireAdmin, async (req, res) => {
    const { user_id, score } = req.body;
    const s = parseInt(score);
    if (!user_id || isNaN(s) || s < 0 || s > 600) {
        return res.status(400).json({ error: '유저 ID와 점수(0~600)를 확인해주세요.' });
    }
    try {
        await pool.query(
            `UPDATE users SET mock_exam_score = $1, score_status = 'approved' WHERE id = $2`,
            [s, user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/reject-score', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
    try {
        await pool.query(
            `UPDATE users SET score_status = 'rejected', score_image_url = NULL WHERE id = $1`,
            [user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/approve-gpa', requireAdmin, async (req, res) => {
    const { user_id, gpa } = req.body;
    const g = parseFloat(gpa);
    if (!user_id || isNaN(g) || g < 1.0 || g > 9.0) {
        return res.status(400).json({ error: '유저 ID와 내신 등급(1.0~9.0)을 확인해주세요.' });
    }
    try {
        await pool.query(
            `UPDATE users SET gpa_score = $1, gpa_status = 'approved' WHERE id = $2`,
            [g, user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/reject-gpa', requireAdmin, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: '유저 ID를 지정해주세요.' });
    try {
        await pool.query(
            `UPDATE users SET gpa_status = 'rejected', gpa_image_url = NULL WHERE id = $1`,
            [user_id]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
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

        // 대학별 그룹별로 묶어서 처리
        const appsRes = await client.query(`
            SELECT a.id, a.user_id, a.university, a.department, a.group_type,
                   es.korean_std, es.math_std, es.english_grade,
                   es.explore1_std, es.explore2_std, es.history_grade,
                   es.math_subject, es.explore1_subject, es.explore2_subject
            FROM applications a
            JOIN exam_scores es ON es.user_id = a.user_id
            WHERE a.round_id = $1 AND a.status = 'applied'
            ORDER BY a.university, a.group_type
        `, [roundId]);

        // 그룹핑: university+group_type
        const groups = {};
        for (const app of appsRes.rows) {
            const key = `${app.university}||${app.group_type}`;
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
            const key = `${h.university}||${h.group_type}`;
            if (!historyMap[key]) historyMap[key] = [];
            historyMap[key].push(h);
        }

        let passedCount = 0;
        let failedCount = 0;

        for (const [key, apps] of Object.entries(groups)) {
            const [university, group_type] = key.split('||');
            const uni = require('../data/universities').findUniversity(university);
            const basePercentile = uni ? uni.basePercentile : 50;

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
                    await client.query(
                        `INSERT INTO notifications (user_id, type, message)
                         VALUES ($1, 'admission_result', $2)`,
                        [app.user_id, `🎉 ${university} ${group_type}군 합격! 등록 기간 내 대학을 선택하세요.`]
                    );
                } else {
                    failedCount++;
                    await client.query(
                        `INSERT INTO notifications (user_id, type, message)
                         VALUES ($1, 'admission_result', $2)`,
                        [app.user_id, `📋 ${university} ${group_type}군 결과가 발표되었습니다.`]
                    );
                }
            }

            // 통계 저장
            await client.query(`
                INSERT INTO admission_stats (round_id, university, department, group_type, site_applicants, estimated_A, accepted_count)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (round_id, university, department, group_type)
                DO UPDATE SET site_applicants=$5, estimated_A=$6, accepted_count=$7
            `, [roundId, university, apps[0]?.department || null, group_type, V, A, passedCount]);
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

        // declined (등록 포기) 된 자리 → waitlisted 중 상위자 passed로 전환
        // 각 대학+군별로 빈 자리 수 계산
        const declinedRes = await client.query(`
            SELECT university, group_type, COUNT(*) as declined_cnt
            FROM applications
            WHERE round_id = $1 AND status = 'declined'
            GROUP BY university, group_type
        `, [roundId]);

        let supplementCount = 0;

        const totalUsersRes = await client.query('SELECT COUNT(*) as cnt FROM users');
        const siteUserCount = parseInt(totalUsersRes.rows[0].cnt);

        for (const row of declinedRes.rows) {
            const { university, group_type, declined_cnt } = row;
            const uni = require('../data/universities').findUniversity(university);
            const basePercentile = uni ? uni.basePercentile : 50;
            const capacity = calc.estimateCapacity(basePercentile, siteUserCount);

            // 같은 대학+군에서 failed 상태인 지원자를 점수 순으로 가져옴
            const candidatesRes = await client.query(`
                SELECT a.id, a.user_id, a.university, a.department, a.group_type,
                       es.korean_std, es.math_std, es.explore1_std, es.explore2_std
                FROM applications a
                JOIN exam_scores es ON es.user_id = a.user_id
                WHERE a.round_id = $1 AND a.university = $2 AND a.group_type = $3
                  AND a.status = 'failed'
                ORDER BY (COALESCE(es.korean_std,0) + COALESCE(es.math_std,0) +
                          COALESCE(es.explore1_std,0) + COALESCE(es.explore2_std,0)) DESC
                LIMIT $4
            `, [roundId, university, group_type, parseInt(declined_cnt)]);

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
                    [candidate.user_id, `🎊 ${university} ${group_type}군 ${subRound}차 추가합격! 오늘 안에 등록 여부를 결정해주세요.`]
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
