const express = require('express');
const pool = require('../db');
const { getPercentile } = require('../data/universities');
const { formatDisplayName, getActiveStreakFromUser, refreshBountyBoard, getBountyBoard } = require('../utils/progression');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        await refreshBountyBoard(pool);
        const result = await pool.query(
                `SELECT u.id, u.nickname, u.university, u.gold, u.exp, u.tier, u.is_studying, u.balloon_skin, u.balloon_aura, u.profile_image_url, u.status_emoji, u.status_message,
                    u.active_title, u.streak_count, u.streak_last_date,
                    u.mock_exam_score, u.score_status,
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

        const rows = result.rows.map(u => {
            const activeStreak = getActiveStreakFromUser(u);
            return {
                ...u,
                active_streak: activeStreak,
                display_nickname: formatDisplayName(u.nickname, u.active_title),
                percentile: getPercentile(u.university)
            };
        });

        res.json({ ranking: rows, total });
    } catch (err) {
        console.error('ranking error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/today', async (req, res) => {
    try {
        await refreshBountyBoard(pool);
        const result = await pool.query(
                `SELECT u.id, u.nickname, u.university, u.tier, u.is_studying, u.balloon_skin, u.balloon_aura, u.profile_image_url, u.status_emoji, u.status_message,
                    u.active_title, u.streak_count, u.streak_last_date,
                    COALESCE(SUM(sr.duration_sec),0) as today_sec,
                    RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec),0) DESC) as rank
             FROM users u
             LEFT JOIN study_records sr ON sr.user_id = u.id AND sr.created_at >= CURRENT_DATE
             GROUP BY u.id
             ORDER BY today_sec DESC
             LIMIT 50`
        );
        const rows = result.rows.map(u => ({
            ...u,
            active_streak: getActiveStreakFromUser(u),
            display_nickname: formatDisplayName(u.nickname, u.active_title)
        }));
        res.json({ ranking: rows });
    } catch (err) {
        console.error('ranking/today error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const [rankResult, scoreResult, meResult] = await Promise.all([
            pool.query(
                `SELECT ranked.rank, ranked.total_sec, cnt.total FROM (
                    SELECT u.id,
                           COALESCE(SUM(sr.duration_sec),0) as total_sec,
                           RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec),0) DESC) as rank
                    FROM users u
                    LEFT JOIN study_records sr ON sr.user_id = u.id
                    GROUP BY u.id
                 ) ranked, (SELECT COUNT(*) as total FROM users) cnt
                 WHERE ranked.id = $1`,
                [req.session.userId]
            ),
            pool.query(
                `SELECT u.score_status,
                        (SELECT count(*) FROM users WHERE score_status = 'approved' AND mock_exam_score > u.mock_exam_score) as better_count,
                        (SELECT count(*) FROM users WHERE score_status = 'approved') as total_scored
                 FROM users u WHERE u.id = $1`,
                [req.session.userId]
            ),
            pool.query(
                `SELECT nickname, active_title, streak_count, streak_last_date
                 FROM users WHERE id = $1`,
                [req.session.userId]
            )
        ]);

        if (rankResult.rows.length === 0) return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });

        const { rank, total_sec, total } = rankResult.rows[0];
        const rankNum = parseInt(rank);
        const totalNum = parseInt(total);
        const pct = totalNum > 1 ? ((rankNum / totalNum) * 100).toFixed(2) : '100.00';

        let scorePct = null;
        const scoreRow = scoreResult.rows[0];
        if (scoreRow && scoreRow.score_status === 'approved') {
            const betterCount = parseInt(scoreRow.better_count);
            const totalScored = parseInt(scoreRow.total_scored);
            const myRank = betterCount + 1;
            scorePct = totalScored >= 1 ? ((myRank / totalScored) * 100).toFixed(2) : '0.00';
        }

        const me = meResult.rows[0] || {};
        res.json({
            rank: rankNum,
            total: totalNum,
            pct,
            total_sec,
            scorePct,
            active_title: me.active_title || null,
            active_streak: getActiveStreakFromUser(me),
            display_nickname: formatDisplayName(me.nickname, me.active_title)
        });
    } catch (err) {
        console.error('ranking/me error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/bounty', async (req, res) => {
    try {
        await refreshBountyBoard(pool);
        const board = await getBountyBoard(pool);
        res.json({ bounties: board });
    } catch (err) {
        console.error('ranking/bounty error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
