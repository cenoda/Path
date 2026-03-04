function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

const BALLOON_SKINS = {
    'default': { id: 'default', name: '기본 열기구', price: 0, darkImg: 'assets/balloon_dark.png', lightImg: 'assets/balloon_light.png', desc: '기본 제공 열기구' },
    'rainbow': { id: 'rainbow', name: '무지개 열기구', price: 2000, darkImg: 'assets/balloon_rainbow.png', lightImg: 'assets/balloon_rainbow.png', desc: '화려한 무지개 열기구' },
    'pastel': { id: 'pastel', name: '파스텔 열기구', price: 3000, darkImg: 'assets/balloon_pastel.png', lightImg: 'assets/balloon_pastel.png', desc: '차분한 파스텔톤 열기구' },
    'redstripes': { id: 'redstripes', name: '레드 스트라이프', price: 4000, darkImg: 'assets/balloon_redstripes.png', lightImg: 'assets/balloon_redstripes.png', desc: '강렬한 레드 스트라이프 열기구' }
};

function getBalloonSrc(skinId, isLight) {
    const skin = BALLOON_SKINS[skinId] || BALLOON_SKINS['default'];
    return isLight ? skin.lightImg : skin.darkImg;
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem('path_theme', isLight ? 'light' : 'dark');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isLight ? '🌙' : '☀';
    
    // Update balloons on theme change
    const user = currentUser || { university: '' };
    updateMyBuilding(user);
    loadRankingAndMap(); 
}

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-btn');
    const isLight = document.body.classList.contains('light');
    if (btn) btn.textContent = isLight ? '🌙' : '☀';
});

let currentUser = null;
let myTotalSec = 0;
let allUsers = [];
let allUniversities = [];
let selectedUser = null;
let isDragging = false;
let dragStartX, dragStartY;
let mapOffsetX = 0, mapOffsetY = 0;
let scale = 1.0;
let currentRankTab = 'total';

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
        await Promise.all([loadRankingAndMap(), loadNotifBadge(), loadUniversitiesCache()]);

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
    const castle = document.getElementById('my-castle');
    if (!castle) return;
    const img = document.getElementById('my-castle-img');
    const isLight = document.body.classList.contains('light');
    const skinId = user?.balloon_skin || 'default';
    if (img) {
        img.src = getBalloonSrc(skinId, isLight);
        img.style.width = '160px'; 
    }
    const label = document.getElementById('my-castle-label');
    if (label) label.textContent = user?.university || 'MY BALLOON';
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
    document.querySelectorAll('.other-building').forEach(el => el.remove());

    const isLight = document.body.classList.contains('light');

    const others = users.filter(u => u.id !== currentUser?.id).slice(0, 100);
    
    // 중앙(성채) 주변으로 나선형 또는 밀집형 배치
    // 내 성채 위치: 1900, 2000
    const centerX = 1900;
    const centerY = 2000;
    
    others.forEach((user, i) => {
        // 나선형 배치 알고리즘 (Golden Angle approximation)
        const angle = i * 137.5; 
        const radius = 180 + Math.sqrt(i) * 120; // 최소 거리 180px부터 시작하여 점진적으로 확장
        
        const x = centerX + radius * Math.cos(angle * Math.PI / 180);
        const y = centerY + radius * Math.sin(angle * Math.PI / 180);

        const div = document.createElement('div');
        div.className = 'building other-building';
        if (user.is_studying) div.classList.add('studying');
        div.style.left = x + 'px';
        div.style.top  = y + 'px';
        div.dataset.userId = user.id;
        div.onclick = () => openUserModal(user);

        const skinSrc = getBalloonSrc(user.balloon_skin || 'default', isLight);
        div.innerHTML = `
            <img src="${skinSrc}" alt="${esc(user.nickname)}" style="width:100px;opacity:0.8;">
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
    document.getElementById('modal-user').classList.remove('hidden');
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
        currentUser = data.user;
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
    
    // 검색 결과 중 첫 번째 유저로 맵 이동 (편의 기능)
    if (filtered.length > 0 && filtered[0].id !== currentUser?.id) {
        const firstUser = filtered[0];
        // 렌더링된 요소 찾아서 포커스 (약간의 지연 필요할 수 있음)
        setTimeout(() => {
            const el = document.querySelector(`.other-building[data-user-id="${firstUser.id}"]`);
            if (el) {
                // 맵 중앙으로 이동 로직 (간소화)
                const x = parseFloat(el.style.left);
                const y = parseFloat(el.style.top);
                mapOffsetX = -x * scale + (container.clientWidth / 2);
                mapOffsetY = -y * scale + (container.clientHeight / 2);
                mapLayer.style.transform = `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${scale})`;
            }
        }, 100);
    }
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
                const imgSrc = isLight ? skin.lightImg : skin.darkImg;
                const assetSrc = `assets/${imgSrc}`;

                const card = document.createElement('div');
                card.style.cssText = `border:1px solid ${isEquipped ? 'var(--accent-gold)' : 'var(--border)'};border-radius:6px;padding:10px;text-align:center;background:${isEquipped ? 'rgba(255,193,7,0.07)' : 'transparent'};position:relative;`;
                card.innerHTML = `
                    <img src="${assetSrc}" style="width:80px;height:80px;object-fit:contain;margin-bottom:6px;">
                    <div style="font-size:11px;font-weight:600;color:var(--text);margin-bottom:2px;">${esc(skin.name)}</div>
                    <div style="font-size:10px;color:#666;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:3px;">
                        ${skin.price === 0 ? '무료' : `<img src="assets/coin.png" style="width:10px;height:10px;">${skin.price.toLocaleString()}G`}
                    </div>
                    ${isEquipped
                        ? `<div style="font-size:10px;color:var(--accent-gold);letter-spacing:1px;">✓ 장착 중</div>`
                        : isOwned
                            ? `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="equipSkin('${skin.id}')">장착</button>`
                            : skin.price === 0
                                ? `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="buySkin('${skin.id}', 0)">획득</button>`
                                : `<button class="shop-btn" style="padding:4px 12px;font-size:10px;" onclick="buySkin('${skin.id}', ${skin.price})">${skin.price.toLocaleString()}G 구매</button>`
                    }
                `;
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
        currentUser = data.user;
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
        }
        renderShopContent('skin');
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

