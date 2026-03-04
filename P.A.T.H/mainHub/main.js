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

        if (typeof BG !== 'undefined') BG.init(topPct);

        updateHUD(currentUser);
        updateMyBuilding(currentUser);
        await Promise.all([loadRankingAndMap(), loadNotifBadge()]);

        // [Agent Notice] Show once
        if (!localStorage.getItem('agent_notice_v1')) {
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
    document.getElementById('my-castle-label').textContent = user.university || '내 모의진학';
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

    const others = users.filter(u => u.id !== currentUser?.id).slice(0, 60);
    const positions = [
        { x: 1150, y: 1700 }, { x: 1100, y: 2050 }, { x: 1250, y: 2400 },
        { x: 2720, y: 1420 }, { x: 2820, y: 1820 }, { x: 1020, y: 2730 },
        { x: 2870, y: 2530 }, { x: 2580, y: 2880 }, { x: 1380, y: 1350 },
        { x: 2620, y: 1180 }, { x: 1600, y: 2700 }, { x: 2200, y: 2950 },
        { x: 850, y: 1500 }, { x: 950, y: 1900 }, { x: 800, y: 2300 },
        { x: 3050, y: 1650 }, { x: 3120, y: 2000 }, { x: 1500, y: 2050 },
        { x: 3000, y: 2700 }, { x: 2300, y: 3100 }, { x: 1700, y: 1450 },
        { x: 2450, y: 1300 }, { x: 1800, y: 2900 }, { x: 2700, y: 3200 },
        { x: 1300, y: 1200 }, { x: 990, y: 1600 }, { x: 1100, y: 2600 },
        { x: 2800, y: 1600 }, { x: 2950, y: 2100 }, { x: 1450, y: 2400 },
        { x: 3100, y: 2400 }, { x: 2200, y: 2200 }, { x: 1600, y: 1600 },
        { x: 920, y: 2000 }, { x: 1050, y: 2400 }, { x: 2850, y: 1850 },
        { x: 2700, y: 2200 }, { x: 1250, y: 1400 }, { x: 980, y: 1300 },
        { x: 3000, y: 2000 }, { x: 2400, y: 2600 }, { x: 1700, y: 2200 },
        { x: 1120, y: 1400 }, { x: 2550, y: 1500 }, { x: 1350, y: 2700 },
        { x: 3050, y: 2800 }, { x: 2100, y: 2800 }, { x: 1480, y: 1800 },
        { x: 2900, y: 1400 }, { x: 1600, y: 1200 }, { x: 2400, y: 1900 },
        { x: 810, y: 1800 }, { x: 1200, y: 2200 }, { x: 2750, y: 2900 },
        { x: 2300, y: 1600 }, { x: 1550, y: 2550 }, { x: 1000, y: 2550 },
        { x: 3000, y: 1900 }, { x: 2200, y: 1200 }, { x: 1900, y: 2400 }
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


// ── 유저 모달 (침략) ──────────────────────────────────────────────────
function openUserModal(user) {
    selectedUser = user;
    document.getElementById('user-modal-title').textContent = `⚔️ ${user.nickname}의 모의진학`;
    const myScore = currentUser?.mock_exam_score || 0;
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
        <div style="margin-top:12px;padding:10px;background:rgba(255,255,255,0.03);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text-sub);line-height:1.7">
            ⚔️ <strong style="color:var(--text)">평가원 모의고사 점수</strong>로 승패 결정<br>
            🏆 승리 시 상대방 모의진학 대학 취득<br>
            📄 원서비 1장 소모 · 내 점수: <strong style="color:var(--gold)">${myScore > 0 ? myScore + '점' : '미등록'}</strong>
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
    if ((currentUser?.tickets || 0) < 1) { alert('원서비가 없습니다.\nSHOP에서 골드로 구매하세요!'); return; }
    if (!currentUser?.mock_exam_score) { alert('평가원 점수를 먼저 등록해주세요.\n(내 성채 클릭 → 점수 등록)'); return; }

    if (!confirm(`${selectedUser.nickname}의 모의진학(${selectedUser.university || '?'})을 침략하시겠습니까?\n원서비 1장 소모`)) return;

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
            ? `⚔️ 침략 성공!\n\n내 점수: ${data.attacker_score}점\n상대 점수: ${data.defender_score}점\n\n🏫 모의진학 대학: ${data.defender_university}(으)로 변경!`
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
    
    // side-panel 클래스가 있는 것들만 일괄 처리
    document.querySelectorAll('.side-panel').forEach(p => p.classList.add('hidden'));
    
    if (isHidden) {
        el.classList.remove('hidden');
        if (id === 'panel-rank') loadRankPanel(currentRankTab);
        if (id === 'panel-notif') loadNotifPanel();
        if (id === 'panel-shop') renderShopContent(currentShopTab);
    } else {
        el.classList.add('hidden');
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

/* ── SHOP SYSTEM ── */
let currentShopTab = 'item';

function switchShopTab(tab, btn) {
    currentShopTab = tab;
    const parent = btn.parentElement;
    parent.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderShopContent(tab);
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
        container.innerHTML = `
            <div style="text-align:center;padding:30px 0;color:#555;font-size:12px;letter-spacing:1px;">
                SKINS — COMING SOON
            </div>
        `;
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
                    <span style="font-size:12px;font-weight:700;color:${tierColor};">${price.toLocaleString()}G</span>
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
        currentUser = data.user;
        updateHUD(data.user);
        renderShopContent('item');
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


// Ensure default tab is rendered when panel opens (hook into togglePanel if possible, or just default render)
// Since togglePanel simply toggles 'hidden', we can lazily render or render on init.
// Or just check if panel-shop is visible.

initHub();

