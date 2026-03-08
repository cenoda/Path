/**
 * nav.js – 페이지 전환 트랜지션 + hover 시 prefetch
 * 모든 페이지에 공통으로 포함되는 스크립트
 */
(function () {
    // ── 전환 오버레이 CSS 주입 ──────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        @keyframes _navFadeIn {
            from { opacity: 0; transform: translateY(6px); }
            to   { opacity: 1; transform: translateY(0); }
        }
        body { animation: _navFadeIn 0.2s ease-out both; }

        #_nav-overlay {
            position: fixed;
            inset: 0;
            background: #000;
            display: none;
            visibility: hidden;
            opacity: 0;
            pointer-events: none;
            z-index: 2147483647;
            transition: opacity 0.15s ease;
            will-change: opacity;
        }
        #_nav-overlay.active {
            display: block;
            visibility: visible;
            opacity: 1;
            pointer-events: all;
        }
    `;
    document.head.appendChild(style);

    // ── 오버레이 엘리먼트 생성 ─────────────────────────────────
    const overlay = document.createElement('div');
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

    // ── navigateTo: 페이드아웃 후 이동 ────────────────────────
    window.navigateTo = function (url) {
        ensureOverlay();
        overlay.classList.add('active');
        setTimeout(function () {
            window.location.href = url;
        }, 160);
    };

    // Safety: if a navigation gets canceled, immediately release interaction lock.
    window.addEventListener('pageshow', function () {
        overlay.classList.remove('active');
    });

    // ── hover 시 prefetch ──────────────────────────────────────
    const prefetched = new Set();

    function prefetch(pathname) {
        if (prefetched.has(pathname)) return;
        prefetched.add(pathname);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = pathname;
        link.as = 'document';
        document.head.appendChild(link);
    }

    // ── 페이지 로드 시 인접 라우트 사전 prefetch ──────────────
    const routePrefetchMap = {
        '/mainHub/':   ['/timer/', '/community/'],
        '/timer/':     ['/mainHub/'],
        '/community/': ['/mainHub/'],
        '/login/':     ['/mainHub/'],
    };
    const adjacents = routePrefetchMap[location.pathname] || [];
    // 초기 로드 영향 최소화를 위해 1.5초 후 prefetch
    setTimeout(function () { adjacents.forEach(prefetch); }, 1500);

    document.addEventListener('mouseover', function (e) {
        const target = e.target.closest('[data-nav-href]');
        if (!target) return;
        prefetch(target.dataset.navHref);
    }, { passive: true });

    // <a> 태그 hover도 처리
    document.addEventListener('mouseover', function (e) {
        const a = e.target.closest('a[href]');
        if (!a) return;
        try {
            const url = new URL(a.href, location.origin);
            if (url.origin === location.origin) prefetch(url.pathname);
        } catch (_) {}
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
        if (!s) return;

        if (s === 'event.preventDefault()') { event.preventDefault(); return; }
        if (s === 'event.stopPropagation()') { event.stopPropagation(); return; }

        const clickExpr = s.match(/^document\.getElementById\((['"])(.+?)\1\)\.click\(\)$/);
        if (clickExpr) {
            const el = document.getElementById(clickExpr[2]);
            if (el) el.click();
            return;
        }

        const navExpr = s.match(/^window\.location\.href\s*=\s*(['"])(.+?)\1$/);
        if (navExpr) {
            window.location.href = navExpr[2];
            return;
        }

        const fnCall = s.match(/^([A-Za-z_$][\w$.]*)\((.*)\)$/);
        if (!fnCall) return;

        const fnPath = fnCall[1];
        const rawArgs = fnCall[2].trim();
        const argTokens = rawArgs ? splitArgs(rawArgs) : [];
        const args = argTokens.map(function (t) { return parseArg(t, event, element); });

        const resolved = resolvePath(window, fnPath);
        const fn = resolved.ctx ? resolved.ctx[resolved.fnName] : undefined;
        if (typeof fn === 'function') {
            fn.apply(resolved.ctx, args);
        }
    }

    function runInlineOnclick(expr, event, element) {
        if (!expr) return false;
        const statements = expr.split(';').map(function (x) { return x.trim(); }).filter(Boolean);
        if (!statements.length) return false;
        statements.forEach(function (stmt) { runInlineStatement(stmt, event, element); });
        return true;
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

        if (!inlineBlocked) return;

        document.addEventListener('click', function (e) {
            const target = e.target && e.target.closest ? e.target.closest('[onclick]') : null;
            if (!target) return;

            const now = Date.now();
            const last = Number(target.dataset.pathInlineTs || '0');
            if (now - last < 350) return;

            const expr = target.getAttribute('onclick');
            if (!expr) return;

            const handled = runInlineOnclick(expr, e, target);
            if (!handled) return;

            e.preventDefault();
            e.stopPropagation();
        }, { capture: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupInlineOnclickFallback, { once: true });
    } else {
        setupInlineOnclickFallback();
    }
})();
