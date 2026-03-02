const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, nickname, university, gold, exp, tier,
                    RANK() OVER (ORDER BY exp DESC) as rank
             FROM users
             ORDER BY exp DESC
             LIMIT 50`
        );

        const totalResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const total = parseInt(totalResult.rows[0].total);

        res.json({ ranking: result.rows, total });
    } catch (err) {
        console.error('ranking error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/me', async (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    try {
        const totalResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const total = parseInt(totalResult.rows[0].total);

        const rankResult = await pool.query(
            `SELECT rank, exp FROM (
                SELECT id, exp, RANK() OVER (ORDER BY exp DESC) as rank
                FROM users
             ) ranked
             WHERE id = $1`,
            [req.session.userId]
        );

        if (rankResult.rows.length === 0) {
            return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
        }

        const { rank, exp } = rankResult.rows[0];
        const pct = total > 1 ? ((rank / total) * 100).toFixed(2) : '100.00';

        res.json({ rank, total, pct, exp });
    } catch (err) {
        console.error('ranking/me error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
