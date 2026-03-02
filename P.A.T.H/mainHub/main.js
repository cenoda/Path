let currentUser = null;
let allUsers = [];
let selectedUser = null;
let isDragging = false;
let dragStartX, dragStartY;
let mapOffsetX = 0, mapOffsetY = 0;
let scale = 1.0;
let currentRankTab = 'total';

const container = document.getElementById('world-container');
const mapLayer  = document.getElementById('map-layer');

// ── 티어별 건물 설정 ─────────────────────────────────
const TIER_BUILDING = {
    BRONZE:     { img: '/P.A.T.H/assets/hut.png',          cls: 'hut-building',      label: '오두막' },
    SILVER:     { img: '/P.A.T.H/assets/hut.png',          cls: 'building-silver',   label: '오두막' },
    GOLD:       { img: '/P.A.T.H/assets/hut.png',          cls: 'building-gold',     label: '오두막' },
    PLATINUM:   { img: '/P.A.T.H/assets/hut.png',          cls: 'building-plat',     label: '영지' },
    DIAMOND:    { img: '/P.A.T.H/assets/castle_main.png',  cls: 'building-diamond',  label: '성채' },
    CHALLENGER: { img: '/P.A.T.H/assets/castle_main.png',  cls: 'hut-building',      label: '성채' }
};

// ── 초기화 ───────────────────────────────────────────
async function initHub() {
    try {
        const r = await fetch('/api/auth/me', { credentials: 'include' });
        if (!r.ok) { window.location.href = '/P.A.T.H/login/index.html'; return; }
        const data = await r.json();
        currentUser = data.user;
        updateHUD(currentUser);

        // 내 건물 티어 반영
        const myBuilding = TIER_BUILDING[currentUser.tier] || TIER_BUILDING.BRONZE;
        if (currentUser.tier === 'DIAMOND' || currentUser.tier === 'CHALLENGER') {
            document.getElementById('my-castle-img').src = '/P.A.T.H/assets/castle_main.png';
        }
        document.getElementById('my-castle-label').textContent =
            (currentUser.university || '내 영지') + ' · ' + myBuilding.label;

        await Promise.all([loadRankingAndMap(), loadNotifBadge()]);
    } catch (e) {
        console.error('initHub 오류:', e);
    }
}

function updateHUD(user) {
    document.getElementById('badge-char').textContent = (user.nickname || '?').charAt(0).toUpperCase();
    document.getElementById('hud-tier').textContent = user.tier || '-';
    document.getElementById('hud-gold').textContent = (user.gold || 0).toLocaleString();
    document.getElementById('hud-exp').textContent = (user.exp || 0).toLocaleString();
    document.getElementById('hud-tier-tag').textContent = user.tier || '-';
    document.getElementById('hud-tickets').textContent = (user.tickets || 0) + '장';
}

// ── 랭킹 + 맵 ───────────────────────────────────────
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
    } catch (e) { console.error('랭킹 로드 오류:', e); }
}

// ── 유저 건물 렌더링 ──────────────────────────────────
function renderOtherUsers(users) {
    document.querySelectorAll('.other-building').forEach(el => el.remove());

    const others = users.filter(u => u.id !== currentUser?.id).slice(0, 10);
    const positions = [
        { x: 1200, y: 1750 }, { x: 1150, y: 2100 }, { x: 1300, y: 2450 },
        { x: 2700, y: 1450 }, { x: 2800, y: 1850 }, { x: 1050, y: 2750 },
        { x: 2850, y: 2550 }, { x: 2550, y: 2900 }, { x: 1400, y: 1400 },
        { x: 2600, y: 1200 }
    ];

    others.forEach((user, i) => {
        const pos = positions[i] || { x: 1200 + i * 100, y: 1800 + i * 70 };
        const info = TIER_BUILDING[user.tier] || TIER_BUILDING.BRONZE;

        const div = document.createElement('div');
        div.className = `building other-building ${info.cls}`;
        if (user.is_studying) div.classList.add('studying');
        div.style.left = pos.x + 'px';
        div.style.top  = pos.y + 'px';
        div.dataset.userId = user.id;
        div.onclick = () => openUserModal(user);

        div.innerHTML = `
            <img src="${info.img}" alt="${user.nickname}의 ${info.label}">
            <div class="building-label">${user.nickname}</div>
        `;
        mapLayer.appendChild(div);
    });
}

// ── 랭킹 패널 ────────────────────────────────────────
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
            const secToHr = s => (s / 3600).toFixed(1) + 'h';
            const val = tab === 'today'
                ? `<span style="color:#aaa">${secToHr(u.today_sec || 0)}</span>`
                : `<span style="color:#aaa">${(u.exp || 0).toLocaleString()} EXP</span>`;
            return `<div class="rank-item ${isMe ? 'me' : ''}" onclick="focusUser(${u.id})">
                <span class="rank-num">${i + 1}</span>
                <div style="flex:1; min-width:0">
                    <div class="rank-nick">${u.nickname} ${u.is_studying ? '<span class="rank-studying">📖</span>' : ''}</div>
                    <div class="rank-univ">${u.university || ''}</div>
                </div>
                <div style="text-align:right">
                    <div class="rank-tier">${u.tier}</div>
                    ${val}
                </div>
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

// ── 알림 ─────────────────────────────────────────────
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
            listEl.textContent = '알림이 없습니다.';
            return;
        }
        listEl.innerHTML = data.notifications.map(n => {
            const d = new Date(n.created_at);
            const timeStr = d.toLocaleDateString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
            return `<div class="notif-item ${n.is_read ? '' : 'unread'}">
                <div>${n.message}</div>
                <div class="notif-time">${timeStr}</div>
            </div>`;
        }).join('');
        await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
        document.getElementById('notif-badge').classList.add('hidden');
    } catch (e) { listEl.textContent = '오류 발생'; }
}

// ── 영지 내부 (세금) ──────────────────────────────────
async function openEstate() {
    try {
        const r = await fetch('/api/estate/tax', { credentials: 'include' });
        const data = await r.json();
        const body = document.getElementById('estate-body');
        body.innerHTML = `
            <strong>티어:</strong> ${data.tier}<br>
            <strong>시간당 세율:</strong> ${data.rate}G / hr<br>
            <strong>미수령 세금:</strong> <span style="color:var(--gold)">${data.pending.toLocaleString()}G</span><br>
            <strong>보유 골드:</strong> ${data.gold.toLocaleString()}G
        `;
        document.getElementById('modal-estate').classList.remove('hidden');
    } catch (e) { alert('정보를 불러오지 못했습니다.'); }
}

async function collectTax() {
    try {
        const r = await fetch('/api/estate/collect-tax', { method: 'POST', credentials: 'include' });
        const data = await r.json();
        if (data.collected > 0) {
            alert(`+${data.collected.toLocaleString()}G 수령 완료!`);
            currentUser = data.user;
            updateHUD(data.user);
        } else {
            alert(data.message || '수령할 세금이 없습니다.');
        }
        closeModal('modal-estate');
    } catch (e) { alert('오류 발생'); }
}

// ── 유저 모달 (침략) ─────────────────────────────────
function openUserModal(user) {
    selectedUser = user;
    document.getElementById('user-modal-title').textContent = `⚔️ ${user.nickname}의 영지`;
    document.getElementById('user-modal-body').innerHTML = `
        <strong>대학:</strong> ${user.university || '-'}<br>
        <strong>티어:</strong> ${user.tier}<br>
        <strong>EXP:</strong> ${(user.exp || 0).toLocaleString()}<br>
        <strong>상태:</strong> ${user.is_studying ? '📖 공부 중' : '휴식 중'}<br><br>
        <span style="color:var(--text-sub); font-size:11px">
            침략 시 토너먼트권 1장 소모<br>
            7일 공부량으로 승패 결정<br>
            승리 시 미수령 세금 50% 약탈
        </span>
    `;
    const tickets = currentUser?.tickets || 0;
    const btn = document.getElementById('btn-invade');
    btn.disabled = tickets < 1;
    btn.style.opacity = tickets < 1 ? '0.4' : '1';
    btn.title = tickets < 1 ? '토너먼트권이 없습니다' : '침략';
    document.getElementById('modal-user').classList.remove('hidden');
}

async function doInvade() {
    if (!selectedUser) return;
    if ((currentUser?.tickets || 0) < 1) { alert('토너먼트권이 없습니다.\n1시간 이상 공부 성공 시 30% 확률로 획득!'); return; }
    if (!confirm(`${selectedUser.nickname}을(를) 침략하시겠습니까?\n토너먼트권 1장이 소모됩니다.`)) return;

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
        const msg = won
            ? `⚔️ 침략 성공!\n\n내 7일 공부: ${fmtHr(data.attacker_sec)}\n상대 7일 공부: ${fmtHr(data.defender_sec)}\n\n약탈 골드: +${data.loot_gold.toLocaleString()}G`
            : `🛡️ 침략 실패!\n\n내 7일 공부: ${fmtHr(data.attacker_sec)}\n상대 7일 공부: ${fmtHr(data.defender_sec)}\n\n더 열심히 공부해서 도전하세요.`;
        alert(msg);
        currentUser = data.user;
        updateHUD(data.user);
        closeModal('modal-user');
    } catch (e) { alert('서버 오류 발생'); }
}

function fmtHr(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
}

// ── 패널/모달 토글 ────────────────────────────────────
function togglePanel(id) {
    const el = document.getElementById(id);
    const isHidden = el.classList.contains('hidden');
    // 모든 패널 닫기
    document.querySelectorAll('.side-panel').forEach(p => p.classList.add('hidden'));
    if (isHidden) {
        el.classList.remove('hidden');
        if (id === 'panel-rank') loadRankPanel(currentRankTab);
        if (id === 'panel-notif') loadNotifPanel();
    }
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

// 모달 외부 클릭 시 닫기
document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// ── 검색 ─────────────────────────────────────────────
function onSearch(value) {
    const q = value.trim().toLowerCase();
    if (!q) { renderOtherUsers(allUsers); return; }
    const filtered = allUsers.filter(u =>
        u.nickname.toLowerCase().includes(q) ||
        (u.university && u.university.toLowerCase().includes(q))
    );
    renderOtherUsers(filtered);
}

// ── 랭킹에서 유저 영지로 이동 ─────────────────────────
function focusUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    openUserModal(user);
}

// ── 드래그 스크롤 ─────────────────────────────────────
container.addEventListener('mousedown', startDrag);
container.addEventListener('touchstart', e => startDrag(e.touches[0]), { passive: true });
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);
window.addEventListener('mousemove', onDrag);
window.addEventListener('touchmove', e => { if (isDragging) onDrag(e.touches[0]); }, { passive: true });

function startDrag(e) {
    if (e.target.closest('.side-panel, .modal-overlay, #hud-top-left, #hud-top-right, #hud-right, #hud-bottom, #btn-return-home, #search-bar')) return;
    isDragging = true;
    container.classList.add('grabbing');
    dragStartX = e.clientX - mapOffsetX;
    dragStartY = e.clientY - mapOffsetY;
}
function endDrag() { isDragging = false; container.classList.remove('grabbing'); }
function onDrag(e) {
    if (!isDragging) return;
    mapOffsetX = e.clientX - dragStartX;
    mapOffsetY = e.clientY - dragStartY;
    applyTransform();
}

container.addEventListener('wheel', e => {
    e.preventDefault();
    zoomMap(e.deltaY * -0.001);
}, { passive: false });

function zoomMap(delta) {
    scale = Math.min(Math.max(0.4, scale + delta), 2.0);
    applyTransform();
}
function panMap(dx, dy) {
    mapOffsetX += dx; mapOffsetY += dy;
    applyTransform();
}
function applyTransform() {
    mapLayer.style.transform = `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${scale})`;
}

function returnToHome() {
    mapOffsetX = 0; mapOffsetY = 0; scale = 1.0;
    mapLayer.style.transition = 'transform 0.5s ease-in-out';
    applyTransform();
    setTimeout(() => { mapLayer.style.transition = 'none'; }, 500);
}

function goToTimer() { window.location.href = '/P.A.T.H/mainPageDev/index.html'; }

async function doLogout() {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/P.A.T.H/login/index.html';
}

initHub();
