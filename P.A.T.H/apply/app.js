'use strict';

// ── 전역 상태 ────────────────────────────────────────────────────────────
let currentUser   = null;
let myScores      = null;
let currentRound  = null;
let myApplications = {};  // group_type → application 객체
let pendingGroup  = null; // 검색 모달에서 선택 중인 군
let pendingEnrollId = null;

// ── 초기화 ────────────────────────────────────────────────────────────────
async function init() {
    try {
        const [meRes, scoreRes, roundRes] = await Promise.all([
            fetch('/api/auth/me', { credentials: 'include' }),
            fetch('/api/apply/scores/me', { credentials: 'include' }),
            fetch('/api/apply/current-round', { credentials: 'include' }),
        ]);

        if (!meRes.ok) { location.href = '/login/'; return; }

        const meData = await meRes.json();
        currentUser = meData.user;
        document.getElementById('header-tickets').textContent = `🎫 ${currentUser.tickets || 0}`;

        if (scoreRes.ok) {
            const sd = await scoreRes.json();
            myScores = sd.scores;
            renderScoreForm();
            renderScoreStatus();
        }

        if (roundRes.ok) {
            const rd = await roundRes.json();
            currentRound = rd.round;
        }

        renderRoundInfo();
        await loadMyApplications();

    } catch (err) {
        console.error('init 오류:', err);
    }
}

// ── 탭 전환 ──────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

    if (tab === 'apply')  renderApplyTab();
    if (tab === 'result') loadResults();
}

// ── 점수 폼 렌더링 ────────────────────────────────────────────────────────
function renderScoreForm() {
    if (!myScores) return;
    const fields = [
        'korean_subject','korean_std','korean_percentile',
        'math_subject','math_std','math_percentile',
        'english_grade',
        'explore1_subject','explore1_std','explore1_percentile',
        'explore2_subject','explore2_std','explore2_percentile',
        'history_grade',
        'second_lang_subject','second_lang_std','second_lang_percentile',
        'source_round_name',
    ];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el && myScores[id] != null) el.value = myScores[id];
    });
    updateSecondLangVisibility();

    if (myScores.score_image_url) {
        const preview = document.getElementById('score-image-preview');
        preview.src = myScores.score_image_url;
        preview.style.display = 'block';
        document.querySelector('.upload-area p').textContent = '이미지가 업로드되었습니다';
    }
}

function renderScoreStatus() {
    const wrap = document.getElementById('score-status-wrap');
    if (!myScores) { wrap.innerHTML = ''; return; }
    const s = myScores.verified_status || 'none';
    const msgs = {
        none:     { icon: '📝', text: '점수를 저장했어요. 성적표를 인증하면 다른 유저 칸수를 볼 수 있어요.', cls: 'none' },
        pending:  { icon: '⏳', text: '성적표 인증 심사 중입니다.', cls: 'pending' },
        approved: { icon: '✅', text: '성적표 인증 완료! 다른 유저 칸수를 조회할 수 있어요.', cls: 'approved' },
        rejected: { icon: '❌', text: '성적표 인증이 반려되었습니다. 이미지를 다시 업로드해주세요.', cls: 'rejected' },
    };
    const m = msgs[s] || msgs.none;
    wrap.innerHTML = `<div class="score-status-bar ${m.cls}">${m.icon} ${m.text}</div>`;
}

function updateSecondLangVisibility() {
    const subj = document.getElementById('second_lang_subject')?.value;
    const wrap = document.getElementById('second-lang-scores');
    if (wrap) wrap.style.display = subj ? 'grid' : 'none';
}

document.addEventListener('input', e => {
    if (e.target.id === 'second_lang_subject') updateSecondLangVisibility();
});

// ── 점수 저장 ─────────────────────────────────────────────────────────────
async function saveScores() {
    const btn = document.getElementById('save-score-btn');
    const body = {
        korean_std:       parseIntOrNull('korean_std'),
        korean_percentile:parseFloatOrNull('korean_percentile'),
        korean_subject:   val('korean_subject'),
        math_std:         parseIntOrNull('math_std'),
        math_percentile:  parseFloatOrNull('math_percentile'),
        math_subject:     val('math_subject'),
        english_grade:    parseIntOrNull('english_grade'),
        explore1_subject: val('explore1_subject'),
        explore1_std:     parseIntOrNull('explore1_std'),
        explore1_percentile: parseFloatOrNull('explore1_percentile'),
        explore2_subject: val('explore2_subject'),
        explore2_std:     parseIntOrNull('explore2_std'),
        explore2_percentile: parseFloatOrNull('explore2_percentile'),
        history_grade:    parseIntOrNull('history_grade'),
        second_lang_subject: val('second_lang_subject'),
        second_lang_std:  parseIntOrNull('second_lang_std'),
        second_lang_percentile: parseFloatOrNull('second_lang_percentile'),
        source_round_name: val('source_round_name'),
    };

    if (!body.korean_std || !body.math_std || !body.english_grade || !body.history_grade) {
        showToast('국어, 수학, 영어, 한국사는 필수입니다.');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
        const r = await fetch('/api/apply/scores', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = await r.json();
        if (r.ok) {
            myScores = data.scores;
            renderScoreStatus();
            showToast('점수가 저장되었습니다 ✓');
        } else {
            showToast(data.error || '저장 실패');
        }
    } catch (err) {
        showToast('네트워크 오류');
    } finally {
        btn.disabled = false;
        btn.textContent = '점수 저장하기';
    }
}

// ── 이미지 업로드 ─────────────────────────────────────────────────────────
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const preview = document.getElementById('score-image-preview');
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';

    const fd = new FormData();
    fd.append('scoreImage', file);

    try {
        const r = await fetch('/api/apply/scores/image', {
            method: 'POST', credentials: 'include', body: fd,
        });
        const data = await r.json();
        if (r.ok) {
            showToast('성적표 업로드 완료. 인증 심사 중...');
            if (myScores) myScores.verified_status = 'pending';
            renderScoreStatus();
        } else {
            showToast(data.error || '업로드 실패');
        }
    } catch {
        showToast('업로드 중 오류가 발생했습니다.');
    }
}

// ── 회차 정보 렌더링 ──────────────────────────────────────────────────────
function renderRoundInfo() {
    const wrap = document.getElementById('round-info-wrap');
    if (!currentRound) {
        wrap.innerHTML = `
            <div class="card" style="text-align:center;padding:16px">
                <p style="font-size:13px;color:var(--gray-400)">현재 진행 중인 회차가 없습니다</p>
            </div>`;
        return;
    }
    const statusMap = {
        open: '<span class="round-pill open">● 지원 중</span>',
        closed: '<span class="round-pill closed">마감</span>',
        announced: '<span class="round-pill announced">● 결과 발표</span>',
    };
    const pill = statusMap[currentRound.status] || `<span class="round-pill closed">${currentRound.status}</span>`;
    let dateInfo = '';
    if (currentRound.result_at) {
        const d = new Date(currentRound.result_at);
        dateInfo = `<p style="font-size:12px;color:var(--gray-400);margin-top:4px">결과 발표: ${d.toLocaleDateString('ko-KR')}</p>`;
    }
    wrap.innerHTML = `
        <div class="card" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <div>
                    <p style="font-size:15px;font-weight:700">${esc(currentRound.name)}</p>
                    ${dateInfo}
                </div>
                ${pill}
            </div>
        </div>`;
}

// ── 원서 접수 탭 렌더링 ───────────────────────────────────────────────────
function renderApplyTab() {
    const noScore = document.getElementById('no-score-warning');
    const applyMain = document.getElementById('apply-main');

    if (!myScores || !myScores.korean_std) {
        noScore.style.display = 'block';
        applyMain.style.display = 'none';
        return;
    }
    noScore.style.display = 'none';
    applyMain.style.display = 'block';
    renderGroupCards();
    renderAppliedDetail();
}

async function loadMyApplications() {
    if (!currentRound) return;
    try {
        const r = await fetch(`/api/apply/applications/me?round_id=${currentRound.id}`, { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        myApplications = {};
        (data.applications || []).forEach(app => {
            myApplications[app.group_type] = app;
        });
    } catch {}
}

function renderGroupCards() {
    ['가','나','다'].forEach(g => {
        const card = document.getElementById(`card-${g}`);
        const uniEl = document.getElementById(`uni-${g}`);
        const app = myApplications[g];

        card.className = 'group-card';
        if (app) {
            card.classList.add('has-app');
            if (app.status === 'passed') card.classList.add('passed');
            if (app.status === 'failed') card.classList.add('failed');

            uniEl.innerHTML = esc(app.university);

            // 칸수 게이지
            if (app.kanInfo) {
                const existing = card.querySelector('.group-card-kan');
                if (existing) existing.remove();
                const kanEl = document.createElement('div');
                kanEl.className = 'group-card-kan';
                kanEl.innerHTML = renderKanMini(app.kanInfo.kan);
                card.appendChild(kanEl);
            }
        } else {
            uniEl.textContent = '미지원';
            const existing = card.querySelector('.group-card-kan');
            if (existing) existing.remove();
        }
    });
}

function renderAppliedDetail() {
    const wrap = document.getElementById('applied-detail');
    const apps = Object.values(myApplications);
    if (apps.length === 0) { wrap.innerHTML = ''; return; }

    const canCancel = currentRound?.status === 'open' && (() => {
        if (!currentRound?.result_at) return true;
        const msLeft = new Date(currentRound.result_at) - new Date();
        return msLeft > 3 * 24 * 60 * 60 * 1000;
    })();

    wrap.innerHTML = apps.map(app => `
        <div class="card" style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
                        <span class="badge badge-blue">${esc(app.group_type)}군</span>
                        <span style="font-size:16px;font-weight:700">${esc(app.university)}</span>
                    </div>
                    ${app.department ? `<p style="font-size:13px;color:var(--gray-600)">${esc(app.department)}</p>` : ''}
                </div>
                ${canCancel ? `<button class="btn btn-danger btn-sm" onclick="cancelApplication(${app.id})">취소</button>` : ''}
            </div>
            ${app.kanInfo ? `
                <div style="margin-top:12px">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                        <div class="kan-container" style="height:32px;width:80px">
                            ${renderKanBars(app.kanInfo.kan)}
                        </div>
                        <span class="kan-label color-${app.kanInfo.kan}" style="font-size:15px">${app.kanInfo.kan}칸</span>
                        <span style="font-size:12px;color:var(--gray-400)">${app.kanInfo.label}</span>
                    </div>
                    <p style="font-size:11px;color:var(--gray-400)">합격 확률 약 ${app.kanInfo.prob}% · 컷라인 ${app.kanInfo.cutline}점</p>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// ── 대학 검색 모달 ────────────────────────────────────────────────────────
function openApplyModal(group) {
    pendingGroup = group;
    document.getElementById('search-modal-title').textContent = `${group}군 대학 선택`;
    document.getElementById('search-input').value = '';
    document.getElementById('search-results').innerHTML = '';
    document.getElementById('search-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('search-input').focus(), 100);
    searchUniversity('');
}

function closeSearchModal(event) {
    if (event && event.target !== document.getElementById('search-modal')) return;
    document.getElementById('search-modal').style.display = 'none';
}

let searchTimer = null;
function searchUniversity(q) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
        try {
            const r = await fetch(`/api/apply/search?q=${encodeURIComponent(q || '서울')}`, { credentials: 'include' });
            if (!r.ok) return;
            const data = await r.json();
            renderSearchResults(data.results || []);
        } catch {}
    }, 200);
}

function renderSearchResults(results) {
    const wrap = document.getElementById('search-results');
    if (results.length === 0) {
        wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🔍</div><p>검색 결과가 없습니다</p></div>';
        return;
    }
    wrap.innerHTML = results.map(u => {
        const kan = u.kanInfo;
        const kanHtml = kan
            ? `<div style="display:flex;align-items:center;gap:6px">
                   <div class="kan-container" style="height:24px;width:56px">${renderKanBars(kan.kan)}</div>
                   <span class="kan-label color-${kan.kan}" style="font-size:13px">${kan.kan}칸</span>
               </div>`
            : '<span style="font-size:12px;color:var(--gray-400)">-</span>';
        return `
            <div class="modal-item" onclick="selectUniversity('${esc(u.name)}')">
                <div>
                    <div class="modal-item-name">${esc(u.name)}</div>
                    <div class="modal-item-sub">${esc(u.region || '')} · ${esc(u.type || '')}</div>
                </div>
                ${kanHtml}
            </div>`;
    }).join('');
}

async function selectUniversity(universityName) {
    document.getElementById('search-modal').style.display = 'none';
    if (!currentRound || currentRound.status !== 'open') {
        showToast('현재 지원 기간이 아닙니다.');
        return;
    }
    try {
        const r = await fetch('/api/apply/applications', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ round_id: currentRound.id, university: universityName, group_type: pendingGroup }),
        });
        const data = await r.json();
        if (r.ok) {
            currentUser.tickets = data.remaining_tickets;
            document.getElementById('header-tickets').textContent = `🎫 ${data.remaining_tickets}`;
            await loadMyApplications();
            renderGroupCards();
            renderAppliedDetail();
            showToast(`${pendingGroup}군: ${universityName} 지원 완료 ✓`);
        } else {
            showToast(data.error || '지원 실패');
        }
    } catch {
        showToast('네트워크 오류');
    }
}

// ── 원서 취소 ─────────────────────────────────────────────────────────────
async function cancelApplication(appId) {
    if (!confirm('원서를 취소하면 티켓이 환불됩니다. 취소하시겠어요?')) return;
    try {
        const r = await fetch(`/api/apply/applications/${appId}`, {
            method: 'DELETE', credentials: 'include',
        });
        const data = await r.json();
        if (r.ok) {
            await loadMyApplications();
            renderGroupCards();
            renderAppliedDetail();
            currentUser.tickets = (currentUser.tickets || 0) + 1;
            document.getElementById('header-tickets').textContent = `🎫 ${currentUser.tickets}`;
            showToast('원서가 취소되었습니다. 티켓이 환불되었습니다.');
        } else {
            showToast(data.error || '취소 실패');
        }
    } catch {
        showToast('네트워크 오류');
    }
}

// ── 결과 확인 ─────────────────────────────────────────────────────────────
async function loadResults() {
    const wrap = document.getElementById('result-list');
    wrap.innerHTML = '<div class="empty-state"><span class="spinner" style="border-color:var(--gray-200);border-top-color:var(--blue)"></span></div>';

    try {
        const [mainRes, suppRes] = await Promise.all([
            fetch('/api/apply/results/me', { credentials: 'include' }),
            fetch('/api/apply/results/supplementary/me', { credentials: 'include' }),
        ]);

        const mainData = mainRes.ok ? await mainRes.json() : { results: [] };
        const allResults = mainData.results || [];

        if (allResults.length === 0) {
            wrap.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>아직 결과가 없어요</p>
                    <p style="font-size:12px;margin-top:4px">결과 발표 후 여기서 확인할 수 있어요</p>
                </div>`;
            return;
        }

        wrap.innerHTML = allResults.map(app => {
            const statusMap = {
                passed:    { label: '합격', cls: 'badge-green', cardCls: 'passed' },
                failed:    { label: '불합격', cls: 'badge-gray', cardCls: 'failed' },
                enrolled:  { label: '등록 완료', cls: 'badge-blue', cardCls: 'enrolled' },
                waitlisted:{ label: '추합 대기', cls: 'badge-yellow', cardCls: 'waitlisted' },
                declined:  { label: '포기', cls: 'badge-gray', cardCls: 'failed' },
            };
            const st = statusMap[app.status] || { label: app.status, cls: 'badge-gray', cardCls: '' };

            const enrollBtn = app.status === 'passed' ? `
                <button class="btn btn-primary" style="margin-top:12px"
                    onclick="openEnrollModal(${app.id}, '${esc(app.university)}', '${esc(app.department || '')}')">
                    등록하기
                </button>` : '';

            return `
                <div class="result-card ${st.cardCls}">
                    <div class="result-uni">${esc(app.university)}</div>
                    ${app.department ? `<div class="result-dept">${esc(app.department)}</div>` : ''}
                    <div class="result-meta">
                        <span class="badge ${st.cls}">${st.label}</span>
                        <span class="badge badge-gray">${esc(app.group_type)}군</span>
                        <span style="font-size:12px;color:var(--gray-400)">${esc(app.round_name || '')}</span>
                    </div>
                    ${enrollBtn}
                </div>`;
        }).join('');

    } catch (err) {
        wrap.innerHTML = '<div class="empty-state"><p>결과를 불러오지 못했어요</p></div>';
    }
}

// ── 등록 모달 ─────────────────────────────────────────────────────────────
function openEnrollModal(appId, university, department) {
    pendingEnrollId = appId;
    document.getElementById('enroll-modal-content').innerHTML = `
        <div style="text-align:center;padding:16px 0 20px">
            <div style="font-size:36px;margin-bottom:12px">🎓</div>
            <p style="font-size:18px;font-weight:800;margin-bottom:4px">${esc(university)}</p>
            ${department ? `<p style="font-size:14px;color:var(--gray-600);margin-bottom:12px">${esc(department)}</p>` : '<div style="height:12px"></div>'}
            <p style="font-size:13px;color:var(--gray-600)">이 대학으로 최종 등록하시겠어요?<br>다른 군의 합격은 자동으로 취소됩니다.</p>
        </div>`;
    document.getElementById('enroll-modal').style.display = 'flex';
}

function closeEnrollModal(event) {
    if (event && event.target !== document.getElementById('enroll-modal')) return;
    document.getElementById('enroll-modal').style.display = 'none';
    pendingEnrollId = null;
}

async function confirmEnroll() {
    if (!pendingEnrollId) return;
    const btn = document.getElementById('enroll-confirm-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
        const r = await fetch('/api/apply/enroll', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ application_id: pendingEnrollId }),
        });
        const data = await r.json();
        if (r.ok) {
            document.getElementById('enroll-modal').style.display = 'none';
            showToast(`🎓 ${data.university} 최종 등록 완료!`);
            loadResults();
        } else {
            showToast(data.error || '등록 실패');
        }
    } catch {
        showToast('네트워크 오류');
    } finally {
        btn.disabled = false;
        btn.textContent = '등록하기';
    }
}

// ── 칸수 UI 헬퍼 ─────────────────────────────────────────────────────────
function renderKanBars(kan) {
    return Array.from({ length: 7 }, (_, i) =>
        `<div class="kan-bar${i < kan ? ` filled-${kan}` : ''}"></div>`
    ).join('');
}

function renderKanMini(kan) {
    const colors = { 1:'#EF4444',2:'#EF4444',3:'#F59E0B',4:'#F59E0B',5:'#3182F6',6:'#3182F6',7:'#00C73C' };
    const color = colors[kan] || '#9EA7AD';
    return `<div style="display:flex;gap:2px;align-items:flex-end;height:16px">
        ${Array.from({length:7},(_,i)=>`<div style="width:4px;background:${i<kan?color:'#E5E8EB'};height:${Math.round((i+1)/7*100)}%;border-radius:1px 1px 0 0"></div>`).join('')}
    </div>`;
}

// ── 유틸 ──────────────────────────────────────────────────────────────────
function val(id) {
    const el = document.getElementById(id);
    return el ? (el.value.trim() || null) : null;
}
function parseIntOrNull(id) {
    const v = val(id);
    const n = parseInt(v);
    return isNaN(n) ? null : n;
}
function parseFloatOrNull(id) {
    const v = val(id);
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
}
function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

let toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ── 실행 ──────────────────────────────────────────────────────────────────
init();
