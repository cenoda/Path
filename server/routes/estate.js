const express = require('express');
const pool = require('../db');
const { getTaxRate, getTicketPrice, getPercentile } = require('../data/universities');

const router = express.Router();

const MAX_HOURS = 24;
const NSU_BONUS_RATE = 0.15;
const GPA_BONUS_MAX = 0.5;

function calcGpaBonus(gpaScore, gpaStatus) {
    if (gpaStatus !== 'approved' || !gpaScore || gpaScore <= 0) return 0;
    const bonus = Math.max(0, (5 - gpaScore) * 0.12);
    return Math.min(bonus, GPA_BONUS_MAX);
}

function calcTotalRate(university, isNsu, prevUniversity, gpaScore, gpaStatus) {
    let rate = getTaxRate(university);
    if (isNsu && prevUniversity) {
        const prevRate = getTaxRate(prevUniversity);
        rate += prevRate * NSU_BONUS_RATE;
    }
    rate += calcGpaBonus(gpaScore, gpaStatus);
    return rate;
}

router.get('/tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            'SELECT university, last_tax_collected_at, gold, is_n_su, prev_university, gpa_score, gpa_status FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = result.rows[0];
        const rate = calcTotalRate(user.university, user.is_n_su, user.prev_university, user.gpa_score, user.gpa_status);
        const percentile = getPercentile(user.university);
        const hoursPassed = Math.min(
            (Date.now() - new Date(user.last_tax_collected_at).getTime()) / 3600000,
            MAX_HOURS
        );
        const pending = Math.floor(hoursPassed * rate * 100) / 100;
        const ticketPrice = getTicketPrice(user.university);

        const resp = {
            rate: Math.round(rate * 100) / 100,
            pending: Math.floor(pending),
            percentile,
            gold: user.gold,
            university: user.university,
            ticketPrice,
            is_n_su: user.is_n_su,
            prev_university: user.prev_university
        };

        const baseRate = getTaxRate(user.university);
        if (user.is_n_su && user.prev_university) {
            const bonus = getTaxRate(user.prev_university) * NSU_BONUS_RATE;
            resp.baseRate = Math.round(baseRate * 100) / 100;
            resp.nsuBonus = Math.round(bonus * 100) / 100;
        }

        const gpaBonus = calcGpaBonus(user.gpa_score, user.gpa_status);
        if (gpaBonus > 0) {
            if (!resp.baseRate) resp.baseRate = Math.round(baseRate * 100) / 100;
            resp.gpaBonus = Math.round(gpaBonus * 100) / 100;
            resp.gpaScore = parseFloat(user.gpa_score);
        }

        res.json(resp);
    } catch (err) {
        console.error('tax get error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/collect-tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT university, last_tax_collected_at, is_n_su, prev_university, gpa_score, gpa_status FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const rate = calcTotalRate(user.university, user.is_n_su, user.prev_university, user.gpa_score, user.gpa_status);

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
