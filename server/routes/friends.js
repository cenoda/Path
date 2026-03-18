const express = require('express');
const router = express.Router();
const pool = require('../db');

function requireAuth(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ error: '로그인 필요' });
    next();
}

// 친구 목록 조회
router.get('/list', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
                 SELECT u.id, u.nickname, u.university, u.is_studying, u.profile_image_url,
                   f.id as friendship_id, f.created_at as friend_since
            FROM friendships f
            JOIN users u ON (
                CASE WHEN f.sender_id = $1 THEN u.id = f.receiver_id
                     ELSE u.id = f.sender_id END
            )
            WHERE (f.sender_id = $1 OR f.receiver_id = $1) AND f.status = 'accepted'
            ORDER BY u.is_studying DESC, u.nickname ASC
        `, [req.session.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('friends/list 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 받은 친구 신청 목록
router.get('/requests', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT f.id as friendship_id, u.id, u.nickname, u.university, u.profile_image_url, f.created_at
            FROM friendships f
            JOIN users u ON u.id = f.sender_id
            WHERE f.receiver_id = $1 AND f.status = 'pending'
            ORDER BY f.created_at DESC
        `, [req.session.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('friends/requests 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 친구 신청 보내기
router.post('/request', requireAuth, async (req, res) => {
    const { target_id } = req.body;
    if (!target_id || target_id === req.session.userId) {
        return res.status(400).json({ error: '잘못된 요청' });
    }
    try {
        // 상대방이 친구 신청 수신을 허용하는지 확인
        const targetRes = await pool.query(
            'SELECT allow_friend_requests FROM users WHERE id = $1',
            [target_id]
        );
        if (!targetRes.rows.length) {
            return res.status(404).json({ error: '존재하지 않는 사용자입니다.' });
        }
        if (targetRes.rows[0].allow_friend_requests === false) {
            return res.status(403).json({ error: '상대방이 친구 신청을 허용하지 않습니다.' });
        }

        const existing = await pool.query(
            `SELECT id, status FROM friendships
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
            [req.session.userId, target_id]
        );
        if (existing.rows.length > 0) {
            const st = existing.rows[0].status;
            if (st === 'accepted') return res.status(400).json({ error: '이미 친구입니다' });
            if (st === 'pending') return res.status(400).json({ error: '이미 신청 중입니다' });
        }

        await pool.query(
            'INSERT INTO friendships (sender_id, receiver_id, status) VALUES ($1, $2, $3)',
            [req.session.userId, target_id, 'pending']
        );

        const senderRes = await pool.query('SELECT nickname FROM users WHERE id = $1', [req.session.userId]);
        await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
            [target_id, 'friend_request', `${senderRes.rows[0]?.nickname}님이 동맹 신청을 보냈습니다.`]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('friends/request 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 친구 신청 수락
router.post('/accept', requireAuth, async (req, res) => {
    const { friendship_id } = req.body;
    try {
        const result = await pool.query(
            `UPDATE friendships SET status = 'accepted'
             WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
             RETURNING sender_id`,
            [friendship_id, req.session.userId]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: '신청을 찾을 수 없습니다' });

        const myRes = await pool.query('SELECT nickname FROM users WHERE id = $1', [req.session.userId]);
        await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
            [result.rows[0].sender_id, 'friend_accept', `${myRes.rows[0]?.nickname}님이 동맹 신청을 수락했습니다.`]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('friends/accept 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 친구 신청 거절 / 친구 삭제
router.post('/reject', requireAuth, async (req, res) => {
    const { friendship_id } = req.body;
    try {
        await pool.query(
            `DELETE FROM friendships
             WHERE id = $1 AND (receiver_id = $2 OR sender_id = $2)`,
            [friendship_id, req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('friends/reject 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 친구 삭제
router.delete('/:targetId', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.targetId);
    try {
        await pool.query(
            `DELETE FROM friendships
             WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
               AND status = 'accepted'`,
            [req.session.userId, targetId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('friends/delete 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 특정 유저와의 친구 상태 확인
router.get('/status/:targetId', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.targetId);
    try {
        const result = await pool.query(
            `SELECT id, status, sender_id, receiver_id FROM friendships
             WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)`,
            [req.session.userId, targetId]
        );
        if (result.rows.length === 0) return res.json({ status: 'none' });
        const row = result.rows[0];
        res.json({
            status: row.status,
            friendship_id: row.id,
            is_sender: row.sender_id === req.session.userId
        });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
