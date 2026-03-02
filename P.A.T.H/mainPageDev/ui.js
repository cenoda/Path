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
        resLoot: document.getElementById('res-loot'),
        bottomInfo: document.querySelector('.bottom-info')
    },

    async init() {
        const userData = await StorageManager.load();
        if (!userData) return;

        this.updateAssets(userData);
        if (this.elements.bottomInfo) {
            this.elements.bottomInfo.textContent = `DOMAIN: ${userData.university || '-'}`;
        }

        this.loadRankPct();
        this.bindEvents();
        this.syncInputToDisplay();
        console.log("P.A.T.H: UI 초기화 완료");
    },

    async loadRankPct() {
        try {
            const r = await fetch('/api/ranking/me', { credentials: 'include' });
            if (r.ok) {
                const data = await r.json();
                if (this.elements.rankPct) {
                    this.elements.rankPct.textContent = data.pct + '%';
                }
                if (this.elements.tierTag) {
                    const cached = StorageManager._cache;
                    if (cached) this.elements.tierTag.textContent = cached.tier + ' / ' + data.pct + '%';
                }
            }
        } catch (e) {}
    },

    bindEvents() {
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
        if (this.elements.goldVal) this.elements.goldVal.innerText = data.gold.toLocaleString();
        if (this.elements.tierTag) this.elements.tierTag.innerText = data.tier;
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
