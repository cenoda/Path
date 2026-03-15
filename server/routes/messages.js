const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getUploadDir } = require('../utils/uploadRoot');

// 파일 저장 디렉토리 설정
const uploadDir = getUploadDir('messages');

// Multer 설정
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const ALLOWED_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.gif', '.webp', '.pdf', '.txt']);
const ALLOWED_MIMETYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain'
]);

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB 제한
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMETYPES.has(file.mimetype)) {
            return cb(new Error('지원하지 않는 파일 형식입니다. (허용: 이미지, PDF, TXT)'));
        }
        cb(null, true);
    }
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

let messageUiSchemaReady = false;
async function ensureMessageUiSchema() {
    if (messageUiSchemaReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS hidden_dm_conversations (
            user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            other_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            hidden_at     TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, other_user_id)
        );
        CREATE INDEX IF NOT EXISTS idx_hidden_dm_conversations_user_hidden_at
            ON hidden_dm_conversations(user_id, hidden_at DESC);

        CREATE TABLE IF NOT EXISTS hidden_group_conversations (
            user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            room_id   INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
            hidden_at TIMESTAMP NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, room_id)
        );
        CREATE INDEX IF NOT EXISTS idx_hidden_group_conversations_user_hidden_at
            ON hidden_group_conversations(user_id, hidden_at DESC);
    `);
    messageUiSchemaReady = true;
}

// 전체 업로드 용량 확인 및 정리 (100MB 제한)
async function cleanupOldFiles() {
    try {
        const MAX_STORAGE_MB = 100;
        const MAX_STORAGE_BYTES = MAX_STORAGE_MB * 1024 * 1024;
        
        // 전체 파일 크기 계산
        const result = await pool.query(
            'SELECT SUM(file_size) as total FROM messages WHERE file_size IS NOT NULL'
        );
        
        const totalSize = parseInt(result.rows[0]?.total || 0);
        
        if (totalSize > MAX_STORAGE_BYTES) {
            console.log(`용량 초과 (${(totalSize / 1024 / 1024).toFixed(2)}MB). 오래된 파일 삭제 중...`);
            
            // 오래된 파일부터 삭제 (용량의 20% 정도를 삭제)
            const deleteTarget = totalSize - (MAX_STORAGE_BYTES * 0.8);
            
            const oldFiles = await pool.query(`
                SELECT id, file_path, file_size 
                FROM messages 
                WHERE file_path IS NOT NULL 
                ORDER BY created_at ASC
            `);
            
            let deletedSize = 0;
            for (const row of oldFiles.rows) {
                if (deletedSize >= deleteTarget) break;
                
                // 실제 파일 삭제
                const fileName = path.basename(String(row.file_path || ''));
                const fullPath = path.join(uploadDir, fileName);
                if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
                
                // DB에서 파일 정보 제거 (메시지는 유지, 파일만 제거)
                await pool.query(
                    'UPDATE messages SET file_path = NULL, file_type = NULL, file_size = NULL, file_name = NULL WHERE id = $1',
                    [row.id]
                );
                
                deletedSize += row.file_size || 0;
            }
            
            console.log(`${(deletedSize / 1024 / 1024).toFixed(2)}MB 정리 완료`);
        }
    } catch (err) {
        console.error('파일 정리 오류:', err.message);
    }
}

function requireAuth(req, res, next) {
    if (!req.session?.userId) return res.status(401).json({ error: '로그인 필요' });
    next();
}

function setPrivateNoStore(res) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

// 메시지 첨부 파일 조회 (대화 참여자만 접근 가능)
router.get('/file/:filename', requireAuth, async (req, res) => {
    const filename = String(req.params.filename || '').trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
        return res.status(400).json({ error: '잘못된 파일 경로입니다' });
    }

    const filePath = `/uploads/messages/${filename}`;

    try {
        const access = await pool.query(
            `SELECT 1
               FROM messages
              WHERE file_path = $1
                AND (sender_id = $2 OR receiver_id = $2)
              LIMIT 1`,
            [filePath, req.session.userId]
        );

        if (access.rows.length === 0) {
            return res.status(404).json({ error: '파일을 찾을 수 없습니다' });
        }

        const absolutePath = path.join(uploadDir, filename);
        if (!fs.existsSync(absolutePath)) {
            return res.status(404).json({ error: '파일이 존재하지 않습니다' });
        }

        setPrivateNoStore(res);
        return res.sendFile(absolutePath);
    } catch (err) {
        console.error('messages/file 오류:', err.message);
        return res.status(500).json({ error: '서버 오류' });
    }
});

// 대화 목록 (가장 최근 메시지 기준)
router.get('/conversations', requireAuth, async (req, res) => {
    try {
        await ensureMessageUiSchema();
        const result = await pool.query(`
            SELECT DISTINCT ON (other_user)
                other_user,
                u.nickname,
                u.profile_image_url,
                u.university,
                u.balloon_skin,
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
            LEFT JOIN hidden_dm_conversations h
                ON h.user_id = $1
               AND h.other_user_id = sub.other_user
            WHERE h.hidden_at IS NULL OR sub.last_time > h.hidden_at
            ORDER BY other_user, last_time DESC
        `, [req.session.userId]);
        res.json(result.rows);
    } catch (err) {
        console.error('messages/conversations 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 그룹 대화 목록 (내가 참여한 방 기준)
router.get('/group-conversations', requireAuth, async (req, res) => {
    try {
        await ensureRoomChatSchema();
        await ensureMessageUiSchema();

        const result = await pool.query(
            `SELECT
                r.id AS room_id,
                r.name AS room_name,
                r.invite_code,
                r.is_public,
                COALESCE(last_msg.content, '') AS last_msg,
                last_msg.created_at AS last_time,
                (SELECT COUNT(*) FROM study_room_members m2 WHERE m2.room_id = r.id) AS member_count
             FROM study_rooms r
             JOIN study_room_members m ON m.room_id = r.id AND m.user_id = $1
             LEFT JOIN LATERAL (
                SELECT rm.content, rm.created_at
                FROM study_room_messages rm
                WHERE rm.room_id = r.id
                ORDER BY rm.created_at DESC
                LIMIT 1
             ) last_msg ON TRUE
                 LEFT JOIN hidden_group_conversations hgc
                     ON hgc.user_id = $1
                    AND hgc.room_id = r.id
             WHERE r.is_active = TRUE
                    AND (hgc.hidden_at IS NULL OR last_msg.created_at IS NULL OR last_msg.created_at > hgc.hidden_at)
             ORDER BY last_time DESC NULLS LAST, r.created_at DESC`,
            [req.session.userId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('messages/group-conversations 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 특정 그룹방 대화 내역
router.get('/group-conversation/:roomId', requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.roomId, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        await ensureRoomChatSchema();

        const memberCheck = await pool.query(
            `SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2`,
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        const result = await pool.query(
            `SELECT rm.id,
                    rm.user_id AS sender_id,
                    NULL::INTEGER AS receiver_id,
                    rm.content,
                    FALSE AS is_read,
                    rm.created_at,
                    NULL::TEXT AS file_path,
                    NULL::TEXT AS file_type,
                    NULL::INTEGER AS file_size,
                    NULL::TEXT AS file_name,
                    u.nickname AS sender_nickname,
                    (rm.user_id = $1) AS is_mine,
                    rm.user_id,
                    r.id AS room_id,
                    r.name AS room_name
             FROM study_room_messages rm
             JOIN users u ON u.id = rm.user_id
             JOIN study_rooms r ON r.id = rm.room_id
             WHERE rm.room_id = $2
             ORDER BY rm.created_at ASC
             LIMIT 200`,
            [req.session.userId, roomId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('messages/group-conversation 오류:', err.message);
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
                   m.file_path, m.file_type, m.file_size, m.file_name,
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

router.post('/conversation/:targetId/mark-read', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.targetId, 10);
    if (!targetId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        const result = await pool.query(
            'UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE RETURNING id',
            [targetId, req.session.userId]
        );
        res.json({ ok: true, updated: result.rowCount || 0 });
    } catch (err) {
        console.error('messages/mark-read 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/conversation/:targetId/hide', requireAuth, async (req, res) => {
    const targetId = parseInt(req.params.targetId, 10);
    if (!targetId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        await ensureMessageUiSchema();
        await pool.query(
            `INSERT INTO hidden_dm_conversations (user_id, other_user_id, hidden_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id, other_user_id)
             DO UPDATE SET hidden_at = EXCLUDED.hidden_at`,
            [req.session.userId, targetId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('messages/hide-dm 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/group-conversation/:roomId/hide', requireAuth, async (req, res) => {
    const roomId = parseInt(req.params.roomId, 10);
    if (!roomId) return res.status(400).json({ error: '잘못된 요청' });

    try {
        await ensureRoomChatSchema();
        await ensureMessageUiSchema();

        const memberCheck = await pool.query(
            'SELECT 1 FROM study_room_members WHERE room_id = $1 AND user_id = $2',
            [roomId, req.session.userId]
        );
        if (!memberCheck.rows.length) return res.status(403).json({ error: '방 멤버가 아닙니다.' });

        await pool.query(
            `INSERT INTO hidden_group_conversations (user_id, room_id, hidden_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (user_id, room_id)
             DO UPDATE SET hidden_at = EXCLUDED.hidden_at`,
            [req.session.userId, roomId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('messages/hide-group 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 메시지 보내기 (텍스트만)
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

// 관리자에게 문의 메시지 보내기 (친구 여부 무관)
router.post('/contact-admin', requireAuth, async (req, res) => {
    const raw = typeof req.body?.content === 'string' ? req.body.content : '';
    const content = raw.trim();

    if (!content) {
        return res.status(400).json({ error: '문의 내용을 입력하세요' });
    }
    if (content.length > 500) {
        return res.status(400).json({ error: '문의는 500자 이내로 입력하세요' });
    }

    try {
        const adminsRes = await pool.query(
            'SELECT id FROM users WHERE is_admin = TRUE AND id <> $1 ORDER BY id ASC',
            [req.session.userId]
        );

        if (adminsRes.rows.length === 0) {
            return res.status(404).json({ error: '현재 문의 가능한 관리자가 없습니다' });
        }

        const senderRes = await pool.query('SELECT nickname FROM users WHERE id = $1', [req.session.userId]);
        const senderNickname = senderRes.rows[0]?.nickname || '사용자';

        for (const admin of adminsRes.rows) {
            await pool.query(
                'INSERT INTO messages (sender_id, receiver_id, content) VALUES ($1, $2, $3)',
                [req.session.userId, admin.id, content]
            );

            await pool.query(
                'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
                [admin.id, 'message', `${senderNickname}님이 관리자 문의를 보냈습니다.`]
            );
        }

        res.json({ ok: true, sent_to_admins: adminsRes.rows.length });
    } catch (err) {
        console.error('messages/contact-admin 오류:', err.message);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 파일 메시지 보내기
router.post('/send-file', requireAuth, upload.single('file'), async (req, res) => {
    const { receiver_id, content } = req.body;
    
    if (!receiver_id) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '수신자를 선택하세요' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: '파일을 선택하세요' });
    }
    
    if (parseInt(receiver_id) === req.session.userId) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: '자신에게 파일을 보낼 수 없습니다' });
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
            fs.unlinkSync(req.file.path);
            return res.status(403).json({ error: '친구에게만 파일을 보낼 수 있습니다' });
        }

        // 용량 관리 실행
        await cleanupOldFiles();

        const filePath = `/uploads/messages/${req.file.filename}`;
        const messageContent = content?.trim() || req.file.originalname;
        
        const result = await pool.query(
            `INSERT INTO messages (sender_id, receiver_id, content, file_path, file_type, file_size, file_name) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [
                req.session.userId, 
                receiver_id, 
                messageContent,
                filePath,
                req.file.mimetype,
                req.file.size,
                req.file.originalname
            ]
        );

        const senderRes = await pool.query('SELECT nickname FROM users WHERE id = $1', [req.session.userId]);
        await pool.query(
            'INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)',
            [receiver_id, 'message', `${senderRes.rows[0]?.nickname}님이 파일을 보냈습니다.`]
        );

        res.json({ ok: true, message: result.rows[0] });
    } catch (err) {
        console.error('messages/send-file 오류:', err.message);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
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
