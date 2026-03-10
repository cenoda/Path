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
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect(`/api/auth/score-image/${req.params.filename}`);
});
app.use('/uploads/gpa/:filename', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect(`/api/auth/gpa-image/${req.params.filename}`);
});
app.use('/uploads/profiles/:filename', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect(`/api/auth/profile-image/${req.params.filename}`);
});
app.use('/uploads/messages/:filename', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.redirect(`/api/messages/file/${req.params.filename}`);
});
app.use('/uploads/study-proofs/:filename', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
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

/** Build a 1200×630 SVG card for use as og:image */
function buildRoomOgSvg(roomName, goal, memberCount, maxMembers, activeCount, creatorNickname) {
    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const isActive = activeCount > 0;

    // Truncate long text for SVG
    const displayName = roomName.length > 22 ? roomName.slice(0, 22) + '…' : roomName;
    const displayGoal = goal && goal.length > 44 ? goal.slice(0, 44) + '…' : (goal || '');

    const statusLabel = isActive ? `🔥 ${activeCount}명 공부 중` : '📚 함께 공부해요';
    const statusBg = isActive ? '#0a2e1a' : '#0a1a2e';
    const statusColor = isActive ? '#00C471' : '#3182F6';
    const statusBorder = isActive ? '#00C471' : '#3182F6';

    const memberPct = maxMembers > 0 ? Math.round((memberCount / maxMembers) * 100) : 0;
    const barWidth = Math.round(8.8 * memberPct); // 880px = 100%

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0D1B2A"/>
      <stop offset="100%" stop-color="#111827"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3182F6"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>
    <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#3182F6"/>
      <stop offset="100%" stop-color="#60A5FA"/>
    </linearGradient>
    <filter id="cardShadow" x="-5%" y="-5%" width="110%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="24" flood-color="#000" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bgGrad)"/>

  <!-- Subtle grid dots -->
  <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
    <circle cx="20" cy="20" r="1" fill="#ffffff" opacity="0.04"/>
  </pattern>
  <rect width="1200" height="630" fill="url(#dots)"/>

  <!-- Top accent bar -->
  <rect x="0" y="0" width="1200" height="5" fill="url(#accentGrad)"/>

  <!-- Main card -->
  <rect x="80" y="70" width="1040" height="490" rx="28" fill="#161F2E" filter="url(#cardShadow)"/>

  <!-- Card inner accent line -->
  <rect x="80" y="70" width="1040" height="5" rx="3" fill="url(#accentGrad)" opacity="0.6"/>

  <!-- P.A.T.H wordmark -->
  <text x="120" y="148" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="13" font-weight="700" letter-spacing="5" fill="#3182F6">P.A.T.H</text>
  <text x="193" y="148" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="13" fill="#4B5563" letter-spacing="0.5">그룹 타이머</text>

  <!-- Separator -->
  <line x1="120" y1="162" x2="1080" y2="162" stroke="#1E2D40" stroke-width="1"/>

  <!-- Status badge -->
  <rect x="120" y="184" width="220" height="36" rx="18" fill="${statusBg}" stroke="${statusBorder}" stroke-width="1.5"/>
  <text x="230" y="207" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="14" font-weight="600" fill="${statusColor}" text-anchor="middle">${esc(statusLabel)}</text>

  <!-- Room name -->
  <text x="120" y="282" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="52" font-weight="800" fill="#F9FAFB" letter-spacing="-1.5">${esc(displayName)}</text>

  <!-- Goal text -->
  ${displayGoal ? `<text x="120" y="326" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="20" fill="#6B7280" letter-spacing="-0.3">${esc(displayGoal)}</text>` : ''}

  <!-- Divider -->
  <line x1="120" y1="${displayGoal ? 358 : 342}" x2="1080" y2="${displayGoal ? 358 : 342}" stroke="#1E2D40" stroke-width="1"/>

  <!-- Stats row -->
  <g transform="translate(120, ${displayGoal ? 385 : 369})">
    <!-- Members stat -->
    <rect x="0" y="0" width="230" height="100" rx="16" fill="#1A2438"/>
    <text x="115" y="45" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="36" font-weight="800" fill="#F9FAFB" text-anchor="middle">${memberCount}</text>
    <text x="115" y="72" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="13" fill="#6B7280" text-anchor="middle">현재 참여 인원</text>

    <!-- Active stat -->
    <rect x="250" y="0" width="230" height="100" rx="16" fill="${isActive ? '#0a2416' : '#1A2438'}"/>
    <text x="365" y="45" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="36" font-weight="800" fill="${isActive ? '#00C471' : '#4B5563'}" text-anchor="middle">${activeCount}</text>
    <text x="365" y="72" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="13" fill="${isActive ? '#00C471' : '#6B7280'}" text-anchor="middle">지금 공부 중</text>

    <!-- Max stat -->
    <rect x="500" y="0" width="230" height="100" rx="16" fill="#1A2438"/>
    <text x="615" y="45" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="36" font-weight="800" fill="#F9FAFB" text-anchor="middle">${maxMembers}</text>
    <text x="615" y="72" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="13" fill="#6B7280" text-anchor="middle">최대 인원</text>
  </g>

  <!-- Progress bar label -->
  <text x="120" y="512" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="12" fill="#4B5563" letter-spacing="0.3">참여율 ${memberPct}%</text>
  <text x="1080" y="512" font-family="'SF Pro Display','Segoe UI',-apple-system,sans-serif" font-size="12" fill="#4B5563" text-anchor="end">방장: ${esc(creatorNickname)}</text>

  <!-- Progress bar track -->
  <rect x="120" y="520" width="880" height="6" rx="3" fill="#1E2D40"/>
  <!-- Progress bar fill -->
  ${barWidth > 0 ? `<rect x="120" y="520" width="${barWidth}" height="6" rx="3" fill="url(#barGrad)"/>` : ''}
</svg>`;
}

async function fetchRoomForInvite(code) {
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
    return result.rows[0] || null;
}

/** Dynamic OG image endpoint */
app.get('/room/:code/card.svg', roomInviteLimiter, async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase().slice(0, 12);
    if (!code) return res.status(400).end();

    try {
        const room = await fetchRoomForInvite(code);
        if (!room) return res.status(404).end();

        const svg = buildRoomOgSvg(
            room.name,
            room.goal || '',
            parseInt(room.member_count, 10),
            room.max_members,
            parseInt(room.active_count, 10),
            room.creator_nickname
        );

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
        return res.send(svg);
    } catch (err) {
        console.error('[room] GET /room/:code/card.svg', err.message);
        return res.status(500).end();
    }
});

app.get('/room/:code', roomInviteLimiter, async (req, res) => {
    const code = String(req.params.code || '').trim().toLowerCase().slice(0, 12);
    if (!code) return res.status(400).type('text/html').send('<h1>잘못된 요청</h1>');

    try {
        const room = await fetchRoomForInvite(code);

        const baseUrl = getSiteBaseUrl(req);
        const canonical = `${baseUrl}/room/${code}`;

        if (!room) {
            const html = `<!DOCTYPE html><html lang="ko"><head>
<meta charset="UTF-8"><title>방을 찾을 수 없습니다 — P.A.T.H</title>
<meta name="robots" content="noindex">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Apple SD Gothic Neo',-apple-system,BlinkMacSystemFont,'Malgun Gothic',sans-serif;background:#F9FAFB;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:24px;padding:48px 32px;max-width:400px;width:100%;text-align:center;box-shadow:0 2px 24px rgba(0,0,0,.08)}
.icon{font-size:48px;margin-bottom:16px}
h1{font-size:20px;font-weight:700;color:#191F28;margin-bottom:8px}
p{font-size:14px;color:#8B95A1;line-height:1.6;margin-bottom:24px}
a{display:inline-block;background:#3182F6;color:#fff;text-decoration:none;border-radius:12px;padding:13px 28px;font-size:15px;font-weight:700}
</style>
</head><body>
<div class="card">
  <div class="icon">🔍</div>
  <h1>방을 찾을 수 없어요</h1>
  <p>초대 링크가 만료되었거나<br>잘못된 링크입니다.</p>
  <a href="/timer/">P.A.T.H 열기</a>
</div>
</body></html>`;
            return res.status(404).type('text/html').send(html);
        }

        const memberCount = parseInt(room.member_count, 10);
        const activeCount = parseInt(room.active_count, 10);
        const maxMembers = room.max_members;
        const roomName = room.name;
        const goal = room.goal || '';
        const isActive = activeCount > 0;

        const ogTitle = isActive
            ? `🔥 ${roomName} — 지금 ${activeCount}명 공부 중!`
            : `📚 ${roomName} — 함께 공부해요`;
        const ogDescription = isActive
            ? `${goal ? goal + ' · ' : ''}${memberCount}/${maxMembers}명 참여 중 · 지금 ${activeCount}명이 달리고 있어요. 합류하시겠어요?`
            : `${goal ? goal + ' · ' : ''}${memberCount}/${maxMembers}명 참여 중 · P.A.T.H 그룹 타이머에서 함께 공부해요.`;
        const ogImage = `${baseUrl}/room/${encodeURIComponent(code)}/card.svg`;

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(ogTitle)} | P.A.T.H</title>
  <meta name="description" content="${escapeHtml(ogDescription)}">
  <meta name="robots" content="noindex">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="P.A.T.H">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDescription)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:image:type" content="image/svg+xml">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDescription)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">

  <link rel="canonical" href="${escapeHtml(canonical)}">

  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Apple SD Gothic Neo',-apple-system,BlinkMacSystemFont,'Malgun Gothic','Noto Sans KR',sans-serif;
      background:#F2F4F6;
      min-height:100vh;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      padding:24px;
      -webkit-font-smoothing:antialiased;
    }

    /* Card */
    .card{
      background:#fff;
      border-radius:28px;
      padding:0;
      max-width:420px;
      width:100%;
      box-shadow:0 4px 32px rgba(0,0,0,.1);
      overflow:hidden;
    }

    /* Card header strip */
    .card-header{
      background:linear-gradient(135deg,#0D1B2A 0%,#1a2535 100%);
      padding:28px 28px 24px;
      position:relative;
      overflow:hidden;
    }
    .card-header::before{
      content:'';
      position:absolute;
      top:0;left:0;right:0;
      height:3px;
      background:linear-gradient(90deg,#3182F6,#60A5FA);
    }

    .brand{
      display:flex;
      align-items:center;
      gap:6px;
      margin-bottom:18px;
    }
    .brand-logo{
      font-size:11px;
      font-weight:800;
      letter-spacing:4px;
      color:#3182F6;
    }
    .brand-sep{
      width:1px;height:12px;background:#2a3a4a;
    }
    .brand-text{
      font-size:11px;
      color:#4B5563;
      letter-spacing:0.5px;
    }

    .status-pill{
      display:inline-flex;
      align-items:center;
      gap:6px;
      padding:5px 12px;
      border-radius:50px;
      font-size:12px;
      font-weight:700;
      margin-bottom:12px;
      background:${isActive ? 'rgba(0,196,113,0.15)' : 'rgba(49,130,246,0.15)'};
      color:${isActive ? '#00C471' : '#3182F6'};
      border:1px solid ${isActive ? 'rgba(0,196,113,0.4)' : 'rgba(49,130,246,0.4)'};
    }
    .status-dot{
      width:6px;height:6px;border-radius:50%;
      background:${isActive ? '#00C471' : '#3182F6'};
      ${isActive ? 'animation:pulse 1.4s ease-in-out infinite;' : ''}
    }
    @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}

    .room-name{
      font-size:24px;
      font-weight:800;
      color:#F9FAFB;
      line-height:1.25;
      letter-spacing:-0.5px;
      margin-bottom:6px;
      word-break:keep-all;
    }
    .room-goal{
      font-size:14px;
      color:#6B7280;
      letter-spacing:-0.1px;
      line-height:1.5;
    }

    /* Card body */
    .card-body{
      padding:24px 28px;
    }

    /* Stats */
    .stats{
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:10px;
      margin-bottom:20px;
    }
    .stat{
      background:#F9FAFB;
      border-radius:16px;
      padding:14px 8px 12px;
      text-align:center;
    }
    .stat-val{
      font-size:26px;
      font-weight:800;
      color:#191F28;
      line-height:1;
      margin-bottom:5px;
    }
    .stat-val.active{color:#00C471}
    .stat-label{
      font-size:11px;
      color:#8B95A1;
      font-weight:500;
    }

    /* Progress bar */
    .progress-wrap{
      margin-bottom:24px;
    }
    .progress-meta{
      display:flex;
      justify-content:space-between;
      font-size:12px;
      color:#8B95A1;
      margin-bottom:6px;
    }
    .progress-track{
      height:6px;
      background:#F2F4F6;
      border-radius:3px;
      overflow:hidden;
    }
    .progress-fill{
      height:100%;
      width:${Math.round((memberCount / maxMembers) * 100)}%;
      background:linear-gradient(90deg,#3182F6,#60A5FA);
      border-radius:3px;
      transition:width .4s ease;
    }

    /* CTA */
    .join-btn{
      display:flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      width:100%;
      background:#3182F6;
      color:#fff;
      text-decoration:none;
      border-radius:14px;
      padding:16px;
      font-size:16px;
      font-weight:700;
      letter-spacing:-0.2px;
      transition:background .15s, transform .1s, box-shadow .15s;
      box-shadow:0 4px 16px rgba(49,130,246,.3);
    }
    .join-btn:hover{background:#1b64da;box-shadow:0 6px 20px rgba(49,130,246,.4)}
    .join-btn:active{transform:scale(.98)}

    .join-note{
      text-align:center;
      font-size:12px;
      color:#AEB5C0;
      margin-top:12px;
    }

    /* Footer */
    .card-footer{
      padding:14px 28px;
      border-top:1px solid #F2F4F6;
      display:flex;
      align-items:center;
      justify-content:space-between;
    }
    .creator-info{
      font-size:12px;
      color:#AEB5C0;
    }
    .path-mark{
      font-size:11px;
      font-weight:700;
      letter-spacing:2px;
      color:#D1D5DB;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="brand">
        <span class="brand-logo">P.A.T.H</span>
        <span class="brand-sep"></span>
        <span class="brand-text">그룹 타이머</span>
      </div>

      <div class="status-pill">
        <span class="status-dot"></span>
        ${isActive ? `${activeCount}명 지금 공부 중` : '멤버 모집 중'}
      </div>

      <h1 class="room-name">${escapeHtml(roomName)}</h1>
      ${goal ? `<p class="room-goal">${escapeHtml(goal)}</p>` : ''}
    </div>

    <div class="card-body">
      <div class="stats">
        <div class="stat">
          <div class="stat-val">${memberCount}</div>
          <div class="stat-label">참여 인원</div>
        </div>
        <div class="stat">
          <div class="stat-val ${isActive ? 'active' : ''}">${activeCount}</div>
          <div class="stat-label">공부 중</div>
        </div>
        <div class="stat">
          <div class="stat-val">${maxMembers}</div>
          <div class="stat-label">최대 인원</div>
        </div>
      </div>

      <div class="progress-wrap">
        <div class="progress-meta">
          <span>참여율</span>
          <span>${memberCount}/${maxMembers}명</span>
        </div>
        <div class="progress-track"><div class="progress-fill"></div></div>
      </div>

      <a class="join-btn" href="/timer/?join=${encodeURIComponent(code)}">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 1l8 8-8 8M1 9h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        지금 합류하기
      </a>
      <p class="join-note">로그인이 필요합니다 · 계정이 없으면 회원가입 후 이용하세요</p>
    </div>

    <div class="card-footer">
      <span class="creator-info">방장 ${escapeHtml(room.creator_nickname)}</span>
      <span class="path-mark">P.A.T.H</span>
    </div>
  </div>
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
