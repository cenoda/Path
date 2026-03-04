const express = require('express');
const pool = require('../db');

const router = express.Router();

function getMaxSlots(score, scoreStatus) {
    if (scoreStatus !== 'approved' || !score || score < 1) return 1;
    if (score >= 380) return 6;
    if (score >= 340) return 5;
    if (score >= 300) return 4;
    if (score >= 260) return 3;
    if (score >= 220) return 2;
    return 1;
}

router.post('/attack', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { defender_id } = req.body;
    if (!defender_id) return res.status(400).json({ error: '지원 대상을 지정해주세요.' });
    if (parseInt(defender_id) === req.session.userId) return res.status(400).json({ error: '자신에게 지원할 수 없습니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const attackerRes = await client.query(
            'SELECT id, nickname, tickets, university, mock_exam_score, score_status FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const attacker = attackerRes.rows[0];
        if (!attacker) { await client.query('ROLLBACK'); return res.status(404).json({ error: '유저를 찾을 수 없습니다.' }); }
        if (attacker.tickets < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '원서비가 없습니다.' }); }
        if (attacker.mock_exam_score < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '평가원 모의고사 점수를 먼저 등록해주세요.' }); }

        const maxSlots = getMaxSlots(attacker.mock_exam_score, attacker.score_status);
        const todayCount = await client.query(
            `SELECT COUNT(*) as cnt FROM invasions WHERE attacker_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        const usedSlots = parseInt(todayCount.rows[0].cnt);
        if (usedSlots >= maxSlots) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `오늘 지원 가능 횟수(${maxSlots}회)를 모두 사용했습니다. 내일 다시 도전하세요.` });
        }

        const defenderRes = await client.query(
            'SELECT id, nickname, university, mock_exam_score FROM users WHERE id = $1 FOR UPDATE',
            [defender_id]
        );
        const defender = defenderRes.rows[0];
        if (!defender) { await client.query('ROLLBACK'); return res.status(404).json({ error: '상대를 찾을 수 없습니다.' }); }
        if (defender.mock_exam_score < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '상대방이 아직 점수를 등록하지 않았습니다.' }); }

        const attackerWins = attacker.mock_exam_score > defender.mock_exam_score;
        const invasionResult = attackerWins ? 'WIN' : 'LOSS';

        await client.query('UPDATE users SET tickets = tickets - 1 WHERE id = $1', [req.session.userId]);

        await client.query(
            `INSERT INTO invasions (attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.session.userId, defender_id,
             attacker.mock_exam_score, defender.mock_exam_score,
             invasionResult, 0]
        );

        if (attackerWins) {
            await client.query(
                'UPDATE users SET university = $1 WHERE id = $2',
                [defender.university, req.session.userId]
            );
        }

        const finalRes = await client.query(
            'SELECT id, nickname, university, gold, exp, tier, tickets, mock_exam_score FROM users WHERE id = $1',
            [req.session.userId]
        );

        await client.query('COMMIT');

        res.json({
            ok: true,
            result: invasionResult,
            attacker_score: attacker.mock_exam_score,
            defender_score: defender.mock_exam_score,
            defender_nickname: defender.nickname,
            defender_university: defender.university,
            used_slots: usedSlots + 1,
            max_slots: maxSlots,
            user: finalRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('invasion error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.get('/my-applications', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userRes = await pool.query(
            'SELECT mock_exam_score, score_status, tickets FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const maxSlots = getMaxSlots(user.mock_exam_score, user.score_status);

        const todayRes = await pool.query(
            `SELECT COUNT(*) as cnt FROM invasions WHERE attacker_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        const usedSlots = parseInt(todayRes.rows[0].cnt);

        const logsRes = await pool.query(
            `SELECT i.id, i.result, i.attacker_study_sec as my_score, i.defender_study_sec as target_score,
                    i.created_at,
                    d.nickname as target_nickname, d.university as target_university
             FROM invasions i
             JOIN users d ON i.defender_id = d.id
             WHERE i.attacker_id = $1
             ORDER BY i.created_at DESC LIMIT 30`,
            [req.session.userId]
        );

        res.json({
            max_slots: maxSlots,
            used_slots: usedSlots,
            my_score: user.mock_exam_score || 0,
            score_status: user.score_status,
            tickets: user.tickets,
            applications: logsRes.rows
        });
    } catch (err) {
        console.error('my-applications error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/logs', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            `SELECT i.*,
                a.nickname as attacker_nickname, a.university as attacker_university,
                d.nickname as defender_nickname, d.university as defender_university
             FROM invasions i
             JOIN users a ON i.attacker_id = a.id
             JOIN users d ON i.defender_id = d.id
             WHERE i.attacker_id = $1 OR i.defender_id = $1
             ORDER BY i.created_at DESC LIMIT 20`,
            [req.session.userId]
        );
        res.json({ logs: result.rows });
    } catch (err) {
        console.error('logs error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
