/**
 * nav.js – 고급 페이지 전환 트랜지션 + hover 시 prefetch
 * 모든 페이지에 공통으로 포함되는 스크립트
 */
(function () {
    // ── View Transition API 지원 감지 ──────────────────────────
    var hasViewTransition = typeof document.startViewTransition === 'function';

    // ── 전환 CSS 주입 ──────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent = `
        /* ── 페이드+슬라이드 인 ── */
        @keyframes _navFadeIn {
            from { opacity: 0; transform: translateY(12px) scale(0.99); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        body {
            animation: _navFadeIn .28s cubic-bezier(.22,1,.36,1) both;
        }

        /* ── 전환 오버레이 (그라디언트 wipe) ── */
        #_nav-overlay {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            pointer-events: none;
            opacity: 0;
            visibility: hidden;
            background: linear-gradient(135deg,
                rgba(0,0,0,0.92) 0%,
                rgba(13,13,17,0.96) 50%,
                rgba(0,0,0,0.92) 100%);
            transition: opacity .18s cubic-bezier(.4,0,.2,1),
                        visibility 0s linear .18s;
            will-change: opacity;
        }
        #_nav-overlay.active {
            opacity: 1;
            visibility: visible;
            pointer-events: all;
            transition: opacity .18s cubic-bezier(.4,0,.2,1),
                        visibility 0s linear 0s;
        }

        /* ── 오버레이 내부 로딩 스피너 ── */
        #_nav-overlay::after {
            content: '';
            position: absolute;
            top: 50%; left: 50%;
            width: 24px; height: 24px;
            margin: -12px 0 0 -12px;
            border: 2px solid rgba(255,255,255,0.15);
            border-top-color: rgba(255,255,255,0.7);
            border-radius: 50%;
            animation: _navSpin .6s linear infinite;
            opacity: 0;
            transition: opacity .12s ease .1s;
        }
        #_nav-overlay.active::after {
            opacity: 1;
        }
        @keyframes _navSpin {
            to { transform: rotate(360deg); }
        }

        /* ── 페이드 아웃 (나가는 페이지) ── */
        body._nav-leaving {
            animation: _navFadeOut .15s cubic-bezier(.4,0,1,1) forwards !important;
        }
        @keyframes _navFadeOut {
            from { opacity: 1; transform: scale(1); filter: blur(0); }
            to   { opacity: 0; transform: scale(0.98); filter: blur(2px); }
        }

        /* ── View Transition API 스타일 (지원 브라우저) ── */
        ::view-transition-old(root) {
            animation: _vtOut .2s cubic-bezier(.4,0,1,1) forwards;
        }
        ::view-transition-new(root) {
            animation: _vtIn .3s cubic-bezier(.22,1,.36,1) both;
        }
        @keyframes _vtOut {
            from { opacity: 1; transform: scale(1); }
            to   { opacity: 0; transform: scale(0.97) translateY(-8px); }
        }
        @keyframes _vtIn {
            from { opacity: 0; transform: scale(0.97) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
        }
    `;
    document.head.appendChild(style);

    // ── 오버레이 엘리먼트 생성 ─────────────────────────────────
    var overlay = document.createElement('div');
    overlay.id = '_nav-overlay';

    function ensureOverlay() {
        if (!document.body.contains(overlay)) {
            document.body.appendChild(overlay);
        }
    }

    if (document.body) {
        ensureOverlay();
    } else {
        document.addEventListener('DOMContentLoaded', ensureOverlay);
    }

    // ── navigateTo: 부드러운 전환 후 이동 ─────────────────────
    var navigating = false;
    window.navigateTo = function (url) {
        if (navigating) return;
        navigating = true;

        // View Transition API 지원 시 네이티브 모핑 사용
        if (hasViewTransition) {
            document.startViewTransition(function () {
                window.location.href = url;
            });
            return;
        }

        // 폴백: 바디 축소 + 오버레이 페이드
        ensureOverlay();
        document.body.classList.add('_nav-leaving');
        overlay.classList.add('active');
        setTimeout(function () {
            window.location.href = url;
        }, 140);
    };

    // Safety: bfcache 등에서 돌아올 때 상태 초기화
    window.addEventListener('pageshow', function (e) {
        navigating = false;
        overlay.classList.remove('active');
        document.body.classList.remove('_nav-leaving');
        // bfcache에서 복원 시 바디 애니메이션 재실행
        if (e.persisted) {
            document.body.style.animation = 'none';
            document.body.offsetHeight; // reflow
            document.body.style.animation = '';
        }
    });

    // ── hover 시 prefetch ──────────────────────────────────────
    var prefetched = new Set();

    function prefetch(pathname) {
        if (prefetched.has(pathname)) return;
        prefetched.add(pathname);
        var link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = pathname;
        link.as = 'document';
        document.head.appendChild(link);
    }

    // ── 페이지 로드 시 인접 라우트 사전 prefetch ──────────────
    var routePrefetchMap = {
        '/study-hub/': ['/community/'],
        '/timer/': ['/study-hub/', '/community/'],
        '/mainPageDev/': ['/study-hub/'],
        '/community/': ['/study-hub/'],
        '/login/':     ['/study-hub/', '/setup-profile/'],
    };
    var adjacents = routePrefetchMap[location.pathname] || [];
    // idle callback 또는 800ms 후 prefetch (더 빠르게)
    if (window.requestIdleCallback) {
        requestIdleCallback(function () { adjacents.forEach(prefetch); }, { timeout: 1000 });
    } else {
        setTimeout(function () { adjacents.forEach(prefetch); }, 800);
    }

    document.addEventListener('mouseover', function (e) {
        var target = e.target.closest('[data-nav-href]');
        if (!target) return;
        prefetch(target.dataset.navHref);
    }, { passive: true });

    // <a> 태그 hover도 처리
    document.addEventListener('mouseover', function (e) {
        var a = e.target.closest('a[href]');
        if (!a) return;
        try {
            var url = new URL(a.href, location.origin);
            if (url.origin === location.origin) prefetch(url.pathname);
        } catch (_) {}
    }, { passive: true });

    // ── touchstart 시 prefetch (모바일 최적화) ────────────────
    document.addEventListener('touchstart', function (e) {
        var a = e.target.closest('a[href], [data-nav-href], [onclick]');
        if (!a) return;
        var href = a.dataset && a.dataset.navHref;
        if (!href && a.href) {
            try {
                var u = new URL(a.href, location.origin);
                if (u.origin === location.origin) href = u.pathname;
            } catch (_) {}
        }
        if (href) prefetch(href);
    }, { passive: true });

    // ── Fallback: inline onclick 차단(WebView/CSP) 환경 대응 ──────────────
    function splitArgs(raw) {
        const out = [];
        let cur = '';
        let quote = null;
        let depth = 0;

        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            const prev = i > 0 ? raw[i - 1] : '';

            if (quote) {
                cur += ch;
                if (ch === quote && prev !== '\\') quote = null;
                continue;
            }

            if (ch === '"' || ch === "'") {
                quote = ch;
                cur += ch;
                continue;
            }

            if (ch === '(') { depth++; cur += ch; continue; }
            if (ch === ')') { depth = Math.max(0, depth - 1); cur += ch; continue; }

            if (ch === ',' && depth === 0) {
                out.push(cur.trim());
                cur = '';
                continue;
            }

            cur += ch;
        }

        if (cur.trim()) out.push(cur.trim());
        return out;
    }

    function parseArg(token, event, element) {
        if (token === 'event') return event;
        if (token === 'this') return element;
        if (token === 'true') return true;
        if (token === 'false') return false;
        if (token === 'null') return null;
        if (token === 'undefined') return undefined;
        if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);

        const quoted = token.match(/^(["'])([\s\S]*)\1$/);
        if (quoted) {
            return quoted[2]
                .replace(/\\'/g, "'")
                .replace(/\\"/g, '"')
                .replace(/\\n/g, '\n')
                .replace(/\\r/g, '\r')
                .replace(/\\t/g, '\t')
                .replace(/\\\\/g, '\\');
        }

        return token;
    }

    function resolvePath(root, path) {
        const parts = path.split('.').filter(Boolean);
        let ctx = root;
        for (let i = 0; i < parts.length - 1; i++) {
            ctx = ctx ? ctx[parts[i]] : undefined;
        }
        const fnName = parts[parts.length - 1];
        return { ctx: ctx || root, fnName: fnName };
    }

    function runInlineStatement(stmt, event, element) {
        const s = stmt.trim();
        if (!s) return false;

        if (s === 'event.preventDefault()') { event.preventDefault(); return true; }
        if (s === 'event.stopPropagation()') { event.stopPropagation(); return true; }

        const clickExpr = s.match(/^document\.getElementById\((['"])(.+?)\1\)\.click\(\)$/);
        if (clickExpr) {
            const el = document.getElementById(clickExpr[2]);
            if (el) el.click();
            return true;
        }

        const navExpr = s.match(/^window\.location\.href\s*=\s*(['"])(.+?)\1$/);
        if (navExpr) {
            window.location.href = navExpr[2];
            return true;
        }

        const fnCall = s.match(/^([A-Za-z_$][\w$.]*)\((.*)\)$/);
        if (!fnCall) return false;

        const fnPath = fnCall[1];
        const rawArgs = fnCall[2].trim();
        const argTokens = rawArgs ? splitArgs(rawArgs) : [];
        const args = argTokens.map(function (t) { return parseArg(t, event, element); });

        const resolved = resolvePath(window, fnPath);
        const fn = resolved.ctx ? resolved.ctx[resolved.fnName] : undefined;
        if (typeof fn === 'function') {
            fn.apply(resolved.ctx, args);
            return true;
        }

        return false;
    }

    function runInlineOnclick(expr, event, element) {
        if (!expr) return false;
        const statements = expr.split(';').map(function (x) { return x.trim(); }).filter(Boolean);
        if (!statements.length) return false;
        let handled = false;
        statements.forEach(function (stmt) {
            if (runInlineStatement(stmt, event, element)) handled = true;
        });
        return handled;
    }

    function detectInlineOnclickBlocked() {
        try {
            window.__pathInlineProbe = 0;
            const probe = document.createElement('button');
            probe.type = 'button';
            probe.setAttribute('onclick', 'window.__pathInlineProbe = (window.__pathInlineProbe || 0) + 1');
            probe.style.display = 'none';
            document.body.appendChild(probe);
            // Some WebViews do not execute inline handlers for programmatic `.click()`,
            // so test both pathways to reduce false positives.
            probe.click();
            try {
                probe.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            } catch (_) {}
            probe.remove();
            return Number(window.__pathInlineProbe || 0) < 1;
        } catch (_) {
            return true;
        } finally {
            try { delete window.__pathInlineProbe; } catch (_) {}
        }
    }

    function setupInlineOnclickFallback() {
        if (!document.body) return;
        const inlineBlocked = detectInlineOnclickBlocked();

        // Touch WebViews are the main source of missed inline onclick dispatch.
        // Keep this active regardless of probe result to avoid false negatives.
        document.addEventListener('pointerup', function (e) {
            if (e.pointerType !== 'touch') return;
            const target = e.target && e.target.closest ? e.target.closest('[onclick]') : null;
            if (!target) return;

            const expr = target.getAttribute('onclick');
            if (!expr) return;

            const now = Date.now();
            const last = Number(target.dataset.pathInlineTs || '0');
            if (now - last < 250) return;
            const handled = runInlineOnclick(expr, e, target);
            if (!handled) return;

            target.dataset.pathInlineTs = String(now);
            e.preventDefault();
            e.stopPropagation();
        }, { capture: true, passive: false });

        document.addEventListener('click', function (e) {
            const target = e.target && e.target.closest ? e.target.closest('[onclick]') : null;
            if (!target) return;

            const now = Date.now();
            const last = Number(target.dataset.pathInlineTs || '0');
            // When pointerup already handled inline onclick, swallow the follow-up click.
            if (now - last < 350) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (!inlineBlocked) return;

            const expr = target.getAttribute('onclick');
            if (!expr) return;

            const handled = runInlineOnclick(expr, e, target);
            if (!handled) return;

            e.preventDefault();
            e.stopPropagation();
        }, { capture: true });

        // onchange 속성 폴백 – 토글/셀렉트 등 inline onchange가 차단된 환경 대응
        if (inlineBlocked) {
            document.addEventListener('change', function (e) {
                var target = e.target;
                if (!target) return;
                var expr = target.getAttribute('onchange');
                if (!expr) return;
                runInlineOnclick(expr, e, target);
            }, { capture: true });

            // oninput 폴백 – 검색 입력 등
            document.addEventListener('input', function (e) {
                var target = e.target;
                if (!target) return;
                var expr = target.getAttribute('oninput');
                if (!expr) return;
                runInlineOnclick(expr, e, target);
            }, { capture: true });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupInlineOnclickFallback, { once: true });
    } else {
        setupInlineOnclickFallback();
    }
})();
