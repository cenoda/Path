/**
 * P.A.T.H PWA Install Prompt
 * Handles service worker registration and the "Add to Home Screen" install banner.
 */
(function () {
    'use strict';

    // ── Service Worker Registration ────────────────────────────────────────
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((reg) => {
                // Check for updates every 60 seconds while the page is open
                setInterval(() => reg.update(), 60000);
            })
            .catch(() => {});
    }

    // ── Install Prompt ─────────────────────────────────────────────────────
    const DISMISSED_KEY = 'pwa_install_dismissed';
    const DISMISSED_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

    let deferredPrompt = null;

    function wasDismissedRecently() {
        const ts = localStorage.getItem(DISMISSED_KEY);
        return ts && Date.now() - Number(ts) < DISMISSED_TTL;
    }

    function createBanner() {
        const banner = document.createElement('div');
        banner.id = 'pwa-install-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'P.A.T.H 앱 설치');
        banner.innerHTML = `
            <div class="pwa-banner-icon">
                <img src="/icons/icon-96.png" alt="P.A.T.H 아이콘" width="44" height="44">
            </div>
            <div class="pwa-banner-text">
                <strong>P.A.T.H 앱으로 설치</strong>
                <span>홈 화면에 추가하면 앱처럼 바로 실행돼요</span>
            </div>
            <button class="pwa-banner-install" id="pwa-btn-install">설치</button>
            <button class="pwa-banner-close" id="pwa-btn-close" aria-label="닫기">✕</button>
        `;

        const style = document.createElement('style');
        style.textContent = `
            #pwa-install-banner {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(120px);
                width: calc(100% - 32px);
                max-width: 480px;
                background: #111;
                border: 1px solid rgba(212,175,55,0.35);
                border-radius: 14px;
                padding: 14px 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                z-index: 99999;
                box-shadow: 0 8px 32px rgba(0,0,0,0.6);
                transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
                will-change: transform;
            }
            #pwa-install-banner.pwa-visible {
                transform: translateX(-50%) translateY(0);
            }
            .pwa-banner-icon img {
                border-radius: 10px;
                flex-shrink: 0;
            }
            .pwa-banner-text {
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
            }
            .pwa-banner-text strong {
                font-size: 13px;
                color: #D4AF37;
                font-weight: 600;
                letter-spacing: 0.3px;
            }
            .pwa-banner-text span {
                font-size: 11px;
                color: #777;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .pwa-banner-install {
                flex-shrink: 0;
                background: #D4AF37;
                color: #000;
                border: none;
                border-radius: 8px;
                padding: 8px 16px;
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.5px;
                cursor: pointer;
                transition: opacity 0.2s;
            }
            .pwa-banner-install:hover { opacity: 0.85; }
            .pwa-banner-close {
                flex-shrink: 0;
                background: none;
                border: none;
                color: #555;
                font-size: 14px;
                cursor: pointer;
                padding: 4px 6px;
                line-height: 1;
                transition: color 0.2s;
            }
            .pwa-banner-close:hover { color: #999; }
        `;

        document.head.appendChild(style);
        document.body.appendChild(banner);

        // Animate in after a tick
        requestAnimationFrame(() => {
            requestAnimationFrame(() => banner.classList.add('pwa-visible'));
        });

        document.getElementById('pwa-btn-install').addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            deferredPrompt = null;
            hideBanner(banner, outcome === 'dismissed');
        });

        document.getElementById('pwa-btn-close').addEventListener('click', () => {
            localStorage.setItem(DISMISSED_KEY, String(Date.now()));
            hideBanner(banner, false);
        });

        return banner;
    }

    function hideBanner(banner, keepDismissed) {
        banner.classList.remove('pwa-visible');
        setTimeout(() => banner.remove(), 500);
    }

    // Listen for the install prompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;

        // Show banner only if not recently dismissed and not already installed
        if (!wasDismissedRecently()) {
            // Delay slightly so the page can settle
            setTimeout(() => createBanner(), 3000);
        }
    });

    // Hide banner if app was successfully installed
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        const banner = document.getElementById('pwa-install-banner');
        if (banner) hideBanner(banner, false);
        console.log('[PWA] P.A.T.H 앱이 설치되었습니다.');
    });

    // ── iOS Safari "Add to Home Screen" guide (no beforeinstallprompt on iOS) ──
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    if (isIOS && !isStandalone && !wasDismissedRecently()) {
        setTimeout(() => {
            const toast = document.createElement('div');
            toast.id = 'pwa-ios-toast';
            toast.innerHTML = `
                <div style="
                    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
                    background:#111;border:1px solid rgba(212,175,55,0.35);
                    border-radius:14px;padding:14px 18px 14px 16px;
                    max-width:320px;width:calc(100%-32px);
                    display:flex;align-items:center;gap:12px;
                    z-index:99999;box-shadow:0 8px 32px rgba(0,0,0,0.6);
                    font-family:-apple-system,sans-serif;
                ">
                    <img src="/icons/icon-72.png" width="36" height="36" style="border-radius:8px;flex-shrink:0">
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12px;color:#D4AF37;font-weight:600;margin-bottom:3px">홈 화면에 추가</div>
                        <div style="font-size:11px;color:#666;line-height:1.5">
                            Safari 하단의 <strong style="color:#aaa">공유</strong> 버튼 →
                            <strong style="color:#aaa">홈 화면에 추가</strong> 를 탭하세요
                        </div>
                    </div>
                    <button onclick="this.closest('#pwa-ios-toast').remove();localStorage.setItem('${DISMISSED_KEY}',Date.now())"
                        style="background:none;border:none;color:#555;font-size:16px;cursor:pointer;padding:4px;flex-shrink:0">✕</button>
                </div>
            `;
            document.body.appendChild(toast);
            // Auto-dismiss after 12s
            setTimeout(() => toast.remove(), 12000);
        }, 4000);
    }
})();
