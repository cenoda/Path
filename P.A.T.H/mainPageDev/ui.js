const UI = {
    defaultEngGradeRatio: [1.0, 0.97, 0.92, 0.84, 0.74, 0.6, 0.44, 0.26, 0.1],
    defaultHistGradeRatio: [1.0, 1.0, 1.0, 0.98, 0.96, 0.94, 0.92, 0.9, 0.8],
    currentMode: 'timer',
    currentTab: 'study',
    currentUser: null,
    rankingInfo: null,
    universityList: [],
    scoreCalcUniversityInfo: null,
    subjects: [],
    weekOffset: 0,
    weekData: null,
    dragState: null,
    undoTimeoutId: null,
    pendingUndo: null,
    lastStudyRecordId: null,
    studyPlanDrafts: [],
    draftSeq: 1,
    quickSubjectNames: ['국어', '영어', '수학', '사회', '과학', '코딩', '전공'],
    timetableConfig: {
        dayStartMinute: 6 * 60,
        dayEndMinute: 24 * 60,
        hourHeight: 56,
        snapMinute: 5
    },

    elements: {
        body:        document.body,
        goldVal:     document.getElementById('gold-val'),
        diamondVal:  document.getElementById('diamond-val'),
        ticketVal:   document.getElementById('ticket-val'),
        tierTag:     document.querySelector('.tier-tag'),
        rankPct:     document.getElementById('rank-pct'),
        tabStudyBtn: document.getElementById('tab-study-btn'),
        tabCalendarBtn: document.getElementById('tab-calendar-btn'),
        tabScoreCalcBtn: document.getElementById('tab-scorecalc-btn'),
        tabBalloonBtn: document.getElementById('tab-balloon-btn'),
        tabStudy:    document.getElementById('tab-study'),
        tabCalendar: document.getElementById('tab-calendar'),
        tabScoreCalc: document.getElementById('tab-scorecalc'),
        tabBalloon:  document.getElementById('tab-balloon'),
        scoreCalcUniversity: document.getElementById('scorecalc-university'),
        scoreCalcTrack: document.getElementById('scorecalc-track'),
        scoreCalcCategory: document.getElementById('scorecalc-category'),
        scoreCalcKorean: document.getElementById('scorecalc-korean'),
        scoreCalcMath: document.getElementById('scorecalc-math'),
        scoreCalcInquiry1: document.getElementById('scorecalc-inquiry1'),
        scoreCalcInquiry2: document.getElementById('scorecalc-inquiry2'),
        scoreCalcEnglishGrade: document.getElementById('scorecalc-english-grade'),
        scoreCalcHistoryGrade: document.getElementById('scorecalc-history-grade'),
        scoreCalcMathChoice: document.getElementById('scorecalc-math-choice'),
        scoreCalcInquiryType: document.getElementById('scorecalc-inquiry-type'),
        scoreCalcCalcBtn: document.getElementById('scorecalc-calc-btn'),
        scoreCalcResult: document.getElementById('scorecalc-result'),
        balloonMetricToday: document.getElementById('balloon-metric-today'),
        balloonMetricTotal: document.getElementById('balloon-metric-total'),
        balloonMetricSuccess: document.getElementById('balloon-metric-success'),
        balloonAiHeadline: document.getElementById('balloon-ai-headline'),
        balloonAiDetail: document.getElementById('balloon-ai-detail'),
        balloonAiMeta: document.getElementById('balloon-ai-meta'),
        subjectSelect: document.getElementById('subject-select'),
        subjectInput: document.getElementById('subject-input'),
        subjectAddBtn: document.getElementById('subject-add-btn'),
        quickSubjects: document.getElementById('quick-subjects'),
        studyPlanForm: document.getElementById('study-plan-form'),
        studyPlanSubject: document.getElementById('study-plan-subject'),
        studyPlanTopic: document.getElementById('study-plan-topic'),
        studyPlanDuration: document.getElementById('study-plan-duration'),
        studyPlanNote: document.getElementById('study-plan-note'),
        studyPlanList: document.getElementById('study-plan-list'),
        planSubjectSelect: document.getElementById('plan-subject-select'),
        planDate: document.getElementById('plan-date'),
        planStartTime: document.getElementById('plan-start-time'),
        planEndTime: document.getElementById('plan-end-time'),
        planNote: document.getElementById('plan-note'),
        planForm: document.getElementById('calendar-plan-form'),
        weekPrevBtn: document.getElementById('week-prev-btn'),
        weekNextBtn: document.getElementById('week-next-btn'),
        weekLabel: document.getElementById('week-label'),
        calendarTimeline: document.getElementById('calendar-timeline'),
        setupArea:   document.getElementById('setup-area'),
        inputHr:     document.getElementById('input-hr'),
        inputMin:    document.getElementById('input-min'),
        modeTimer:   document.getElementById('mode-timer'),
        modeStopwatch: document.getElementById('mode-stopwatch'),
        displayTime: document.getElementById('display-time'),
        displayMs:   document.getElementById('ms'),
        enterBtn:    document.getElementById('enter-btn'),
        breakBtn:    document.getElementById('break-btn'),
        resetBtn:    document.getElementById('reset-btn'),
        overlay:     document.getElementById('overlay'),
        resTitle:    document.getElementById('res-title'),
        resLoot:     document.getElementById('res-loot'),
        proofSection: document.getElementById('study-proof-section'),
        proofFileInput: document.getElementById('study-proof-file'),
        proofUploadBtn: document.getElementById('study-proof-upload-btn'),
        proofStatus: document.getElementById('study-proof-status'),
        bottomInfo:  document.querySelector('.footer-info .system-msg')
    },

    async init() {
        const userData = await StorageManager.load();
        if (!userData) return;
        this.currentUser = userData;

        this.updateAssets(userData);
        if (this.elements.bottomInfo) {
            this.elements.bottomInfo.textContent = '';
            this.elements.bottomInfo.style.display = 'none';
        }

        this.ensureUndoSnackbar();
        this.setTodayDefaults();
        this.loadRankInfo();
        this.bindEvents();
        this.syncInputToDisplay();
        await this.loadSubjects();
        this.renderStudyPlanDrafts();
        await this.loadWeekCalendar(0);
        await this.loadUniversityCalculator(userData?.university);
        await this.loadBalloonMetrics();

        if (typeof CamManager !== 'undefined') CamManager.loadSettings();
        if (typeof applyStudyPowerSaveMode === 'function') applyStudyPowerSaveMode(false);
        console.log('P.A.T.H: UI 초기화 완료');
    },

    setTodayDefaults() {
        const today = new Date().toISOString().slice(0, 10);
        if (this.elements.planDate) this.elements.planDate.value = today;
        if (this.elements.planStartTime) this.elements.planStartTime.value = '09:00';
        if (this.elements.planEndTime) this.elements.planEndTime.value = '11:00';
    },

    async loadRankInfo() {
        try {
            const r = await fetch('/api/ranking/me', { credentials: 'include' });
            if (r.ok) {
                const data = await r.json();
                this.rankingInfo = data;
                const totalHr = Math.floor((data.total_sec || 0) / 3600);
                const totalMin = Math.floor(((data.total_sec || 0) % 3600) / 60);
                if (this.elements.rankPct) this.elements.rankPct.textContent = data.pct + '%';
                if (this.elements.tierTag) {
                    this.elements.tierTag.textContent = `${totalHr}h ${totalMin}m / TOP ${data.pct}%`;
                }
                return data;
            }
        } catch (e) {}
        return this.rankingInfo;
    },

    bindEvents() {
        const syncAction = () => this.syncInputToDisplay();
        this.elements.inputHr.oninput  = syncAction;
        this.elements.inputMin.oninput = syncAction;

        this.elements.tabStudyBtn.onclick = () => this.switchTab('study');
        this.elements.tabCalendarBtn.onclick = () => this.switchTab('calendar');
        this.elements.tabScoreCalcBtn.onclick = () => this.switchTab('scorecalc');
        this.elements.tabBalloonBtn.onclick = () => this.switchTab('balloon');
        document.getElementById('tab-rooms-btn')?.addEventListener('click', () => this.switchTab('rooms'));

        this.elements.scoreCalcUniversity?.addEventListener('change', () => {
            this.handleScoreCalcUniversityChange().catch(() => {});
        });
        this.elements.scoreCalcTrack?.addEventListener('change', () => this.renderScoreCalcFormulaHint());
        this.elements.scoreCalcCategory?.addEventListener('change', () => this.renderScoreCalcFormulaHint());
        this.elements.scoreCalcCalcBtn?.addEventListener('click', () => this.calculateUniversityScore());

        this.elements.modeTimer.onclick = () => this.setMode('timer');
        this.elements.modeStopwatch.onclick = () => this.setMode('stopwatch');

        this.elements.subjectAddBtn.onclick = () => this.toggleSubjectAddRow();
        this.elements.subjectInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleAddSubject();
            }
        });

        document.getElementById('time-presets')?.addEventListener('click', (e) => {
            const btn = e.target.closest('.time-preset-btn');
            if (!btn) return;
            const hr = parseInt(btn.dataset.hr, 10) || 0;
            const min = parseInt(btn.dataset.min, 10) || 0;
            this.elements.inputHr.value = String(hr).padStart(2, '0');
            this.elements.inputMin.value = String(min).padStart(2, '0');
            this.syncInputToDisplay();
            document.querySelectorAll('.time-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });

        [this.elements.inputHr, this.elements.inputMin].forEach(el => {
            el?.addEventListener('input', () => {
                document.querySelectorAll('.time-preset-btn').forEach(b => b.classList.remove('active'));
            });
        });

        document.getElementById('plan-toggle-btn')?.addEventListener('click', () => {
            const section = document.getElementById('plan-section');
            const btn = document.getElementById('plan-toggle-btn');
            const arrow = document.getElementById('plan-toggle-arrow');
            const isOpen = !section.classList.contains('hidden');
            section.classList.toggle('hidden', isOpen);
            btn.classList.toggle('open', !isOpen);
            if (arrow) arrow.textContent = isOpen ? '▾' : '▴';
        });
        this.elements.subjectSelect?.addEventListener('change', () => this.renderQuickSubjects());
        this.elements.quickSubjects?.addEventListener('click', (e) => this.handleQuickSubjectClick(e));
        this.elements.studyPlanForm?.addEventListener('submit', (e) => this.handleStudyPlanSubmit(e));
        this.elements.studyPlanList?.addEventListener('click', (e) => this.handleStudyPlanDraftDelete(e));

        this.elements.weekPrevBtn.onclick = () => this.loadWeekCalendar(this.weekOffset - 1);
        this.elements.weekNextBtn.onclick = () => this.loadWeekCalendar(this.weekOffset + 1);
        this.elements.planForm.onsubmit = (e) => this.handlePlanSubmit(e);
        this.elements.calendarTimeline.addEventListener('click', (e) => this.handlePlanDelete(e));
        this.elements.calendarTimeline.addEventListener('pointerdown', (e) => this.handlePlanPointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePlanPointerMove(e));
        window.addEventListener('pointerup', () => this.handlePlanPointerUp());
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.undo-btn')) {
                this.handleUndoClick();
            }
        });

        this.elements.enterBtn.onclick = async () => {
            let { hr, min } = this.getSanitizedTimerInput();
            if (this.currentMode === 'timer' && hr === 0 && min === 0) {
                hr = 1; min = 20;
                this.elements.inputHr.value = '01';
                this.elements.inputMin.value = '20';
                this.syncInputToDisplay();
            }
            const subjectId = parseInt(this.elements.subjectSelect.value, 10) || 0;

            if (!subjectId) {
                alert('공부 시작 전 과목을 선택하거나 추가하세요.');
                return;
            }

            // 즉시 UI 전환 (낙관적 업데이트)
            this.elements.body.classList.add('active');
            if (typeof applyStudyPowerSaveMode === 'function') applyStudyPowerSaveMode(true);
            this.elements.enterBtn.style.display = 'none';
            this.elements.breakBtn.classList.remove('hidden');
            this.elements.breakBtn.style.display = 'inline-block';
            this.elements.breakBtn.textContent = this.currentMode === 'stopwatch' ? '학습 완료하기' : '중단하기';

            // 플래너 저장은 백그라운드 (타이머 시작 블로킹 안 함)
            this.persistStudyPlanDrafts().catch(e => {
                console.warn('플래너 저장 실패 (무시):', e);
            });

            try {
                await TimerEngine.start(hr, min, subjectId);
                // Notify group room about timer start
                if (typeof GroupRooms !== 'undefined') {
                    const subjectName = this.elements.subjectSelect?.options[this.elements.subjectSelect.selectedIndex]?.text || '공부';
                    GroupRooms.notifyTimerStart(subjectName);
                }
            } catch (e) {
                // 서버 실패 시 UI 롤백
                this.elements.body.classList.remove('active');
                if (typeof applyStudyPowerSaveMode === 'function') {
                    applyStudyPowerSaveMode(false);
                } else {
                    this.elements.body.classList.remove('low-power-active');
                }
                this.elements.enterBtn.style.display = '';
                this.elements.breakBtn.classList.add('hidden');
                this.elements.breakBtn.style.display = 'none';
                alert(e.message || '공부 시작에 실패했습니다.');
            }
        };

        this.elements.breakBtn.onclick = () => {
            if (this.currentMode === 'stopwatch') {
                TimerEngine.completeStopwatch();
            } else {
                TimerEngine.interrupt();
            }
        };

        this.elements.proofFileInput?.addEventListener('change', () => this.handleStudyProofSelection());
        this.elements.proofUploadBtn?.addEventListener('click', () => this.uploadStudyProof());
        this.elements.resetBtn.onclick = () => location.reload();
    },

    handleStudyProofSelection() {
        const selectedCount = this.elements.proofFileInput?.files?.length || 0;
        const hasFile = selectedCount > 0;
        if (this.elements.proofUploadBtn) this.elements.proofUploadBtn.disabled = !hasFile;
        if (this.elements.proofStatus && hasFile) {
            this.elements.proofStatus.textContent = `${selectedCount}장 업로드 준비 완료`;
            this.elements.proofStatus.className = 'study-proof-status';
        }
    },

    async uploadStudyProof() {
        const recordId = this.lastStudyRecordId;
        const files = Array.from(this.elements.proofFileInput?.files || []);

        if (!recordId) {
            alert('인증 가능한 공부 기록이 없습니다.');
            return;
        }
        if (files.length === 0) {
            alert('사진을 1장 이상 선택해주세요.');
            return;
        }

        try {
            this.elements.proofUploadBtn.disabled = true;
            this.elements.proofStatus.textContent = '업로드 중...';
            this.elements.proofStatus.className = 'study-proof-status';

            const data = await StorageManager.uploadStudyProof(recordId, files);
            if (data.user) this.updateAssets(data.user);

            const uploadedCount = data.uploadedCount || files.length;
            const bonusGold = data.bonusGold || 0;
            this.elements.proofStatus.textContent = bonusGold > 0
                ? `${uploadedCount}장 업로드 완료! +${bonusGold.toLocaleString()}G 지급`
                : `${uploadedCount}장 업로드 완료! (추가 골드는 이미 지급됨)`;
            this.elements.proofStatus.className = 'study-proof-status done';
            this.elements.proofUploadBtn.disabled = true;
            this.elements.proofFileInput.value = '';
        } catch (e) {
            this.elements.proofStatus.textContent = e.message || '업로드 실패';
            this.elements.proofStatus.className = 'study-proof-status error';
            this.elements.proofUploadBtn.disabled = false;
        }
    },

    switchTab(tab) {
        const validTabs = ['calendar', 'balloon', 'scorecalc', 'rooms'];
        const nextTab = validTabs.includes(tab) ? tab : 'study';
        this.currentTab = nextTab;
        const isCalendar = this.currentTab === 'calendar';
        const isRooms = this.currentTab === 'rooms';

        this.elements.tabStudyBtn.classList.toggle('active', this.currentTab === 'study');
        this.elements.tabCalendarBtn.classList.toggle('active', this.currentTab === 'calendar');
        this.elements.tabScoreCalcBtn.classList.toggle('active', this.currentTab === 'scorecalc');
        this.elements.tabBalloonBtn.classList.toggle('active', this.currentTab === 'balloon');
        document.getElementById('tab-rooms-btn')?.classList.toggle('active', isRooms);

        this.elements.tabStudy.classList.toggle('active', this.currentTab === 'study');
        this.elements.tabCalendar.classList.toggle('active', this.currentTab === 'calendar');
        this.elements.tabScoreCalc.classList.toggle('active', this.currentTab === 'scorecalc');
        this.elements.tabBalloon.classList.toggle('active', this.currentTab === 'balloon');
        document.getElementById('tab-rooms')?.classList.toggle('active', isRooms);

        this.elements.body.classList.remove('active');
        this.elements.body.classList.toggle('tab-calendar-active', isCalendar);

        if (isCalendar) {
            this.loadWeekCalendar(this.weekOffset).catch(() => {});
            return;
        }
        if (this.currentTab === 'scorecalc') {
            if (!this.scoreCalcUniversityInfo && this.elements.scoreCalcUniversity?.value) {
                this.handleScoreCalcUniversityChange().catch(() => {});
            }
            return;
        }
        if (this.currentTab === 'balloon') {
            this.loadBalloonMetrics().catch(() => {});
        }
        if (isRooms) {
            if (typeof GroupRooms !== 'undefined') GroupRooms.loadMyRooms().catch(() => {});
        }
    },

    async loadUniversityCalculator(preferredUniversity) {
        if (!this.elements.scoreCalcUniversity || !this.elements.scoreCalcTrack) return;

        try {
            this.universityList = await StorageManager.fetchUniversityList();
        } catch (e) {
            this.elements.scoreCalcResult.textContent = e.message || '대학 목록을 불러오지 못했습니다.';
            return;
        }

        if (!this.universityList.length) {
            this.elements.scoreCalcResult.textContent = '등록된 대학 데이터가 없습니다.';
            return;
        }

        this.elements.scoreCalcUniversity.innerHTML = [
            '<option value="">대학을 선택하세요</option>',
            ...this.universityList.map((u) => `<option value="${this.escapeHtml(u.name)}">${this.escapeHtml(u.name)}</option>`)
        ].join('');

        const preferred = String(preferredUniversity || '').trim();
        const found = this.universityList.find((u) => u.name === preferred);
        const firstName = this.universityList[0]?.name || '';
        this.elements.scoreCalcUniversity.value = found ? found.name : firstName;
        await this.handleScoreCalcUniversityChange();
    },

    async handleScoreCalcUniversityChange() {
        const name = String(this.elements.scoreCalcUniversity?.value || '').trim();
        if (!name) return;

        this.elements.scoreCalcResult.textContent = '대학 반영비율을 불러오는 중...';
        this.scoreCalcUniversityInfo = await StorageManager.fetchUniversityInfo(name);

        const formula = this.scoreCalcUniversityInfo?.scoreFormula;
        if (!formula || Object.keys(formula).length === 0) {
            this.elements.scoreCalcTrack.innerHTML = '<option value="">지원되지 않음</option>';
            this.elements.scoreCalcResult.textContent = '이 대학은 환산식 데이터가 아직 없습니다.';
            return;
        }

        this.populateScoreCalcCategories();

        const tracks = Object.keys(formula);
        this.elements.scoreCalcTrack.innerHTML = tracks
            .map((track, idx) => `<option value="${this.escapeHtml(track)}"${idx === 0 ? ' selected' : ''}>${this.escapeHtml(track)}</option>`)
            .join('');

        this.renderScoreCalcFormulaHint();
    },

    renderScoreCalcFormulaHint() {
        const track = String(this.elements.scoreCalcTrack?.value || '').trim();
        const category = String(this.elements.scoreCalcCategory?.value || '').trim();
        const formula = this.scoreCalcUniversityInfo?.scoreFormula?.[track];
        if (!formula || !this.elements.scoreCalcResult) return;
        const note = formula.비고 ? ` (${formula.비고})` : '';
        const catText = category ? ` / 카테고리: ${category}` : ' / 카테고리: 전체';
        this.elements.scoreCalcResult.textContent = `${this.scoreCalcUniversityInfo.name} ${track} 환산식 기준으로 계산할 준비가 되었습니다${catText}${note}`;
    },

    populateScoreCalcCategories() {
        const select = this.elements.scoreCalcCategory;
        if (!select) return;

        const categories = [...new Set((this.scoreCalcUniversityInfo?.departments || [])
            .map((d) => String(d?.category || '').trim())
            .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));

        select.innerHTML = [
            '<option value="">전체</option>',
            ...categories.map((c) => `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`)
        ].join('');
    },

    parseNumericInput(element, min, max) {
        const raw = element?.value;
        if (raw == null || String(raw).trim() === '') return null;
        const value = Number(raw);
        if (!Number.isFinite(value)) return null;
        if (value < min || value > max) return null;
        return value;
    },

    calculateUniversityScore() {
        const uni = this.scoreCalcUniversityInfo;
        const track = String(this.elements.scoreCalcTrack?.value || '').trim();
        const formula = uni?.scoreFormula?.[track];
        if (!uni || !formula) {
            this.elements.scoreCalcResult.textContent = '대학/계열 정보를 먼저 선택해주세요.';
            return;
        }

        const scores = {
            국어: this.parseNumericInput(this.elements.scoreCalcKorean, 0, 200),
            수학: this.parseNumericInput(this.elements.scoreCalcMath, 0, 200),
            탐구1: this.parseNumericInput(this.elements.scoreCalcInquiry1, 0, 100),
            탐구2: this.parseNumericInput(this.elements.scoreCalcInquiry2, 0, 100),
            영어: this.parseNumericInput(this.elements.scoreCalcEnglishGrade, 1, 9),
            한국사: this.parseNumericInput(this.elements.scoreCalcHistoryGrade, 1, 9),
            수학선택: this.elements.scoreCalcMathChoice?.value || '',
            탐구유형: this.elements.scoreCalcInquiryType?.value || ''
        };

        const total = this.computeConvertedScore(formula, scores);
        if (total == null) {
            this.elements.scoreCalcResult.textContent = '입력값을 다시 확인해주세요. (필수 영역 점수 누락 또는 범위 오류)';
            return;
        }

        const resultDetails = this.buildScoreComparisonHtml(uni, total);
        this.elements.scoreCalcResult.innerHTML = `
            <div class="scorecalc-summary">
                <strong>${this.escapeHtml(uni.name)} ${this.escapeHtml(track)} 환산점수: ${total.toFixed(2)}</strong>
                <span>총점 기준: ${this.escapeHtml(String(formula.총점 || '-'))}</span>
            </div>
            ${resultDetails}
        `;
    },

    computeConvertedScore(formula, scores) {
        if (!formula) return null;

        let total = 0;
        if (formula.국어 && scores.국어 != null) total += (scores.국어 / 200) * formula.국어;
        if (formula.수학 && scores.수학 != null) total += (scores.수학 / 200) * formula.수학;

        if (formula.탐구) {
            if (scores.탐구1 == null) return null;
            const t1 = scores.탐구1 || 0;
            const t2 = scores.탐구2 || 0;
            total += ((t1 + t2) / 200) * formula.탐구;
        }

        if (formula.영어 != null) {
            if (scores.영어 == null) return null;
            const g = Math.max(1, Math.min(9, Math.floor(scores.영어)));
            total += this.resolveGradeScore(formula.영어, g, this.defaultEngGradeRatio);
        }

        if (formula.한국사 != null) {
            if (scores.한국사 == null) return null;
            const g = Math.max(1, Math.min(9, Math.floor(scores.한국사)));
            total += this.resolveGradeScore(formula.한국사, g, this.defaultHistGradeRatio);
        }

        if (formula.수학가산 && scores.수학선택 === '미적분/기하') {
            total += formula.수학가산;
        }
        if (formula.과탐가산 && scores.탐구유형 === '과탐') {
            total += formula.과탐가산;
        }

        return Math.round(total * 100) / 100;
    },

    resolveGradeScore(rule, grade, fallbackRatios) {
        if (Array.isArray(rule) && rule.length > 0) {
            return Number(rule[grade - 1] || 0);
        }
        if (Number.isFinite(Number(rule))) {
            const max = Number(rule);
            const ratio = fallbackRatios[grade - 1] ?? 0;
            return Math.round(max * ratio * 100) / 100;
        }
        return 0;
    },

    buildScoreComparisonHtml(universityInfo, total) {
        const selectedCategory = String(this.elements.scoreCalcCategory?.value || '').trim();
        const rows = (universityInfo?.departments || [])
            .map((dept) => {
                if (selectedCategory && dept?.category !== selectedCategory) return null;
                const cut = Number(dept?.admissions?.정시?.환산컷);
                if (!Number.isFinite(cut)) return null;
                const gap = Math.round((total - cut) * 100) / 100;
                return {
                    name: dept.name,
                    category: dept.category,
                    cut,
                    gap,
                    absGap: Math.abs(gap)
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.absGap - b.absGap)
            .slice(0, 5);

        if (rows.length === 0) {
            return selectedCategory
                ? `<div class="scorecalc-meta">${this.escapeHtml(selectedCategory)} 카테고리에는 환산컷 비교 가능한 학과가 없습니다.</div>`
                : '<div class="scorecalc-meta">학과별 환산컷 데이터가 없어 비교 결과를 표시할 수 없습니다.</div>';
        }

        const listHtml = rows.map((row) => {
            const state = row.gap >= 0 ? '여유' : '부족';
            const cls = row.gap >= 0 ? 'pos' : 'neg';
            const gapText = `${row.gap >= 0 ? '+' : ''}${row.gap.toFixed(2)}`;
            return `<li>
                <span>${this.escapeHtml(row.name)} (${this.escapeHtml(row.category || '기타')})</span>
                <span>컷 ${row.cut.toFixed(2)} / <b class="${cls}">${gapText} ${state}</b></span>
            </li>`;
        }).join('');

        return `
            <div class="scorecalc-meta">${selectedCategory ? `${this.escapeHtml(selectedCategory)} 카테고리 ` : ''}가장 근접한 학과 5개 기준 비교</div>
            <ul class="scorecalc-compare-list">${listHtml}</ul>
        `;
    },

    async loadBalloonMetrics() {
        const [stats, rankInfo] = await Promise.all([
            StorageManager.fetchStudyStats(),
            this.rankingInfo ? Promise.resolve(this.rankingInfo) : this.loadRankInfo()
        ]);
        const todaySec = parseInt(stats?.today_sec, 10) || 0;
        const totalSec = parseInt(stats?.total_sec, 10) || 0;
        const successSec = parseInt(stats?.success_sec, 10) || 0;

        if (this.elements.balloonMetricToday) {
            this.elements.balloonMetricToday.textContent = this.formatDuration(todaySec);
        }
        if (this.elements.balloonMetricTotal) {
            this.elements.balloonMetricTotal.textContent = this.formatDuration(totalSec);
        }
        if (this.elements.balloonMetricSuccess) {
            this.elements.balloonMetricSuccess.textContent = this.formatDuration(successSec);
        }

        this.renderBalloonAiReport({
            stats,
            rankInfo,
            user: stats?.user || this.currentUser
        });
    },

    renderBalloonAiReport({ stats, rankInfo, user }) {
        if (!this.elements.balloonAiHeadline || !this.elements.balloonAiDetail || !this.elements.balloonAiMeta) {
            return;
        }

        const rankingPct = parseFloat(rankInfo?.pct);
        const studyTopPct = Number.isFinite(rankingPct) ? Math.max(0, Math.min(100, rankingPct)) : null;
        const userPercentile = studyTopPct === null ? null : 100 - studyTopPct;
        const todaySec = parseInt(stats?.today_sec, 10) || 0;
        const totalSec = parseInt(stats?.total_sec, 10) || 0;
        const successSec = parseInt(stats?.success_sec, 10) || 0;

        const targetUni = this.pickTargetUniversity(userPercentile, user?.university);
        const uniName = targetUni?.name || (String(user?.university || '').trim() || '목표 대학');
        const targetBase = Number.isFinite(Number(targetUni?.basePercentile))
            ? Number(targetUni.basePercentile)
            : 85;

        const estimatedNow = this.estimateAcceptanceChance(userPercentile, targetBase, totalSec, successSec);
        const predictedLift = this.estimateTrendLift(userPercentile, targetBase, todaySec, totalSec, successSec);
        const projected = Math.min(95, estimatedNow + predictedLift);

        const successRate = totalSec > 0 ? Math.round((successSec / totalSec) * 100) : 0;
        const nowText = studyTopPct === null ? '집계 대기' : `상위 ${studyTopPct.toFixed(2)}%`;

        this.elements.balloonAiHeadline.textContent = `이 추세라면 ${uniName} 합격 확률 ${predictedLift}% 상승 예상`;
        this.elements.balloonAiDetail.textContent = `현재 학습 백분위 ${nowText}, 오늘 집중 ${this.formatDuration(todaySec)} 기준으로 ${estimatedNow}% -> ${projected}%를 기대할 수 있어요. 성공 세션 비율 ${successRate}%를 유지하면 상승폭이 더 커집니다.`;
        this.elements.balloonAiMeta.textContent = `기준: 누적 ${this.formatDuration(totalSec)} · 목표 기준 백분위 ${targetBase.toFixed(1)} · 학습 패턴 기반 추정`;
    },

    pickTargetUniversity(userPercentile, preferredUniversity) {
        const preferred = String(preferredUniversity || '').trim();
        if (preferred && Array.isArray(this.universityList) && this.universityList.length > 0) {
            const exact = this.universityList.find((u) => String(u?.name || '').trim() === preferred);
            if (exact) return exact;
        }

        if (!Array.isArray(this.universityList) || this.universityList.length === 0 || userPercentile == null) {
            return null;
        }

        const sorted = [...this.universityList]
            .filter((u) => Number.isFinite(Number(u?.basePercentile)))
            .sort((a, b) => Math.abs(Number(a.basePercentile) - userPercentile) - Math.abs(Number(b.basePercentile) - userPercentile));
        return sorted[0] || null;
    },

    estimateAcceptanceChance(userPercentile, targetBasePercentile, totalSec, successSec) {
        const userPct = Number.isFinite(userPercentile) ? userPercentile : 50;
        const targetPct = Number.isFinite(targetBasePercentile) ? targetBasePercentile : 85;
        const percentileGap = userPct - targetPct;
        const successRate = totalSec > 0 ? (successSec / totalSec) : 0.55;
        const totalHours = totalSec / 3600;

        let chance = 45 + (percentileGap * 2.4);
        chance += Math.min(12, totalHours * 0.25);
        chance += (successRate - 0.5) * 20;

        return Math.max(5, Math.min(90, Math.round(chance)));
    },

    estimateTrendLift(userPercentile, targetBasePercentile, todaySec, totalSec, successSec) {
        const todayHours = todaySec / 3600;
        const totalHours = totalSec / 3600;
        const successRate = totalSec > 0 ? (successSec / totalSec) : 0.55;
        const userPct = Number.isFinite(userPercentile) ? userPercentile : 50;
        const targetPct = Number.isFinite(targetBasePercentile) ? targetBasePercentile : 85;
        const gap = targetPct - userPct;

        let lift = 6;
        lift += Math.min(7, todayHours * 2.1);
        lift += Math.min(4, totalHours / 40);
        lift += (successRate - 0.5) * 18;

        if (gap > 0) {
            lift += Math.min(3, gap / 4);
        } else {
            lift -= Math.min(2, Math.abs(gap) / 10);
        }

        return Math.max(4, Math.min(20, Math.round(lift)));
    },

    toggleSubjectAddRow() {
        const row = document.getElementById('subject-add-row');
        if (!row) return;
        const isHidden = row.classList.contains('hidden');
        row.classList.toggle('hidden', !isHidden);
        if (!isHidden) return;
        this.elements.subjectInput?.focus();
        this.elements.subjectAddBtn.textContent = '확인';
    },

    async handleAddSubject() {
        const name = (this.elements.subjectInput.value || '').trim();
        if (!name) {
            alert('과목명을 입력하세요.');
            return;
        }
        try {
            const added = await StorageManager.addSubject(name);
            this.subjects = await StorageManager.fetchSubjects();
            this.renderSubjectOptions(added?.id);
            this.elements.subjectInput.value = '';
            const row = document.getElementById('subject-add-row');
            if (row) row.classList.add('hidden');
            this.elements.subjectAddBtn.textContent = '+ 과목';
            if (this.currentTab === 'calendar') await this.loadWeekCalendar(this.weekOffset);
        } catch (e) {
            alert(e.message || '과목 추가 실패');
        }
    },

    async loadSubjects() {
        this.subjects = await StorageManager.fetchSubjects();
        if (this.subjects.length === 0) {
            this.renderSubjectOptions(null);
            return;
        }
        this.renderSubjectOptions(this.subjects[0].id);
    },

    renderSubjectOptions(selectedId) {
        const build = (placeholder) => {
            if (this.subjects.length === 0) return `<option value="">${placeholder}</option>`;
            return this.subjects.map((s) => {
                const selected = selectedId && Number(selectedId) === Number(s.id) ? ' selected' : '';
                return `<option value="${s.id}"${selected}>${this.escapeHtml(s.name)}</option>`;
            }).join('');
        };

        this.elements.subjectSelect.innerHTML = build('과목을 먼저 추가하세요');
        this.elements.planSubjectSelect.innerHTML = build('과목 필요');
        this.renderQuickSubjects();
    },

    renderQuickSubjects() {
        if (!this.elements.quickSubjects) return;
        const selectedId = parseInt(this.elements.subjectSelect?.value, 10) || 0;
        const selected = this.subjects.find((s) => Number(s.id) === selectedId);
        const selectedName = selected ? this.normalizeSubjectName(selected.name) : '';
        this.elements.quickSubjects.innerHTML = this.quickSubjectNames.map((name) => {
            const isActive = selectedName === this.normalizeSubjectName(name);
            return `<button type="button" class="quick-subject-btn${isActive ? ' active' : ''}" data-subject-name="${this.escapeHtml(name)}">${this.escapeHtml(name)}</button>`;
        }).join('');
    },

    normalizeSubjectName(name) {
        return String(name || '').trim().toLowerCase();
    },

    async ensureSubjectByName(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return null;

        const normalized = this.normalizeSubjectName(trimmed);
        const found = this.subjects.find((s) => this.normalizeSubjectName(s.name) === normalized);
        if (found) return found;

        const added = await StorageManager.addSubject(trimmed);
        this.subjects = await StorageManager.fetchSubjects();
        this.renderSubjectOptions(added?.id);
        return this.subjects.find((s) => Number(s.id) === Number(added?.id)) || added;
    },

    selectSubjectById(subjectId) {
        if (!subjectId) return;
        this.elements.subjectSelect.value = String(subjectId);
        this.elements.planSubjectSelect.value = String(subjectId);
        this.renderQuickSubjects();
    },

    async handleQuickSubjectClick(event) {
        const btn = event.target.closest('.quick-subject-btn[data-subject-name]');
        if (!btn) return;
        const name = btn.getAttribute('data-subject-name') || '';
        if (!name.trim()) return;

        try {
            const subject = await this.ensureSubjectByName(name);
            this.selectSubjectById(subject?.id);
            if (this.elements.subjectInput) this.elements.subjectInput.value = '';
            if (this.elements.studyPlanSubject && !this.elements.studyPlanSubject.value.trim()) {
                this.elements.studyPlanSubject.value = subject?.name || name;
            }
        } catch (e) {
            alert(e.message || '과목 선택 실패');
        }
    },

    getDefaultPlanDuration() {
        if (this.currentMode === 'timer') {
            const hr = parseInt(this.elements.inputHr.value, 10) || 0;
            const min = parseInt(this.elements.inputMin.value, 10) || 0;
            const total = hr * 60 + min;
            if (total >= 5) return total;
        }
        return 50;
    },

    async handleStudyPlanSubmit(event) {
        event.preventDefault();
        const topic = (this.elements.studyPlanTopic?.value || '').trim();
        if (!topic) {
            alert('세부 계획을 입력하세요.');
            return;
        }

        const typedSubject = (this.elements.studyPlanSubject?.value || '').trim();
        const selectedId = parseInt(this.elements.subjectSelect?.value, 10) || 0;
        const selectedSubject = this.subjects.find((s) => Number(s.id) === selectedId);
        const baseSubjectName = typedSubject || selectedSubject?.name || '';

        if (!baseSubjectName) {
            alert('과목을 입력하거나 빠른 과목 버튼을 선택하세요.');
            return;
        }

        try {
            const subject = await this.ensureSubjectByName(baseSubjectName);
            const durationVal = parseInt(this.elements.studyPlanDuration?.value, 10);
            const durationMin = Number.isFinite(durationVal) && durationVal > 0
                ? Math.max(5, Math.min(300, durationVal))
                : this.getDefaultPlanDuration();

            this.studyPlanDrafts.push({
                id: this.draftSeq++,
                subjectId: Number(subject.id),
                subjectName: subject.name,
                topic,
                durationMin,
                note: (this.elements.studyPlanNote?.value || '').trim()
            });

            this.selectSubjectById(subject.id);
            if (this.elements.studyPlanSubject) this.elements.studyPlanSubject.value = subject.name;
            if (this.elements.studyPlanTopic) this.elements.studyPlanTopic.value = '';
            if (this.elements.studyPlanDuration) this.elements.studyPlanDuration.value = '';
            if (this.elements.studyPlanNote) this.elements.studyPlanNote.value = '';

            this.renderStudyPlanDrafts();
        } catch (e) {
            alert(e.message || '플래너 항목 추가 실패');
        }
    },

    renderStudyPlanDrafts() {
        if (!this.elements.studyPlanList) return;
        if (!Array.isArray(this.studyPlanDrafts) || this.studyPlanDrafts.length === 0) {
            this.elements.studyPlanList.innerHTML = `<div class="study-plan-empty">플래너 항목이 없습니다. 세부 계획을 추가해 주세요.</div>`;
            return;
        }

        this.elements.studyPlanList.innerHTML = this.studyPlanDrafts.map((item, idx) => {
            const notePart = item.note ? ` · ${this.escapeHtml(item.note)}` : '';
            return `<div class="study-plan-item" data-draft-id="${item.id}">
                <span class="study-plan-order">${idx + 1}</span>
                <div class="study-plan-content">
                    <div class="study-plan-title">${this.escapeHtml(item.subjectName)} · ${this.escapeHtml(item.topic)}</div>
                    <div class="study-plan-meta">예상 ${item.durationMin}분${notePart}</div>
                </div>
                <button type="button" class="study-plan-delete" data-draft-id="${item.id}">삭제</button>
            </div>`;
        }).join('');
    },

    handleStudyPlanDraftDelete(event) {
        const btn = event.target.closest('.study-plan-delete[data-draft-id]');
        if (!btn) return;
        const draftId = parseInt(btn.getAttribute('data-draft-id'), 10) || 0;
        if (!draftId) return;
        this.studyPlanDrafts = this.studyPlanDrafts.filter((d) => Number(d.id) !== Number(draftId));
        this.renderStudyPlanDrafts();
    },

    async persistStudyPlanDrafts() {
        if (!Array.isArray(this.studyPlanDrafts) || this.studyPlanDrafts.length === 0) return 0;

        const now = new Date();
        const snap = this.timetableConfig.snapMinute;
        const today = this.toLocalYmd(now);
        const dayStart = this.timetableConfig.dayStartMinute;
        const dayEnd = this.timetableConfig.dayEndMinute;
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        let cursor = Math.ceil(nowMinute / snap) * snap;
        cursor = Math.max(dayStart, Math.min(cursor, dayEnd - snap));

        let createdCount = 0;

        for (const draft of this.studyPlanDrafts) {
            if (cursor >= dayEnd) break;
            const duration = Math.max(snap, Math.min(300, parseInt(draft.durationMin, 10) || this.getDefaultPlanDuration()));
            const startMinute = Math.max(dayStart, Math.min(cursor, dayEnd - snap));
            const endMinute = Math.max(startMinute + snap, Math.min(dayEnd, startMinute + duration));
            const note = draft.note ? `${draft.topic} | ${draft.note}` : draft.topic;

            await StorageManager.addPlan({
                subject_id: draft.subjectId,
                plan_date: today,
                start_time: this.minuteToTime(startMinute),
                end_time: this.minuteToTime(endMinute),
                note
            });

            cursor = endMinute;
            createdCount += 1;
        }

        this.studyPlanDrafts = [];
        this.renderStudyPlanDrafts();
        if (this.currentTab === 'calendar') await this.loadWeekCalendar(this.weekOffset);
        return createdCount;
    },

    async loadWeekCalendar(offset) {
        this.weekOffset = offset;
        try {
            this.weekData = await StorageManager.fetchWeekCalendar(this.weekOffset);
            if (Array.isArray(this.weekData.subjects)) {
                this.subjects = this.weekData.subjects;
                this.renderSubjectOptions(this.elements.subjectSelect.value || this.subjects[0]?.id);
            }
            this.renderWeekLabel();
            this.renderCalendarTimeline();
        } catch (e) {
            console.error(e);
            if (this.elements.weekLabel) this.elements.weekLabel.textContent = '캘린더 로드 실패';
        }
    },

    renderWeekLabel() {
        if (!this.weekData?.week || !this.elements.weekLabel) return;
        const start = this.weekData.week.start_date;
        const end = this.weekData.week.end_date;
        const offsetText = this.weekOffset === 0
            ? '이번 주'
            : `${this.weekOffset > 0 ? '+' : ''}${this.weekOffset}주`;
        this.elements.weekLabel.textContent = `${start} ~ ${end} (${offsetText})`;
    },

    renderCalendarTimeline() {
        if (!this.elements.calendarTimeline || !this.weekData?.week) return;

        const dayStartMinute = this.timetableConfig.dayStartMinute;
        const dayEndMinute = this.timetableConfig.dayEndMinute;
        const hourHeight = this.timetableConfig.hourHeight;
        const totalMinutes = dayEndMinute - dayStartMinute;
        const timelineHeight = Math.floor((totalMinutes / 60) * hourHeight);

        const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
        const start = this.parseLocalDate(this.weekData.week.start_date);
        const now = new Date();
        const todayKey = this.toLocalYmd(now);
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        const plansByDate = new Map();
        const recordsByDate = new Map();

        for (const plan of (this.weekData.plans || [])) {
            const key = this.normalizeDateKey(plan.plan_date);
            if (!key) continue;
            if (!plansByDate.has(key)) plansByDate.set(key, []);
            plansByDate.get(key).push(plan);
        }
        for (const rec of (this.weekData.records || [])) {
            const key = this.normalizeDateKey(rec.record_date || rec.created_at);
            if (!key) continue;
            if (!recordsByDate.has(key)) recordsByDate.set(key, []);
            recordsByDate.get(key).push(rec);
        }

        const timeAxis = [];
        for (let hour = dayStartMinute / 60; hour <= dayEndMinute / 60; hour++) {
            const top = (hour - dayStartMinute / 60) * hourHeight;
            const label = `${String(hour).padStart(2, '0')}:00`;
            timeAxis.push(`<div class="tt-time-label" style="top:${top}px">${label}</div>`);
        }

        const headCols = [];
        const dayCols = [];
        const usedSubjects = new Map();

        for (let i = 0; i < 7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const key = this.toLocalYmd(d);
            const plans = plansByDate.get(key) || [];
            const records = recordsByDate.get(key) || [];
            const totalRecordSec = records.reduce((acc, r) => acc + (parseInt(r.duration_sec, 10) || 0), 0);
            const recordDuration = this.formatDuration(totalRecordSec);

            for (const p of plans) {
                const color = this.getSubjectColor(p.subject_id, p.subject_name);
                const legendKey = `${p.subject_id || 0}:${p.subject_name || '미지정'}`;
                if (!usedSubjects.has(legendKey)) {
                    usedSubjects.set(legendKey, { name: p.subject_name || '미지정', color });
                }
            }

            headCols.push(
                `<div class="tt-day-head">
                    <div class="tt-day-name">${dayNames[i]}</div>
                    <div class="tt-day-date">${key}</div>
                    <div class="tt-day-record">완료 ${recordDuration}</div>
                </div>`
            );

            const planItems = plans.map((p) => {
                const rawStart = parseInt(p.start_minute, 10) || 0;
                const rawEnd = parseInt(p.end_minute, 10) || 0;
                const clampedStart = Math.max(dayStartMinute, Math.min(rawStart, dayEndMinute));
                const clampedEnd = Math.max(dayStartMinute, Math.min(rawEnd, dayEndMinute));
                if (clampedEnd <= clampedStart) return '';

                const top = Math.floor(((clampedStart - dayStartMinute) / totalMinutes) * timelineHeight);
                const height = Math.max(22, Math.floor(((clampedEnd - clampedStart) / totalMinutes) * timelineHeight));
                const statusClass = p.is_completed ? 'is-completed' : 'is-planned';
                const subjectColor = this.getSubjectColor(p.subject_id, p.subject_name);
                const bg = this.hexToRgba(subjectColor, p.is_completed ? 0.18 : 0.24);
                const border = this.hexToRgba(subjectColor, 0.55);
                return `<div class="tt-event ${statusClass}" data-plan-id="${p.id}" data-plan-date="${key}" data-day-index="${i}" data-start-minute="${rawStart}" data-end-minute="${rawEnd}" style="top:${top}px;height:${height}px;--subject-color:${subjectColor};--subject-bg:${bg};--subject-border:${border}">
                    <div class="tt-event-title">${this.escapeHtml(p.subject_name || '미지정')}</div>
                    <div class="tt-event-time">${this.minuteToTime(rawStart)} - ${this.minuteToTime(rawEnd)}</div>
                    ${p.note ? `<div class="tt-event-note">${this.escapeHtml(p.note)}</div>` : ''}
                    <button class="plan-delete-btn" data-plan-id="${p.id}" type="button">삭제</button>
                    <div class="tt-resize-handle" title="길이 조절"></div>
                </div>`;
            }).join('');

            const recordChips = records.map((r) => {
                const sec = parseInt(r.duration_sec, 10) || 0;
                const subjectColor = this.getSubjectColor(r.subject_id, r.subject_name);
                const bg = this.hexToRgba(subjectColor, 0.16);
                const border = this.hexToRgba(subjectColor, 0.45);
                return `<span class="tt-record-chip" style="--chip-color:${subjectColor};--chip-bg:${bg};--chip-border:${border}">${this.escapeHtml(r.subject_name || '미지정')} · ${this.formatDuration(sec)}</span>`;
            }).join('');

            let nowLine = '';
            if (key === todayKey && nowMinute >= dayStartMinute && nowMinute <= dayEndMinute) {
                const nowTop = Math.floor(((nowMinute - dayStartMinute) / totalMinutes) * timelineHeight);
                nowLine = `<div class="tt-now-line" style="top:${nowTop}px"><span class="tt-now-label">지금</span></div>`;
            }

            dayCols.push(
                `<div class="tt-day-col" style="height:${timelineHeight}px">
                    ${planItems || ''}
                    ${nowLine}
                    ${records.length > 0 ? `<div class="tt-records-box">${recordChips}</div>` : ''}
                </div>`
            );
        }

        const legendHtml = Array.from(usedSubjects.values()).map((s) => {
            return `<span class="tt-legend-item"><i class="tt-legend-dot" style="background:${s.color}"></i>${this.escapeHtml(s.name)}</span>`;
        }).join('');

        this.elements.calendarTimeline.innerHTML = `
            <div class="week-grid-wrap">
                ${legendHtml ? `<div class="tt-legend">${legendHtml}</div>` : ''}
                <div class="week-timetable" style="--timeline-height:${timelineHeight}px">
                    <div class="tt-corner">TIME</div>
                    ${headCols.join('')}
                    <div class="tt-time-axis">${timeAxis.join('')}</div>
                    ${dayCols.join('')}
                </div>
            </div>`;
    },

    handlePlanPointerDown(event) {
        const eventBox = event.target.closest('.tt-event');
        if (!eventBox) return;
        if (event.target.closest('.plan-delete-btn')) return;

        const planId = parseInt(eventBox.dataset.planId, 10);
        if (!planId) return;

        const rawStart = parseInt(eventBox.dataset.startMinute, 10) || 0;
        const rawEnd = parseInt(eventBox.dataset.endMinute, 10) || 0;
        const duration = Math.max(5, rawEnd - rawStart);
        const dayIndex = Math.max(0, Math.min(6, parseInt(eventBox.dataset.dayIndex, 10) || 0));
        const dayCol = eventBox.closest('.tt-day-col');
        const colWidth = dayCol ? dayCol.getBoundingClientRect().width : 140;
        const dragMode = event.target.closest('.tt-resize-handle') ? 'resize' : 'move';

        this.dragState = {
            planId,
            mode: dragMode,
            eventEl: eventBox,
            startX: event.clientX,
            startY: event.clientY,
            originalStart: rawStart,
            originalEnd: rawEnd,
            duration,
            dayIndex,
            nextDayIndex: dayIndex,
            colWidth,
            planDate: eventBox.dataset.planDate,
            changed: false,
            nextStart: rawStart,
            nextEnd: rawEnd
        };

        eventBox.classList.add('is-dragging');
        eventBox.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    },

    handlePlanPointerMove(event) {
        if (!this.dragState) return;

        const minutePerPx = 60 / this.timetableConfig.hourHeight;
        const deltaMinuteRaw = (event.clientY - this.dragState.startY) * minutePerPx;
        const snap = this.timetableConfig.snapMinute;
        const deltaMinute = Math.round(deltaMinuteRaw / snap) * snap;

        let nextStart = this.dragState.nextStart;
        let nextEnd = this.dragState.nextEnd;
        let nextDayIndex = this.dragState.nextDayIndex;

        if (this.dragState.mode === 'resize') {
            const minEnd = this.dragState.originalStart + this.timetableConfig.snapMinute;
            const maxEnd = this.timetableConfig.dayEndMinute;
            nextEnd = Math.max(minEnd, Math.min(maxEnd, this.dragState.originalEnd + deltaMinute));
            nextStart = this.dragState.originalStart;
        } else {
            const minStart = this.timetableConfig.dayStartMinute;
            const maxStart = this.timetableConfig.dayEndMinute - this.dragState.duration;
            nextStart = Math.max(minStart, Math.min(maxStart, this.dragState.originalStart + deltaMinute));
            nextEnd = nextStart + this.dragState.duration;

            const deltaDayRaw = (event.clientX - this.dragState.startX) / Math.max(40, this.dragState.colWidth);
            const deltaDay = Math.round(deltaDayRaw);
            nextDayIndex = Math.max(0, Math.min(6, this.dragState.dayIndex + deltaDay));
        }

        if (nextStart === this.dragState.nextStart && nextEnd === this.dragState.nextEnd && nextDayIndex === this.dragState.nextDayIndex) return;

        this.dragState.nextStart = nextStart;
        this.dragState.nextEnd = nextEnd;
        this.dragState.nextDayIndex = nextDayIndex;
        this.dragState.changed = true;

        const totalMinutes = this.timetableConfig.dayEndMinute - this.timetableConfig.dayStartMinute;
        const timelineHeight = Math.floor((totalMinutes / 60) * this.timetableConfig.hourHeight);
        const top = Math.floor(((nextStart - this.timetableConfig.dayStartMinute) / totalMinutes) * timelineHeight);
        this.dragState.eventEl.style.top = `${top}px`;

        if (this.dragState.mode === 'resize') {
            const nextHeight = Math.max(22, Math.floor(((nextEnd - nextStart) / totalMinutes) * timelineHeight));
            this.dragState.eventEl.style.height = `${nextHeight}px`;
            this.dragState.eventEl.style.transform = 'translateX(0px)';
        } else {
            const x = (nextDayIndex - this.dragState.dayIndex) * this.dragState.colWidth;
            this.dragState.eventEl.style.transform = `translateX(${x}px)`;
        }

        const timeEl = this.dragState.eventEl.querySelector('.tt-event-time');
        if (timeEl) timeEl.textContent = `${this.minuteToTime(nextStart)} - ${this.minuteToTime(nextEnd)}`;
    },

    async handlePlanPointerUp() {
        if (!this.dragState) return;

        const ctx = this.dragState;
        this.dragState = null;
        ctx.eventEl.classList.remove('is-dragging');
        ctx.eventEl.style.transform = '';

        if (!ctx.changed) return;

        const plan = (this.weekData?.plans || []).find((p) => Number(p.id) === Number(ctx.planId));
        if (!plan) {
            await this.loadWeekCalendar(this.weekOffset);
            return;
        }

        try {
            const beforePayload = {
                plan_date: ctx.planDate,
                start_time: this.minuteToTime(ctx.originalStart),
                end_time: this.minuteToTime(ctx.originalEnd),
                note: plan.note || ''
            };
            const nextDate = this.getWeekDateByIndex(ctx.nextDayIndex);

            await StorageManager.updatePlan(ctx.planId, {
                plan_date: nextDate,
                start_time: this.minuteToTime(ctx.nextStart),
                end_time: this.minuteToTime(ctx.nextEnd),
                note: plan.note || ''
            });

            this.showUndoSnackbar({
                planId: ctx.planId,
                beforePayload
            });
            await this.loadWeekCalendar(this.weekOffset);
        } catch (e) {
            alert(e.message || '타임라인 수정 실패');
            await this.loadWeekCalendar(this.weekOffset);
        }
    },

    formatDuration(sec) {
        const totalMin = Math.max(0, Math.floor((sec || 0) / 60));
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        if (h <= 0) return `${m}m`;
        if (m === 0) return `${h}h`;
        return `${h}h ${m}m`;
    },

    getSubjectColor(subjectId, subjectName) {
        const palette = ['#f2994a', '#2d9cdb', '#27ae60', '#bb6bd9', '#eb5757', '#56ccf2', '#f2c94c', '#6fcf97'];
        const seed = Number(subjectId) || this.hashString(String(subjectName || 'subject'));
        const idx = Math.abs(seed) % palette.length;
        return palette[idx];
    },

    hashString(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    },

    hexToRgba(hex, alpha) {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
        if (!m) return `rgba(212,175,55,${alpha})`;
        const r = parseInt(m[1], 16);
        const g = parseInt(m[2], 16);
        const b = parseInt(m[3], 16);
        return `rgba(${r},${g},${b},${alpha})`;
    },

    toLocalYmd(dateObj) {
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    parseLocalDate(value) {
        if (value instanceof Date) return new Date(value.getTime());
        if (typeof value === 'string') {
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
            if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
            const parsed = new Date(value);
            if (!Number.isNaN(parsed.getTime())) return parsed;
        }
        const fallback = new Date(value);
        if (!Number.isNaN(fallback.getTime())) return fallback;
        return new Date();
    },

    normalizeDateKey(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            const direct = value.trim().slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
        }
        const parsed = this.parseLocalDate(value);
        if (Number.isNaN(parsed.getTime())) return null;
        return this.toLocalYmd(parsed);
    },

    getWeekDateByIndex(index) {
        const startText = this.weekData?.week?.start_date;
        const safeIndex = Math.max(0, Math.min(6, index || 0));
        if (!startText) return this.toLocalYmd(new Date());
        const d = new Date(`${startText}T00:00:00`);
        d.setDate(d.getDate() + safeIndex);
        return this.toLocalYmd(d);
    },

    ensureUndoSnackbar() {
        if (document.getElementById('calendar-undo-snackbar')) return;
        const el = document.createElement('div');
        el.id = 'calendar-undo-snackbar';
        el.className = 'calendar-undo-snackbar';
        el.innerHTML = `<span class="undo-text">타임라인이 변경되었습니다.</span><button type="button" class="undo-btn">되돌리기</button>`;
        document.body.appendChild(el);
    },

    showUndoSnackbar(payload) {
        this.pendingUndo = payload;
        const el = document.getElementById('calendar-undo-snackbar');
        if (!el) return;
        el.classList.add('show');
        if (this.undoTimeoutId) clearTimeout(this.undoTimeoutId);
        this.undoTimeoutId = setTimeout(() => {
            el.classList.remove('show');
            this.pendingUndo = null;
        }, 6000);
    },

    async handleUndoClick() {
        if (!this.pendingUndo) return;
        const payload = this.pendingUndo;
        this.pendingUndo = null;

        const el = document.getElementById('calendar-undo-snackbar');
        if (el) el.classList.remove('show');
        if (this.undoTimeoutId) {
            clearTimeout(this.undoTimeoutId);
            this.undoTimeoutId = null;
        }

        try {
            await StorageManager.updatePlan(payload.planId, payload.beforePayload);
            await this.loadWeekCalendar(this.weekOffset);
        } catch (e) {
            alert(e.message || '되돌리기 실패');
        }
    },

    async handlePlanSubmit(event) {
        event.preventDefault();
        const subjectId = parseInt(this.elements.planSubjectSelect.value, 10) || 0;
        if (!subjectId) {
            alert('과목을 먼저 추가하세요.');
            return;
        }

        const payload = {
            subject_id: subjectId,
            plan_date: this.elements.planDate.value,
            start_time: this.elements.planStartTime.value,
            end_time: this.elements.planEndTime.value,
            note: (this.elements.planNote.value || '').trim()
        };

        try {
            await StorageManager.addPlan(payload);
            this.elements.planNote.value = '';
            await this.loadWeekCalendar(this.weekOffset);
        } catch (e) {
            alert(e.message || '타임라인 추가 실패');
        }
    },

    async handlePlanDelete(event) {
        const btn = event.target.closest('.plan-delete-btn[data-plan-id]');
        if (!btn) return;
        const planId = parseInt(btn.getAttribute('data-plan-id'), 10);
        if (!planId) return;
        if (!confirm('이 타임라인 항목을 삭제할까요?')) return;
        try {
            await StorageManager.deletePlan(planId);
            await this.loadWeekCalendar(this.weekOffset);
        } catch (e) {
            alert(e.message || '삭제 실패');
        }
    },

    minuteToTime(minute) {
        const h = Math.floor((minute || 0) / 60);
        const m = (minute || 0) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    setMode(mode) {
        this.currentMode = mode === 'stopwatch' ? 'stopwatch' : 'timer';
        if (typeof TimerEngine !== 'undefined' && TimerEngine.setMode) {
            TimerEngine.setMode(this.currentMode);
        }

        const isStopwatch = this.currentMode === 'stopwatch';
        this.elements.modeTimer.classList.toggle('active', !isStopwatch);
        this.elements.modeStopwatch.classList.toggle('active', isStopwatch);
        this.elements.setupArea.style.display = isStopwatch ? 'none' : 'flex';

        if (isStopwatch) {
            this.updateTimer(0);
        } else {
            this.syncInputToDisplay();
        }
    },

    syncInputToDisplay() {
        const { hr, min } = this.getSanitizedTimerInput();
        this.updateTimer((hr * 3600 + min * 60) * 100);
    },

    getSanitizedTimerInput() {
        const parsedHr = parseInt(this.elements.inputHr?.value, 10);
        const parsedMin = parseInt(this.elements.inputMin?.value, 10);
        const hr = Math.max(0, Number.isFinite(parsedHr) ? parsedHr : 0);
        const min = Math.max(0, Number.isFinite(parsedMin) ? parsedMin : 0);

        if (this.elements.inputHr) this.elements.inputHr.value = String(hr).padStart(2, '0');
        if (this.elements.inputMin) this.elements.inputMin.value = String(min).padStart(2, '0');

        return { hr, min };
    },

    updateTimer(timeLeft) {
        const totalSec = Math.max(0, Math.floor(timeLeft / 100));
        const h  = Math.floor(totalSec / 3600);
        const m  = Math.floor((totalSec % 3600) / 60);
        const s  = totalSec % 60;
        const ms = Math.max(0, timeLeft % 100);

        const timeStr = (h > 0 ? String(h).padStart(2, '0') + ':' : '') +
                        String(m).padStart(2, '0') + ':' +
                        String(s).padStart(2, '0');

        this.elements.displayTime.innerText = timeStr;
        this.elements.displayMs.innerText   = '.' + String(ms).padStart(2, '0');
    },

    updateAssets(data) {
        if (this.elements.goldVal)   this.elements.goldVal.innerText   = (data.gold || 0).toLocaleString();
        if (this.elements.diamondVal) this.elements.diamondVal.innerText = (data.diamond || 0).toLocaleString();
        if (this.elements.ticketVal) this.elements.ticketVal.innerText = String(data.tickets || 0).padStart(2, '0');
        if (this.elements.tierTag)   this.elements.tierTag.innerText   = data.university || data.tier || '-';
    },

    showResult(type, gold = 0, mode = 'timer', studyRecordId = null) {
        this.elements.body.classList.remove('active');
        if (typeof applyStudyPowerSaveMode === 'function') {
            applyStudyPowerSaveMode(false);
        } else {
            this.elements.body.classList.remove('low-power-active');
        }
        this.elements.overlay.classList.remove('hidden');
        this.lastStudyRecordId = studyRecordId;

        // Notify group room about timer stop
        // Duration is approximate at this point; the authoritative value is in the leaderboard
        if (typeof GroupRooms !== 'undefined') {
            GroupRooms.notifyTimerStop(0);
        }

        if (this.elements.proofSection) {
            this.elements.proofSection.classList.add('hidden');
        }
        if (this.elements.proofStatus) {
            this.elements.proofStatus.textContent = '';
            this.elements.proofStatus.className = 'study-proof-status';
        }
        if (this.elements.proofUploadBtn) {
            this.elements.proofUploadBtn.disabled = true;
        }
        if (this.elements.proofFileInput) {
            this.elements.proofFileInput.value = '';
        }

        if (type === 'SUCCESS') {
            this.elements.resTitle.innerText   = '학습 완료!';
            this.elements.resTitle.style.color = 'var(--gold)';
            this.elements.resLoot.innerHTML    =
                `<span style="font-size:2.5rem;color:#fff">+${gold.toLocaleString()}G</span><br>` +
                `<small>${mode === 'stopwatch' ? '스톱워치 모드 (골드 50%)' : '목표 달성 완수!'}</small>`;

            if (studyRecordId && this.elements.proofSection) {
                this.elements.proofSection.classList.remove('hidden');
            }
        } else if (type === 'INTERRUPTED') {
            this.elements.resTitle.innerText   = '학습 중단됨';
            this.elements.resTitle.style.color = '#444';
            this.elements.resLoot.innerHTML    =
                `<span style="font-size:2.5rem;color:var(--accent)">0G</span><br><small>중도 중단</small>`;
        } else {
            this.elements.resTitle.innerText   = '학습 실패';
            this.elements.resTitle.style.color = 'var(--accent)';
            this.elements.resLoot.innerHTML    =
                `<span style="color:var(--accent);font-size:1.1rem">이탈이 감지되었습니다.</span>`;
        }
    }
};

function initUiWhenReady() {
    UI.init();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUiWhenReady, { once: true });
} else {
    initUiWhenReady();
}
