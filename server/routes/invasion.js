const express = require('express');
const pool = require('../db');
const { findUniversity } = require('../data/universities');
const { evaluateMilestoneTitles, formatDisplayName, refreshBountyBoard } = require('../utils/progression');
const { normalCDF, calcAcceptProb, percentileToCutline, getSigma } = require('../utils/admissionCalc');

const router = express.Router();

// 대학 이름으로 basePercentile 조회
function getBasePercentile(universityName) {
    const uni = findUniversity(universityName);
    return uni ? uni.basePercentile : null;
}

// ── 모의지원: 도전하기 ────────────────────────────────────────────────
router.post('/attack', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { defender_id } = req.body;
    if (!defender_id) return res.status(400).json({ error: '지원 대상을 지정해주세요.' });
    if (parseInt(defender_id) === req.session.userId) return res.status(400).json({ error: '자신에게 지원할 수 없습니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await refreshBountyBoard(client);

        const attackerRes = await client.query(
            'SELECT id, nickname, tickets, university, mock_exam_score, score_status FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const attacker = attackerRes.rows[0];
        if (!attacker) { await client.query('ROLLBACK'); return res.status(404).json({ error: '유저를 찾을 수 없습니다.' }); }
        if (attacker.tickets < 1) { await client.query('ROLLBACK'); return res.status(400).json({ error: '원서비가 없습니다.' }); }
        if (!attacker.mock_exam_score || attacker.mock_exam_score < 1) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '평가원 모의고사 점수를 먼저 등록해주세요.' });
        }

        // 하루 지원 횟수 확인
        const todayCount = await client.query(
            `SELECT COUNT(*) as cnt FROM invasions WHERE attacker_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        const usedSlots = parseInt(todayCount.rows[0].cnt);
        const MAX_DAILY = 6;
        if (usedSlots >= MAX_DAILY) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `오늘 지원 가능 횟수(${MAX_DAILY}회)를 모두 사용했습니다. 내일 다시 도전하세요.` });
        }

        const defenderRes = await client.query(
            'SELECT id, nickname, university, mock_exam_score FROM users WHERE id = $1 FOR UPDATE',
            [defender_id]
        );
        const defender = defenderRes.rows[0];
        if (!defender) { await client.query('ROLLBACK'); return res.status(404).json({ error: '상대를 찾을 수 없습니다.' }); }

        // 대학 컷트라인 기반 합격 확률 계산
        const targetUniversity = defender.university;
        const basePercentile = getBasePercentile(targetUniversity);

        let attackerWins;
        let acceptProb;

        if (basePercentile !== null) {
            acceptProb = calcAcceptProb(attacker.mock_exam_score, basePercentile);
            attackerWins = Math.random() < acceptProb;
        } else {
            // 대학 정보 없으면 직접 점수 비교 fallback
            if (!defender.mock_exam_score || defender.mock_exam_score < 1) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: '상대방이 아직 점수를 등록하지 않았습니다.' });
            }
            acceptProb = attacker.mock_exam_score > defender.mock_exam_score ? 0.7 : 0.3;
            attackerWins = Math.random() < acceptProb;
        }

        const invasionResult = attackerWins ? 'WIN' : 'LOSS';

        await client.query('UPDATE users SET tickets = tickets - 1 WHERE id = $1', [req.session.userId]);

        await client.query(
            `INSERT INTO invasions (attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [req.session.userId, defender_id,
             attacker.mock_exam_score, Math.round(acceptProb * 100),
             invasionResult, 0]
        );

        let bountyReward = 0;
        if (attackerWins) {
            await client.query(
                'UPDATE users SET university = $1 WHERE id = $2',
                [defender.university, req.session.userId]
            );

            const bountyRes = await client.query(
                `SELECT COALESCE(SUM(reward_gold), 0)::int AS reward
                 FROM bounty_board
                 WHERE target_user_id = $1`,
                [defender.id]
            );
            bountyReward = Number(bountyRes.rows[0]?.reward || 0);
            if (bountyReward > 0) {
                await client.query('UPDATE users SET gold = gold + $1 WHERE id = $2', [bountyReward, req.session.userId]);
                await client.query(
                    `INSERT INTO notifications (user_id, type, message)
                     VALUES ($1, 'bounty', $2)`,
                    [req.session.userId, `현상수배 성공! @${defender.nickname} 격추 보상 +${bountyReward}G`]
                );
            }
        }

        const grantedTitles = await evaluateMilestoneTitles(client, req.session.userId);

        const finalRes = await client.query(
            'SELECT id, nickname, university, gold, diamond, exp, tier, tickets, mock_exam_score, active_title, streak_count, streak_last_date FROM users WHERE id = $1',
            [req.session.userId]
        );

        await client.query('COMMIT');

        const safeUser = finalRes.rows[0] || null;
        if (safeUser) {
            safeUser.display_nickname = formatDisplayName(safeUser.nickname, safeUser.active_title);
        }

        res.json({
            ok: true,
            result: invasionResult,
            attacker_score: attacker.mock_exam_score,
            target_university: targetUniversity,
            accept_prob: Math.round(acceptProb * 100),
            defender_nickname: defender.nickname,
            defender_university: defender.university,
            bounty_reward: bountyReward,
            grantedTitles,
            used_slots: usedSlots + 1,
            max_slots: MAX_DAILY,
            user: safeUser
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('invasion error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 합격 확률 조회 (모달용) ───────────────────────────────────────────
router.get('/accept-prob', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { university } = req.query;
    if (!university) return res.status(400).json({ error: '대학명을 입력해주세요.' });

    try {
        const userRes = await pool.query(
            'SELECT mock_exam_score FROM users WHERE id = $1',
            [req.session.userId]
        );
        const userScore = userRes.rows[0]?.mock_exam_score || 0;
        const basePercentile = getBasePercentile(university);

        if (!basePercentile) {
            return res.json({ accept_prob: null, message: '대학 정보 없음' });
        }
        if (!userScore || userScore < 1) {
            return res.json({ accept_prob: null, message: '점수 미등록' });
        }

        const prob = calcAcceptProb(userScore, basePercentile);
        const cutline = Math.round(percentileToCutline(basePercentile));
        res.json({
            accept_prob: Math.round(prob * 100),
            cutline,
            user_score: userScore,
            base_percentile: basePercentile
        });
    } catch (err) {
        console.error('accept-prob error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 내 지원 이력 조회 ─────────────────────────────────────────────────
router.get('/my-applications', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userRes = await pool.query(
            'SELECT mock_exam_score, score_status, tickets FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = userRes.rows[0];

        const todayRes = await pool.query(
            `SELECT COUNT(*) as cnt FROM invasions WHERE attacker_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        const usedSlots = parseInt(todayRes.rows[0].cnt);

        const logsRes = await pool.query(
            `SELECT i.id, i.result, i.attacker_study_sec as my_score,
                    i.defender_study_sec as accept_prob_stored,
                    i.created_at,
                    d.nickname as target_nickname, d.university as target_university
             FROM invasions i
             JOIN users d ON i.defender_id = d.id
             WHERE i.attacker_id = $1
             ORDER BY i.created_at DESC LIMIT 30`,
            [req.session.userId]
        );

        // 각 이력에 대해 현재 대학 컷트라인으로 확률 재계산
        const applications = logsRes.rows.map(row => {
            const bp = getBasePercentile(row.target_university);
            const userScore = row.my_score;
            let acceptProb = row.accept_prob_stored;
            let cutline = null;
            if (bp && userScore) {
                acceptProb = Math.round(calcAcceptProb(userScore, bp) * 100);
                cutline = Math.round(percentileToCutline(bp));
            }
            return { ...row, accept_prob: acceptProb, cutline };
        });

        res.json({
            max_slots: 6,
            used_slots: usedSlots,
            my_score: user.mock_exam_score || 0,
            score_status: user.score_status,
            tickets: user.tickets,
            applications
        });
    } catch (err) {
        console.error('my-applications error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 기존 로그 조회 (LOGS 패널용) ─────────────────────────────────────
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
