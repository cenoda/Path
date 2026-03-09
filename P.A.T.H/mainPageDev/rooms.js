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
            const btn = document.getElementById('tab-rooms-btn');
            if (btn) {
                btn.onclick = () => {
                    if (typeof UI !== 'undefined' && UI.switchTab) {
                        UI.switchTab('rooms');
                    }
                };
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

            // Start leaderboard refresh
            clearInterval(this.refreshInterval);
            this.refreshInterval = setInterval(() => this.refreshLeaderboard(roomId), 15000);

            await this.refreshLeaderboard(roomId);
            await this.loadMessages(roomId);
            this.showRoomView(roomId);
        },

        async refreshLeaderboard(roomId) {
            try {
                const data = await this.apiGet(`/api/rooms/${roomId}/leaderboard`);
                this.leaderboard = data.leaderboard || [];
                // Also update room meta from the member data
                this.renderLeaderboard();
            } catch (e) {}
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

            const nameEl = document.getElementById('room-view-name');
            const goalEl = document.getElementById('room-view-goal');
            const codeEl = document.getElementById('room-view-code');
            if (room) {
                if (nameEl) nameEl.textContent = room.name;
                if (goalEl) goalEl.textContent = room.goal || '';
                if (codeEl) codeEl.textContent = room.invite_code;
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

        // ── Copy invite link ──────────────────────────────────────────────────
        copyInviteLink() {
            const codeEl = document.getElementById('room-view-code');
            if (!codeEl) return;
            const code = codeEl.textContent.trim();
            const url = `${location.origin}/room/${code}`;
            if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                    showToast('초대 링크가 클립보드에 복사됐습니다! 🔗');
                });
            } else {
                prompt('초대 링크를 복사하세요:', url);
            }
        },

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

            const submitBtn = document.querySelector('#room-create-modal button[type="submit"]');
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

        // ── Leave room ────────────────────────────────────────────────────────
        async leaveCurrentRoom() {
            if (!this.activeRoomId) return;
            if (!confirm('방을 나가시겠습니까?')) return;
            try {
                await this.apiDelete(`/api/rooms/${this.activeRoomId}/leave`);
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
