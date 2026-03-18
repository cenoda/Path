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
const { getActiveStreakFromUser, formatDisplayName } = require('../utils/progression');
const { normalizeDomain, isValidDomain, parseUniversityDomainText } = require('../utils/schoolEmailDomain');
const { getUploadDir } = require('../utils/uploadRoot');

const router = express.Router();
const ALWAYS_MAIN_ADMIN_NICKNAME = '낭만화1';

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

const recoverySendLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '복구 인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

const recoveryResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '비밀번호 재설정 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

const EULA_VERSION = process.env.EULA_VERSION || '2026-03-09';
const EULA_TITLE = 'P.A.T.H 서비스 이용약관';
const EULA_SUMMARY = [
    '1) 본 서비스는 학습 기록/커뮤니티 기능을 제공하며, 이용자는 관련 법령과 약관을 준수해야 합니다.',
    '2) 혐오, 성적, 폭력, 불법 정보, 개인정보 노출, 도배/광고 등 유해 게시물은 제한될 수 있습니다.',
    '3) 이용자는 자신의 계정 활동에 대한 책임이 있으며, 위반 시 게시물 삭제/서비스 이용 제한이 가능합니다.',
    '4) 신고된 콘텐츠는 운영 정책에 따라 검토되며, 필요 시 법적 의무에 따라 조치될 수 있습니다.',
    '5) 본 약관 동의가 없으면 커뮤니티 작성/상호작용 등 주요 기능 이용이 제한될 수 있습니다.'
].join('\n');

const USER_FIELDS = 'id, nickname, university, gold, diamond, exp, tier, tickets, is_studying, real_name, is_n_su, prev_university, score_status, score_image_url, gpa_score, gpa_status, gpa_image_url, gpa_public, profile_image_url, status_emoji, status_message, phone_verified, phone_verified_at, auth_provider, google_email, apple_email, is_admin, admin_role, active_title, streak_count, streak_last_date, eula_version, eula_agreed_at, ui_theme, owned_themes, user_code, allow_friend_requests';

function escapeHtml(str) {
    if (!str) return str;
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function addPercentile(user) {
    if (!user) return user;
    user.percentile = getPercentile(user.university);
    user.active_streak = getActiveStreakFromUser(user);
    user.display_nickname = formatDisplayName(user.nickname, user.active_title);
    return user;
}

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

function setPrivateNoStore(res) {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

async function enforceAlwaysMainAdminByNickname(userId) {
    const result = await pool.query(
        'SELECT id, nickname, is_admin, admin_role FROM users WHERE id = $1',
        [userId]
    );
    const user = result.rows[0];
    if (!user) return null;

    if (user.nickname !== ALWAYS_MAIN_ADMIN_NICKNAME) return user;

    if (user.is_admin === true && user.admin_role === 'main') return user;

    await pool.query(
        `UPDATE users
         SET is_admin = TRUE,
             admin_role = 'main'
         WHERE id = $1`,
        [user.id]
    );

    return {
        ...user,
        is_admin: true,
        admin_role: 'main',
    };
}

async function isPrivilegedAdmin(userId) {
    const result = await pool.query(
        'SELECT is_admin, admin_role FROM users WHERE id = $1',
        [userId]
    );
    const row = result.rows[0];
    if (!row) return false;
    return row.is_admin === true || row.admin_role === 'main' || row.admin_role === 'sub';
}

async function ownsImagePath(userId, columnName, imagePath) {
        const allowedColumns = new Set(['score_image_url', 'gpa_image_url', 'profile_image_url']);
        if (!allowedColumns.has(columnName)) return false;

        const result = await pool.query(
                `SELECT 1
                     FROM users
                    WHERE id = $1
                        AND ${columnName} = $2
                    LIMIT 1`,
                [userId, imagePath]
        );

        return result.rows.length > 0;
}

const scoreStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = getUploadDir('scores');
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `score_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const gpaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = getUploadDir('gpa');
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `gpa_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = getUploadDir('profiles');
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `profile_${req.session.userId}_${Date.now()}${ext}`);
    }
});

const imageFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif'];
    const ext = path.extname(file.originalname).toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) return cb(new Error('ONLY_IMAGE_ALLOWED'));
    if (ext && !allowed.includes(ext)) return cb(new Error('ONLY_IMAGE_ALLOWED'));
    return cb(null, true);
};

const SCORE_IMAGE_MAX_SIZE = 15 * 1024 * 1024;
const GPA_IMAGE_MAX_SIZE = 15 * 1024 * 1024;
const PROFILE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;

const upload = multer({ storage: scoreStorage, limits: { fileSize: SCORE_IMAGE_MAX_SIZE }, fileFilter: imageFilter });
const uploadGpa = multer({ storage: gpaStorage, limits: { fileSize: GPA_IMAGE_MAX_SIZE }, fileFilter: imageFilter });
const uploadProfile = multer({ storage: profileStorage, limits: { fileSize: PROFILE_IMAGE_MAX_SIZE }, fileFilter: imageFilter });

function sendMulterUploadError(res, err, maxSizeBytes) {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: `이미지 용량은 최대 ${Math.floor(maxSizeBytes / (1024 * 1024))}MB까지 가능합니다.` });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({ error: '업로드 필드가 올바르지 않습니다.' });
        }
        return res.status(400).json({ error: '이미지 업로드 요청이 올바르지 않습니다.' });
    }

    if (err?.message === 'ONLY_IMAGE_ALLOWED') {
        return res.status(400).json({ error: '지원하지 않는 이미지 형식입니다. JPG, PNG, WEBP, HEIC/HEIF를 사용해주세요.' });
    }

    console.error('multer upload error:', err);
    return res.status(400).json({ error: '이미지 업로드에 실패했습니다.' });
}

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

const COMMON_PASSWORDS = new Set([
    'password',
    'password1',
    'password123',
    'qwerty',
    'qwerty123',
    'asdf1234',
    'letmein',
    'welcome',
    'admin',
    'admin123',
    'iloveyou',
    'abc123',
    '00000000',
    '11111111',
    '123123123',
    '12345678',
    '123456789',
    '1234567890',
    '1q2w3e4r',
    '1q2w3e4r5t',
    'zaq12wsx',
    'google123',
    'korea123',
    'changeme',
]);

function normalizeForPasswordChecks(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, '');
}

function hasSimpleSequentialPattern(password) {
    const onlyAlnum = String(password || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (onlyAlnum.length < 6) return false;

    const sequences = [
        '0123456789',
        'abcdefghijklmnopqrstuvwxyz',
    ];

    return sequences.some((seq) => {
        for (let i = 0; i <= seq.length - 6; i += 1) {
            const part = seq.slice(i, i + 6);
            const reversed = part.split('').reverse().join('');
            if (onlyAlnum.includes(part) || onlyAlnum.includes(reversed)) return true;
        }
        return false;
    });
}

function validatePasswordStrength({ password, nickname, realName }) {
    if (typeof password !== 'string') {
        return { ok: false, error: '비밀번호 형식이 올바르지 않습니다.' };
    }

    if (password.length < 10) {
        return { ok: false, error: '비밀번호는 10자 이상이어야 합니다.' };
    }

    if (password.length > 128) {
        return { ok: false, error: '비밀번호는 128자 이하여야 합니다.' };
    }

    if (!password.trim()) {
        return { ok: false, error: '공백만으로는 비밀번호를 만들 수 없습니다.' };
    }

    const normalizedPassword = normalizeForPasswordChecks(password);
    if (COMMON_PASSWORDS.has(normalizedPassword)) {
        return { ok: false, error: '너무 쉬운 비밀번호입니다. 더 긴 문장형 비밀번호를 사용해주세요.' };
    }

    if (/(.)\1{3,}/.test(password)) {
        return { ok: false, error: '같은 문자를 반복한 비밀번호는 사용할 수 없습니다.' };
    }

    if (hasSimpleSequentialPattern(password)) {
        return { ok: false, error: '연속된 문자/숫자 패턴이 포함된 비밀번호는 사용할 수 없습니다.' };
    }

    const normalizedNickname = normalizeForPasswordChecks(nickname);
    if (normalizedNickname.length >= 3 && normalizedPassword.includes(normalizedNickname)) {
        return { ok: false, error: '닉네임이 포함된 비밀번호는 사용할 수 없습니다.' };
    }

    const normalizedRealName = normalizeForPasswordChecks(realName);
    if (normalizedRealName.length >= 3 && normalizedPassword.includes(normalizedRealName)) {
        return { ok: false, error: '실명이 포함된 비밀번호는 사용할 수 없습니다.' };
    }

    return { ok: true };
}

function makeOAuthState() {
    return crypto.randomBytes(24).toString('hex');
}

function appendQueryParam(url, key, value) {
    if (!url) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function maskEmail(email) {
    const value = String(email || '').trim();
    const atIndex = value.indexOf('@');
    if (atIndex <= 1) return null;
    const local = value.slice(0, atIndex);
    const domain = value.slice(atIndex + 1);
    if (!domain) return null;
    const maskedLocal = `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}`;
    return `${maskedLocal}@${domain}`;
}

function extractDomainFromEmail(rawEmail) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return '';
    return normalizeDomain(email.split('@')[1] || '');
}

function resolveOauthPlatform(req) {
    const raw = String(req.query.platform || '').toLowerCase();
    return raw === 'app' ? 'app' : 'web';
}

function getRequestOrigin(req) {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
    const proto = forwardedProto || req.protocol;
    const host = forwardedHost || req.get('host');
    if (!proto || !host) return null;
    return `${proto}://${host}`;
}

function resolveGoogleRedirectUri(req, platform) {
    if (platform === 'app' && process.env.GOOGLE_REDIRECT_URI_APP) {
        return process.env.GOOGLE_REDIRECT_URI_APP;
    }

    if (platform === 'app') {
        const origin = getRequestOrigin(req);
        if (origin) return `${origin}/api/auth/google/callback`;
    }

    return process.env.GOOGLE_REDIRECT_URI;
}

function resolveGoogleSuccessRedirect(platform) {
    if (platform === 'app') {
        return process.env.GOOGLE_AUTH_SUCCESS_REDIRECT_APP || '/study-hub/';
    }
    return process.env.GOOGLE_AUTH_SUCCESS_REDIRECT || '/study-hub/';
}

function resolveGoogleErrorRedirect(platform) {
    if (platform === 'app') {
        return process.env.GOOGLE_AUTH_ERROR_REDIRECT_APP || '/login/?error=google_auth';
    }
    return process.env.GOOGLE_AUTH_ERROR_REDIRECT || '/login/?error=google_auth';
}

function resolveAppleRedirectUri(req, platform) {
    if (platform === 'app' && process.env.APPLE_REDIRECT_URI_APP) {
        return process.env.APPLE_REDIRECT_URI_APP;
    }

    if (platform === 'app') {
        const origin = getRequestOrigin(req);
        if (origin) return `${origin}/api/auth/apple/callback`;
    }

    return process.env.APPLE_REDIRECT_URI;
}

function resolveAppleSuccessRedirect(platform) {
    if (platform === 'app') {
        return process.env.APPLE_AUTH_SUCCESS_REDIRECT_APP || '/study-hub/';
    }
    return process.env.APPLE_AUTH_SUCCESS_REDIRECT || '/study-hub/';
}

function resolveAppleErrorRedirect(platform) {
    if (platform === 'app') {
        return process.env.APPLE_AUTH_ERROR_REDIRECT_APP || '/login/?error=apple_auth';
    }
    return process.env.APPLE_AUTH_ERROR_REDIRECT || '/login/?error=apple_auth';
}

function decodeJwtPayload(jwt) {
    const parts = String(jwt || '').split('.');
    if (parts.length < 2) return null;

    try {
        const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(decoded);
    } catch (_err) {
        return null;
    }
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

async function ensureUserCode(userId) {
    const existing = await pool.query('SELECT user_code FROM users WHERE id = $1', [userId]);
    if (!existing.rows.length) return null;
    if (existing.rows[0].user_code) return existing.rows[0].user_code;

    const nextCode = `PATH-${String(userId).padStart(6, '0')}`;
    const updated = await pool.query(
        `UPDATE users
         SET user_code = $2
         WHERE id = $1
         RETURNING user_code`,
        [userId, nextCode]
    );
    return updated.rows[0]?.user_code || nextCode;
}

router.post('/register', registerLimiter, async (req, res) => {
    const { real_name, nickname, password, university, is_n_su, prev_university, privacy_agreed, eula_agreed } = req.body;
    if (!nickname || !password || !university) {
        return res.status(400).json({ error: '닉네임, 비밀번호, 대학교를 모두 입력해주세요.' });
    }
    if (!real_name) return res.status(400).json({ error: '실명을 입력해주세요.' });
    if (!privacy_agreed) return res.status(400).json({ error: '개인정보 수집·이용에 동의해주세요.' });
    if (!eula_agreed) return res.status(400).json({ error: '이용약관에 동의해주세요.' });
    if (nickname.length < 2 || nickname.length > 20) return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
    const passwordValidation = validatePasswordStrength({ password, nickname, realName: real_name });
    if (!passwordValidation.ok) return res.status(400).json({ error: passwordValidation.error });
    if (is_n_su && !prev_university) return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });

    try {
        const existing = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname]);
        if (existing.rows.length > 0) return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });

        const hash = await bcrypt.hash(password, 10);

        // [FIX] 초기 영지(Estate) 설정 로직 변경
        // 목표 대학(university input)을 기본 영지로 설정하지 않도록 수정.
        // 처음에는 영지 없음(null)으로 시작.
        const initialEstate = null;

        const result = await pool.query(
            `INSERT INTO users (nickname, password_hash, university, real_name, privacy_agreed, is_n_su, prev_university, phone_hash, phone_verified, phone_verified_at, eula_version, eula_agreed_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
             RETURNING ${USER_FIELDS}`,
            [nickname, hash, initialEstate, real_name, !!privacy_agreed, !!is_n_su, prev_university || null, null, false, null, EULA_VERSION]
        );
        const user = result.rows[0];
        user.user_code = await ensureUserCode(user.id);

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

        const enforced = await enforceAlwaysMainAdminByNickname(user.id);
        const ensuredUserCode = await ensureUserCode(user.id);
        req.session.userId = user.id;
        const { password_hash, ...safeUser } = user;
        safeUser.user_code = safeUser.user_code || ensuredUserCode;

        if (enforced?.is_admin === true) safeUser.is_admin = true;
        if (enforced?.admin_role) safeUser.admin_role = enforced.admin_role;

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
        await enforceAlwaysMainAdminByNickname(req.session.userId);
        const result = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE id = $1`,
            [req.session.userId]
        );
        if (result.rows.length === 0) {
            req.session.destroy();
            return res.status(401).json({ error: '유저를 찾을 수 없습니다.' });
        }
        const user = result.rows[0];
        user.user_code = user.user_code || await ensureUserCode(user.id);
        res.json({ user: addPercentile(user) });
    } catch (err) {
        console.error('me error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/change-password', requireAuth, async (req, res) => {
    const currentPassword = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';

    if (!newPassword) {
        return res.status(400).json({ error: '새 비밀번호를 입력해주세요.' });
    }

    try {
        const result = await pool.query(
            'SELECT auth_provider, password_hash, nickname, real_name FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
        }

        const row = result.rows[0];
        const isGoogleOnly = row.auth_provider === 'google' || row.auth_provider === 'apple';

        if (!isGoogleOnly && !currentPassword) {
            return res.status(400).json({ error: '현재 비밀번호를 입력해주세요.' });
        }

        if (currentPassword) {
            const validCurrent = await bcrypt.compare(currentPassword, row.password_hash);
            if (!validCurrent) {
                return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
            }
        }

        if (currentPassword && currentPassword === newPassword) {
            return res.status(400).json({ error: '새 비밀번호가 현재 비밀번호와 동일합니다.' });
        }

        const passwordValidation = validatePasswordStrength({
            password: newPassword,
            nickname: row.nickname,
            realName: row.real_name,
        });
        if (!passwordValidation.ok) {
            return res.status(400).json({ error: passwordValidation.error });
        }

        const nextHash = await bcrypt.hash(newPassword, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [nextHash, req.session.userId]);

        return res.json({ ok: true, message: '비밀번호가 변경되었습니다.' });
    } catch (err) {
        console.error('change-password error:', err);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/eula', (_req, res) => {
    res.json({
        version: EULA_VERSION,
        title: EULA_TITLE,
        content: EULA_SUMMARY,
    });
});

router.post('/eula/agree', requireAuth, async (req, res) => {
    const { version } = req.body || {};
    if (version && String(version) !== EULA_VERSION) {
        return res.status(400).json({ error: '최신 약관 버전이 아닙니다. 화면을 새로고침 후 다시 시도해주세요.' });
    }

    try {
        const result = await pool.query(
            `UPDATE users
             SET eula_version = $1,
                 eula_agreed_at = NOW()
             WHERE id = $2
             RETURNING eula_version, eula_agreed_at`,
            [EULA_VERSION, req.session.userId]
        );
        if (!result.rows.length) {
            return res.status(404).json({ error: '유저를 찾을 수 없습니다.' });
        }

        return res.json({
            ok: true,
            eula_version: result.rows[0].eula_version,
            eula_agreed_at: result.rows[0].eula_agreed_at,
        });
    } catch (err) {
        console.error('eula agree error:', err);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/upload-score', requireAuth, (req, res) => {
    upload.single('scoreImage')(req, res, async (err) => {
        if (err) return sendMulterUploadError(res, err, SCORE_IMAGE_MAX_SIZE);
        if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });

        try {
            const imageUrl = `/uploads/scores/${req.file.filename}`;
            await pool.query(
                `UPDATE users SET score_image_url = $1, score_status = 'pending' WHERE id = $2`,
                [imageUrl, req.session.userId]
            );
            res.json({ ok: true, message: '점수 이미지가 업로드되었습니다. 관리자 승인 후 반영됩니다.' });
        } catch (dbErr) {
            console.error('upload-score error:', dbErr);
            res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    });
});

router.get('/score-image/:filename', requireAuth, async (req, res) => {
    const isAdmin = await isPrivilegedAdmin(req.session.userId);
    const filename = path.basename(req.params.filename);
    const imagePath = `/uploads/scores/${filename}`;

    if (!isAdmin) {
        const isOwner = await ownsImagePath(req.session.userId, 'score_image_url', imagePath);
        if (!isOwner) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }
    }

    const filePath = path.join(getUploadDir('scores'), filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    setPrivateNoStore(res);
    res.sendFile(filePath);
});

router.post('/upload-gpa', requireAuth, (req, res) => {
    uploadGpa.single('gpaImage')(req, res, async (err) => {
        if (err) return sendMulterUploadError(res, err, GPA_IMAGE_MAX_SIZE);
        if (!req.file) return res.status(400).json({ error: '이미지 파일을 선택해주세요.' });

        try {
            const imageUrl = `/uploads/gpa/${req.file.filename}`;
            await pool.query(
                `UPDATE users SET gpa_image_url = $1, gpa_status = 'pending' WHERE id = $2`,
                [imageUrl, req.session.userId]
            );
            res.json({ ok: true, message: '내신 성적 이미지가 업로드되었습니다. 관리자 승인 후 반영됩니다.' });
        } catch (dbErr) {
            console.error('upload-gpa error:', dbErr);
            res.status(500).json({ error: '서버 오류가 발생했습니다.' });
        }
    });
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
    const isAdmin = await isPrivilegedAdmin(req.session.userId);
    const filename = path.basename(req.params.filename);
    const imagePath = `/uploads/gpa/${filename}`;

    if (!isAdmin) {
        const isOwner = await ownsImagePath(req.session.userId, 'gpa_image_url', imagePath);
        if (!isOwner) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }
    }

    const filePath = path.join(getUploadDir('gpa'), filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    setPrivateNoStore(res);
    res.sendFile(filePath);
});

router.get('/profile-image/:filename', requireAuth, async (req, res) => {
    const isAdmin = await isPrivilegedAdmin(req.session.userId);
    const filename = path.basename(req.params.filename);
    const imagePath = `/uploads/profiles/${filename}`;

    if (!isAdmin) {
        const isOwner = await ownsImagePath(req.session.userId, 'profile_image_url', imagePath);
        if (!isOwner) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }
    }

    const filePath = path.join(getUploadDir('profiles'), filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    setPrivateNoStore(res);
    res.sendFile(filePath);
});

router.post('/profile-custom', requireAuth, (req, res) => {
    uploadProfile.single('profileImage')(req, res, async (err) => {
        if (err) return sendMulterUploadError(res, err, PROFILE_IMAGE_MAX_SIZE);

        const rawNickname = typeof req.body.nickname === 'string' ? req.body.nickname.trim() : '';
        const rawUniversity = typeof req.body.university === 'string' ? req.body.university.trim() : '';
        const isNsu = req.body.is_n_su === 'true' || req.body.is_n_su === true;
        const rawPrevUniversity = typeof req.body.prev_university === 'string' ? req.body.prev_university.trim() : '';
        const hasUniversityUpdate = rawUniversity !== '';

        let nickname = null;
        if (rawNickname) {
            const nickValidation = validateNickname(rawNickname);
            if (!nickValidation.ok) {
                return res.status(400).json({ error: nickValidation.error });
            }
            nickname = nickValidation.value;
        }

        if (hasUniversityUpdate && isNsu && !rawPrevUniversity) {
            return res.status(400).json({ error: 'N수생은 전적 대학교를 입력해주세요.' });
        }

        if (!nickname && !req.file && !hasUniversityUpdate) {
            return res.status(400).json({ error: '변경할 프로필 정보가 없습니다.' });
        }

        try {
            if (nickname) {
                const existing = await pool.query(
                    'SELECT id FROM users WHERE nickname = $1 AND id != $2',
                    [nickname, req.session.userId]
                );
                if (existing.rows.length > 0) {
                    return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
                }
            }

            const nextProfileImageUrl = req.file ? `/uploads/profiles/${req.file.filename}` : null;
            const result = await pool.query(
                `UPDATE users
                 SET nickname = COALESCE($1, nickname),
                     profile_image_url = COALESCE($2, profile_image_url),
                     university = CASE WHEN $3 THEN $4 ELSE university END,
                     is_n_su = CASE WHEN $3 THEN $5 ELSE is_n_su END,
                     prev_university = CASE WHEN $3 THEN $6 ELSE prev_university END
                 WHERE id = $7
                 RETURNING ${USER_FIELDS}`,
                [nickname, nextProfileImageUrl, hasUniversityUpdate, rawUniversity || null, isNsu, isNsu ? (rawPrevUniversity || null) : null, req.session.userId]
            );

            res.json({ ok: true, user: addPercentile(result.rows[0]) });
        } catch (dbErr) {
            console.error('profile-custom error:', dbErr);
            res.status(500).json({ error: '프로필 저장 중 오류가 발생했습니다.' });
        }
    });
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

router.get('/titles', requireAuth, async (req, res) => {
    try {
        const [titlesRes, userRes] = await Promise.all([
            pool.query(
                `SELECT code, title, is_active, achieved_at
                 FROM user_titles
                 WHERE user_id = $1
                 ORDER BY achieved_at ASC`,
                [req.session.userId]
            ),
            pool.query('SELECT active_title FROM users WHERE id = $1', [req.session.userId])
        ]);

        res.json({
            titles: titlesRes.rows,
            active_title: userRes.rows[0]?.active_title || null
        });
    } catch (err) {
        console.error('titles error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/active-title', requireAuth, async (req, res) => {
    const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        if (!code) {
            await client.query('UPDATE user_titles SET is_active = FALSE WHERE user_id = $1', [req.session.userId]);
            const userRes = await client.query(
                `UPDATE users
                 SET active_title = NULL
                 WHERE id = $1
                 RETURNING ${USER_FIELDS}`,
                [req.session.userId]
            );
            await client.query('COMMIT');
            return res.json({ ok: true, user: addPercentile(userRes.rows[0]) });
        }

        const ownedRes = await client.query(
            `SELECT code, title
             FROM user_titles
             WHERE user_id = $1 AND code = $2`,
            [req.session.userId, code]
        );
        if (!ownedRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '보유하지 않은 칭호입니다.' });
        }

        const titleText = ownedRes.rows[0].title;
        await client.query('UPDATE user_titles SET is_active = FALSE WHERE user_id = $1', [req.session.userId]);
        await client.query('UPDATE user_titles SET is_active = TRUE WHERE user_id = $1 AND code = $2', [req.session.userId, code]);
        const userRes = await client.query(
            `UPDATE users
             SET active_title = $2
             WHERE id = $1
             RETURNING ${USER_FIELDS}`,
            [req.session.userId, titleText]
        );

        await client.query('COMMIT');
        res.json({ ok: true, user: addPercentile(userRes.rows[0]) });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('active-title error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ===== Google OAuth 로그인 =====

router.get('/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const platform = resolveOauthPlatform(req);
    const redirectUri = resolveGoogleRedirectUri(req, platform);

    if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'Google OAuth 설정이 누락되었습니다.' });
    }

    const state = makeOAuthState();
    req.session.googleOAuth = {
        state,
        platform
    };
    // Backward compatibility for any legacy reads.
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

// ===== Apple OAuth 로그인 =====

router.get('/apple', (req, res) => {
    const clientId = process.env.APPLE_CLIENT_ID;
    const platform = resolveOauthPlatform(req);
    const redirectUri = resolveAppleRedirectUri(req, platform);

    if (!clientId || !redirectUri) {
        return res.status(500).json({ error: 'Apple OAuth 설정이 누락되었습니다.' });
    }

    const state = makeOAuthState();
    req.session.appleOAuth = {
        state,
        platform
    };

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'form_post',
        scope: 'name email',
        state
    });

    return res.redirect(`https://appleid.apple.com/auth/authorize?${params.toString()}`);
});

async function handleAppleCallback(req, res) {
    const source = req.method === 'POST' ? req.body : req.query;
    const { code, state } = source || {};
    const oauthContext = req.session.appleOAuth || {};
    const platform = oauthContext.platform === 'app' ? 'app' : 'web';
    const expectedState = oauthContext.state;

    const clientId = process.env.APPLE_CLIENT_ID;
    const clientSecret = process.env.APPLE_CLIENT_SECRET;
    const redirectUri = resolveAppleRedirectUri(req, platform);
    const successRedirect = resolveAppleSuccessRedirect(platform);
    const errorRedirect = resolveAppleErrorRedirect(platform);

    function clearOauthState() {
        req.session.appleOAuth = null;
    }

    if (!code || !state || !expectedState || state !== expectedState) {
        let reason = 'invalid_state';
        if (!code) reason = 'missing_code';
        else if (!state) reason = 'missing_state';
        else if (!expectedState) reason = 'missing_session_state';
        else if (state !== expectedState) reason = 'state_mismatch';

        console.warn('apple callback precheck failed:', {
            reason,
            method: req.method,
            hasCode: !!code,
            hasState: !!state,
            hasExpectedState: !!expectedState,
            platform,
        });
        clearOauthState();
        return res.redirect(appendQueryParam(errorRedirect, 'reason', reason));
    }

    if (!clientId || !clientSecret || !redirectUri) {
        clearOauthState();
        return res.redirect(appendQueryParam(errorRedirect, 'reason', 'missing_config'));
    }

    try {
        const tokenRes = await axios.post(
            'https://appleid.apple.com/auth/token',
            new URLSearchParams({
                code: String(code),
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const tokenJson = tokenRes.data || {};
        const idToken = tokenJson.id_token;
        const claims = decodeJwtPayload(idToken);
        const appleId = claims?.sub || null;
        const email = claims?.email || null;
        const issuer = claims?.iss;
        const audience = claims?.aud;

        if (!appleId) throw new Error('missing apple subject');
        if (issuer && issuer !== 'https://appleid.apple.com') throw new Error('invalid apple issuer');
        if (audience && audience !== clientId) throw new Error('invalid apple audience');

        let userQuery = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE apple_id = $1`,
            [appleId]
        );

        if (userQuery.rows.length === 0 && email) {
            userQuery = await pool.query(
                `SELECT ${USER_FIELDS} FROM users WHERE apple_email = $1 OR google_email = $1`,
                [email]
            );
        }

        let user;
        if (userQuery.rows.length > 0) {
            user = userQuery.rows[0];
            await pool.query(
                `UPDATE users
                 SET apple_id = COALESCE(apple_id, $1),
                     apple_email = COALESCE(apple_email, $2),
                     auth_provider = CASE WHEN auth_provider = 'local' THEN 'apple' ELSE auth_provider END
                 WHERE id = $3`,
                [appleId, email, user.id]
            );

            clearOauthState();
            req.session.userId = user.id;
            return res.redirect(successRedirect);
        }

        const nickname = await makeUniqueNickname((email || 'apple_user').split('@')[0]);
        const randomPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);
        const created = await pool.query(
            `INSERT INTO users (
                nickname, password_hash, university, real_name, privacy_agreed,
                is_n_su, prev_university, auth_provider, apple_id, apple_email
            ) VALUES ($1, $2, $3, $4, true, false, NULL, 'apple', $5, $6)
            RETURNING ${USER_FIELDS}`,
            [nickname, randomPasswordHash, null, 'Apple User', appleId, email]
        );

        user = created.rows[0];
        clearOauthState();
        req.session.userId = user.id;
        if (platform === 'app' && process.env.APPLE_AUTH_SETUP_REDIRECT_APP) {
            return res.redirect(process.env.APPLE_AUTH_SETUP_REDIRECT_APP);
        }
        return res.redirect('/setup-profile/');
    } catch (err) {
        console.error('apple callback error:', err);
        clearOauthState();
        return res.redirect(appendQueryParam(errorRedirect, 'reason', 'oauth_failed'));
    }
}

router.get('/apple/callback', handleAppleCallback);
router.post('/apple/callback', handleAppleCallback);

router.get('/google/callback', async (req, res) => {
    const { code, state } = req.query;
    const oauthContext = req.session.googleOAuth || {};
    const platform = oauthContext.platform === 'app' ? 'app' : 'web';
    const expectedState = oauthContext.state || req.session.googleOAuthState;
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = resolveGoogleRedirectUri(req, platform);
    const successRedirect = resolveGoogleSuccessRedirect(platform);
    const errorRedirect = resolveGoogleErrorRedirect(platform);

    function clearOauthState() {
        req.session.googleOAuth = null;
        req.session.googleOAuthState = null;
    }

    if (!code || !state || !expectedState || state !== expectedState) {
        clearOauthState();
        return res.redirect(errorRedirect);
    }

    if (!clientId || !clientSecret || !redirectUri) {
        clearOauthState();
        return res.redirect(appendQueryParam(errorRedirect, 'reason', 'missing_config'));
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
            
            clearOauthState();
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
            
            clearOauthState();
            req.session.userId = user.id;
            // 신규 사용자는 앱/웹 환경에 맞는 프로필 설정 화면으로 이동
            if (platform === 'app' && process.env.GOOGLE_AUTH_SETUP_REDIRECT_APP) {
                return res.redirect(process.env.GOOGLE_AUTH_SETUP_REDIRECT_APP);
            }
            return res.redirect('/setup-profile/');
        }
    } catch (err) {
        console.error('google callback error:', err);
        clearOauthState();
        return res.redirect(appendQueryParam(errorRedirect, 'reason', 'oauth_failed'));
    }
});

// ===== 프로필 업데이트 (구글 로그인 후 닉네임 설정) =====
router.post('/update-profile', requireAuth, async (req, res) => {
    const { nickname, university, is_n_su, prev_university } = req.body;
    const normalizedUniversity = typeof university === 'string' ? university.trim() : '';
    const wantsNsu = !!is_n_su && !!normalizedUniversity;
    const normalizedPrevUniversity = wantsNsu && typeof prev_university === 'string'
        ? prev_university.trim()
        : '';

    const nickValidation = validateNickname(nickname);
    if (!nickValidation.ok) {
        return res.status(400).json({ error: nickValidation.error });
    }

    if (wantsNsu && !normalizedPrevUniversity) {
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
             SET nickname = $1,
                 university = $2,
                 is_n_su = $3,
                 prev_university = $4
             WHERE id = $5`,
            [nickValidation.value, normalizedUniversity || null, wantsNsu, wantsNsu ? normalizedPrevUniversity : null, req.session.userId]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('update-profile error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// ===== 학교 이메일 도메인 =====

router.get('/school-email-domain/check', async (req, res) => {
    const email = String(req.query.email || '').trim();
    if (!email) {
        return res.status(400).json({ error: '이메일을 입력해주세요.' });
    }

    const domain = extractDomainFromEmail(email);
    if (!domain || !isValidDomain(domain)) {
        return res.status(400).json({ error: '올바른 이메일 형식이 아닙니다.' });
    }

    try {
        const domainResult = await pool.query(
            'SELECT domain FROM school_email_domains WHERE domain = $1 AND is_active = TRUE LIMIT 1',
            [domain]
        );

        if (!domainResult.rows.length) {
            return res.json({
                ok: true,
                email,
                domain,
                allowed: false,
                universities: [],
            });
        }

        const uniResult = await pool.query(
            `SELECT university_name
             FROM school_email_domain_universities
             WHERE domain = $1
             ORDER BY university_name ASC`,
            [domain]
        );

        return res.json({
            ok: true,
            email,
            domain,
            allowed: true,
            universities: uniResult.rows.map((row) => row.university_name),
        });
    } catch (err) {
        console.error('school-email-domain/check error:', err);
        return res.status(500).json({ error: '도메인 확인 중 오류가 발생했습니다.' });
    }
});

router.post('/school-email-domain/import', requireAuth, async (req, res) => {
    const isAdmin = await isPrivilegedAdmin(req.session.userId);
    if (!isAdmin) {
        return res.status(403).json({ error: '관리자만 접근할 수 있습니다.' });
    }

    const rawText = String(req.body?.rawText || '');
    if (!rawText.trim()) {
        return res.status(400).json({ error: 'rawText를 입력해주세요.' });
    }

    const { entries, invalidLines, stats } = parseUniversityDomainText(rawText);
    if (!entries.length) {
        return res.status(400).json({
            error: '유효한 학교/도메인 데이터가 없습니다.',
            invalidLines: invalidLines.slice(0, 20),
        });
    }

    const domains = [...new Set(entries.map((entry) => entry.domain))];
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let insertedDomains = 0;
        for (const domain of domains) {
            const result = await client.query(
                `INSERT INTO school_email_domains (domain, is_active, source)
                 VALUES ($1, TRUE, 'admin-api')
                 ON CONFLICT (domain) DO NOTHING`,
                [domain]
            );
            insertedDomains += result.rowCount;
        }

        let insertedMappings = 0;
        for (const entry of entries) {
            const result = await client.query(
                `INSERT INTO school_email_domain_universities (domain, university_name)
                 VALUES ($1, $2)
                 ON CONFLICT (domain, university_name) DO NOTHING`,
                [entry.domain, entry.universityName]
            );
            insertedMappings += result.rowCount;
        }

        await client.query('COMMIT');

        return res.json({
            ok: true,
            parsed: stats,
            insertedDomains,
            insertedMappings,
            ignoredDuplicates: stats.validEntries - insertedMappings,
            invalidLines: invalidLines.slice(0, 20),
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('school-email-domain/import error:', err);
        return res.status(500).json({ error: '도메인 가져오기 중 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

// ===== 휴대폰 인증 API (종료) =====

/**
 * 인증번호 발송 (종료)
 * POST /api/auth/send-verification
 * body: { phone: "01012345678" }
 */
router.post('/send-verification', verificationLimiter, async (req, res) => {
    return res.status(410).json({
        error: '휴대폰 인증 기능이 종료되었습니다.'
    });
});

/**
 * 인증번호 검증 (종료)
 * POST /api/auth/verify-phone
 * body: { phone: "01012345678", code: "123456" }
 */
router.post('/verify-phone', async (req, res) => {
    return res.status(410).json({
        error: '휴대폰 인증 기능이 종료되었습니다.'
    });
});

/**
 * 인증 상태 확인 (종료)
 * GET /api/auth/verification-status
 */
router.get('/verification-status', (req, res) => {
    res.json({
        verified: false,
        expiresIn: 0,
        phone: null,
        disabled: true,
    });
});

// ===== 비밀번호 복구 옵션 API =====

router.get('/password-recovery/options', async (req, res) => {
    const nickname = String(req.query.nickname || '').trim();
    if (!nickname) {
        return res.json({
            ok: true,
            hasGoogleRecovery: false,
            maskedGoogleEmail: null,
            hasAppleRecovery: false,
            maskedAppleEmail: null,
        });
    }

    try {
        const result = await pool.query(
            'SELECT google_email, apple_email FROM users WHERE nickname = $1 LIMIT 1',
            [nickname]
        );

        if (!result.rows.length) {
            return res.json({
                ok: true,
                hasGoogleRecovery: false,
                maskedGoogleEmail: null,
                hasAppleRecovery: false,
                maskedAppleEmail: null,
            });
        }

        const row = result.rows[0];
        return res.json({
            ok: true,
            hasGoogleRecovery: !!row.google_email,
            maskedGoogleEmail: maskEmail(row.google_email),
            hasAppleRecovery: !!row.apple_email,
            maskedAppleEmail: maskEmail(row.apple_email),
        });
    } catch (err) {
        console.error('password-recovery/options error:', err);
        return res.status(500).json({ error: '복구 옵션 조회 중 오류가 발생했습니다.' });
    }
});

// 휴대폰 기반 복구 API (종료)
router.post('/password-recovery/send-code', recoverySendLimiter, async (req, res) => {
    return res.status(410).json({
        error: '휴대폰 비밀번호 복구 기능이 종료되었습니다. Google 또는 Apple 로그인으로 복구해주세요.'
    });
});

router.post('/password-recovery/reset', recoveryResetLimiter, async (req, res) => {
    return res.status(410).json({
        error: '휴대폰 비밀번호 복구 기능이 종료되었습니다. Google 또는 Apple 로그인으로 복구해주세요.'
    });
});

// 친구 신청 수신 허용/거부 설정
router.post('/friend-request-setting', requireAuth, async (req, res) => {
    const allow = req.body.allow_friend_requests;
    if (typeof allow !== 'boolean') {
        return res.status(400).json({ error: '잘못된 요청입니다.' });
    }
    try {
        await pool.query(
            'UPDATE users SET allow_friend_requests = $1 WHERE id = $2',
            [allow, req.session.userId]
        );
        res.json({ ok: true, allow_friend_requests: allow });
    } catch (err) {
        console.error('friend-request-setting error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 사용자 검색 (닉네임으로)
router.get('/users/search', requireAuth, async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 1) return res.json({ users: [] });
    if (q.length > 30) return res.status(400).json({ error: '검색어가 너무 깁니다.' });

    try {
        const result = await pool.query(
            `SELECT u.id, u.nickname, u.university, u.profile_image_url, u.is_studying,
                    u.allow_friend_requests,
                    f.status AS friendship_status,
                    CASE WHEN f.sender_id = $2 THEN 'sent'
                         WHEN f.receiver_id = $2 THEN 'received'
                         ELSE NULL END AS friendship_dir,
                    f.id AS friendship_id
             FROM users u
             LEFT JOIN friendships f ON (
                 (f.sender_id = u.id AND f.receiver_id = $2)
                 OR (f.sender_id = $2 AND f.receiver_id = u.id)
             )
             WHERE u.id != $2
               AND u.nickname ILIKE $1
             ORDER BY u.nickname ASC
             LIMIT 20`,
            [`%${q}%`, req.session.userId]
        );
        res.json({ users: result.rows });
    } catch (err) {
        console.error('users/search error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
