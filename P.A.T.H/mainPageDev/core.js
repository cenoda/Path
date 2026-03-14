let timeLeft = 0;
let originalTime = 0;
let timerInterval = null;
let isRunning = false;
let isFinishing = false;
let studyMode = 'timer';

const FocusGuard = {
    armed: false,

    onVisibilityChange() {
        if (document.hidden && isRunning) {
            console.warn('P.A.T.H: 탭 전환/백그라운드 감지됨.');
            TimerEngine.finish('FAILED');
        }
    },

    onBlur() {
        if (!isRunning) return;
        // 일부 브라우저는 blur만 먼저 발생하므로 한 틱 뒤 실제 포커스 상태를 확인한다.
        setTimeout(() => {
            if (!isRunning) return;
            if (!document.hasFocus()) {
                console.warn('P.A.T.H: 창 포커스 이탈 감지됨.');
                TimerEngine.finish('FAILED');
            }
        }, 50);
    },

    onPageHide() {
        if (isRunning) {
            console.warn('P.A.T.H: 페이지 이탈 감지됨.');
            TimerEngine.finish('FAILED');
        }
    },

    onBeforeUnload(e) {
        if (!isRunning) return;
        e.preventDefault();
        e.returnValue = '';
    },

    activate() {
        if (this.armed) return;
        this.armed = true;
        document.addEventListener('visibilitychange', this.onVisibilityChange);
        window.addEventListener('blur', this.onBlur);
        window.addEventListener('pagehide', this.onPageHide);
        window.addEventListener('beforeunload', this.onBeforeUnload);
    },

    deactivate() {
        if (!this.armed) return;
        this.armed = false;
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
        window.removeEventListener('blur', this.onBlur);
        window.removeEventListener('pagehide', this.onPageHide);
        window.removeEventListener('beforeunload', this.onBeforeUnload);
    }
};

const TimerEngine = {
    setMode(mode) {
        studyMode = mode === 'stopwatch' ? 'stopwatch' : 'timer';
    },

    getMode() {
        return studyMode;
    },

    isActive() {
        return isRunning;
    },

    async start(hr, min, subjectId) {
        if (studyMode === 'stopwatch') {
            timeLeft = 0;
        } else {
            timeLeft = (hr * 3600 + min * 60) * 100;
        }
        originalTime = timeLeft;

        // 타이머를 즉시 시작해서 클릭 반응을 바로 보여줌 (낙관적 업데이트)
        isRunning = true;
        FocusGuard.activate();
        if (typeof WakeLockManager !== 'undefined') WakeLockManager.request();
        if (typeof CamManager !== 'undefined') CamManager.startCapturing();
        UI.updateTimer(timeLeft);
        timerInterval = setInterval(() => {
            if (studyMode === 'timer') {
                if (timeLeft <= 0) {
                    this.finish('SUCCESS');
                } else {
                    timeLeft--;
                    UI.updateTimer(timeLeft);
                }
            } else {
                timeLeft++;
                UI.updateTimer(timeLeft);
            }
        }, 10);

        // 서버 기록은 백그라운드에서 처리 (UI 블로킹 없음)
        const targetSec = Math.floor(originalTime / 100);
        const startRes = await fetch('/api/study/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ target_sec: targetSec, mode: studyMode, subject_id: subjectId })
        });
        if (!startRes.ok) {
            // 서버 거부 시 타이머 롤백
            clearInterval(timerInterval);
            timerInterval = null;
            isRunning = false;
            FocusGuard.deactivate();
            timeLeft = 0;
            const err = await startRes.json().catch(() => ({}));
            throw new Error(err.error || '공부 시작에 실패했습니다.');
        }

        console.log(`P.A.T.H: 공부 시작 [${studyMode}] (${hr}h ${min}m)`);
    },

    interrupt() {
        if (confirm("공부를 중단하시겠습니까?\n지금까지 공부한 시간은 인정되며, 골드는 스톱워치와 동일하게 50% 지급됩니다.")) {
            this.finish('INTERRUPTED');
        }
    },

    completeStopwatch() {
        if (studyMode === 'stopwatch') {
            this.finish('SUCCESS');
        }
    },

    async finish(type) {
        if (isFinishing) return;
        if (!isRunning && !timerInterval) return;

        isFinishing = true;
        clearInterval(timerInterval);
        timerInterval = null;
        isRunning = false;
        FocusGuard.deactivate();
        if (typeof WakeLockManager !== 'undefined') WakeLockManager.release();
        if (typeof CamManager !== 'undefined') CamManager.stopCapturing();

        try {
            const result = await StorageManager.completeStudy(type, studyMode);

            if (result?.user) UI.updateAssets(result.user);
            UI.showResult(type, result?.earnedGold || 0, studyMode, result?.studyRecordId || null);

            console.log(`P.A.T.H: 완료 [${type}] [${studyMode}] Gold: ${result?.earnedGold}`);
        } finally {
            isFinishing = false;
        }
    }
};
