'use strict';

// ── 전역 상태 ────────────────────────────────────────────────────────────
let currentUser   = null;
let myScores      = null;
let currentRound  = null;
let myApplications = {};  // group_type → application 객체
let pendingGroup  = null; // 검색 모달에서 선택 중인 군
let pendingEnrollId = null;
let replacementSuggestionRequestId = 0;

// ── 초기화 ────────────────────────────────────────────────────────────────
async function init() {
    try {
        bindModalEvents();

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
        renderScoreDashboard();

    } catch (err) {
        console.error('init 오류:', err);
    }
}

function bindModalEvents() {
    const searchModal = document.getElementById('search-modal');
    const searchSheet = searchModal?.querySelector('.modal-sheet');
    const searchCloseBtn = searchModal?.querySelector('[data-modal-close="search"]');
    if (searchModal && !searchModal.dataset.bound) {
        searchModal.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeSearchModal();
        });
        searchModal.dataset.bound = 'true';
    }
    if (searchSheet && !searchSheet.dataset.bound) {
        ['click', 'pointerdown', 'touchstart'].forEach(type => {
            searchSheet.addEventListener(type, event => event.stopPropagation());
        });
        searchSheet.dataset.bound = 'true';
    }
    if (searchCloseBtn && !searchCloseBtn.dataset.bound) {
        searchCloseBtn.addEventListener('click', () => closeSearchModal());
        searchCloseBtn.dataset.bound = 'true';
    }

    const enrollModal = document.getElementById('enroll-modal');
    const enrollSheet = enrollModal?.querySelector('.modal-sheet');
    const enrollCloseBtn = enrollModal?.querySelector('[data-modal-close="enroll"]');
    if (enrollModal && !enrollModal.dataset.bound) {
        enrollModal.addEventListener('click', event => {
            if (event.target === event.currentTarget) closeEnrollModal();
        });
        enrollModal.dataset.bound = 'true';
    }
    if (enrollSheet && !enrollSheet.dataset.bound) {
        ['click', 'pointerdown', 'touchstart'].forEach(type => {
            enrollSheet.addEventListener(type, event => event.stopPropagation());
        });
        enrollSheet.dataset.bound = 'true';
    }
    if (enrollCloseBtn && !enrollCloseBtn.dataset.bound) {
        enrollCloseBtn.addEventListener('click', () => closeEnrollModal());
        enrollCloseBtn.dataset.bound = 'true';
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

    renderScoreDashboard();
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
            renderScoreDashboard();
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
    renderApplyAnalytics();
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
        renderScoreDashboard();
        if (document.getElementById('tab-apply')?.classList.contains('active')) {
            renderApplyAnalytics();
        }
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
    if (event && event.target !== event.currentTarget) return;
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
    const ranked = [...results].sort((a, b) => {
        const aKan = Number(a?.kanInfo?.kan || 0);
        const bKan = Number(b?.kanInfo?.kan || 0);
        if (bKan !== aKan) return bKan - aKan;
        const aProb = Number(a?.kanInfo?.prob || 0);
        const bProb = Number(b?.kanInfo?.prob || 0);
        return bProb - aProb;
    });

    const currentApp = pendingGroup ? myApplications[pendingGroup] || null : null;

    wrap.innerHTML = ranked.map((u, index) => {
        const kan = u.kanInfo;
        const risk = getRiskMeta(kan?.kan);
        const recommendation = getSearchRecommendationMeta(currentApp, u, index);
        const kanHtml = kan
            ? `<div style="display:flex;align-items:center;gap:6px;flex-direction:column;align-items:flex-end">
                   <div class="kan-container" style="height:24px;width:56px">${renderKanBars(kan.kan)}</div>
                   <div style="display:flex;align-items:center;gap:6px">
                       <span class="kan-label color-${kan.kan}" style="font-size:13px">${kan.kan}칸</span>
                       <span class="risk-chip ${risk.className}">${risk.label}</span>
                   </div>
                   <span style="font-size:11px;color:var(--gray-400)">합격확률 ${kan.prob}%</span>
               </div>`
            : '<span style="font-size:12px;color:var(--gray-400)">-</span>';

        const badgeHtml = recommendation.badges.length
            ? `<div class="modal-item-badges">${recommendation.badges.map(b => `<span class="mini-badge ${b.className}">${b.label}</span>`).join('')}</div>`
            : '';
        return `
            <div class="modal-item" onclick="selectUniversity(${jsQuote(u.name)})">
                <div>
                    <div class="modal-item-name">${esc(u.name)}</div>
                    <div class="modal-item-sub">${esc(u.region || '')} · ${esc(u.type || '')}</div>
                    ${badgeHtml}
                    <div class="modal-item-reason">${recommendation.reason}</div>
                </div>
                ${kanHtml}
            </div>`;
    }).join('');
}

async function selectUniversity(universityName) {
    document.getElementById('search-modal').style.display = 'none';
    return applyUniversityToGroup(pendingGroup, universityName);
}

async function applyUniversityToGroup(group, universityName) {
    if (!currentRound || currentRound.status !== 'open') {
        showToast('현재 지원 기간이 아닙니다.');
        return;
    }

    if (!group || !['가', '나', '다'].includes(group)) {
        showToast('지원 군 정보를 확인할 수 없습니다.');
        return;
    }

    try {
        const r = await fetch('/api/apply/applications', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ round_id: currentRound.id, university: universityName, group_type: group }),
        });
        const data = await r.json();
        if (r.ok) {
            currentUser.tickets = data.remaining_tickets;
            document.getElementById('header-tickets').textContent = `🎫 ${data.remaining_tickets}`;
            await loadMyApplications();
            renderGroupCards();
            renderApplyAnalytics();
            renderAppliedDetail();
            renderScoreDashboard();
            showToast(`${group}군: ${universityName} 지원 완료 ✓`);
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
            renderApplyAnalytics();
            renderAppliedDetail();
            currentUser.tickets = (currentUser.tickets || 0) + 1;
            document.getElementById('header-tickets').textContent = `🎫 ${currentUser.tickets}`;
            renderScoreDashboard();
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
    const summaryWrap = document.getElementById('result-summary');
    const judgementWrap = document.getElementById('result-judgement-board');
    if (summaryWrap) summaryWrap.innerHTML = '';
    if (judgementWrap) judgementWrap.innerHTML = '';
    wrap.innerHTML = '<div class="empty-state"><span class="spinner" style="border-color:var(--gray-200);border-top-color:var(--blue)"></span></div>';

    try {
        const [mainRes, suppRes] = await Promise.all([
            fetch('/api/apply/results/me', { credentials: 'include' }),
            fetch('/api/apply/results/supplementary/me', { credentials: 'include' }),
        ]);

        const mainData = mainRes.ok ? await mainRes.json() : { results: [] };
        const allResults = mainData.results || [];

        if (allResults.length === 0) {
            renderResultSummary([]);
            renderGroupJudgementBoard([], true);
            wrap.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📋</div>
                    <p>아직 결과가 없어요</p>
                    <p style="font-size:12px;margin-top:4px">결과 발표 후 여기서 확인할 수 있어요</p>
                </div>`;
            return;
        }

        renderResultSummary(allResults);
    renderGroupJudgementBoard(allResults, false);

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
    if (event && event.target !== event.currentTarget) return;
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

function getRiskMeta(kan) {
    if (!Number.isFinite(Number(kan))) {
        return { className: 'unknown', label: '분석대기' };
    }
    const n = Number(kan);
    if (n >= 6) return { className: 'safe', label: '안정' };
    if (n >= 4) return { className: 'fit', label: '적정' };
    if (n >= 2) return { className: 'bold', label: '소신' };
    return { className: 'risk', label: '위험' };
}

function calcTotalStd(scores) {
    if (!scores) return null;
    const values = [scores.korean_std, scores.math_std, scores.explore1_std, scores.explore2_std]
        .map(v => Number(v))
        .filter(Number.isFinite);
    if (values.length < 3) return null;
    return Math.round(values.reduce((acc, cur) => acc + cur, 0));
}

function renderScoreDashboard() {
    const totalEl = document.getElementById('kpi-total-std');
    const noteEl = document.getElementById('kpi-score-note');
    const appliedEl = document.getElementById('kpi-applied-count');
    const avgKanEl = document.getElementById('kpi-avg-kan');
    const portfolioScoreEl = document.getElementById('kpi-portfolio-score');
    const riskMixEl = document.getElementById('kpi-risk-mix');
    const strategyEl = document.getElementById('kpi-strategy');
    if (!totalEl || !noteEl || !appliedEl || !avgKanEl || !portfolioScoreEl || !riskMixEl || !strategyEl) return;

    const totalStd = calcTotalStd(myScores);
    totalEl.textContent = Number.isFinite(totalStd) ? `${totalStd}점` : '-';
    noteEl.textContent = Number.isFinite(totalStd)
        ? '국어+수학+탐구(최대 2과목) 합산'
        : '국어/수학/탐구 입력 시 자동 계산';

    const apps = Object.values(myApplications || {});
    appliedEl.textContent = `${apps.length}/3군`;

    const kans = apps.map(app => Number(app?.kanInfo?.kan)).filter(Number.isFinite);
    const portfolio = computePortfolioMetrics(kans, apps.length);
    if (kans.length > 0) {
        const avg = (kans.reduce((acc, cur) => acc + cur, 0) / kans.length).toFixed(1);
        avgKanEl.textContent = `${avg}칸`;
    } else {
        avgKanEl.textContent = '-칸';
    }

    portfolioScoreEl.textContent = `${portfolio.score}점`;
    portfolioScoreEl.classList.remove('is-good', 'is-mid', 'is-risk');
    if (portfolio.score >= 80) portfolioScoreEl.classList.add('is-good');
    else if (portfolio.score >= 60) portfolioScoreEl.classList.add('is-mid');
    else portfolioScoreEl.classList.add('is-risk');

    riskMixEl.textContent = `${portfolio.safe}/${portfolio.fit}/${portfolio.bold}/${portfolio.risk}`;

    strategyEl.textContent = getStrategyMessage(kans, apps.length, portfolio);
}

function getStrategyMessage(kans, count, portfolio = null) {
    if (!myScores || !myScores.korean_std || !myScores.math_std) {
        return '필수 점수 입력 후 지원 전략 분석이 제공됩니다.';
    }
    if (count === 0) {
        return '권장 시작 조합: 가군 적정, 나군 안정, 다군 소신.';
    }
    if (kans.length === 0) {
        return '지원은 완료되었으나 칸수 데이터가 없어 분석 대기 상태입니다.';
    }

    const risky = kans.filter(k => k <= 2).length;
    const bold = kans.filter(k => k >= 3 && k <= 4).length;
    const safe = kans.filter(k => k >= 6).length;
    if (risky >= 2) return '위험·소신 비중이 높습니다. 1개 군은 5칸 이상 안정 지원으로 조정하는 것을 권장합니다.';
    if (safe >= 2) return '안정 비중이 높습니다. 1개 군은 3~4칸 적정·소신 지원 검토를 권장합니다.';
    if (bold >= 2) return '소신 비중이 높은 편입니다. 가/나군 중 1개는 적정권으로 완충하면 안정적입니다.';
    if (portfolio && portfolio.balanceRisk >= 0.75) return '군별 칸수 편차가 큽니다. 상/하위 1개 군을 재배치하면 안정도가 개선됩니다.';
    return '현재 배치 균형이 양호합니다. 모집군별 우선순위만 최종 점검해 주세요.';
}

function renderApplyAnalytics() {
    const matrixEl = document.getElementById('strategy-matrix');
    const summaryEl = document.getElementById('strategy-summary');
    const actionsEl = document.getElementById('strategy-actions');
    const replacementEl = document.getElementById('replacement-board');
    if (!matrixEl || !summaryEl || !actionsEl || !replacementEl) return;

    const groups = ['가', '나', '다'];
    const rowsMeta = groups.map(group => {
        const app = myApplications[group];
        if (!app) {
            return {
                row: `
                <div class="strategy-row">
                    <div class="left">
                        <span class="group-chip">${group}군</span>
                        <span class="uni">미지원</span>
                    </div>
                    <span class="risk-chip unknown">미배치</span>
                </div>`,
                group,
                app: null,
                risk: 'unknown',
                kan: null,
            };
        }

        const risk = getRiskMeta(app?.kanInfo?.kan);
        const kanText = Number.isFinite(Number(app?.kanInfo?.kan)) ? `${app.kanInfo.kan}칸` : '칸수없음';
        return {
            row: `
            <div class="strategy-row">
                <div class="left">
                    <span class="group-chip">${group}군</span>
                    <span class="uni">${esc(app.university)}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-size:12px;color:var(--gray-600)">${kanText}</span>
                    <span class="risk-chip ${risk.className}">${risk.label}</span>
                </div>
            </div>`,
            group,
            app,
            risk: risk.className,
            kan: Number.isFinite(Number(app?.kanInfo?.kan)) ? Number(app.kanInfo.kan) : null,
        };
    });

    matrixEl.innerHTML = rowsMeta.map(v => v.row).join('');

    const kans = rowsMeta.map(v => v.kan).filter(Number.isFinite);
    const portfolio = computePortfolioMetrics(kans, Object.values(myApplications || {}).length);
    summaryEl.innerHTML = `
        <span class="strategy-pill safe">안정 ${portfolio.safe}</span>
        <span class="strategy-pill fit">적정 ${portfolio.fit}</span>
        <span class="strategy-pill bold">소신 ${portfolio.bold}</span>
        <span class="strategy-pill risk">위험 ${portfolio.risk}</span>
        <span class="strategy-pill">배치점수 ${portfolio.score}</span>
    `;

    const actions = buildActionRecommendations(portfolio);
    actionsEl.innerHTML = actions.map((msg, idx) =>
        `<div class="strategy-action-item"><strong>${idx + 1}. </strong>${msg}</div>`
    ).join('');

    replacementEl.innerHTML = '<div class="replacement-empty">교체 후보를 분석하고 있습니다.</div>';
    loadReplacementSuggestions(rowsMeta);
}

async function loadReplacementSuggestions(rowsMeta = []) {
    const replacementEl = document.getElementById('replacement-board');
    if (!replacementEl) return;

    const requestId = ++replacementSuggestionRequestId;
    const targets = rowsMeta
        .filter(row => row && (row.risk === 'risk' || row.risk === 'bold') && row.app)
        .slice(0, 2);

    if (targets.length === 0) {
        replacementEl.innerHTML = '<div class="replacement-empty">현재 배치에서는 즉시 교체가 필요한 군이 없습니다.</div>';
        return;
    }

    try {
        const cards = await Promise.all(targets.map(async (target) => {
            const query = buildReplacementSearchQuery(target.app.university);
            const response = await fetch(`/api/apply/search?q=${encodeURIComponent(query)}`, { credentials: 'include' });
            if (!response.ok) return renderReplacementCard(target, []);
            const data = await response.json();
            const candidates = pickReplacementCandidates(target.app, data.results || []);
            return renderReplacementCard(target, candidates);
        }));

        if (requestId !== replacementSuggestionRequestId) return;
        replacementEl.innerHTML = cards.join('');
    } catch {
        if (requestId !== replacementSuggestionRequestId) return;
        replacementEl.innerHTML = '<div class="replacement-empty">교체 후보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>';
    }
}

function buildReplacementSearchQuery(universityName) {
    const normalized = String(universityName || '')
        .replace(/대학교|대학|여자|과학기술원|교육대학교/g, '')
        .trim();
    const seed = normalized || String(universityName || '').trim();
    return seed.slice(0, 2) || '서울';
}

function getSearchRecommendationMeta(currentApp, item, index) {
    const currentKan = Number(currentApp?.kanInfo?.kan || 0);
    const nextKan = Number(item?.kanInfo?.kan || 0);
    const uplift = Number.isFinite(nextKan) ? nextKan - currentKan : 0;
    const badges = [];

    if (index === 0 && Number.isFinite(nextKan)) {
        badges.push({ className: 'recommend', label: '추천' });
    }
    if (uplift >= 1) {
        badges.push({ className: 'better', label: `+${uplift}칸` });
    }

    let reason = '칸수와 합격확률 기준으로 정렬된 결과입니다.';
    if (uplift >= 2) reason = `현재 지원보다 ${uplift}칸 높아 교체 후보로 적합합니다.`;
    else if (uplift === 1) reason = '현재 지원보다 한 단계 안정적인 대안입니다.';
    else if (nextKan >= 6) reason = '안정권으로 분류되는 후보입니다.';
    else if (nextKan >= 4) reason = '적정권으로 검토하기 좋은 후보입니다.';

    return { badges, reason };
}

function pickReplacementCandidates(currentApp, results) {
    const currentKan = Number(currentApp?.kanInfo?.kan || 0);
    return (results || [])
        .filter(item => item && item.name && item.name !== currentApp.university)
        .filter(item => Number.isFinite(Number(item?.kanInfo?.kan)))
        .map(item => {
            const kan = Number(item.kanInfo.kan);
            const prob = Number(item?.kanInfo?.prob || 0);
            const distanceToIdeal = Math.abs(5 - kan);
            const uplift = kan - currentKan;
            const score = uplift * 20 + prob - distanceToIdeal * 6;
            return { ...item, _score: score, _uplift: uplift };
        })
        .filter(item => item._uplift >= 1 || Number(item?.kanInfo?.kan) >= 4)
        .sort((a, b) => b._score - a._score)
        .slice(0, 2);
}

function renderReplacementCard(target, candidates) {
    const currentKan = Number(target?.app?.kanInfo?.kan || 0);
    const currentLabel = Number.isFinite(currentKan) ? `${currentKan}칸` : '칸수없음';
    const listHtml = candidates.length
        ? `<div class="replacement-list">${candidates.map(candidate => `
            <div class="replacement-item">
                <div class="replacement-item-main">
                    <div class="replacement-item-name">${esc(candidate.name)}</div>
                    <div class="replacement-item-meta">예상 ${candidate.kanInfo.kan}칸 · 합격확률 ${candidate.kanInfo.prob}% · 현재 대비 +${candidate._uplift}칸</div>
                </div>
                <div class="replacement-item-actions">
                    <span class="risk-chip ${getRiskMeta(candidate.kanInfo.kan).className}">${getRiskMeta(candidate.kanInfo.kan).label}</span>
                    <button class="replacement-apply-btn" onclick="applyRecommendedReplacement(${jsQuote(target.group)}, ${jsQuote(candidate.name)})">이 대학으로 교체</button>
                </div>
            </div>`).join('')}</div>`
        : '<div class="replacement-empty">조건에 맞는 교체 후보를 찾지 못했습니다.</div>';

    return `
        <section class="replacement-card">
            <div class="replacement-head">
                <div>
                    <div class="replacement-title">${target.group}군 교체 후보</div>
                    <div class="replacement-sub">현재 ${esc(target.app.university)} · ${currentLabel}</div>
                </div>
                <span class="risk-chip ${target.risk}">${getRiskMeta(currentKan).label}</span>
            </div>
            ${listHtml}
        </section>`;
}

function applyRecommendedReplacement(group, universityName) {
    if (!group || !universityName) return;
    const ok = confirm(`${group}군 지원을 ${universityName}로 교체할까요?`);
    if (!ok) return;
    applyUniversityToGroup(group, universityName);
}

function computePortfolioMetrics(kans, appCount) {
    const safe = kans.filter(k => k >= 6).length;
    const fit = kans.filter(k => k >= 4 && k <= 5).length;
    const bold = kans.filter(k => k >= 2 && k <= 3).length;
    const risk = kans.filter(k => k <= 1).length;

    const coverageRatio = Math.max(0, Math.min(1, appCount / 3));
    const coverageScore = Math.round(coverageRatio * 40);

    const avg = kans.length ? (kans.reduce((a, b) => a + b, 0) / kans.length) : 0;
    const variance = kans.length
        ? (kans.reduce((acc, cur) => acc + ((cur - avg) ** 2), 0) / kans.length)
        : 0;
    const stddev = Math.sqrt(variance);
    const balanceScore = Math.max(0, Math.round(25 - stddev * 8));
    const balanceRisk = Math.min(1, stddev / 3);

    let safetyScore = 0;
    if (safe >= 1) safetyScore += 10;
    if (risk === 0) safetyScore += 5;
    if (bold <= 1) safetyScore += 5;

    const competitivenessScore = Math.max(0, Math.min(15, Math.round(avg * 2)));
    const score = Math.max(0, Math.min(100, coverageScore + balanceScore + safetyScore + competitivenessScore));

    return { score, safe, fit, bold, risk, coverageRatio, balanceRisk, avg };
}

function buildActionRecommendations(portfolio) {
    const messages = [];
    if (portfolio.coverageRatio < 1) {
        messages.push('3개 군이 모두 채워지지 않았습니다. 미지원 군을 먼저 배치하세요.');
    }
    if (portfolio.risk >= 1) {
        messages.push('위험 카드가 포함되어 있습니다. 하향 1개 또는 적정 1개로 교체 검토를 권장합니다.');
    }
    if (portfolio.safe === 0) {
        messages.push('안정 카드가 없습니다. 최소 1개 군은 6칸 이상 안정 배치가 필요합니다.');
    }
    if (portfolio.balanceRisk >= 0.75) {
        messages.push('군별 칸수 편차가 큽니다. 최고/최저 칸수 군의 학과 우선순위를 재정렬하세요.');
    }
    if (messages.length === 0) {
        messages.push('현재 배치 균형이 양호합니다. 경쟁률 변동 구간만 주기적으로 확인하세요.');
    }
    return messages.slice(0, 3);
}

function renderResultSummary(results) {
    const wrap = document.getElementById('result-summary');
    if (!wrap) return;

    const stats = {
        total: results.length,
        passed: results.filter(r => r.status === 'passed').length,
        waitlisted: results.filter(r => r.status === 'waitlisted').length,
        enrolled: results.filter(r => r.status === 'enrolled').length,
    };

    wrap.innerHTML = `
        <div class="result-summary-grid">
            <div class="result-summary-item">
                <p class="result-summary-label">전체</p>
                <p class="result-summary-value">${stats.total}</p>
            </div>
            <div class="result-summary-item">
                <p class="result-summary-label">합격</p>
                <p class="result-summary-value">${stats.passed}</p>
            </div>
            <div class="result-summary-item">
                <p class="result-summary-label">추합대기</p>
                <p class="result-summary-value">${stats.waitlisted}</p>
            </div>
            <div class="result-summary-item">
                <p class="result-summary-label">등록완료</p>
                <p class="result-summary-value">${stats.enrolled}</p>
            </div>
        </div>`;
}

function normalizeResultJudge(status) {
    if (status === 'enrolled') return { label: '등록', className: 'result-enroll' };
    if (status === 'passed') return { label: '합격', className: 'result-pass' };
    if (status === 'waitlisted') return { label: '추합', className: 'result-wait' };
    if (status === 'failed' || status === 'declined') return { label: '불합격', className: 'result-fail' };
    return { label: '대기', className: 'unknown' };
}

function getResultActionText(status) {
    if (status === 'enrolled') return '권장 액션: 등록 확정 상태를 유지하세요.';
    if (status === 'passed') return '권장 액션: 등록 의사와 조건(장학/통학)을 비교하세요.';
    if (status === 'waitlisted') return '권장 액션: 추합 발표 일정을 집중 모니터링하세요.';
    if (status === 'failed' || status === 'declined') return '권장 액션: 다른 군·추합 가능성에 집중하세요.';
    return '권장 액션: 결과 업데이트를 기다려 주세요.';
}

function getRiskActionText(riskClassName) {
    if (riskClassName === 'safe') return '권장 액션: 현재 배치를 유지하세요.';
    if (riskClassName === 'fit') return '권장 액션: 학과 우선순위만 점검하세요.';
    if (riskClassName === 'bold') return '권장 액션: 1개 군은 안정 카드 보강을 권장합니다.';
    if (riskClassName === 'risk') return '권장 액션: 하향 지원 검토를 권장합니다.';
    return '권장 액션: 점수/칸수 데이터 갱신이 필요합니다.';
}

function renderGroupJudgementBoard(results = [], allowApplicationFallback = true) {
    const wrap = document.getElementById('result-judgement-board');
    if (!wrap) return;

    const byGroup = {};
    (results || []).forEach(r => {
        if (r?.group_type) byGroup[r.group_type] = r;
    });

    const groups = ['가', '나', '다'];
    const rows = groups.map(group => {
        const resultRow = byGroup[group] || null;
        const app = myApplications[group] || null;

        if (resultRow) {
            const judge = normalizeResultJudge(resultRow.status);
            const kanText = Number.isFinite(Number(app?.kanInfo?.kan)) ? `${app.kanInfo.kan}칸` : '칸수 정보 없음';
            const actionText = getResultActionText(resultRow.status);
            return `
                <div class="judgement-row">
                    <div class="judgement-group">${group}군</div>
                    <div class="judgement-main">
                        <div class="judgement-uni">${esc(resultRow.university || '미지원')}</div>
                        <div class="judgement-meta">${kanText}</div>
                        <div class="judgement-action">${actionText}</div>
                    </div>
                    <span class="judge-chip ${judge.className}">${judge.label}</span>
                </div>`;
        }

        if (allowApplicationFallback && app) {
            const risk = getRiskMeta(app?.kanInfo?.kan);
            const kanText = Number.isFinite(Number(app?.kanInfo?.kan)) ? `${app.kanInfo.kan}칸` : '칸수 정보 없음';
            const actionText = getRiskActionText(risk.className);
            return `
                <div class="judgement-row">
                    <div class="judgement-group">${group}군</div>
                    <div class="judgement-main">
                        <div class="judgement-uni">${esc(app.university || '미지원')}</div>
                        <div class="judgement-meta">결과 발표 전 · ${kanText}</div>
                        <div class="judgement-action">${actionText}</div>
                    </div>
                    <span class="judge-chip ${risk.className}">${risk.label}</span>
                </div>`;
        }

        return `
            <div class="judgement-row">
                <div class="judgement-group">${group}군</div>
                <div class="judgement-main">
                    <div class="judgement-uni">미지원</div>
                    <div class="judgement-meta">지원 데이터 없음</div>
                    <div class="judgement-action">권장 액션: 군별 1개 이상 지원 배치를 구성하세요.</div>
                </div>
                <span class="judge-chip unknown">미배치</span>
            </div>`;
    });

    wrap.innerHTML = `
        <section class="judgement-board">
            <p class="judgement-title">군별 판정표</p>
            <p class="judgement-sub">진학사식 판정 기준(안정·적정·소신·위험) 및 결과 상태를 함께 보여줍니다.</p>
            <div class="judgement-table">
                ${rows.join('')}
            </div>
        </section>`;
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

function jsQuote(str) {
    return JSON.stringify(str == null ? '' : String(str));
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
