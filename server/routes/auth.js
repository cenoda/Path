const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { getPercentile } = require('../data/universities');

const router = express.Router();

const USER_FIELDS = 'id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score, real_name, is_n_su, prev_university, score_status, score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public';

function escapeHtml(str) {
    if (!str) return str;
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function addPercentile(user) {
    if (!user) return user;
    user.percentile = getPercentile(user.university);
    return user;
}

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

const scoreStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/scores')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `score_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const gpaStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../../uploads/gpa')),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `gpa_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const imageFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
};

const upload = multer({ storage: scoreStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });
const uploadGpa = multer({ storage: gpaStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });

router.post('/register', async (req, res) => {
    const { real_name, nickname, password, university, is_n_su, prev_university, privacy_agreed } = req.body;
    if (!nickname || !password || !university) {
        return res.status(400).json({ error: '닉네임, 비밀번호, 대학교를 모두 입력해주세요.' });
    }
    if (!real_name) return res.status(400).json({ error: '실명을 입력해주세요.' });
    if (!privacy_agreed) return res.status(400).json({ error: '개인정보 수집·이용에 동의해주세요.' });
    if (nickname.length < 2 || nickname.length > 20) return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
    if (password.length < 4) return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    if (is_n_su && !prev_university) return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });

    try {
        const existing = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname]);
        if (existing.rows.length > 0) return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });

        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (nickname, password_hash, university, real_name, privacy_agreed, is_n_su, prev_university)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING ${USER_FIELDS}`,
            [nickname, hash, university, real_name, !!privacy_agreed, !!is_n_su, prev_university || null]
        );
        const user = result.rows[0];
        req.session.userId = user.id;
        res.json({ ok: true, user: addPercentile(user) });
    } catch (err) {
        console.error('register error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    if (!nickname || !password) return res.status(400).json({ error: '닉네임과 비밀번호를 입력해주세요.' });
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS}, password_hash FROM users WHERE nickname = $1`,
            [nickname]
        );
        if (result.rows.length === 0) return res.status(401).json({ error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });

        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });

        req.session.userId = user.id;
        const { password_hash, ...safeUser } = user;
        res.json({ ok: true, user: addPercentile(safeUser) });
    } catch (err) {
        console.error('login error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => { res.json({ ok: true }); });
});

router.get('/me', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE id = $1`,
            [req.session.userId]
        );
        if (result.rows.length === 0) {
            req.session.destroy();
            return res.status(401).json({ error: '유저를 찾을 수 없습니다.' });
        }
        res.json({ user: addPercentile(result.rows[0]) });
    } catch (err) {
        console.error('me error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/upload-score', requireAuth, upload.single('scoreImage'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });

    try {
        const imageUrl = `/uploads/scores/${req.file.filename}`;
        await pool.query(
            `UPDATE users SET score_image_url = $1, score_status = 'pending' WHERE id = $2`,
            [imageUrl, req.session.userId]
        );
        res.json({ ok: true, message: '점수 이미지가 업로드되었습니다. 관리자 승인 후 반영됩니다.' });
    } catch (err) {
        console.error('upload-score error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/score-image/:filename', requireAuth, async (req, res) => {
    const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
    const isAdmin = adminCheck.rows[0]?.is_admin;
    const filename = path.basename(req.params.filename);

    if (!isAdmin) {
        const ownerMatch = filename.match(/^score_(\d+)_/);
        if (!ownerMatch || parseInt(ownerMatch[1]) !== req.session.userId) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }
    }

    const filePath = path.join(__dirname, '../../uploads/scores', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    res.sendFile(filePath);
});

router.post('/upload-gpa', requireAuth, uploadGpa.single('gpaImage'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });

    try {
        const imageUrl = `/uploads/gpa/${req.file.filename}`;
        await pool.query(
            `UPDATE users SET gpa_image_url = $1, gpa_status = 'pending' WHERE id = $2`,
            [imageUrl, req.session.userId]
        );
        res.json({ ok: true, message: '내신 성적 이미지가 업로드되었습니다. 관리자 승인 후 반영됩니다.' });
    } catch (err) {
        console.error('upload-gpa error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/toggle-gpa-public', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE users SET gpa_public = NOT gpa_public WHERE id = $1 RETURNING gpa_public`,
            [req.session.userId]
        );
        res.json({ ok: true, gpa_public: result.rows[0].gpa_public });
    } catch (err) {
        console.error('toggle-gpa error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/gpa-image/:filename', requireAuth, async (req, res) => {
    const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
    const isAdmin = adminCheck.rows[0]?.is_admin;
    const filename = path.basename(req.params.filename);

    if (!isAdmin) {
        const ownerMatch = filename.match(/^gpa_(\d+)_/);
        if (!ownerMatch || parseInt(ownerMatch[1]) !== req.session.userId) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }
    }

    const filePath = path.join(__dirname, '../../uploads/gpa', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    res.sendFile(filePath);
});

module.exports = router;
