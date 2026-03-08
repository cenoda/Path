const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { getPercentile } = require('../data/universities');
const aligoService = require('../utils/aligo');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.' }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1시간
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '회원가입 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.' }
});

const verificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1시간
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '인증번호 요청이 너무 많습니다. 1시간 후 다시 시도해주세요.' }
});

const USER_FIELDS = 'id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score, real_name, is_n_su, prev_university, score_status, score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public, profile_image_url, balloon_skin, owned_skins, status_emoji, status_message, phone_verified, phone_verified_at, auth_provider, google_email, is_admin, admin_role';

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
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/scores');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `score_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const gpaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/gpa');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `gpa_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../../uploads/profiles');
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `profile_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const imageFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
};

const upload = multer({ storage: scoreStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });
const uploadGpa = multer({ storage: gpaStorage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: imageFilter });
const uploadProfile = multer({ storage: profileStorage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFilter });

function validateNickname(nickname) {
    const value = (nickname || '').trim();
    if (value.length < 2 || value.length > 20) {
        return { ok: false, error: '닉네임은 2~20자 사이여야 합니다.' };
    }
    if (!/^[a-zA-Z0-9가-힣_]+$/.test(value)) {
        return { ok: false, error: '닉네임은 한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.' };
    }
    return { ok: true, value };
}

function makeOAuthState() {
    return crypto.randomBytes(24).toString('hex');
}

function slugifyNickname(source) {
    const safe = (source || 'user').toLowerCase().replace(/[^a-z0-9가-힣_]/g, '');
    return safe.slice(0, 18) || 'user';
}

async function makeUniqueNickname(base) {
    const root = slugifyNickname(base);
    for (let i = 0; i < 10; i += 1) {
        const suffix = i === 0 ? '' : String(Math.floor(Math.random() * 10000)).padStart(4, '0');
        const candidate = `${root}${suffix}`.slice(0, 20);
        const exists = await pool.query('SELECT id FROM users WHERE nickname = $1', [candidate]);
        if (exists.rows.length === 0) return candidate;
    }
    return `user${Date.now().toString().slice(-8)}`;
}

router.post('/register', registerLimiter, async (req, res) => {
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

        // 휴대폰 인증 여부 확인 (선택사항)
        let phoneHash = null;
        let phoneVerified = false;
        
        if (req.session.verifiedPhone) {
            // 인증 유효시간 확인 (10분)
            const verificationAge = Date.now() - (req.session.verifiedAt || 0);
            if (verificationAge <= 10 * 60 * 1000) {
                // 같은 전화번호로 가입된 계정 수 확인
                const phoneCheck = await pool.query(
                    'SELECT COUNT(*) as count FROM users WHERE phone_hash = $1 AND phone_verified = true',
                    [req.session.verifiedPhone]
                );
                const accountLimit = parseInt(process.env.PHONE_ACCOUNT_LIMIT || '2');
                if (parseInt(phoneCheck.rows[0].count) >= accountLimit) {
                    return res.status(409).json({ error: '이 전화번호로 더 이상 계정을 생성할 수 없습니다.' });
                }
                
                phoneHash = req.session.verifiedPhone;
                phoneVerified = true;
            }
        }

        const hash = await bcrypt.hash(password, 10);

        // [FIX] 초기 영지(Estate) 설정 로직 변경
        // 목표 대학(university input)을 기본 영지로 설정하지 않도록 수정.
        // 처음에는 영지 없음(null)으로 시작.
        const initialEstate = null;

        const result = await pool.query(
            `INSERT INTO users (nickname, password_hash, university, real_name, privacy_agreed, is_n_su, prev_university, phone_hash, phone_verified, phone_verified_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING ${USER_FIELDS}`,
            [nickname, hash, initialEstate, real_name, !!privacy_agreed, !!is_n_su, prev_university || null, phoneHash, phoneVerified, phoneVerified ? new Date() : null]
        );
        const user = result.rows[0];
        
        // 인증 정보 세션에서 제거
        req.session.verifiedPhone = null;
        req.session.verifiedAt = null;
        
        req.session.userId = user.id;
        res.json({ ok: true, user: addPercentile(user) });
    } catch (err) {
        console.error('register error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/login', loginLimiter, async (req, res) => {
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
        
        // 휴대폰 미인증 계정 경고 (기존 계정 호환)
        if (!user.phone_verified) {
            safeUser.warning = '보안을 위해 휴대폰 인증을 완료해주세요.';
            safeUser.needsPhoneVerification = true;
        }
        
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

router.get('/profile-image/:filename', requireAuth, async (req, res) => {
    const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
    const isAdmin = adminCheck.rows[0]?.is_admin;
    const filename = path.basename(req.params.filename);

    if (!isAdmin) {
        const ownerMatch = filename.match(/^profile_(\d+)_/);
        if (!ownerMatch || parseInt(ownerMatch[1], 10) !== req.session.userId) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }
    }

    const filePath = path.join(__dirname, '../../uploads/profiles', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    res.sendFile(filePath);
});

router.post('/profile-custom', requireAuth, uploadProfile.single('profileImage'), async (req, res) => {
    const nickValidation = validateNickname(req.body.nickname);
    if (!nickValidation.ok) {
        return res.status(400).json({ error: nickValidation.error });
    }
    const nickname = nickValidation.value;

    try {
        const existing = await pool.query(
            'SELECT id FROM users WHERE nickname = $1 AND id != $2',
            [nickname, req.session.userId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
        }

        const nextProfileImageUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;
        const result = await pool.query(
            `UPDATE users
             SET nickname = $1,
                 profile_image_url = COALESCE($2, profile_image_url)
             WHERE id = $3
             RETURNING ${USER_FIELDS}`,
            [nickname, nextProfileImageUrl, req.session.userId]
        );

        res.json({ ok: true, user: addPercentile(result.rows[0]) });
    } catch (err) {
        console.error('profile-custom error:', err);
        res.status(500).json({ error: '프로필 저장 중 오류가 발생했습니다.' });
    }
});

router.post('/status-emoji', requireAuth, async (req, res) => {
    const { emoji } = req.body;
    const allowed = ['📚','☕','💪','🔥','😴','😊','🎯','💤','🤔','✨','🏃','🌙','⭐','🍀','💯'];
    const value = (emoji && allowed.includes(emoji)) ? emoji : null;
    try {
        await pool.query('UPDATE users SET status_emoji=$1 WHERE id=$2', [value, req.session.userId]);
        res.json({ ok: true, status_emoji: value });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/status-message', requireAuth, async (req, res) => {
    const raw = (req.body.message || '').trim().slice(0, 60);
    try {
        await pool.query('UPDATE users SET status_message=$1 WHERE id=$2', [raw || null, req.session.userId]);
        res.json({ ok: true, status_message: raw || null });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ===== Google OAuth 로그인 =====

router.get('/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'Google OAuth 설정이 누락되었습니다.' });
    }

    const state = makeOAuthState();
    req.session.googleOAuthState = state;

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account'
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

router.get('/google/callback', async (req, res) => {
    const { code, state } = req.query;
    const expectedState = req.session.googleOAuthState;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    const successRedirect = process.env.GOOGLE_AUTH_SUCCESS_REDIRECT || '/mainHub/';
    const errorRedirect = process.env.GOOGLE_AUTH_ERROR_REDIRECT || '/login/?error=google_auth';

    if (!code || !state || !expectedState || state !== expectedState) {
        req.session.googleOAuthState = null;
        return res.redirect(errorRedirect);
    }

    if (!clientId || !clientSecret || !redirectUri) {
        req.session.googleOAuthState = null;
        return res.redirect(`${errorRedirect}&reason=missing_config`);
    }

    try {
        const tokenRes = await axios.post(
            'https://oauth2.googleapis.com/token',
            new URLSearchParams({
                code: String(code),
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const tokenJson = tokenRes.data;
        const accessToken = tokenJson.access_token;
        if (!accessToken) throw new Error('missing access token');

        const userRes = await axios.get('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const profile = userRes.data;
        const googleId = profile.sub;
        const email = profile.email || null;
        const name = profile.name || 'Google User';

        if (!googleId) throw new Error('missing google subject');

        let userQuery = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE google_id = $1`,
            [googleId]
        );

        if (userQuery.rows.length === 0 && email) {
            userQuery = await pool.query(
                `SELECT ${USER_FIELDS} FROM users WHERE google_email = $1`,
                [email]
            );
        }

        let user;
        if (userQuery.rows.length > 0) {
            user = userQuery.rows[0];
            await pool.query(
                `UPDATE users SET google_id = COALESCE(google_id, $1), google_email = COALESCE(google_email, $2), auth_provider = 'google' WHERE id = $3`,
                [googleId, email, user.id]
            );
            
            req.session.googleOAuthState = null;
            req.session.userId = user.id;
            return res.redirect(successRedirect);
        } else {
            // 신규 사용자: 임시 계정 생성 후 프로필 설정 페이지로
            const nickname = await makeUniqueNickname((email || name).split('@')[0]);
            const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

            const created = await pool.query(
                `INSERT INTO users (
                    nickname, password_hash, university, real_name, privacy_agreed,
                    is_n_su, prev_university, auth_provider, google_id, google_email
                ) VALUES ($1, $2, $3, $4, true, false, NULL, 'google', $5, $6)
                RETURNING ${USER_FIELDS}`,
                [nickname, randomPasswordHash, null, name, googleId, email]
            );
            user = created.rows[0];
            
            req.session.googleOAuthState = null;
            req.session.userId = user.id;
            // 프로필 설정 페이지로 리다이렉트
            return res.redirect('/setup-profile/');
        }
    } catch (err) {
        console.error('google callback error:', err);
        req.session.googleOAuthState = null;
        return res.redirect(`${errorRedirect}&reason=oauth_failed`);
    }
});

// ===== 프로필 업데이트 (구글 로그인 후 닉네임 설정) =====
router.post('/update-profile', requireAuth, async (req, res) => {
    const { nickname, university, is_n_su, prev_university } = req.body;

    const nickValidation = validateNickname(nickname);
    if (!nickValidation.ok) {
        return res.status(400).json({ error: nickValidation.error });
    }

    if (!university) {
        return res.status(400).json({ error: '목표 대학교를 입력해주세요.' });
    }

    if (is_n_su && !prev_university) {
        return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });
    }

    try {
        // 닉네임 중복 체크
        const existing = await pool.query(
            'SELECT id FROM users WHERE nickname = $1 AND id != $2',
            [nickValidation.value, req.session.userId]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
        }

        // 프로필 업데이트
        await pool.query(
            `UPDATE users 
             SET nickname = $1, university = $2, is_n_su = $3, prev_university = $4
             WHERE id = $5`,
            [nickValidation.value, university, !!is_n_su, prev_university || null, req.session.userId]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('update-profile error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ===== 휴대폰 인증 API =====

/**
 * 인증번호 발송
 * POST /api/auth/send-verification
 * body: { phone: "01012345678" }
 */
router.post('/send-verification', verificationLimiter, async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ error: '전화번호를 입력해주세요.' });
    }

    // 전화번호 형식 검증 (한국 휴대폰)
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (!/^01[0-9]{8,9}$/.test(cleanPhone)) {
        return res.status(400).json({ error: '올바른 전화번호 형식이 아닙니다.' });
    }

    const ip = req.ip || req.connection.remoteAddress;
    const phoneHash = aligoService.hashPhone(cleanPhone);

    try {
        // 레이트리밋 체크 (같은 번호로 5분 내 재발송 차단)
        const recentCheck = await pool.query(
            `SELECT id FROM phone_verifications 
             WHERE phone_hash = $1 AND created_at > NOW() - INTERVAL '5 minutes'
             ORDER BY created_at DESC LIMIT 1`,
            [phoneHash]
        );

        if (recentCheck.rows.length > 0) {
            return res.status(429).json({ 
                error: '인증번호는 5분에 한 번만 요청할 수 있습니다.',
                retryAfter: 300 
            });
        }

        // IP 기준 레이트리밋 (1시간 내 10회)
        const ipCheck = await pool.query(
            `SELECT COUNT(*) as count FROM phone_verifications 
             WHERE ip_address = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
            [ip]
        );

        if (parseInt(ipCheck.rows[0].count) >= 10) {
            return res.status(429).json({ 
                error: '인증번호 요청 한도를 초과했습니다. 1시간 후 다시 시도해주세요.' 
            });
        }

        // 이미 가입된 번호인지 확인
        const existingUser = await pool.query(
            `SELECT id FROM users WHERE phone_hash = $1 AND phone_verified = true`,
            [phoneHash]
        );

        if (existingUser.rows.length > 0) {
            // 다계정 방지: 번호당 계정 수 제한 (기본 2개)
            const accountLimit = parseInt(process.env.PHONE_ACCOUNT_LIMIT || '2');
            if (existingUser.rows.length >= accountLimit) {
                return res.status(409).json({ 
                    error: '이미 이 번호로 등록된 계정이 있습니다.' 
                });
            }
        }

        // 인증번호 생성
        const code = aligoService.generateCode();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5분 후 만료

        // DB에 인증번호 저장
        await pool.query(
            `INSERT INTO phone_verifications (phone_hash, code, expires_at, ip_address)
             VALUES ($1, $2, $3, $4)`,
            [phoneHash, code, expiresAt, ip]
        );

        // 카카오톡 알림톡 발송
        try {
            const result = await aligoService.sendVerificationCode(cleanPhone, code);
            
            res.json({ 
                ok: true, 
                message: result.message,
                type: result.type,
                expiresIn: 300 // 5분
            });
        } catch (sendError) {
            console.error('알림톡 발송 실패:', sendError.message);
            
            // 개발 환경에서만 콘솔에 인증번호 출력 (프로덕션에서는 절대 노출 금지)
            if (process.env.NODE_ENV === 'development') {
                console.log(`[개발 모드] 인증번호: ${code}`);
                return res.json({
                    ok: true,
                    message: '개발 모드: 콘솔에서 인증번호를 확인하세요.',
                    type: 'dev',
                    expiresIn: 300
                });
            }
            
            throw sendError;
        }
    } catch (err) {
        console.error('send-verification error:', err);
        res.status(500).json({ error: '인증번호 발송에 실패했습니다.' });
    }
});

/**
 * 인증번호 검증
 * POST /api/auth/verify-phone
 * body: { phone: "01012345678", code: "123456" }
 */
router.post('/verify-phone', async (req, res) => {
    const { phone, code } = req.body;

    if (!phone || !code) {
        return res.status(400).json({ error: '전화번호와 인증번호를 모두 입력해주세요.' });
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneHash = aligoService.hashPhone(cleanPhone);

    try {
        // 최신 인증번호 조회
        const result = await pool.query(
            `SELECT id, code, expires_at, verified 
             FROM phone_verifications 
             WHERE phone_hash = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [phoneHash]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: '인증번호 발송 기록이 없습니다.' });
        }

        const verification = result.rows[0];

        // 이미 사용된 인증번호
        if (verification.verified) {
            return res.status(400).json({ error: '이미 사용된 인증번호입니다.' });
        }

        // 만료 확인
        if (new Date() > new Date(verification.expires_at)) {
            return res.status(400).json({ error: '인증번호가 만료되었습니다. 다시 요청해주세요.' });
        }

        // 인증번호 확인
        if (verification.code !== code) {
            // 실패 횟수 체크 (선택, 추후 구현 가능)
            return res.status(400).json({ error: '인증번호가 일치하지 않습니다.' });
        }

        // 인증 성공 처리
        await pool.query(
            `UPDATE phone_verifications SET verified = true WHERE id = $1`,
            [verification.id]
        );

        // 세션에 인증 정보 저장 (회원가입 시 사용)
        req.session.verifiedPhone = phoneHash;
        req.session.verifiedAt = Date.now();

        res.json({ 
            ok: true, 
            message: '인증이 완료되었습니다.',
            verified: true
        });
    } catch (err) {
        console.error('verify-phone error:', err);
        res.status(500).json({ error: '인증 처리 중 오류가 발생했습니다.' });
    }
});

/**
 * 인증 상태 확인
 * GET /api/auth/verification-status
 */
router.get('/verification-status', (req, res) => {
    const verified = !!(req.session.verifiedPhone && req.session.verifiedAt);
    const expiresIn = verified 
        ? Math.max(0, Math.floor((req.session.verifiedAt + 10 * 60 * 1000 - Date.now()) / 1000))
        : 0;

    res.json({ 
        verified,
        expiresIn, // 인증 유효시간 (10분)
        phone: verified ? '인증됨' : null
    });
});

module.exports = router;
