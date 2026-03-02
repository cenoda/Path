let timeLeft = 0;
let originalTime = 0;
let timerInterval = null;
let isRunning = false;

const TimerEngine = {
    async start(hr, min) {
        timeLeft = (hr * 3600 + min * 60) * 100;
        originalTime = timeLeft;
        isRunning = true;

        fetch('/api/study/start', { method: 'POST', credentials: 'include' }).catch(() => {});
        if (typeof WakeLockManager !== 'undefined') WakeLockManager.request();

        UI.updateTimer(timeLeft);

        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                this.finish('SUCCESS');
            } else {
                timeLeft--;
                UI.updateTimer(timeLeft);
            }
        }, 10);

        console.log(`P.A.T.H: 공부 시작 (${hr}h ${min}m)`);
    },

    interrupt() {
        if (confirm("공부를 중단하시겠습니까?\n지금까지의 시간은 기록되나 골드 보상은 소멸됩니다.")) {
            this.finish('INTERRUPTED');
        }
    },

    async finish(type) {
        clearInterval(timerInterval);
        isRunning = false;
        if (typeof WakeLockManager !== 'undefined') WakeLockManager.release();

        const timeSpentSec = Math.floor((originalTime - timeLeft) / 100);
        const earnedExp    = Math.floor(timeSpentSec / 60);
        const originalSec  = Math.floor(originalTime / 100);

        // 골드는 서버에서 대학 요율 기준으로 계산
        const result = await StorageManager.addRewards(earnedExp, type, originalSec);

        if (result?.user) UI.updateAssets(result.user);
        UI.showResult(type, result?.earnedGold || 0, result?.earnedTicket || 0);

        console.log(`P.A.T.H: 완료 [${type}] Gold: ${result?.earnedGold}, 시간: ${earnedExp}분`);
    }
};

document.addEventListener('visibilitychange', () => {
    if (document.hidden && isRunning) {
        console.warn('P.A.T.H: 탈주 감지됨.');
        TimerEngine.finish('FAILED');
    }
});
