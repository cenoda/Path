const express = require('express');
const pool = require('../db');

const router = express.Router();

// 침략: 평가원 모의고사 점수 비교, 승리 시 상대 영지(대학) 취득
router.post('/attack', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { defender_id } = req.body;
    if (!defender_id) return res.status(400).json({ error: '공격 대상을 지정해주세요.' });
    if (parseInt(defender_id) === req.session.userId) return res.status(400).json({ error: '자신을 공격할 수 없습니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 공격자
        const attackerRes = await client.query(
            'SELECT id, nickname, tickets, university, mock_exam_score FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const attacker = attackerRes.rows[0];
        if (!attacker) { await client.query('ROLLBACK'); return res.status(404).json({ error: '유저를 찾을 수 없습니다.' }); }
        if (attacker.tickets < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '원서비가 없습니다.' }); }
        if (attacker.mock_exam_score < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '평가원 모의고사 점수를 먼저 등록해주세요.' }); }

        // 방어자
        const defenderRes = await client.query(
            'SELECT id, nickname, university, mock_exam_score FROM users WHERE id = $1 FOR UPDATE',
            [defender_id]
        );
        const defender = defenderRes.rows[0];
        if (!defender) { await client.query('ROLLBACK'); return res.status(404).json({ error: '상대를 찾을 수 없습니다.' }); }
        if (defender.mock_exam_score < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '상대방이 아직 점수를 등록하지 않았습니다.' }); }

        const attackerWins = attacker.mock_exam_score > defender.mock_exam_score;
        const invasionResult = attackerWins ? 'WIN' : 'LOSS';

        // 티켓 차감
        await client.query('UPDATE users SET tickets = tickets - 1 WHERE id = $1', [req.session.userId]);

        // 침략 기록
        await client.query(
            `INSERT INTO invasions (attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.session.userId, defender_id,
             attacker.mock_exam_score, defender.mock_exam_score,
             invasionResult, 0]
        );

        // 승리 시: 공격자가 방어자의 대학으로 이적
        if (attackerWins) {
            await client.query(
                'UPDATE users SET university = $1 WHERE id = $2',
                [defender.university, req.session.userId]
            );
        }

        // 공격자 최신 정보
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

// 침략 기록 조회
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
