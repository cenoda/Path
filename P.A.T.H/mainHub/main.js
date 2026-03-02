let currentUser = null;
let myTotalSec = 0;
let allUsers = [];
let selectedUser = null;
let isDragging = false;
let dragStartX, dragStartY;
let mapOffsetX = 0, mapOffsetY = 0;
let scale = 1.0;
let currentRankTab = 'total';

const container = document.getElementById('world-container');
const mapLayer  = document.getElementById('map-layer');

// ── 대학 등급별 건물 설정 ─────────────────────────────────────────
// 이미지는 사용자가 직접 교체 예정. 현재는 크기/밝기로 등급 구분
const GRADE_BUILDING = {
    1: { img: '/P.A.T.H/assets/castle_main.png', label: '의·치·한·약·수', sizePx: 480, brightness: 1.0 },
    2: { img: '/P.A.T.H/assets/castle_main.png', label: 'SKY·과기원',      sizePx: 400, brightness: 0.9 },
    3: { img: '/P.A.T.H/assets/castle_main.png', label: '상위권',           sizePx: 320, brightness: 0.8 },
    4: { img: '/P.A.T.H/assets/hut.png',         label: '중상위권',         sizePx: 180, brightness: 0.95 },
    5: { img: '/P.A.T.H/assets/hut.png',         label: '중위권',           sizePx: 145, brightness: 0.85 },
    6: { img: '/P.A.T.H/assets/hut.png',         label: '중하위권',         sizePx: 115, brightness: 0.7 },
    7: { img: '/P.A.T.H/assets/hut.png',         label: '일반',             sizePx: 90,  brightness: 0.55 }
};

// 서버에서 계산하지 않고 프론트에서도 grade 추정
// (실제 grade는 서버가 반환, 여기선 표시용)
function getGradeFromUser(user) {
    return user.grade || 7;
}

// ── 초기화 ──────────────────────────────────────────────────────────
async function initHub() {
    try {
        const [meRes, rankMeRes] = await Promise.all([
            fetch('/api/auth/me', { credentials: 'include' }),
            fetch('/api/ranking/me', { credentials: 'include' })
        ]);

        if (!meRes.ok) { window.location.href = '/P.A.T.H/login/index.html'; return; }

        const meData = await meRes.json();
        currentUser = meData.user;

        if (rankMeRes.ok) {
            const rankData = await rankMeRes.json();
            myTotalSec = parseInt(rankData.total_sec || 0);
            document.getElementById('hud-pct').textContent = `TOP ${rankData.pct}%`;
        }

        updateHUD(currentUser);
        updateMyBuilding(currentUser);
        await Promise.all([loadRankingAndMap(), loadNotifBadge()]);
    } catch (e) {
        console.error('initHub 오류:', e);
    }
}

function secToHour(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function updateHUD(user) {
    document.getElementById('badge-char').textContent = (user.nickname || '?').charAt(0).toUpperCase();
    document.getElementById('hud-univ').textContent = user.university || '-';
    document.getElementById('hud-gold').textContent = (user.gold || 0).toLocaleString();
    document.getElementById('hud-hours').textContent = secToHour(myTotalSec);
    document.getElementById('hud-tickets').textContent = (user.tickets || 0) + '장';
}

function updateMyBuilding(user) {
    const grade = getGradeFromUser(user);
    const b = GRADE_BUILDING[grade] || GRADE_BUILDING[7];
    const img = document.getElementById('my-castle-img');
    img.src = b.img;
    img.style.width = b.sizePx + 'px';
    img.style.filter = `brightness(${b.brightness})`;
    document.getElementById('my-castle-label').textContent =
        (user.university || '내 영지') + ' · ' + b.label;
}

// ── 랭킹 + 맵 ──────────────────────────────────────────────────────
async function loadRankingAndMap() {
    try {
        const r = await fetch('/api/ranking', { credentials: 'include' });
        if (r.ok) {
            const data = await r.json();
            allUsers = data.ranking;
            renderOtherUsers(allUsers);
        }
    } catch (e) { console.error('랭킹 로드 오류:', e); }
}

// ── 유저 건물 렌더링 ─────────────────────────────────────────────────
function renderOtherUsers(users) {
    document.querySelectorAll('.other-building').forEach(el => el.remove());

    const others = users.filter(u => u.id !== currentUser?.id).slice(0, 12);
    const positions = [
        { x: 1150, y: 1700 }, { x: 1100, y: 2050 }, { x: 1250, y: 2400 },
        { x: 2720, y: 1420 }, { x: 2820, y: 1820 }, { x: 1020, y: 2730 },
        { x: 2870, y: 2530 }, { x: 2580, y: 2880 }, { x: 1380, y: 1350 },
        { x: 2620, y: 1180 }, { x: 1600, y: 2700 }, { x: 2200, y: 2950 }
    ];

    others.forEach((user, i) => {
        const pos = positions[i] || { x: 1100 + i * 120, y: 1800 + i * 80 };
        const grade = getGradeFromUser(user);
        const b = GRADE_BUILDING[grade] || GRADE_BUILDING[7];
        const displaySize = Math.floor(b.sizePx * 0.3);

        const div = document.createElement('div');
        div.className = 'building other-building';
        if (user.is_studying) div.classList.add('studying');
        div.style.left = pos.x + 'px';
        div.style.top  = pos.y + 'px';
        div.dataset.userId = user.id;
        div.onclick = () => openUserModal(user);

        div.innerHTML = `
            <img src="${b.img}" alt="${user.nickname}" style="width:${displaySize}px;filter:brightness(${b.brightness})">
            <div class="building-label">${user.nickname}<br><span style="font-size:9px;opacity:0.6">${user.university || ''}</span></div>
        `;
        mapLayer.appendChild(div);
    });
}

// ── 랭킹 패널 ───────────────────────────────────────────────────────
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
            const grade = u.grade || 7;
            const gradeColors = { 1:'#c9a84c', 2:'#c9a84c', 3:'#aaa', 4:'#888', 5:'#777', 6:'#666', 7:'#555' };
            return `<div class="rank-item ${isMe ? 'me' : ''}" onclick="focusUser(${u.id})">
                <span class="rank-num">${i + 1}</span>
                <div style="flex:1;min-width:0">
                    <div class="rank-nick">${u.nickname} ${u.is_studying ? '<span class="rank-studying">📖</span>' : ''}</div>
                    <div class="rank-univ" style="color:${gradeColors[grade]}">${u.university || '-'}</div>
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

// ── 알림 ────────────────────────────────────────────────────────────
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

// ── 영지 내부 (세금 + 티켓 구매 + 점수 등록) ──────────────────────────
async function openEstate() {
    try {
        const r = await fetch('/api/estate/tax', { credentials: 'include' });
        const data = await r.json();
        const body = document.getElementById('estate-body');
        const score = currentUser?.mock_exam_score || 0;
        body.innerHTML = `
            <div class="estate-section">
                <div class="estate-label">🏫 영지</div>
                <div class="estate-val">${data.university || '-'}</div>
            </div>
            <div class="estate-section">
                <div class="estate-label">💰 영지 수입</div>
                <div class="estate-val">${data.rate}G/hr · 미수령 <span style="color:var(--gold)">${data.pending.toLocaleString()}G</span></div>
            </div>
            <div class="estate-section">
                <div class="estate-label">🪙 보유 골드</div>
                <div class="estate-val">${(data.gold || 0).toLocaleString()}G</div>
            </div>
            <div class="estate-section">
                <div class="estate-label">🎟️ 토너먼트권 구매</div>
                <div class="estate-val">1장 = <strong>${data.ticketPrice.toLocaleString()}G</strong>
                    <button class="inline-btn" onclick="buyTicket(${data.ticketPrice})">구매</button>
                </div>
            </div>
            <div class="estate-section">
                <div class="estate-label">📋 평가원 점수</div>
                <div class="estate-val" style="display:flex;gap:6px;align-items:center">
                    <input type="number" id="score-input" value="${score}" min="0" max="600"
                        placeholder="표준점수 합산 (0~600)"
                        style="background:rgba(255,255,255,0.06);border:1px solid var(--border);color:var(--text);padding:4px 8px;border-radius:4px;width:130px;font-family:inherit;font-size:12px">
                    <button class="inline-btn" onclick="saveScore()">등록</button>
                </div>
            </div>
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

async function buyTicket(price) {
    if (!confirm(`토너먼트권 1장을 ${price.toLocaleString()}G에 구매하시겠습니까?`)) return;
    try {
        const r = await fetch('/api/estate/buy-ticket', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ quantity: 1 })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '구매 실패'); return; }
        alert(`토너먼트권 1장 구매 완료! (-${data.spent.toLocaleString()}G)`);
        currentUser = data.user;
        updateHUD(data.user);
        closeModal('modal-estate');
    } catch (e) { alert('오류 발생'); }
}

async function saveScore() {
    const input = document.getElementById('score-input');
    const score = parseInt(input?.value);
    if (isNaN(score) || score < 0 || score > 600) {
        alert('점수는 0~600 사이 숫자로 입력해주세요.'); return;
    }
    try {
        const r = await fetch('/api/auth/update-score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ score })
        });
        const data = await r.json();
        if (!r.ok) { alert(data.error || '오류 발생'); return; }
        currentUser = data.user;
        alert(`점수 등록 완료: ${score}점`);
        closeModal('modal-estate');
    } catch (e) { alert('오류 발생'); }
}

// ── 유저 모달 (침략) ──────────────────────────────────────────────────
function openUserModal(user) {
    selectedUser = user;
    document.getElementById('user-modal-title').textContent = `⚔️ ${user.nickname}의 영지`;
    const myScore = currentUser?.mock_exam_score || 0;
    document.getElementById('user-modal-body').innerHTML = `
        <div class="estate-section">
            <div class="estate-label">🏫 영지</div>
            <div class="estate-val">${user.university || '-'}</div>
        </div>
        <div class="estate-section">
            <div class="estate-label">📖 공부 시간</div>
            <div class="estate-val">${secToHour(user.total_sec || 0)}</div>
        </div>
        <div class="estate-section">
            <div class="estate-label">상태</div>
            <div class="estate-val">${user.is_studying ? '📖 공부 중' : '휴식 중'}</div>
        </div>
        <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-sub);line-height:1.7">
            ⚔️ 침략은 <strong style="color:var(--text)">평가원 모의고사 점수</strong>로 승패 결정<br>
            🏆 승리 시 상대방 영지(대학)를 취득<br>
            🎟️ 토너먼트권 1장 소모 · 내 점수: <strong style="color:var(--gold)">${myScore > 0 ? myScore + '점' : '미등록'}</strong>
        </div>
    `;
    const tickets = currentUser?.tickets || 0;
    const hasScore = myScore > 0;
    const btn = document.getElementById('btn-invade');
    const disabled = tickets < 1 || !hasScore;
    btn.disabled = disabled;
    btn.style.opacity = disabled ? '0.4' : '1';
    btn.title = tickets < 1 ? '토너먼트권 없음' : !hasScore ? '점수 미등록 (내 영지에서 등록)' : '침략';
    document.getElementById('modal-user').classList.remove('hidden');
}

async function doInvade() {
    if (!selectedUser) return;
    if ((currentUser?.tickets || 0) < 1) { alert('토너먼트권이 없습니다.\n내 영지에서 골드로 구매하세요!'); return; }
    if (!currentUser?.mock_exam_score) { alert('평가원 점수를 먼저 등록해주세요.\n(내 성채 클릭 → 점수 등록)'); return; }

    if (!confirm(`${selectedUser.nickname}의 영지(${selectedUser.university || '?'})를 침략하시겠습니까?\n토너먼트권 1장 소모`)) return;

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
            ? `⚔️ 침략 성공!\n\n내 점수: ${data.attacker_score}점\n상대 점수: ${data.defender_score}점\n\n🏫 영지 이전: ${data.defender_university}로 갈아탔습니다!`
            : `🛡️ 침략 실패!\n\n내 점수: ${data.attacker_score}점\n상대 점수: ${data.defender_score}점\n\n더 높은 점수로 도전하세요.`;
        alert(msg);
        currentUser = data.user;
        updateHUD(data.user);
        updateMyBuilding(data.user);
        closeModal('modal-user');
        loadRankingAndMap();
    } catch (e) { alert('서버 오류 발생'); }
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
}

function focusUser(userId) {
    const user = allUsers.find(u => u.id === userId);
    if (!user) return;
    openUserModal(user);
}

// ── 패널/모달 ────────────────────────────────────────────────────────
function togglePanel(id) {
    const el = document.getElementById(id);
    const isHidden = el.classList.contains('hidden');
    document.querySelectorAll('.side-panel').forEach(p => p.classList.add('hidden'));
    if (isHidden) {
        el.classList.remove('hidden');
        if (id === 'panel-rank') loadRankPanel(currentRankTab);
        if (id === 'panel-notif') loadNotifPanel();
    }
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('.modal-overlay').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.add('hidden'); });
});

// ── 드래그 / 줌 ─────────────────────────────────────────────────────
container.addEventListener('mousedown', startDrag);
container.addEventListener('touchstart', e => startDrag(e.touches[0]), { passive: true });
window.addEventListener('mouseup', endDrag);
window.addEventListener('touchend', endDrag);
window.addEventListener('mousemove', onDrag);
window.addEventListener('touchmove', e => { if (isDragging) onDrag(e.touches[0]); }, { passive: true });

function startDrag(e) {
    if (e.target.closest('.side-panel,.modal-overlay,#hud-top-left,#hud-top-right,#hud-right,#hud-bottom,#btn-return-home,#search-bar')) return;
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
    e.preventDefault(); zoomMap(e.deltaY * -0.001);
}, { passive: false });

function zoomMap(delta) {
    scale = Math.min(Math.max(0.4, scale + delta), 2.0);
    applyTransform();
}
function panMap(dx, dy) { mapOffsetX += dx; mapOffsetY += dy; applyTransform(); }
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
