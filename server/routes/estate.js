const express = require('express');
const pool = require('../db');

const router = express.Router();

const TAX_RATE = {
    BRONZE: 0,
    SILVER: 2,
    GOLD: 5,
    PLATINUM: 10,
    DIAMOND: 20,
    CHALLENGER: 50
};
const MAX_HOURS = 24;

// 세금 현황 조회
router.get('/tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            'SELECT tier, last_tax_collected_at, tax_accumulated, gold FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = result.rows[0];
        const rate = TAX_RATE[user.tier] || 0;
        const hoursPassed = Math.min(
            (Date.now() - new Date(user.last_tax_collected_at).getTime()) / 3600000,
            MAX_HOURS
        );
        const pending = Math.floor(hoursPassed * rate);
        res.json({ rate, pending, tier: user.tier, gold: user.gold });
    } catch (err) {
        console.error('tax get error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 세금 수령
router.post('/collect-tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userRes = await client.query(
            'SELECT tier, last_tax_collected_at FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const rate = TAX_RATE[user.tier] || 0;

        if (rate === 0) {
            await client.query('ROLLBACK');
            return res.json({ ok: true, collected: 0, message: '이 티어는 세금이 없습니다.' });
        }

        const hoursPassed = Math.min(
            (Date.now() - new Date(user.last_tax_collected_at).getTime()) / 3600000,
            MAX_HOURS
        );
        const collected = Math.floor(hoursPassed * rate);

        if (collected < 1) {
            await client.query('ROLLBACK');
            return res.json({ ok: true, collected: 0, message: '아직 수령할 세금이 없습니다.' });
        }

        const final = await client.query(
            `UPDATE users
             SET gold = gold + $1, last_tax_collected_at = NOW()
             WHERE id = $2
             RETURNING id, nickname, university, gold, exp, tier, tickets`,
            [collected, req.session.userId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, collected, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('collect-tax error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

module.exports = router;
