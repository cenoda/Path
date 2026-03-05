const express = require('express');
const router = express.Router();
const pool = require('../db');

function requireAuth(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ error: '로그인 필요' });
    next();
}

// 대화 목록 (가장 최근 메시지 기준)
router.get('/conversations', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT DISTINCT ON (other_user)
                other_user,
                u.nickname,
                u.university,
                u.is_studying,
                last_msg,
                last_time,
                unread_count
            FROM (
                SELECT
                    CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END AS other_user,
                    content AS last_msg,
                    created_at AS last_time,
                    SUM(CASE WHEN receiver_id = $1 AND is_read = FALSE THEN 1 ELSE 0 END)
                        OVER (PARTITION BY CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END) AS unread_count
                FROM messages
                WHERE sender_id = $1 OR receiver_id = $1
                ORDER BY created_at DESC
            ) sub
            JOIN users u ON u.id = sub.other_user
            ORDER BY other_user, last_time DESC
        `, [req.session.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('messages/conversations 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 특정 유저와의 대화 내역
router.get('/conversation/:targetId', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.targetId);
    if (!targetId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const result = await pool.query(`
            SELECT m.id, m.sender_id, m.receiver_id, m.content, m.is_read, m.created_at,
                   u.nickname as sender_nickname,
                   (m.sender_id = $1) as is_mine
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE (m.sender_id = $1 AND m.receiver_id = $2)
               OR (m.sender_id = $2 AND m.receiver_id = $1)
            ORDER BY m.created_at ASC
            LIMIT 200
        `, [req.session.userId, targetId]);

        // 읽음 처리
        await pool.query(
            'UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE',
            [targetId, req.session.userId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('messages/conversation 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 메시지 보내기
router.post('/send', requireAuth, async (req, res) => {
    const { receiver_id, content } = req.body;
    if (!receiver_id || !content?.trim()) {
        return res.status(400).json({ error: '수신자와 내용을 입력하세요' });
    }
    if (content.length > 500) {
        return res.status(400).json({ error: '메시지는 500자 이내로 입력하세요' });
    }
    if (receiver_id === req.session.userId) {
        return res.status(400).json({ error: '자신에게 메시지를 보낼 수 없습니다' });
    }

    try {
        // 친구 관계 확인
        const friendCheck = await pool.query(
            `SELECT id FROM friendships
             WHERE ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
               AND status = 'accepted'`,
            [req.session.userId, receiver_id]
        );
        if (friendCheck.rows.length === 0) {
            return res.status(403).json({ error: '친구에게만 메시지를 보낼 수 있습니다' });
        }

        const result = await pool.query(
            'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3) RETURNING *',
            [req.session.userId, receiver_id, content.trim()]
        );

        const senderRes = await pool.query('SELECT nickname FROM users WHERE id = $1', [req.session.userId]);
        await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
            [receiver_id, 'message', `${senderRes.rows[0]?.nickname}님으로부터 메시지가 도착했습니다.`]
        );

        res.json({ ok: true, message: result.rows[0] });
    } catch (err) {
        console.error('messages/send 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 읽지 않은 메시지 수
router.get('/unread-count', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE',
            [req.session.userId]
        );
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
