const express = require('express');
const pool = require('../db');

const router = express.Router();

// 침략 시도
router.post('/attack', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { defender_id } = req.body;
    if (!defender_id) return res.status(400).json({ error: '공격 대상을 지정해주세요.' });
    if (defender_id === req.session.userId) return res.status(400).json({ error: '자신을 공격할 수 없습니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 공격자 정보 확인 (티켓 보유 여부)
        const attackerRes = await client.query(
            'SELECT id, nickname, tickets FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const attacker = attackerRes.rows[0];
        if (!attacker) { await client.query('ROLLBACK'); return res.status(404).json({ error: '유저를 찾을 수 없습니다.' }); }
        if (attacker.tickets < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '토너먼트권이 없습니다.' }); }

        // 방어자 정보
        const defenderRes = await client.query(
            'SELECT id, nickname, university, tier, last_tax_collected_at FROM users WHERE id = $1 FOR UPDATE',
            [defender_id]
        );
        const defender = defenderRes.rows[0];
        if (!defender) { await client.query('ROLLBACK'); return res.status(404).json({ error: '상대를 찾을 수 없습니다.' }); }

        // 7일 공부량 비교
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600000);
        const [atkStudy, defStudy] = await Promise.all([
            client.query(
                'SELECT COALESCE(SUM(duration_sec),0) as total FROM study_records WHERE user_id=$1 AND created_at>=$2',
                [req.session.userId, sevenDaysAgo]
            ),
            client.query(
                'SELECT COALESCE(SUM(duration_sec),0) as total FROM study_records WHERE user_id=$1 AND created_at>=$2',
                [defender_id, sevenDaysAgo]
            )
        ]);

        const atkSec = parseInt(atkStudy.rows[0].total);
        const defSec = parseInt(defStudy.rows[0].total);
        const attackerWins = atkSec >= defSec;
        const invasionResult = attackerWins ? 'WIN' : 'LOSS';

        // 약탈: 방어자 미수령 세금의 50%
        const TAX_RATE = { BRONZE:0, SILVER:2, GOLD:5, PLATINUM:10, DIAMOND:20, CHALLENGER:50 };
        const rate = TAX_RATE[defender.tier] || 0;
        const hoursPassed = Math.min(
            (Date.now() - new Date(defender.last_tax_collected_at).getTime()) / 3600000, 24
        );
        const pendingTax = Math.floor(hoursPassed * rate);
        const lootGold = attackerWins ? Math.floor(pendingTax * 0.5) : 0;

        // 티켓 차감
        await client.query('UPDATE users SET tickets = tickets - 1 WHERE id = $1', [req.session.userId]);

        // 침략 기록
        const invRes = await client.query(
            `INSERT INTO invasions (attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
            [req.session.userId, defender_id, atkSec, defSec, invasionResult, lootGold]
        );
        const invasionId = invRes.rows[0].id;

        // 승리 시 골드 이전
        if (lootGold > 0) {
            await client.query(
                'UPDATE users SET gold = gold + $1 WHERE id = $2',
                [lootGold, req.session.userId]
            );
            await client.query(
                'UPDATE users SET last_tax_collected_at = NOW() WHERE id = $1',
                [defender_id]
            );
        }

        // 알림: 방어자에게
        const atkNick = attacker.nickname;
        const message = attackerWins
            ? `⚔️ ${atkNick}에게 침략당했습니다! ${lootGold}G 약탈됨.`
            : `🛡️ ${atkNick}의 침략을 방어했습니다!`;
        await client.query(
            'INSERT INTO notifications (user_id, type, message, ref_id) VALUES ($1,$2,$3,$4)',
            [defender_id, 'invasion', message, invasionId]
        );

        // 공격자 최신 정보
        const finalRes = await client.query(
            'SELECT id, nickname, university, gold, exp, tier, tickets FROM users WHERE id = $1',
            [req.session.userId]
        );

        await client.query('COMMIT');

        res.json({
            ok: true,
            result: invasionResult,
            attacker_sec: atkSec,
            defender_sec: defSec,
            loot_gold: lootGold,
            defender_nickname: defender.nickname,
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
                a.nickname as attacker_nickname, a.tier as attacker_tier,
                d.nickname as defender_nickname, d.tier as defender_tier
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
