const UI = {
    currentMode: 'timer',
    currentTab: 'study',
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
        ticketVal:   document.getElementById('ticket-val'),
        tierTag:     document.querySelector('.tier-tag'),
        rankPct:     document.getElementById('rank-pct'),
        tabStudyBtn: document.getElementById('tab-study-btn'),
        tabCalendarBtn: document.getElementById('tab-calendar-btn'),
        tabBalloonBtn: document.getElementById('tab-balloon-btn'),
        tabStudy:    document.getElementById('tab-study'),
        tabCalendar: document.getElementById('tab-calendar'),
        tabBalloon:  document.getElementById('tab-balloon'),
        balloonMetricToday: document.getElementById('balloon-metric-today'),
        balloonMetricTotal: document.getElementById('balloon-metric-total'),
        balloonMetricSuccess: document.getElementById('balloon-metric-success'),
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
                const totalHr = Math.floor((data.total_sec || 0) / 3600);
                const totalMin = Math.floor(((data.total_sec || 0) % 3600) / 60);
                if (this.elements.rankPct) this.elements.rankPct.textContent = data.pct + '%';
                if (this.elements.tierTag) {
                    this.elements.tierTag.textContent = `${totalHr}h ${totalMin}m / TOP ${data.pct}%`;
                }
            }
        } catch (e) {}
    },

    bindEvents() {
        const syncAction = () => this.syncInputToDisplay();
        this.elements.inputHr.oninput  = syncAction;
        this.elements.inputMin.oninput = syncAction;

        this.elements.tabStudyBtn.onclick = () => this.switchTab('study');
        this.elements.tabCalendarBtn.onclick = () => this.switchTab('calendar');
        this.elements.tabBalloonBtn.onclick = () => this.switchTab('balloon');

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
        const nextTab = tab === 'calendar' || tab === 'balloon' ? tab : 'study';
        this.currentTab = nextTab;
        const isCalendar = this.currentTab === 'calendar';

        this.elements.tabStudyBtn.classList.toggle('active', this.currentTab === 'study');
        this.elements.tabCalendarBtn.classList.toggle('active', this.currentTab === 'calendar');
        this.elements.tabBalloonBtn.classList.toggle('active', this.currentTab === 'balloon');

        this.elements.tabStudy.classList.toggle('active', this.currentTab === 'study');
        this.elements.tabCalendar.classList.toggle('active', this.currentTab === 'calendar');
        this.elements.tabBalloon.classList.toggle('active', this.currentTab === 'balloon');

        this.elements.body.classList.remove('active');
        this.elements.body.classList.toggle('tab-calendar-active', isCalendar);

        if (isCalendar) {
            this.loadWeekCalendar(this.weekOffset).catch(() => {});
            return;
        }
        if (this.currentTab === 'balloon') {
            this.loadBalloonMetrics().catch(() => {});
        }
    },

    async loadBalloonMetrics() {
        const stats = await StorageManager.fetchStudyStats();
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
