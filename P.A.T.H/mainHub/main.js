function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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

// ── 백분위 기반 건물 크기/밝기 ──────────────────────────────────────
function getBuildingStyle(percentile) {
    const pct = percentile || 50;
    if (pct >= 99)  return { img: '/P.A.T.H/assets/castle_main.png', sizePx: 480, brightness: 1.0 };
    if (pct >= 96)  return { img: '/P.A.T.H/assets/castle_main.png', sizePx: 380, brightness: 0.9 };
    if (pct >= 90)  return { img: '/P.A.T.H/assets/castle_main.png', sizePx: 300, brightness: 0.8 };
    if (pct >= 80)  return { img: '/P.A.T.H/assets/hut.png', sizePx: 180, brightness: 0.95 };
    if (pct >= 70)  return { img: '/P.A.T.H/assets/hut.png', sizePx: 145, brightness: 0.85 };
    if (pct >= 60)  return { img: '/P.A.T.H/assets/hut.png', sizePx: 115, brightness: 0.7 };
    return { img: '/P.A.T.H/assets/hut.png', sizePx: 90, brightness: 0.55 };
}

// ── 초기화 ───────────────────────────────────────────────────────────
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
    const pct = user.percentile || 50;
    const b = getBuildingStyle(pct);
    const img = document.getElementById('my-castle-img');
    img.src = b.img;
    img.style.width = b.sizePx + 'px';
    img.style.filter = `brightness(${b.brightness})`;
    document.getElementById('my-castle-label').textContent = user.university || '내 영지';
}

// ── 랭킹 + 맵 ───────────────────────────────────────────────────────
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
        const b = getBuildingStyle(user.percentile);
        const displaySize = Math.floor(b.sizePx * 0.3);

        const div = document.createElement('div');
        div.className = 'building other-building';
        if (user.is_studying) div.classList.add('studying');
        div.style.left = pos.x + 'px';
        div.style.top  = pos.y + 'px';
        div.dataset.userId = user.id;
        div.onclick = () => openUserModal(user);

        div.innerHTML = `
            <img src="${b.img}" alt="${esc(user.nickname)}" style="width:${displaySize}px;filter:brightness(${b.brightness})">
            <div class="building-label">${esc(user.nickname)}<br><span style="font-size:9px;opacity:0.6">${esc(user.university)}</span></div>
        `;
        mapLayer.appendChild(div);
    });
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
                <div class="interior-card">
                    <div class="interior-card-title">🏫 영지 정보</div>
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
                        <div class="estate-label">영지 수입 (패시브)</div>
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
                    <div class="interior-card-title">🎟️ 토너먼트</div>
                    <div class="estate-section">
                        <div class="estate-label">보유 토너먼트권</div>
                        <div class="estate-val" style="font-size:18px;font-weight:700">${currentUser?.tickets || 0}장</div>
                    </div>
                    <div class="estate-section">
                        <div class="estate-label">가격</div>
                        <div class="estate-val">1장 = ${data.ticketPrice.toLocaleString()}G</div>
                    </div>
                    <button class="interior-action-btn" onclick="buyTicket(${data.ticketPrice})">🎟️ 구매</button>
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
            </div>
        `;
        interior.classList.remove('hidden');
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
            currentUser = data.user;
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
        await refreshCurrentUser();
        closeInterior();
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
        <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-sub);line-height:1.7">
            ⚔️ <strong style="color:var(--text)">평가원 모의고사 점수</strong>로 승패 결정<br>
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
            ? `⚔️ 침략 성공!\n\n내 점수: ${data.attacker_score}점\n상대 점수: ${data.defender_score}점\n\n🏫 ${data.defender_university}(으)로 이전!`
            : `🛡️ 침략 실패!\n\n내 점수: ${data.attacker_score}점\n상대 점수: ${data.defender_score}점`;
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

// ── 드래그 / 줌 ──────────────────────────────────────────────────────
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
