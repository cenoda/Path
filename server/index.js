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
const { getUploadDir } = require('./utils/uploadRoot');

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
const brandAssetMap = Object.freeze({
    'app-icon-master-1024.png': path.join(projectRoot, 'icons', 'IMG_0219.png'),
    'app-icon-alt-square-1024.png': path.join(projectRoot, 'icons', '\u1106\u116e\u110c\u116611_20260310203802.png'),
    'splash-landscape-a-1408x768.png': path.join(projectRoot, 'icons', '\u1106\u116e\u110c\u116612_20260310204735.png'),
    'splash-landscape-b-1408x768.png': path.join(projectRoot, 'icons', '\u1106\u116e\u110c\u116612_20260310204810.png'),
    'promo-preview.mp4': path.join(projectRoot, 'icons', 'gemini_generated_video_29ABE2A4.mp4'),
});
const appIconSourcePath = brandAssetMap['app-icon-master-1024.png'];

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

function safeCommunityImageUrl(value) {
    if (!value || typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^\/uploads\/community\/[a-zA-Z0-9._-]+$/.test(trimmed)) return trimmed;
    return safeExternalUrl(trimmed);
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

function isSecureRequest(req) {
  if (req.secure) return true;
  const forwardedProto = req.headers['x-forwarded-proto'];
  if (!forwardedProto || typeof forwardedProto !== 'string') return false;
  return forwardedProto.split(',')[0].trim() === 'https';
}

const cspConnectSrc = isProduction
  ? ["'self'", 'wss:', 'https:']
  : ["'self'", 'wss:', 'ws:', 'https:'];

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdn.socket.io", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: cspConnectSrc,
            workerSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: isProduction ? [] : null,
        },
    },
    crossOriginEmbedderPolicy: false,
      hsts: isProduction
        ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
        : false,
}));
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: corsOriginHandler,
    credentials: true
}));

// 프로덕션에서는 HTTPS 전송만 허용한다.
app.use((req, res, next) => {
  if (!isProduction) return next();
  if (isSecureRequest(req)) return next();

  if (req.method === 'GET' || req.method === 'HEAD') {
    const host = req.get('host');
    if (host) return res.redirect(308, `https://${host}${req.originalUrl}`);
  }

  return res.status(400).json({ error: 'HTTPS 요청만 허용됩니다.' });
});

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
  // Apple OAuth는 response_mode=form_post로 콜백되므로 예외 허용
  if (req.path === '/api/auth/apple/callback') return next();

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
app.use('/api/apply', require('./routes/apply'));

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
app.use('/uploads/community', express.static(getUploadDir('community'), {
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

// Clean aliases for brand assets kept under /icons.
app.get('/brand/:filename', (req, res, next) => {
    const filename = String(req.params.filename || '');
    const sourcePath = brandAssetMap[filename];

    if (!sourcePath) return next();

    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    return res.sendFile(sourcePath);
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
app.use('/study-hub/assets', express.static(path.join(projectRoot, 'P.A.T.H', 'mainHub', 'assets'), staticOptions));
app.use('/study-hub', express.static(path.join(projectRoot, 'P.A.T.H', 'mainPageDev'), noCacheStaticOptions));
app.use('/mainHub', (req, res) => {
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const targetPath = req.path === '/' ? '/study-hub/' : `/study-hub${req.path}`;
  return res.redirect(301, `${targetPath}${query}`);
});
app.use('/timer', (req, res) => {
  const queryIndex = req.url.indexOf('?');
  const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
  const targetPath = req.path === '/' ? '/study-hub/' : `/study-hub${req.path}`;
  return res.redirect(301, `${targetPath}${query}`);
});
app.use('/community', express.static(path.join(projectRoot, 'P.A.T.H', 'community'), noCacheStaticOptions));
app.use('/setup-profile', express.static(path.join(projectRoot, 'P.A.T.H', 'setup-profile'), noCacheStaticOptions));
app.use('/admin', express.static(path.join(projectRoot, 'P.A.T.H', 'admin'), noCacheStaticOptions));
app.use('/apply', express.static(path.join(projectRoot, 'P.A.T.H', 'apply'), noCacheStaticOptions));
app.use('/legal', express.static(path.join(projectRoot, 'P.A.T.H', 'legal'), staticOptions));

app.get('/community/post/:id', async (req, res) => {
    const postId = parseInt(req.params.id, 10);
  const targetCommentId = Math.max(0, parseInt(req.query.cmt, 10) || 0);
    if (!postId) {
        return res.status(400).type('text/html').send('<h1>잘못된 요청</h1>');
    }

    try {
    const [updateResult, commentsResult, targetCommentResult, otherPostsResult] = await Promise.all([
            pool.query(
                `WITH updated AS (
                   UPDATE community_posts SET views = views + 1 WHERE id = $1
                   RETURNING id, user_id, category, title, body, image_url, link_url, nickname, ip_prefix, views, likes, comments_count, created_at
                 )
                 SELECT u_cp.*,
                        u.profile_image_url,
                        u.active_title,
                        (u_cp.user_id IS NOT NULL AND u.nickname IS NOT NULL AND u_cp.nickname = u.nickname) AS is_verified_nickname
                 FROM updated u_cp
                 LEFT JOIN users u ON u.id = u_cp.user_id`,
                [postId]
            ),
            pool.query(
                `SELECT c.id, c.nickname, c.ip_prefix, c.body, c.created_at,
                        u.profile_image_url,
                        (c.user_id IS NOT NULL AND u.nickname IS NOT NULL AND c.nickname = u.nickname) AS is_verified_nickname
                 FROM community_comments c
                 LEFT JOIN users u ON u.id = c.user_id
                 WHERE c.post_id = $1
                 ORDER BY c.created_at DESC
                 LIMIT 5`,
                [postId]
            ),
              targetCommentId
                ? pool.query(
                  `SELECT c.id, c.nickname, c.ip_prefix, c.body, c.created_at,
                      u.profile_image_url,
                      (c.user_id IS NOT NULL AND u.nickname IS NOT NULL AND c.nickname = u.nickname) AS is_verified_nickname
                   FROM community_comments c
                   LEFT JOIN users u ON u.id = c.user_id
                   WHERE c.post_id = $1 AND c.id = $2
                   LIMIT 1`,
                  [postId, targetCommentId]
                )
                : Promise.resolve({ rows: [] }),
            pool.query(
                `SELECT p.id, p.category, p.title, p.nickname, p.ip_prefix, p.likes, p.comments_count, p.views, p.created_at,
                        u.profile_image_url,
                        (p.user_id IS NOT NULL AND u.nickname IS NOT NULL AND p.nickname = u.nickname) AS is_verified_nickname
                 FROM community_posts p
                 LEFT JOIN users u ON u.id = p.user_id
                 WHERE p.id != $1
                 ORDER BY p.created_at DESC
                 LIMIT 10`,
                [postId]
            )
        ]);

        if (!updateResult.rows.length) {
            return res.status(404).type('text/html').send('<h1>게시글을 찾을 수 없습니다.</h1>');
        }

        const post = updateResult.rows[0];
        // 프로필 이미지 URL 정규화
        if (post.profile_image_url && /^\/uploads\/profiles\/[a-zA-Z0-9._-]+$/.test(post.profile_image_url.trim())) {
            post.profile_image_url = post.profile_image_url.trim();
        } else {
            post.profile_image_url = '';
        }
        // 표시용 닉네임
        post.display_nickname = post.active_title
            ? `${post.nickname} [${post.active_title}]`
            : (post.nickname || '익명');
        const comments = commentsResult.rows;
        if (targetCommentResult.rows.length) {
          const target = targetCommentResult.rows[0];
          if (!comments.some((c) => Number(c.id) === Number(target.id))) {
            comments.unshift(target);
          }
        }
        const highlightedCommentId = targetCommentResult.rows[0]?.id || null;
        // 댓글 프로필 정규화
        comments.forEach((c) => {
            if (c.profile_image_url && /^\/uploads\/profiles\/[a-zA-Z0-9._-]+$/.test(c.profile_image_url.trim())) {
                c.profile_image_url = c.profile_image_url.trim();
            } else {
                c.profile_image_url = '';
            }
        });
        const otherPosts = otherPostsResult.rows;
        const baseUrl = getSiteBaseUrl(req);
        const canonical = `${baseUrl}/community/post/${post.id}`;
        const safeImageUrl = safeCommunityImageUrl(post.image_url);
        const safeLinkUrl = safeExternalUrl(post.link_url);
        const ogImageUrl = safeImageUrl.startsWith('/') ? `${baseUrl}${safeImageUrl}` : safeImageUrl;
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

        // 댓글 HTML (프로필 포함)
        function renderCommentAvatar(c) {
            if (c.profile_image_url && c.is_verified_nickname) {
                return `<img class="cmt-avatar" src="${escapeHtml(c.profile_image_url)}" alt="" loading="lazy">`;
            }
            const initial = escapeHtml((c.nickname || '익').charAt(0).toUpperCase());
            return `<span class="cmt-avatar cmt-avatar--empty">${initial}</span>`;
        }

        const commentsHtml = comments.length
            ? comments.map((comment) => `
      <li class="comment-item${Number(highlightedCommentId) === Number(comment.id) ? ' comment-item--target' : ''}" id="comment-${comment.id}">
        <div class="comment-meta">
          ${renderCommentAvatar(comment)}
          <span class="cmt-nick">${escapeHtml(comment.nickname || '익명')}${comment.is_verified_nickname ? '<span class="verified-badge">✓</span>' : ''}</span>
          ${comment.ip_prefix ? `<span class="cmt-ip">(${escapeHtml(comment.ip_prefix)})</span>` : ''}
          <span class="cmt-date">${escapeHtml(new Date(comment.created_at).toLocaleString('ko-KR'))}</span>
        </div>
        <p class="comment-body">${escapeHtml(comment.body || '')}</p>
      </li>`).join('')
            : '<li class="comment-empty">아직 댓글이 없습니다.</li>';

        // 다른 게시글 HTML (메인 페이지와 동일한 카드 스타일)
        const CATEGORY_COLORS = { '정보': 'cat-info', '질문': 'cat-qa', '잡담': 'cat-chat', '념글': 'cat-best', '전체': 'cat-all' };
        function fmtRelDet(dateStr) {
            const diff = Date.now() - new Date(dateStr).getTime();
            if (diff < 60000) return '방금';
            if (diff < 3600000) return `${Math.floor(diff/60000)}분 전`;
            if (diff < 86400000) return `${Math.floor(diff/3600000)}시간 전`;
            if (diff < 2592000000) return `${Math.floor(diff/86400000)}일 전`;
            return new Date(dateStr).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
        }
        const otherPostsHtml = otherPosts.length ? otherPosts.map((p) => {
            const catCls = CATEGORY_COLORS[p.category] || 'cat-all';
            const avatarHtml = (p.profile_image_url && p.is_verified_nickname)
                ? `<img class="post-row-avatar" src="${escapeHtml(p.profile_image_url)}" alt="" loading="lazy">`
                : `<span class="post-row-avatar post-row-avatar--empty">${escapeHtml((p.nickname || '익').charAt(0))}</span>`;
            return `<a class="post-row" href="/community/post/${p.id}">
              <div class="post-row__main">
                <div class="post-row__top">
                  <span class="post-cat ${catCls}">${escapeHtml(p.category || '전체')}</span>
                  <span class="post-title">${escapeHtml(p.title)}</span>
                </div>
                <div class="post-row__meta">
                  ${avatarHtml}
                  <span class="post-nick">${escapeHtml(p.nickname || '익명')}${p.is_verified_nickname ? '<span class="verified-badge">✓</span>' : ''}</span>
                  ${p.ip_prefix ? `<span class="post-ip">(${escapeHtml(p.ip_prefix)})</span>` : ''}
                  <span class="post-date">${fmtRelDet(p.created_at)}</span>
                  <span class="post-stats">
                    <span class="post-stat">👍 ${p.likes || 0}</span>
                    <span class="post-stat">💬 ${p.comments_count || 0}</span>
                  </span>
                </div>
              </div>
            </a>`;
        }).join('') : '<p class="other-empty">다른 게시글이 없습니다.</p>';

        // 작성자 프로필 렌더링
        const authorAvatarHtml = (post.profile_image_url && post.is_verified_nickname)
            ? `<img class="author-avatar" src="${escapeHtml(post.profile_image_url)}" alt="${escapeHtml(post.display_nickname)}" loading="lazy">`
            : `<span class="author-avatar author-avatar--empty">${escapeHtml((post.display_nickname || '익').charAt(0).toUpperCase())}</span>`;

        const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(post.title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:site_name" content="P.A.T.H">
  ${ogImageUrl ? `<meta property="og:image" content="${escapeHtml(ogImageUrl)}">` : ''}
  <meta property="article:published_time" content="${escapeHtml(publishedIso)}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(post.title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#0D0D11" media="(prefers-color-scheme: dark)">
  <meta name="theme-color" content="#F6F8FC" media="(prefers-color-scheme: light)">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="preconnect" href="https://cdn.jsdelivr.net">
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
  <script type="application/ld+json">${jsonLdSafe(postSchema)}</script>
  <style>
    /* ── Design Tokens (dark default, matches community/style.css) */
    :root {
      --bg:#0D0D11;--surface:#17171D;--surface-2:#1F1F27;
      --border:rgba(255,255,255,0.07);--border-mid:rgba(255,255,255,0.11);
      --accent:#D4AF37;--accent-blue:#3B82F6;--accent-red:#FF453A;--accent-green:#30D158;
      --text-1:#EDEDF0;--text-2:#9191A0;--text-3:#5A5A6E;
      --radius:12px;--radius-lg:16px;--radius-pill:999px;
      --font:'Pretendard Variable','Pretendard',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      --shadow-sm:0 2px 8px rgba(0,0,0,0.35);--shadow-md:0 4px 20px rgba(0,0,0,0.5);
      --header-bg:rgba(13,13,17,0.9);--transition:180ms cubic-bezier(.4,0,.2,1);
    }
    body.light {
      --bg:#F6F8FC;--surface:#FFFFFF;--surface-2:#EEF2F8;
      --border:rgba(23,32,56,0.09);--border-mid:rgba(23,32,56,0.16);
      --accent:#B8860B;--accent-blue:#2563EB;--accent-red:#E23434;--accent-green:#0EA968;
      --text-1:#182033;--text-2:#4A556E;--text-3:#6F7B94;
      --shadow-sm:0 2px 8px rgba(16,24,40,0.08);--shadow-md:0 8px 24px rgba(16,24,40,0.12);
      --header-bg:rgba(246,248,252,0.92);
    }
    *{box-sizing:border-box;margin:0;padding:0}
    html{font-family:var(--font);font-size:14px;background:var(--bg);color:var(--text-1);-webkit-font-smoothing:antialiased}
    body{min-height:100dvh;background:var(--bg);padding-bottom:60px;transition:background var(--transition),color var(--transition)}
    a{color:inherit;text-decoration:none}
    button{border:none;background:none;cursor:pointer;font-family:var(--font);color:inherit}
    ul,ol{list-style:none}

    /* ── Header */
    .c-header{position:sticky;top:0;z-index:100;background:var(--header-bg);backdrop-filter:blur(20px) saturate(1.6);-webkit-backdrop-filter:blur(20px) saturate(1.6);border-bottom:1px solid var(--border)}
    .c-header__inner{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 16px;max-width:900px;margin:0 auto}
    .c-header__left{display:flex;align-items:center;gap:10px}
    .c-header__back{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--text-1);transition:background var(--transition)}
    .c-header__back:hover{background:var(--surface-2)}
    .c-header__title{font-size:16px;font-weight:700;color:var(--text-1)}
    .c-header__right{display:flex;align-items:center;gap:4px}
    .c-header__icon-btn{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;color:var(--text-2);transition:background var(--transition),color var(--transition)}
    .c-header__icon-btn:hover{background:var(--surface-2);color:var(--text-1)}
    /* sun/moon icons */
    .theme-icon--moon{display:none}
    body:not(.light) .theme-icon--sun{display:none}
    body:not(.light) .theme-icon--moon{display:block}

    /* ── Page layout */
    .c-page{max-width:900px;margin:0 auto;padding:16px 14px 40px}

    /* ── Post card */
    .post-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:18px;box-shadow:var(--shadow-md);margin-bottom:14px}
    .post-card__top{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:8px}
    .post-date-meta{font-size:11.5px;color:var(--text-3);margin-left:auto}
    .post-card__title{font-size:20px;font-weight:800;line-height:1.38;word-break:break-word;color:var(--text-1);margin-bottom:12px;letter-spacing:-.02em}
    @media(min-width:600px){.post-card__title{font-size:24px}}

    /* ── Author profile row */
    .author-row{display:flex;align-items:center;gap:10px;padding:10px 0 14px;border-bottom:1px solid var(--border);margin-bottom:14px}
    .author-avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;border:1.5px solid var(--border-mid);flex-shrink:0}
    .author-avatar--empty{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:var(--surface-2);border:1.5px solid var(--border-mid);font-size:16px;font-weight:700;color:var(--text-2);flex-shrink:0}
    .author-info{min-width:0;flex:1}
    .author-nick{font-size:13.5px;font-weight:700;color:var(--text-1);display:flex;align-items:center;gap:4px}
    .author-ip{font-size:11px;color:var(--text-3);margin-top:1px}
    .author-stats{display:flex;gap:10px;margin-left:auto;flex-shrink:0}
    .author-stat{font-size:11.5px;color:var(--text-3)}

    /* ── Category chips */
    .post-cat{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:var(--radius-pill);font-size:11px;font-weight:700}
    .cat-info{background:rgba(59,130,246,0.18);color:#60a5fa}
    .cat-qa{background:rgba(48,209,88,0.15);color:#34d399}
    .cat-chat{background:rgba(212,175,55,0.18);color:#d4af37}
    .cat-best{background:rgba(255,69,58,0.15);color:#ff6b6b}
    .cat-all{background:var(--surface-2);color:var(--text-2)}

    /* ── Verified badge */
    .verified-badge{font-size:10px;font-weight:700;color:var(--accent-blue);margin-left:2px}

    /* ── Content */
    .post-body{font-size:14.5px;color:var(--text-1);line-height:1.72;white-space:pre-wrap;word-break:break-word;margin-bottom:16px}
    .post-thumb{margin:0 0 14px;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface-2)}
    .post-thumb img{display:block;width:100%;max-height:480px;object-fit:contain}
    .post-outlink{display:inline-flex;align-items:center;gap:6px;margin-bottom:16px;padding:9px 14px;border-radius:var(--radius);background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.25);font-size:13px;font-weight:600;color:var(--accent-blue)}
    .post-actions{display:flex;flex-wrap:wrap;gap:8px;padding-top:10px;border-top:1px solid var(--border);margin-top:4px}
    .post-like-chip{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 14px;border-radius:var(--radius-pill);font-size:12.5px;font-weight:600;color:var(--text-2);border:1.5px solid var(--border-mid);background:var(--surface-2)}
    .share-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 14px;border-radius:var(--radius-pill);font-size:12.5px;font-weight:700;background:var(--accent-blue);color:#fff;margin-left:auto}

    /* ── Comments */
    .section-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:14px;box-shadow:var(--shadow-sm)}
    .section-title{font-size:14px;font-weight:700;color:var(--text-1);margin-bottom:12px}
    .cmt-item{padding:11px 0;border-bottom:1px solid var(--border)}
    .cmt-item:last-child{border-bottom:none;padding-bottom:0}
    .cmt-meta{display:flex;align-items:center;gap:5px;margin-bottom:5px;flex-wrap:wrap}
    .cmt-avatar{width:26px;height:26px;border-radius:50%;object-fit:cover;border:1px solid var(--border-mid);flex-shrink:0}
    .cmt-avatar--empty{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:var(--surface-2);border:1px solid var(--border-mid);font-size:11px;font-weight:700;color:var(--text-2);flex-shrink:0}
    .cmt-nick{font-size:12px;font-weight:600;color:var(--text-1)}
    .cmt-ip{font-size:11px;color:var(--text-3)}
    .cmt-date{font-size:11px;color:var(--text-3);margin-left:auto}
    .cmt-body{font-size:13.5px;color:var(--text-1);line-height:1.55;white-space:pre-wrap;word-break:break-word}
    .comment-empty{font-size:13px;color:var(--text-3);padding:12px 0;text-align:center}
    .comment-item--target{background:rgba(59,130,246,0.09);border-radius:10px;padding:10px 10px 12px;margin:0 -10px 2px}

    /* ── Other posts list (matches community main page) */
    .post-row{display:flex;padding:11px 0;border-bottom:1px solid var(--border);text-decoration:none;transition:background var(--transition)}
    .post-row:last-child{border-bottom:none}
    .post-row:hover{background:var(--surface-2);margin:0 -16px;padding:11px 16px;border-radius:var(--radius)}
    .post-row__main{flex:1;min-width:0}
    .post-row__top{display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap}
    .post-title{font-size:13.5px;font-weight:600;color:var(--text-1);word-break:break-word;line-height:1.4;flex:1;min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
    .post-row__meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
    .post-row-avatar{width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0}
    .post-row-avatar--empty{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--surface-2);font-size:9px;font-weight:700;color:var(--text-3);flex-shrink:0}
    .post-nick{font-size:11.5px;color:var(--text-2);font-weight:600}
    .post-ip{font-size:11px;color:var(--text-3)}
    .post-date{font-size:11px;color:var(--text-3);margin-left:auto}
    .post-stats{display:flex;gap:6px;margin-left:8px}
    .post-stat{font-size:11px;color:var(--text-3)}
    .other-empty{font-size:13px;color:var(--text-3);padding:16px 0;text-align:center}

    .footnote{margin-top:8px;font-size:12px;color:var(--text-3);text-align:center;padding:8px 0}
  </style>
</head>
<body>
  <!-- ── Header -->
  <header class="c-header">
    <div class="c-header__inner">
      <div class="c-header__left">
        <a class="c-header__back" href="/community/" aria-label="커뮤니티 목록으로">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12 5L7 10L12 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <span class="c-header__title">커뮤니티</span>
      </div>
      <div class="c-header__right">
        <button class="c-header__icon-btn" id="theme-toggle" aria-label="다크 모드 전환" title="다크 모드 전환">
          <svg class="theme-icon theme-icon--sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/>
            <path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/>
            <path d="M2 12h2"/><path d="M20 12h2"/>
            <path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/>
          </svg>
          <svg class="theme-icon theme-icon--moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
          </svg>
        </button>
        <button class="share-btn" type="button" id="share-post-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          공유
        </button>
      </div>
    </div>
  </header>

  <main class="c-page">
    <!-- ── 게시글 카드 -->
    <article class="post-card">
      <div class="post-card__top">
        <span class="post-cat ${CATEGORY_COLORS[post.category] || 'cat-all'}">${escapeHtml(post.category || '전체')}</span>
        <span class="post-date-meta">${escapeHtml(new Date(post.created_at).toLocaleString('ko-KR'))}</span>
      </div>
      <h1 class="post-card__title">${escapeHtml(post.title)}</h1>

      <!-- ── 작성자 프로필 -->
      <div class="author-row">
        ${authorAvatarHtml}
        <div class="author-info">
          <div class="author-nick">
            ${escapeHtml(post.display_nickname)}
            ${post.is_verified_nickname ? '<span class="verified-badge">✓</span>' : ''}
          </div>
          ${post.ip_prefix ? `<div class="author-ip">(${escapeHtml(post.ip_prefix)})</div>` : ''}
        </div>
        <div class="author-stats">
          <span class="author-stat">조회 ${post.views || 0}</span>
          <span class="author-stat">추천 ${post.likes || 0}</span>
        </div>
      </div>

      ${safeImageUrl ? `<div class="post-thumb"><img src="${escapeHtml(safeImageUrl)}" alt="첨부 이미지" loading="lazy"></div>` : ''}
      ${post.body ? `<div class="post-body">${escapeHtml(post.body)}</div>` : ''}
      ${safeLinkUrl ? `<a class="post-outlink" href="${escapeHtml(safeLinkUrl)}" target="_blank" rel="noopener noreferrer nofollow">🔗 첨부 링크 열기</a>` : ''}

      <div class="post-actions">
        <span class="post-like-chip">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
            <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
          </svg>
          추천 ${post.likes || 0}
        </span>
        <span class="post-like-chip">💬 댓글 ${post.comments_count || 0}</span>
      </div>
    </article>

    <!-- ── 댓글 프리뷰 -->
    <section class="section-card" aria-label="댓글 프리뷰">
      <p class="section-title">댓글 <strong>${comments.length}</strong></p>
      <ul>${commentsHtml}</ul>
      <p class="footnote">전체 댓글/추천/신고는 커뮤니티 앱 화면에서 이용할 수 있습니다.</p>
    </section>

    <!-- ── 다른 게시글 -->
    <section class="section-card" aria-label="다른 게시글">
      <p class="section-title">다른 게시글</p>
      ${otherPostsHtml}
    </section>
  </main>

  <script>
    (function() {
      // ── 테마 초기화
      function applyTheme() {
        var saved = localStorage.getItem('path_theme');
        var isLight = saved ? saved === 'light' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches);
        document.body.classList.toggle('light', !!isLight);
        syncThemeBtn();
      }
      function syncThemeBtn() {
        var btn = document.getElementById('theme-toggle');
        if (!btn) return;
        var isLight = document.body.classList.contains('light');
        btn.setAttribute('aria-label', isLight ? '다크 모드 전환' : '라이트 모드 전환');
        btn.title = isLight ? '다크 모드 전환' : '라이트 모드 전환';
      }
      applyTheme();
      var themeBtn = document.getElementById('theme-toggle');
      if (themeBtn) {
        themeBtn.addEventListener('click', function() {
          var nextLight = !document.body.classList.contains('light');
          document.body.classList.toggle('light', nextLight);
          localStorage.setItem('path_theme', nextLight ? 'light' : 'dark');
          syncThemeBtn();
        });
      }

      // ── 공유 버튼
      var shareBtn = document.getElementById('share-post-btn');
      if (shareBtn) {
        shareBtn.addEventListener('click', async function() {
          try {
            if (navigator.share) {
              await navigator.share({ title: ${jsonLdSafe(post.title)}, text: ${jsonLdSafe(description)}, url: window.location.href });
              return;
            }
            await navigator.clipboard.writeText(window.location.href);
            shareBtn.textContent = '링크 복사됨';
            setTimeout(function(){ shareBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> 공유'; }, 1400);
          } catch (_) {
            window.prompt('아래 링크를 복사해 공유하세요', window.location.href);
          }
        });
      }

      // ── 댓글 앵커 이동 (?cmt=123)
      try {
        var qs = new URLSearchParams(window.location.search);
        var cmtId = parseInt(qs.get('cmt') || '0', 10);
        if (cmtId > 0) {
          var targetEl = document.getElementById('comment-' + cmtId);
          if (targetEl) {
            setTimeout(function() {
              targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
              targetEl.classList.add('comment-item--target');
            }, 120);
          }
        }
      } catch (_) {}
    })();
  </script>
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

app.get('/P.A.T.H/mainHub', (_req, res) => res.redirect(301, '/study-hub/'));
app.get('/P.A.T.H/mainHub/', (_req, res) => res.redirect(301, '/study-hub/'));
app.get('/P.A.T.H/mainHub/index.html', (_req, res) => res.redirect(301, '/study-hub/'));

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
