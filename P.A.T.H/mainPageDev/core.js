let timeLeft = 0;
let originalTime = 0;
let timerInterval = null;
let isRunning = false;
let studyMode = 'timer';

const TimerEngine = {
    setMode(mode) {
        studyMode = mode === 'stopwatch' ? 'stopwatch' : 'timer';
    },

    getMode() {
        return studyMode;
    },

    async start(hr, min, subjectId) {
        if (studyMode === 'stopwatch') {
            timeLeft = 0;
        } else {
            timeLeft = (hr * 3600 + min * 60) * 100;
        }
        originalTime = timeLeft;

        const targetSec = Math.floor(originalTime / 100);
        const startRes = await fetch('/api/study/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ target_sec: targetSec, mode: studyMode, subject_id: subjectId })
        });
        if (!startRes.ok) {
            const err = await startRes.json().catch(() => ({}));
            throw new Error(err.error || '공부 시작에 실패했습니다.');
        }

        isRunning = true;

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

        console.log(`P.A.T.H: 공부 시작 [${studyMode}] (${hr}h ${min}m)`);
    },

    interrupt() {
        if (confirm("공부를 중단하시겠습니까?\n지금까지의 시간은 기록되나 골드 보상은 소멸됩니다.")) {
            this.finish('INTERRUPTED');
        }
    },

    completeStopwatch() {
        if (studyMode === 'stopwatch') {
            this.finish('SUCCESS');
        }
    },

    async finish(type) {
        clearInterval(timerInterval);
        isRunning = false;
        if (typeof WakeLockManager !== 'undefined') WakeLockManager.release();
        if (typeof CamManager !== 'undefined') CamManager.stopCapturing();

        const result = await StorageManager.completeStudy(type, studyMode);

        if (result?.user) UI.updateAssets(result.user);
        UI.showResult(type, result?.earnedGold || 0, studyMode);

        console.log(`P.A.T.H: 완료 [${type}] [${studyMode}] Gold: ${result?.earnedGold}`);
    }
};

document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRunning) {
        console.warn('P.A.T.H: 탈주 감지됨.');
        TimerEngine.finish('FAILED');
    }
});
