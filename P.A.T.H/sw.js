/**
 * P.A.T.H Service Worker
 * Provides offline support and caching for the PWA
 */

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `path-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `path-dynamic-${CACHE_VERSION}`;

// Core app shell resources to cache on install
const APP_SHELL = [
  '/login/',
  '/login/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/shared/nav.js',
];

// Routes that should always try network first
const NETWORK_FIRST_PATTERNS = [
  /^\/api\//,
  /^\/socket\.io\//,
  /^\/uploads\//,
];

// Routes that are fine with cache-first (versioned static assets)
const CACHE_FIRST_PATTERNS = [
  /\.(?:js|css|woff2?|ttf|eot)(\?.*)?$/,
  /\/assets\//,
  /\/icons\//,
  /\/mainHub\/assets\//,
];

// ─── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL.map(url => new Request(url, { credentials: 'include' })));
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch ─────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Network-first for API and real-time endpoints
  if (NETWORK_FIRST_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Cache-first for static assets
  if (CACHE_FIRST_PATTERNS.some((re) => re.test(url.pathname))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Stale-while-revalidate for HTML pages
  event.respondWith(staleWhileRevalidate(request));
});

// ─── Strategies ────────────────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return offlineFallback(request);
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise || offlineFallback(request);
}

function offlineFallback(request) {
  const url = new URL(request.url);
  // For HTML pages, redirect to login (which is cached)
  if (request.headers.get('Accept')?.includes('text/html')) {
    return caches.match('/login/') || new Response(
      `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>P.A.T.H - 오프라인</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #000;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      padding: 20px;
    }
    .logo { font-size: 2.5rem; font-weight: 100; letter-spacing: 16px; color: #D4AF37; }
    h2 { font-size: 1rem; font-weight: 300; color: #888; letter-spacing: 3px; text-transform: uppercase; }
    p { font-size: 0.85rem; color: #555; text-align: center; line-height: 1.8; max-width: 280px; }
    button {
      margin-top: 10px;
      padding: 12px 28px;
      background: none;
      border: 1px solid rgba(212,175,55,0.4);
      color: #D4AF37;
      font-size: 0.8rem;
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="logo">P.A.T.H</div>
  <h2>오프라인 상태</h2>
  <p>인터넷 연결이 필요합니다.<br>연결을 확인한 후 다시 시도해주세요.</p>
  <button onclick="location.reload()">다시 시도</button>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
  return new Response('', { status: 503 });
}

// ─── Push Notifications (placeholder) ─────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'P.A.T.H', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      vibrate: [100, 50, 100],
      data: { url: data.url || '/mainHub/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/mainHub/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
