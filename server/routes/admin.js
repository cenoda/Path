const express = require('express');
const pool = require('../db');

const router = express.Router();

async function getAdminRole(userId) {
    const result = await pool.query(
        'SELECT is_admin, admin_role FROM users WHERE id = $1',
        [userId]
    );
    const row = result.rows[0];
    if (!row) return 'none';
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
            'POST /api/admin/set-role (main only)',
            'POST /api/admin/approve-score',
            'POST /api/admin/reject-score',
            'POST /api/admin/approve-gpa',
            'POST /api/admin/reject-gpa'
        ]
    });
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
                    is_admin, admin_role, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json({ users: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
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

module.exports = router;
