'use strict';
/**
 * GroupRooms — Group timer room manager for the P.A.T.H timer page.
 * Handles: room create/join/leave, real-time leaderboard, activity feed, chat.
 */

(function () {
    // ── Socket.io ─────────────────────────────────────────────────────────────
    let socket = null;

    function getSocket() {
        if (socket && socket.connected) return socket;
        if (typeof io !== 'undefined') {
            socket = io({ transports: ['websocket', 'polling'] });
            socket.on('room:activity', onActivity);
            socket.on('room:message', onRoomMessage);
            socket.on('room:leaderboard_refresh', (data) => {
                const roomId = data && data.roomId;
                if (GroupRooms.activeRoomId && String(GroupRooms.activeRoomId) === String(roomId)) {
                    GroupRooms.refreshLeaderboard(GroupRooms.activeRoomId);
                }
            });
        }
        return socket;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    const GroupRooms = {
        myRooms: [],
        activeRoomId: null,
        activeRoomData: null,
        leaderboard: [],
        messages: [],
        activityLog: [],
        refreshInterval: null,
        creatingRoom: false,

        // ── Init ────────────────────────────────────────────────────────────
        async init() {
            await this.loadMyRooms();
            this.checkJoinFromUrl();
            this.bindTabSwitch();
            this.bindRoomUiEvents();
        },

        checkJoinFromUrl() {
            const params = new URLSearchParams(location.search);
            const joinCode = params.get('join');
            if (joinCode) {
                history.replaceState({}, '', location.pathname);
                this.handleJoinByCode(joinCode);
            }
        },

        bindTabSwitch() {
            this._bind(document.getElementById('tab-rooms-btn'), () => {
                if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('rooms');
            });
        },

        _bind(el, handler) {
            if (!el) return;
            el.removeAttribute('onclick');
            el.onclick = null;
            let _t = 0;
            el.addEventListener('pointerup', (e) => {
                if (e.pointerType !== 'touch') return;
                const now = Date.now();
                if (now - _t < 250) return;
                _t = now;
                e.preventDefault();
                e.stopPropagation();
                handler(e);
            }, { passive: false });
            el.addEventListener('click', (e) => {
                const now = Date.now();
                if (now - _t < 350) { e.preventDefault(); e.stopPropagation(); return; }
                handler(e);
            });
        },

        bindRoomUiEvents() {
            this._bind(document.getElementById('rooms-open-create'), () => this.showCreateModal());
            this._bind(document.getElementById('rooms-open-join'),    () => this.showJoinModal());
            this._bind(document.getElementById('room-create-cancel'), () => this.hideCreateModal());
            this._bind(document.getElementById('room-join-cancel'),   () => this.hideJoinModal());

            const createForm = document.getElementById('room-create-form');
            if (createForm) {
                createForm.removeAttribute('onsubmit');
                createForm.addEventListener('submit', (e) => this.submitCreateRoom(e));
            }

            const joinForm = document.getElementById('room-join-form');
            if (joinForm) {
                joinForm.removeAttribute('onsubmit');
                joinForm.addEventListener('submit', (e) => this.submitJoinRoom(e));
            }
        },

        // ── API helpers ─────────────────────────────────────────────────────
        async apiGet(path) {
            const r = await fetch(path, { credentials: 'include' });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || '서버 오류'); }
            return r.json();
        },

        async apiPost(path, body) {
            const r = await fetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || '서버 오류'); }
            return r.json();
        },

        async apiDelete(path) {
            const r = await fetch(path, { method: 'DELETE', credentials: 'include' });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || '서버 오류'); }
            return r.json();
        },

        async apiPatch(path, body) {
            const r = await fetch(path, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || '서버 오류'); }
            return r.json();
        },

        // ── Load my rooms ────────────────────────────────────────────────────
        async loadMyRooms() {
            try {
                const data = await this.apiGet('/api/rooms/my');
                this.myRooms = data.rooms || [];
            } catch (e) {
                this.myRooms = [];
            }
            this.renderRoomList();
        },

        // ── Render room list ─────────────────────────────────────────────────
        renderRoomList() {
            const container = document.getElementById('rooms-list');
            if (!container) return;

            if (!this.myRooms.length) {
                container.innerHTML = `<div class="rooms-empty">
                    <div class="rooms-empty-icon">🏠</div>
                    <div class="rooms-empty-text">아직 가입한 방이 없습니다</div>
                    <div class="rooms-empty-sub">방을 만들거나 초대 링크로 합류하세요</div>
                </div>`;
                return;
            }

            container.innerHTML = this.myRooms.map(room => {
                const active = parseInt(room.active_count, 10) || 0;
                const members = parseInt(room.member_count, 10) || 0;
                return `<div class="room-card" data-room-id="${room.id}" onclick="GroupRooms.openRoom(${room.id})">
                    <div class="room-card-header">
                        <span class="room-card-name">${esc(room.name)}</span>
                        <span class="room-card-badge ${active > 0 ? 'badge-active' : ''}">${active > 0 ? `🔥 ${active}명 공부 중` : '📚 대기 중'}</span>
                    </div>
                    ${room.goal ? `<div class="room-card-goal">${esc(room.goal)}</div>` : ''}
                    <div class="room-card-meta">${members}/${room.max_members}명 · 초대코드 ${room.invite_code}</div>
                </div>`;
            }).join('');
        },

        // ── Open room ────────────────────────────────────────────────────────
        async openRoom(roomId) {
            this.activeRoomId = roomId;

            // Join socket.io room channel
            const sock = getSocket();
            if (sock) sock.emit('room:join', { roomId });

            // Start leaderboard + stats refresh
            clearInterval(this.refreshInterval);
            this.refreshInterval = setInterval(() => {
                this.refreshLeaderboard(roomId);
                this.loadStats(roomId);
            }, 15000);

            await Promise.all([
                this.refreshLeaderboard(roomId),
                this.loadMessages(roomId),
                this.loadStats(roomId),
            ]);
            this.showRoomView(roomId);
        },

        async refreshLeaderboard(roomId) {
            try {
                const data = await this.apiGet(`/api/rooms/${roomId}/leaderboard`);
                this.leaderboard = data.leaderboard || [];
                this.renderLeaderboard();
            } catch (e) {}
        },

        async loadStats(roomId) {
            try {
                const data = await this.apiGet(`/api/rooms/${roomId}/stats`);
                this.renderDonutChart(data.today || []);
                this.renderWeeklyChart(data.weekly || []);
            } catch (e) {}
        },

        // ── Donut chart (SVG, stroke-dasharray technique) ─────────────────────
        renderDonutChart(members) {
            const segEl = document.getElementById('room-donut-segments');
            const legendEl = document.getElementById('room-donut-legend');
            const centerEl = document.getElementById('room-donut-center');
            if (!segEl) return;

            const COLORS = ['#3182F6','#00C471','#FF6B35','#8B5CF6','#F59E0B','#EC4899','#06B6D4','#84CC16'];
            const active = members.filter(m => parseInt(m.today_sec, 10) > 0);
            const total = active.reduce((s, m) => s + parseInt(m.today_sec, 10), 0);

            // Empty state
            if (total === 0) {
                segEl.innerHTML = '';
                if (centerEl) centerEl.innerHTML = '<div class="room-donut-center-val">—</div><div class="room-donut-center-label">공부 기록 없음</div>';
                if (legendEl) legendEl.innerHTML = '<div class="donut-empty-msg">오늘 공부 기록이 없어요</div>';
                return;
            }

            // Build SVG segments (r=15.9155 → circumference≈100)
            let cumPct = 0;
            segEl.innerHTML = active.map((m, i) => {
                const pct = (parseInt(m.today_sec, 10) / total) * 100;
                const offset = 25 - cumPct; // 25 = start at 12-o'clock
                cumPct += pct;
                return `<circle cx="20" cy="20" r="15.9155" fill="none"
                    stroke="${COLORS[i % COLORS.length]}" stroke-width="3.5"
                    stroke-dasharray="${pct.toFixed(3)} ${(100 - pct).toFixed(3)}"
                    stroke-dashoffset="${offset.toFixed(3)}"
                    stroke-linecap="butt"/>`;
            }).join('');

            // Center label: total time
            const totalH = Math.floor(total / 3600);
            const totalM = Math.floor((total % 3600) / 60);
            if (centerEl) centerEl.innerHTML = `
                <div class="room-donut-center-val">${totalH > 0 ? totalH + 'h' : totalM + 'm'}</div>
                <div class="room-donut-center-label">총 공부</div>`;

            // Legend
            if (legendEl) legendEl.innerHTML = active.map((m, i) => {
                const sec = parseInt(m.today_sec, 10);
                const h = Math.floor(sec / 3600), min = Math.floor((sec % 3600) / 60);
                const t = h > 0 ? `${h}h ${min}m` : `${min}분`;
                const pct = Math.round((sec / total) * 100);
                return `<div class="donut-legend-row">
                    <span class="donut-legend-dot" style="background:${COLORS[i % COLORS.length]}"></span>
                    <span class="donut-legend-name">${esc(m.nickname)}</span>
                    <span class="donut-legend-time">${t}<span class="donut-legend-pct"> ${pct}%</span></span>
                </div>`;
            }).join('');
        },

        // ── Weekly bar chart ──────────────────────────────────────────────────
        renderWeeklyChart(weekly) {
            const el = document.getElementById('room-weekly-chart');
            if (!el) return;

            // Build a full 7-day map (today → 6 days ago)
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const key = d.toISOString().slice(0, 10);
                days.push({ key, label: ['일','월','화','수','목','금','토'][d.getDay()] });
            }
            const map = {};
            weekly.forEach(r => { map[r.day] = parseInt(r.total_sec, 10); });

            const maxSec = Math.max(...days.map(d => map[d.key] || 0), 1);
            const todayKey = new Date().toISOString().slice(0, 10);

            el.innerHTML = `<div class="weekly-bars">${days.map(d => {
                const sec = map[d.key] || 0;
                const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
                const label = sec > 0 ? (h > 0 ? `${h}h` : `${m}m`) : '';
                const heightPct = Math.round((sec / maxSec) * 100);
                const isToday = d.key === todayKey;
                return `<div class="weekly-bar-col">
                    <div class="weekly-bar-val">${label}</div>
                    <div class="weekly-bar-track">
                        <div class="weekly-bar-fill ${isToday ? 'weekly-bar-today' : ''}" style="height:${heightPct}%"></div>
                    </div>
                    <div class="weekly-bar-day ${isToday ? 'weekly-bar-day-today' : ''}">${d.label}</div>
                </div>`;
            }).join('')}</div>`;
        },

        async loadMessages(roomId) {
            try {
                const data = await this.apiGet(`/api/rooms/${roomId}/messages`);
                this.messages = data.messages || [];
                this.renderMessages();
            } catch (e) {}
        },

        showRoomView(roomId) {
            const room = this.myRooms.find(r => r.id === roomId);
            const listView = document.getElementById('rooms-list-view');
            const roomView = document.getElementById('rooms-room-view');
            if (listView) listView.classList.add('hidden');
            if (roomView) roomView.classList.remove('hidden');

            if (room) {
                const nameEl = document.getElementById('room-view-name');
                const goalEl = document.getElementById('room-view-goal');
                const codeEl = document.getElementById('room-view-code');
                if (nameEl) nameEl.textContent = room.name;
                if (goalEl) goalEl.textContent = room.goal || '';
                if (codeEl) codeEl.textContent = room.invite_code;

                // Show creator-only controls
                const myId = typeof UI !== 'undefined' && UI.currentUser ? UI.currentUser.id : null;
                const isCreator = myId && String(room.creator_id) === String(myId);
                document.getElementById('room-settings-creator-section')?.classList.toggle('hidden', !isCreator);
                document.getElementById('room-settings-delete-btn')?.classList.toggle('hidden', !isCreator);
            }
        },

        backToList() {
            clearInterval(this.refreshInterval);
            const sock = getSocket();
            if (sock && this.activeRoomId) sock.emit('room:leave', { roomId: this.activeRoomId });
            this.activeRoomId = null;
            this.activityLog = [];

            const listView = document.getElementById('rooms-list-view');
            const roomView = document.getElementById('rooms-room-view');
            if (listView) listView.classList.remove('hidden');
            if (roomView) roomView.classList.add('hidden');
        },

        // ── Render leaderboard ────────────────────────────────────────────────
        renderLeaderboard() {
            const el = document.getElementById('room-leaderboard');
            if (!el) return;

            if (!this.leaderboard.length) {
                el.innerHTML = '<div class="lb-empty">멤버 없음</div>';
                return;
            }

            const myId = typeof UI !== 'undefined' && UI.currentUser ? UI.currentUser.id : null;
            el.innerHTML = this.leaderboard.map((m, idx) => {
                const hrs = Math.floor(m.today_sec / 3600);
                const mins = Math.floor((m.today_sec % 3600) / 60);
                const timeStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}분`;
                const isMe = m.id === myId;
                const rankEmoji = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
                const studying = m.is_studying;
                return `<div class="lb-row ${isMe ? 'lb-row-me' : ''} ${studying ? 'lb-row-active' : ''}">
                    <span class="lb-rank">${rankEmoji}</span>
                    <span class="lb-name">${esc(m.nickname)}${studying ? ' <span class="lb-studying-dot"></span>' : ''}</span>
                    <span class="lb-time">${m.today_sec > 0 ? timeStr : '-'}</span>
                </div>`;
            }).join('');
        },

        // ── Render messages ───────────────────────────────────────────────────
        renderMessages() {
            const el = document.getElementById('room-chat-messages');
            if (!el) return;

            const myId = typeof UI !== 'undefined' && UI.currentUser ? UI.currentUser.id : null;
            el.innerHTML = this.messages.map(msg => {
                const isMe = msg.user_id === myId;
                const time = new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                return `<div class="chat-msg ${isMe ? 'chat-msg-me' : ''}">
                    ${!isMe ? `<span class="chat-nick">${esc(msg.nickname)}</span>` : ''}
                    <span class="chat-bubble">${esc(msg.content)}</span>
                    <span class="chat-time">${time}</span>
                </div>`;
            }).join('');
            el.scrollTop = el.scrollHeight;
        },

        // ── Activity feed ─────────────────────────────────────────────────────
        renderActivity() {
            const el = document.getElementById('room-activity-feed');
            if (!el) return;
            el.innerHTML = this.activityLog.slice(-20).reverse().map(ev => {
                if (ev.type === 'timer_start') {
                    return `<div class="activity-item activity-start">🔥 <strong>${esc(ev.nickname)}</strong>님이 ${esc(ev.subject)} 공부를 시작했습니다.</div>`;
                } else if (ev.type === 'timer_stop') {
                    const mins = Math.floor(ev.duration_sec / 60);
                    return `<div class="activity-item activity-stop">✅ <strong>${esc(ev.nickname)}</strong>님이 ${mins}분 공부 완료.</div>`;
                }
                return '';
            }).join('');
        },

        // ── Send chat ─────────────────────────────────────────────────────────
        async sendMessage() {
            const input = document.getElementById('room-chat-input');
            if (!input) return;
            const content = input.value.trim();
            if (!content || !this.activeRoomId) return;
            input.value = '';
            try {
                await this.apiPost(`/api/rooms/${this.activeRoomId}/messages`, { content });
                // Socket.io will broadcast to all including sender via server,
                // but if no broadcast (server sends it back), refresh manually
                await this.loadMessages(this.activeRoomId);
            } catch (e) {
                alert(e.message);
            }
        },

        // ── Share / Copy invite link ──────────────────────────────────────────
        async shareInviteLink() {
            const codeEl = document.getElementById('room-view-code');
            if (!codeEl) return;
            const code = codeEl.textContent.trim();
            const url = `${location.origin}/room/${code}`;
            const roomName = document.getElementById('room-view-name')?.textContent?.trim() || '그룹 타이머';

            // Use Web Share API when available (mobile browsers, KakaoTalk in-app browser, etc.)
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `P.A.T.H — ${roomName}`,
                        text: '함께 공부해요! P.A.T.H 그룹 타이머에 합류하세요.',
                        url,
                    });
                    return;
                } catch (e) {
                    // User cancelled or share failed — fall through to clipboard
                    if (e.name === 'AbortError') return;
                }
            }

            // Fallback: clipboard copy
            try {
                await navigator.clipboard.writeText(url);
                showToast('초대 링크가 복사됐어요');
            } catch {
                prompt('초대 링크를 복사하세요:', url);
            }
        },

        // Keep old name as alias so existing onclick still works
        copyInviteLink() { return this.shareInviteLink(); },

        // ── Create room ───────────────────────────────────────────────────────
        showCreateModal() {
            const modal = document.getElementById('room-create-modal');
            if (modal) modal.classList.remove('hidden');
        },

        hideCreateModal() {
            const modal = document.getElementById('room-create-modal');
            if (modal) modal.classList.add('hidden');
        },

        async submitCreateRoom(e) {
            if (e) e.preventDefault();
            if (this.creatingRoom) return;

            const name = document.getElementById('room-create-name')?.value.trim();
            const goal = document.getElementById('room-create-goal')?.value.trim();
            const maxMembers = parseInt(document.getElementById('room-create-max')?.value, 10) || 10;
            if (!name) { alert('방 이름을 입력해주세요.'); return; }

            const submitBtn = document.getElementById('room-create-submit');
            try {
                this.creatingRoom = true;
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = '생성 중...';
                }

                const data = await this.apiPost('/api/rooms', { name, goal, max_members: maxMembers });
                this.hideCreateModal();
                document.getElementById('room-create-name').value = '';
                document.getElementById('room-create-goal').value = '';
                await this.loadMyRooms();
                this.openRoom(data.room.id);
                showToast('방이 생성됐습니다! 🎉');
            } catch (err) {
                alert(err && err.message ? err.message : '방 생성 중 오류가 발생했습니다.');
            } finally {
                this.creatingRoom = false;
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = '방 만들기';
                }
            }
        },

        // ── Join by invite code ────────────────────────────────────────────────
        async handleJoinByCode(code) {
            try {
                const data = await this.apiPost(`/api/rooms/join/${code}`, {});
                await this.loadMyRooms();
                this.openRoom(data.room_id);
                showToast(`"${data.room_name}" 방에 합류했습니다! ⚔️`);
                // Switch to rooms tab
                if (typeof UI !== 'undefined' && UI.switchTab) UI.switchTab('rooms');
            } catch (err) {
                alert(err.message);
            }
        },

        showJoinModal() {
            const modal = document.getElementById('room-join-modal');
            if (modal) modal.classList.remove('hidden');
        },

        hideJoinModal() {
            const modal = document.getElementById('room-join-modal');
            if (modal) modal.classList.add('hidden');
        },

        async submitJoinRoom(e) {
            if (e) e.preventDefault();
            const code = document.getElementById('room-join-code')?.value.trim().toLowerCase();
            if (!code) { alert('초대 코드를 입력해주세요.'); return; }
            this.hideJoinModal();
            document.getElementById('room-join-code').value = '';
            await this.handleJoinByCode(code);
        },

        // ── Settings modal ────────────────────────────────────────────────────
        showSettingsModal() {
            const modal = document.getElementById('room-settings-modal');
            if (!modal) return;
            // Pre-fill edit fields
            const room = this.myRooms.find(r => r.id === this.activeRoomId);
            if (room) {
                const nameEl = document.getElementById('room-edit-name');
                const goalEl = document.getElementById('room-edit-goal');
                const maxEl  = document.getElementById('room-edit-max');
                if (nameEl) nameEl.value = room.name;
                if (goalEl) goalEl.value = room.goal || '';
                if (maxEl)  maxEl.value  = room.max_members;
            }
            modal.classList.remove('hidden');
        },

        hideSettingsModal() {
            document.getElementById('room-settings-modal')?.classList.add('hidden');
        },

        async submitEditRoom() {
            const name = document.getElementById('room-edit-name')?.value.trim();
            const goal = document.getElementById('room-edit-goal')?.value.trim();
            const maxMembers = parseInt(document.getElementById('room-edit-max')?.value, 10) || 10;
            if (!name) { alert('방 이름을 입력해주세요.'); return; }

            const btn = document.getElementById('room-edit-submit');
            try {
                if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
                const data = await this.apiPatch(`/api/rooms/${this.activeRoomId}`, { name, goal, max_members: maxMembers });
                // Update local data
                const idx = this.myRooms.findIndex(r => r.id === this.activeRoomId);
                if (idx !== -1) {
                    this.myRooms[idx] = { ...this.myRooms[idx], ...data.room };
                    document.getElementById('room-view-name').textContent = data.room.name;
                    document.getElementById('room-view-goal').textContent = data.room.goal || '';
                }
                this.hideSettingsModal();
                showToast('방 정보가 업데이트됐어요');
            } catch (err) {
                alert(err.message);
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '변경 저장'; }
            }
        },

        async deleteRoom() {
            if (!this.activeRoomId) return;
            if (!confirm('방을 삭제하면 모든 멤버가 퇴장되고 채팅 기록이 사라집니다. 정말 삭제하시겠습니까?')) return;
            try {
                await this.apiDelete(`/api/rooms/${this.activeRoomId}`);
                this.hideSettingsModal();
                this.backToList();
                await this.loadMyRooms();
                showToast('방이 삭제됐습니다.');
            } catch (err) {
                alert(err.message);
            }
        },

        // ── Leave room ────────────────────────────────────────────────────────
        async leaveCurrentRoom() {
            if (!this.activeRoomId) return;
            if (!confirm('방을 나가시겠습니까?')) return;
            try {
                await this.apiDelete(`/api/rooms/${this.activeRoomId}/leave`);
                this.hideSettingsModal();
                this.backToList();
                await this.loadMyRooms();
                showToast('방을 나왔습니다.');
            } catch (err) {
                alert(err.message);
            }
        },

        // ── Timer broadcast ───────────────────────────────────────────────────
        notifyTimerStart(subject) {
            if (!this.activeRoomId) return;
            const sock = getSocket();
            if (sock) sock.emit('room:timer_start', { roomId: this.activeRoomId, subject: subject || '공부' });
        },

        notifyTimerStop(durationSec) {
            if (!this.activeRoomId) return;
            const sock = getSocket();
            if (sock) sock.emit('room:timer_stop', { roomId: this.activeRoomId, duration_sec: durationSec || 0 });
        },
    };

    // ── Socket event handlers ─────────────────────────────────────────────────
    function onActivity(ev) {
        GroupRooms.activityLog.push(ev);
        if (GroupRooms.activityLog.length > 100) GroupRooms.activityLog.shift();
        GroupRooms.renderActivity();
    }

    function onRoomMessage(msg) {
        GroupRooms.messages.push(msg);
        GroupRooms.renderMessages();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    function esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function showToast(msg) {
        let toast = document.getElementById('group-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'group-toast';
            toast.className = 'group-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 3000);
    }

    // ── Expose globally ───────────────────────────────────────────────────────
    window.GroupRooms = GroupRooms;
    window.showToast = showToast;

    // ── Auto-init ─────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        GroupRooms.init().catch(console.error);
    });
})();
