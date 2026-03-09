'use strict';
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

function generateInviteCode() {
    return crypto.randomBytes(6).toString('hex'); // 12-char hex
}

const roomsReadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

const roomsWriteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '채팅 메시지를 너무 빠르게 보내고 있습니다. 잠시 기다려주세요.' }
});

// GET /api/rooms/my — list rooms I have joined
router.get('/my', roomsReadLimiter, requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.name, r.goal, r.invite_code, r.max_members, r.is_active, r.created_at,
                    r.creator_id,
                    (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count,
                    (SELECT COUNT(*) FROM study_room_members m2
                     JOIN users u2 ON u2.id = m2.user_id
                     WHERE m2.room_id = r.id AND u2.is_studying = TRUE) AS active_count
             FROM study_rooms r
             JOIN study_room_members mem ON mem.room_id = r.id
             WHERE mem.user_id = $1 AND r.is_active = TRUE
             ORDER BY r.created_at DESC`,
            [req.session.userId]
        );
        res.json({ rooms: result.rows });
    } catch (err) {
        console.error('rooms/my error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/rooms — create a new room
router.post('/', roomsWriteLimiter, requireAuth, async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    const goal = String(req.body.goal || '').trim().slice(0, 100);
    const maxMembers = Math.max(2, Math.min(50, parseInt(req.body.max_members, 10) || 10));

    if (!name) return res.status(400).json({ error: '방 이름을 입력해주세요.' });

    let client;
    try {
        client = await pool.connect();

        // Extremely unlikely, but retry a few times if invite_code collides.
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const inviteCode = generateInviteCode();
            try {
                await client.query('BEGIN');
                const roomRes = await client.query(
                    `INSERT INTO study_rooms (name, goal, creator_id, invite_code, max_members)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING *`,
                    [name, goal || null, req.session.userId, inviteCode, maxMembers]
                );

                const room = roomRes.rows[0];
                // Creator auto-joins.
                await client.query(
                    `INSERT INTO study_room_members (room_id, user_id) VALUES ($1, $2)
                     ON CONFLICT DO NOTHING`,
                    [room.id, req.session.userId]
                );

                await client.query('COMMIT');
                return res.json({ ok: true, room });
            } catch (err) {
                await client.query('ROLLBACK');

                // Retry only for invite_code unique collisions.
                if (err && err.code === '23505' && String(err.constraint || '').includes('invite_code')) {
                    continue;
                }

                console.error('rooms POST error:', err);
                return res.status(500).json({ error: '방 생성 중 오류가 발생했습니다.' });
            }
        }

        return res.status(500).json({ error: '초대 코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    } catch (err) {
        console.error('rooms POST connect error:', err);
        return res.status(500).json({ error: '서버 연결 오류' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/rooms/by-invite/:code — get room info by invite code (for OG + join flow)
router.get('/by-invite/:code', roomsReadLimiter, async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase().slice(0, 12);
    if (!code) return res.status(400).json({ error: '유효하지 않은 코드입니다.' });
    try {
        const result = await pool.query(
            `SELECT r.id, r.name, r.goal, r.invite_code, r.max_members, r.is_active, r.created_at,
                    u.nickname AS creator_nickname,
                    (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count,
                    (SELECT COUNT(*) FROM study_room_members m2
                     JOIN users u2 ON u2.id = m2.user_id
                     WHERE m2.room_id = r.id AND u2.is_studying = TRUE) AS active_count
             FROM study_rooms r
             JOIN users u ON u.id = r.creator_id
             WHERE r.invite_code = $1`,
            [code]
        );
        if (!result.rows.length) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        res.json({ room: result.rows[0] });
    } catch (err) {
        console.error('rooms/by-invite error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/rooms/:id — get room details (members only)
router.get('/:id', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        // Verify membership
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const [roomRes, membersRes] = await Promise.all([
            pool.query(
                `SELECT r.*, u.nickname AS creator_nickname,
                        (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count
                 FROM study_rooms r
                 JOIN users u ON u.id = r.creator_id
                 WHERE r.id = $1`,
                [roomId]
            ),
            pool.query(
                `SELECT u.id, u.nickname, u.active_title, u.is_studying,
                        COALESCE(SUM(CASE WHEN sr.created_at >= CURRENT_DATE THEN sr.duration_sec ELSE 0 END), 0) AS today_sec
                 FROM study_room_members m
                 JOIN users u ON u.id = m.user_id
                 LEFT JOIN study_records sr ON sr.user_id = u.id AND sr.result = 'SUCCESS'
                 WHERE m.room_id = $1
                 GROUP BY u.id, u.nickname, u.active_title, u.is_studying
                 ORDER BY today_sec DESC`,
                [roomId]
            )
        ]);

        if (!roomRes.rows.length) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

        res.json({ room: roomRes.rows[0], members: membersRes.rows });
    } catch (err) {
        console.error('rooms/:id GET error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/rooms/join/:code — join by invite code
router.post('/join/:code', roomsWriteLimiter, requireAuth, async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase().slice(0, 12);
    if (!code) return res.status(400).json({ error: '유효하지 않은 코드입니다.' });

    try {
        const roomRes = await pool.query(
            `SELECT r.id, r.name, r.max_members, r.is_active,
                    (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count
             FROM study_rooms r
             WHERE r.invite_code = $1`,
            [code]
        );
        if (!roomRes.rows.length) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });

        const room = roomRes.rows[0];
        if (!room.is_active) return res.status(400).json({ error: '비활성화된 방입니다.' });
        if (parseInt(room.member_count, 10) >= room.max_members) {
            return res.status(400).json({ error: '방이 가득 찼습니다.' });
        }

        await pool.query(
            `INSERT INTO study_room_members (room_id, user_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [room.id, req.session.userId]
        );

        res.json({ ok: true, room_id: room.id, room_name: room.name });
    } catch (err) {
        console.error('rooms/join error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// DELETE /api/rooms/:id/leave — leave a room
router.delete('/:id/leave', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        await pool.query(
            `DELETE FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('rooms/:id/leave error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/rooms/:id/leaderboard — daily leaderboard
router.get('/:id/leaderboard', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const result = await pool.query(
            `SELECT u.id, u.nickname, u.active_title, u.is_studying, u.study_started_at,
                    COALESCE(SUM(sr.duration_sec), 0) AS today_sec,
                    RANK() OVER (ORDER BY COALESCE(SUM(sr.duration_sec), 0) DESC) AS rank
             FROM study_room_members m
             JOIN users u ON u.id = m.user_id
             LEFT JOIN study_records sr ON sr.user_id = u.id
                 AND sr.result = 'SUCCESS'
                 AND sr.created_at >= CURRENT_DATE
             WHERE m.room_id = $1
             GROUP BY u.id, u.nickname, u.active_title, u.is_studying, u.study_started_at
             ORDER BY today_sec DESC`,
            [roomId]
        );
        res.json({ leaderboard: result.rows });
    } catch (err) {
        console.error('rooms/:id/leaderboard error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/rooms/:id/messages — recent chat (last 50)
router.get('/:id/messages', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const result = await pool.query(
            `SELECT rm.id, rm.content, rm.created_at, u.id AS user_id, u.nickname
             FROM study_room_messages rm
             JOIN users u ON u.id = rm.user_id
             WHERE rm.room_id = $1
             ORDER BY rm.created_at DESC
             LIMIT 50`,
            [roomId]
        );
        res.json({ messages: result.rows.reverse() });
    } catch (err) {
        console.error('rooms/:id/messages GET error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/rooms/:id/messages — send chat message
router.post('/:id/messages', chatLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    const content = String(req.body.content || '').trim().slice(0, 500);
    if (!content) return res.status(400).json({ error: '내용을 입력해주세요.' });

    try {
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const result = await pool.query(
            `INSERT INTO study_room_messages (room_id, user_id, content)
             VALUES ($1, $2, $3)
             RETURNING id, content, created_at`,
            [roomId, req.session.userId, content]
        );

        const userRes = await pool.query(`SELECT nickname FROM users WHERE id = $1`, [req.session.userId]);
        if (!userRes.rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        const msg = { ...result.rows[0], user_id: req.session.userId, nickname: userRes.rows[0].nickname };

        // Broadcast via io if available
        if (req.app.get('io')) {
            req.app.get('io').to(`room:${roomId}`).emit('room:message', msg);
        }

        res.json({ ok: true, message: msg });
    } catch (err) {
        console.error('rooms/:id/messages POST error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
