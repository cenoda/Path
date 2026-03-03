const express = require('express');
const pool = require('../db');
const { STUDY_GOLD_PER_HR } = require('../data/universities');

const router = express.Router();

// 공부 시작: 목표 시간 저장 + is_studying
router.post('/start', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { target_sec } = req.body;
    const target = Math.max(0, Math.min(parseInt(target_sec) || 0, 86400));
    try {
        await pool.query(
            `UPDATE users SET is_studying = true, study_started_at = NOW(), target_duration_sec = $1
             WHERE id = $2`,
            [target, req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('study/start error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 공부 완료: 서버 시간 기준으로 보상 계산
router.post('/complete', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { result: studyResult, mode } = req.body;
    const studyMode = mode === 'stopwatch' ? 'stopwatch' : 'timer';
    const VALID = ['SUCCESS', 'INTERRUPTED', 'FAILED'];
    if (!VALID.includes(studyResult)) return res.status(400).json({ error: '올바르지 않은 결과값' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userRes = await client.query(
            'SELECT study_started_at, target_duration_sec, is_studying FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];

        if (!user.is_studying || !user.study_started_at) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '진행 중인 공부가 없습니다.' });
        }

        // 서버 시간 기준 실제 경과 시간
        const elapsedMs = Date.now() - new Date(user.study_started_at).getTime();
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
        const targetSec = user.target_duration_sec || 0;

        let earnedGold = 0;
        let earnedExp = Math.floor(elapsedSec / 60);

        if (studyResult === 'SUCCESS') {
            if (studyMode === 'stopwatch') {
                earnedGold = Math.floor((elapsedSec / 3600) * STUDY_GOLD_PER_HR * 0.5);
            } else {
                earnedGold = Math.floor((targetSec / 3600) * STUDY_GOLD_PER_HR);
            }
        } else if (studyResult === 'FAILED') {
            earnedExp = 0;
        }

        await client.query(
            'INSERT INTO study_records (user_id, duration_sec, result, earned_gold, earned_exp) VALUES ($1,$2,$3,$4,$5)',
            [req.session.userId, elapsedSec, studyResult, earnedGold, earnedExp]
        );

        const updRes = await client.query(
            `UPDATE users
             SET gold = gold + $1,
                 exp  = exp  + $2,
                 is_studying = false,
                 study_started_at = NULL,
                 target_duration_sec = 0
             WHERE id = $3
             RETURNING id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score`,
            [earnedGold, earnedExp, req.session.userId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, earnedGold, earnedExp, user: updRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('complete error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.get('/stats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userResult = await pool.query(
            'SELECT id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score FROM users WHERE id = $1',
            [req.session.userId]
        );
        const recordsResult = await pool.query(
            `SELECT COUNT(*) as total_sessions,
                    COALESCE(SUM(duration_sec),0) as total_sec,
                    COALESCE(SUM(CASE WHEN result='SUCCESS' THEN duration_sec ELSE 0 END),0) as success_sec
             FROM study_records WHERE user_id = $1`,
            [req.session.userId]
        );
        const todayResult = await pool.query(
            `SELECT COALESCE(SUM(duration_sec),0) as today_sec
             FROM study_records WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        res.json({ user: userResult.rows[0], stats: { ...recordsResult.rows[0], ...todayResult.rows[0] } });
    } catch (err) {
        console.error('stats error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
