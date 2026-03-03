const express = require('express');
const pool = require('../db');
const { getPercentile } = require('../data/universities');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.nickname, u.university, u.gold, u.exp, u.tier, u.is_studying,
                    COALESCE(SUM(sr.duration_sec),0) as total_sec,
                    RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec),0) DESC) as rank
             FROM users u
             LEFT JOIN study_records sr ON sr.user_id = u.id
             GROUP BY u.id
             ORDER BY total_sec DESC
             LIMIT 50`
        );
        const totalResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const total = parseInt(totalResult.rows[0].total);

        const rows = result.rows.map(u => ({
            ...u,
            percentile: getPercentile(u.university)
        }));

        res.json({ ranking: rows, total });
    } catch (err) {
        console.error('ranking error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/today', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.nickname, u.university, u.tier, u.is_studying,
                    COALESCE(SUM(sr.duration_sec),0) as today_sec,
                    RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec),0) DESC) as rank
             FROM users u
             LEFT JOIN study_records sr ON sr.user_id = u.id AND sr.created_at >= CURRENT_DATE
             GROUP BY u.id
             ORDER BY today_sec DESC
             LIMIT 50`
        );
        res.json({ ranking: result.rows });
    } catch (err) {
        console.error('ranking/today error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const totalResult = await pool.query('SELECT COUNT(*) as total FROM users');
        const total = parseInt(totalResult.rows[0].total);

        const rankResult = await pool.query(
            `SELECT rank, total_sec FROM (
                SELECT u.id,
                       COALESCE(SUM(sr.duration_sec),0) as total_sec,
                       RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec),0) DESC) as rank
                FROM users u
                LEFT JOIN study_records sr ON sr.user_id = u.id
                GROUP BY u.id
             ) ranked WHERE id = $1`,
            [req.session.userId]
        );

        if (rankResult.rows.length === 0) return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });

        const { rank, total_sec } = rankResult.rows[0];
        const pct = total > 1 ? ((rank / total) * 100).toFixed(2) : '100.00';

        // [New] 실제 성적(mock_exam_score) 기반 백분위 (score_status='approved'인 유저 대상)
        let scorePct = null;
        const scoreRes = await pool.query(
            `SELECT count(*) as count,
                    (SELECT count(*) FROM users WHERE score_status = 'approved') as total_scored
             FROM users
             WHERE score_status = 'approved'
               AND mock_exam_score > (SELECT mock_exam_score FROM users WHERE id = $1)`,
            [req.session.userId]
        );
        
        // 내 점수가 approved 상태인지 확인
        const myScoreRes = await pool.query('SELECT score_status FROM users WHERE id = $1', [req.session.userId]);
        const myStatus = myScoreRes.rows[0]?.score_status;

        if (myStatus === 'approved') {
            const betterCount = parseInt(scoreRes.rows[0].count);
            // scoreRes[0].total_scored 는 이미 count로 나온 상태.
            // 위 쿼리 수정: better_count 와 total_count를 한번에 가져오도록 수정 필요 혹은 분리.
            // 여기서는 scoreRes가 `count`만 가져옴? 아니 subquery로 `total_scored`도 가져옴.
            const totalScored = parseInt(scoreRes.rows[0].total_scored);
            const myRank = betterCount + 1;
            // 상위 X% (TOP X%)
            scorePct = totalScored >= 1 ? ((myRank / totalScored) * 100).toFixed(2) : '0.00';
        }

        res.json({ rank, total, pct, total_sec, scorePct });
    } catch (err) {
        console.error('ranking/me error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
