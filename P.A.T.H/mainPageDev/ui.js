const UI = {
    currentMode: 'timer',

    elements: {
        body:        document.body,
        goldVal:     document.getElementById('gold-val'),
        ticketVal:   document.getElementById('ticket-val'),
        tierTag:     document.querySelector('.tier-tag'),
        rankPct:     document.getElementById('rank-pct'),
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
        bottomInfo:  document.querySelector('.bottom-info')
    },

    async init() {
        const userData = await StorageManager.load();
        if (!userData) return;
        this.updateAssets(userData);
        if (this.elements.bottomInfo) {
            this.elements.bottomInfo.textContent = `DOMAIN: ${userData.university || '-'}`;
        }
        this.loadRankInfo();
        this.bindEvents();
        this.syncInputToDisplay();
        console.log('P.A.T.H: UI 초기화 완료');
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

        this.elements.modeTimer.onclick = () => this.setMode('timer');
        this.elements.modeStopwatch.onclick = () => this.setMode('stopwatch');

        this.elements.enterBtn.onclick = () => {
            const hr  = parseInt(this.elements.inputHr.value)  || 0;
            const min = parseInt(this.elements.inputMin.value) || 0;
            if (this.currentMode === 'timer' && hr === 0 && min === 0) {
                alert('목표 시간을 설정하십시오.');
                return;
            }

            this.elements.body.classList.add('active');
            this.elements.enterBtn.style.display = 'none';
            this.elements.breakBtn.classList.remove('hidden'); // hidden 클래스 제거
            this.elements.breakBtn.style.display = 'inline-block';

            if (this.currentMode === 'stopwatch') {
                this.elements.breakBtn.textContent = 'COMPLETE PATH';
            } else {
                this.elements.breakBtn.textContent = 'ABORT PATH';
            }

            TimerEngine.start(hr, min);
        };

        this.elements.breakBtn.onclick = () => {
            if (this.currentMode === 'stopwatch') {
                TimerEngine.completeStopwatch();
            } else {
                TimerEngine.interrupt();
            }
        };
        this.elements.resetBtn.onclick = () => location.reload();
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
        const hr  = parseInt(this.elements.inputHr.value)  || 0;
        const min = parseInt(this.elements.inputMin.value) || 0;
        this.updateTimer((hr * 3600 + min * 60) * 100);
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

    showResult(type, gold = 0, mode = 'timer') {
        this.elements.body.classList.remove('active');
        this.elements.overlay.classList.remove('hidden');

        if (type === 'SUCCESS') {
            this.elements.resTitle.innerText   = 'MISSION COMPLETE';
            this.elements.resTitle.style.color = 'var(--gold)';
            this.elements.resLoot.innerHTML    =
                `<span style="font-size:2.5rem;color:#fff">+${gold.toLocaleString()}G</span><br>` +
                `<small>${mode === 'stopwatch' ? '스톱워치 모드 (골드 50%)' : '목표 달성 완수 보너스'}</small>`;
        } else if (type === 'INTERRUPTED') {
            this.elements.resTitle.innerText   = 'PATH BROKEN';
            this.elements.resTitle.style.color = '#444';
            this.elements.resLoot.innerHTML    =
                `<span style="font-size:2.5rem;color:var(--accent)">0G</span><br><small>중도 중단 골드 몰수</small>`;
        } else {
            this.elements.resTitle.innerText   = 'MISSION FAILED';
            this.elements.resTitle.style.color = 'var(--accent)';
            this.elements.resLoot.innerHTML    =
                `<span style="color:var(--accent);font-size:1.1rem">탈주 감지: 모든 보상이 소멸되었습니다.</span>`;
        }
    }
};

window.onload = () => UI.init();
