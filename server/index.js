const express = require('express');
const { createServer } = require('http');
const { Server: SocketServer } = require('socket.io');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const path = require('path');
const pool = require('./db');
const { initSchema } = require('./schema');
const worldManager = require('./world');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.SESSION_SECRET) {
    console.error('[FATAL] SESSION_SECRET 환경변수가 설정되지 않았습니다. 프로덕션 환경에서는 필수입니다.');
    process.exit(1);
}

if (isProduction && !process.env.USE_CLOUD_STORAGE) {
    console.warn('[WARNING] 파일 업로드가 로컬 디스크에 저장됩니다.');
    console.warn('[WARNING] Render 등 에페머럴 환경에서는 재배포 시 uploads/ 디렉토리의 모든 파일이 삭제됩니다.');
    console.warn('[WARNING] 프로덕션에서는 S3, Cloudinary 등 외부 오브젝트 스토리지 사용을 강력히 권장합니다.');
}

if (isProduction && !process.env.ALIGO_API_KEY) {
    console.warn('[WARNING] ALIGO_API_KEY가 설정되지 않았습니다. 전화번호 인증을 사용할 수 없습니다.');
}

const projectRoot = path.join(__dirname, '..');
const appIconSourcePath = path.join(projectRoot, 'IMG_0203.png');

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeXml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function jsonLdSafe(value) {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getSiteBaseUrl(req) {
    return (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function safeExternalUrl(value) {
    if (!value || typeof value !== 'string') return '';
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
        return parsed.toString();
    } catch (_) {
        return '';
    }
}

app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

if (isProduction && allowedOrigins.length === 0) {
    console.warn('[WARNING] CORS_ORIGIN 환경변수가 설정되지 않았습니다. 프로덕션에서 모든 cross-origin 요청이 차단됩니다.');
    console.warn('[WARNING] 예시: CORS_ORIGIN=https://path.sdij.cloud,https://www.path.sdij.cloud');
}

function corsOriginHandler(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) {
        return callback(null, !isProduction);
    }
    return callback(null, allowedOrigins.includes(origin));
}

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "wss:", "ws:", "https:"],
            workerSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isProduction ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: corsOriginHandler,
    credentials: true
}));

app.use(session({
    store: new pgSession({ pool, tableName: 'sessions' }),
    secret: process.env.SESSION_SECRET || (isProduction ? undefined : crypto.randomBytes(32).toString('hex')),
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: process.env.SESSION_SAME_SITE || 'lax',
        domain: process.env.SESSION_COOKIE_DOMAIN || undefined
    }
}));

// CSRF 보호: 상태 변경 요청(POST/PUT/DELETE)에 대해 Origin/Referer 헤더 검사
app.use((req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    // API가 아닌 경로는 건너뜀
    if (!req.path.startsWith('/api/')) return next();

    const origin = req.headers['origin'];
    const referer = req.headers['referer'];
    const host = req.get('host');

    // 같은 호스트 또는 허가된 Origin이면 통과
    if (origin) {
        try {
            const originHost = new URL(origin).host;
            if (originHost === host || allowedOrigins.some(o => new URL(o).host === originHost)) {
                return next();
            }
        } catch (_) {}
        // 개발 환경에서는 localhost 허용
        if (!isProduction) return next();
        return res.status(403).json({ error: '잘못된 요청 출처입니다.' });
    }

    if (referer) {
        try {
            const refHost = new URL(referer).host;
            if (refHost === host || allowedOrigins.some(o => new URL(o).host === refHost)) {
                return next();
            }
        } catch (_) {}
        if (!isProduction) return next();
        return res.status(403).json({ error: '잘못된 요청 출처입니다.' });
    }

    // Origin/Referer 없는 요청: 개발에서는 허용, 프로덕션에서는 차단
    if (!isProduction) return next();
    return res.status(403).json({ error: '잘못된 요청 출처입니다.' });
});

app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'path-api' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/study', require('./routes/study'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/estate', require('./routes/estate'));
app.use('/api/invasion', require('./routes/invasion'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/university', require('./routes/university'));
app.use('/api/cam', require('./routes/cam'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/community', require('./routes/community'));
app.use('/api/rooms', require('./routes/rooms'));

app.use('/uploads/scores/:filename', (req, res) => {
    res.redirect(`/api/auth/score-image/${req.params.filename}`);
});
app.use('/uploads/gpa/:filename', (req, res) => {
    res.redirect(`/api/auth/gpa-image/${req.params.filename}`);
});
app.use('/uploads/profiles/:filename', (req, res) => {
    res.redirect(`/api/auth/profile-image/${req.params.filename}`);
});
app.use('/uploads/study-proofs/:filename', (req, res) => {
    res.redirect(`/api/study/proof-image/${req.params.filename}`);
});
app.use('/uploads/community', express.static(path.join(projectRoot, 'uploads', 'community'), {
    maxAge: '30d',
    etag: true,
}));

const staticOptions = {
    maxAge: '1d',
    etag: true,
    index: 'index.html'
};

// Safari/edge CDN combinations can keep stale app-shell files despite query params.
// For route entrypoints and their JS/CSS, disable caching completely.
const noCacheStaticOptions = {
    maxAge: 0,
    etag: false,
    index: 'index.html',
    setHeaders(res) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
    }
};

// ── PWA: Service Worker (must be at root scope, no-cache) ──────────────────
app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(projectRoot, 'P.A.T.H', 'sw.js'));
});

// ── PWA: Manifest (short-lived cache) ──────────────────────────────────────
app.get('/manifest.json', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Type', 'application/manifest+json');
    res.sendFile(path.join(projectRoot, 'P.A.T.H', 'manifest.json'));
});

// Use a single master image for PWA icon aliases.
app.get('/app-icon.png', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.type('png');
    res.sendFile(appIconSourcePath);
});

app.get('/icons/:filename', (req, res, next) => {
    const filename = String(req.params.filename || '');
    if (!/^icon-(72|96|128|144|152|192|384|512)\.png$/.test(filename)) {
        return next();
    }

    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.type('png');
    return res.sendFile(appIconSourcePath);
});

// ── PWA: Icons (long-lived cache) ──────────────────────────────────────────
app.use('/icons', express.static(path.join(projectRoot, 'P.A.T.H', 'icons'), {
    maxAge: '30d',
    etag: true,
}));

// ── PWA: Install helper script (no-cache) ──────────────────────────────────
app.get('/pwa-install.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(projectRoot, 'P.A.T.H', 'pwa-install.js'));
});

// Public URL mounts (hide internal folder structure from browser address bar)
app.use('/assets', express.static(path.join(projectRoot, 'P.A.T.H', 'assets'), staticOptions));
app.use('/shared', express.static(path.join(projectRoot, 'P.A.T.H', 'shared'), staticOptions));
app.use('/login', express.static(path.join(projectRoot, 'P.A.T.H', 'login'), noCacheStaticOptions));
app.use('/mainHub', express.static(path.join(projectRoot, 'P.A.T.H', 'mainHub'), noCacheStaticOptions));
app.use('/timer', express.static(path.join(projectRoot, 'P.A.T.H', 'mainPageDev'), noCacheStaticOptions));
app.use('/community', express.static(path.join(projectRoot, 'P.A.T.H', 'community'), noCacheStaticOptions));
app.use('/setup-profile', express.static(path.join(projectRoot, 'P.A.T.H', 'setup-profile'), noCacheStaticOptions));
app.use('/admin', express.static(path.join(projectRoot, 'P.A.T.H', 'admin'), noCacheStaticOptions));
app.use('/legal', express.static(path.join(projectRoot, 'P.A.T.H', 'legal'), staticOptions));

app.get('/community/post/:id', async (req, res) => {
    const postId = parseInt(req.params.id, 10);
    if (!postId) {
        return res.status(400).type('text/html').send('<h1>잘못된 요청</h1>');
    }

    try {
        const [postResult, commentsResult] = await Promise.all([
            pool.query(
                `SELECT id, category, title, body, image_url, link_url, nickname, views, likes, comments_count, created_at
                 FROM community_posts
                 WHERE id = $1`,
                [postId]
            ),
            pool.query(
                `SELECT id, nickname, body, created_at
                 FROM community_comments
                 WHERE post_id = $1
                 ORDER BY created_at DESC
                 LIMIT 5`,
                [postId]
            )
        ]);

        if (!postResult.rows.length) {
            return res.status(404).type('text/html').send('<h1>게시글을 찾을 수 없습니다.</h1>');
        }

        const post = postResult.rows[0];
        const comments = commentsResult.rows;
        const baseUrl = getSiteBaseUrl(req);
        const canonical = `${baseUrl}/community/post/${post.id}`;
        const safeImageUrl = safeExternalUrl(post.image_url);
        const safeLinkUrl = safeExternalUrl(post.link_url);
        const title = `${post.title} | 입시 커뮤니티 - P.A.T.H`;
        const bodyPreview = (post.body || '').trim().replace(/\s+/g, ' ').slice(0, 150);
        const description = bodyPreview
            ? `${bodyPreview}...`
            : `${post.category} 카테고리의 수험생 커뮤니티 게시글`;
        const publishedIso = new Date(post.created_at).toISOString();

        const postSchema = {
            '@context': 'https://schema.org',
            '@type': 'DiscussionForumPosting',
            mainEntityOfPage: canonical,
            headline: post.title,
            articleBody: post.body || '',
            inLanguage: 'ko',
            datePublished: publishedIso,
            dateModified: publishedIso,
            author: {
                '@type': 'Person',
                name: post.nickname || '익명'
            },
            publisher: {
                '@type': 'Organization',
                name: 'P.A.T.H'
            },
            interactionStatistic: [
                {
                    '@type': 'InteractionCounter',
                    interactionType: { '@type': 'ViewAction' },
                    userInteractionCount: post.views || 0
                },
                {
                    '@type': 'InteractionCounter',
                    interactionType: { '@type': 'LikeAction' },
                    userInteractionCount: post.likes || 0
                },
                {
                    '@type': 'InteractionCounter',
                    interactionType: { '@type': 'CommentAction' },
                    userInteractionCount: post.comments_count || 0
                }
            ]
        };

        const commentSchema = comments.map((comment) => ({
            '@type': 'Comment',
            text: comment.body || '',
            dateCreated: new Date(comment.created_at).toISOString(),
            author: {
                '@type': 'Person',
                name: comment.nickname || '익명'
            }
        }));
        if (commentSchema.length) {
            postSchema.comment = commentSchema;
        }

        const commentsHtml = comments.length
            ? comments.map((comment) => `
      <li class="comment-item">
        <div class="comment-meta">${escapeHtml(comment.nickname || '익명')} · ${escapeHtml(new Date(comment.created_at).toLocaleString('ko-KR'))}</div>
        <p class="comment-body">${escapeHtml(comment.body || '')}</p>
      </li>`).join('')
            : '<li class="comment-empty">아직 댓글이 없습니다.</li>';

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="P.A.T.H">
    ${safeImageUrl ? `<meta property="og:image" content="${escapeHtml(safeImageUrl)}">` : ''}
  <meta property="article:published_time" content="${escapeHtml(publishedIso)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(post.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <script type="application/ld+json">${jsonLdSafe(postSchema)}</script>
  <style>
    body{font-family:'Pretendard Variable','Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f8fc;color:#172038;max-width:780px;margin:0 auto;padding:24px 16px 60px;line-height:1.65}
    a{color:#1d4ed8;text-decoration:none}
    .meta{font-size:13px;color:#59657d;margin-bottom:12px}
    .title{font-size:28px;line-height:1.35;margin:0 0 8px;font-weight:800}
    .chip{display:inline-block;padding:2px 10px;border-radius:999px;background:#e9eef8;font-size:12px;font-weight:700;color:#2e3d5c;margin-right:8px}
    .card{background:#fff;border:1px solid rgba(23,32,56,.1);border-radius:14px;padding:18px 20px;white-space:pre-wrap;word-break:break-word}
    .thumb{margin:0 0 12px;border:1px solid rgba(23,32,56,.12);border-radius:12px;overflow:hidden;background:#edf2fa}
    .thumb img{display:block;width:100%;max-height:420px;object-fit:cover}
    .outlink{display:inline-flex;margin:14px 0 0;font-size:14px;font-weight:600}
    .stats{display:flex;gap:14px;font-size:13px;color:#44526e;margin:16px 0 22px}
        .topnav{margin-bottom:18px}
        .comments{margin-top:28px}
        .comments h2{font-size:18px;margin:0 0 10px;font-weight:800}
        .comment-list{list-style:none;padding:0;margin:0;border-top:1px solid rgba(23,32,56,.11)}
        .comment-item{padding:14px 2px;border-bottom:1px solid rgba(23,32,56,.08)}
        .comment-meta{font-size:12px;color:#5a6781;margin-bottom:6px}
        .comment-body{margin:0;font-size:14px;line-height:1.6;color:#1a2742;white-space:pre-wrap;word-break:break-word}
        .comment-empty{padding:14px 2px;color:#5a6781;font-size:13px}
  </style>
</head>
<body>
  <div class="topnav"><a href="/community/">← 커뮤니티 목록으로</a></div>
  <h1 class="title">${escapeHtml(post.title)}</h1>
  <div class="meta"><span class="chip">${escapeHtml(post.category || '전체')}</span>작성자 ${escapeHtml(post.nickname || '익명')} · ${escapeHtml(new Date(post.created_at).toLocaleString('ko-KR'))}</div>
    ${safeImageUrl ? `<div class="thumb"><img src="${escapeHtml(safeImageUrl)}" alt="첨부 이미지" loading="lazy"></div>` : ''}
  <div class="card">${escapeHtml(post.body || '(내용 없음)')}</div>
    ${safeLinkUrl ? `<a class="outlink" href="${escapeHtml(safeLinkUrl)}" target="_blank" rel="noopener noreferrer nofollow">🔗 첨부 링크 열기</a>` : ''}
  <div class="stats"><span>조회 ${post.views || 0}</span><span>추천 ${post.likes || 0}</span><span>댓글 ${post.comments_count || 0}</span></div>
    <section class="comments" aria-label="댓글 프리뷰">
        <h2>댓글 프리뷰</h2>
        <ul class="comment-list">${commentsHtml}</ul>
    </section>
</body>
</html>`;

        return res.type('text/html').send(html);
    } catch (err) {
        console.error('[seo] GET /community/post/:id', err.message);
        return res.status(500).type('text/html').send('<h1>서버 오류</h1>');
    }
});

// ── Group timer room invite page with OG tags ────────────────────────────────
const roomInviteLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
});
app.get('/room/:code', roomInviteLimiter, async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase().slice(0, 12);
    if (!code) return res.status(400).type('text/html').send('<h1>잘못된 요청</h1>');

    try {
        const result = await pool.query(
            `SELECT r.id, r.name, r.goal, r.invite_code, r.max_members,
                    u.nickname AS creator_nickname,
                    (SELECT COUNT(*) FROM study_room_members m WHERE m.room_id = r.id) AS member_count,
                    (SELECT COUNT(*) FROM study_room_members m2
                     JOIN users u2 ON u2.id = m2.user_id
                     WHERE m2.room_id = r.id AND u2.is_studying = TRUE) AS active_count
             FROM study_rooms r
             JOIN users u ON u.id = r.creator_id
             WHERE r.invite_code = $1 AND r.is_active = TRUE`,
            [code]
        );

        const baseUrl = getSiteBaseUrl(req);
        const canonical = `${baseUrl}/room/${code}`;

        if (!result.rows.length) {
            const html = `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>방을 찾을 수 없습니다 - P.A.T.H</title>
<meta name="robots" content="noindex">
<style>body{font-family:sans-serif;text-align:center;padding:60px 20px;background:#0d0d0d;color:#fff}</style>
</head><body><h1>방을 찾을 수 없습니다</h1><p>초대 링크가 만료되었거나 잘못된 링크입니다.</p>
<a href="/timer/" style="color:#d4af37">타이머 페이지로 이동 →</a></body></html>`;
            return res.status(404).type('text/html').send(html);
        }

        const room = result.rows[0];
        const memberCount = parseInt(room.member_count, 10);
        const activeCount = parseInt(room.active_count, 10);
        const maxMembers = room.max_members;
        const roomName = room.name;
        const goal = room.goal || '';

        const fireEmoji = activeCount > 0 ? '🔥' : '📚';
        const statusText = activeCount > 0 ? `[${fireEmoji}불타는 중]` : '[📚준비 중]';
        const ogTitle = `${statusText} ${escapeHtml(roomName)} (${memberCount}/${maxMembers}명)`;
        const ogDescription = activeCount > 0
            ? `지금 ${activeCount}명이 실시간으로 달리고 있습니다. 합류하시겠습니까?`
            : `${goal ? escapeHtml(goal) : '목표를 향해 함께 공부하는 방'} - P.A.T.H 그룹 타이머`;
        const ogImage = `${baseUrl}/icons/icon-512.png`;

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${ogTitle} | P.A.T.H</title>
  <meta name="description" content="${escapeHtml(ogDescription)}">
  <meta name="robots" content="noindex">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="P.A.T.H">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#0d0d0d;color:#f0f0f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .card{background:#151515;border:1px solid #2a2a2a;border-radius:20px;padding:36px 28px;max-width:440px;width:100%;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,.5)}
    .badge{display:inline-block;background:#1a1a2e;color:#d4af37;border:1px solid #d4af37;border-radius:999px;padding:4px 14px;font-size:12px;font-weight:700;letter-spacing:1px;margin-bottom:16px}
    h1{font-size:22px;font-weight:800;color:#fff;margin-bottom:8px;line-height:1.4}
    .goal{color:#888;font-size:14px;margin-bottom:20px;line-height:1.5}
    .stats{display:flex;gap:12px;justify-content:center;margin-bottom:24px}
    .stat{background:#1e1e1e;border-radius:12px;padding:12px 18px;flex:1}
    .stat-val{font-size:22px;font-weight:800;color:#d4af37}
    .stat-label{font-size:11px;color:#666;margin-top:2px}
    .active-pill{display:inline-flex;align-items:center;gap:6px;background:#1a2e1a;color:#4caf50;border:1px solid #4caf50;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:600;margin-bottom:24px}
    .active-dot{width:8px;height:8px;background:#4caf50;border-radius:50%;animation:pulse 1.2s ease-in-out infinite}
    @keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
    .join-btn{display:block;width:100%;background:linear-gradient(135deg,#d4af37,#f0c040);color:#000;border:none;border-radius:12px;padding:16px;font-size:17px;font-weight:800;cursor:pointer;text-decoration:none;margin-bottom:12px;transition:opacity .2s}
    .join-btn:hover{opacity:.9}
    .login-note{font-size:12px;color:#555}
    .creator{font-size:12px;color:#555;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">P.A.T.H 그룹 타이머</div>
    <h1>${escapeHtml(roomName)}</h1>
    ${goal ? `<p class="goal">${escapeHtml(goal)}</p>` : ''}
    <div class="stats">
      <div class="stat"><div class="stat-val">${memberCount}</div><div class="stat-label">참여 중</div></div>
      <div class="stat"><div class="stat-val">${maxMembers}</div><div class="stat-label">최대 인원</div></div>
      <div class="stat"><div class="stat-val">${activeCount}</div><div class="stat-label">지금 공부 중</div></div>
    </div>
    ${activeCount > 0 ? `<div class="active-pill"><span class="active-dot"></span>${activeCount}명 실시간으로 달리는 중</div>` : ''}
    <a class="join-btn" href="/timer/?join=${encodeURIComponent(code)}">⚔️ 방 합류하기</a>
    <div class="login-note">로그인이 필요합니다. 계정이 없으면 회원가입 후 이용하세요.</div>
    <div class="creator">방장: ${escapeHtml(room.creator_nickname)}</div>
  </div>
  <script>
    // If user lands here from KakaoTalk/external, redirect to timer join page
    // This allows the page to serve OG tags while still functioning as a join gateway
  </script>
</body>
</html>`;

        return res.type('text/html').send(html);
    } catch (err) {
        console.error('[room] GET /room/:code', err.message);
        return res.status(500).type('text/html').send('<h1>서버 오류</h1>');
    }
});

app.get('/robots.txt', (req, res) => {
    const baseUrl = getSiteBaseUrl(req);

        res.type('text/plain').send([
                'User-agent: *',
                'Allow: /',
                'Disallow: /api/',
                `Sitemap: ${baseUrl}/sitemap.xml`,
                ''
        ].join('\n'));
});

app.get('/sitemap.xml', async (req, res) => {
    const baseUrl = getSiteBaseUrl(req);
        const now = new Date().toISOString();

        let postRows = [];
        try {
            const posts = await pool.query(
                `SELECT id, created_at
                 FROM community_posts
                 ORDER BY created_at DESC
                 LIMIT 500`
            );
            postRows = posts.rows;
        } catch (err) {
            console.error('[seo] sitemap community posts', err.message);
        }

        const postUrls = postRows.map((row) => `
    <url>
        <loc>${escapeXml(`${baseUrl}/community/post/${row.id}`)}</loc>
        <lastmod>${escapeXml(new Date(row.created_at).toISOString())}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`).join('');

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${baseUrl}/community/</loc>
        <lastmod>${now}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${baseUrl}/login/</loc>
        <lastmod>${now}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>
    ${postUrls}
</urlset>`;

        res.type('application/xml').send(xml);
});

// Legacy URL compatibility: redirect old internal paths to clean public paths
app.get('/P.A.T.H/login', (_req, res) => res.redirect(301, '/login/'));
app.get('/P.A.T.H/login/', (_req, res) => res.redirect(301, '/login/'));
app.get('/P.A.T.H/login/index.html', (_req, res) => res.redirect(301, '/login/'));

app.get('/P.A.T.H/mainHub', (_req, res) => res.redirect(301, '/mainHub/'));
app.get('/P.A.T.H/mainHub/', (_req, res) => res.redirect(301, '/mainHub/'));
app.get('/P.A.T.H/mainHub/index.html', (_req, res) => res.redirect(301, '/mainHub/'));

app.get('/P.A.T.H/mainPageDev', (_req, res) => res.redirect(301, '/timer/'));
app.get('/P.A.T.H/mainPageDev/', (_req, res) => res.redirect(301, '/timer/'));
app.get('/P.A.T.H/mainPageDev/index.html', (_req, res) => res.redirect(301, '/timer/'));

app.get('/P.A.T.H/community', (_req, res) => res.redirect(301, '/community/'));
app.get('/P.A.T.H/community/', (_req, res) => res.redirect(301, '/community/'));
app.get('/P.A.T.H/community/index.html', (_req, res) => res.redirect(301, '/community/'));

app.get('/P.A.T.H/setup-profile', (_req, res) => res.redirect(301, '/setup-profile/'));
app.get('/P.A.T.H/setup-profile/', (_req, res) => res.redirect(301, '/setup-profile/'));
app.get('/P.A.T.H/setup-profile/index.html', (_req, res) => res.redirect(301, '/setup-profile/'));

app.get('/P.A.T.H/admin', (_req, res) => res.redirect(301, '/admin/'));
app.get('/P.A.T.H/admin/', (_req, res) => res.redirect(301, '/admin/'));
app.get('/P.A.T.H/admin/index.html', (_req, res) => res.redirect(301, '/admin/'));

app.get('/', (_req, res) => {
    res.redirect('/login/');
});

initSchema()
    .then(() => {
        const httpServer = createServer(app);

        const io = new SocketServer(httpServer, {
            cors: {
                origin: corsOriginHandler,
                credentials: true,
            },
            transports: ['websocket', 'polling'],
        });
        app.set('io', io);
        worldManager.setup(io);

        httpServer.listen(PORT, '0.0.0.0', () => {
            console.log(`P.A.T.H 서버 실행 중 - http://0.0.0.0:${PORT}`);
        });
    })
    .catch(err => {
        console.error('서버 시작 실패 (DB 초기화 오류):', err.message);
        process.exit(1);
    });
