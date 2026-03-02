let timeLeft = 0;
let originalTime = 0;
let timerInterval = null;
let isRunning = false;

const TimerEngine = {
    start(hr, min) {
        timeLeft = (hr * 3600 + min * 60) * 100;
        originalTime = timeLeft;
        isRunning = true;

        if (typeof WakeLockManager !== 'undefined') {
            WakeLockManager.request();
        }

        UI.updateTimer(timeLeft);

        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                this.finish('SUCCESS');
            } else {
                timeLeft--;
                UI.updateTimer(timeLeft);
            }
        }, 10);

        console.log(`P.A.T.H: 사냥 시작 (${hr}h ${min}m)`);
    },

    interrupt() {
        if (confirm("공부를 중단하시겠습니까?\n지금까지의 시간은 기록되나 골드 보상은 소멸됩니다.")) {
            this.finish('INTERRUPTED');
        }
    },

    async finish(type) {
        clearInterval(timerInterval);
        isRunning = false;

        if (typeof WakeLockManager !== 'undefined') {
            WakeLockManager.release();
        }

        const timeSpentSec = Math.floor((originalTime - timeLeft) / 100);
        const earnedExp = Math.floor(timeSpentSec / 60);
        let earnedGold = 0;
        if (type === 'SUCCESS') {
            earnedGold = Math.floor((originalTime / 100 / 3600) * 100);
        }

        const originalSec = Math.floor(originalTime / 100);
        const totalData = await StorageManager.addRewards(earnedGold, earnedExp, type, originalSec);

        if (totalData) UI.updateAssets(totalData);
        UI.showResult(type, earnedGold, earnedExp);

        console.log(`P.A.T.H: 정산 완료 [${type}] - Gold: ${earnedGold}, Exp: ${earnedExp}`);
    }
};

document.addEventListener("visibilitychange", () => {
    if (document.hidden && isRunning) {
        console.warn("P.A.T.H: 탈주 감지됨.");
        TimerEngine.finish('FAILED');
    }
});
