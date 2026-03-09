/**
 * server/routes/community.js
 * 커뮤니티 게시판 API
 *
 * GET  /api/community/posts          - 목록 조회
 * GET  /api/community/posts/hot      - 베스트 (추천 Top 8)
 * POST /api/community/uploads/image  - 이미지 업로드 (auth)
 * POST /api/community/posts          - 글 작성 (auth)
 * POST /api/community/posts/:id/view - 조회수 +1
 * POST /api/community/posts/:id/like - 추천 토글 (auth)
 * POST /api/community/posts/:id/gold-like - 골드 추천 +1 (auth)
 * GET  /api/community/posts/:id/comments  - 댓글 목록
 * POST /api/community/posts/:id/comments  - 댓글 작성 (auth)
 */

const router = require('express').Router();
const pool   = require('../db');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { formatDisplayName } = require('../utils/progression');

const BEST_MIN_LIKES = 15;
const GOLD_LIKE_COST = 30;

const communityUploadDir = path.join(__dirname, '../../uploads/community');
if (!fs.existsSync(communityUploadDir)) {
    fs.mkdirSync(communityUploadDir, { recursive: true });
}

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
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    try {
        const [cntRes, postsRes] = await Promise.all([
            pool.query(`SELECT COUNT(*) FROM community_posts ${where}`, params),
            pool.query(
                `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix,
                        u.nickname AS user_nickname, u.active_title,
                        p.views, p.likes, p.comments_count, p.created_at,
                        p.image_url,
                        (p.image_url IS NOT NULL AND p.image_url <> '') AS has_image
                 FROM community_posts p
                 LEFT JOIN users u ON u.id = p.user_id
                 ${where.replace(/\btitle\b/g, 'p.title').replace(/\blikes\b/g, 'p.likes').replace(/\bcategory\b/g, 'p.category')}
                 ORDER BY p.created_at DESC
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
    const where = `WHERE ${conds.join(' AND ')}`;

    try {
        const result = await pool.query(
            `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix,
                    u.nickname AS user_nickname, u.active_title,
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

    try {
        const result = await pool.query(
            `SELECT p.id, p.category, p.title, p.body, p.image_url, p.link_url, p.nickname, p.ip_prefix,
                    u.nickname AS user_nickname, u.active_title,
                    p.views, p.likes, p.comments_count, p.created_at
             FROM community_posts p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.id = $1`,
            [id]
        );
        if (!result.rows.length) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
        const post = result.rows[0];
        post.display_nickname = post.active_title
            ? formatDisplayName(post.nickname, post.active_title)
            : post.nickname;
        res.json({ post });
    } catch (err) {
        console.error('[community] GET /posts/:id', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /uploads/image — 커뮤니티 이미지 업로드                */
/* ════════════════════════════════════════════════════════════ */
router.post('/uploads/image', requireAuth, (req, res) => {
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
/* POST /posts — 글 작성 (로그인 필수)                           */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts', requireAuth, async (req, res) => {
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

    const nickname = normalizeCommunityNickname(anonymous_nickname);
    if (nickname === null) {
        return res.status(400).json({ error: '익명 닉네임은 2~20자로 입력해 주세요.' });
    }

    const ipPrefix = getIpPrefix(req);

    try {
        let userId = null;
        if (req.session.userId) {
            const userRes = await pool.query('SELECT id FROM users WHERE id = $1', [req.session.userId]);
            if (userRes.rows.length) userId = req.session.userId;
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
router.post('/posts/:id/like', requireAuth, async (req, res) => {
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
router.post('/posts/:id/gold-like', requireAuth, async (req, res) => {
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
/* GET /posts/:id/comments — 댓글 목록                          */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/:id/comments', async (req, res) => {
    const postId = parseInt(req.params.id);
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        const result = await pool.query(
            `SELECT c.id, c.nickname, c.ip_prefix, c.body, c.created_at,
                    u.nickname AS user_nickname, u.active_title
             FROM community_comments c
             LEFT JOIN users u ON u.id = c.user_id
             WHERE c.post_id = $1
             ORDER BY c.created_at ASC`,
            [postId]
        );
        const comments = result.rows.map((row) => ({
            ...row,
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
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
    const postId = parseInt(req.params.id);
    const { body } = req.body;

    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });
    if (!body || !body.trim()) return res.status(400).json({ error: '내용을 입력해 주세요.' });
    if (body.trim().length > 1000) return res.status(400).json({ error: '댓글은 1,000자 이내로 입력해 주세요.' });

    const ipPrefix = getIpPrefix(req);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userRes = await client.query(
            'SELECT nickname, active_title FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!userRes.rows.length) throw new Error('user not found');
        const nickname = userRes.rows[0].nickname;
        const activeTitle = userRes.rows[0].active_title;

        const result = await client.query(
            `INSERT INTO community_comments (post_id, user_id, body, ip_prefix, nickname)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, nickname, ip_prefix, body, created_at`,
            [postId, req.session.userId, body.trim(), ipPrefix, nickname]
        );

        await client.query(
            'UPDATE community_posts SET comments_count = comments_count + 1 WHERE id = $1',
            [postId]
        );

        await client.query('COMMIT');
        res.status(201).json({ comment: {
            ...result.rows[0],
            display_nickname: formatDisplayName(nickname, activeTitle)
        } });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] POST /posts/:id/comments', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
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
