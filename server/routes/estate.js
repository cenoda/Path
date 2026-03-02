const express = require('express');
const pool = require('../db');
const { getUniversityInfo, getTicketPrice } = require('../data/universities');

const router = express.Router();

// 세금: 티어별 → 대학 등급별로 변경
// Grade: 1→100, 2→70, 3→50, 4→35, 5→20, 6→10, 7→5 G/hr (getUniversityInfo에서 rate 사용)
const MAX_HOURS = 24;

// 세금 현황 조회
router.get('/tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            'SELECT university, last_tax_collected_at, gold FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = result.rows[0];
        const { rate, grade } = getUniversityInfo(user.university);
        const hoursPassed = Math.min(
            (Date.now() - new Date(user.last_tax_collected_at).getTime()) / 3600000,
            MAX_HOURS
        );
        const pending = Math.floor(hoursPassed * rate);
        const ticketPrice = getTicketPrice(user.university);
        res.json({ rate, pending, grade, gold: user.gold, university: user.university, ticketPrice });
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
            'SELECT university, last_tax_collected_at FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const { rate } = getUniversityInfo(user.university);

        if (rate === 0) {
            await client.query('ROLLBACK');
            return res.json({ ok: true, collected: 0, message: '이 등급은 세금이 없습니다.' });
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
            `UPDATE users SET gold = gold + $1, last_tax_collected_at = NOW()
             WHERE id = $2
             RETURNING id, nickname, university, gold, exp, tier, tickets, mock_exam_score`,
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

// 토너먼트권 구매
router.post('/buy-ticket', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { quantity = 1 } = req.body;
    const qty = Math.max(1, Math.min(10, parseInt(quantity) || 1));

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT university, gold, tickets FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const price = getTicketPrice(user.university) * qty;

        if (user.gold < price) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${price.toLocaleString()}G` });
        }

        const final = await client.query(
            `UPDATE users SET gold = gold - $1, tickets = tickets + $2
             WHERE id = $3
             RETURNING id, nickname, university, gold, exp, tier, tickets, mock_exam_score`,
            [price, qty, req.session.userId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, spent: price, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('buy-ticket error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

module.exports = router;
