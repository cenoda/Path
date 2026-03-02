const express = require('express');
const pool = require('../db');

const router = express.Router();

function calcTier(exp) {
    if (exp >= 10000) return 'CHALLENGER';
    if (exp >= 5000) return 'DIAMOND';
    if (exp >= 2000) return 'PLATINUM';
    if (exp >= 1000) return 'GOLD';
    if (exp >= 300) return 'SILVER';
    return 'BRONZE';
}

// 공부 시작 알림 (is_studying = true)
router.post('/start', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        await pool.query(
            'UPDATE users SET is_studying = true, study_started_at = NOW() WHERE id = $1',
            [req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('study/start error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 공부 완료
router.post('/complete', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { duration_sec, result: studyResult, original_duration_sec } = req.body;
    if (typeof duration_sec !== 'number' || typeof studyResult !== 'string') {
        return res.status(400).json({ error: '잘못된 요청입니다.' });
    }
    const VALID = ['SUCCESS', 'INTERRUPTED', 'FAILED'];
    if (!VALID.includes(studyResult)) return res.status(400).json({ error: '올바르지 않은 결과값' });

    const earnedExp = Math.floor(duration_sec / 60);
    let earnedGold = 0;
    if (studyResult === 'SUCCESS' && original_duration_sec) {
        earnedGold = Math.floor((original_duration_sec / 3600) * 100);
    }

    // 티켓: 성공 시 30% 확률, 1시간 이상 공부해야 함
    let earnedTicket = 0;
    if (studyResult === 'SUCCESS' && original_duration_sec >= 3600) {
        earnedTicket = Math.random() < 0.3 ? 1 : 0;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            'INSERT INTO study_records (user_id, duration_sec, result, earned_gold, earned_exp) VALUES ($1, $2, $3, $4, $5)',
            [req.session.userId, duration_sec, studyResult, earnedGold, earnedExp]
        );

        const updRes = await client.query(
            `UPDATE users
             SET gold = gold + $1,
                 exp  = exp  + $2,
                 tickets = tickets + $3,
                 is_studying = false,
                 study_started_at = NULL
             WHERE id = $4
             RETURNING id, nickname, university, gold, exp, tier, tickets`,
            [earnedGold, earnedExp, earnedTicket, req.session.userId]
        );

        const user = updRes.rows[0];
        const newTier = calcTier(user.exp);
        const final = await client.query(
            'UPDATE users SET tier = $1 WHERE id = $2 RETURNING id, nickname, university, gold, exp, tier, tickets',
            [newTier, req.session.userId]
        );

        await client.query('COMMIT');

        res.json({ ok: true, earnedGold, earnedExp, earnedTicket, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('complete error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// 내 통계
router.get('/stats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userResult = await pool.query(
            'SELECT id, nickname, university, gold, exp, tier, tickets, is_studying FROM users WHERE id = $1',
            [req.session.userId]
        );
        const recordsResult = await pool.query(
            `SELECT COUNT(*) as total_sessions,
                    COALESCE(SUM(duration_sec),0) as total_sec,
                    COALESCE(SUM(CASE WHEN result='SUCCESS' THEN duration_sec ELSE 0 END),0) as success_sec
             FROM study_records WHERE user_id = $1`,
            [req.session.userId]
        );
        // 오늘 공부량
        const todayResult = await pool.query(
            `SELECT COALESCE(SUM(duration_sec),0) as today_sec
             FROM study_records
             WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        res.json({
            user: userResult.rows[0],
            stats: { ...recordsResult.rows[0], ...todayResult.rows[0] }
        });
    } catch (err) {
        console.error('stats error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
