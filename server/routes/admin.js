const express = require('express');
const pool = require('../db');

const router = express.Router();

function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId])
        .then(r => {
            if (!r.rows[0]?.is_admin) return res.status(403).json({ error: '관리자 권한이 없습니다.' });
            next();
        })
        .catch(() => res.status(500).json({ error: '서버 오류' }));
}

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
                    is_admin, created_at
             FROM users ORDER BY created_at DESC`
        );
        res.json({ users: result.rows });
    } catch (err) {
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
