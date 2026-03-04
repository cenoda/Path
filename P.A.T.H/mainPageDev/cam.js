const CamManager = {
    stream: null,
    interval: null,
    facingMode: 'user',
    visibility: 'all',
    warned: false,
    enabled: false,

    async loadSettings() {
        try {
            const r = await fetch('/api/cam/settings', { credentials: 'include' });
            if (!r.ok) return;
            const data = await r.json();
            this.enabled = !!data.cam_enabled;
            this.visibility = data.cam_visibility || 'all';

            const toggleEl = document.getElementById('ts-cam-enabled');
            const selectEl = document.getElementById('ts-cam-visibility');
            if (toggleEl) toggleEl.checked = this.enabled;
            if (selectEl) selectEl.value = this.visibility;
        } catch (e) {}
    },

    async saveSettings(enabled, visibility) {
        const wasEnabled = this.enabled;
        this.enabled = enabled;
        this.visibility = visibility;
        try {
            await fetch('/api/cam/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cam_enabled: enabled, cam_visibility: visibility })
            });
            
            // 실시간 반영: 공부 중인데 껐다면 즉시 정지, 켰다면 즉시 시작
            if (typeof isRunning !== 'undefined' && isRunning) {
                if (wasEnabled && !enabled) {
                    this.stopCapturing();
                    this.flashStatus('● 캠인증 중단됨');
                } else if (!wasEnabled && enabled) {
                    this.startCapturing();
                }
            }
        } catch (e) {}
    },

    async startCapturing() {
        if (!this.enabled) return;

        if (!this.warned) {
            const ok = confirm(
                '📷 캠인증 안내\n\n' +
                '타이머 작동 중 15초마다 자동으로 사진이 촬영됩니다.\n' +
                '촬영된 사진은 설정한 공개 범위로 업로드됩니다.\n\n' +
                '계속 진행하시겠습니까?'
            );
            if (!ok) {
                this.enabled = false;
                await this.saveSettings(false, this.visibility);
                const toggleEl = document.getElementById('ts-cam-enabled');
                if (toggleEl) toggleEl.checked = false;
                return;
            }
            this.warned = true;
        }

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.facingMode },
                audio: false
            });
            const video = document.getElementById('cam-video');
            if (video) {
                video.srcObject = this.stream;
            }
            const container = document.getElementById('cam-preview-container');
            if (container) container.classList.remove('hidden');

            this.updateStatus('● 캠인증 활성');
            this.interval = setInterval(() => this.capture(), 15000);
        } catch (err) {
            console.warn('캠인증: 카메라 접근 실패', err.message);
            this.updateStatus('⚠ 카메라 접근 불가');
        }
    },

    stopCapturing() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        const container = document.getElementById('cam-preview-container');
        if (container) container.classList.add('hidden');
        this.updateStatus('● 캠인증 대기중');
    },

    async switchCamera() {
        this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: this.facingMode },
                    audio: false
                });
                const video = document.getElementById('cam-video');
                if (video) video.srcObject = this.stream;
            } catch (e) {
                console.warn('카메라 전환 실패:', e.message);
            }
        }
    },

    capture() {
        const video = document.getElementById('cam-video');
        const canvas = document.getElementById('cam-canvas');
        if (!video || !canvas || !video.videoWidth) return;

        canvas.width = 320;
        canvas.height = Math.round(video.videoHeight * (320 / video.videoWidth));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const imageData = canvas.toDataURL('image/jpeg', 0.7);

        fetch('/api/cam/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ image_data: imageData, visibility: this.visibility })
        }).then(r => {
            if (r.ok) {
                this.flashStatus('📷 촬영됨');
            }
        }).catch(() => {});
    },

    updateStatus(text) {
        const el = document.getElementById('cam-status-text');
        if (el) el.textContent = text;
    },

    flashStatus(text) {
        const el = document.getElementById('cam-status-text');
        if (!el) return;
        const prev = el.textContent;
        el.textContent = text;
        el.style.color = '#D4AF37';
        setTimeout(() => {
            el.textContent = '● 캠인증 활성';
            el.style.color = '';
        }, 1500);
    }
};

function openTimerSettings() {
    const panel = document.getElementById('timer-settings-panel');
    if (panel) {
        panel.classList.remove('hidden');
        CamManager.loadSettings();
    }
}

function closeTimerSettings() {
    const panel = document.getElementById('timer-settings-panel');
    if (panel) panel.classList.add('hidden');
}

async function saveTimerCamSettings() {
    const toggle = document.getElementById('ts-cam-enabled');
    const select = document.getElementById('ts-cam-visibility');
    const note = document.getElementById('ts-cam-note');
    if (!toggle || !select) return;

    await CamManager.saveSettings(toggle.checked, select.value);

    if (note) {
        const visLabel = select.value === 'all' ? '전체공개' : '관리자만';
        note.textContent = `저장됨 — 공개 범위: ${visLabel}`;
        note.style.color = '#D4AF37';
        setTimeout(() => {
            note.textContent = '공개 범위는 모든 유저에게 표시됩니다.';
            note.style.color = '';
        }, 2000);
    }
}
