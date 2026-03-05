const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 파일 저장 디렉토리 설정
const uploadDir = path.join(__dirname, '../../uploads/messages');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

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

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB 제한
    },
    fileFilter: (req, file, cb) => {
        // 허용할 파일 타입
        const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|txt|zip|mp4|mov/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('지원하지 않는 파일 형식입니다'));
        }
    }
});

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
                const fullPath = path.join(__dirname, '../..', row.file_path);
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
