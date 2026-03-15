const UI = {
    OPEN_SKIN_SHOP_ONCE_KEY: 'path_open_skin_shop_once',
    OPEN_SKIN_SHOP_FOCUS_ID_KEY: 'path_open_skin_shop_focus_id',
    defaultEngGradeRatio: [1.0, 0.97, 0.92, 0.84, 0.74, 0.6, 0.44, 0.26, 0.1],
    defaultHistGradeRatio: [1.0, 1.0, 1.0, 0.98, 0.96, 0.94, 0.92, 0.9, 0.8],
    currentMode: 'timer',
    currentTab: 'home',
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
    editingPlanId: null,
    quickSubjectNames: ['국어', '영어', '수학', '사회', '과학', '코딩', '전공'],
    plannerDate: null,
    plannerData: null,
    calendarAnchorDate: null,
    calendarSelectedDate: null,
    homeRefreshIntervalId: null,
    activeHubOverlay: null,
    hubApplyTargets: new Map(),
    hubSocialCurrentChatId: null,
    hubSocialCurrentChatNickname: '',
    hubNotifRankTab: 'today',
    skinCatalogById: {},
    skinCatalogFetchedAt: 0,
    pendingFocusSkinId: '',
    moreSheetGesture: {
        active: false,
        startY: 0,
        deltaY: 0,
        startTime: 0,
        lastTime: 0
    },
    timetableConfig: {
        dayStartMinute: 0,
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
        tabHomeBtn: document.getElementById('tab-home-btn'),
        tabStudyBtn: document.getElementById('tab-study-btn'),
        tabPlannerBtn: document.getElementById('tab-planner-btn'),
        tabCalendarBtn: document.getElementById('tab-calendar-btn'),
        tabScoreCalcBtn: document.getElementById('tab-scorecalc-btn'),
        tabBalloonBtn: document.getElementById('tab-balloon-btn'),
        tabCommunityBtn: document.getElementById('tab-community-btn'),
        tabMoreBtn: document.getElementById('tab-more-btn'),
        tabMoreMenu: document.getElementById('tab-more-menu'),
        tabHome: document.getElementById('tab-home'),
        tabStudy:    document.getElementById('tab-study'),
        tabPlanner:  document.getElementById('tab-planner'),
        tabCalendar: document.getElementById('tab-calendar'),
        tabScoreCalc: document.getElementById('tab-scorecalc'),
        tabBalloon:  document.getElementById('tab-balloon'),
        homeStartBtn: document.getElementById('home-start-btn'),
        homeRefreshBtn: document.getElementById('home-refresh-btn'),
        homeQuickApplyBtn: document.getElementById('home-quick-apply'),
        homeQuickShopBtn: document.getElementById('home-quick-shop'),
        homeQuickSocialBtn: document.getElementById('home-quick-social'),
        homeQuickNotifBtn: document.getElementById('home-quick-notif'),
        homeSkinSpot: document.getElementById('home-skin-spot'),
        homeStatToday: document.getElementById('home-stat-today'),
        homeStatTotal: document.getElementById('home-stat-total'),
        homeStatActive: document.getElementById('home-stat-active'),
        homeTopList: document.getElementById('home-top-list'),
        homeRoomList: document.getElementById('home-room-list'),
        hubOverlay: document.getElementById('hub-overlay'),
        hubOverlayTitle: document.getElementById('hub-overlay-title'),
        hubOverlayBody: document.getElementById('hub-overlay-body'),
        hubOverlayCloseBtn: document.getElementById('hub-overlay-close'),
        hubOverlayConfirmBtn: document.getElementById('hub-overlay-confirm'),
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
        studyPlanSyncBtn: document.getElementById('study-plan-sync-btn'),
        studyPlanSyncMeta: document.getElementById('study-plan-sync-meta'),
        planSubjectSelect: document.getElementById('plan-subject-select'),
        planDate: document.getElementById('plan-date'),
        planStartTime: document.getElementById('plan-start-time'),
        planEndTime: document.getElementById('plan-end-time'),
        planNote: document.getElementById('plan-note'),
        planForm: document.getElementById('calendar-plan-form'),
        planSubmitBtn: document.getElementById('plan-add-btn'),
        planCancelBtn: document.getElementById('plan-cancel-btn'),
        planFormStatus: document.getElementById('plan-form-status'),
        weekPrevBtn: document.getElementById('week-prev-btn'),
        weekNextBtn: document.getElementById('week-next-btn'),
        weekLabel: document.getElementById('week-label'),
        calendarSelectedDateLabel: document.getElementById('calendar-selected-date-label'),
        calendarSelectedDateSummary: document.getElementById('calendar-selected-date-summary'),
        calendarOpenPlannerBtn: document.getElementById('calendar-open-planner-btn'),
        calendarTodayBtn: document.getElementById('calendar-today-btn'),
        calendarTimeline: document.getElementById('calendar-timeline'),
        calendarDayPanel: document.getElementById('calendar-day-panel'),
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
        await this.ensureSkinCatalog();
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
        await this.loadHomeHubData();
        this.switchTab('home');
        this.openSkinShopFromSessionFlag();
        this.startHomeAutoRefresh();

        if (typeof CamManager !== 'undefined') CamManager.loadSettings();
        if (typeof applyStudyPowerSaveMode === 'function') applyStudyPowerSaveMode(false);
        console.log('P.A.T.H: UI 초기화 완료');
    },

    openSkinShopFromSessionFlag() {
        let shouldOpen = false;
        let focusSkinId = '';
        try {
            shouldOpen = sessionStorage.getItem(this.OPEN_SKIN_SHOP_ONCE_KEY) === '1';
            focusSkinId = String(sessionStorage.getItem(this.OPEN_SKIN_SHOP_FOCUS_ID_KEY) || '').trim();
            if (shouldOpen) sessionStorage.removeItem(this.OPEN_SKIN_SHOP_ONCE_KEY);
            if (focusSkinId) sessionStorage.removeItem(this.OPEN_SKIN_SHOP_FOCUS_ID_KEY);
        } catch (_) {
            shouldOpen = false;
            focusSkinId = '';
        }

        if (!shouldOpen) return;
        this.pendingFocusSkinId = focusSkinId;
        this.openHomeHubOverlay('shop');
    },

    setTodayDefaults() {
        const today = this.toLocalYmd(new Date());
        if (this.elements.planDate) this.elements.planDate.value = today;
        if (this.elements.planStartTime) this.elements.planStartTime.value = '09:00';
        if (this.elements.planEndTime) this.elements.planEndTime.value = '11:00';
        this.plannerDate = this.plannerDate || today;
        this.calendarAnchorDate = this.calendarAnchorDate || today;
        this.calendarSelectedDate = this.calendarSelectedDate || this.plannerDate;
        this.updateStudyPlanSyncMeta();
        this.clearPlanFormEditingState(today);
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
        const blockWhenStudying = (e, message = '타이머 진행 중에는 이동할 수 없습니다. 중단 후 이용해주세요.') => {
            if (typeof TimerEngine === 'undefined' || !TimerEngine.isActive || !TimerEngine.isActive()) return false;
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            alert(message);
            return true;
        };

        const syncAction = () => this.syncInputToDisplay();
        this.elements.inputHr.oninput  = syncAction;
        this.elements.inputMin.oninput = syncAction;

        this.elements.tabHomeBtn.onclick = () => this.switchTab('home');
        this.elements.tabStudyBtn.onclick = () => this.switchTab('study');
        this.elements.tabPlannerBtn.onclick = () => this.switchTab('planner');
        this.elements.tabCalendarBtn.onclick = () => this.switchTab('calendar');
        this.elements.tabScoreCalcBtn.onclick = () => this.switchTab('scorecalc');
        this.elements.tabBalloonBtn.onclick = () => this.switchTab('balloon');
        document.getElementById('tab-rooms-btn')?.addEventListener('click', () => this.switchTab('rooms'));
        this.elements.tabMoreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = this.elements.tabMoreMenu?.classList.contains('hidden');
            this.setMoreMenuOpen(Boolean(willOpen));
        });
        this.elements.tabMoreMenu?.addEventListener('click', (e) => {
            if (e.target.closest('.page-more-item')) {
                this.setMoreMenuOpen(false);
            }
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.page-more-wrap')) {
                this.setMoreMenuOpen(false);
            }
        });
        this.bindMoreSheetGesture();
        this.elements.tabCommunityBtn?.addEventListener('click', () => {
            if (blockWhenStudying(null, '타이머 진행 중에는 커뮤니티로 이동할 수 없습니다.')) return;
            if (typeof window.navigateTo === 'function') {
                window.navigateTo('/community/');
                return;
            }
            window.location.href = '/community/';
        });
        const backBtn = document.getElementById('btn-back-mainhub');
        if (backBtn) {
            backBtn.onclick = (e) => {
                if (blockWhenStudying(e, '타이머 진행 중에는 메인 허브로 나갈 수 없습니다.')) return false;
                if (typeof window.navigateTo === 'function') {
                    window.navigateTo('/study-hub/');
                } else {
                    window.location.href = '/study-hub/';
                }
                return false;
            };
        }

        const settingsBtn = document.getElementById('btn-open-timer-settings');
        if (settingsBtn) {
            settingsBtn.onclick = (e) => {
                if (blockWhenStudying(e, '타이머 진행 중에는 설정을 열 수 없습니다.')) return false;
                if (typeof openTimerSettings === 'function') openTimerSettings();
                return false;
            };
        }
        this.elements.homeStartBtn?.addEventListener('click', () => this.switchTab('study'));
        this.elements.homeRefreshBtn?.addEventListener('click', () => {
            this.loadHomeHubData(true).catch(() => {});
        });
        this.elements.homeQuickApplyBtn?.addEventListener('click', () => this.openHomeHubOverlay('apply'));
        this.elements.homeQuickShopBtn?.addEventListener('click', () => this.openHomeHubOverlay('shop'));
        this.elements.homeQuickSocialBtn?.addEventListener('click', () => this.openHomeHubOverlay('social'));
        this.elements.homeQuickNotifBtn?.addEventListener('click', () => this.openHomeHubOverlay('notif'));
        this.elements.hubOverlayCloseBtn?.addEventListener('click', () => this.closeHomeHubOverlay());
        this.elements.hubOverlayConfirmBtn?.addEventListener('click', () => this.closeHomeHubOverlay());
        this.elements.hubOverlay?.addEventListener('click', (e) => {
            if (e.target === this.elements.hubOverlay) this.closeHomeHubOverlay();
        });
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeHomeHubOverlay();
        });

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
        this.elements.studyPlanSyncBtn?.addEventListener('click', () => this.handleStudyPlanSyncClick());

        this.elements.weekPrevBtn.onclick = () => this.loadWeekCalendar(this.weekOffset - 1, {
            anchorDate: this.calendarAnchorDate || this.calendarSelectedDate || this.plannerDate,
            selectedDate: this.shiftDateByDays(this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date()), -7),
            syncPlanner: false
        });
        this.elements.weekNextBtn.onclick = () => this.loadWeekCalendar(this.weekOffset + 1, {
            anchorDate: this.calendarAnchorDate || this.calendarSelectedDate || this.plannerDate,
            selectedDate: this.shiftDateByDays(this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date()), 7),
            syncPlanner: false
        });
        this.elements.planForm.onsubmit = (e) => this.handlePlanSubmit(e);
        this.elements.planCancelBtn?.addEventListener('click', () => this.clearPlanFormEditingState());
        this.elements.calendarTimeline.addEventListener('click', (e) => this.handleCalendarTimelineClick(e));
        this.elements.calendarDayPanel?.addEventListener('click', (e) => this.handleCalendarDayPanelClick(e));
        this.elements.calendarTimeline.addEventListener('pointerdown', (e) => this.handlePlanPointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePlanPointerMove(e));
        window.addEventListener('pointerup', () => this.handlePlanPointerUp());
        this.elements.calendarOpenPlannerBtn?.addEventListener('click', () => this.switchTab('planner'));
        this.elements.calendarTodayBtn?.addEventListener('click', () => this.goToTodaySchedule());
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
            this.persistStudyPlanDrafts(this.toLocalYmd(new Date()), { reloadViews: false }).catch(e => {
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
        const validTabs = ['home', 'study', 'calendar', 'balloon', 'scorecalc', 'rooms', 'planner'];
        const nextTab = validTabs.includes(tab) ? tab : 'home';

        if (typeof TimerEngine !== 'undefined' && TimerEngine.isActive && TimerEngine.isActive() && nextTab !== 'study') {
            alert('타이머 진행 중에는 학습 탭을 벗어날 수 없습니다. 중단 후 이동해주세요.');
            return;
        }

        this.currentTab = nextTab;
        const isHome = this.currentTab === 'home';
        const isCalendar = this.currentTab === 'calendar';
        const isRooms = this.currentTab === 'rooms';
        const isPlanner = this.currentTab === 'planner';

        this.elements.tabHomeBtn.classList.toggle('active', isHome);
        this.elements.tabStudyBtn.classList.toggle('active', this.currentTab === 'study');
        this.elements.tabPlannerBtn.classList.toggle('active', isPlanner);
        this.elements.tabCalendarBtn.classList.toggle('active', this.currentTab === 'calendar');
        this.elements.tabScoreCalcBtn.classList.toggle('active', this.currentTab === 'scorecalc');
        this.elements.tabBalloonBtn.classList.toggle('active', this.currentTab === 'balloon');
        document.getElementById('tab-rooms-btn')?.classList.toggle('active', isRooms);

        const isMoreActive = ['calendar', 'scorecalc', 'balloon', 'rooms'].includes(this.currentTab);
        this.elements.tabMoreBtn?.classList.toggle('active', isMoreActive);
        this.elements.tabMoreBtn?.setAttribute('aria-label', isMoreActive ? `더보기 (${this.currentTab})` : '더보기');
        this.setMoreMenuOpen(false);

        this.elements.tabHome.classList.toggle('active', isHome);
        this.elements.tabStudy.classList.toggle('active', this.currentTab === 'study');
        this.elements.tabPlanner.classList.toggle('active', isPlanner);
        this.elements.tabCalendar.classList.toggle('active', this.currentTab === 'calendar');
        this.elements.tabScoreCalc.classList.toggle('active', this.currentTab === 'scorecalc');
        this.elements.tabBalloon.classList.toggle('active', this.currentTab === 'balloon');
        document.getElementById('tab-rooms')?.classList.toggle('active', isRooms);

        this.elements.body.classList.remove('active');
        this.elements.body.classList.toggle('tab-calendar-active', isCalendar);

        if (isHome) {
            this.loadHomeHubData().catch(() => {});
            return;
        }

        if (isCalendar) {
            const focusDate = this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date());
            this.loadWeekCalendar(0, {
                anchorDate: focusDate,
                selectedDate: focusDate,
                syncPlanner: false
            }).catch(() => {});
            return;
        }
        if (isPlanner) {
            this.plannerDate = this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date());
            this.updateStudyPlanSyncMeta();
            this.initPlanner();
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

    setMoreMenuOpen(open) {
        if (!this.elements.tabMoreMenu || !this.elements.tabMoreBtn) return;
        this.elements.tabMoreMenu.classList.toggle('hidden', !open);
        this.elements.tabMoreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.elements.tabMoreBtn.textContent = open ? '더보기 ▴' : '더보기 ▾';
        if (open) {
            this.elements.body?.classList.remove('tab-more-closing');
            this.elements.body?.classList.add('tab-more-open');
        } else {
            this.elements.body?.classList.remove('tab-more-open');
            this.elements.body?.classList.remove('tab-more-closing');
        }
        if (!open) {
            this.moreSheetGesture.active = false;
            this.moreSheetGesture.deltaY = 0;
            this.elements.tabMoreMenu.style.removeProperty('--sheet-drag-offset');
        }
    },

    bindMoreSheetGesture() {
        const menu = this.elements.tabMoreMenu;
        if (!menu) return;

        const isMobile = () => window.matchMedia('(max-width: 620px)').matches;
        const resetDrag = () => {
            this.moreSheetGesture.active = false;
            this.moreSheetGesture.deltaY = 0;
            this.moreSheetGesture.startTime = 0;
            this.moreSheetGesture.lastTime = 0;
            menu.style.removeProperty('--sheet-drag-offset');
            menu.style.removeProperty('--sheet-close-boost');
            menu.classList.remove('is-dragging');
            menu.classList.remove('is-closing');
        };
        const animateAndClose = (velocity) => {
            this.moreSheetGesture.active = false;
            this.moreSheetGesture.startTime = 0;
            this.moreSheetGesture.lastTime = 0;
            menu.classList.remove('is-dragging');
            this.elements.body?.classList.add('tab-more-closing');
            const boost = Math.max(42, Math.min(130, Math.round(velocity * 140)));
            menu.style.setProperty('--sheet-close-boost', `${boost}px`);
            menu.classList.add('is-closing');
            window.setTimeout(() => {
                this.setMoreMenuOpen(false);
                menu.classList.remove('is-closing');
                menu.style.removeProperty('--sheet-close-boost');
            }, 120);
        };

        menu.addEventListener('touchstart', (e) => {
            if (!isMobile()) return;
            if (menu.classList.contains('hidden')) return;
            if (menu.scrollTop > 0) return;
            const touch = e.touches?.[0];
            if (!touch) return;

            this.moreSheetGesture.active = true;
            this.moreSheetGesture.startY = touch.clientY;
            this.moreSheetGesture.deltaY = 0;
            this.moreSheetGesture.startTime = performance.now();
            this.moreSheetGesture.lastTime = this.moreSheetGesture.startTime;
            menu.classList.add('is-dragging');
        }, { passive: true });

        menu.addEventListener('touchmove', (e) => {
            if (!this.moreSheetGesture.active) return;
            const touch = e.touches?.[0];
            if (!touch) return;

            const rawDelta = touch.clientY - this.moreSheetGesture.startY;
            const delta = Math.max(0, Math.min(160, rawDelta));
            this.moreSheetGesture.deltaY = delta;
            this.moreSheetGesture.lastTime = performance.now();
            menu.style.setProperty('--sheet-drag-offset', `${delta}px`);
        }, { passive: true });

        menu.addEventListener('touchend', () => {
            if (!this.moreSheetGesture.active) return;
            const elapsed = Math.max(1, this.moreSheetGesture.lastTime - this.moreSheetGesture.startTime);
            const velocity = this.moreSheetGesture.deltaY / elapsed;
            const byDistance = this.moreSheetGesture.deltaY >= 56;
            const byFlick = this.moreSheetGesture.deltaY >= 18 && velocity >= 0.55;
            const shouldClose = byDistance || byFlick;
            if (shouldClose) {
                animateAndClose(velocity);
                return;
            }
            resetDrag();
        });

        menu.addEventListener('touchcancel', resetDrag);
    },

    startHomeAutoRefresh() {
        if (this.homeRefreshIntervalId) clearInterval(this.homeRefreshIntervalId);
        this.homeRefreshIntervalId = setInterval(() => {
            if (this.currentTab !== 'home') return;
            this.loadHomeHubData().catch(() => {});
        }, 60000);
    },

    async loadHomeHubData(forceReload = false) {
        if (!this.elements.homeTopList || !this.elements.homeRoomList) return;
        if (forceReload) {
            this.elements.homeTopList.textContent = '갱신 중...';
            this.elements.homeRoomList.textContent = '갱신 중...';
        }

        this.ensureSkinCatalog(forceReload).catch(() => {});

        const [stats, ranking, rooms] = await Promise.all([
            StorageManager.fetchStudyStats(),
            StorageManager.fetchTodayRanking(50),
            StorageManager.fetchPublicRooms(5)
        ]);

        const todaySec = parseInt(stats?.today_sec, 10) || 0;
        const totalSec = parseInt(stats?.total_sec, 10) || 0;
        const activeCount = ranking.reduce((acc, row) => acc + (row?.is_studying ? 1 : 0), 0);

        if (this.elements.homeStatToday) this.elements.homeStatToday.textContent = this.formatDuration(todaySec);
        if (this.elements.homeStatTotal) this.elements.homeStatTotal.textContent = this.formatDuration(totalSec);
        if (this.elements.homeStatActive) this.elements.homeStatActive.textContent = `${activeCount}명`;

        this.renderHomeTopRanking(ranking.slice(0, 5));
        this.renderHomePublicRooms(rooms);
    },

    renderHomeTopRanking(rows) {
        if (!this.elements.homeTopList) return;
        if (!Array.isArray(rows) || rows.length === 0) {
            this.elements.homeTopList.innerHTML = '<div class="home-empty">아직 오늘 랭킹 데이터가 없습니다.</div>';
            return;
        }

        this.elements.homeTopList.innerHTML = rows.map((row, idx) => {
            const sec = parseInt(row?.today_sec, 10) || 0;
            const nickname = this.escapeHtml(row?.display_nickname || row?.nickname || '익명');
            const university = this.escapeHtml(row?.university || '소속 미설정');
            const studying = row?.is_studying ? '<span class="home-badge-live">공부중</span>' : '';
            const skinId = String(row?.balloon_skin || 'default');
            const skinName = this.escapeHtml(this.getSkinNameById(skinId));
            const skinTone = this.getSkinToneVars(skinId);
            const skinBadge = `<span class="home-badge-skin" style="${skinTone}">🎈 ${skinName}</span>`;
            return `<div class="home-row-item">
                <div class="home-row-rank">${idx + 1}</div>
                <div class="home-row-main">
                    <div class="home-row-title">${nickname} ${skinBadge} ${studying}</div>
                    <div class="home-row-sub">${university}</div>
                </div>
                <div class="home-row-val">${this.formatDuration(sec)}</div>
            </div>`;
        }).join('');
    },

    renderHomePublicRooms(rooms) {
        if (!this.elements.homeRoomList) return;
        if (!Array.isArray(rooms) || rooms.length === 0) {
            this.elements.homeRoomList.innerHTML = '<div class="home-empty">현재 공개 그룹이 없습니다.</div>';
            return;
        }

        this.elements.homeRoomList.innerHTML = rooms.map((room) => {
            const name = this.escapeHtml(room?.name || '이름 없는 방');
            const goal = this.escapeHtml(room?.goal || '목표 미설정');
            const members = parseInt(room?.member_count, 10) || 0;
            const maxMembers = parseInt(room?.max_members, 10) || 0;
            const todaySec = parseInt(room?.today_sec, 10) || 0;
            return `<div class="home-row-item home-room-item">
                <div class="home-row-main">
                    <div class="home-row-title">${name}</div>
                    <div class="home-row-sub">${goal}</div>
                </div>
                <div class="home-row-val">${members}/${maxMembers || '-'}명 · ${this.formatDuration(todaySec)}</div>
            </div>`;
        }).join('');
    },

    openHomeHubOverlay(type) {
        if (!this.elements.hubOverlay || !this.elements.hubOverlayTitle || !this.elements.hubOverlayBody) return;

        this.elements.hubOverlay.classList.remove('hidden');
        this.activeHubOverlay = type;

        if (type === 'apply') {
            this.elements.hubOverlayTitle.textContent = '모의지원';
            this.renderHubApplyPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '모의지원 데이터를 불러오지 못했습니다.')}</div>`;
            });
            return;
        }

        if (type === 'shop') {
            this.elements.hubOverlayTitle.textContent = '상점 · 성장';
            this.renderHubShopPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '상점 데이터를 불러오지 못했습니다.')}</div>`;
            });
            return;
        }

        if (type === 'social') {
            this.elements.hubOverlayTitle.textContent = '친구 · 메시지';
            this.renderHubSocialPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '소셜 데이터를 불러오지 못했습니다.')}</div>`;
            });
            return;
        }

        if (type === 'notif') {
            this.elements.hubOverlayTitle.textContent = '알림 · 랭킹';
            this.renderHubNotifPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '알림 데이터를 불러오지 못했습니다.')}</div>`;
            });
            return;
        }

        const map = {
            apply: {
                title: '모의지원',
                body: '원서비, 지원 슬롯, 지원 이력을 이 화면에서 바로 처리할 예정입니다. 다음 단계에서 기존 기능을 순서대로 연결합니다.'
            },
            shop: {
                title: '상점 · 성장',
                body: '세금 수령, 티켓 구매, 스킨/오오라 관리 기능을 월드 없이 패널 형태로 이식할 예정입니다.'
            },
            social: {
                title: '친구 · 메시지',
                body: '동맹 관리와 1:1 메시지 진입을 홈 허브에서 처리할 수 있도록 연결할 예정입니다.'
            },
            notif: {
                title: '알림 · 랭킹',
                body: '전체 랭킹(TODAY/TOTAL)과 알림 읽음 처리를 같은 패널로 묶어 복구할 예정입니다.'
            }
        };

        const conf = map[type] || map.notif;
        this.elements.hubOverlayTitle.textContent = conf.title;
        this.elements.hubOverlayBody.textContent = conf.body;
    },

    closeHomeHubOverlay() {
        if (!this.elements.hubOverlay) return;
        this.activeHubOverlay = null;
        this.elements.hubOverlay.classList.add('hidden');
    },

    async requestJson(url, options = {}) {
        const merged = {
            credentials: 'include',
            ...options
        };
        const res = await fetch(url, merged);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data?.error || '요청 처리에 실패했습니다.');
        }
        return data;
    },

    mergeCurrentUserPatch(userPatch) {
        if (!userPatch || typeof userPatch !== 'object') return;
        this.currentUser = {
            ...(this.currentUser || {}),
            ...userPatch
        };
        this.updateAssets(this.currentUser);
    },

    async ensureSkinCatalog(forceReload = false) {
        const now = Date.now();
        const staleMs = 3 * 60 * 1000;
        const hasCatalog = this.skinCatalogById && Object.keys(this.skinCatalogById).length > 0;
        if (!forceReload && hasCatalog && (now - this.skinCatalogFetchedAt < staleMs)) {
            return this.skinCatalogById;
        }

        const data = await this.requestJson('/api/estate/skins');
        const skins = Array.isArray(data?.skins) ? data.skins : [];
        const nextCatalog = {};
        skins.forEach((skin) => {
            const id = String(skin?.id || '').trim();
            if (!id) return;
            nextCatalog[id] = skin;
        });

        this.skinCatalogById = nextCatalog;
        this.skinCatalogFetchedAt = now;

        const owned = Array.isArray(data?.owned) ? data.owned.join(',') : undefined;
        this.mergeCurrentUserPatch({
            balloon_skin: data?.equipped || this.currentUser?.balloon_skin || 'default',
            ...(owned ? { owned_skins: owned } : {})
        });

        return this.skinCatalogById;
    },

    getSkinNameById(skinId) {
        const id = String(skinId || 'default');
        const skin = this.skinCatalogById?.[id];
        if (skin?.name) return skin.name;
        if (id === 'default') return '기본 열기구';
        return id;
    },

    getSkinToneVars(skinId) {
        const raw = String(skinId || 'default');
        let hash = 0;
        for (let i = 0; i < raw.length; i += 1) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
        }
        const hue = Math.abs(hash) % 360;
        const hue2 = (hue + 38) % 360;
        return `--skin-h:${hue};--skin-h2:${hue2};`;
    },

    getSkinRarityMeta(skin) {
        const price = Number(skin?.price || 0);
        if (price <= 0) {
            return { label: '기본', className: 'is-basic' };
        }
        if (price >= 12000) {
            return { label: '시그니처', className: 'is-signature' };
        }
        if (price >= 9000) {
            return { label: '레전드', className: 'is-legend' };
        }
        if (price >= 6000) {
            return { label: '프리미엄', className: 'is-premium' };
        }
        if (price >= 3500) {
            return { label: '레어', className: 'is-rare' };
        }
        return { label: '셀렉트', className: 'is-select' };
    },

    renderHomeSkinSpot() {
        const spot = this.elements.homeSkinSpot;
        if (!spot) return;

        const skinId = String(this.currentUser?.balloon_skin || 'default');
        const skinName = this.escapeHtml(this.getSkinNameById(skinId));
        const rarity = this.getSkinRarityMeta(this.skinCatalogById?.[skinId]);
        const ownedRaw = String(this.currentUser?.owned_skins || 'default');
        const ownedCount = ownedRaw
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean).length;
        const toneVars = this.getSkinToneVars(skinId);

        spot.innerHTML = `
            <div class="home-skin-card">
                <div class="home-skin-preview" style="${toneVars}" aria-hidden="true">🎈</div>
                <div class="home-skin-info">
                    <span class="home-skin-label">CURRENT SKIN</span>
                    <strong class="home-skin-name">${skinName} <span class="home-badge-skin">${this.escapeHtml(rarity.label)}</span></strong>
                    <span class="home-skin-meta">보유 ${ownedCount}개 · 장착 ID ${this.escapeHtml(skinId)}</span>
                </div>
                <button type="button" class="home-skin-manage-btn" id="home-skin-manage-btn">관리</button>
            </div>
        `;

        const manageBtn = spot.querySelector('#home-skin-manage-btn');
        manageBtn?.addEventListener('click', () => this.openHomeHubOverlay('shop'));
    },

    buildSkinPillHtml(skinId) {
        const id = String(skinId || 'default');
        const toneVars = this.getSkinToneVars(id);
        const skinName = this.escapeHtml(this.getSkinNameById(id));
        return `<span class="hub-skin-pill" style="${toneVars}">🎈 ${skinName}</span>`;
    },

    async renderHubApplyPanel() {
        if (!this.elements.hubOverlayBody || !this.elements.hubOverlayConfirmBtn) return;

        this.elements.hubOverlayConfirmBtn.textContent = '닫기';
        this.elements.hubOverlayBody.innerHTML = '<div class="hub-apply-loading">불러오는 중...</div>';

        const [applyData, rankingData] = await Promise.all([
            this.requestJson('/api/invasion/my-applications'),
            this.requestJson('/api/ranking/today')
        ]);

        const maxSlots = Number(applyData?.max_slots || 0);
        const usedSlots = Number(applyData?.used_slots || 0);
        const remainSlots = Math.max(0, maxSlots - usedSlots);
        const myScore = Number(applyData?.my_score || 0);
        const myScoreStatus = String(applyData?.score_status || 'none');
        const myTickets = Number(applyData?.tickets || 0);
        const applications = Array.isArray(applyData?.applications) ? applyData.applications : [];
        const rankingRows = Array.isArray(rankingData?.ranking) ? rankingData.ranking : [];

        const currentUserId = Number(this.currentUser?.id || 0);
        const targets = rankingRows
            .filter((row) => Number(row?.id || 0) > 0 && Number(row.id) !== currentUserId)
            .slice(0, 12);

        this.hubApplyTargets = new Map();
        targets.forEach((row) => {
            this.hubApplyTargets.set(Number(row.id), row);
        });

        const scoreStateText = myScoreStatus === 'approved'
            ? `${myScore}점 인증 완료`
            : myScoreStatus === 'pending'
                ? '점수 심사 대기 중'
                : myScoreStatus === 'rejected'
                    ? '점수 반려됨 (재업로드 필요)'
                    : '점수 미인증';

        const slotProgress = maxSlots > 0 ? Math.round((usedSlots / maxSlots) * 100) : 0;

        const historyHtml = applications.length
            ? applications.slice(0, 8).map((item) => {
                const won = String(item?.result || '').toUpperCase() === 'WIN';
                const date = item?.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric'
                }) : '-';
                const targetUniversity = this.escapeHtml(item?.target_university || '대학 미상');
                const targetNickname = this.escapeHtml(item?.target_nickname || '상대 미상');
                const scoreText = Number(item?.my_score || 0);
                return `<li class="hub-apply-history-item">
                    <div class="hub-apply-history-main">
                        <strong>${targetUniversity}</strong>
                        <span>${targetNickname} · ${date} · ${scoreText}점</span>
                    </div>
                    <span class="hub-apply-history-result ${won ? 'win' : 'loss'}">${won ? '합격' : '불합격'}</span>
                </li>`;
            }).join('')
            : '<li class="hub-apply-empty">지원 이력이 없습니다.</li>';

        const targetHtml = targets.length
            ? targets.map((row) => {
                const userId = Number(row?.id || 0);
                const nick = this.escapeHtml(row?.display_nickname || row?.nickname || '익명');
                const univ = this.escapeHtml(row?.university || '대학 미설정');
                const sec = Number(row?.today_sec || 0);
                return `<li class="hub-apply-target-item">
                    <div class="hub-apply-target-main">
                        <strong>${nick}</strong>
                        <span>${univ} · 오늘 ${this.formatDuration(sec)}</span>
                    </div>
                    <button type="button" class="hub-apply-attack-btn" data-defender-id="${userId}">지원</button>
                </li>`;
            }).join('')
            : '<li class="hub-apply-empty">현재 도전 가능한 대상이 없습니다.</li>';

        this.elements.hubOverlayBody.innerHTML = `
            <section class="hub-apply-wrap">
                <div class="hub-apply-summary">
                    <div class="hub-apply-meta-row">
                        <span>슬롯</span>
                        <strong>${usedSlots}/${maxSlots} 사용 · ${remainSlots}회 남음</strong>
                    </div>
                    <div class="hub-apply-progress"><span style="width:${Math.max(0, Math.min(100, slotProgress))}%"></span></div>
                    <div class="hub-apply-meta-row">
                        <span>내 점수 상태</span>
                        <strong>${this.escapeHtml(scoreStateText)}</strong>
                    </div>
                    <div class="hub-apply-meta-row">
                        <span>보유 원서비</span>
                        <strong>${myTickets}장</strong>
                    </div>
                    <div class="hub-apply-actions-row">
                        <button type="button" id="hub-apply-refresh-btn" class="home-refresh-btn">새로고침</button>
                        <button type="button" id="hub-apply-study-btn" class="btn-primary home-start-btn">학습하러 가기</button>
                    </div>
                </div>

                <div class="hub-apply-grid">
                    <section class="hub-apply-panel">
                        <h4>도전 대상</h4>
                        <ul class="hub-apply-list">${targetHtml}</ul>
                    </section>
                    <section class="hub-apply-panel">
                        <h4>최근 지원 이력</h4>
                        <ul class="hub-apply-list">${historyHtml}</ul>
                    </section>
                </div>
            </section>
        `;

        this.elements.hubOverlayBody.querySelector('#hub-apply-refresh-btn')?.addEventListener('click', () => {
            this.renderHubApplyPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '새로고침 실패')}</div>`;
            });
        });

        this.elements.hubOverlayBody.querySelector('#hub-apply-study-btn')?.addEventListener('click', () => {
            this.closeHomeHubOverlay();
            this.switchTab('study');
        });

        this.elements.hubOverlayBody.querySelectorAll('.hub-apply-attack-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const defenderId = Number(btn.dataset.defenderId || 0);
                if (!defenderId) return;
                await this.handleHubApplyAttack(defenderId, btn);
            });
        });
    },

    async handleHubApplyAttack(defenderId, triggerBtn) {
        const target = this.hubApplyTargets.get(defenderId);
        const targetName = this.escapeHtml(target?.display_nickname || target?.nickname || '상대');
        if (!confirm(`${targetName}에게 지원하시겠습니까?\n원서비 1장이 소모됩니다.`)) return;

        const btn = triggerBtn;
        const prevText = btn?.textContent;
        if (btn) {
            btn.disabled = true;
            btn.textContent = '진행중...';
        }

        try {
            const data = await this.requestJson('/api/invasion/attack', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ defender_id: defenderId })
            });

            if (data?.user) this.mergeCurrentUserPatch(data.user);

            const won = String(data?.result || '').toUpperCase() === 'WIN';
            const resultText = won ? '합격' : '불합격';
            const probText = Number.isFinite(Number(data?.accept_prob)) ? `합격 확률 ${data.accept_prob}%` : '확률 집계 없음';
            alert(`모의지원 결과: ${resultText}\n${probText}`);

            if (this.activeHubOverlay === 'apply') {
                await this.renderHubApplyPanel();
            }
        } catch (err) {
            alert(err?.message || '지원 처리 중 오류가 발생했습니다.');
            if (btn) {
                btn.disabled = false;
                btn.textContent = prevText || '지원';
            }
        }
    },

    async renderHubShopPanel() {
        if (!this.elements.hubOverlayBody || !this.elements.hubOverlayConfirmBtn) return;

        this.elements.hubOverlayConfirmBtn.textContent = '닫기';
        this.elements.hubOverlayBody.innerHTML = '<div class="hub-apply-loading">불러오는 중...</div>';

        const [taxData, skinData, auraData] = await Promise.all([
            this.requestJson('/api/estate/tax'),
            this.requestJson('/api/estate/skins'),
            this.requestJson('/api/estate/auras')
        ]);

        const ownedSkins = Array.isArray(skinData?.owned) ? skinData.owned : [];
        const ownedAuras = Array.isArray(auraData?.owned) ? auraData.owned : [];
        const skins = Array.isArray(skinData?.skins) ? skinData.skins : [];
        const auras = Array.isArray(auraData?.auras) ? auraData.auras : [];

        const collectible = Number(taxData?.pending || 0);
        const gold = Number(taxData?.gold || this.currentUser?.gold || 0);
        const diamond = Number(taxData?.diamond || this.currentUser?.diamond || 0);
        const tickets = Number(this.currentUser?.tickets || 0);
        const ticketPrice = Number(taxData?.ticketPrice || 0);
        const focusSkinId = String(this.pendingFocusSkinId || '').trim();

        const skinHtml = skins.slice(0, 8).map((skin) => {
            const skinId = String(skin?.id || '');
            const owned = ownedSkins.includes(skinId);
            const equipped = String(skinData?.equipped || 'default') === skinId;
            const price = Number(skin?.price || 0);
            const canAfford = owned || price <= 0 || gold >= price;
            const needsCollect = !owned && price > gold && price <= gold + collectible;
            const rarity = this.getSkinRarityMeta(skin);
            const actionLabel = equipped
                ? '장착중'
                : owned
                    ? '장착'
                    : !canAfford
                        ? needsCollect ? '수입 수령 필요' : '골드 부족'
                        : price > 0
                            ? `${price.toLocaleString()}G 구매`
                            : '획득';
            const disabled = (equipped || (!owned && !canAfford)) ? 'disabled' : '';
            const toneVars = this.getSkinToneVars(skinId || 'default');
            const isFocus = focusSkinId && skinId === focusSkinId;
            const focusClass = isFocus ? ' hub-shop-item--focus' : '';
            const statusBadges = [
                `<span class="hub-shop-rarity-badge ${rarity.className}">${this.escapeHtml(rarity.label)}</span>`
            ];
            if (equipped) {
                statusBadges.push('<span class="hub-shop-state-badge is-equipped">현재 착용</span>');
            } else if (isFocus) {
                statusBadges.push('<span class="hub-shop-state-badge is-focus">지금 보고 있는 스킨</span>');
            }
            if (!owned && !canAfford) {
                statusBadges.push(`<span class="hub-shop-state-badge is-locked">${needsCollect ? '수입 수령 후 구매 가능' : '골드가 부족합니다'}</span>`);
            }
            const quickAction = isFocus && !equipped
                ? needsCollect
                    ? `<button type="button" class="hub-shop-quick-btn" data-shop-kind="collect" data-shop-id="collect-tax" data-shop-mode="collect">수입 먼저 받기</button>`
                    : `<button type="button" class="hub-shop-quick-btn" data-shop-kind="skin" data-shop-id="${this.escapeHtml(skinId)}" data-shop-mode="${owned ? 'equip' : 'buy'}" data-shop-auto-equip="${owned ? '0' : '1'}" ${(owned || canAfford) ? '' : 'disabled'}>${owned ? '바로 장착' : !canAfford ? '골드 부족' : price > 0 ? '구매 후 장착' : '획득 후 장착'}</button>`
                : '';
            return `<li class="hub-shop-item${focusClass}" data-skin-id="${this.escapeHtml(skinId)}">
                <div class="hub-shop-main">
                    <div class="hub-shop-main-top">
                        <span class="hub-shop-skin-preview" style="${toneVars}" aria-hidden="true">🎈</span>
                        <strong>${this.escapeHtml(skin?.name || skinId)}</strong>
                    </div>
                    <div class="hub-shop-badge-row">${statusBadges.join('')}</div>
                    <span>${this.escapeHtml(skin?.desc || '')}</span>
                </div>
                <div class="hub-shop-item-actions">
                    <button type="button" class="hub-shop-action-btn" data-shop-kind="skin" data-shop-id="${this.escapeHtml(skinId)}" data-shop-mode="${owned ? 'equip' : 'buy'}" ${disabled}>${actionLabel}</button>
                    ${quickAction}
                </div>
            </li>`;
        }).join('');

        const auraHtml = auras.slice(0, 8).map((aura) => {
            const auraId = String(aura?.id || '');
            const owned = ownedAuras.includes(auraId);
            const equipped = String(auraData?.equipped || 'none') === auraId;
            const price = Number(aura?.price || 0);
            const actionLabel = equipped ? '장착중' : owned ? '장착' : price > 0 ? `${price.toLocaleString()}G 구매` : '획득';
            const disabled = equipped ? 'disabled' : '';
            return `<li class="hub-shop-item">
                <div class="hub-shop-main">
                    <strong>${this.escapeHtml(aura?.name || auraId)}</strong>
                    <span>${this.escapeHtml(aura?.desc || '')}</span>
                </div>
                <button type="button" class="hub-shop-action-btn" data-shop-kind="aura" data-shop-id="${this.escapeHtml(auraId)}" data-shop-mode="${owned ? 'equip' : 'buy'}" ${disabled}>${actionLabel}</button>
            </li>`;
        }).join('');

        this.elements.hubOverlayBody.innerHTML = `
            <section class="hub-shop-wrap">
                <div class="hub-shop-summary">
                    <div class="hub-shop-meta-row"><span>보유 골드</span><strong>${gold.toLocaleString()}G</strong></div>
                    <div class="hub-shop-meta-row"><span>보유 다이아</span><strong>${diamond.toLocaleString()}D</strong></div>
                    <div class="hub-shop-meta-row"><span>보유 원서비</span><strong>${tickets}장</strong></div>
                    <div class="hub-shop-meta-row"><span>미수령 수입</span><strong>${collectible.toLocaleString()}G</strong></div>
                    <div class="hub-shop-actions-row">
                        <button type="button" id="hub-shop-collect-btn" class="home-refresh-btn">수입 수령</button>
                        <button type="button" id="hub-shop-buy-ticket-btn" class="btn-primary home-start-btn">원서비 구매 (${ticketPrice.toLocaleString()}G)</button>
                    </div>
                </div>

                <div class="hub-shop-grid">
                    <section class="hub-shop-panel">
                        <h4>스킨</h4>
                        <ul class="hub-shop-list">${skinHtml || '<li class="hub-apply-empty">스킨 데이터가 없습니다.</li>'}</ul>
                    </section>
                    <section class="hub-shop-panel">
                        <h4>오오라</h4>
                        <ul class="hub-shop-list">${auraHtml || '<li class="hub-apply-empty">오오라 데이터가 없습니다.</li>'}</ul>
                    </section>
                </div>
            </section>
        `;

        this.elements.hubOverlayBody.querySelector('#hub-shop-collect-btn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = '처리중...';
            try {
                const data = await this.requestJson('/api/estate/collect-tax', { method: 'POST' });
                if (data?.user) this.mergeCurrentUserPatch(data.user);
                alert(data?.collected > 0 ? `${data.collected.toLocaleString()}G 수령 완료` : (data?.message || '수령할 수입이 없습니다.'));
                await this.renderHubShopPanel();
            } catch (err) {
                alert(err?.message || '수입 수령 중 오류가 발생했습니다.');
                btn.disabled = false;
                btn.textContent = prev;
            }
        });

        this.elements.hubOverlayBody.querySelector('#hub-shop-buy-ticket-btn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = '구매중...';
            try {
                const data = await this.requestJson('/api/estate/buy-ticket', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ quantity: 1 })
                });
                if (data?.user) this.mergeCurrentUserPatch(data.user);
                alert(`원서비 1장 구매 완료 (-${Number(data?.spent || 0).toLocaleString()}G)`);
                await this.renderHubShopPanel();
            } catch (err) {
                alert(err?.message || '원서비 구매 중 오류가 발생했습니다.');
                btn.disabled = false;
                btn.textContent = prev;
            }
        });

        this.elements.hubOverlayBody.querySelectorAll('.hub-shop-action-btn, .hub-shop-quick-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const kind = String(btn.dataset.shopKind || '');
                const id = String(btn.dataset.shopId || '');
                const mode = String(btn.dataset.shopMode || '');
                const autoEquip = btn.dataset.shopAutoEquip === '1';
                await this.handleHubShopAction({ kind, id, mode, button: btn, autoEquip });
            });
        });

        if (focusSkinId) {
            const focusEl = this.elements.hubOverlayBody.querySelector(`.hub-shop-item[data-skin-id="${focusSkinId}"]`);
            focusEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            this.pendingFocusSkinId = '';
        }
    },

    async handleHubShopAction({ kind, id, mode, button, autoEquip = false }) {
        if (!kind || !id || !mode || !button) return;

        const prev = button.textContent;
        button.disabled = true;
        button.textContent = kind === 'collect' ? '수령중...' : mode === 'equip' ? '장착중...' : '구매중...';

        try {
            if (kind === 'collect') {
                const data = await this.requestJson('/api/estate/collect-tax', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({})
                });
                if (data?.user) this.mergeCurrentUserPatch(data.user);
                alert(data?.collected > 0
                    ? `${Number(data.collected || 0).toLocaleString()}G를 수령했습니다.`
                    : (data?.message || '아직 수령할 수입이 없습니다.'));
            } else if (kind === 'skin' && mode === 'buy') {
                const data = await this.requestJson('/api/estate/buy-skin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skin_id: id })
                });
                if (data?.user) this.mergeCurrentUserPatch(data.user);
                if (autoEquip) {
                    await this.requestJson('/api/estate/equip-skin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ skin_id: id })
                    });
                    this.mergeCurrentUserPatch({ balloon_skin: id });
                    alert('스킨을 구매하고 바로 장착했습니다.');
                } else {
                    alert('스킨을 구매했습니다.');
                }
            } else if (kind === 'skin' && mode === 'equip') {
                await this.requestJson('/api/estate/equip-skin', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ skin_id: id })
                });
                this.mergeCurrentUserPatch({ balloon_skin: id });
                alert('스킨을 장착했습니다.');
            } else if (kind === 'aura' && mode === 'buy') {
                const data = await this.requestJson('/api/estate/buy-aura', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aura_id: id, currency: 'gold' })
                });
                if (data?.user) this.mergeCurrentUserPatch(data.user);
                alert('오오라를 구매했습니다.');
            } else if (kind === 'aura' && mode === 'equip') {
                await this.requestJson('/api/estate/equip-aura', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aura_id: id })
                });
                this.mergeCurrentUserPatch({ balloon_aura: id });
                alert('오오라를 장착했습니다.');
            }

            await this.renderHubShopPanel();
        } catch (err) {
            alert(err?.message || '상점 처리 중 오류가 발생했습니다.');
            button.disabled = false;
            button.textContent = prev;
        }
    },

    async renderHubSocialPanel() {
        if (!this.elements.hubOverlayBody || !this.elements.hubOverlayConfirmBtn) return;

        this.elements.hubOverlayConfirmBtn.textContent = '닫기';
        this.elements.hubOverlayBody.innerHTML = '<div class="hub-apply-loading">불러오는 중...</div>';

        const [friends, requests, conversations, unreadCount] = await Promise.all([
            this.requestJson('/api/friends/list'),
            this.requestJson('/api/friends/requests'),
            this.requestJson('/api/messages/conversations'),
            this.requestJson('/api/messages/unread-count')
        ]);

        const friendList = Array.isArray(friends) ? friends : [];
        const requestList = Array.isArray(requests) ? requests : [];
        const convoList = Array.isArray(conversations) ? conversations : [];
        const unread = Number(unreadCount?.count || 0);

        if (!this.hubSocialCurrentChatId) {
            const firstConvo = convoList[0];
            const firstFriend = friendList[0];
            this.hubSocialCurrentChatId = Number(firstConvo?.other_user || firstFriend?.id || 0) || null;
            this.hubSocialCurrentChatNickname = String(firstConvo?.nickname || firstFriend?.nickname || '');
        }

        const requestHtml = requestList.length
            ? requestList.map((req) => {
                const id = Number(req?.friendship_id || 0);
                const nick = this.escapeHtml(req?.nickname || '익명');
                const univ = this.escapeHtml(req?.university || '소속 미설정');
                const skinPill = this.buildSkinPillHtml(req?.balloon_skin || 'default');
                return `<li class="hub-social-request-item">
                    <div class="hub-social-user-main">
                        <strong>${nick} ${skinPill}</strong>
                        <span>${univ}</span>
                    </div>
                    <div class="hub-social-mini-actions">
                        <button type="button" class="hub-shop-action-btn" data-social-act="accept" data-friendship-id="${id}">수락</button>
                        <button type="button" class="hub-shop-action-btn hub-social-danger" data-social-act="reject" data-friendship-id="${id}">거절</button>
                    </div>
                </li>`;
            }).join('')
            : '<li class="hub-apply-empty">대기 중인 동맹 신청이 없습니다.</li>';

        const friendHtml = friendList.length
            ? friendList.map((f) => {
                const userId = Number(f?.id || 0);
                const nick = this.escapeHtml(f?.nickname || '익명');
                const univ = this.escapeHtml(f?.university || '소속 미설정');
                const skinPill = this.buildSkinPillHtml(f?.balloon_skin || 'default');
                const studying = f?.is_studying ? ' · 공부중' : '';
                const activeClass = this.hubSocialCurrentChatId === userId ? 'active' : '';
                return `<li class="hub-social-friend-item ${activeClass}">
                    <button type="button" class="hub-social-friend-main" data-social-act="open-chat" data-chat-user-id="${userId}" data-chat-user-name="${nick}">
                        <strong>${nick} ${skinPill}</strong>
                        <span>${univ}${studying}</span>
                    </button>
                    <button type="button" class="hub-shop-action-btn hub-social-danger" data-social-act="remove-friend" data-target-id="${userId}">해제</button>
                </li>`;
            }).join('')
            : '<li class="hub-apply-empty">동맹이 없습니다.</li>';

        const convoPreviewHtml = this.buildHubSocialConvoPreviewHtml(convoList);

        this.elements.hubOverlayBody.innerHTML = `
            <section class="hub-social-wrap">
                <div class="hub-social-summary">
                    <div class="hub-shop-meta-row"><span>동맹 수</span><strong>${friendList.length}명</strong></div>
                    <div class="hub-shop-meta-row"><span>대기 신청</span><strong>${requestList.length}건</strong></div>
                    <div class="hub-shop-meta-row"><span>읽지 않은 메시지</span><strong id="hub-social-unread-count">${unread}개</strong></div>
                    <div class="hub-shop-actions-row">
                        <button type="button" id="hub-social-refresh-btn" class="home-refresh-btn">새로고침</button>
                    </div>
                </div>

                <div class="hub-social-grid">
                    <section class="hub-social-panel">
                        <h4>동맹 신청</h4>
                        <ul class="hub-social-list">${requestHtml}</ul>
                        <h4 class="hub-social-subtitle">내 동맹</h4>
                        <ul class="hub-social-list">${friendHtml}</ul>
                    </section>

                    <section class="hub-social-panel">
                        <h4>대화</h4>
                        <ul id="hub-social-convo-list" class="hub-social-list hub-social-convo-list">${convoPreviewHtml}</ul>
                        <div class="hub-social-chat-box">
                            <div id="hub-social-chat-title" class="hub-social-chat-title">대화 상대를 선택하세요</div>
                            <div id="hub-social-messages" class="hub-social-messages"></div>
                            <div class="hub-social-chat-input-row">
                                <textarea id="hub-social-chat-input" class="hub-social-chat-input" maxlength="500" placeholder="메시지를 입력하세요"></textarea>
                                <div class="hub-social-chat-actions">
                                    <div class="hub-social-file-row">
                                        <input type="file" id="hub-social-file-input" class="hub-social-file-input" />
                                        <button type="button" id="hub-social-file-pick-btn" class="home-refresh-btn hub-social-file-pick-btn">파일 선택</button>
                                        <span id="hub-social-file-name" class="hub-social-file-name">선택된 파일 없음</span>
                                    </div>
                                    <div class="hub-social-send-row">
                                        <button type="button" id="hub-social-send-file-btn" class="home-refresh-btn hub-social-send-file-btn">파일 전송</button>
                                        <button type="button" id="hub-social-send-btn" class="btn-primary">보내기</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </section>
        `;

        this.elements.hubOverlayBody.querySelector('#hub-social-refresh-btn')?.addEventListener('click', () => {
            this.renderHubSocialPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '새로고침 실패')}</div>`;
            });
        });

        this.elements.hubOverlayBody.querySelectorAll('[data-social-act]').forEach((el) => {
            el.addEventListener('click', async () => {
                const action = String(el.dataset.socialAct || '');
                if (!action) return;
                await this.handleHubSocialAction(action, el);
            });
        });

        const sendBtn = this.elements.hubOverlayBody.querySelector('#hub-social-send-btn');
        const sendFileBtn = this.elements.hubOverlayBody.querySelector('#hub-social-send-file-btn');
        const pickFileBtn = this.elements.hubOverlayBody.querySelector('#hub-social-file-pick-btn');
        const fileInput = this.elements.hubOverlayBody.querySelector('#hub-social-file-input');
        const input = this.elements.hubOverlayBody.querySelector('#hub-social-chat-input');
        sendBtn?.addEventListener('click', () => this.sendHubSocialMessage());
        sendFileBtn?.addEventListener('click', () => this.sendHubSocialFile());
        pickFileBtn?.addEventListener('click', () => fileInput?.click());
        fileInput?.addEventListener('change', () => this.updateHubSocialFileSelectionLabel());
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendHubSocialMessage();
            }
        });

        await this.renderHubSocialConversation();
    },

    async handleHubSocialAction(action, element) {
        const markBusy = () => {
            element.disabled = true;
            element.dataset.prevText = element.textContent || '';
            element.textContent = '처리중...';
        };
        const restoreBusy = () => {
            element.disabled = false;
            element.textContent = element.dataset.prevText || element.textContent || '';
        };

        try {
            if (action === 'accept') {
                const friendshipId = Number(element.dataset.friendshipId || 0);
                if (!friendshipId) return;
                markBusy();
                await this.requestJson('/api/friends/accept', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ friendship_id: friendshipId })
                });
                await this.renderHubSocialPanel();
                return;
            }

            if (action === 'reject') {
                const friendshipId = Number(element.dataset.friendshipId || 0);
                if (!friendshipId) return;
                markBusy();
                await this.requestJson('/api/friends/reject', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ friendship_id: friendshipId })
                });
                await this.renderHubSocialPanel();
                return;
            }

            if (action === 'remove-friend') {
                const targetId = Number(element.dataset.targetId || 0);
                if (!targetId) return;
                if (!confirm('동맹을 해제하시겠습니까?')) return;
                markBusy();
                await this.requestJson(`/api/friends/${targetId}`, {
                    method: 'DELETE'
                });
                if (this.hubSocialCurrentChatId === targetId) {
                    this.hubSocialCurrentChatId = null;
                    this.hubSocialCurrentChatNickname = '';
                }
                await this.renderHubSocialPanel();
                return;
            }

            if (action === 'open-chat') {
                const userId = Number(element.dataset.chatUserId || 0);
                if (!userId) return;
                this.hubSocialCurrentChatId = userId;
                this.hubSocialCurrentChatNickname = String(element.dataset.chatUserName || '');
                await this.renderHubSocialPanel();
                return;
            }
        } catch (err) {
            alert(err?.message || '소셜 작업 중 오류가 발생했습니다.');
            restoreBusy();
        }
    },

    async renderHubSocialConversation() {
        const titleEl = this.elements.hubOverlayBody?.querySelector('#hub-social-chat-title');
        const listEl = this.elements.hubOverlayBody?.querySelector('#hub-social-messages');
        const sendBtn = this.elements.hubOverlayBody?.querySelector('#hub-social-send-btn');
        const sendFileBtn = this.elements.hubOverlayBody?.querySelector('#hub-social-send-file-btn');
        const fileInput = this.elements.hubOverlayBody?.querySelector('#hub-social-file-input');

        if (!titleEl || !listEl || !sendBtn || !sendFileBtn || !fileInput) return;

        const targetId = Number(this.hubSocialCurrentChatId || 0);
        if (!targetId) {
            titleEl.textContent = '대화 상대를 선택하세요';
            listEl.innerHTML = '<div class="hub-social-empty-chat">메시지 내역이 없습니다.</div>';
            sendBtn.disabled = true;
            sendFileBtn.disabled = true;
            fileInput.disabled = true;
            return;
        }

        sendBtn.disabled = false;
        sendFileBtn.disabled = false;
        fileInput.disabled = false;
        titleEl.textContent = `${this.hubSocialCurrentChatNickname || '대화'}와의 대화`;
        listEl.innerHTML = '<div class="hub-social-empty-chat">메시지 불러오는 중...</div>';

        const rows = await this.requestJson(`/api/messages/conversation/${targetId}`);
        const messages = Array.isArray(rows) ? rows : [];

        if (!messages.length) {
            listEl.innerHTML = '<div class="hub-social-empty-chat">아직 주고받은 메시지가 없습니다.</div>';
            return;
        }

        listEl.innerHTML = messages.map((m) => {
            const mine = !!m?.is_mine;
            const content = this.escapeHtml(m?.content || '');
            const ts = m?.created_at ? new Date(m.created_at).toLocaleString('ko-KR', {
                month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '-';

            let fileHtml = '';
            if (m?.file_path) {
                const filename = String(m.file_path).split('/').pop() || '';
                if (filename) {
                    fileHtml = `<a class="hub-social-file-link" href="/api/messages/file/${encodeURIComponent(filename)}" target="_blank" rel="noopener">첨부파일 보기</a>`;
                }
            }

            return `<div class="hub-social-msg ${mine ? 'mine' : 'other'}">
                <div class="hub-social-msg-bubble">
                    <div>${content}</div>
                    ${fileHtml}
                </div>
                <div class="hub-social-msg-time">${ts}</div>
            </div>`;
        }).join('');

        listEl.scrollTop = listEl.scrollHeight;

        // The conversation API marks incoming messages as read.
        // Refresh preview/unread badges right away so the UI reflects that state.
        if (this.activeHubOverlay === 'social') {
            this.refreshHubSocialConversationPreview().catch(() => {});
        }
    },

    buildHubSocialConvoPreviewHtml(convoList) {
        const rows = Array.isArray(convoList) ? convoList : [];
        if (!rows.length) {
            return '<li class="hub-apply-empty">대화 내역이 없습니다.</li>';
        }

        return rows.slice(0, 10).map((c) => {
            const userId = Number(c?.other_user || 0);
            const nickRaw = c?.nickname || '익명';
            const nick = this.escapeHtml(nickRaw);
            const skinPill = this.buildSkinPillHtml(c?.balloon_skin || 'default');
            const msg = this.escapeHtml(c?.last_msg || '대화 내역 없음');
            const activeClass = this.hubSocialCurrentChatId === userId ? 'active' : '';
            const unreadBadge = Number(c?.unread_count || 0) > 0 ? `<em>${Math.min(99, Number(c.unread_count))}</em>` : '';
            return `<li class="hub-social-convo-item ${activeClass}">
                <button type="button" class="hub-social-convo-main" data-social-act="open-chat" data-chat-user-id="${userId}" data-chat-user-name="${nick}">
                    <strong>${nick} ${skinPill}</strong>
                    <span>${msg}</span>
                </button>
                ${unreadBadge}
            </li>`;
        }).join('');
    },

    async refreshHubSocialConversationPreview() {
        if (this.activeHubOverlay !== 'social') return;
        const body = this.elements.hubOverlayBody;
        if (!body) return;

        const convoListEl = body.querySelector('#hub-social-convo-list');
        const unreadEl = body.querySelector('#hub-social-unread-count');
        if (!convoListEl) return;

        const [conversations, unreadCount] = await Promise.all([
            this.requestJson('/api/messages/conversations'),
            this.requestJson('/api/messages/unread-count')
        ]);

        const convoList = Array.isArray(conversations) ? conversations : [];
        if (!this.hubSocialCurrentChatId && convoList[0]?.other_user) {
            this.hubSocialCurrentChatId = Number(convoList[0].other_user) || null;
            this.hubSocialCurrentChatNickname = String(convoList[0].nickname || '');
        }

        convoListEl.innerHTML = this.buildHubSocialConvoPreviewHtml(convoList);
        if (unreadEl) unreadEl.textContent = `${Number(unreadCount?.count || 0)}개`;

        convoListEl.querySelectorAll('[data-social-act="open-chat"]').forEach((el) => {
            el.addEventListener('click', async () => {
                await this.handleHubSocialAction('open-chat', el);
            });
        });
    },

    updateHubSocialFileSelectionLabel() {
        const fileInput = this.elements.hubOverlayBody?.querySelector('#hub-social-file-input');
        const nameEl = this.elements.hubOverlayBody?.querySelector('#hub-social-file-name');
        if (!fileInput || !nameEl) return;
        const file = fileInput.files?.[0];
        if (!file) {
            nameEl.textContent = '선택된 파일 없음';
            return;
        }
        const sizeKb = Math.max(1, Math.round((Number(file.size || 0) / 1024)));
        nameEl.textContent = `${file.name} (${sizeKb}KB)`;
    },

    async sendHubSocialMessage() {
        const targetId = Number(this.hubSocialCurrentChatId || 0);
        if (!targetId) {
            alert('먼저 대화 상대를 선택하세요.');
            return;
        }

        const input = this.elements.hubOverlayBody?.querySelector('#hub-social-chat-input');
        const sendBtn = this.elements.hubOverlayBody?.querySelector('#hub-social-send-btn');
        if (!input || !sendBtn) return;

        const content = String(input.value || '').trim();
        if (!content) return;

        sendBtn.disabled = true;
        const prevText = sendBtn.textContent;
        sendBtn.textContent = '전송중...';

        try {
            await this.requestJson('/api/messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receiver_id: targetId, content })
            });
            input.value = '';
            await this.renderHubSocialConversation();
            await this.refreshHubSocialConversationPreview();
        } catch (err) {
            alert(err?.message || '메시지 전송에 실패했습니다.');
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = prevText || '보내기';
        }
    },

    async sendHubSocialFile() {
        const targetId = Number(this.hubSocialCurrentChatId || 0);
        if (!targetId) {
            alert('먼저 대화 상대를 선택하세요.');
            return;
        }

        const fileInput = this.elements.hubOverlayBody?.querySelector('#hub-social-file-input');
        const sendFileBtn = this.elements.hubOverlayBody?.querySelector('#hub-social-send-file-btn');
        const textInput = this.elements.hubOverlayBody?.querySelector('#hub-social-chat-input');
        if (!fileInput || !sendFileBtn) return;

        const file = fileInput.files?.[0];
        if (!file) {
            alert('전송할 파일을 먼저 선택하세요.');
            return;
        }

        const formData = new FormData();
        formData.append('receiver_id', String(targetId));
        formData.append('content', String(textInput?.value || '').trim());
        formData.append('file', file);

        sendFileBtn.disabled = true;
        const prevText = sendFileBtn.textContent;
        sendFileBtn.textContent = '업로드중...';

        try {
            await this.requestJson('/api/messages/send-file', {
                method: 'POST',
                body: formData
            });
            fileInput.value = '';
            this.updateHubSocialFileSelectionLabel();
            if (textInput) textInput.value = '';
            await this.renderHubSocialConversation();
            await this.refreshHubSocialConversationPreview();
        } catch (err) {
            alert(err?.message || '파일 전송에 실패했습니다.');
        } finally {
            sendFileBtn.disabled = false;
            sendFileBtn.textContent = prevText || '파일 전송';
        }
    },

    async renderHubNotifPanel() {
        if (!this.elements.hubOverlayBody || !this.elements.hubOverlayConfirmBtn) return;

        this.elements.hubOverlayConfirmBtn.textContent = '닫기';
        this.elements.hubOverlayBody.innerHTML = '<div class="hub-apply-loading">불러오는 중...</div>';

        const [notifData, todayData, totalData] = await Promise.all([
            this.requestJson('/api/notifications'),
            this.requestJson('/api/ranking/today'),
            this.requestJson('/api/ranking')
        ]);

        const notifications = Array.isArray(notifData?.notifications) ? notifData.notifications : [];
        const unread = Number(notifData?.unread || 0);
        const todayRows = Array.isArray(todayData?.ranking) ? todayData.ranking : [];
        const totalRows = Array.isArray(totalData?.ranking) ? totalData.ranking : [];
        const activeRows = this.hubNotifRankTab === 'total' ? totalRows : todayRows;

        const notifHtml = notifications.length
            ? notifications.slice(0, 12).map((n) => {
                const text = this.escapeHtml(n?.message || '알림');
                const ts = n?.created_at ? new Date(n.created_at).toLocaleString('ko-KR', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                }) : '-';
                const unreadClass = n?.is_read ? '' : 'unread';
                return `<li class="hub-notif-item ${unreadClass}">
                    <div class="hub-notif-msg">${text}</div>
                    <div class="hub-notif-time">${ts}</div>
                </li>`;
            }).join('')
            : '<li class="hub-apply-empty">알림이 없습니다.</li>';

        const rankHtml = activeRows.length
            ? activeRows.slice(0, 20).map((u, idx) => {
                const nick = this.escapeHtml(u?.display_nickname || u?.nickname || '익명');
                const univ = this.escapeHtml(u?.university || '소속 미설정');
                const metric = this.hubNotifRankTab === 'total'
                    ? this.formatDuration(Number(u?.total_sec || 0))
                    : this.formatDuration(Number(u?.today_sec || 0));
                return `<li class="hub-rank-item">
                    <span class="hub-rank-num">${idx + 1}</span>
                    <div class="hub-rank-main">
                        <strong>${nick}</strong>
                        <span>${univ}</span>
                    </div>
                    <span class="hub-rank-val">${metric}</span>
                </li>`;
            }).join('')
            : '<li class="hub-apply-empty">랭킹 데이터가 없습니다.</li>';

        this.elements.hubOverlayBody.innerHTML = `
            <section class="hub-notif-wrap">
                <div class="hub-notif-summary">
                    <div class="hub-shop-meta-row"><span>읽지 않은 알림</span><strong>${unread}개</strong></div>
                    <div class="hub-shop-actions-row">
                        <button type="button" id="hub-notif-refresh-btn" class="home-refresh-btn">새로고침</button>
                        <button type="button" id="hub-notif-readall-btn" class="btn-primary home-start-btn">전체 읽음</button>
                    </div>
                </div>

                <div class="hub-notif-grid">
                    <section class="hub-notif-panel">
                        <h4>알림</h4>
                        <ul class="hub-notif-list">${notifHtml}</ul>
                    </section>

                    <section class="hub-notif-panel">
                        <div class="hub-notif-rank-head">
                            <h4>랭킹</h4>
                            <div class="hub-notif-rank-tabs">
                                <button type="button" class="hub-notif-rank-tab ${this.hubNotifRankTab === 'today' ? 'active' : ''}" data-rank-tab="today">오늘</button>
                                <button type="button" class="hub-notif-rank-tab ${this.hubNotifRankTab === 'total' ? 'active' : ''}" data-rank-tab="total">누적</button>
                            </div>
                        </div>
                        <ul class="hub-rank-list">${rankHtml}</ul>
                    </section>
                </div>
            </section>
        `;

        this.elements.hubOverlayBody.querySelector('#hub-notif-refresh-btn')?.addEventListener('click', () => {
            this.renderHubNotifPanel().catch((err) => {
                this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '새로고침 실패')}</div>`;
            });
        });

        this.elements.hubOverlayBody.querySelector('#hub-notif-readall-btn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            const prev = btn.textContent;
            btn.disabled = true;
            btn.textContent = '처리중...';
            try {
                await this.requestJson('/api/notifications/read-all', { method: 'POST' });
                await this.renderHubNotifPanel();
            } catch (err) {
                alert(err?.message || '읽음 처리 중 오류가 발생했습니다.');
                btn.disabled = false;
                btn.textContent = prev;
            }
        });

        this.elements.hubOverlayBody.querySelectorAll('[data-rank-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const tab = String(btn.dataset.rankTab || 'today');
                this.hubNotifRankTab = tab === 'total' ? 'total' : 'today';
                this.renderHubNotifPanel().catch((err) => {
                    this.elements.hubOverlayBody.innerHTML = `<div class="hub-apply-error">${this.escapeHtml(err?.message || '랭킹 로드 실패')}</div>`;
                });
            });
        });
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
                const jeongsi = dept?.admissions?.정시 || {};
                const standardCut = Number(jeongsi.표준점수합);
                const convertedCut = Number(jeongsi.환산컷);
                const candidates = [];
                if (Number.isFinite(standardCut)) {
                    candidates.push({ cut: standardCut, label: '표준점수합' });
                }
                if (Number.isFinite(convertedCut)) {
                    candidates.push({ cut: convertedCut, label: '환산컷' });
                }
                if (candidates.length === 0) return null;

                const bestCut = candidates.sort((a, b) => Math.abs(total - a.cut) - Math.abs(total - b.cut))[0];
                const cut = bestCut.cut;
                const gap = Math.round((total - cut) * 100) / 100;
                return {
                    name: dept.name,
                    category: dept.category,
                    cut,
                    cutLabel: bestCut.label,
                    gap,
                    absGap: Math.abs(gap)
                };
            })
            .filter(Boolean)
            .sort((a, b) => a.absGap - b.absGap)
            .slice(0, 5);

        if (rows.length === 0) {
            return selectedCategory
                ? `<div class="scorecalc-meta">${this.escapeHtml(selectedCategory)} 카테고리에는 정시 컷 데이터(표준점수합/환산컷)가 없습니다.</div>`
                : '<div class="scorecalc-meta">학과별 정시 컷 데이터(표준점수합/환산컷)가 없어 비교 결과를 표시할 수 없습니다.</div>';
        }

        const listHtml = rows.map((row) => {
            const state = row.gap >= 0 ? '여유' : '부족';
            const cls = row.gap >= 0 ? 'pos' : 'neg';
            const gapText = `${row.gap >= 0 ? '+' : ''}${row.gap.toFixed(2)}`;
            return `<li>
                <span>${this.escapeHtml(row.name)} (${this.escapeHtml(row.category || '기타')})</span>
                <span>${row.cutLabel} ${row.cut.toFixed(2)} / <b class="${cls}">${gapText} ${state}</b></span>
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
        if (!isHidden) {
            this.handleAddSubject();
            return;
        }
        row.classList.remove('hidden');
        this.elements.subjectAddBtn.textContent = '확인';
        this.elements.subjectInput?.focus();
    },

    closeSubjectAddRow() {
        const row = document.getElementById('subject-add-row');
        if (row) row.classList.add('hidden');
        if (this.elements.subjectInput) this.elements.subjectInput.value = '';
        if (this.elements.subjectAddBtn) this.elements.subjectAddBtn.textContent = '+ 과목';
    },

    async handleAddSubject() {
        const name = (this.elements.subjectInput.value || '').trim();
        if (!name) {
            alert('과목명을 입력하세요.');
            this.elements.subjectInput?.focus();
            return;
        }
        try {
            const added = await StorageManager.addSubject(name);
            this.subjects = await StorageManager.fetchSubjects();
            this.renderSubjectOptions(added?.id);
            this.closeSubjectAddRow();
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
        this.renderPlannerSubjectSelect();
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

    async handleStudyPlanSyncClick() {
        if (!Array.isArray(this.studyPlanDrafts) || this.studyPlanDrafts.length === 0) {
            alert('반영할 플랜 초안이 없습니다.');
            return;
        }

        const targetDate = this.plannerDate || this.calendarSelectedDate || this.toLocalYmd(new Date());

        try {
            const createdCount = await this.persistStudyPlanDrafts(targetDate);
            if (createdCount <= 0) {
                alert('배치할 수 있는 일정이 없습니다. 시간을 비우거나 날짜를 바꿔보세요.');
                return;
            }
            alert(`${createdCount}개의 계획을 ${targetDate} 일정에 반영했습니다.`);
        } catch (e) {
            alert(e.message || '플랜 반영 실패');
        }
    },

    async persistStudyPlanDrafts(targetDate = this.toLocalYmd(new Date()), options = {}) {
        if (!Array.isArray(this.studyPlanDrafts) || this.studyPlanDrafts.length === 0) return 0;

        const focusDate = this.normalizeDateKey(targetDate) || this.toLocalYmd(new Date());
        const now = new Date();
        const snap = this.timetableConfig.snapMinute;
        const dayStart = this.timetableConfig.dayStartMinute;
        const dayEnd = this.timetableConfig.dayEndMinute;
        const isToday = focusDate === this.toLocalYmd(now);
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        const weekData = await StorageManager.fetchWeekCalendar(0, focusDate).catch(() => null);
        const existingPlans = (weekData?.plans || [])
            .filter((plan) => this.normalizeDateKey(plan.plan_date) === focusDate)
            .sort((a, b) => (parseInt(a.start_minute, 10) || 0) - (parseInt(b.start_minute, 10) || 0));

        let cursor = existingPlans.reduce((maxMinute, plan) => {
            const endMinute = parseInt(plan.end_minute, 10) || 0;
            return Math.max(maxMinute, endMinute);
        }, isToday ? Math.ceil(nowMinute / snap) * snap : Math.max(dayStart, 9 * 60));

        cursor = Math.max(dayStart, Math.min(cursor, dayEnd - snap));

        let createdCount = 0;

        for (const draft of this.studyPlanDrafts) {
            if (cursor >= dayEnd) break;
            const duration = Math.max(snap, Math.min(300, parseInt(draft.durationMin, 10) || this.getDefaultPlanDuration()));
            const startMinute = Math.max(dayStart, Math.min(cursor, dayEnd - snap));
            const endMinute = Math.max(startMinute + snap, Math.min(dayEnd, startMinute + duration));
            const note = draft.note ? `${draft.topic} | ${draft.note}` : draft.topic;

            if (endMinute <= startMinute) break;

            await StorageManager.addPlan({
                subject_id: draft.subjectId,
                plan_date: focusDate,
                start_time: this.minuteToTime(startMinute),
                end_time: this.minuteToTime(endMinute),
                note
            });

            cursor = endMinute;
            createdCount += 1;
        }

        this.studyPlanDrafts = [];
        this.renderStudyPlanDrafts();

        this.plannerDate = focusDate;
        this.calendarSelectedDate = focusDate;
        this.calendarAnchorDate = focusDate;
        this.updateStudyPlanSyncMeta();

        if (options.reloadViews !== false) {
            await this.loadPlannerData();
            await this.loadWeekCalendar(0, {
                anchorDate: focusDate,
                selectedDate: focusDate,
                syncPlanner: false
            });
        }

        return createdCount;
    },

    async loadWeekCalendar(offset = 0, options = {}) {
        this.weekOffset = offset;
        const anchorDate = this.normalizeDateKey(options.anchorDate) || this.calendarAnchorDate || this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date());
        const selectedDate = this.normalizeDateKey(options.selectedDate) || this.calendarSelectedDate || this.plannerDate || anchorDate;
        this.calendarAnchorDate = anchorDate;

        try {
            this.weekData = await StorageManager.fetchWeekCalendar(this.weekOffset, anchorDate);
            if (Array.isArray(this.weekData.subjects)) {
                this.subjects = this.weekData.subjects;
                this.renderSubjectOptions(this.elements.subjectSelect.value || this.subjects[0]?.id);
            }
            this.calendarSelectedDate = this.resolveWeekDate(selectedDate);
            if (this.elements.planDate) this.elements.planDate.value = this.calendarSelectedDate;
            if (options.syncPlanner !== false) this.plannerDate = this.calendarSelectedDate;
            this.renderWeekLabel();
            this.renderCalendarTimeline();
            this.renderCalendarDayPanel();
            this.syncEditingPlanSelection();
            this.updateStudyPlanSyncMeta();
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
            const isSelected = key === this.calendarSelectedDate;
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
                `<button type="button" class="tt-day-head tt-day-head-btn${isSelected ? ' is-selected' : ''}" data-date="${key}">
                    <div class="tt-day-name">${dayNames[i]}</div>
                    <div class="tt-day-date">${key}</div>
                    <div class="tt-day-record">완료 ${recordDuration}</div>
                </button>`
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
                    <div class="plan-action-row">
                        <button class="plan-edit-btn" data-plan-id="${p.id}" type="button">수정</button>
                        <button class="plan-delete-btn" data-plan-id="${p.id}" type="button">삭제</button>
                    </div>
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
                `<div class="tt-day-col${isSelected ? ' is-selected' : ''}" data-date="${key}" style="height:${timelineHeight}px">
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

    getScheduleDayData(dateText, sourceData = this.weekData) {
        const dateKey = this.normalizeDateKey(dateText);
        if (!dateKey || !sourceData) {
            return { dateKey: this.normalizeDateKey(dateText), plans: [], records: [], plannedMin: 0, actualSec: 0 };
        }

        const plans = (sourceData.plans || []).filter((plan) => this.normalizeDateKey(plan.plan_date) === dateKey);
        const records = (sourceData.records || []).filter((record) => this.normalizeDateKey(record.record_date || record.created_at) === dateKey);
        const plannedMin = plans.reduce((acc, plan) => {
            const startMinute = parseInt(plan.start_minute, 10) || 0;
            const endMinute = parseInt(plan.end_minute, 10) || 0;
            return acc + Math.max(0, endMinute - startMinute);
        }, 0);
        const actualSec = records.reduce((acc, record) => acc + (parseInt(record.duration_sec, 10) || 0), 0);

        return { dateKey, plans, records, plannedMin, actualSec };
    },

    resolveWeekDate(dateText) {
        const normalized = this.normalizeDateKey(dateText);
        const weekStart = this.weekData?.week?.start_date;
        if (!weekStart) return normalized || this.toLocalYmd(new Date());
        if (normalized && this.isDateInDisplayedWeek(normalized)) return normalized;
        return weekStart;
    },

    isDateInDisplayedWeek(dateText) {
        const normalized = this.normalizeDateKey(dateText);
        const weekStart = this.weekData?.week?.start_date;
        if (!normalized || !weekStart) return false;
        const start = this.parseLocalDate(weekStart);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        const date = this.parseLocalDate(normalized);
        return date >= start && date <= end;
    },

    selectCalendarDate(dateText, options = {}) {
        const normalized = this.resolveWeekDate(dateText);
        this.calendarSelectedDate = normalized;
        if (this.elements.planDate) this.elements.planDate.value = normalized;
        if (options.syncPlanner !== false) this.plannerDate = normalized;
        if (options.renderTimeline !== false) this.renderCalendarTimeline();
        this.renderCalendarDayPanel();
        this.updateStudyPlanSyncMeta();
    },

    renderCalendarDayPanel() {
        if (!this.elements.calendarDayPanel) return;

        const dayData = this.getScheduleDayData(this.calendarSelectedDate, this.weekData);
        const selectedLabel = this.formatLongDate(dayData.dateKey || this.calendarSelectedDate || this.toLocalYmd(new Date()));
        const summaryText = dayData.plans.length > 0 || dayData.records.length > 0
            ? `계획 ${this.formatDuration(dayData.plannedMin * 60)} · 실제 ${this.formatDuration(dayData.actualSec)}`
            : '아직 일정이나 공부 기록이 없습니다.';

        if (this.elements.calendarSelectedDateLabel) this.elements.calendarSelectedDateLabel.textContent = selectedLabel;
        if (this.elements.calendarSelectedDateSummary) this.elements.calendarSelectedDateSummary.textContent = summaryText;

        const planItems = dayData.plans.length > 0
            ? dayData.plans.map((plan) => {
                const color = this.getSubjectColor(plan.subject_id, plan.subject_name);
                return `<div class="calendar-day-item" style="--day-item-color:${color}">
                    <div class="calendar-day-item-main">
                        <div class="calendar-day-item-title">${this.escapeHtml(plan.subject_name || '미지정')}</div>
                        <div class="calendar-day-item-meta">${this.minuteToTime(parseInt(plan.start_minute, 10) || 0)} - ${this.minuteToTime(parseInt(plan.end_minute, 10) || 0)}</div>
                        ${plan.note ? `<div class="calendar-day-item-note">${this.escapeHtml(plan.note)}</div>` : ''}
                    </div>
                    <div class="calendar-day-item-actions">
                        <button type="button" class="calendar-day-edit" data-plan-id="${plan.id}">수정</button>
                        <button type="button" class="calendar-day-delete" data-plan-id="${plan.id}">삭제</button>
                    </div>
                </div>`;
            }).join('')
            : '<div class="calendar-day-empty">등록된 계획이 없습니다. 아래에서 바로 추가할 수 있습니다.</div>';

        const recordItems = dayData.records.length > 0
            ? dayData.records.map((record) => {
                const createdAt = new Date(record.created_at);
                const clockText = `${String(createdAt.getHours()).padStart(2, '0')}:${String(createdAt.getMinutes()).padStart(2, '0')}`;
                return `<div class="calendar-day-record">
                    <div class="calendar-day-record-title">${this.escapeHtml(record.subject_name || '미지정')}</div>
                    <div class="calendar-day-record-meta">${this.formatDuration(parseInt(record.duration_sec, 10) || 0)} · ${clockText}</div>
                </div>`;
            }).join('')
            : '<div class="calendar-day-empty">이 날짜의 실제 공부 기록이 없습니다.</div>';

        this.elements.calendarDayPanel.innerHTML = `
            <div class="calendar-day-summary-row">
                <div class="calendar-day-stat-card">
                    <span class="calendar-day-stat-label">계획 수</span>
                    <strong class="calendar-day-stat-value">${dayData.plans.length}개</strong>
                </div>
                <div class="calendar-day-stat-card">
                    <span class="calendar-day-stat-label">계획 시간</span>
                    <strong class="calendar-day-stat-value">${this.formatDuration(dayData.plannedMin * 60)}</strong>
                </div>
                <div class="calendar-day-stat-card">
                    <span class="calendar-day-stat-label">실제 공부</span>
                    <strong class="calendar-day-stat-value">${this.formatDuration(dayData.actualSec)}</strong>
                </div>
            </div>
            <div class="calendar-day-columns">
                <section class="calendar-day-column">
                    <div class="calendar-day-column-head">
                        <h4>계획</h4>
                        <button type="button" class="calendar-day-link-btn" data-action="open-planner">플래너 열기</button>
                    </div>
                    <div class="calendar-day-list">${planItems}</div>
                </section>
                <section class="calendar-day-column">
                    <div class="calendar-day-column-head">
                        <h4>실제 공부</h4>
                        <span class="calendar-day-column-sub">기록 기반</span>
                    </div>
                    <div class="calendar-day-list">${recordItems}</div>
                </section>
            </div>`;
    },

    handleCalendarTimelineClick(event) {
        const editBtn = event.target.closest('.plan-edit-btn[data-plan-id]');
        if (editBtn) {
            const planId = parseInt(editBtn.getAttribute('data-plan-id'), 10);
            if (planId) this.startEditingPlan(planId);
            return;
        }

        if (event.target.closest('.plan-delete-btn[data-plan-id]')) {
            this.handlePlanDelete(event);
            return;
        }

        const dateTrigger = event.target.closest('[data-date]');
        const dateText = dateTrigger?.getAttribute('data-date');
        if (dateText) {
            this.selectCalendarDate(dateText);
        }
    },

    handleCalendarDayPanelClick(event) {
        const editBtn = event.target.closest('.calendar-day-edit[data-plan-id]');
        if (editBtn) {
            const planId = parseInt(editBtn.getAttribute('data-plan-id'), 10);
            if (planId) this.startEditingPlan(planId);
            return;
        }

        if (event.target.closest('.calendar-day-delete[data-plan-id]')) {
            this.handlePlanDelete(event);
            return;
        }

        if (event.target.closest('[data-action="open-planner"]')) {
            this.switchTab('planner');
        }
    },

    handlePlanPointerDown(event) {
        const eventBox = event.target.closest('.tt-event');
        if (!eventBox) return;
        if (event.target.closest('.plan-edit-btn')) return;
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
            await this.loadWeekCalendar(0, {
                anchorDate: nextDate,
                selectedDate: nextDate,
                syncPlanner: false
            });
        } catch (e) {
            alert(e.message || '타임라인 수정 실패');
            await this.loadWeekCalendar(0, {
                anchorDate: ctx.planDate,
                selectedDate: ctx.planDate,
                syncPlanner: false
            });
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

    shiftDateByDays(value, diffDays) {
        const date = this.parseLocalDate(value);
        date.setDate(date.getDate() + diffDays);
        return this.toLocalYmd(date);
    },

    formatLongDate(value) {
        const date = this.parseLocalDate(value);
        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
        return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${weekdays[date.getDay()]}요일`;
    },

    updateStudyPlanSyncMeta() {
        if (!this.elements.studyPlanSyncMeta) return;
        const targetDate = this.plannerDate || this.calendarSelectedDate || this.toLocalYmd(new Date());
        this.elements.studyPlanSyncMeta.textContent = `${this.formatLongDate(targetDate)} 기준으로 일정이 배치됩니다.`;
    },

    goToTodaySchedule() {
        const today = this.toLocalYmd(new Date());
        this.plannerDate = today;
        this.calendarSelectedDate = today;
        this.calendarAnchorDate = today;
        this.loadWeekCalendar(0, {
            anchorDate: today,
            selectedDate: today,
            syncPlanner: false
        }).catch(() => {});
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
            await this.loadWeekCalendar(0, {
                anchorDate: payload.beforePayload.plan_date,
                selectedDate: payload.beforePayload.plan_date,
                syncPlanner: false
            });
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
            if (this.editingPlanId) {
                await StorageManager.updatePlan(this.editingPlanId, payload);
            } else {
                await StorageManager.addPlan(payload);
            }
            this.clearPlanFormEditingState(payload.plan_date);
            await this.loadWeekCalendar(0, {
                anchorDate: payload.plan_date,
                selectedDate: payload.plan_date,
                syncPlanner: false
            });
        } catch (e) {
            alert(e.message || '타임라인 추가 실패');
        }
    },

    async handlePlanDelete(event) {
        const btn = event.target.closest('.plan-delete-btn[data-plan-id], .calendar-day-delete[data-plan-id]');
        if (!btn) return;
        const planId = parseInt(btn.getAttribute('data-plan-id'), 10);
        if (!planId) return;
        if (!confirm('이 타임라인 항목을 삭제할까요?')) return;
        try {
            await StorageManager.deletePlan(planId);
            if (Number(this.editingPlanId) === Number(planId)) {
                this.clearPlanFormEditingState();
            }
            const fallbackDate = this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date());
            await this.loadWeekCalendar(0, {
                anchorDate: fallbackDate,
                selectedDate: fallbackDate,
                syncPlanner: false
            });
        } catch (e) {
            alert(e.message || '삭제 실패');
        }
    },

    minuteToTime(minute) {
        const h = Math.floor((minute || 0) / 60);
        const m = (minute || 0) % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    startEditingPlan(planId, options = {}) {
        const plan = this.findPlanById(planId);
        if (!plan) return;

        const planDate = this.normalizeDateKey(plan.plan_date) || this.calendarSelectedDate || this.toLocalYmd(new Date());
        this.editingPlanId = Number(plan.id);
        this.calendarSelectedDate = planDate;
        this.plannerDate = planDate;
        this.calendarAnchorDate = planDate;

        if (this.elements.planSubjectSelect) this.elements.planSubjectSelect.value = String(plan.subject_id || '');
        if (this.elements.planDate) this.elements.planDate.value = planDate;
        if (this.elements.planStartTime) this.elements.planStartTime.value = this.minuteToTime(parseInt(plan.start_minute, 10) || 0);
        if (this.elements.planEndTime) this.elements.planEndTime.value = this.minuteToTime(parseInt(plan.end_minute, 10) || 0);
        if (this.elements.planNote) this.elements.planNote.value = plan.note || '';
        if (this.elements.planSubmitBtn) this.elements.planSubmitBtn.textContent = '일정 수정 저장';
        if (this.elements.planCancelBtn) this.elements.planCancelBtn.classList.remove('hidden');
        if (this.elements.planFormStatus) {
            this.elements.planFormStatus.textContent = `${plan.subject_name || '미지정'} 일정을 편집 중입니다. 과목, 날짜, 시간, 메모를 수정할 수 있습니다.`;
        }
        this.updateStudyPlanSyncMeta();

        if (options.switchTab !== false && this.currentTab !== 'calendar') {
            this.switchTab('calendar');
            return;
        }

        this.renderCalendarTimeline();
        this.renderCalendarDayPanel();
    },

    clearPlanFormEditingState(nextDate = null) {
        this.editingPlanId = null;
        const targetDate = this.normalizeDateKey(nextDate) || this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date());
        if (this.elements.planDate) this.elements.planDate.value = targetDate;
        if (this.elements.planStartTime && !this.elements.planStartTime.value) this.elements.planStartTime.value = '09:00';
        if (this.elements.planEndTime && !this.elements.planEndTime.value) this.elements.planEndTime.value = '11:00';
        if (this.elements.planNote) this.elements.planNote.value = '';
        if (this.elements.planSubmitBtn) this.elements.planSubmitBtn.textContent = '타임라인 추가';
        if (this.elements.planCancelBtn) this.elements.planCancelBtn.classList.add('hidden');
        if (this.elements.planFormStatus) {
            this.elements.planFormStatus.textContent = '주간 계획이나 수업 일정을 추가하고 드래그로 옮길 수 있습니다.';
        }
    },

    findPlanById(planId) {
        const numericId = Number(planId);
        return (this.weekData?.plans || []).find((plan) => Number(plan.id) === numericId)
            || (this.plannerData?.plans || []).find((plan) => Number(plan.id) === numericId)
            || null;
    },

    syncEditingPlanSelection() {
        if (!this.editingPlanId) return;
        const plan = this.findPlanById(this.editingPlanId);
        if (!plan) {
            this.clearPlanFormEditingState();
            return;
        }
        this.startEditingPlan(this.editingPlanId, { switchTab: false });
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
        this.renderHomeSkinSpot();
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
                `<span style="font-size:2.5rem;color:var(--accent)">+${gold.toLocaleString()}G</span><br>` +
                `<small>중도 중단 (경과 시간 인정 · 50% 지급)</small>`;
        } else {
            this.elements.resTitle.innerText   = '학습 실패';
            this.elements.resTitle.style.color = 'var(--accent)';
            this.elements.resLoot.innerHTML    =
                `<span style="color:var(--accent);font-size:1.1rem">이탈이 감지되었습니다.</span>`;
        }
    },

    // ─── PLANNER (10 Minutes Planner) ─────────────────────────────────────
    initPlanner() {
        this.plannerDate = this.calendarSelectedDate || this.plannerDate || this.toLocalYmd(new Date());
        this.bindPlannerEvents();
        this.loadPlannerDday();
        this.loadPlannerMemo();
        this.loadPlannerData();
        this.renderPlannerSubjectSelect();
    },

    _plannerEventsBound: false,
    bindPlannerEvents() {
        if (this._plannerEventsBound) return;
        this._plannerEventsBound = true;

        document.getElementById('planner-prev-day')?.addEventListener('click', () => {
            const d = this.parseLocalDate(this.plannerDate);
            d.setDate(d.getDate() - 1);
            this.plannerDate = this.toLocalYmd(d);
            this.calendarSelectedDate = this.plannerDate;
            this.updateStudyPlanSyncMeta();
            this.loadPlannerData();
            this.loadPlannerMemo();
        });
        document.getElementById('planner-next-day')?.addEventListener('click', () => {
            const d = this.parseLocalDate(this.plannerDate);
            d.setDate(d.getDate() + 1);
            this.plannerDate = this.toLocalYmd(d);
            this.calendarSelectedDate = this.plannerDate;
            this.updateStudyPlanSyncMeta();
            this.loadPlannerData();
            this.loadPlannerMemo();
        });

        document.getElementById('planner-dday-chip')?.addEventListener('click', () => {
            const setup = document.getElementById('planner-dday-setup');
            if (setup) setup.classList.toggle('hidden');
        });
        document.getElementById('planner-dday-save')?.addEventListener('click', () => this.savePlannerDday());
        document.getElementById('planner-memo-save')?.addEventListener('click', () => this.savePlannerMemo());

        document.getElementById('planner-add-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePlannerAddPlan();
        });

        // Set default times
        const startInput = document.getElementById('planner-add-start');
        const endInput = document.getElementById('planner-add-end');
        if (startInput && !startInput.value) startInput.value = '09:00';
        if (endInput && !endInput.value) endInput.value = '10:00';
    },

    renderPlannerSubjectSelect() {
        const sel = document.getElementById('planner-add-subject');
        if (!sel) return;
        if (!this.subjects.length) {
            sel.innerHTML = '<option value="">과목을 먼저 추가하세요</option>';
            return;
        }
        sel.innerHTML = this.subjects.map(s =>
            `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`
        ).join('');
    },

    loadPlannerDday() {
        const saved = localStorage.getItem('path_planner_dday');
        if (saved) {
            try {
                const dday = JSON.parse(saved);
                this.renderPlannerDday(dday);
            } catch (e) {}
        }
    },

    savePlannerDday() {
        const target = document.getElementById('planner-dday-target')?.value;
        const name = (document.getElementById('planner-dday-name')?.value || '').trim();
        if (!target) return;
        const dday = { target, name: name || 'D-DAY' };
        localStorage.setItem('path_planner_dday', JSON.stringify(dday));
        this.renderPlannerDday(dday);
        document.getElementById('planner-dday-setup')?.classList.add('hidden');
    },

    renderPlannerDday(dday) {
        const valEl = document.getElementById('planner-dday-value');
        const labelEl = document.querySelector('.planner-dday-label');
        if (!valEl || !dday?.target) return;

        const target = new Date(dday.target + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

        if (labelEl) labelEl.textContent = dday.name || 'D-DAY';
        if (diff === 0) {
            valEl.textContent = 'D-DAY';
        } else if (diff > 0) {
            valEl.textContent = `D-${diff}`;
        } else {
            valEl.textContent = `D+${Math.abs(diff)}`;
        }
    },

    loadPlannerMemo() {
        const memo = document.getElementById('planner-memo');
        if (!memo) return;
        const key = `path_planner_memo_${this.plannerDate}`;
        memo.value = localStorage.getItem(key) || '';
    },

    savePlannerMemo() {
        const memo = document.getElementById('planner-memo');
        if (!memo) return;
        const key = `path_planner_memo_${this.plannerDate}`;
        localStorage.setItem(key, memo.value);
        const btn = document.getElementById('planner-memo-save');
        if (btn) {
            btn.textContent = '저장됨 ✓';
            btn.classList.add('saved');
            setTimeout(() => { btn.textContent = '메모 저장'; btn.classList.remove('saved'); }, 1500);
        }
    },

    async loadPlannerData() {
        try {
            const weekData = await StorageManager.fetchWeekCalendar(0, this.plannerDate);
            this.plannerData = weekData;
            this.calendarSelectedDate = this.plannerDate;
            this.calendarAnchorDate = this.plannerDate;
            if (Array.isArray(weekData.subjects)) {
                this.subjects = weekData.subjects;
                this.renderPlannerSubjectSelect();
            }
            this.renderPlanner();
        } catch (e) {
            console.error('Planner load error:', e);
        }
    },

    renderPlanner() {
        this.renderPlannerDateTitle();
        this.renderPlannerDday(JSON.parse(localStorage.getItem('path_planner_dday') || 'null'));
        this.renderPlannerTimeline();
        this.renderPlannerSubjectSummary();
        this.renderPlannerStats();
    },

    renderPlannerDateTitle() {
        const el = document.getElementById('planner-date-title');
        if (!el) return;
        const d = this.parseLocalDate(this.plannerDate);
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        el.textContent = `${y}년 ${m}월 ${day}일 ${days[d.getDay()]}`;
    },

    _getPlannerDayData() {
        if (!this.plannerData) return { plans: [], records: [] };
        const dateKey = this.plannerDate;
        const plans = (this.plannerData.plans || []).filter(p => this.normalizeDateKey(p.plan_date) === dateKey);
        const records = (this.plannerData.records || []).filter(r => this.normalizeDateKey(r.record_date || r.created_at) === dateKey);
        return { plans, records };
    },

    renderPlannerTimeline() {
        const container = document.getElementById('planner-timeline');
        if (!container) return;

        const { plans, records } = this._getPlannerDayData();
        const dayStart = this.timetableConfig.dayStartMinute;
        const dayEnd = this.timetableConfig.dayEndMinute;
        const totalMinutes = dayEnd - dayStart;
        const hourHeight = 52;
        const timelineHeight = Math.floor((totalMinutes / 60) * hourHeight);

        // Now indicator
        const now = new Date();
        const todayKey = this.toLocalYmd(now);
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        let nowLine = '';
        if (this.plannerDate === todayKey && nowMinute >= dayStart && nowMinute <= dayEnd) {
            const nowTop = Math.floor(((nowMinute - dayStart) / totalMinutes) * timelineHeight);
            nowLine = `<div class="planner-now-line" style="top:${nowTop}px"><span class="planner-now-dot"></span></div>`;
        }

        // Hour grid
        const hours = [];
        for (let h = dayStart / 60; h <= dayEnd / 60; h++) {
            const top = (h - dayStart / 60) * hourHeight;
            hours.push(`<div class="planner-hour-row" style="top:${top}px">
                <span class="planner-hour-label">${String(h).padStart(2, '0')}</span>
                <div class="planner-hour-line"></div>
            </div>`);
        }

        // Plan blocks (left side)
        const planBlocks = plans.map(p => {
            const s = Math.max(dayStart, parseInt(p.start_minute, 10) || 0);
            const e = Math.min(dayEnd, parseInt(p.end_minute, 10) || 0);
            if (e <= s) return '';
            const top = Math.floor(((s - dayStart) / totalMinutes) * timelineHeight);
            const height = Math.max(20, Math.floor(((e - s) / totalMinutes) * timelineHeight));
            const color = this.getSubjectColor(p.subject_id, p.subject_name);
            return `<div class="planner-block planner-block-plan" style="top:${top}px;height:${height}px;--block-color:${color}" data-plan-id="${p.id}">
                <div class="planner-block-label">${this.escapeHtml(p.subject_name || '미지정')}</div>
                <div class="planner-block-time">${this.minuteToTime(s)}-${this.minuteToTime(e)}</div>
                ${p.note ? `<div class="planner-block-note">${this.escapeHtml(p.note)}</div>` : ''}
                <button class="planner-block-edit" data-plan-id="${p.id}" type="button">수정</button>
                <button class="planner-block-del" data-plan-id="${p.id}" type="button">×</button>
            </div>`;
        }).join('');

        // Actual study record blocks (right side) - approximate by created_at time
        const recordBlocks = records.map(r => {
            const sec = parseInt(r.duration_sec, 10) || 0;
            const createdAt = new Date(r.created_at);
            const endMin = createdAt.getHours() * 60 + createdAt.getMinutes();
            const startMin = Math.max(dayStart, endMin - Math.floor(sec / 60));
            const clampedEnd = Math.min(dayEnd, endMin);
            if (clampedEnd <= startMin) return '';
            const top = Math.floor(((startMin - dayStart) / totalMinutes) * timelineHeight);
            const height = Math.max(20, Math.floor(((clampedEnd - startMin) / totalMinutes) * timelineHeight));
            const color = this.getSubjectColor(r.subject_id, r.subject_name);
            const durText = this.formatDuration(sec);
            return `<div class="planner-block planner-block-actual" style="top:${top}px;height:${height}px;--block-color:${color}">
                <div class="planner-block-label">${this.escapeHtml(r.subject_name || '미지정')}</div>
                <div class="planner-block-time">${durText}</div>
            </div>`;
        }).join('');

        container.innerHTML = `
            <div class="planner-timeline-grid" style="height:${timelineHeight}px">
                ${hours.join('')}
                <div class="planner-col planner-col-plan" style="height:${timelineHeight}px">
                    <div class="planner-col-header">계획</div>
                    ${planBlocks}
                </div>
                <div class="planner-col planner-col-actual" style="height:${timelineHeight}px">
                    <div class="planner-col-header">실제</div>
                    ${recordBlocks}
                </div>
                ${nowLine}
            </div>`;

        // Bind delete buttons
        container.querySelectorAll('.planner-block-del').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const planId = parseInt(btn.dataset.planId, 10);
                if (!planId || !confirm('이 계획을 삭제할까요?')) return;
                try {
                    await StorageManager.deletePlan(planId);
                    await this.loadPlannerData();
                    await this.loadWeekCalendar(0, {
                        anchorDate: this.plannerDate,
                        selectedDate: this.plannerDate,
                        syncPlanner: false
                    });
                } catch (err) {
                    alert(err.message || '삭제 실패');
                }
            });
        });

        container.querySelectorAll('.planner-block-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const planId = parseInt(btn.dataset.planId, 10);
                if (!planId) return;
                this.startEditingPlan(planId);
            });
        });
    },

    renderPlannerSubjectSummary() {
        const chipsEl = document.getElementById('planner-subject-chips');
        if (!chipsEl) return;
        const { plans, records } = this._getPlannerDayData();

        const subjectMap = new Map();
        for (const p of plans) {
            const key = p.subject_id || p.subject_name || '미지정';
            if (!subjectMap.has(key)) {
                subjectMap.set(key, { name: p.subject_name || '미지정', id: p.subject_id, plannedMin: 0, actualSec: 0 });
            }
            const s = parseInt(p.start_minute, 10) || 0;
            const e = parseInt(p.end_minute, 10) || 0;
            subjectMap.get(key).plannedMin += Math.max(0, e - s);
        }
        for (const r of records) {
            const key = r.subject_id || r.subject_name || '미지정';
            if (!subjectMap.has(key)) {
                subjectMap.set(key, { name: r.subject_name || '미지정', id: r.subject_id, plannedMin: 0, actualSec: 0 });
            }
            subjectMap.get(key).actualSec += parseInt(r.duration_sec, 10) || 0;
        }

        if (subjectMap.size === 0) {
            chipsEl.innerHTML = '<div class="planner-empty-hint">과목별 데이터가 없습니다</div>';
            return;
        }

        chipsEl.innerHTML = Array.from(subjectMap.values()).map(s => {
            const color = this.getSubjectColor(s.id, s.name);
            const plannedText = s.plannedMin > 0 ? this.formatDuration(s.plannedMin * 60) : '-';
            const actualText = s.actualSec > 0 ? this.formatDuration(s.actualSec) : '-';
            return `<div class="planner-subject-chip" style="--chip-color:${color}">
                <div class="planner-chip-dot" style="background:${color}"></div>
                <span class="planner-chip-name">${this.escapeHtml(s.name)}</span>
                <span class="planner-chip-detail">계획 ${plannedText} · 실제 ${actualText}</span>
            </div>`;
        }).join('');
    },

    renderPlannerStats() {
        const { plans, records } = this._getPlannerDayData();
        let plannedMin = 0;
        for (const p of plans) {
            const s = parseInt(p.start_minute, 10) || 0;
            const e = parseInt(p.end_minute, 10) || 0;
            plannedMin += Math.max(0, e - s);
        }
        let actualSec = 0;
        for (const r of records) {
            actualSec += parseInt(r.duration_sec, 10) || 0;
        }
        const plannedSec = plannedMin * 60;
        const rate = plannedSec > 0 ? Math.min(100, Math.round((actualSec / plannedSec) * 100)) : 0;

        const elPlanned = document.getElementById('planner-stat-planned');
        const elActual = document.getElementById('planner-stat-actual');
        const elRate = document.getElementById('planner-stat-rate');
        if (elPlanned) elPlanned.textContent = this.formatDuration(plannedSec);
        if (elActual) elActual.textContent = this.formatDuration(actualSec);
        if (elRate) {
            elRate.textContent = plannedSec > 0 ? `${rate}%` : '-';
            elRate.classList.toggle('planner-rate-high', rate >= 80);
            elRate.classList.toggle('planner-rate-mid', rate >= 50 && rate < 80);
            elRate.classList.toggle('planner-rate-low', rate > 0 && rate < 50);
        }
    },

    async handlePlannerAddPlan() {
        const subjectId = parseInt(document.getElementById('planner-add-subject')?.value, 10) || 0;
        const startTime = document.getElementById('planner-add-start')?.value;
        const endTime = document.getElementById('planner-add-end')?.value;
        const note = (document.getElementById('planner-add-note')?.value || '').trim();

        if (!subjectId) { alert('과목을 선택하세요.'); return; }
        if (!startTime || !endTime) { alert('시간을 입력하세요.'); return; }

        try {
            await StorageManager.addPlan({
                subject_id: subjectId,
                plan_date: this.plannerDate,
                start_time: startTime,
                end_time: endTime,
                note
            });
            if (document.getElementById('planner-add-note')) document.getElementById('planner-add-note').value = '';
            await this.loadPlannerData();
            await this.loadWeekCalendar(0, {
                anchorDate: this.plannerDate,
                selectedDate: this.plannerDate,
                syncPlanner: false
            });
        } catch (e) {
            alert(e.message || '계획 추가 실패');
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
