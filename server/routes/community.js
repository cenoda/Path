/**
 * server/routes/community.js
 * 커뮤니티 게시판 API
 *
 * GET  /api/community/posts          - 목록 조회
 * GET  /api/community/posts/hot      - 베스트 (추천 Top 8)
 * POST /api/community/uploads/image  - 이미지 업로드
 * POST /api/community/posts          - 글 작성
 * POST /api/community/posts/:id/view - 조회수 +1
 * POST /api/community/posts/:id/like - 추천 토글 (auth)
 * POST /api/community/posts/:id/gold-like - 골드 추천 +1 (auth)
 * GET  /api/community/posts/:id/comments  - 댓글 목록
 * POST /api/community/posts/:id/comments  - 댓글 작성
 */

const router = require('express').Router();
const pool   = require('../db');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { formatDisplayName } = require('../utils/progression');
const { getUploadDir } = require('../utils/uploadRoot');

const BEST_MIN_LIKES = 15;
const GOLD_LIKE_COST = 30;
const EULA_VERSION = process.env.EULA_VERSION || '2026-03-09';
const REPORT_REASON_CODES = new Set([
    'spam',
    'abuse',
    'sexual',
    'hate',
    'personal_info',
    'illegal',
    'other'
]);

const communityUploadDir = getUploadDir('community');

const imageUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, communityUploadDir),
        filename: (req, file, cb) => {
            const userId = req.session?.userId || 'guest';
            const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase();
            const safeExt = /^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : '.jpg';
            const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
            cb(null, `community_${userId}_${suffix}${safeExt}`);
        }
    }),
    limits: {
        fileSize: 8 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
        if (typeof file.mimetype === 'string' && file.mimetype.startsWith('image/')) {
            cb(null, true);
            return;
        }
        cb(new Error('이미지 파일만 업로드할 수 있습니다.'));
    }
});

/* ── auth guard ─────────────────────────────────────────────── */
function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

async function getAdminRole(userId) {
    const result = await pool.query(
        'SELECT is_admin, admin_role FROM users WHERE id = $1',
        [userId]
    );

    const row = result.rows[0];
    if (!row) return null;
    if (row.admin_role === 'main' || row.admin_role === 'sub') return row.admin_role;
    return row.is_admin ? 'sub' : null;
}

async function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    try {
        const role = await getAdminRole(req.session.userId);
        if (!role) return res.status(403).json({ error: '관리자 권한이 없습니다.' });
        req.adminRole = role;
        next();
    } catch (err) {
        console.error('[community] requireAdmin', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

function normalizeCommunityNickname(raw) {
    const fallback = '익명';
    if (typeof raw !== 'string') return fallback;
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    if (trimmed.length < 2 || trimmed.length > 20) return null;
    return trimmed;
}

function normalizeProfileImageUrl(raw) {
    if (typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (/^\/uploads\/profiles\/[a-zA-Z0-9._-]+$/.test(trimmed)) return trimmed;
    return '';
}

async function requireLatestEula(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    try {
        const result = await pool.query(
            'SELECT eula_version, eula_agreed_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        const row = result.rows[0];
        if (!row) return res.status(401).json({ error: '사용자를 찾을 수 없습니다.' });

        const agreed = !!row.eula_agreed_at && row.eula_version === EULA_VERSION;
        if (!agreed) {
            return res.status(403).json({
                error: '최신 이용약관 동의가 필요합니다.',
                code: 'EULA_REQUIRED',
                eula_version: EULA_VERSION,
            });
        }

        return next();
    } catch (err) {
        console.error('[community] requireLatestEula', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
}

async function requireLatestEulaIfAuthenticated(req, res, next) {
    if (!req.session.userId) return next();
    return requireLatestEula(req, res, next);
}

function makeBlockedPostCondition(userId, placeholderIndex, tableAlias = 'p') {
    if (!userId) return { sql: '', params: [] };
    return {
        sql: `(${tableAlias}.user_id IS NULL OR NOT EXISTS (
            SELECT 1
            FROM user_blocks ub
            WHERE ub.blocker_id = $${placeholderIndex}
              AND ub.blocked_id = ${tableAlias}.user_id
        ))`,
        params: [userId]
    };
}

function parseActivityFilters(req) {
    const rawCategory = String(req.query.category || '').trim();
    const category = VALID_CATS.has(rawCategory) ? rawCategory : '';

    const daysRaw = parseInt(req.query.days, 10);
    const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 0;

    const q = String(req.query.q || '').trim().slice(0, 100);

    return { category, days, q };
}

function appendActivityFilters(conds, params, filters, opts = {}) {
    const categoryColumn = opts.categoryColumn;
    const dateColumn = opts.dateColumn;
    const textColumns = Array.isArray(opts.textColumns) ? opts.textColumns : [];

    if (filters.category && categoryColumn) {
        params.push(filters.category);
        conds.push(`${categoryColumn} = $${params.length}`);
    }

    if (filters.days > 0 && dateColumn) {
        params.push(filters.days);
        conds.push(`${dateColumn} >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
    }

    if (filters.q && textColumns.length > 0) {
        params.push(`%${filters.q}%`);
        const placeholder = `$${params.length}`;
        conds.push(`(${textColumns.map((col) => `${col} ILIKE ${placeholder}`).join(' OR ')})`);
    }
}

// SSRF 방어: 내부 IP/호스트네임 블랙리스트
const SSRF_BLOCKED_PATTERN = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1|fc00:|fd)/i;

function normalizeOptionalHttpUrl(raw, maxLength = 1000) {
    if (raw === undefined || raw === null) return '';
    if (typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.length > maxLength) return null;

    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch (_) {
        return null;
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

    // SSRF 방어: 내부 주소 차단
    const hostname = parsed.hostname;
    if (SSRF_BLOCKED_PATTERN.test(hostname)) return null;

    return parsed.toString();
}

function normalizeOptionalImageUrl(raw) {
    if (raw === undefined || raw === null) return '';
    if (typeof raw !== 'string') return null;

    const trimmed = raw.trim();
    if (!trimmed) return '';

    // 내부 업로드 경로 허용
    if (/^\/uploads\/community\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
        return trimmed;
    }

    return normalizeOptionalHttpUrl(trimmed);
}

/* ── IP prefix helper ───────────────────────────────────────── */
function getIpPrefix(req) {
    const raw = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.ip
        || '0.0.0.0';
    const clean = raw.replace(/^::ffff:/, '');
    const parts = clean.split('.');
    if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
    // IPv6: 앞 두 그룹만
    return clean.split(':').slice(0, 2).join(':') || '?';
}

/* ── 유효 카테고리 ──────────────────────────────────────────── */
const VALID_CATS = new Set(['념글', '정보', '질문', '잡담']);
const WRITABLE_CATS = new Set(['정보', '질문', '잡담']);

/* ════════════════════════════════════════════════════════════ */
/* GET /posts — 목록 조회                                        */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts', async (req, res) => {
    const page  = Math.max(0, parseInt(req.query.page)  || 0);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 25));
    const cat   = req.query.category || '전체';
    const sort  = String(req.query.sort || 'latest').trim();
    const q     = (req.query.q || '').trim();
    const offset = page * limit;

    const params = [];
    const conds  = [];

    if (cat === '념글') {
        params.push(BEST_MIN_LIKES);
        conds.push(`likes >= $${params.length}`);
    } else if (cat !== '전체' && VALID_CATS.has(cat)) {
        params.push(cat);
        conds.push(`category = $${params.length}`);
    }
    if (q) {
        params.push(`%${q}%`);
        conds.push(`title ILIKE $${params.length}`);
    }

    const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;
    const blockedCond = makeBlockedPostCondition(viewerId, params.length + 1, 'p');
    if (blockedCond.sql) {
        conds.push(blockedCond.sql);
        params.push(...blockedCond.params);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const whereWithAlias = where
        .replace(/\btitle\b/g, 'p.title')
        .replace(/\blikes\b/g, 'p.likes')
        .replace(/\bcategory\b/g, 'p.category');

    const orderByMap = {
        latest: 'p.created_at DESC',
        likes: 'p.likes DESC, p.created_at DESC',
        views: 'p.views DESC, p.created_at DESC',
    };
    const orderBy = orderByMap[sort] || orderByMap.latest;

    try {
        const [cntRes, postsRes] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM community_posts p ${whereWithAlias}`, params),
            pool.query(
                `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix,
                        p.user_id,
                        u.nickname AS user_nickname, u.active_title,
                        u.profile_image_url,
                    (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname,
                        p.views, p.likes, p.comments_count, p.created_at,
                        p.image_url,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
                 FROM community_posts p
                 LEFT JOIN users u ON u.id = p.user_id
                 ${whereWithAlias}
                 ORDER BY ${orderBy}
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);
        const posts = postsRes.rows.map((row) => {
            const displayNickname = row.active_title
                ? formatDisplayName(row.nickname, row.active_title)
                : row.nickname;
            return {
                ...row,
                profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
                display_nickname: displayNickname
            };
        });

        res.json({ total: parseInt(cntRes.rows[0].count), posts });
    } catch (err) {
        console.error('[community] GET /posts', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /posts/hot — 베스트 게시글 (추천 Top 8)                  */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/hot', async (req, res) => {
    const cat = req.query.category || '전체';
    const params = [];
    const conds  = [`likes >= ${BEST_MIN_LIKES}`];

    if (cat !== '전체' && cat !== '념글' && VALID_CATS.has(cat)) {
        params.push(cat);
        conds.push(`category = $${params.length}`);
    }

    const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;
    const blockedCond = makeBlockedPostCondition(viewerId, params.length + 1, 'p');
    if (blockedCond.sql) {
        conds.push(blockedCond.sql);
        params.push(...blockedCond.params);
    }

    const where = `WHERE ${conds.join(' AND ')}`;

    try {
        const result = await pool.query(
            `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix,
                    p.user_id,
                    u.nickname AS user_nickname, u.active_title,
                    u.profile_image_url,
                    (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname,
                    p.views, p.likes, p.comments_count, p.created_at,
                    p.image_url,
                    (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
             FROM community_posts p
             LEFT JOIN users u ON u.id = p.user_id
             ${where.replace(/\blikes\b/g, 'p.likes').replace(/\bcategory\b/g, 'p.category')}
             ORDER BY p.likes DESC, p.created_at DESC
             LIMIT 8`,
            params
        );
        const posts = result.rows.map((row) => ({
            ...row,
            profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
            display_nickname: row.active_title
                ? formatDisplayName(row.nickname, row.active_title)
                : row.nickname
        }));
        res.json({ posts });
    } catch (err) {
        console.error('[community] GET /posts/hot', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /posts/:id — 게시글 단건 조회                            */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;

    try {
        const params = [id];
        let blockedWhere = '';
        if (viewerId) {
            params.push(viewerId);
            blockedWhere = `
                AND (
                    p.user_id IS NULL OR NOT EXISTS (
                        SELECT 1
                        FROM user_blocks ub
                        WHERE ub.blocker_id = $2
                          AND ub.blocked_id = p.user_id
                    )
                )`;
        }

        const result = await pool.query(
            `SELECT p.id, p.user_id, p.category, p.title, p.body, p.image_url, p.link_url, p.nickname, p.ip_prefix,
                    u.nickname AS user_nickname, u.active_title,
                    u.profile_image_url,
                    (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname,
                    p.views, p.likes, p.comments_count, p.created_at
             FROM community_posts p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.id = $1
             ${blockedWhere}`,
            params
        );
        if (!result.rows.length) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        const post = result.rows[0];
        if (viewerId) {
            const bookmarkRes = await pool.query(
                'SELECT 1 FROM community_bookmarks WHERE post_id = $1 AND user_id = $2',
                [id, viewerId]
            );
            post.is_bookmarked = bookmarkRes.rows.length > 0;
        } else {
            post.is_bookmarked = false;
        }
        post.display_nickname = post.active_title
            ? formatDisplayName(post.nickname, post.active_title)
            : post.nickname;
        post.profile_image_url = normalizeProfileImageUrl(post.profile_image_url);
        res.json({ post });
    } catch (err) {
        console.error('[community] GET /posts/:id', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /uploads/image — 커뮤니티 이미지 업로드                */
/* ════════════════════════════════════════════════════════════ */
router.post('/uploads/image', requireLatestEulaIfAuthenticated, (req, res) => {
    imageUpload.single('image')(req, res, (err) => {
        if (err) {
            const msg = err.message || '이미지 업로드에 실패했습니다.';
            return res.status(400).json({ error: msg });
        }

        if (!req.file) {
            return res.status(400).json({ error: '이미지 파일을 선택해 주세요.' });
        }

        return res.status(201).json({
            image_url: `/uploads/community/${req.file.filename}`,
            file_name: req.file.originalname,
            size: req.file.size,
        });
    });
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts — 글 작성                                         */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts', requireLatestEulaIfAuthenticated, async (req, res) => {
    const { category, title, body = '', anonymous_nickname, image_url, link_url } = req.body;
    const bodyText = typeof body === 'string' ? body : '';

    if (!title || !title.trim()) {
        return res.status(400).json({ error: '제목을 입력해 주세요.' });
    }
    if (title.trim().length > 200) {
        return res.status(400).json({ error: '제목은 200자 이내로 입력해 주세요.' });
    }
    if (!WRITABLE_CATS.has(category)) {
        return res.status(400).json({ error: '카테고리가 올바르지 않습니다.' });
    }
    if (bodyText.length > 5000) {
        return res.status(400).json({ error: '내용은 5,000자 이내로 입력해 주세요.' });
    }

    const normalizedImageUrl = normalizeOptionalImageUrl(image_url);
    if (normalizedImageUrl === null) {
        return res.status(400).json({ error: '이미지 첨부가 올바르지 않습니다.' });
    }

    const normalizedLinkUrl = normalizeOptionalHttpUrl(link_url);
    if (normalizedLinkUrl === null) {
        return res.status(400).json({ error: '링크 주소는 http/https 형식으로 입력해 주세요.' });
    }

    const requestedNickname = normalizeCommunityNickname(anonymous_nickname);
    if (requestedNickname === null) {
        return res.status(400).json({ error: '익명 닉네임은 2~20자로 입력해 주세요.' });
    }

    const ipPrefix = getIpPrefix(req);

    try {
        let userId = null;
        let nickname = requestedNickname;
        if (req.session.userId) {
            const userRes = await pool.query('SELECT id, nickname FROM users WHERE id = $1', [req.session.userId]);
            if (userRes.rows.length) {
                userId = userRes.rows[0].id;
                const userNickname = normalizeCommunityNickname(userRes.rows[0].nickname) || '익명';
                const hasCustomNicknameInput = typeof anonymous_nickname === 'string' && anonymous_nickname.trim().length > 0;
                nickname = hasCustomNicknameInput ? requestedNickname : userNickname;
            }
        }

        const result = await pool.query(
            `INSERT INTO community_posts (user_id, category, title, body, image_url, link_url, ip_prefix, nickname)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, category, title, nickname, ip_prefix, image_url, link_url,
                       views, likes, comments_count, created_at,
                       (image_url IS NOT NULL AND image_url <> '') AS has_image`,
            [
                userId,
                category,
                title.trim(),
                bodyText.trim(),
                normalizedImageUrl || null,
                normalizedLinkUrl || null,
                ipPrefix,
                nickname,
            ]
        );
        res.status(201).json({ post: result.rows[0] });
    } catch (err) {
        console.error('[community] POST /posts', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/view — 조회수 +1                             */
/* ════════════════════════════════════════════════════════════ */
const viewLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.' }
});

router.post('/posts/:id/view', viewLimiter, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        await pool.query(
            'UPDATE community_posts SET views = views + 1 WHERE id = $1',
            [id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[community] POST /posts/:id/view', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/like — 추천 토글                             */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/like', requireAuth, requireLatestEula, async (req, res) => {
    const postId = parseInt(req.params.id);
    const userId = req.session.userId;
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            'SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2',
            [postId, userId]
        );

        let liked;
        if (existing.rows.length) {
            // 취소
            await client.query(
                'DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2',
                [postId, userId]
            );
            await client.query(
                'UPDATE community_posts SET likes = GREATEST(0, likes - 1) WHERE id = $1',
                [postId]
            );
            liked = false;
        } else {
            // 추천
            await client.query(
                'INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2)',
                [postId, userId]
            );
            await client.query(
                'UPDATE community_posts SET likes = likes + 1 WHERE id = $1',
                [postId]
            );
            liked = true;
        }

        const updated = await client.query(
            'SELECT likes FROM community_posts WHERE id = $1',
            [postId]
        );
        await client.query('COMMIT');

        res.json({ liked, likes: updated.rows[0]?.likes ?? 0 });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] POST /posts/:id/like', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/gold-like — 골드 추천(+1)                    */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/gold-like', requireAuth, requireLatestEula, async (req, res) => {
    const postId = parseInt(req.params.id);
    const userId = req.session.userId;
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const postRes = await client.query(
            'SELECT id, likes FROM community_posts WHERE id = $1 FOR UPDATE',
            [postId]
        );
        if (!postRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        const userRes = await client.query(
            'SELECT gold FROM users WHERE id = $1 FOR UPDATE',
            [userId]
        );
        if (!userRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
        }

        const myGold = Number(userRes.rows[0].gold || 0);
        if (myGold < GOLD_LIKE_COST) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${GOLD_LIKE_COST}G` });
        }

        const spentRes = await client.query(
            `UPDATE users
             SET gold = gold - $1
             WHERE id = $2
             RETURNING gold`,
            [GOLD_LIKE_COST, userId]
        );

        const likeRes = await client.query(
            `UPDATE community_posts
             SET likes = likes + 1
             WHERE id = $1
             RETURNING likes`,
            [postId]
        );

        await client.query('COMMIT');
        return res.json({
            ok: true,
            cost: GOLD_LIKE_COST,
            likes: likeRes.rows[0]?.likes ?? 0,
            remainingGold: spentRes.rows[0]?.gold ?? 0,
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] POST /posts/:id/gold-like', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/bookmark — 북마크 토글                        */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/bookmark', requireAuth, requireLatestEula, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const postRes = await client.query('SELECT id FROM community_posts WHERE id = $1', [postId]);
        if (!postRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        const existing = await client.query(
            'SELECT 1 FROM community_bookmarks WHERE post_id = $1 AND user_id = $2',
            [postId, userId]
        );

        let bookmarked;
        if (existing.rows.length) {
            await client.query(
                'DELETE FROM community_bookmarks WHERE post_id = $1 AND user_id = $2',
                [postId, userId]
            );
            bookmarked = false;
        } else {
            await client.query(
                'INSERT INTO community_bookmarks (post_id, user_id) VALUES ($1, $2)',
                [postId, userId]
            );
            bookmarked = true;
        }

        await client.query('COMMIT');
        return res.json({ ok: true, bookmarked });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] POST /posts/:id/bookmark', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /posts/:id/comments — 댓글 목록                          */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/:id/comments', async (req, res) => {
    const postId = parseInt(req.params.id);
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const viewerId = req.session?.userId ? parseInt(req.session.userId, 10) : null;

    try {
        const params = [postId];
        let blockedWhere = '';
        if (viewerId) {
            params.push(viewerId);
            blockedWhere = `
                AND (
                    c.user_id IS NULL OR NOT EXISTS (
                        SELECT 1
                        FROM user_blocks ub
                        WHERE ub.blocker_id = $2
                          AND ub.blocked_id = c.user_id
                    )
                )`;
        }

        const result = await pool.query(
            `SELECT c.id, c.user_id, c.nickname, c.ip_prefix, c.body, c.created_at,
                    u.nickname AS user_nickname, u.active_title,
                    u.profile_image_url,
                    (c.user_id IS NOT NULL AND u.nickname IS NOT NULL AND c.nickname = u.nickname) AS is_verified_nickname
             FROM community_comments c
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.post_id = $1
             ${blockedWhere}
             ORDER BY c.created_at ASC`,
            params
        );
        const comments = result.rows.map((row) => ({
            ...row,
            profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
            display_nickname: row.user_nickname
                ? formatDisplayName(row.user_nickname, row.active_title)
                : row.nickname
        }));
        res.json({ comments });
    } catch (err) {
        console.error('[community] GET /posts/:id/comments', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts/:id/comments — 댓글 작성                         */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts/:id/comments', requireLatestEulaIfAuthenticated, async (req, res) => {
    const postId = parseInt(req.params.id);
    const { body } = req.body;

    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!body || !body.trim()) return res.status(400).json({ error: '내용을 입력해 주세요.' });
    if (body.trim().length > 1000) return res.status(400).json({ error: '댓글은 1,000자 이내로 입력해 주세요.' });

    const ipPrefix = getIpPrefix(req);
    const guestNickname = normalizeCommunityNickname(req.body?.anonymous_nickname);
    if (guestNickname === null) {
        return res.status(400).json({ error: '익명 닉네임은 2~20자로 입력해 주세요.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let authorUserId = null;
        let nickname = guestNickname || '익명';
        let activeTitle = null;
        let profileImageUrl = '';
        let isVerifiedNickname = false;

        if (req.session.userId) {
            const userRes = await client.query(
                'SELECT id, nickname, active_title, profile_image_url FROM users WHERE id = $1',
                [req.session.userId]
            );
            if (userRes.rows.length) {
                authorUserId = userRes.rows[0].id;
                nickname = userRes.rows[0].nickname;
                activeTitle = userRes.rows[0].active_title;
                profileImageUrl = normalizeProfileImageUrl(userRes.rows[0].profile_image_url);
                isVerifiedNickname = true;
            }
        }

        const result = await client.query(
            `INSERT INTO community_comments (post_id, user_id, body, ip_prefix, nickname)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, user_id, nickname, ip_prefix, body, created_at`,
            [postId, authorUserId, body.trim(), ipPrefix, nickname]
        );

        await client.query(
            'UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = $1',
            [postId]
        );

        await client.query('COMMIT');
        res.status(201).json({ comment: {
            ...result.rows[0],
            display_nickname: isVerifiedNickname ? formatDisplayName(nickname, activeTitle) : nickname,
            profile_image_url: profileImageUrl,
            is_verified_nickname: isVerifiedNickname
        } });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] POST /posts/:id/comments', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

const reportLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: '신고 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});

router.get('/blocks', requireAuth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT ub.blocked_id, u.nickname, ub.created_at
             FROM user_blocks ub
             JOIN users u ON u.id = ub.blocked_id
             WHERE ub.blocker_id = $1
             ORDER BY ub.created_at DESC`,
            [req.session.userId]
        );
        return res.json({ blocks: result.rows });
    } catch (err) {
        console.error('[community] GET /blocks', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.get('/users/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    if (!userId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        const result = await pool.query(
            `SELECT id, nickname, university, tier, exp, gold,
                    profile_image_url, status_emoji, status_message,
                    active_title, streak_count, streak_last_date,
                    mock_exam_score, score_status
             FROM users
             WHERE id = $1`,
            [userId]
        );

        if (!result.rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

        const row = result.rows[0];
        const safeUser = {
            id: row.id,
            nickname: row.nickname,
            display_nickname: formatDisplayName(row.nickname, row.active_title),
            university: row.university || '비공개',
            tier: row.tier || '브론즈',
            exp: Number(row.exp || 0),
            gold: Number(row.gold || 0),
            profile_image_url: normalizeProfileImageUrl(row.profile_image_url),
            status_emoji: row.status_emoji || '',
            status_message: row.status_message || '',
            active_title: row.active_title || null,
            streak_count: Number(row.streak_count || 0),
            streak_last_date: row.streak_last_date || null,
            score_status: row.score_status || null,
            mock_exam_score: row.score_status === 'approved' ? row.mock_exam_score : null,
        };

        return res.json({ user: safeUser });
    } catch (err) {
        console.error('[community] GET /users/:userId', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/blocks/:userId', requireAuth, requireLatestEula, async (req, res) => {
    const blockerId = req.session.userId;
    const blockedId = parseInt(req.params.userId, 10);
    if (!blockedId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (blockedId === blockerId) return res.status(400).json({ error: '자기 자신은 차단할 수 없습니다.' });

    try {
        const exists = await pool.query('SELECT id FROM users WHERE id = $1', [blockedId]);
        if (!exists.rows.length) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });

        await pool.query(
            `INSERT INTO user_blocks (blocker_id, blocked_id)
             VALUES ($1, $2)
             ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
            [blockerId, blockedId]
        );

        return res.json({ ok: true, blocked_id: blockedId });
    } catch (err) {
        console.error('[community] POST /blocks/:userId', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.delete('/blocks/:userId', requireAuth, async (req, res) => {
    const blockedId = parseInt(req.params.userId, 10);
    if (!blockedId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        await pool.query(
            'DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2',
            [req.session.userId, blockedId]
        );
        return res.json({ ok: true, blocked_id: blockedId });
    } catch (err) {
        console.error('[community] DELETE /blocks/:userId', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/posts/:id/report', requireAuth, requireLatestEula, reportLimiter, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const reporterId = req.session.userId;
    const reasonCode = String(req.body?.reason_code || '').trim();
    const detailRaw = req.body?.detail;
    const detail = typeof detailRaw === 'string' ? detailRaw.trim() : '';

    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!REPORT_REASON_CODES.has(reasonCode)) {
        return res.status(400).json({ error: '신고 사유가 올바르지 않습니다.' });
    }
    if (detail.length > 500) {
        return res.status(400).json({ error: '신고 상세 내용은 500자 이내로 입력해 주세요.' });
    }

    try {
        const postRes = await pool.query('SELECT id, user_id FROM community_posts WHERE id = $1', [postId]);
        if (!postRes.rows.length) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        const reportedUserId = postRes.rows[0].user_id || null;
        if (reportedUserId && reportedUserId === reporterId) {
            return res.status(400).json({ error: '본인 게시글은 신고할 수 없습니다.' });
        }

        await pool.query(
            `INSERT INTO community_post_reports (post_id, reporter_id, reported_user_id, reason_code, detail, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             ON CONFLICT (post_id, reporter_id)
             DO UPDATE SET
                reason_code = EXCLUDED.reason_code,
                detail = EXCLUDED.detail,
                status = 'pending',
                reviewed_at = NULL,
                reviewed_by = NULL,
                created_at = NOW()`,
            [postId, reporterId, reportedUserId, reasonCode, detail || null]
        );

        return res.status(201).json({ ok: true });
    } catch (err) {
        console.error('[community] POST /posts/:id/report', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/summary — 내 커뮤니티 활동 요약                     */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/summary', requireAuth, async (req, res) => {
    const userId = req.session.userId;

    try {
        const result = await pool.query(
            `SELECT
                (SELECT COUNT(*)::int FROM community_posts WHERE user_id = $1) AS posts_count,
                (SELECT COUNT(*)::int FROM community_comments WHERE user_id = $1) AS comments_count,
                (SELECT COALESCE(SUM(likes), 0)::int FROM community_posts WHERE user_id = $1) AS received_likes,
                (SELECT COUNT(*)::int FROM community_likes WHERE user_id = $1) AS liked_posts_count,
                (SELECT COUNT(*)::int FROM community_bookmarks WHERE user_id = $1) AS bookmarks_count`,
            [userId]
        );

        const row = result.rows[0] || {};
        return res.json({
            summary: {
                posts_count: Number(row.posts_count || 0),
                comments_count: Number(row.comments_count || 0),
                received_likes: Number(row.received_likes || 0),
                liked_posts_count: Number(row.liked_posts_count || 0),
                bookmarks_count: Number(row.bookmarks_count || 0),
            }
        });
    } catch (err) {
        console.error('[community] GET /me/summary', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/posts — 내가 작성한 게시글 목록                      */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/posts', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const filters = parseActivityFilters(req);

    try {
        const params = [userId];
        const conds = ['user_id = $1'];
        appendActivityFilters(conds, params, filters, {
            categoryColumn: 'category',
            dateColumn: 'created_at',
            textColumns: ['title', 'body'],
        });
        const where = `WHERE ${conds.join(' AND ')}`;

        const [countRes, listRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total FROM community_posts ${where}`,
                params
            ),
            pool.query(
                `SELECT id, category, title, likes, comments_count, views, created_at,
                        (image_url IS NOT NULL AND image_url <> '') AS has_image
                 FROM community_posts
                 ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        const total = Number(countRes.rows[0]?.total || 0);
        const posts = listRes.rows || [];
        return res.json({
            total,
            offset,
            limit,
            has_more: offset + posts.length < total,
            posts,
        });
    } catch (err) {
        console.error('[community] GET /me/posts', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/comments — 내가 작성한 댓글 목록                      */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/comments', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const filters = parseActivityFilters(req);

    try {
        const params = [userId];
        const conds = ['c.user_id = $1'];
        appendActivityFilters(conds, params, filters, {
            categoryColumn: 'p.category',
            dateColumn: 'c.created_at',
            textColumns: ['c.body', 'p.title'],
        });
        const where = `WHERE ${conds.join(' AND ')}`;

        const [countRes, listRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM community_comments c
                 JOIN community_posts p ON p.id = c.post_id
                 ${where}`,
                params
            ),
            pool.query(
                `SELECT c.id, c.post_id, c.body, c.created_at,
                        p.title AS post_title, p.category AS post_category
                 FROM community_comments c
                 JOIN community_posts p ON p.id = c.post_id
                 ${where}
                 ORDER BY c.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        const total = Number(countRes.rows[0]?.total || 0);
        const comments = listRes.rows || [];
        return res.json({
            total,
            offset,
            limit,
            has_more: offset + comments.length < total,
            comments,
        });
    } catch (err) {
        console.error('[community] GET /me/comments', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/liked-posts — 내가 추천한 게시글 목록                */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/liked-posts', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const filters = parseActivityFilters(req);

    try {
        const params = [userId];
        const conds = ['cl.user_id = $1'];
        appendActivityFilters(conds, params, filters, {
            categoryColumn: 'p.category',
            dateColumn: 'cl.created_at',
            textColumns: ['p.title', 'p.body'],
        });
        const where = `WHERE ${conds.join(' AND ')}`;

        const [countRes, listRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM community_likes cl
                 JOIN community_posts p ON p.id = cl.post_id
                 ${where}`,
                params
            ),
            pool.query(
                `SELECT p.id, p.category, p.title, p.likes, p.comments_count, p.views, p.created_at,
                        cl.created_at AS liked_at,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
                 FROM community_likes cl
                 JOIN community_posts p ON p.id = cl.post_id
                 ${where}
                 ORDER BY cl.created_at DESC, p.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        const total = Number(countRes.rows[0]?.total || 0);
        const posts = listRes.rows || [];
        return res.json({
            total,
            offset,
            limit,
            has_more: offset + posts.length < total,
            posts,
        });
    } catch (err) {
        console.error('[community] GET /me/liked-posts', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* GET /me/bookmarks — 내가 북마크한 게시글 목록                */
/* ════════════════════════════════════════════════════════════ */
router.get('/me/bookmarks', requireAuth, async (req, res) => {
    const userId = req.session.userId;
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const filters = parseActivityFilters(req);

    try {
        const params = [userId];
        const conds = ['cb.user_id = $1'];
        appendActivityFilters(conds, params, filters, {
            categoryColumn: 'p.category',
            dateColumn: 'cb.created_at',
            textColumns: ['p.title', 'p.body'],
        });
        const where = `WHERE ${conds.join(' AND ')}`;

        const [countRes, listRes] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM community_bookmarks cb
                 JOIN community_posts p ON p.id = cb.post_id
                 ${where}`,
                params
            ),
            pool.query(
                `SELECT p.id, p.category, p.title, p.likes, p.comments_count, p.views, p.created_at,
                        cb.created_at AS bookmarked_at,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
                 FROM community_bookmarks cb
                 JOIN community_posts p ON p.id = cb.post_id
                 ${where}
                 ORDER BY cb.created_at DESC, p.created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        const total = Number(countRes.rows[0]?.total || 0);
        const posts = listRes.rows || [];
        return res.json({
            total,
            offset,
            limit,
            has_more: offset + posts.length < total,
            posts,
        });
    } catch (err) {
        console.error('[community] GET /me/bookmarks', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /me/posts/:id — 내 게시글 삭제                         */
/* ════════════════════════════════════════════════════════════ */
router.delete('/me/posts/:id', requireAuth, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        const deleted = await pool.query(
            'DELETE FROM community_posts WHERE id = $1 AND user_id = $2 RETURNING id',
            [postId, userId]
        );

        if (!deleted.rows.length) {
            return res.status(404).json({ error: '내가 작성한 게시글을 찾을 수 없습니다.' });
        }

        return res.json({ ok: true, deleted_post_id: postId });
    } catch (err) {
        console.error('[community] DELETE /me/posts/:id', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /me/comments/:id — 내 댓글 삭제                        */
/* ════════════════════════════════════════════════════════════ */
router.delete('/me/comments/:id', requireAuth, async (req, res) => {
    const commentId = parseInt(req.params.id, 10);
    const userId = req.session.userId;
    if (!commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const deleted = await client.query(
            `DELETE FROM community_comments
             WHERE id = $1 AND user_id = $2
             RETURNING id, post_id`,
            [commentId, userId]
        );

        if (!deleted.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '내가 작성한 댓글을 찾을 수 없습니다.' });
        }

        const postId = deleted.rows[0].post_id;
        await client.query(
            'UPDATE community_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1',
            [postId]
        );

        await client.query('COMMIT');
        return res.json({ ok: true, deleted_comment_id: commentId, post_id: postId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] DELETE /me/comments/:id', err.message);
        return res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /posts/:id — 관리자 글 삭제                           */
/* ════════════════════════════════════════════════════════════ */
router.delete('/posts/:id', requireAdmin, async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        const result = await pool.query(
            'DELETE FROM community_posts WHERE id = $1 RETURNING id',
            [postId]
        );

        if (!result.rows.length) {
            return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        }

        res.json({ ok: true, deleted_post_id: postId });
    } catch (err) {
        console.error('[community] DELETE /posts/:id', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* DELETE /posts/:postId/comments/:commentId — 관리자 댓글 삭제 */
/* ════════════════════════════════════════════════════════════ */
router.delete('/posts/:postId/comments/:commentId', requireAdmin, async (req, res) => {
    const postId = parseInt(req.params.postId, 10);
    const commentId = parseInt(req.params.commentId, 10);
    if (!postId || !commentId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const deleted = await client.query(
            'DELETE FROM community_comments WHERE id = $1 AND post_id = $2 RETURNING id',
            [commentId, postId]
        );

        if (!deleted.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }

        await client.query(
            'UPDATE community_posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = $1',
            [postId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, deleted_comment_id: commentId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] DELETE /posts/:postId/comments/:commentId', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

module.exports = router;
