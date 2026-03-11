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

// ── 방 꾸미기 샵 카탈로그 ──────────────────────────────────────────────────────
const ROOM_SHOP = {
    wallpapers: [
        { key: 'default',  name: '기본',        price: 0,    emoji: '⬜', gradients: ['#f8f9fa', '#e9ecef'], description: '깔끔한 기본 배경' },
        { key: 'blossom',  name: '벚꽃',         price: 500,  emoji: '🌸', gradients: ['#fce4ec', '#f8bbd9'], description: '봄날 벚꽃이 흩날려요' },
        { key: 'night',    name: '별밤',          price: 800,  emoji: '🌙', gradients: ['#0d1b4b', '#1a2a6c'], description: '별빛 가득한 밤하늘' },
        { key: 'dawn',     name: '새벽',          price: 1000, emoji: '🌅', gradients: ['#312060', '#5c3380'], description: '새벽의 신비로운 분위기' },
        { key: 'coral',    name: '산호',          price: 1200, emoji: '🪸', gradients: ['#fff3e0', '#ffe0b2'], description: '따뜻한 산호빛 감성' },
        { key: 'forest',   name: '숲속',          price: 1500, emoji: '🌿', gradients: ['#e8f5e9', '#c8e6c9'], description: '초록빛 숲 속의 고요함' },
        { key: 'library',  name: '황금 도서관',   price: 3000, emoji: '📖', gradients: ['#3e2723', '#4e342e'], description: '지식의 전당, 황금빛 서재' },
        { key: 'space',    name: '우주',          price: 5000, emoji: '🚀', gradients: ['#050510', '#0a0520'], description: '광활한 우주 속 나만의 공간' },
    ],
    props: [
        { key: 'plant',     name: '화분',    emoji: '🌱', price: 200  },
        { key: 'coffee',    name: '커피',    emoji: '☕', price: 150  },
        { key: 'clock',     name: '탁상시계', emoji: '⏰', price: 300  },
        { key: 'lamp',      name: '스탠드',   emoji: '💡', price: 250  },
        { key: 'trophy',    name: '트로피',   emoji: '🏆', price: 1000 },
        { key: 'pizza',     name: '피자',    emoji: '🍕', price: 100  },
        { key: 'cat',       name: '고양이',   emoji: '🐱', price: 500  },
        { key: 'books',     name: '책더미',   emoji: '📚', price: 200  },
        { key: 'ac',        name: '에어컨',   emoji: '❄️', price: 800  },
        { key: 'star',      name: '별',       emoji: '⭐', price: 300  },
        { key: 'music',     name: '스피커',   emoji: '🎵', price: 400  },
        { key: 'cookie',    name: '쿠키',    emoji: '🍪', price: 100  },
    ],
};

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

let roomChatSchemaReady = false;
async function ensureRoomChatSchema() {
    if (roomChatSchemaReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS study_room_messages (
            id          SERIAL PRIMARY KEY,
            room_id     INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
            user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content     VARCHAR(500) NOT NULL,
            created_at  TIMESTAMP DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_study_room_messages_room ON study_room_messages(room_id, created_at);
    `);
    roomChatSchemaReady = true;
}

const ROOM_ROLE = Object.freeze({
    OWNER: 'owner',
    MANAGER: 'manager',
    MEMBER: 'member',
});

const ROOM_PERMISSION = Object.freeze({
    EDIT_SETTINGS: 'edit_settings',
    MANAGE_MEMBERS: 'manage_members',
    MANAGE_DECOR: 'manage_decor',
    DELETE_ROOM: 'delete_room',
    ASSIGN_ROLES: 'assign_roles',
});

const ROOM_ROLE_PERMISSIONS = Object.freeze({
    [ROOM_ROLE.OWNER]: {
        [ROOM_PERMISSION.EDIT_SETTINGS]: true,
        [ROOM_PERMISSION.MANAGE_MEMBERS]: true,
        [ROOM_PERMISSION.MANAGE_DECOR]: true,
        [ROOM_PERMISSION.DELETE_ROOM]: true,
        [ROOM_PERMISSION.ASSIGN_ROLES]: true,
    },
    [ROOM_ROLE.MANAGER]: {
        [ROOM_PERMISSION.EDIT_SETTINGS]: true,
        [ROOM_PERMISSION.MANAGE_MEMBERS]: true,
        [ROOM_PERMISSION.MANAGE_DECOR]: true,
        [ROOM_PERMISSION.DELETE_ROOM]: false,
        [ROOM_PERMISSION.ASSIGN_ROLES]: false,
    },
    [ROOM_ROLE.MEMBER]: {
        [ROOM_PERMISSION.EDIT_SETTINGS]: false,
        [ROOM_PERMISSION.MANAGE_MEMBERS]: false,
        [ROOM_PERMISSION.MANAGE_DECOR]: false,
        [ROOM_PERMISSION.DELETE_ROOM]: false,
        [ROOM_PERMISSION.ASSIGN_ROLES]: false,
    },
});

function hasRoomPermission(role, permission) {
    return Boolean(ROOM_ROLE_PERMISSIONS[role] && ROOM_ROLE_PERMISSIONS[role][permission]);
}

function roomRoleRank(role) {
    if (role === ROOM_ROLE.OWNER) return 3;
    if (role === ROOM_ROLE.MANAGER) return 2;
    return 1;
}

async function getRoomRole(clientOrPool, roomId, userId) {
    const roleRes = await clientOrPool.query(
        `SELECT COALESCE(rr.role,
                        CASE WHEN r.creator_id = m.user_id THEN 'owner' ELSE 'member' END) AS role
         FROM study_room_members m
         JOIN study_rooms r ON r.id = m.room_id
         LEFT JOIN study_room_member_roles rr ON rr.room_id = m.room_id AND rr.user_id = m.user_id
         WHERE m.room_id = $1 AND m.user_id = $2 AND r.is_active = TRUE`,
        [roomId, userId]
    );

    return roleRes.rows[0]?.role || null;
}

// GET /api/rooms/my — list rooms I have joined
router.get('/my', roomsReadLimiter, requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.name, r.goal, r.invite_code, r.max_members, r.is_active, r.is_public, r.created_at,
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

// GET /api/rooms/public — browse public rooms (search + sort + pagination)
router.get('/public', roomsReadLimiter, async (req, res) => {
    const q    = String(req.query.q    || '').trim().slice(0, 60);
    const sort = ['study', 'members', 'new'].includes(req.query.sort) ? req.query.sort : 'study';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let orderBy;
    if (sort === 'study')   orderBy = 'today_sec DESC, member_count DESC';
    else if (sort === 'members') orderBy = 'member_count DESC, today_sec DESC';
    else                    orderBy = 'r.created_at DESC';

    try {
        const params = [limit, offset];
        const searchClause = q ? `AND (r.name ILIKE $3 OR r.goal ILIKE $3)` : '';
        if (q) params.push(`%${q}%`);

        const result = await pool.query(
            `SELECT r.id, r.name, r.goal, r.invite_code, r.max_members, r.created_at,
                    u.nickname AS creator_nickname,
                    (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count,
                    COALESCE((
                        SELECT SUM(sr.duration_sec) FROM study_records sr
                        JOIN study_room_members m ON m.user_id = sr.user_id AND m.room_id = r.id
                        WHERE sr.result = 'SUCCESS' AND sr.created_at >= CURRENT_DATE
                    ), 0) AS today_sec
             FROM study_rooms r
             JOIN users u ON u.id = r.creator_id
             WHERE r.is_active = TRUE AND r.is_public = TRUE
             ${searchClause}
             ORDER BY ${orderBy}
             LIMIT $1 OFFSET $2`,
            params
        );
        res.json({ rooms: result.rows, page, has_more: result.rows.length === limit });
    } catch (err) {
        console.error('rooms/public error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/rooms/shop — room shop catalog (static)
router.get('/shop', roomsReadLimiter, requireAuth, (req, res) => {
    res.json({ shop: ROOM_SHOP });
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

                await client.query(
                    `INSERT INTO study_room_member_roles (room_id, user_id, role)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (room_id, user_id)
                     DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
                    [room.id, req.session.userId, ROOM_ROLE.OWNER]
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
                        COALESCE(rr.role, CASE WHEN r.creator_id = u.id THEN 'owner' ELSE 'member' END) AS role,
                        COALESCE(SUM(CASE WHEN sr.created_at >= CURRENT_DATE THEN sr.duration_sec ELSE 0 END), 0) AS today_sec
                 FROM study_room_members m
                 JOIN study_rooms r ON r.id = m.room_id
                 JOIN users u ON u.id = m.user_id
                 LEFT JOIN study_room_member_roles rr ON rr.room_id = m.room_id AND rr.user_id = m.user_id
                 LEFT JOIN study_records sr ON sr.user_id = u.id AND sr.result = 'SUCCESS'
                 WHERE m.room_id = $1
                 GROUP BY u.id, u.nickname, u.active_title, u.is_studying, rr.role, r.creator_id
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

// GET /api/rooms/:id/permissions — role + permission matrix for current user
router.get('/:id/permissions', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const role = await getRoomRole(pool, roomId, req.session.userId);
        if (!role) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        res.json({ role, permissions: ROOM_ROLE_PERMISSIONS[role] || ROOM_ROLE_PERMISSIONS[ROOM_ROLE.MEMBER] });
    } catch (err) {
        console.error('rooms/:id/permissions error:', err);
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

        await pool.query(
            `INSERT INTO study_room_member_roles (room_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (room_id, user_id) DO NOTHING`,
            [room.id, req.session.userId, ROOM_ROLE.MEMBER]
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
        await Promise.all([
            pool.query(
                `DELETE FROM study_room_member_roles WHERE room_id = $1 AND user_id = $2`,
                [roomId, req.session.userId]
            ),
            pool.query(
                `DELETE FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
                [roomId, req.session.userId]
            ),
        ]);
        res.json({ ok: true });
    } catch (err) {
        console.error('rooms/:id/leave error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// PATCH /api/rooms/:id — edit room info (creator only)
router.patch('/:id', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    const name = String(req.body.name || '').trim().slice(0, 60);
    const goal = String(req.body.goal || '').trim().slice(0, 100);
    const maxMembers = Math.max(2, Math.min(50, parseInt(req.body.max_members, 10) || 10));
    const isPublic = req.body.is_public === true || req.body.is_public === 'true';
    if (!name) return res.status(400).json({ error: '방 이름을 입력해주세요.' });

    try {
        const role = await getRoomRole(pool, roomId, req.session.userId);
        if (!role) return res.status(403).json({ error: '방 멤버가 아닙니다.' });
        if (!hasRoomPermission(role, ROOM_PERMISSION.EDIT_SETTINGS)) {
            return res.status(403).json({ error: '방 설정 수정 권한이 없습니다.' });
        }

        const check = await pool.query(
            `SELECT (SELECT COUNT(*) FROM study_room_members WHERE room_id = $1) AS member_count
             FROM study_rooms WHERE id = $1 AND is_active = TRUE`,
            [roomId]
        );
        if (!check.rows.length) return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        if (maxMembers < parseInt(check.rows[0].member_count, 10))
            return res.status(400).json({ error: '현재 멤버 수보다 최대 인원을 작게 설정할 수 없습니다.' });

        const result = await pool.query(
            `UPDATE study_rooms SET name = $1, goal = $2, max_members = $3, is_public = $4
             WHERE id = $5 RETURNING *`,
            [name, goal || null, maxMembers, isPublic, roomId]
        );
        res.json({ ok: true, room: result.rows[0] });
    } catch (err) {
        console.error('rooms PATCH error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// PATCH /api/rooms/:id/members/:userId/role — assign member role (owner only)
router.patch('/:id/members/:userId/role', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    const targetRole = String(req.body.role || '').trim().toLowerCase();
    const allowedTargetRoles = new Set([ROOM_ROLE.MANAGER, ROOM_ROLE.MEMBER]);

    if (!roomId || !targetUserId) return res.status(400).json({ error: '잘못된 요청' });
    if (!allowedTargetRoles.has(targetRole)) {
        return res.status(400).json({ error: '설정 가능한 역할은 manager/member 입니다.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const roomRes = await client.query(
            `SELECT id, creator_id FROM study_rooms WHERE id = $1 AND is_active = TRUE`,
            [roomId]
        );
        if (!roomRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        }

        const myRole = await getRoomRole(client, roomId, req.session.userId);
        if (!myRole) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '방 멤버가 아닙니다.' });
        }
        if (!hasRoomPermission(myRole, ROOM_PERMISSION.ASSIGN_ROLES)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '역할 변경 권한이 없습니다.' });
        }
        if (targetUserId === req.session.userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '본인 역할은 변경할 수 없습니다.' });
        }
        if (targetUserId === roomRes.rows[0].creator_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '방장 역할은 변경할 수 없습니다.' });
        }

        const targetMemberRes = await client.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, targetUserId]
        );
        if (!targetMemberRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자가 방 멤버가 아닙니다.' });
        }

        await client.query(
            `INSERT INTO study_room_member_roles (room_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (room_id, user_id)
             DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
            [roomId, targetUserId, targetRole]
        );

        await client.query('COMMIT');
        res.json({ ok: true, room_id: roomId, user_id: targetUserId, role: targetRole });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('rooms/:id/members/:userId/role PATCH error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        if (client) client.release();
    }
});

// DELETE /api/rooms/:id/members/:userId — kick member (owner/manager)
router.delete('/:id/members/:userId', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const targetUserId = parseInt(req.params.userId, 10);
    if (!roomId || !targetUserId) return res.status(400).json({ error: '잘못된 요청' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const roomRes = await client.query(
            `SELECT id, creator_id FROM study_rooms WHERE id = $1 AND is_active = TRUE`,
            [roomId]
        );
        if (!roomRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        }

        const myRole = await getRoomRole(client, roomId, req.session.userId);
        if (!myRole) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '방 멤버가 아닙니다.' });
        }
        if (!hasRoomPermission(myRole, ROOM_PERMISSION.MANAGE_MEMBERS)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '멤버 관리 권한이 없습니다.' });
        }
        if (targetUserId === req.session.userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '본인은 강퇴할 수 없습니다. 나가기를 사용해주세요.' });
        }

        const targetRole = await getRoomRole(client, roomId, targetUserId);
        if (!targetRole) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '대상 사용자가 방 멤버가 아닙니다.' });
        }
        if (targetRole === ROOM_ROLE.OWNER || targetUserId === roomRes.rows[0].creator_id) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '방장은 강퇴할 수 없습니다.' });
        }
        if (roomRoleRank(myRole) <= roomRoleRank(targetRole)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '본인보다 높은(또는 같은) 권한은 강퇴할 수 없습니다.' });
        }

        await client.query(
            `DELETE FROM study_room_member_roles WHERE room_id = $1 AND user_id = $2`,
            [roomId, targetUserId]
        );
        await client.query(
            `DELETE FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, targetUserId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, room_id: roomId, kicked_user_id: targetUserId });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('rooms/:id/members/:userId DELETE error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        if (client) client.release();
    }
});

// PATCH /api/rooms/:id/owner — transfer ownership (owner only)
router.patch('/:id/owner', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const nextOwnerUserId = parseInt(req.body.next_owner_user_id, 10);
    if (!roomId || !nextOwnerUserId) return res.status(400).json({ error: '잘못된 요청' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const roomRes = await client.query(
            `SELECT id, creator_id FROM study_rooms WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
            [roomId]
        );
        if (!roomRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        }

        const myRole = await getRoomRole(client, roomId, req.session.userId);
        if (myRole !== ROOM_ROLE.OWNER || roomRes.rows[0].creator_id !== req.session.userId) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '방장만 방장 위임을 할 수 있습니다.' });
        }
        if (nextOwnerUserId === req.session.userId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '본인에게 다시 위임할 수 없습니다.' });
        }

        const targetMemberRes = await client.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, nextOwnerUserId]
        );
        if (!targetMemberRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '새 방장은 현재 방 멤버여야 합니다.' });
        }

        await client.query(
            `UPDATE study_rooms SET creator_id = $2 WHERE id = $1`,
            [roomId, nextOwnerUserId]
        );
        await client.query(
            `INSERT INTO study_room_member_roles (room_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (room_id, user_id)
             DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
            [roomId, req.session.userId, ROOM_ROLE.MANAGER]
        );
        await client.query(
            `INSERT INTO study_room_member_roles (room_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (room_id, user_id)
             DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()`,
            [roomId, nextOwnerUserId, ROOM_ROLE.OWNER]
        );

        await client.query('COMMIT');
        res.json({ ok: true, room_id: roomId, previous_owner_id: req.session.userId, new_owner_id: nextOwnerUserId });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('rooms/:id/owner PATCH error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        if (client) client.release();
    }
});

// DELETE /api/rooms/:id — delete room (owner only, soft/hard)
router.delete('/:id', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const hardDelete = req.query.hard === 'true' || req.query.hard === true;
    const confirmName = String(req.body.confirm_name || '').trim();
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const roomRes = await client.query(
            `SELECT id, name FROM study_rooms WHERE id = $1 AND is_active = TRUE FOR UPDATE`,
            [roomId]
        );
        if (!roomRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '방을 찾을 수 없습니다.' });
        }

        const role = await getRoomRole(client, roomId, req.session.userId);
        if (!role) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '방 멤버가 아닙니다.' });
        }
        if (!hasRoomPermission(role, ROOM_PERMISSION.DELETE_ROOM)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '방 삭제 권한이 없습니다.' });
        }

        const roomName = roomRes.rows[0].name;
        if (hardDelete) {
            if (!confirmName || confirmName !== roomName) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: '하드 삭제는 confirm_name에 정확한 방 이름이 필요합니다.' });
            }

            await client.query(`DELETE FROM study_rooms WHERE id = $1`, [roomId]);
            await client.query('COMMIT');
            return res.json({ ok: true, deleted: 'hard' });
        }

        await client.query(
            `UPDATE study_rooms
             SET is_active = FALSE,
                 deleted_at = NOW(),
                 deleted_by = $2
             WHERE id = $1`,
            [roomId, req.session.userId]
        );
        await client.query(`DELETE FROM study_room_member_roles WHERE room_id = $1`, [roomId]);
        await client.query(`DELETE FROM study_room_members WHERE room_id = $1`, [roomId]);

        await client.query('COMMIT');
        res.json({ ok: true, deleted: 'soft' });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('rooms DELETE error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        if (client) client.release();
    }
});

// GET /api/rooms/:id/stats — today donut + weekly bar data
router.get('/:id/stats', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const [todayRes, weeklyRes] = await Promise.all([
            pool.query(
                `SELECT u.id, u.nickname,
                        COALESCE(SUM(sr.duration_sec), 0) AS today_sec
                 FROM study_room_members m
                 JOIN users u ON u.id = m.user_id
                 LEFT JOIN study_records sr ON sr.user_id = u.id
                     AND sr.result = 'SUCCESS'
                     AND sr.created_at >= CURRENT_DATE
                 WHERE m.room_id = $1
                 GROUP BY u.id, u.nickname
                 ORDER BY today_sec DESC`,
                [roomId]
            ),
            pool.query(
                `SELECT DATE(sr.created_at AT TIME ZONE 'Asia/Seoul') AS day,
                        COALESCE(SUM(sr.duration_sec), 0) AS total_sec
                 FROM study_records sr
                 JOIN study_room_members m ON m.user_id = sr.user_id AND m.room_id = $1
                 WHERE sr.result = 'SUCCESS'
                   AND sr.created_at >= (NOW() AT TIME ZONE 'Asia/Seoul')::date - INTERVAL '6 days'
                 GROUP BY DATE(sr.created_at AT TIME ZONE 'Asia/Seoul')
                 ORDER BY day ASC`,
                [roomId]
            )
        ]);

        res.json({ today: todayRes.rows, weekly: weeklyRes.rows });
    } catch (err) {
        console.error('rooms/:id/stats error:', err);
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
        await ensureRoomChatSchema();

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
        await ensureRoomChatSchema();

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

// ── 방 꾸미기 API ─────────────────────────────────────────────────────────────

// GET /api/rooms/:id/decor — current room decor state + owned items
router.get('/:id/decor', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const [ownedRes, stateRes] = await Promise.all([
            pool.query(
                `SELECT roi.item_key, roi.category, roi.purchased_by, u.nickname AS purchased_by_nickname
                 FROM room_owned_items roi
                 JOIN users u ON u.id = roi.purchased_by
                 WHERE roi.room_id = $1`,
                [roomId]
            ),
            pool.query(
                `SELECT wallpaper_key, prop_keys FROM room_decor_state WHERE room_id = $1`,
                [roomId]
            ),
        ]);

        const state = stateRes.rows[0] || { wallpaper_key: 'default', prop_keys: [] };
        res.json({ owned: ownedRes.rows, wallpaper: state.wallpaper_key, props: state.prop_keys });
    } catch (err) {
        console.error('rooms/:id/decor GET error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// POST /api/rooms/:id/shop/buy — buy item from shop (costs personal gold)
router.post('/:id/shop/buy', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const itemKey = String(req.body.item_key || '').trim();
    if (!roomId || !itemKey) return res.status(400).json({ error: '잘못된 요청' });

    // Resolve item from catalog
    let item = null, category = null;
    for (const [cat, list] of [['wallpaper', ROOM_SHOP.wallpapers], ['prop', ROOM_SHOP.props]]) {
        const found = list.find(i => i.key === itemKey);
        if (found) { item = found; category = cat; break; }
    }
    if (!item) return res.status(404).json({ error: '존재하지 않는 아이템입니다.' });
    if (item.price === 0) return res.status(400).json({ error: '이 아이템은 구매 불필요합니다.' });

    let client;
    try {
        client = await pool.connect();

        const memberCheck = await client.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const alreadyOwned = await client.query(
            `SELECT 1 FROM room_owned_items WHERE room_id = $1 AND item_key = $2`,
            [roomId, itemKey]
        );
        if (alreadyOwned.rows.length) return res.status(400).json({ error: '이미 구매된 아이템입니다.' });

        await client.query('BEGIN');

        const goldRes = await client.query(
            `UPDATE users SET gold = gold - $1 WHERE id = $2 AND gold >= $1 RETURNING gold`,
            [item.price, req.session.userId]
        );
        if (!goldRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. ${item.price.toLocaleString()}G 필요` });
        }

        await client.query(
            `INSERT INTO room_owned_items (room_id, item_key, category, purchased_by) VALUES ($1, $2, $3, $4)`,
            [roomId, itemKey, category, req.session.userId]
        );

        await client.query(
            `INSERT INTO room_gold_contributed (room_id, user_id, total_gold) VALUES ($1, $2, $3)
             ON CONFLICT (room_id, user_id) DO UPDATE SET total_gold = room_gold_contributed.total_gold + $3`,
            [roomId, req.session.userId, item.price]
        );

        await client.query('COMMIT');
        res.json({ ok: true, new_gold: goldRes.rows[0].gold });
    } catch (err) {
        if (client) await client.query('ROLLBACK').catch(() => {});
        console.error('rooms/:id/shop/buy error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        if (client) client.release();
    }
});

// POST /api/rooms/:id/decor/equip — update equipped wallpaper + props
router.post('/:id/decor/equip', roomsWriteLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    const { wallpaper, props } = req.body;

    try {
        const role = await getRoomRole(pool, roomId, req.session.userId);
        if (!role) return res.status(403).json({ error: '방 멤버가 아닙니다.' });
        if (!hasRoomPermission(role, ROOM_PERMISSION.MANAGE_DECOR)) {
            return res.status(403).json({ error: '방 꾸미기 적용 권한이 없습니다.' });
        }

        // Build set of owned item keys (default wallpaper always available)
        const ownedRes = await pool.query(
            `SELECT item_key FROM room_owned_items WHERE room_id = $1`,
            [roomId]
        );
        const owned = new Set(ownedRes.rows.map(r => r.item_key));
        owned.add('default');

        const newWallpaper = (typeof wallpaper === 'string' && owned.has(wallpaper))
            ? wallpaper : null;
        const newProps = Array.isArray(props)
            ? props.filter(k => typeof k === 'string' && owned.has(k)).slice(0, 9)
            : null;

        const sets = ['updated_at = NOW()'];
        const vals = [roomId, 'default', '[]'];
        if (newWallpaper !== null) { sets.push(`wallpaper_key = $${vals.push(newWallpaper)}`); }
        if (newProps !== null)     { sets.push(`prop_keys = $${vals.push(JSON.stringify(newProps))}`); }

        await pool.query(
            `INSERT INTO room_decor_state (room_id, wallpaper_key, prop_keys)
             VALUES ($1, $2, $3::jsonb)
             ON CONFLICT (room_id) DO UPDATE SET ${sets.join(', ')}`,
            vals
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('rooms/:id/decor/equip error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// GET /api/rooms/:id/contributions — member gold contribution leaderboard
router.get('/:id/contributions', roomsReadLimiter, requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const result = await pool.query(
            `SELECT u.id, u.nickname,
                    COALESCE(rgc.total_gold, 0) AS total_gold
             FROM study_room_members m
             JOIN users u ON u.id = m.user_id
             LEFT JOIN room_gold_contributed rgc ON rgc.room_id = $1 AND rgc.user_id = u.id
             WHERE m.room_id = $1
             ORDER BY total_gold DESC`,
            [roomId]
        );
        res.json({ contributions: result.rows });
    } catch (err) {
        console.error('rooms/:id/contributions error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
