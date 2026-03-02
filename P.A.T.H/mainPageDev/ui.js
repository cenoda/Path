/**
 * P.A.T.H - UI Module (v3.9 Reactive)
 */
const UI = {
    elements: {
        body: document.body,
        goldVal: document.getElementById('gold-val'),
        tierTag: document.querySelector('.tier-tag'),
        rankPct: document.getElementById('rank-pct'),
        setupArea: document.getElementById('setup-area'),
        inputHr: document.getElementById('input-hr'),
        inputMin: document.getElementById('input-min'),
        displayTime: document.getElementById('display-time'),
        displayMs: document.getElementById('ms'),
        enterBtn: document.getElementById('enter-btn'),
        breakBtn: document.getElementById('break-btn'),
        resetBtn: document.getElementById('reset-btn'),
        overlay: document.getElementById('overlay'),
        resTitle: document.getElementById('res-title'),
        resLoot: document.getElementById('res-loot')
    },

// ui.js의 init 함수 수정
init() {
    const userData = StorageManager.load();
    this.updateAssets(userData);
    this.bindEvents();
    
    // [보완] 페이지 로드 시 0.1초 뒤에 현재 입력된 시간으로 타이머 강제 동기화
    setTimeout(() => {
        this.syncInputToDisplay();
    }, 100);
    
    console.log("P.A.T.H: UI 시스템 보완 완료");
},

// syncInputToDisplay 보강
syncInputToDisplay() {
    const hr = parseInt(this.elements.inputHr.value) || 0;
    const min = parseInt(this.elements.inputMin.value) || 0;
    // 00:00으로 보이지 않게 바로 셋팅
    this.updateTimer((hr * 3600 + min * 60) * 100);
}

    bindEvents() {
        // 입력값이 바뀔 때마다 큰 타이머 숫자를 실시간으로 변경
        const syncAction = () => this.syncInputToDisplay();
        this.elements.inputHr.oninput = syncAction;
        this.elements.inputMin.oninput = syncAction;

        this.elements.enterBtn.onclick = () => {
            const hr = parseInt(this.elements.inputHr.value) || 0;
            const min = parseInt(this.elements.inputMin.value) || 0;

            if (hr === 0 && min === 0) {
                alert("목표 시간을 설정하십시오.");
                return;
            }

            this.elements.body.classList.add('active');
            this.elements.enterBtn.style.display = 'none';
            this.elements.breakBtn.style.display = 'inline-block';
            
            TimerEngine.start(hr, min);
        };

        this.elements.breakBtn.onclick = () => TimerEngine.interrupt();
        this.elements.resetBtn.onclick = () => location.reload();
    },

    // 입력값(HR, MIN)을 읽어서 메인 타이머(00:00)에 표시해주는 함수
    syncInputToDisplay() {
        const hr = parseInt(this.elements.inputHr.value) || 0;
        const min = parseInt(this.elements.inputMin.value) || 0;
        const totalMs = (hr * 3600 + min * 60) * 100;
        this.updateTimer(totalMs);
    },

    updateTimer(timeLeft) {
        let totalSec = Math.max(0, Math.floor(timeLeft / 100));
        let h = Math.floor(totalSec / 3600);
        let m = Math.floor((totalSec % 3600) / 60);
        let s = totalSec % 60;
        let ms = Math.max(0, timeLeft % 100);

        const timeStr = (h > 0 ? String(h).padStart(2, '0') + ":" : "") + 
                        String(m).padStart(2, '0') + ":" + 
                        String(s).padStart(2, '0');

        this.elements.displayTime.innerText = timeStr;
        this.elements.displayMs.innerText = "." + String(ms).padStart(2, '0');
    },

    updateAssets(data) {
        this.elements.goldVal.innerText = data.gold.toLocaleString();
        this.elements.tierTag.innerText = data.tier;
        this.elements.rankPct.innerText = data.rankPct + "%";
    },

    showResult(type, gold, exp) {
        this.elements.body.classList.remove('active');
        this.elements.overlay.classList.remove('hidden');
        
        if (type === 'SUCCESS') {
            this.elements.resTitle.innerText = "MISSION COMPLETE";
            this.elements.resTitle.style.color = "var(--gold)";
            this.elements.resLoot.innerHTML = `<span style="font-size:2.5rem; color:#fff;">+${gold.toLocaleString()}G</span><br><small>목표 달성 완수 보너스</small><br><br><span style="color:#888;">+${exp} EXP ACQUIRED</span>`;
        } else if (type === 'INTERRUPTED') {
            this.elements.resTitle.innerText = "PATH BROKEN";
            this.elements.resTitle.style.color = "#444";
            this.elements.resLoot.innerHTML = `<span style="font-size:2.5rem; color:var(--accent);">0G</span><br><small>중도 중단 골드 몰수</small><br><br><span style="color:#888;">+${exp} EXP ACQUIRED</span>`;
        } else {
            this.elements.resTitle.innerText = "MISSION FAILED";
            this.elements.resTitle.style.color = "var(--accent)";
            this.elements.resLoot.innerHTML = `<span style="color:var(--accent); font-size:1.1rem;">탈주 감지: 모든 보상이 소멸되었습니다.</span>`;
        }
    }
};

window.onload = () => UI.init();
