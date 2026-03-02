let currentUser = null;
let allUsers = [];
let isDragging = false;
let dragStartX, dragStartY;
let mapOffsetX = 0, mapOffsetY = 0;
let scale = 1.0;

const container = document.getElementById('world-container');
const mapLayer = document.getElementById('map-layer');

// ── 초기화 ──────────────────────────────────────────────
async function initHub() {
    try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (!r.ok) { window.location.href = '/P.A.T.H/login/index.html'; return; }
        const data = await r.json();
        currentUser = data.user;
        updateHUD(currentUser);
        loadRankingAndMap();
    } catch (e) {
        console.error('initHub 오류:', e);
    }
}

function updateHUD(user) {
    const nick = user.nickname || '?';
    document.getElementById('badge-char').textContent = nick.charAt(0).toUpperCase();
    document.getElementById('hud-tier').textContent = user.tier;
    document.getElementById('hud-gold').textContent = user.gold.toLocaleString();
    document.getElementById('hud-exp').textContent = user.exp.toLocaleString();
    document.getElementById('hud-tier-tag').textContent = user.tier;

    const label = document.getElementById('my-castle-label');
    if (label) label.textContent = (user.university || '내 성채') + ' 성채';
}

async function loadRankingAndMap() {
    try {
        const [rankRes, myRankRes] = await Promise.all([
            fetch('/api/ranking', { credentials: 'include' }),
            fetch('/api/ranking/me', { credentials: 'include' })
        ]);

        if (myRankRes.ok) {
            const myRank = await myRankRes.json();
            document.getElementById('hud-pct').textContent = `TOP ${myRank.pct}%`;
        }

        if (rankRes.ok) {
            const data = await rankRes.json();
            allUsers = data.ranking;
            renderOtherUsers(allUsers);
        }
    } catch (e) {
        console.error('랭킹 로드 오류:', e);
    }
}

// ── 오두막 렌더링 ──────────────────────────────────────
function renderOtherUsers(users) {
    document.querySelectorAll('.hut-building').forEach(el => el.remove());

    const others = users.filter(u => u.id !== currentUser?.id).slice(0, 8);

    const positions = [
        { x: 1300, y: 1800 }, { x: 1200, y: 2100 },
        { x: 1350, y: 2400 }, { x: 2600, y: 1500 },
        { x: 2700, y: 1900 }, { x: 1100, y: 2700 },
        { x: 2800, y: 2600 }, { x: 2500, y: 2900 }
    ];

    others.forEach((user, i) => {
        const pos = positions[i] || { x: 1200 + (i * 80), y: 1800 + (i * 60) };
        const div = document.createElement('div');
        div.className = 'building hut-building';
        div.style.left = pos.x + 'px';
        div.style.top = pos.y + 'px';
        div.onclick = () => showUserInfo(user);

        div.innerHTML = `
            <img src="/P.A.T.H/assets/hut.png" alt="${user.nickname}의 오두막">
            <div class="building-label hut-label">오두막</div>
        `;
        mapLayer.appendChild(div);
    });
}

function showUserInfo(user) {
    alert(`${user.nickname}\n${user.university}\n티어: ${user.tier}\nEXP: ${user.exp.toLocaleString()}\nGOLD: ${user.gold.toLocaleString()}`);
}

// ── 드래그 스크롤 ─────────────────────────────────────
container.addEventListener('mousedown', startDrag);
container.addEventListener('touchstart', e => startDrag(e.touches[0]), { passive: true });
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);
window.addEventListener('mousemove', onDrag);
window.addEventListener('touchmove', e => onDrag(e.touches[0]), { passive: true });

function startDrag(e) {
    isDragging = true;
    container.classList.add('grabbing');
    dragStartX = e.clientX - mapOffsetX;
    dragStartY = e.clientY - mapOffsetY;
}

function endDrag() {
    isDragging = false;
    container.classList.remove('grabbing');
}

function onDrag(e) {
    if (!isDragging) return;
    mapOffsetX = e.clientX - dragStartX;
    mapOffsetY = e.clientY - dragStartY;
    applyTransform();
}

// ── 줌 ────────────────────────────────────────────────
container.addEventListener('wheel', e => {
    e.preventDefault();
    zoomMap(e.deltaY * -0.001);
}, { passive: false });

function zoomMap(delta) {
    scale = Math.min(Math.max(0.4, scale + delta), 1.8);
    applyTransform();
}

function applyTransform() {
    mapLayer.style.transform = `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${scale})`;
}

// ── 패닝 버튼 ─────────────────────────────────────────
function panMap(dx, dy) {
    mapOffsetX += dx;
    mapOffsetY += dy;
    applyTransform();
}

// ── 내 영지 복귀 ─────────────────────────────────────
function returnToHome() {
    mapOffsetX = 0;
    mapOffsetY = 0;
    scale = 1.0;
    mapLayer.style.transition = 'transform 0.5s ease-in-out';
    applyTransform();
    setTimeout(() => { mapLayer.style.transition = 'none'; }, 500);
}

// ── 성채 클릭 ────────────────────────────────────────
function enterCastle() {
    alert('성 내부 기능 준비 중입니다.\n(세금 징수, 펫 관리 화면)');
}

// ── 검색 ─────────────────────────────────────────────
function onSearch(value) {
    if (!value.trim()) {
        renderOtherUsers(allUsers);
        return;
    }
    const q = value.trim().toLowerCase();
    const filtered = allUsers.filter(u =>
        u.nickname.toLowerCase().includes(q) ||
        (u.university && u.university.toLowerCase().includes(q))
    );
    renderOtherUsers(filtered);
}

// ── 페이지 이동 ──────────────────────────────────────
function goToTimer() {
    window.location.href = '/P.A.T.H/mainPageDev/index.html';
}

async function doLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/P.A.T.H/login/index.html';
}

initHub();
