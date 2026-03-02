const express = require('express');
const pool = require('../db');

const router = express.Router();

// 알림 목록
router.get('/', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            `SELECT id, type, message, is_read, created_at
             FROM notifications WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 30`,
            [req.session.userId]
        );
        const unread = result.rows.filter(n => !n.is_read).length;
        res.json({ notifications: result.rows, unread });
    } catch (err) {
        console.error('notifications error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 전체 읽음 처리
router.post('/read-all', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1',
            [req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
