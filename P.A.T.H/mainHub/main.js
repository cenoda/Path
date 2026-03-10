function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

const BALLOON_SKINS = {
    'default': { id: 'default', name: '기본 열기구', price: 0, darkImg: 'assets/balloon_dark.png', lightImg: 'assets/balloon_light.png', desc: '기본 제공 열기구' },
    'rainbow': { id: 'rainbow', name: '무지개 열기구', price: 2000, darkImg: 'assets/balloon_rainbow.png', lightImg: 'assets/balloon_rainbow.png', desc: '화려한 무지개 열기구' },
    'pastel': { id: 'pastel', name: '파스텔 열기구', price: 3000, darkImg: 'assets/balloon_pastel.png', lightImg: 'assets/balloon_pastel.png', desc: '차분한 파스텔톤 열기구' },
    'redstripes': { id: 'redstripes', name: '레드 스트라이프', price: 4000, darkImg: 'assets/balloon_redstripes.png', lightImg: 'assets/balloon_redstripes.png', desc: '강렬한 레드 스트라이프 열기구' },
    'golden': { id: 'golden', name: '황금 열기구', price: 5000, darkImg: 'assets/balloon_golden.png', lightImg: 'assets/balloon_golden.png', desc: '고급스러운 황금빛 열기구' },
    'cosmic': { id: 'cosmic', name: '우주 열기구', price: 6500, darkImg: 'assets/balloon_cosmic.png', lightImg: 'assets/balloon_cosmic.png', desc: '신비로운 우주 테마 열기구' },
    'sunset': { id: 'sunset', name: '석양 열기구', price: 8000, darkImg: 'assets/balloon_sunset.png', lightImg: 'assets/balloon_sunset.png', desc: '아름다운 석양 그라데이션 열기구' },
    'emerald': { id: 'emerald', name: '에메랄드 열기구', price: 9500, darkImg: 'assets/balloon_emerald.png', lightImg: 'assets/balloon_emerald.png', desc: '고귀한 에메랄드빛 열기구' },
    'phoenix': { id: 'phoenix', name: '불사조 열기구', price: 11000, darkImg: 'assets/balloon_phoenix.png', lightImg: 'assets/balloon_phoenix.png', desc: '화염 속 불사조 열기구' },
    'galaxy': { id: 'galaxy', name: '은하수 열기구', price: 13000, darkImg: 'assets/balloon_galaxy.png', lightImg: 'assets/balloon_galaxy.png', desc: '찬란한 은하수 열기구' },
    'diamond': { id: 'diamond', name: '다이아몬드 열기구', price: 15000, darkImg: 'assets/balloon_diamond.png', lightImg: 'assets/balloon_diamond.png', desc: '최고급 다이아몬드 열기구' }
};

const BALLOON_AURAS = {
    'none': { id: 'none', name: '없음', price: 0, desc: '기본 상태' },
    'sun': { id: 'sun', name: '태양 후광', price: 2500, desc: '따뜻한 황금빛 후광' },
    'frost': { id: 'frost', name: '서리 오오라', price: 4200, desc: '차가운 푸른빛 기류' },
    'forest': { id: 'forest', name: '숲의 숨결', price: 5200, desc: '초록빛 생명 에너지' },
    'cosmic': { id: 'cosmic', name: '코스믹 링', price: 6800, desc: '우주 먼지 같은 잔광' },
    'royal': { id: 'royal', name: '로열 크라운', price: 9000, desc: '보랏빛 왕관형 오오라' }
};

function getBalloonSrc(skinId, isLight) {
    const skin = BALLOON_SKINS[skinId] || BALLOON_SKINS['default'];
    return isLight ? skin.lightImg : skin.darkImg;
}

const UI_SETTINGS_KEY = 'path_ui_settings';
const DEFAULT_UI_SETTINGS = {
    showMinimap: false,
    showKeyboardGuide: true,
    showCoordinates: true
};
const ONBOARDING_PENDING_KEY = 'path_onboarding_pending';
const ONBOARDING_DONE_PREFIX = 'path_onboarding_done_user_';
const ONBOARDING_STEPS = [
    {
        target: '#btn-enter-path',
        title: '공부 시작하기',
        text: '하단 공부 시작하기 버튼을 누르면 공부 타이머 화면으로 이동합니다.'
    },
    {
        target: '#tutorial-btn-rank',
        title: '랭킹 확인',
        text: '오른쪽(모바일은 하단) 메뉴의 RANK 버튼에서 전체/오늘 랭킹을 확인할 수 있습니다.'
    },
    {
        target: '#tutorial-btn-settings',
        title: '설정과 로그아웃',
        text: '우측 상단 설정 버튼에서 UI 표시, 라이트 모드, 로그아웃을 관리할 수 있습니다.'
    }
];

function toggleTheme(forceLight) {
    const isLight = typeof forceLight === 'boolean'
        ? forceLight
        : !document.body.classList.contains('light');
    document.body.classList.toggle('light', isLight);
    localStorage.setItem('path_theme', isLight ? 'light' : 'dark');

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.checked = isLight;

    if (window.WorldScene && window.WorldScene.isReady) {
        window.WorldScene.setDayNightMode(isLight, true);
    }
    
    const user = currentUser || { university: '' };
    updateMyBuilding(user);
    loadRankingAndMap();
}

function getUiSettings() {
    try {
        const raw = localStorage.getItem(UI_SETTINGS_KEY);
        if (!raw) return { ...DEFAULT_UI_SETTINGS };
        return { ...DEFAULT_UI_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
        return { ...DEFAULT_UI_SETTINGS };
    }
}

function applyUiSettings(settings) {
    const minimapToggle = document.getElementById('minimap-toggle');
    const keyboardToggle = document.getElementById('keyboard-guide-toggle');
    const coordinatesToggle = document.getElementById('coordinates-toggle');

    if (minimapToggle) minimapToggle.checked = !!settings.showMinimap;
    if (keyboardToggle) keyboardToggle.checked = !!settings.showKeyboardGuide;
    if (coordinatesToggle) coordinatesToggle.checked = !!settings.showCoordinates;

    const keyboardGuide = document.getElementById('keyboard-guide');
    if (keyboardGuide) keyboardGuide.classList.toggle('hidden', !settings.showKeyboardGuide);

    const coordinates = document.getElementById('coordinates-display');
    if (coordinates) coordinates.classList.toggle('hidden', !settings.showCoordinates);

    setMinimapVisible(!!settings.showMinimap);
}

function loadUiSettings() {
    const settings = getUiSettings();
    const isLight = document.body.classList.contains('light');
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.checked = isLight;
    applyUiSettings(settings);
}

function saveUiSettings() {
    const next = {
        showMinimap: !!document.getElementById('minimap-toggle')?.checked,
        showKeyboardGuide: !!document.getElementById('keyboard-guide-toggle')?.checked,
        showCoordinates: !!document.getElementById('coordinates-toggle')?.checked
    };
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(next));
    applyUiSettings(next);
    const isLight = !!document.getElementById('theme-toggle')?.checked;
    toggleTheme(isLight);
}

// Keep inline onclick/onchange handlers stable even with strict caching/module transitions.
window.saveUiSettings = saveUiSettings;
window.toggleTheme = toggleTheme;

document.addEventListener('DOMContentLoaded', () => {
    loadUiSettings();
});

let currentUser = null;
let myTotalSec = 0;
let allUsers = [];
let allUniversities = [];
let selectedUser = null;
const onboardingState = {
    active: false,
    currentIndex: 0
};
let isDragging = false;
let dragStartX, dragStartY;
let mapOffsetX = 0, mapOffsetY = 0;
let scale = 1.0;
let currentRankTab = 'total';

function getOnboardingDoneKey(userId) {
    return `${ONBOARDING_DONE_PREFIX}${userId}`;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function getOnboardingElements() {
    return {
        layer: document.getElementById('onboarding-tutorial'),
        highlight: document.getElementById('onboarding-highlight'),
        bubble: document.getElementById('onboarding-bubble'),
        step: document.getElementById('onboarding-step'),
        title: document.getElementById('onboarding-title'),
        text: document.getElementById('onboarding-text'),
        nextBtn: document.getElementById('onboarding-next'),
        skipBtn: document.getElementById('onboarding-skip')
    };
}

function positionOnboardingBubble(targetEl) {
    const { bubble, highlight } = getOnboardingElements();
    if (!bubble || !highlight) return;

    if (!targetEl) {
        highlight.style.width = '0px';
        highlight.style.height = '0px';
        bubble.style.left = '12px';
        bubble.style.top = '12px';
        return;
    }

    const rect = targetEl.getBoundingClientRect();
    const pad = 8;

    highlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    highlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    highlight.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
    highlight.style.height = `${Math.max(0, rect.height + pad * 2)}px`;

    const bubbleRect = bubble.getBoundingClientRect();
    const bw = bubbleRect.width || 320;
    const bh = bubbleRect.height || 180;
    const margin = 10;

    let x = rect.left + (rect.width / 2) - (bw / 2);
    x = clamp(x, margin, window.innerWidth - bw - margin);

    let y = rect.bottom + 12;
    if (y + bh > window.innerHeight - margin) {
        y = rect.top - bh - 12;
    }
    y = clamp(y, margin, window.innerHeight - bh - margin);

    bubble.style.left = `${Math.round(x)}px`;
    bubble.style.top = `${Math.round(y)}px`;
}

function renderOnboardingStep() {
    if (!onboardingState.active) return;

    const els = getOnboardingElements();
    const stepData = ONBOARDING_STEPS[onboardingState.currentIndex];
    if (!els.layer || !els.step || !els.title || !els.text || !els.nextBtn || !stepData) return;

    els.step.textContent = `${onboardingState.currentIndex + 1} / ${ONBOARDING_STEPS.length}`;
    els.title.textContent = stepData.title;
    els.text.textContent = stepData.text;
    els.nextBtn.textContent = onboardingState.currentIndex === ONBOARDING_STEPS.length - 1 ? '완료' : '다음';

    const targetEl = document.querySelector(stepData.target);
    positionOnboardingBubble(targetEl);
}

function finishOnboardingTutorial(markDone) {
    const els = getOnboardingElements();
    onboardingState.active = false;

    if (els.layer) {
        els.layer.classList.add('hidden');
        els.layer.setAttribute('aria-hidden', 'true');
    }

    if (markDone && currentUser?.id) {
        localStorage.setItem(getOnboardingDoneKey(currentUser.id), 'true');
    }
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    window.removeEventListener('resize', renderOnboardingStep);
}

function startOnboardingTutorialIfNeeded() {
    if (!currentUser?.id) return false;

    const pending = localStorage.getItem(ONBOARDING_PENDING_KEY) === 'true';
    const alreadyDone = localStorage.getItem(getOnboardingDoneKey(currentUser.id)) === 'true';
    if (!pending || alreadyDone) {
        if (alreadyDone) localStorage.removeItem(ONBOARDING_PENDING_KEY);
        return false;
    }

    const els = getOnboardingElements();
    if (!els.layer || !els.nextBtn || !els.skipBtn) return false;

    if (!els.nextBtn.dataset.bound) {
        els.nextBtn.addEventListener('click', () => {
            if (!onboardingState.active) return;
            if (onboardingState.currentIndex >= ONBOARDING_STEPS.length - 1) {
                finishOnboardingTutorial(true);
                return;
            }
            onboardingState.currentIndex += 1;
            renderOnboardingStep();
        });
        els.nextBtn.dataset.bound = 'true';
    }

    if (!els.skipBtn.dataset.bound) {
        els.skipBtn.addEventListener('click', () => finishOnboardingTutorial(true));
        els.skipBtn.dataset.bound = 'true';
    }

    onboardingState.active = true;
    onboardingState.currentIndex = 0;
    els.layer.classList.remove('hidden');
    els.layer.setAttribute('aria-hidden', 'false');

    renderOnboardingStep();
    window.addEventListener('resize', renderOnboardingStep);
    return true;
}

// ── 합격 확률 계산 (프론트엔드) ───────────────────────────────────────
(function() {
    function normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989422820 * Math.exp(-x * x / 2);
        const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
        const cdf = 1 - d * poly;
        return x > 0 ? cdf : 1 - cdf;
    }
    function probit(p) {
        if (p <= 0.0001) return -3.7;
        if (p >= 0.9999) return 3.7;
        const a = [2.515517, 0.802853, 0.010328];
        const b = [1.432788, 0.189269, 0.001308];
        if (p > 0.5) {
            const t = Math.sqrt(-2 * Math.log(1 - p));
            return t - (a[0] + t*(a[1] + t*a[2])) / (1 + t*(b[0] + t*(b[1] + t*b[2])));
        } else {
            const t = Math.sqrt(-2 * Math.log(p));
            return -(t - (a[0] + t*(a[1] + t*a[2])) / (1 + t*(b[0] + t*(b[1] + t*b[2]))));
        }
    }
    const SCORE_MEAN = 260, SCORE_STD = 40;
    window.percentileToCutline = function(basePercentile) {
        const p = Math.min(0.9999, Math.max(0.0001, basePercentile / 100));
        return Math.round(SCORE_MEAN + probit(p) * SCORE_STD);
    };
    window.getSigma = function(basePercentile) {
        const p = Math.max(0, Math.min(100, basePercentile));
        return (100 - p) * 0.12;
    };
    window.calcAcceptProb = function(userScore, basePercentile) {
        const cutline = SCORE_MEAN + probit(Math.min(0.9999, Math.max(0.0001, basePercentile / 100))) * SCORE_STD;
        const sigma = window.getSigma(basePercentile);
        const z = (userScore - cutline) / sigma;
        const raw = normalCDF(z);
        const rounded = Math.round(raw * 10) / 10;
        return Math.max(0.1, Math.min(0.9, rounded));
    };
    window.getUniBasePercentile = function(universityName) {
        if (!universityName) return null;
        const uni = allUniversities.find(u =>
            u.name === universityName ||
            (u.aliases && u.aliases.some(a => universityName.includes(a) || a.includes(universityName)))
        );
        return uni ? uni.basePercentile : null;
    };
})();

const container = document.getElementById('world-container');
const mapLayer  = document.getElementById('map-layer');

// ── 백분위 기반 건물 크기/밝기 ──────────────────────────────────────
function getBuildingStyle(percentile) {
    const pct = percentile || 50;
    if (pct >= 99)  return { img: '/assets/castle_main.png', sizePx: 480, brightness: 1.0 };
    if (pct >= 96)  return { img: '/assets/castle_main.png', sizePx: 380, brightness: 0.9 };
    if (pct >= 90)  return { img: '/assets/castle_main.png', sizePx: 300, brightness: 0.8 };
    if (pct >= 80)  return { img: '/assets/hut.png', sizePx: 180, brightness: 0.95 };
    if (pct >= 70)  return { img: '/assets/hut.png', sizePx: 145, brightness: 0.85 };
    if (pct >= 60)  return { img: '/assets/hut.png', sizePx: 115, brightness: 0.7 };
    return { img: '/assets/hut.png', sizePx: 90, brightness: 0.55 };
}

// ── 초기화 ───────────────────────────────────────────────────────────
async function initHub() {
    try {
        const [meRes, rankMeRes] = await Promise.all([
            fetch('/api/auth/me', { credentials: 'include' }),
            fetch('/api/ranking/me', { credentials: 'include' })
        ]);

        if (!meRes.ok) { window.location.href = '/login/'; return; }

        const meData = await meRes.json();
        currentUser = meData.user;

        let topPct = 100;
        if (rankMeRes.ok) {
            const rankData = await rankMeRes.json();
            myTotalSec = parseInt(rankData.total_sec || 0);
            topPct = parseFloat(rankData.pct) || 100;
            document.getElementById('hud-pct').textContent = `TIME TOP ${rankData.pct}%`;

            // [New] Score Percentile Display
            const elScore = document.getElementById('hud-score-pct');
            if (rankData.scorePct) {
                elScore.style.display = 'block';
                elScore.textContent = `SCORE TOP ${rankData.scorePct}%`;
            } else {
                elScore.style.display = 'none';
            }
        }

        // BG is replaced by the Three.js WorldScene; skip legacy BG.init

        updateHUD(currentUser);
        updateMyBuilding(currentUser);
        await Promise.all([loadRankingAndMap(), loadNotifBadge(), loadUniversitiesCache(), refreshFriendBadge()]);
        fetch('/api/friends/list', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(friends => {
            if (window.WorldScene) window.WorldScene.setFriendIds(friends.map(f => f.id));
        }).catch(() => {});

        const onboardingShown = startOnboardingTutorialIfNeeded();

        // [Agent Notice] Show once
        if (!onboardingShown && !localStorage.getItem('agent_notice_v1')) {
            setTimeout(() => togglePanel('panel-agent-notice'), 800);
            localStorage.setItem('agent_notice_v1', 'true');
        }
    } catch (e) {
        console.error('initHub 오류:', e);
    }
}

function secToHour(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function firstNonEmpty(...values) {
    for (const value of values) {
        if (typeof value !== 'string') continue;
        const v = value.trim();
        if (v) return v;
    }
    return '';
}

function getDisplayName(user) {
    return firstNonEmpty(
        user?.nickname,
        user?.display_nickname,
        user?.real_name,
        user?.name,
        user?.username,
        user?.user_code
    );
}

function mergeCurrentUser(nextUser) {
    currentUser = { ...(currentUser || {}), ...(nextUser || {}) };
    return currentUser;
}

function updateHUD(user) {
    const mergedUser = { ...(currentUser || {}), ...(user || {}) };
    const displayName = getDisplayName(mergedUser);
    document.getElementById('badge-char').textContent = (displayName || '?').charAt(0).toUpperCase();
    document.getElementById('hud-univ').textContent = displayName || '-';
    document.getElementById('hud-gold').textContent = (mergedUser.gold || 0).toLocaleString();
    document.getElementById('hud-hours').textContent = secToHour(myTotalSec);
    document.getElementById('hud-tickets').textContent = (mergedUser.tickets || 0) + '장';
}

function updateMyBuilding(user) {
    const img = document.getElementById('my-castle-img');
    const isLight = document.body.classList.contains('light');
    const skinId = user?.balloon_skin || 'default';
    const src = getBalloonSrc(skinId, isLight);
    if (img) { img.src = src; img.style.width = '160px'; }
    const label = document.getElementById('my-castle-label');
    if (label) label.textContent = user?.university || 'MY BALLOON';
    if (window.WorldScene && window.WorldScene.isReady) {
        window.WorldScene.updateMyBalloon(skinId);
    }
}

async function loadRankingAndMap() {
    try {
        const r = await fetch('/api/ranking', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        allUsers = data.ranking || [];
        renderOtherUsers(allUsers);
        if (!document.getElementById('panel-rank').classList.contains('hidden')) {
            loadRankPanel(currentRankTab);
        }
    } catch (e) {
        console.error('loadRankingAndMap 오류:', e);
    }
}

async function loadUniversitiesCache() {
    try {
        const r = await fetch('/api/universities', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        allUniversities = data.universities || [];
    } catch (e) {
        console.error('loadUniversitiesCache 오류:', e);
    }
}

function renderOtherUsers(users) {
    // Once realtime socket is active, world players are controlled by
    // players:nearby / player:enter / player:moved events.
    if (worldSocket) return;

    const isLight = document.body.classList.contains('light');
    if (window.WorldScene && window.WorldScene.isReady) {
        window.WorldScene.setUsers(users, currentUser, isLight);
    }
}

function _normalizeUserId(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// ── 랭킹 패널 ────────────────────────────────────────────────────────
async function loadRankPanel(tab) {
    const listEl = document.getElementById('rank-list');
    listEl.textContent = '로딩 중...';
    try {
        const url = tab === 'today' ? '/api/ranking/today' : '/api/ranking';
        const r = await fetch(url, { credentials: 'include' });
        const data = await r.json();
        const list = data.ranking;

        if (!list || list.length === 0) { listEl.textContent = '데이터 없음'; return; }

        listEl.innerHTML = list.map((u, i) => {
            const isMe = u.id === currentUser?.id;
            const val = tab === 'today'
                ? `<span style="color:#aaa">${secToHour(u.today_sec || 0)}</span>`
                : `<span style="color:#aaa">${secToHour(u.total_sec || 0)}</span>`;
            return `<div class="rank-item ${isMe ? 'me' : ''}" onclick="focusUser(${u.id})">
                <span class="rank-num">${i + 1}</span>
                <div style="flex:1;min-width:0">
                    <div class="rank-nick">${u.nickname} ${u.is_studying ? '<span class="rank-studying">📖</span>' : ''}</div>
                    <div class="rank-univ">${u.university || '-'}</div>
                </div>
                <div style="text-align:right">${val}</div>
            </div>`;
        }).join('');
    } catch (e) { listEl.textContent = '오류 발생'; }
}

function switchRankTab(tab, btn) {
    currentRankTab = tab;
    document.querySelectorAll('.rtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadRankPanel(tab);
}

// ── 알림 ─────────────────────────────────────────────────────────────
async function loadNotifBadge() {
    try {
        const r = await fetch('/api/notifications', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        const badge = document.getElementById('notif-badge');
        if (data.unread > 0) {
            badge.textContent = data.unread > 9 ? '9+' : data.unread;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    } catch (e) {}
}

async function loadNotifPanel() {
    const listEl = document.getElementById('notif-list');
    listEl.textContent = '로딩 중...';
    try {
        const r = await fetch('/api/notifications', { credentials: 'include' });
        const data = await r.json();
        if (!data.notifications || data.notifications.length === 0) {
            listEl.textContent = '알림이 없습니다.'; return;
        }
        listEl.innerHTML = data.notifications.map(n => {
            const d = new Date(n.created_at);
            const timeStr = d.toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
            return `<div class="notif-item ${n.is_read ? '' : 'unread'}">
                <div>${n.message}</div><div class="notif-time">${timeStr}</div>
            </div>`;
        }).join('');
        await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
        document.getElementById('notif-badge').classList.add('hidden');
    } catch (e) { listEl.textContent = '오류 발생'; }
}

// ── 성 내부 화면 ─────────────────────────────────────────────────────
async function openEstate() {
    try {
        const r = await fetch('/api/estate/tax', { credentials: 'include' });
        const data = await r.json();
        const score = currentUser?.mock_exam_score || 0;
        const scoreStatus = currentUser?.score_status || 'none';

        let rateParts = [];
        let rateDisplay = `${data.rate}G/hr`;
        if (data.nsuBonus || data.gpaBonus) {
            rateParts.push(data.baseRate || data.rate);
            if (data.nsuBonus) rateParts.push(`<span style="color:#4CAF50">+${data.nsuBonus} N수</span>`);
            if (data.gpaBonus) rateParts.push(`<span style="color:#2196F3">+${data.gpaBonus} 내신</span>`);
            rateDisplay = rateParts.join(' + ') + ` = ${data.rate}G/hr`;
        }

        let scoreSection = '';
        if (scoreStatus === 'approved') {
            scoreSection = `<div class="estate-val" style="color:#4CAF50">✓ 인증 완료 · ${score}점</div>`;
        } else if (scoreStatus === 'pending') {
            scoreSection = `<div class="estate-val" style="color:#f1c40f">⏳ 관리자 심사 대기 중</div>`;
        } else if (scoreStatus === 'rejected') {
            scoreSection = `
                <div class="estate-val" style="color:var(--accent);margin-bottom:6px">✗ 반려됨 — 재업로드 필요</div>
                <div class="score-upload-area" id="score-upload-area">
                    <input type="file" id="score-file" accept="image/*" style="display:none" onchange="previewScore(this)">
                    <button class="inline-btn" onclick="document.getElementById('score-file').click()">📷 성적 사진 선택</button>
                    <div id="score-preview" style="margin-top:6px"></div>
                    <button class="inline-btn" id="btn-upload-score" style="display:none;margin-top:6px" onclick="uploadScore()">업로드</button>
                </div>`;
        } else {
            scoreSection = `
                <div class="score-upload-area" id="score-upload-area">
                    <input type="file" id="score-file" accept="image/*" style="display:none" onchange="previewScore(this)">
                    <button class="inline-btn" onclick="document.getElementById('score-file').click()">📷 성적 사진 업로드</button>
                    <div id="score-preview" style="margin-top:6px"></div>
                    <button class="inline-btn" id="btn-upload-score" style="display:none;margin-top:6px" onclick="uploadScore()">업로드</button>
                </div>`;
        }

        const nsuLine = data.is_n_su && data.prev_university
            ? `<div class="estate-section"><div class="estate-label">🔄 N수생 전적대</div><div class="estate-val">${data.prev_university} <span style="color:#4CAF50;font-size:10px">(세금 +15% 보너스)</span></div></div>`
            : '';

        const interior = document.getElementById('castle-interior');
        document.getElementById('interior-body').innerHTML = `
            <div class="interior-grid">
                <div class="interior-card" style="grid-column:1/-1;">
                    <div class="interior-card-title">💬 상태 메시지</div>
                    <div class="estate-section">
                        <div style="display:flex;gap:8px;align-items:center;">
                            <input type="text" id="status-msg-input" class="interior-input" maxlength="30"
                                placeholder="열기구 위에 표시될 메시지를 입력하세요"
                                value="${esc(currentUser?.status_message || '')}">
                            <button id="status-msg-save-btn" class="inline-btn" onclick="saveStatusMsg(event)">저장</button>
                            <button class="inline-btn" style="color:#888;background:rgba(255,255,255,0.05);" onclick="document.getElementById('status-msg-input').value='';saveStatusMsg(event)">지우기</button>
                        </div>
                        <div style="margin-top:5px;font-size:10px;color:#555;">최대 30자 · 내 열기구 위에 말풍선으로 표시됩니다</div>
                    </div>
                </div>
                <div class="interior-card">
                    <div class="interior-card-title">🏫 모의진학 정보</div>
                    <div class="estate-section">
                        <div class="estate-label">대학교</div>
                        <div class="estate-val">${data.university || '-'} <span style="color:var(--text-sub);font-size:10px">(백분위 ${data.percentile}%)</span></div>
                    </div>
                    ${nsuLine}
                    <div class="estate-section">
                        <div class="estate-label">🪙 보유 골드</div>
                        <div class="estate-val">${(data.gold || 0).toLocaleString()}G</div>
                    </div>
                </div>

                <div class="interior-card">
                    <div class="interior-card-title">💰 수입</div>
                    <div class="estate-section">
                        <div class="estate-label">모의진학 수입 (패시브)</div>
                        <div class="estate-val">${rateDisplay}</div>
                    </div>
                    <div class="estate-section">
                        <div class="estate-label">미수령 세금</div>
                        <div class="estate-val" style="color:var(--gold);font-size:18px;font-weight:700">${data.pending}G</div>
                    </div>
                    <button class="interior-action-btn" onclick="collectTax()">💰 수입 수령</button>
                    <div class="estate-section" style="margin-top:8px">
                        <div class="estate-label">공부 수입</div>
                        <div class="estate-val">10G/hr (전 유저 동일)</div>
                    </div>
                </div>

                <div class="interior-card">
                    <div class="interior-card-title">📋 평가원 점수 인증</div>
                    ${scoreSection}
                </div>

                <div class="interior-card">
                    <div class="interior-card-title">📝 내신 등급 인증</div>
                    ${buildGpaSection()}
                </div>

                <div class="interior-card" id="gpa-compare-card" style="${currentUser?.gpa_status === 'approved' ? '' : 'display:none'}">
                    <div class="interior-card-title">🎯 합격 가능성 비교</div>
                    <div class="estate-section">
                        <div class="estate-label">내 내신: <strong style="color:var(--gold)">${currentUser?.gpa_score || '-'}등급</strong></div>
                    </div>
                    <div class="estate-section" style="margin-top:6px">
                        <input type="text" id="compare-univ-input" class="interior-input" placeholder="비교할 대학명 입력" value="${esc(currentUser?.university || '')}">
                        <button class="inline-btn" style="margin-top:6px" onclick="compareGpa()">비교하기</button>
                    </div>
                    <div id="gpa-compare-result" style="margin-top:8px"></div>
                </div>

                <div class="interior-card" style="grid-column: 1 / -1; max-height: 300px; overflow-y: auto;">
                    <div class="interior-card-title">🏰 대학 모의진학 목록</div>
                    <div id="university-estates-list" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;">로딩 중...</div>
                </div>
            </div>
        `;
        interior.classList.remove('hidden');
        loadUniversityEstates();
    } catch (e) { alert('정보를 불러오지 못했습니다.'); }
}

function buildGpaSection() {
    const gpaStatus = currentUser?.gpa_status || 'none';
    const gpaScore = currentUser?.gpa_score;
    const gpaPublic = currentUser?.gpa_public;

    if (gpaStatus === 'approved') {
        return `
            <div class="estate-val" style="color:#4CAF50">✓ 인증 완료 · ${gpaScore}등급</div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px">
                <label style="font-size:11px;color:var(--text-sub);cursor:pointer;display:flex;align-items:center;gap:4px">
                    <input type="checkbox" ${gpaPublic ? 'checked' : ''} onchange="toggleGpaPublic()">
                    내신 공개
                </label>
                <span style="font-size:10px;color:#555">${gpaPublic ? '다른 유저에게 표시됨' : '비공개 상태'}</span>
            </div>`;
    }
    if (gpaStatus === 'pending') {
        return `<div class="estate-val" style="color:#f1c40f">⏳ 관리자 심사 대기 중</div>`;
    }

    const label = gpaStatus === 'rejected'
        ? '<div class="estate-val" style="color:var(--accent);margin-bottom:6px">✗ 반려됨 — 재업로드 필요</div>'
        : '';

    return `
        ${label}
        <div class="score-upload-area">
            <input type="file" id="gpa-file" accept="image/*" style="display:none" onchange="previewGpa(this)">
            <button class="inline-btn" onclick="document.getElementById('gpa-file').click()">📷 내신 성적표 사진 선택</button>
            <div id="gpa-preview" style="margin-top:6px"></div>
            <button class="inline-btn" id="btn-upload-gpa" style="display:none;margin-top:6px" onclick="uploadGpa()">업로드</button>
        </div>`;
}

function previewGpa(input) {
    const preview = document.getElementById('gpa-preview');
    const uploadBtn = document.getElementById('btn-upload-gpa');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:150px;border-radius:4px;border:1px solid var(--border)">`;
            uploadBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function uploadGpa() {
    const fileInput = document.getElementById('gpa-file');
    if (!fileInput.files[0]) { alert('사진을 선택해주세요.'); return; }
    const formData = new FormData();
    formData.append('gpaImage', fileInput.files[0]);
    try {
        const r = await fetch('/api/auth/upload-gpa', {
            method: 'POST', credentials: 'include', body: formData
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '업로드 실패'); return; }
        alert('내신 성적표가 업로드되었습니다.\n관리자 승인 후 등급이 반영됩니다.');
        currentUser.gpa_status = 'pending';
        closeInterior();
    } catch (e) { alert('업로드 중 오류 발생'); }
}

async function toggleGpaPublic() {
    try {
        const r = await fetch('/api/auth/toggle-gpa-public', {
            method: 'POST', credentials: 'include'
        });
        const data = await r.json();
        if (r.ok) {
            currentUser.gpa_public = data.gpa_public;
        }
    } catch (e) {}
}

async function compareGpa() {
    const univInput = document.getElementById('compare-univ-input');
    const resultEl = document.getElementById('gpa-compare-result');
    const univ = univInput.value.trim();
    if (!univ) { resultEl.innerHTML = '<div style="color:var(--accent);font-size:11px">대학명을 입력해주세요.</div>'; return; }

    resultEl.innerHTML = '<div style="color:#888;font-size:11px">분석 중...</div>';
    try {
        const r = await fetch(`/api/university/compare-gpa?university=${encodeURIComponent(univ)}&gpa=${currentUser.gpa_score}`, { credentials: 'include' });
        const data = await r.json();

        if (!data.found) {
            resultEl.innerHTML = '<div style="color:var(--accent);font-size:11px">등록되지 않은 대학입니다.</div>';
            return;
        }

        if (!data.departments || data.departments.length === 0) {
            resultEl.innerHTML = '<div style="color:#888;font-size:11px">내신 기준 입결 데이터가 없습니다.</div>';
            return;
        }

        const chanceLabel = { high: '🟢 안정', medium: '🟡 적정', low: '🟠 소신', very_low: '🔴 위험' };
        const chanceColor = { high: '#4CAF50', medium: '#f1c40f', low: '#ff9800', very_low: '#e74c3c' };

        let html = `<div style="font-size:11px;color:var(--text-sub);margin-bottom:6px">${esc(data.university)} · 내 내신 ${data.myGpa}등급</div>`;
        html += '<div style="max-height:200px;overflow-y:auto">';
        data.departments.forEach(dept => {
            html += `<div style="padding:6px 0;border-bottom:1px solid var(--border)">`;
            html += `<div style="font-size:12px;font-weight:600;color:var(--text)">${esc(dept.department)} <span style="font-size:10px;color:#666">${esc(dept.category)}</span></div>`;
            for (const [type, comp] of Object.entries(dept.comparisons)) {
                const cutoff = comp.cutoff || comp.reference;
                const chance = chanceLabel[comp.chance] || comp.chance;
                const color = chanceColor[comp.chance] || '#888';
                html += `<div style="font-size:11px;color:#aaa;margin-top:2px">${type}: 커트라인 ${cutoff}등급 → <span style="color:${color};font-weight:600">${chance}</span></div>`;
            }
            html += `</div>`;
        });
        html += '</div>';
        resultEl.innerHTML = html;
    } catch (e) { resultEl.innerHTML = '<div style="color:var(--accent);font-size:11px">오류 발생</div>'; }
}

function previewScore(input) {
    const preview = document.getElementById('score-preview');
    const uploadBtn = document.getElementById('btn-upload-score');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
            preview.innerHTML = `<img src="${e.target.result}" style="max-width:200px;max-height:150px;border-radius:4px;border:1px solid var(--border)">`;
            uploadBtn.style.display = 'inline-block';
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function uploadScore() {
    const fileInput = document.getElementById('score-file');
    if (!fileInput.files[0]) { alert('사진을 선택해주세요.'); return; }
    const formData = new FormData();
    formData.append('scoreImage', fileInput.files[0]);
    try {
        const r = await fetch('/api/auth/upload-score', {
            method: 'POST', credentials: 'include', body: formData
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '업로드 실패'); return; }
        alert('성적 사진이 업로드되었습니다.\n관리자 승인 후 점수가 반영됩니다.');
        currentUser.score_status = 'pending';
        closeInterior();
    } catch (e) { alert('업로드 중 오류 발생'); }
}

function closeInterior() {
    document.getElementById('castle-interior').classList.add('hidden');
}

async function refreshCurrentUser() {
    try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (r.ok) {
            const data = await r.json();
            currentUser = mergeCurrentUser(data.user);
            updateHUD(currentUser);
        }
    } catch (e) {}
}

async function collectTax() {
    try {
        const r = await fetch('/api/estate/collect-tax', { method: 'POST', credentials: 'include' });
        const data = await r.json();
        if (data.collected > 0) {
            alert(`+${data.collected.toLocaleString()}G 수령 완료!`);
            await refreshCurrentUser();
        } else {
            alert(data.message || '수령할 세금이 없습니다.');
        }
        closeInterior();
    } catch (e) { alert('오류 발생'); }
}


// ── 유저 모달 (도전/모의지원) ─────────────────────────────────────────
function openUserModal(user) {
    selectedUser = user;
    document.getElementById('user-modal-title').textContent = `🎓 ${user.nickname}의 모의진학`;
    const myScore = currentUser?.mock_exam_score || 0;

    // 합격 확률 계산
    const bp = getUniBasePercentile(user.university);
    let probHTML = '';
    if (myScore > 0 && bp !== null) {
        const prob = calcAcceptProb(myScore, bp);
        const probPct = Math.round(prob * 100);
        const cutline = percentileToCutline(bp);
        const probColor = probPct >= 70 ? '#4CAF50' : probPct >= 40 ? 'var(--accent-gold)' : '#e55';
        probHTML = `
            <div style="margin-top:10px;padding:10px 12px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;">
                <div style="font-size:10px;color:var(--text-sub);letter-spacing:1px;font-weight:700;margin-bottom:8px;">모의지원 합격 확률</div>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                    <span style="font-size:28px;font-weight:800;color:${probColor};font-family:var(--font-mono);">${probPct}%</span>
                    <div style="text-align:right;font-size:10px;color:#666;line-height:1.6;">
                        내 점수: <strong style="color:var(--text)">${myScore}점</strong><br>
                        컷트라인: <strong style="color:var(--text)">${cutline}점</strong>
                    </div>
                </div>
                <div style="background:var(--border);border-radius:3px;height:4px;overflow:hidden;">
                    <div style="width:${probPct}%;height:100%;background:${probColor};border-radius:3px;transition:width 0.4s ease;"></div>
                </div>
                <div style="font-size:10px;color:#666;margin-top:6px;line-height:1.5;">
                    📄 원서비 1장 소모 · 합격 시 <strong style="color:var(--accent-gold)">${esc(user.university)}</strong> 취득
                </div>
            </div>
        `;
    } else if (myScore < 1) {
        probHTML = `<div style="margin-top:10px;padding:8px 12px;border:1px solid rgba(255,100,100,0.2);border-radius:6px;font-size:11px;color:#e88;">내 성채에서 점수를 먼저 등록하세요.</div>`;
    } else {
        probHTML = `<div style="margin-top:10px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;font-size:11px;color:#666;">해당 대학 정보가 없습니다.</div>`;
    }

    document.getElementById('user-modal-body').innerHTML = `
        <div class="estate-section">
            <div class="estate-label">🏫 모의진학 대학</div>
            <div class="estate-val">${esc(user.university) || '-'}</div>
        </div>
        <div class="estate-section">
            <div class="estate-label">📖 공부 시간</div>
            <div class="estate-val">${secToHour(user.total_sec || 0)}</div>
        </div>
        <div class="estate-section">
            <div class="estate-label">상태</div>
            <div class="estate-val">${user.is_studying ? '📖 공부 중' : '휴식 중'}</div>
        </div>
        ${probHTML}
    `;
    const tickets = currentUser?.tickets || 0;
    const hasScore = myScore > 0;
    const btn = document.getElementById('btn-invade');
    const disabled = tickets < 1 || !hasScore;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.4' : '1';

    // 친구 상태 및 메시지 버튼 처리
    const btnFriend = document.getElementById('btn-friend-action');
    const btnMsg = document.getElementById('btn-send-msg');
    btnFriend.style.display = 'none';
    btnMsg.style.display = 'none';
    if (user.id !== currentUser?.id) {
        loadFriendStatusForModal(user.id);
    }

    document.getElementById('modal-user').classList.remove('hidden');
}

async function loadFriendStatusForModal(targetId) {
    try {
        const r = await fetch(`/api/friends/status/${targetId}`, { credentials: 'include' });
        const data = await r.json();
        const btnF = document.getElementById('btn-friend-action');
        const btnM = document.getElementById('btn-send-msg');
        btnF.dataset.targetId = targetId;
        btnF.dataset.friendshipId = data.friendship_id || '';
        btnF.dataset.friendStatus = data.status;
        btnF.dataset.isSender = data.is_sender ? '1' : '0';

        if (data.status === 'none') {
            btnF.textContent = '동맹 신청';
            btnF.style.display = 'inline-block';
            btnF.style.borderColor = '';
            btnF.style.color = '';
        } else if (data.status === 'pending' && !data.is_sender) {
            btnF.textContent = '신청 수락';
            btnF.style.display = 'inline-block';
            btnF.style.borderColor = '#4CAF50';
            btnF.style.color = '#4CAF50';
        } else if (data.status === 'pending' && data.is_sender) {
            btnF.textContent = '신청 취소';
            btnF.style.display = 'inline-block';
            btnF.style.borderColor = '#999';
            btnF.style.color = '#999';
        } else if (data.status === 'accepted') {
            btnF.textContent = '동맹 해제';
            btnF.style.display = 'inline-block';
            btnF.style.borderColor = '#e55';
            btnF.style.color = '#e55';
            btnM.style.display = 'inline-block';
        }
    } catch (e) {}
}

async function doFriendAction() {
    const btn = document.getElementById('btn-friend-action');
    const targetId = parseInt(btn.dataset.targetId);
    const status = btn.dataset.friendStatus;
    const friendshipId = btn.dataset.friendshipId;
    const isSender = btn.dataset.isSender === '1';

    if (status === 'none') {
        const r = await fetch('/api/friends/request', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ target_id: targetId })
        });
        const d = await r.json();
        if (!r.ok) return alert(d.error || '오류 발생');
        alert('동맹 신청을 보냈습니다!');
    } else if (status === 'pending' && !isSender) {
        const r = await fetch('/api/friends/accept', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ friendship_id: parseInt(friendshipId) })
        });
        if (r.ok) alert('동맹을 맺었습니다!');
    } else if (status === 'pending' && isSender) {
        await fetch('/api/friends/reject', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include', body: JSON.stringify({ friendship_id: parseInt(friendshipId) })
        });
    } else if (status === 'accepted') {
        if (!confirm('동맹을 해제하시겠습니까?')) return;
        await fetch(`/api/friends/${targetId}`, { method: 'DELETE', credentials: 'include' });
    }
    loadFriendStatusForModal(targetId);
    refreshFriendBadge();
}

function openChatFromModal() {
    if (!selectedUser) return;
    closeModal('modal-user');
    openMessengerPanel();
    setTimeout(() => openChat(selectedUser.id, selectedUser.nickname), 200);
}

async function doInvade() {
    if (!selectedUser) return;
    if ((currentUser?.tickets || 0) < 1) { alert('원서비가 없습니다.\nSHOP에서 골드로 구매하세요!'); return; }
    if (!currentUser?.mock_exam_score) { alert('평가원 점수를 먼저 등록해주세요.\n(내 성채 클릭 → 점수 등록)'); return; }

    if (!confirm(`${selectedUser.nickname}의 모의진학(${selectedUser.university || '?'})에 지원하시겠습니까?\n원서비 1장 소모`)) return;

    try {
        const r = await fetch('/api/invasion/attack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ defender_id: selectedUser.id })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '오류 발생'); return; }

        const won = data.result === 'WIN';
        const probLine = data.accept_prob != null ? `\n합격 확률: ${data.accept_prob}%` : '';
        const msg = won
            ? `🎉 모의지원 합격!\n\n내 점수: ${data.attacker_score}점${probLine}\n🏫 대학: ${data.defender_university}(으)로 변경!`
            : `📝 모의지원 불합격\n\n내 점수: ${data.attacker_score}점${probLine}\n\n더 열심히 공부해서 다시 도전하세요!`;
        alert(msg);
        currentUser = mergeCurrentUser(data.user);
        updateHUD(data.user);
        updateMyBuilding(data.user);
        closeModal('modal-user');
        loadRankingAndMap();
    } catch (e) { alert('서버 오류 발생'); }
}

// ── 모의지원 패널 ──────────────────────────────────────────────────────
async function toggleApplyPanel() {
    const panel = document.getElementById('panel-apply');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        await renderApplyPanel();
    } else {
        panel.classList.add('hidden');
    }
}

async function renderApplyPanel() {
    const content = document.getElementById('apply-content');
    content.innerHTML = '<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-sub)">로딩 중...</div>';
    try {
        const r = await fetch('/api/invasion/my-applications', { credentials: 'include' });
        const data = await r.json();
        if (!r.ok) { content.innerHTML = `<div style="color:var(--accent);padding:16px;font-size:12px">${data.error}</div>`; return; }

        const { max_slots, used_slots, my_score, score_status, tickets, applications } = data;
        const remaining = Math.max(0, max_slots - used_slots);

        const slotCircles = Array.from({ length: max_slots }, (_, i) => {
            const used = i < used_slots;
            return `<div style="width:22px;height:22px;border-radius:50%;border:2px solid ${used ? 'var(--accent-gold)' : 'var(--border)'};background:${used ? 'var(--accent-gold)' : 'transparent'};"></div>`;
        }).join('');

        const noScore = !my_score || my_score < 1 || score_status !== 'approved';
        const scoreLabel = noScore
            ? `<span style="color:#888">미인증 (점수 인증 시 슬롯 확대)</span>`
            : `<span style="color:var(--accent-gold)">${my_score}점</span>`;

        // 이력 항목별 합격 확률 계산 (프론트엔드)
        const histHTML = applications.length === 0
            ? '<div style="color:#555;font-size:11px;text-align:center;padding:16px;">지원 이력이 없습니다.</div>'
            : applications.map(app => {
                const won = app.result === 'WIN';
                const date = new Date(app.created_at).toLocaleDateString('ko-KR', { month:'numeric', day:'numeric' });
                const bp = getUniBasePercentile(app.target_university);
                let probStr = '';
                if (bp !== null && app.my_score > 0) {
                    const prob = Math.round(calcAcceptProb(app.my_score, bp) * 100);
                    probStr = ` · 확률 ${prob}%`;
                } else if (app.accept_prob) {
                    probStr = ` · 확률 ${app.accept_prob}%`;
                }
                return `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border:1px solid ${won ? 'rgba(212,175,55,0.3)' : 'var(--border)'};border-radius:4px;background:${won ? 'rgba(212,175,55,0.05)' : 'transparent'};">
                        <div>
                            <div style="font-size:12px;font-weight:600;color:var(--text);">${esc(app.target_university || '?')}</div>
                            <div style="font-size:10px;color:#666;margin-top:1px;">${esc(app.target_nickname)} · ${date}${probStr}</div>
                        </div>
                        <div style="text-align:right;flex-shrink:0;margin-left:8px;">
                            <div style="font-size:12px;font-weight:700;color:${won ? 'var(--accent-gold)' : '#e55'};">${won ? '합격' : '불합격'}</div>
                            <div style="font-size:10px;color:#666;">${app.my_score}점</div>
                        </div>
                    </div>
                `;
            }).join('');

        content.innerHTML = `
            <div style="padding:14px 14px 8px;">
                <div style="font-size:10px;color:var(--text-sub);letter-spacing:1px;font-weight:700;margin-bottom:8px;">진학사 슬롯</div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                    <div style="display:flex;gap:6px;">${slotCircles}</div>
                    <span style="font-size:11px;color:var(--text-sub);">${used_slots}/${max_slots} 사용</span>
                </div>
                <div style="font-size:11px;color:var(--text-sub);margin-bottom:4px;">
                    내 점수: ${scoreLabel}
                </div>
                <div style="font-size:10px;color:#555;line-height:1.5;">
                    원서비: <strong style="color:var(--accent-gold)">${tickets}장</strong> 보유 · 오늘 <strong style="color:${remaining > 0 ? 'var(--accent-gold)' : '#e55'}">${remaining}회</strong> 지원 가능
                </div>
                ${noScore ? `<div style="margin-top:8px;padding:7px 10px;background:rgba(255,100,100,0.06);border:1px solid rgba(255,100,100,0.2);border-radius:4px;font-size:10px;color:#e88;line-height:1.5;">점수 인증 후 슬롯이 확장됩니다.<br>내 성채 → 점수 등록에서 인증하세요.</div>` : ''}
            </div>

            <div style="border-top:1px solid var(--border);padding:10px 14px 4px;">
                <div style="font-size:10px;color:var(--text-sub);letter-spacing:1px;font-weight:700;margin-bottom:8px;">지원하기</div>
                <div style="font-size:11px;color:#666;margin-bottom:10px;line-height:1.5;">맵에서 다른 유저의 열기구를 클릭하거나, 랭킹에서 유저를 선택하여 도전하세요.<br>원서비 1장 소모 · 점수 비교로 합격 여부 결정</div>
                <button class="shop-btn" style="width:100%;padding:8px;font-size:11px;" onclick="togglePanel('panel-apply');togglePanel('panel-rank')">랭킹에서 도전 상대 찾기 →</button>
            </div>

            <div style="border-top:1px solid var(--border);padding:10px 14px;">
                <div style="font-size:10px;color:var(--text-sub);letter-spacing:1px;font-weight:700;margin-bottom:8px;">지원 이력</div>
                <div style="display:flex;flex-direction:column;gap:5px;">${histHTML}</div>
            </div>
        `;
    } catch (e) {
        content.innerHTML = '<div style="color:var(--accent);padding:16px;font-size:12px">로드 실패</div>';
    }
}

// ── 검색 ─────────────────────────────────────────────────────────────
function onSearch(value) {
    const q = value.trim().toLowerCase();
    if (!q) { renderOtherUsers(allUsers); return; }
    const filtered = allUsers.filter(u =>
        u.nickname.toLowerCase().includes(q) ||
        (u.university && u.university.toLowerCase().includes(q))
    );
    renderOtherUsers(filtered);
    if (filtered.length > 0 && filtered[0].id !== currentUser?.id) {
        if (window.WorldScene) window.WorldScene.focusUserById(filtered[0].id);
    }
}

function focusUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    openUserModal(user);
    if (window.WorldScene) window.WorldScene.focusUserById(userId);
}

// ── 패널/모달 ────────────────────────────────────────────────────────
function togglePanel(id) {
    const el = document.getElementById(id);
    const isHidden = el.classList.contains('hidden');

    document.querySelectorAll('.glass-panel').forEach(p => {
        if (p.id !== id) p.classList.add('hidden');
    });

    if (isHidden) {
        el.classList.remove('hidden');
        if (id === 'panel-rank') loadRankPanel(currentRankTab);
        if (id === 'panel-notif') loadNotifPanel();
        if (id === 'panel-shop') renderShopContent(currentShopTab);
        if (id === 'panel-settings') loadSettingsPanel();

    } else {
        el.classList.add('hidden');
        // Clean up shop 3D renderers when closing shop panel
        if (id === 'panel-shop') cleanupShopBalloonRenderers();
    }
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// ── 드래그 / 줌 ── WorldScene이 입력을 직접 처리 ──────────────────────
function startDrag(e) {}
function endDrag() {}
function onDrag(e) {}
function zoomMap(delta) {
    if (window.WorldScene) window.WorldScene.zoom(delta);
}
function panMap(dx, dy) {}
function applyTransform() {}
function returnToHome() {
    if (window.WorldScene) window.WorldScene.focusHome();
}

function goToTimer() {
    window.location.href = '/timer/';
}

function goToCommunity() {
    window.location.href = '/community/';
}

async function doLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login/';
}

/* ── SHOP SYSTEM ── */
let currentShopTab = 'item';
let shopBalloonRenderers = []; // Track 3D renderers for cleanup

function switchShopTab(tab, btn) {
    currentShopTab = tab;
    const parent = btn.parentElement;
    parent.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cleanupShopBalloonRenderers(); // Clean up before switching
    renderShopContent(tab);
}

// Clean up all 3D balloon renderers
function cleanupShopBalloonRenderers() {
    shopBalloonRenderers.forEach(r => {
        if (r.animationId) cancelAnimationFrame(r.animationId);
        if (r.renderer) r.renderer.dispose();
        if (r.scene) {
            r.scene.traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) {
                        obj.material.forEach(m => m.dispose());
                    } else {
                        obj.material.dispose();
                    }
                }
            });
        }
    });
    shopBalloonRenderers = [];
}

// Create 3D balloon colors (matches scene.js)
function getBalloonColors(colorScheme) {
    const schemes = {
        default: {
            primary: 0xff4444,
            secondary: 0xffaa44,
            accent: 0xffdd00
        },
        rainbow: {
            primary: 0xff00ff,
            secondary: 0x00ffff,
            accent: 0xffff00
        },
        pastel: {
            primary: 0xffb6c1,
            secondary: 0xb0e0e6,
            accent: 0xffd700
        },
        redstripes: {
            primary: 0xcc0000,
            secondary: 0xffffff,
            accent: 0xcc0000
        },
        golden: {
            primary: 0xffd700,
            secondary: 0xdaa520,
            accent: 0xffdf00
        },
        cosmic: {
            primary: 0x0d1b2a,
            secondary: 0x1b263b,
            accent: 0x415a77
        },
        sunset: {
            primary: 0xff6b35,
            secondary: 0xff9a56,
            accent: 0xffcc00
        },
        emerald: {
            primary: 0x2ecc71,
            secondary: 0x27ae60,
            accent: 0x1abc9c
        },
        phoenix: {
            primary: 0xff4500,
            secondary: 0xff8c00,
            accent: 0xffd700
        },
        galaxy: {
            primary: 0x6a0dad,
            secondary: 0x9932cc,
            accent: 0x00ced1
        },
        diamond: {
            primary: 0xe8f4f8,
            secondary: 0xb0e0e6,
            accent: 0xffffff
        }
    };
    return schemes[colorScheme] || schemes.default;
}

// Create 3D balloon model (matches scene.js)
function make3DBalloonPreview(scale, colorScheme) {
    const group = new THREE.Group();
    const colors = getBalloonColors(colorScheme);

    // Main balloon envelope (spherical shape)
    const balloonGeo = new THREE.SphereGeometry(scale * 40, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.75);
    const balloonMat = new THREE.MeshStandardMaterial({
        color: colors.primary,
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide
    });
    const balloonMesh = new THREE.Mesh(balloonGeo, balloonMat);
    balloonMesh.position.y = scale * 20;
    group.add(balloonMesh);

    // Vertical stripes on balloon for visual detail
    const numStripes = 8;
    for (let i = 0; i < numStripes; i++) {
        const angle = (i / numStripes) * Math.PI * 2;
        const stripeGeo = new THREE.PlaneGeometry(scale * 8, scale * 60);
        const stripeMat = new THREE.MeshStandardMaterial({
            color: colors.secondary,
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6
        });
        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.x = Math.cos(angle) * scale * 35;
        stripe.position.z = Math.sin(angle) * scale * 35;
        stripe.position.y = scale * 20;
        stripe.lookAt(0, scale * 20, 0);
        group.add(stripe);
    }

    // Top cap of balloon
    const capGeo = new THREE.SphereGeometry(scale * 8, 12, 8);
    const capMat = new THREE.MeshStandardMaterial({
        color: colors.accent,
        roughness: 0.6,
        metalness: 0.2
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = scale * 50;
    group.add(cap);

    // Basket (rectangular box)
    const basketGeo = new THREE.BoxGeometry(scale * 20, scale * 15, scale * 20);
    const basketMat = new THREE.MeshStandardMaterial({
        color: 0x8b6914,
        roughness: 0.9,
        metalness: 0.0
    });
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.y = scale * -25;
    group.add(basket);

    // Basket ropes connecting to balloon
    const ropeMat = new THREE.MeshStandardMaterial({
        color: 0x654321,
        roughness: 0.95,
        metalness: 0.0
    });

    const ropePositions = [
        { x: scale * 10, z: scale * 10 },
        { x: -scale * 10, z: scale * 10 },
        { x: scale * 10, z: -scale * 10 },
        { x: -scale * 10, z: -scale * 10 }
    ];

    ropePositions.forEach(pos => {
        const ropeGeo = new THREE.CylinderGeometry(scale * 0.5, scale * 0.5, scale * 35, 4);
        const rope = new THREE.Mesh(ropeGeo, ropeMat);
        rope.position.set(pos.x, scale * -5, pos.z);
        group.add(rope);
    });

    return group;
}

// Create a mini 3D scene for a balloon preview
function createBalloonPreviewCanvas(skinId, size = 80) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    canvas.style.display = 'block';
    canvas.style.margin = '0 auto 6px';

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
    camera.position.set(0, 0, 120);
    camera.lookAt(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);

    // Create 3D balloon model
    const balloon = make3DBalloonPreview(0.8, skinId);
    scene.add(balloon);

    // Animation loop with rotation
    let rotation = 0;
    const animate = () => {
        rotation += 0.01;
        balloon.rotation.y = rotation;
        renderer.render(scene, camera);
        const animationId = requestAnimationFrame(animate);

        // Store animation ID for cleanup
        rendererData.animationId = animationId;
    };

    const rendererData = { renderer, scene, balloon, animationId: null };
    shopBalloonRenderers.push(rendererData);

    animate();

    return canvas;
}

// Build a resilient skin preview element.
// Prefer 3D canvas, but gracefully fall back to image preview when WebGL is unavailable.
function createSkinPreviewElement(skin, isLight, size = 80) {
    const fallbackImg = document.createElement('img');
    fallbackImg.alt = `${skin?.name || 'balloon'} preview`;
    fallbackImg.width = size;
    fallbackImg.height = size;
    fallbackImg.style.cssText = `width:${size}px;height:${size}px;display:block;margin:0 auto 6px;object-fit:contain;`;

    const fallbackSrc = isLight ? 'assets/balloon_light.png' : 'assets/balloon_dark.png';
    const skinSrc = skin
        ? `assets/${isLight ? (skin.lightImg || skin.darkImg) : (skin.darkImg || skin.lightImg)}`
        : fallbackSrc;
    fallbackImg.src = skinSrc;
    fallbackImg.onerror = () => {
        // Some premium image assets may not exist yet in this build.
        fallbackImg.src = fallbackSrc;
    };

    try {
        if (typeof THREE === 'undefined' || !THREE || !THREE.WebGLRenderer) return fallbackImg;
        return createBalloonPreviewCanvas(skin?.id || 'default', size);
    } catch (_) {
        return fallbackImg;
    }
}

async function renderShopContent(tab) {
    const container = document.getElementById('shop-content');
    if (!container) return;
    container.innerHTML = '<div style="color:#666;text-align:center;padding:20px;font-size:12px">로딩 중...</div>';

        const medicalUnivs = [
            { name: '의예과', region: '전국', basePercentile: 99.8, aliases: ['의대'] },
            { name: '치의예과', region: '전국', basePercentile: 99.5, aliases: ['치대'] },
            { name: '한의예과', region: '전국', basePercentile: 99.2, aliases: ['한의대'] },
            { name: '약학과', region: '전국', basePercentile: 99.0, aliases: ['약대'] },
            { name: '수의예과', region: '전국', basePercentile: 99.3, aliases: ['수의대'] }
        ];

        if (tab === 'item') {
            try {
                const univRes = await fetch('/api/university/list', { credentials: 'include' });
                const univData = univRes.ok ? await univRes.json() : { universities: [] };
                const rawUniversities = univData.universities || [];
                const universities = [...medicalUnivs, ...rawUniversities];
                const myTickets = currentUser?.tickets || 0;
            const myGold = currentUser?.gold || 0;

            container.innerHTML = `
                <div style="padding:10px 0 6px;">
                    <div style="font-size:10px;color:#555;letter-spacing:1px;margin-bottom:10px;">
                        보유 원서비: <strong style="color:var(--gold)">${myTickets}장</strong>
                        &nbsp;|&nbsp; 보유 골드: <strong style="color:var(--gold)">${myGold.toLocaleString()}G</strong>
                    </div>
                    <div style="font-size:10px;color:#666;margin-bottom:8px;">목표 대학을 선택하면 해당 대학 기준 원서비를 구매할 수 있습니다.</div>
                    <input type="text" id="shop-univ-search" placeholder="대학 검색..."
                        style="width:100%;box-sizing:border-box;background:rgba(255,255,255,0.04);border:1px solid var(--border);color:var(--text);padding:7px 10px;font-size:12px;border-radius:4px;outline:none;margin-bottom:10px;"
                        oninput="filterShopUnivList(this.value)">
                    <div id="shop-univ-list" style="display:flex;flex-direction:column;gap:4px;max-height:360px;overflow-y:auto;"></div>
                </div>
            `;

            window._shopUniversities = universities;
            renderShopUnivList(universities);
        } catch (e) {
            container.innerHTML = '<div style="color:var(--accent);text-align:center;padding:20px;font-size:12px">정보를 불러오지 못했습니다.</div>';
        }
    } else if (tab === 'skin') {
        try {
            const skinRes = await fetch('/api/estate/skins', { credentials: 'include' });
            const skinData = skinRes.ok ? await skinRes.json() : { skins: [], owned: ['default'], equipped: 'default' };
            const { skins, owned, equipped } = skinData;
            const myGold = currentUser?.gold || 0;
            const isLight = document.body.classList.contains('light');

            container.innerHTML = `
                <div style="padding:10px 0 6px;">
                    <div style="font-size:10px;color:#555;letter-spacing:1px;margin-bottom:12px;">
                        보유 골드: <strong style="color:var(--gold)">${myGold.toLocaleString()}G</strong>
                    </div>
                    <div id="skin-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"></div>
                </div>
            `;

            const grid = container.querySelector('#skin-grid');
            skins.forEach(skin => {
                const isOwned = owned.includes(skin.id);
                const isEquipped = equipped === skin.id;

                const card = document.createElement('div');
                card.style.cssText = `border:1px solid ${isEquipped ? 'var(--accent-gold)' : 'var(--border)'};border-radius:6px;padding:10px;text-align:center;background:${isEquipped ? 'rgba(255,193,7,0.07)' : 'transparent'};position:relative;`;

                // Create a container div for the canvas
                const canvasContainer = document.createElement('div');
                canvasContainer.style.cssText = 'width:80px;height:80px;margin:0 auto 6px;';
                card.appendChild(canvasContainer);

                // Add text content
                const nameDiv = document.createElement('div');
                nameDiv.style.cssText = 'font-size:11px;font-weight:600;color:var(--text);margin-bottom:2px;';
                nameDiv.textContent = skin.name;
                card.appendChild(nameDiv);

                const priceDiv = document.createElement('div');
                priceDiv.style.cssText = 'font-size:10px;color:#666;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:3px;';
                if (skin.price === 0) {
                    priceDiv.textContent = '무료';
                } else {
                    priceDiv.innerHTML = `<img src="assets/coin.png" style="width:10px;height:10px;">${skin.price.toLocaleString()}G`;
                }
                card.appendChild(priceDiv);

                // Add button
                const btnDiv = document.createElement('div');
                if (isEquipped) {
                    btnDiv.style.cssText = 'font-size:10px;color:var(--accent-gold);letter-spacing:1px;';
                    btnDiv.innerHTML = '✓ 장착 중';
                } else if (isOwned) {
                    btnDiv.innerHTML = `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="equipSkin('${skin.id}')">장착</button>`;
                } else if (skin.price === 0) {
                    btnDiv.innerHTML = `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="buySkin('${skin.id}', 0)">획득</button>`;
                } else {
                    btnDiv.innerHTML = `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="buySkin('${skin.id}', ${skin.price})">${skin.price.toLocaleString()}G 구매</button>`;
                }
                card.appendChild(btnDiv);

                grid.appendChild(card);

                const previewEl = createSkinPreviewElement(skin, isLight, 80);
                canvasContainer.appendChild(previewEl);
            });
        } catch (e) {
            container.innerHTML = '<div style="color:var(--accent);text-align:center;padding:20px;font-size:12px">로드 실패</div>';
        }
    } else if (tab === 'aura') {
        try {
            const auraRes = await fetch('/api/estate/auras', { credentials: 'include' });
            const auraData = auraRes.ok ? await auraRes.json() : { auras: [], owned: ['none'], equipped: 'none' };
            const { auras, owned, equipped } = auraData;
            const myGold = currentUser?.gold || 0;

            container.innerHTML = `
                <div style="padding:10px 0 6px;">
                    <div style="font-size:10px;color:#555;letter-spacing:1px;margin-bottom:12px;">
                        보유 골드: <strong style="color:var(--gold)">${myGold.toLocaleString()}G</strong>
                    </div>
                    <div id="aura-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"></div>
                </div>
            `;

            const grid = container.querySelector('#aura-grid');
            auras.forEach(aura => {
                const isOwned = owned.includes(aura.id);
                const isEquipped = equipped === aura.id;

                const card = document.createElement('div');
                card.style.cssText = `border:1px solid ${isEquipped ? 'var(--accent-gold)' : 'var(--border)'};border-radius:6px;padding:10px;text-align:center;background:${isEquipped ? 'rgba(255,193,7,0.07)' : 'transparent'};position:relative;`;

                const preview = document.createElement('div');
                const auraColor = {
                    none: '#7f8798',
                    sun: '#ffc44d',
                    frost: '#7fd9ff',
                    forest: '#67d57a',
                    cosmic: '#9e8dff',
                    royal: '#e08bff'
                }[aura.id] || '#8aa1ff';
                preview.style.cssText = `width:54px;height:54px;margin:0 auto 8px;border-radius:50%;border:2px solid ${auraColor};box-shadow:0 0 0 4px ${auraColor}22, 0 0 16px ${auraColor}66 inset;`;
                card.appendChild(preview);

                const nameDiv = document.createElement('div');
                nameDiv.style.cssText = 'font-size:11px;font-weight:600;color:var(--text);margin-bottom:2px;';
                nameDiv.textContent = aura.name;
                card.appendChild(nameDiv);

                const descDiv = document.createElement('div');
                descDiv.style.cssText = 'font-size:9px;color:#7b8498;margin-bottom:6px;min-height:24px;';
                descDiv.textContent = aura.desc || '';
                card.appendChild(descDiv);

                const priceDiv = document.createElement('div');
                priceDiv.style.cssText = 'font-size:10px;color:#666;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:3px;';
                if (aura.price === 0) {
                    priceDiv.textContent = '무료';
                } else {
                    priceDiv.innerHTML = `<img src="assets/coin.png" style="width:10px;height:10px;">${aura.price.toLocaleString()}G`;
                }
                card.appendChild(priceDiv);

                const btnDiv = document.createElement('div');
                if (isEquipped) {
                    btnDiv.style.cssText = 'font-size:10px;color:var(--accent-gold);letter-spacing:1px;';
                    btnDiv.innerHTML = '✓ 장착 중';
                } else if (isOwned) {
                    btnDiv.innerHTML = `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="equipAura('${aura.id}')">장착</button>`;
                } else if (aura.price === 0) {
                    btnDiv.innerHTML = `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="buyAura('${aura.id}', 0)">획득</button>`;
                } else {
                    btnDiv.innerHTML = `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="buyAura('${aura.id}', ${aura.price})">${aura.price.toLocaleString()}G 구매</button>`;
                }
                card.appendChild(btnDiv);

                grid.appendChild(card);
            });
        } catch (e) {
            container.innerHTML = '<div style="color:var(--accent);text-align:center;padding:20px;font-size:12px">로드 실패</div>';
        }
    } else {
        container.innerHTML = `
            <div style="text-align:center;padding:30px 0;color:#555;font-size:12px;letter-spacing:1px;">
                준비 중입니다.
            </div>
        `;
    }
}

function getTicketPriceClient(pct) {
    if (pct >= 99) return 5000;
    if (pct >= 97) return 3500;
    if (pct >= 95) return 2500;
    if (pct >= 90) return 1800;
    if (pct >= 85) return 1200;
    if (pct >= 80) return 800;
    if (pct >= 70) return 500;
    if (pct >= 60) return 300;
    return 150;
}

function renderShopUnivList(universities) {
    const listEl = document.getElementById('shop-univ-list');
    if (!listEl) return;
    if (universities.length === 0) {
        listEl.innerHTML = '<div style="color:#555;font-size:11px;text-align:center;padding:16px;">검색 결과가 없습니다.</div>';
        return;
    }
    listEl.innerHTML = universities.map(uni => {
        const price = getTicketPriceClient(uni.basePercentile);
        const isMyUniv = uni.name === currentUser?.university;
        const tierColor = price >= 3500 ? '#FFD700' : price >= 1800 ? '#C0C0C0' : price >= 800 ? '#cd7f32' : '#888';
        return `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid ${isMyUniv ? 'var(--gold)' : 'var(--border)'};border-radius:4px;background:${isMyUniv ? 'rgba(255,193,7,0.05)' : 'transparent'};">
                <div style="min-width:0;">
                    <div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(uni.name)}${isMyUniv ? ' <span style="color:var(--gold);font-size:9px;">내 대학</span>' : ''}</div>
                    <div style="font-size:10px;color:#666;margin-top:1px;">${esc(uni.region)} &nbsp;·&nbsp; <span style="color:${tierColor}">TOP ${uni.basePercentile}%</span></div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;margin-left:8px;">
                    <span style="font-size:12px;font-weight:700;color:${tierColor};display:flex;align-items:center;gap:3px;"><img src="assets/coin.png" style="width:12px;height:12px;">${price.toLocaleString()}G</span>
                    <button class="shop-btn" style="padding:4px 10px;font-size:10px;" onclick="buyApplicationFee('${esc(uni.name)}', ${price})">구매</button>
                </div>
            </div>
        `;
    }).join('');
}

function filterShopUnivList(query) {
    const q = query.trim().toLowerCase();
    const all = window._shopUniversities || [];
    const filtered = q ? all.filter(u => u.name.toLowerCase().includes(q) || (u.aliases || []).some(a => a.toLowerCase().includes(q))) : all;
    renderShopUnivList(filtered);
}

async function buyApplicationFee(targetUniversity, unitPrice) {
    const total = unitPrice;
    if (!confirm(`[${targetUniversity}] 원서비 1장을 ${total.toLocaleString()}G에 구매하시겠습니까?`)) return;
    try {
        const r = await fetch('/api/estate/buy-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ quantity: 1, target_university: targetUniversity })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '구매 실패'); return; }
        alert(`[${targetUniversity}] 원서비 1장 구매 완료! (-${data.spent.toLocaleString()}G)`);
        currentUser = mergeCurrentUser(data.user);
        updateHUD(data.user);
        renderShopContent('item');
    } catch (e) { alert('오류 발생'); }
}

async function buySkin(skinId, price) {
    const skin = BALLOON_SKINS[skinId];
    if (!skin) return;
    if (price > 0 && !confirm(`[${skin.name}]을 ${price.toLocaleString()}G에 구매하시겠습니까?`)) return;
    try {
        const r = await fetch('/api/estate/buy-skin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ skin_id: skinId })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '구매 실패'); return; }
        if (currentUser) {
            currentUser.gold = data.user.gold;
            currentUser.owned_skins = data.user.owned_skins;
            updateHUD(currentUser);
        }
        alert(`[${skin.name}] 획득 완료!`);
        renderShopContent('skin');
    } catch (e) { alert('오류 발생'); }
}

async function equipSkin(skinId) {
    try {
        const r = await fetch('/api/estate/equip-skin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ skin_id: skinId })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '장착 실패'); return; }
        if (currentUser) {
            currentUser.balloon_skin = skinId;
            updateMyBuilding(currentUser);
            if (window.WorldScene) window.WorldScene.updateMyBalloon(skinId);
        }
        if (worldSocket?.connected) {
            worldSocket.emit('player:appearance', { balloon_skin: skinId });
        }
        renderShopContent('skin');
    } catch (e) { alert('오류 발생'); }
}

async function buyAura(auraId, price) {
    const aura = BALLOON_AURAS[auraId];
    if (!aura) return;
    if (price > 0 && !confirm(`[${aura.name}]을 ${price.toLocaleString()}G에 구매하시겠습니까?`)) return;
    try {
        const r = await fetch('/api/estate/buy-aura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ aura_id: auraId })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '구매 실패'); return; }
        if (currentUser) {
            currentUser.gold = data.user.gold;
            currentUser.owned_auras = data.user.owned_auras;
            updateHUD(currentUser);
        }
        alert(`[${aura.name}] 획득 완료!`);
        renderShopContent('aura');
    } catch (e) { alert('오류 발생'); }
}

async function equipAura(auraId) {
    try {
        const r = await fetch('/api/estate/equip-aura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ aura_id: auraId })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '장착 실패'); return; }
        if (currentUser) {
            currentUser.balloon_aura = auraId;
            if (window.WorldScene) window.WorldScene.updateMyAura(auraId);
        }
        if (worldSocket?.connected) {
            worldSocket.emit('player:appearance', { balloon_aura: auraId });
        }
        renderShopContent('aura');
    } catch (e) { alert('오류 발생'); }
}

// ── 대학교 영지 목록 로드 ────────────────────────────────────────────
async function loadUniversityEstates() {
    try {
        const r = await fetch('/api/university/list', { credentials: 'include' });
        const data = await r.json();
        const universities = data.universities || [];

        const container = document.getElementById('university-estates-list');
        if (!container) return;

        container.innerHTML = universities.map(uni => {
            const isMyUniv = uni.name === currentUser?.university;
            const style = isMyUniv ? 'border-color: var(--gold); background: rgba(255,193,7,0.05);' : '';
            return `
                <div style="padding:8px; border:1px solid var(--border); border-radius:4px; text-align:center; cursor:pointer; font-size:11px; transition:all 0.2s; ${style}" 
                     onmouseover="this.style.borderColor='var(--gold)'" 
                     onmouseout="this.style.borderColor=${isMyUniv ? 'var(--gold)' : 'var(--border)'}" 
                     onclick="viewUniversityEstate('${esc(uni.name)}')">
                    <div style="font-weight:600; color:var(--text); margin-bottom:2px">${esc(uni.name)}</div>
                    <div style="font-size:9px; color:var(--text-sub)">${uni.region} · ${uni.basePercentile}%</div>
                    <div style="font-size:9px; color:var(--text-sub); margin-top:2px">${uni.departmentCount}학과</div>
                </div>
            `;
        }).join('');

        if (universities.length === 0) {
            container.innerHTML = '<div style="color:var(--text-sub);font-size:11px">대학 정보를 불러올 수 없습니다.</div>';
        }
    } catch (e) {
        console.error('대학교 영지 로드 오류:', e);
        const container = document.getElementById('university-estates-list');
        if (container) container.innerHTML = '<div style="color:var(--accent);font-size:11px">로드 실패</div>';
    }
}

async function viewUniversityEstate(universityName) {
    try {
        const r = await fetch(`/api/university/info?name=${encodeURIComponent(universityName)}`, { credentials: 'include' });
        const data = await r.json();
        if (!data.found) {
            alert('대학 정보를 찾을 수 없습니다.');
            return;
        }
        const uni = data.university;
        
        // 모달에 대학교 정보 표시
        document.getElementById('user-modal-title').textContent = `🏫 ${uni.name}`;
        let deptHTML = '<div style="font-size:11px;margin-top:8px">';
        const categories = [...new Set(uni.departments.map(d => d.category))];
        categories.forEach(cat => {
            const depts = uni.departments.filter(d => d.category === cat);
            deptHTML += `<div style="margin-bottom:8px"><strong style="color:var(--gold)">${cat}</strong>: ${depts.map(d => d.name).join(', ')}</div>`;
        });
        deptHTML += '</div>';

        document.getElementById('user-modal-body').innerHTML = `
            <div class="estate-section">
                <div class="estate-label">📍 지역</div>
                <div class="estate-val">${uni.region}</div>
            </div>
            <div class="estate-section">
                <div class="estate-label">🎓 백분위</div>
                <div class="estate-val">${uni.basePercentile}%</div>
            </div>
            <div class="estate-section">
                <div class="estate-label">📚 모집 단위</div>
                <div class="estate-val">${uni.departmentCount}개</div>
            </div>
            <div class="estate-section">
                <strong style="color:var(--gold)">주요 학과:</strong>
                ${deptHTML}
            </div>
        `;
        
        const btn = document.getElementById('btn-invade');
        btn.style.display = 'none';
        document.getElementById('modal-user').classList.remove('hidden');
    } catch (e) {
        console.error('대학 상세 조회 오류:', e);
        alert('대학 정보를 불러올 수 없습니다.');
    }
}


// ── 설정 패널 (캠인증) ────────────────────────────────────────────────
async function loadCamSettings() {
    try {
        const r = await fetch('/api/cam/settings', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        const toggle = document.getElementById('cam-enabled-toggle');
        const select = document.getElementById('cam-visibility-select');
        if (toggle) toggle.checked = !!data.cam_enabled;
        if (select) select.value = data.cam_visibility || 'all';
    } catch (e) {}
}

async function saveCamSettings() {
    const toggle = document.getElementById('cam-enabled-toggle');
    const select = document.getElementById('cam-visibility-select');
    const note = document.getElementById('cam-settings-note');
    if (!toggle || !select) return;
    try {
        await fetch('/api/cam/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ cam_enabled: toggle.checked, cam_visibility: select.value })
        });
        if (note) {
            const visLabel = select.value === 'all' ? '전체공개' : '관리자만';
            note.textContent = `저장됨 — 공개 범위: ${visLabel}`;
            note.style.color = 'var(--accent-gold)';
            setTimeout(() => {
                note.textContent = '공개 범위는 모든 유저에게 표시됩니다.';
                note.style.color = '';
            }, 2000);
        }
    } catch (e) {}
}

function loadSettingsPanel() {
    loadUiSettings();
    loadCamSettings();
}

window.loadSettingsPanel = loadSettingsPanel;

// ── 친구(ALLY) 시스템 ─────────────────────────────────────────────────
let currentAllyTab = 'list';
let allyPanelOpen = false;
let messengerPanelOpen = false;
let currentChatUserId = null;
let currentChatUserName = null;
let chatPollInterval = null;

async function refreshFriendBadge() {
    try {
        const [reqR, msgR] = await Promise.all([
            fetch('/api/friends/requests', { credentials: 'include' }),
            fetch('/api/messages/unread-count', { credentials: 'include' })
        ]);
        const reqs = reqR.ok ? await reqR.json() : [];
        const msgData = msgR.ok ? await msgR.json() : { count: 0 };

        const reqBadge = document.getElementById('friend-req-badge');
        const msgBadge = document.getElementById('msg-unread-badge');
        if (reqBadge) reqBadge.classList.toggle('hidden', reqs.length === 0);
        if (msgBadge) msgBadge.classList.toggle('hidden', msgData.count === 0);

        const reqCount = document.getElementById('ally-req-count');
        if (reqCount) reqCount.textContent = reqs.length > 0 ? `(${reqs.length})` : '';
    } catch (e) {}
}

function openFriendPanel() {
    document.querySelectorAll('.glass-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById('panel-ally');
    panel.classList.remove('hidden');
    allyPanelOpen = true;
    loadAllyTab(currentAllyTab);
}

function closeFriendPanel() {
    document.getElementById('panel-ally').classList.add('hidden');
    allyPanelOpen = false;
}

function switchAllyTab(tab, btn) {
    currentAllyTab = tab;
    document.querySelectorAll('#panel-ally .tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadAllyTab(tab);
}

async function loadAllyTab(tab) {
    const content = document.getElementById('ally-content');
    content.innerHTML = '<div style="text-align:center;padding:20px;font-size:11px;color:#666">로딩 중...</div>';
    if (tab === 'list') {
        await loadFriendList(content);
    } else {
        await loadFriendRequests(content);
    }
}

async function loadFriendList(content) {
    try {
        const r = await fetch('/api/friends/list', { credentials: 'include' });
        const friends = r.ok ? await r.json() : [];
        if (window.WorldScene) window.WorldScene.setFriendIds(friends.map(f => f.id));
        if (friends.length === 0) {
            content.innerHTML = '<div style="text-align:center;padding:30px;font-size:11px;color:#555">동맹이 없습니다.<br>다른 유저의 열기구를 클릭해서 신청하세요.</div>';
            return;
        }
        content.innerHTML = friends.map(f => {
            let posStr = '';
            if (window.WorldScene) {
                const pos = window.WorldScene.getUserPosition(f.id);
                if (pos) {
                    posStr = `<div style="font-size:9px;color:#555;margin-top:2px;">📍 (${pos.x}, ${pos.y})</div>`;
                }
            }
            return `
            <div class="ally-item" onclick="focusFriend(${f.id})">
                <div class="ally-status-dot ${f.is_studying ? 'studying' : ''}"></div>
                <div class="ally-info">
                    <div class="ally-nick">${esc(f.nickname)}</div>
                    <div class="ally-univ">${esc(f.university) || '대학 미정'}</div>
                    ${posStr}
                </div>
                <div class="ally-actions">
                    <button class="ally-btn msg-btn" onclick="event.stopPropagation();openAllyChat(${f.id},'${esc(f.nickname)}')">메시지</button>
                    <button class="ally-btn del-btn" onclick="event.stopPropagation();deleteFriend(${f.id})">삭제</button>
                </div>
            </div>
            `;
        }).join('');
    } catch (e) {
        content.innerHTML = '<div style="color:#e55;padding:16px;font-size:11px">로드 실패</div>';
    }
}

async function loadFriendRequests(content) {
    try {
        const r = await fetch('/api/friends/requests', { credentials: 'include' });
        const reqs = r.ok ? await r.json() : [];
        if (reqs.length === 0) {
            content.innerHTML = '<div style="text-align:center;padding:30px;font-size:11px;color:#555">받은 동맹 신청이 없습니다.</div>';
            return;
        }
        content.innerHTML = reqs.map(req => `
            <div class="ally-item">
                <div class="ally-status-dot"></div>
                <div class="ally-info">
                    <div class="ally-nick">${esc(req.nickname)}</div>
                    <div class="ally-univ">${esc(req.university) || '대학 미정'}</div>
                </div>
                <div class="ally-actions">
                    <button class="ally-btn acc-btn" onclick="acceptRequest(${req.friendship_id})">수락</button>
                    <button class="ally-btn del-btn" onclick="rejectRequest(${req.friendship_id})">거절</button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        content.innerHTML = '<div style="color:#e55;padding:16px;font-size:11px">로드 실패</div>';
    }
}

async function acceptRequest(friendshipId) {
    await fetch('/api/friends/accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ friendship_id: friendshipId })
    });
    loadAllyTab('requests');
    refreshFriendBadge();
}

async function rejectRequest(friendshipId) {
    await fetch('/api/friends/reject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ friendship_id: friendshipId })
    });
    loadAllyTab('requests');
    refreshFriendBadge();
}

async function deleteFriend(targetId) {
    if (!confirm('동맹을 해제하시겠습니까?')) return;
    await fetch(`/api/friends/${targetId}`, { method: 'DELETE', credentials: 'include' });
    loadAllyTab('list');
    refreshFriendBadge();
}

function focusFriend(userId) {
    if (window.WorldScene) window.WorldScene.focusUserById(userId);
}

// ── 좌표 및 텔레포트 ──────────────────────────────────────────────────
window.updateCoordinatesUI = function(x, y, z) {
    const elX = document.getElementById('coord-x');
    const elY = document.getElementById('coord-y');
    const elZ = document.getElementById('coord-z');
    if (elX) elX.textContent = x;
    if (elY) elY.textContent = y;
    if (elZ) elZ.textContent = z;
};

function syncCoordinatesFromScene() {
    if (!window.WorldScene || !window.WorldScene.isReady || !window.WorldScene.getMyPosition) return;
    const pos = window.WorldScene.getMyPosition();
    if (!pos) return;
    window.updateCoordinatesUI(pos.x, pos.y, pos.z);
}

function startCoordinateSyncLoop() {
    if (window.__coordSyncLoopStarted) return;
    window.__coordSyncLoopStarted = true;
    setInterval(syncCoordinatesFromScene, 120);
}

function openTeleportDialog() {
    const pos = window.WorldScene ? window.WorldScene.getMyPosition() : { x: 0, y: 0 };
    document.getElementById('tp-x').value = pos.x;
    document.getElementById('tp-y').value = pos.y;
    document.getElementById('modal-teleport').classList.remove('hidden');
}

function doTeleport() {
    const x = parseInt(document.getElementById('tp-x').value) || 0;
    const y = parseInt(document.getElementById('tp-y').value) || 0;
    if (window.WorldScene) {
        window.WorldScene.teleportTo(x, y);
    }
    closeModal('modal-teleport');
    alert(`좌표 (${x}, ${y})로 이동했습니다!`);
}

window.openTeleportDialog = openTeleportDialog;
window.doTeleport = doTeleport;

// ── 날씨 및 미니맵 ──────────────────────────────────────────────────
window.updateWeatherUI = function(mode) {
    const btn = document.getElementById('weather-btn');
    if (!btn) return;
    const icons = { none: '☀️', rain: '🌧️', snow: '❄️' };
    btn.textContent = icons[mode] || '☀️';
};

function toggleWeather() {
    if (window.WorldScene) {
        window.WorldScene.cycleWeather();
    }
}

let minimapInterval = null;
function setMinimapVisible(visible) {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;

    minimap.classList.toggle('hidden', !visible);

    if (visible) {
        if (!minimapInterval) {
            updateMinimap();
            minimapInterval = setInterval(updateMinimap, 100);
        }
    } else if (minimapInterval) {
        clearInterval(minimapInterval);
        minimapInterval = null;
    }
}

function toggleMinimap() {
    const minimap = document.getElementById('minimap');
    if (!minimap) return;
    const makeVisible = minimap.classList.contains('hidden');
    setMinimapVisible(makeVisible);

    const minimapToggle = document.getElementById('minimap-toggle');
    if (minimapToggle) minimapToggle.checked = makeVisible;

    const settings = getUiSettings();
    settings.showMinimap = makeVisible;
    localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(settings));
}

function updateMinimap() {
    const canvas = document.getElementById('minimap-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.fillStyle = 'rgba(6, 8, 20, 0.95)';
    ctx.fillRect(0, 0, w, h);
    
    // 격자
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * w / 4, 0);
        ctx.lineTo(i * w / 4, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * h / 4);
        ctx.lineTo(w, i * h / 4);
        ctx.stroke();
    }
    
    if (!window.WorldScene) return;
    
    const scale = 0.02;
    const centerX = w / 2;
    const centerY = h / 2;
    
    // 다른 유저
    window.WorldScene.balloons.forEach((b) => {
        if (b.isMe) return;
        const pos = b.group.position;
        const x = centerX + pos.x * scale;
        const y = centerY - pos.y * scale;
        if (x >= 0 && x <= w && y >= 0 && y <= h) {
            ctx.fillStyle = window.WorldScene.friendIds.has(b.user.id) ? 'rgba(255,215,0,0.7)' : 'rgba(100,150,255,0.5)';
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    
    // 내 위치
    if (window.WorldScene.myBalloon) {
        ctx.fillStyle = '#D4AF37';
        ctx.strokeStyle = 'rgba(212,175,55,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
}

function openAllyChat(userId, nickname) {
    closeFriendPanel();
    openMessengerPanel();
    setTimeout(() => openChat(userId, nickname), 100);
}

// ── 메신저 ───────────────────────────────────────────────────────────
function openMessengerPanel() {
    document.querySelectorAll('.glass-panel').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById('panel-messenger');
    panel.classList.remove('hidden');
    messengerPanelOpen = true;
    showConversationList();
}

function closeMessengerPanel() {
    document.getElementById('panel-messenger').classList.add('hidden');
    messengerPanelOpen = false;
    stopChatPoll();
}

function messengerBack() {
    stopChatPoll();
    currentChatUserId = null;
    currentChatUserName = null;
    showConversationList();
}

function showConversationList() {
    const convList = document.getElementById('messenger-conv-list');
    const chat = document.getElementById('messenger-chat');
    const backBtn = document.getElementById('messenger-back-btn');
    const title = document.getElementById('messenger-title');

    convList.style.display = 'block';
    chat.style.display = 'none';
    backBtn.style.display = 'none';
    title.textContent = 'MESSENGER';

    loadConversations();
}

async function loadConversations() {
    const convList = document.getElementById('messenger-conv-list');
    convList.innerHTML = '<div style="text-align:center;padding:20px;font-size:11px;color:#666">로딩 중...</div>';
    try {
        const [convRes, friendRes] = await Promise.all([
            fetch('/api/messages/conversations', { credentials: 'include' }),
            fetch('/api/friends/list', { credentials: 'include' })
        ]);
        const convs = convRes.ok ? await convRes.json() : [];
        const friends = friendRes.ok ? await friendRes.json() : [];

        const convIds = new Set(convs.map(c => c.other_user));
        const newFriends = friends.filter(f => !convIds.has(f.id));

        const convHtml = convs.map(c => `
            <div class="conv-item" onclick="openChat(${c.other_user},'${esc(c.nickname)}')">
                <div class="conv-avatar">${esc(c.nickname)[0]}</div>
                <div class="conv-info">
                    <div class="conv-nick">${esc(c.nickname)} ${c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : ''}</div>
                    <div class="conv-last">${esc(c.last_msg || '')}</div>
                </div>
                <div class="conv-studying ${c.is_studying ? 'active' : ''}"></div>
            </div>
        `).join('');

        const newHtml = newFriends.length > 0 ? `
            <div style="padding:8px 14px 4px;font-size:9px;color:#666;letter-spacing:.08em;text-transform:uppercase;">동맹 — 새 대화 시작</div>
            ${newFriends.map(f => `
                <div class="conv-item" onclick="openChat(${f.id},'${esc(f.nickname)}')">
                    <div class="conv-avatar" style="opacity:0.7">${esc(f.nickname)[0]}</div>
                    <div class="conv-info">
                        <div class="conv-nick" style="color:var(--text-secondary)">${esc(f.nickname)}</div>
                        <div class="conv-last" style="color:#555">첫 메시지를 보내보세요</div>
                    </div>
                    <div class="conv-studying ${f.is_studying ? 'active' : ''}"></div>
                </div>
            `).join('')}
        ` : '';

        if (!convHtml && !newHtml) {
            convList.innerHTML = '<div style="text-align:center;padding:30px;font-size:11px;color:#555">동맹을 추가하면<br>여기서 대화할 수 있어요.</div>';
            return;
        }

        convList.innerHTML = (convHtml ? `<div style="padding:8px 14px 4px;font-size:9px;color:#666;letter-spacing:.08em;text-transform:uppercase;">${convs.length > 0 ? '최근 대화' : ''}</div>` + convHtml : '') + newHtml;
    } catch (e) {
        convList.innerHTML = '<div style="color:#e55;padding:16px;font-size:11px">로드 실패</div>';
    }
}

async function openChat(userId, nickname) {
    currentChatUserId = userId;
    currentChatUserName = nickname;

    const convList = document.getElementById('messenger-conv-list');
    const chat = document.getElementById('messenger-chat');
    const backBtn = document.getElementById('messenger-back-btn');
    const title = document.getElementById('messenger-title');

    convList.style.display = 'none';
    chat.style.display = 'flex';
    backBtn.style.display = 'inline-block';
    title.textContent = nickname;

    await loadChatMessages();
    startChatPoll();
}

async function loadChatMessages() {
    if (!currentChatUserId) return;
    try {
        const r = await fetch(`/api/messages/conversation/${currentChatUserId}`, { credentials: 'include' });
        const msgs = r.ok ? await r.json() : [];
        const container = document.getElementById('chat-messages');
        
        // 디버깅: 첫 번째 메시지 확인
        if (msgs.length > 0) {
            console.log('Sample message:', msgs[0]);
            console.log('is_mine value:', msgs[0].is_mine, 'type:', typeof msgs[0].is_mine);
        }
        
        container.innerHTML = msgs.map(m => {
            const isMine = m.is_mine === true || m.is_mine === 1;
            console.log(`Message ${m.id}: is_mine=${m.is_mine}, isMine=${isMine}, sender=${m.sender_id}`);
            const time = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            
            let contentHtml = '';
            if (m.file_path) {
                // 파일 메시지
                const isImage = m.file_type?.startsWith('image/');
                if (isImage) {
                    contentHtml = `
                        <div class="file-attachment">
                            <img src="${m.file_path}" alt="${esc(m.file_name || 'image')}" onclick="window.open('${m.file_path}', '_blank')">
                            ${m.content !== m.file_name ? `<div style="margin-top:4px;font-size:10px;">${esc(m.content)}</div>` : ''}
                        </div>
                    `;
                } else {
                    const fileIcon = m.file_type?.includes('pdf') ? '📄' : 
                                    m.file_type?.includes('zip') ? '📦' :
                                    m.file_type?.includes('video') ? '🎥' : '📎';
                    const fileSize = m.file_size ? `(${(m.file_size / 1024).toFixed(1)}KB)` : '';
                    contentHtml = `
                        <div class="file-attachment">
                            <div class="file-info">
                                <span class="file-icon">${fileIcon}</span>
                                <div>
                                    <div>${esc(m.file_name || 'file')}</div>
                                    <div style="font-size:9px;color:#888;">${fileSize}</div>
                                </div>
                            </div>
                            <a href="${m.file_path}" download="${m.file_name}" class="file-download">다운로드</a>
                            ${m.content !== m.file_name ? `<div style="margin-top:6px;font-size:10px;">${esc(m.content)}</div>` : ''}
                        </div>
                    `;
                }
            } else {
                // 텍스트 메시지
                contentHtml = esc(m.content);
            }
            
            return `
                <div class="msg-row ${isMine ? 'mine' : 'theirs'}">
                    <div class="msg-bubble">${contentHtml}</div>
                    <div class="msg-time">${time}</div>
                </div>
            `;
        }).join('');
        container.scrollTop = container.scrollHeight;
        refreshFriendBadge();
    } catch (e) {}
}

let selectedFile = null;

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
        alert('파일 크기는 10MB 이하여야 합니다.');
        event.target.value = '';
        return;
    }
    
    selectedFile = file;
    const preview = document.getElementById('file-preview');
    const previewName = document.getElementById('file-preview-name');
    previewName.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
    preview.style.display = 'block';
}

function cancelFileUpload() {
    selectedFile = null;
    document.getElementById('chat-file-input').value = '';
    document.getElementById('file-preview').style.display = 'none';
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    
    // 파일이 선택된 경우
    if (selectedFile) {
        if (!currentChatUserId) return;
        
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('receiver_id', currentChatUserId);
        if (content) formData.append('content', content);
        
        input.value = '';
        cancelFileUpload();
        
        try {
            const r = await fetch('/api/messages/send-file', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            
            if (!r.ok) {
                const d = await r.json();
                alert(d.error || '전송 실패');
                return;
            }
            
            await loadChatMessages();
        } catch (e) {
            alert('파일 전송 실패');
        }
        return;
    }
    
    // 텍스트 메시지
    if (!content || !currentChatUserId) return;
    input.value = '';
    try {
        const r = await fetch('/api/messages/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ receiver_id: currentChatUserId, content })
        });
        if (!r.ok) {
            const d = await r.json();
            alert(d.error || '전송 실패');
            input.value = content;
            return;
        }
        await loadChatMessages();
    } catch (e) {}
}

function startChatPoll() {
    stopChatPoll();
    chatPollInterval = setInterval(() => {
        if (currentChatUserId) loadChatMessages();
    }, 5000);
}

function stopChatPoll() {
    if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

// 30초마다 배지 갱신
setInterval(refreshFriendBadge, 30000);

// ── Real-time World Socket (socket.io) ───────────────────────────────────────
// Connects after the user is authenticated, receives the world seed, and
// maintains a live channel for nearby-player positions and prop interactions.

const POSITION_SYNC_MS = 400;   // position update throttle interval in ms

let worldSocket   = null;
let _wsPosTimer   = null;
const _wsNearby   = new Map(); // userId → player snapshot from socket

/**
 * Send current world position to the server if it has changed,
 * throttled to once per POSITION_SYNC_MS.
 */
function _startWorldPositionSync() {
    if (_wsPosTimer) return;
    let lastWx = null, lastWy = null;
    _wsPosTimer = setInterval(() => {
        if (!worldSocket || !window.WorldScene || !window.WorldScene.isReady) return;
        const pos = window.WorldScene.getWorldPosition();
        if (lastWx === pos.x && lastWy === pos.y) return;
        lastWx = pos.x;
        lastWy = pos.y;
        worldSocket.emit('player:move', { worldX: pos.x, worldY: pos.y });
    }, POSITION_SYNC_MS);
}

function initWorldSocket(user) {
    if (worldSocket) return;   // already connected

    // socket.io client is loaded via <script> tag in index.html.
    if (typeof io !== 'function') {
        console.warn('socket.io client not loaded – skipping world socket');
        return;
    }

    worldSocket = io({ transports: ['websocket', 'polling'] });

    // ── Receive world seed → build seeded world ──────────────────────
    worldSocket.on('world:seed', ({ seed }) => {
        if (window.WorldScene && window.WorldScene.isReady) {
            window.WorldScene.initSeed(seed);
        } else {
            // Queue until scene is ready.
            const prev = window._onWorldSceneReady;
            window._onWorldSceneReady = function() {
                if (prev) prev();
                window.WorldScene.initSeed(seed);
            };
        }
    });

    // ── Receive full nearby-player snapshot ──────────────────────────
    worldSocket.on('players:nearby', (players) => {
        _wsNearby.clear();
        players.forEach((p) => {
            const id = _normalizeUserId(p?.id);
            if (id === null) return;
            _wsNearby.set(id, { ...p, id });
        });
        if (window.WorldScene && window.WorldScene.isReady) {
            window.WorldScene.updateWorldPlayers([..._wsNearby.values()], currentUser);
        }
    });

    // ── A new player entered the nearby area ─────────────────────────
    worldSocket.on('player:enter', (player) => {
        const id = _normalizeUserId(player?.id);
        if (id === null) return;
        _wsNearby.set(id, { ...player, id });
        if (window.WorldScene && window.WorldScene.isReady) {
            window.WorldScene.updateWorldPlayers([..._wsNearby.values()], currentUser);
        }
    });

    // ── Remote player moved ──────────────────────────────────────────
    worldSocket.on('player:moved', ({ id, worldX, worldY }) => {
        const userId = _normalizeUserId(id);
        if (userId === null) return;
        const p = _wsNearby.get(userId);
        if (p) { p.worldX = worldX; p.worldY = worldY; }
        if (window.WorldScene && window.WorldScene.isReady) {
            window.WorldScene.moveWorldPlayer(userId, worldX, worldY);
        }
    });

    // ── Remote player disconnected ───────────────────────────────────
    worldSocket.on('player:left', ({ id }) => {
        const userId = _normalizeUserId(id);
        if (userId === null) return;
        _wsNearby.delete(userId);
        if (window.WorldScene && window.WorldScene.isReady) {
            // Do not hard-remove immediately: scene side applies stale grace
            // to avoid false left events causing flicker/disappear.
            window.WorldScene.updateWorldPlayers([..._wsNearby.values()], currentUser);
        }
    });

    // ── Remote player appearance changed (skin/aura/status) ──────────
    worldSocket.on('player:appearance', ({ id, balloon_skin, balloon_aura, status_message }) => {
        const userId = _normalizeUserId(id);
        if (userId === null) return;
        const p = _wsNearby.get(userId);
        if (!p) return;
        if (balloon_skin) p.balloon_skin = balloon_skin;
        if (balloon_aura) p.balloon_aura = balloon_aura;
        if (status_message !== undefined) p.status_message = status_message;
        if (window.WorldScene && window.WorldScene.isReady) {
            window.WorldScene.updateWorldPlayers([..._wsNearby.values()], currentUser);
        }
    });

    // ── Interaction state snapshot on join ───────────────────────────
    worldSocket.on('interaction:state', (stateObj) => {
        if (!window.WorldScene || !window.WorldScene.isReady) return;
        Object.entries(stateObj).forEach(([propId, state]) => {
            window.WorldScene.setInteractionState(propId, state.activated);
        });
    });

    // ── Interaction update broadcast ─────────────────────────────────
    worldSocket.on('interaction:update', ({ propId, activated }) => {
        if (window.WorldScene && window.WorldScene.isReady) {
            window.WorldScene.setInteractionState(propId, activated);
        }
    });

    // ── Announce ourselves to the server ────────────────────────────
    const pos = (window.WorldScene && window.WorldScene.isReady)
        ? window.WorldScene.getWorldPosition()
        : { x: 0, y: 0 };

    worldSocket.emit('player:join', {
        userId:         user.id,
        nickname:       user.nickname       || '',
        university:     user.university     || '',
        balloon_skin:   user.balloon_skin   || 'default',
        balloon_aura:   user.balloon_aura   || 'none',
        status_message: user.status_message || null,
        worldX: pos.x,
        worldY: pos.y,
    });

    // Wire up WorldScene's interaction callback so local clicks are emitted.
    if (window.WorldScene) {
        window.WorldScene.onInteraction = (propId, activated) => {
            worldSocket.emit('interaction:trigger', { propId, activated });
        };
    }

    _startWorldPositionSync();
}

function _startApp() {
    if (window._worldSceneReady && window.WorldScene) {
        window.WorldScene.init();
        initHub().then(() => { if (currentUser) initWorldSocket(currentUser); });
    } else {
        window._onWorldSceneReady = function() {
            window.WorldScene.init();
            initHub().then(() => { if (currentUser) initWorldSocket(currentUser); });
        };
    }
}
_startApp();
startCoordinateSyncLoop();

document.addEventListener('DOMContentLoaded', () => {
    const teleportBtn = document.getElementById('btn-teleport');

    if (teleportBtn) {
        teleportBtn.addEventListener('pointerup', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openTeleportDialog();
        });
        teleportBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openTeleportDialog();
        });
    }
});

document.addEventListener('click', (e) => {
    const target = e.target && e.target.closest ? e.target.closest('#btn-teleport') : null;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    openTeleportDialog();
}, true);

async function saveStatusMsg(e) {
    const msg = (document.getElementById('status-msg-input')?.value || '').trim();
    try {
        const r = await fetch('/api/auth/status-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ message: msg })
        });
        const data = r.ok ? await r.json() : null;
        if (!data?.ok) return;
        if (currentUser) currentUser.status_message = msg || null;
        if (window.WorldScene) window.WorldScene.updateStatusMsg(currentUser.id, msg || null);
        if (worldSocket?.connected) {
            worldSocket.emit('player:appearance', { status_message: msg || null });
        }
        const btn = e?.target || document.getElementById('status-msg-save-btn');
        if (btn) { const orig = btn.textContent; btn.textContent = '✓ 저장됨'; setTimeout(() => btn.textContent = orig, 1800); }
    } catch (err) {}
}

// Keep inline handlers stable for all browsers/build modes.
window.goToCommunity = goToCommunity;
window.goToTimer = goToTimer;

