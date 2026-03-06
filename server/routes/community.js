/**
 * server/routes/community.js
 * 커뮤니티 게시판 API
 *
 * GET  /api/community/posts          - 목록 조회
 * GET  /api/community/posts/hot      - 베스트 (추천 Top 8)
 * POST /api/community/posts          - 글 작성 (auth)
 * POST /api/community/posts/:id/view - 조회수 +1
 * POST /api/community/posts/:id/like - 추천 토글 (auth)
 * GET  /api/community/posts/:id/comments  - 댓글 목록
 * POST /api/community/posts/:id/comments  - 댓글 작성 (auth)
 */

const router = require('express').Router();
const pool   = require('../db');

/* ── auth guard ─────────────────────────────────────────────── */
function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
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

    if (cat !== '전체' && VALID_CATS.has(cat)) {
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
                `SELECT id, category, title, nickname, ip_prefix,
                        views, likes, comments_count, created_at
                 FROM community_posts ${where}
                 ORDER BY created_at DESC
                 LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
                [...params, limit, offset]
            )
        ]);

        res.json({ total: parseInt(cntRes.rows[0].count), posts: postsRes.rows });
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
    const conds  = ['likes > 0'];

    if (cat !== '전체' && VALID_CATS.has(cat)) {
        params.push(cat);
        conds.push(`category = $${params.length}`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;

    try {
        const result = await pool.query(
            `SELECT id, category, title, nickname, ip_prefix,
                    views, likes, comments_count, created_at
             FROM community_posts ${where}
             ORDER BY likes DESC, created_at DESC
             LIMIT 8`,
            params
        );
        res.json({ posts: result.rows });
    } catch (err) {
        console.error('[community] GET /posts/hot', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

/* ════════════════════════════════════════════════════════════ */
/* POST /posts — 글 작성                                        */
/* ════════════════════════════════════════════════════════════ */
router.post('/posts', requireAuth, async (req, res) => {
    const { category, title, body = '' } = req.body;

    if (!title || !title.trim()) {
        return res.status(400).json({ error: '제목을 입력해 주세요.' });
    }
    if (title.trim().length > 200) {
        return res.status(400).json({ error: '제목은 200자 이내로 입력해 주세요.' });
    }
    if (!VALID_CATS.has(category)) {
        return res.status(400).json({ error: '카테고리가 올바르지 않습니다.' });
    }
    if (body.length > 5000) {
        return res.status(400).json({ error: '내용은 5,000자 이내로 입력해 주세요.' });
    }

    const ipPrefix = getIpPrefix(req);

    try {
        const userRes = await pool.query(
            'SELECT nickname FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!userRes.rows.length) return res.status(401).json({ error: '유효하지 않은 사용자입니다.' });
        const nickname = userRes.rows[0].nickname;

        const result = await pool.query(
            `INSERT INTO community_posts (user_id, category, title, body, ip_prefix, nickname)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, category, title, nickname, ip_prefix, views, likes, comments_count, created_at`,
            [req.session.userId, category, title.trim(), body.trim(), ipPrefix, nickname]
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
router.post('/posts/:id/view', async (req, res) => {
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
/* GET /posts/:id/comments — 댓글 목록                          */
/* ════════════════════════════════════════════════════════════ */
router.get('/posts/:id/comments', async (req, res) => {
    const postId = parseInt(req.params.id);
    if (!postId) return res.status(400).json({ error: '잘못된 요청입니다.' });

    try {
        const result = await pool.query(
            `SELECT id, nickname, ip_prefix, body, created_at
             FROM community_comments
             WHERE post_id = $1
             ORDER BY created_at ASC`,
            [postId]
        );
        res.json({ comments: result.rows });
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
            'SELECT nickname FROM users WHERE id = $1',
            [req.session.userId]
        );
        if (!userRes.rows.length) throw new Error('user not found');
        const nickname = userRes.rows[0].nickname;

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
        res.status(201).json({ comment: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[community] POST /posts/:id/comments', err.message);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    } finally {
        client.release();
    }
});

module.exports = router;
