/**
 * P.A.T.H - Core Engine
 * 역할: 타이머 로직, 보상 계산, 상태 관리
 */

let timeLeft = 0;       // 남은 시간 (1/100초 단위)
let originalTime = 0;   // 설정했던 총 시간
let timerInterval = null;
let isRunning = false;

const TimerEngine = {
    /**
     * 사냥 시작 (결계 진입)
     */
    start(hr, min) {
        // 시간 설정 (초 -> 1/100초)
        timeLeft = (hr * 3600 + min * 60) * 100;
        originalTime = timeLeft;
        isRunning = true;

        // 1. 화면 꺼짐 방지 요청 (결계 활성화)
        if (typeof WakeLockManager !== 'undefined') {
            WakeLockManager.request();
        }
        
        // 2. 시작 즉시 UI 갱신 (00:00 방지)
        UI.updateTimer(timeLeft);

        // 3. 메인 루프 가동 (10ms 주기)
        timerInterval = setInterval(() => {
            if (timeLeft <= 0) {
                this.finish('SUCCESS');
            } else {
                timeLeft--;
                // 성능을 위해 매 프레임 UI를 갱신
                UI.updateTimer(timeLeft);
            }
        }, 10);

        console.log(`P.A.T.H: 사냥 시작 (${hr}h ${min}m)`);
    },

    /**
     * 중도 중단 (비겁한 후퇴)
     */
    interrupt() {
        if (confirm("공부를 중단하시겠습니까?\n지금까지의 시간은 기록되나 골드 보상은 소멸됩니다.")) {
            this.finish('INTERRUPTED');
        }
    },

    /**
     * 정산 및 종료
     * @param {string} type - 'SUCCESS', 'INTERRUPTED', 'FAILED'
     */
    finish(type) {
        clearInterval(timerInterval);
        isRunning = false;
        
        // 1. 결계 해제
        if (typeof WakeLockManager !== 'undefined') {
            WakeLockManager.release();
        }

        // 2. 실제 공부한 시간 계산 (초 단위)
        const timeSpentSec = Math.floor((originalTime - timeLeft) / 100);
        
        let earnedGold = 0;
        let earnedExp = 0;

        // 3. 보상 공식 적용
        // EXP: 1분당 1 EXP (언제나 지급)
        earnedExp = Math.floor(timeSpentSec / 60);

        // GOLD: 1시간당 100G (성공 시에만)
        if (type === 'SUCCESS') {
            earnedGold = Math.floor((originalTime / 100 / 3600) * 100);
        } else {
            earnedGold = 0; // 중단 혹은 탈주 시 골드 몰수
        }

        // 4. 저장소(Storage)에 데이터 영구 반영
        const totalData = StorageManager.addRewards(earnedGold, earnedExp);
        
        // 5. UI 최종 업데이트
        UI.updateAssets(totalData);
        UI.showResult(type, earnedGold, earnedExp);
        
        console.log(`P.A.T.H: 정산 완료 [${type}] - Gold: ${earnedGold}, Exp: ${earnedExp}`);
    }
};

/**
 * 딴짓 감지 (Visibility API)
 * 앱을 이탈하는 순간 자비 없이 실패 처리
 */
document.addEventListener("visibilitychange", () => {
    if (document.hidden && isRunning) {
        console.warn("P.A.T.H: 탈주 감지됨.");
        TimerEngine.finish('FAILED');
    }
});
