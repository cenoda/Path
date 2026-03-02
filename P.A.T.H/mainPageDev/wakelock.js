// Screen Wake Lock API 관리
let wakeLock = null;

const WakeLockManager = {
    async request() {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
                console.log("P.A.T.H: 결계 유지(화면 꺼짐 방지 활성)");
                
                // 연결이 끊겼을 때(앱 전환 등)를 대비한 재연결 로직
                wakeLock.addEventListener('release', () => {
                    console.log("P.A.T.H: 결계 해제");
                });
            }
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    },

    release() {
        if (wakeLock !== null) {
            wakeLock.release();
            wakeLock = null;
        }
    }
};
