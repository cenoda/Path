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
    // ── Room shop catalog (mirrors server ROOM_SHOP) ──────────────────────────
    const ROOM_SHOP = {
        wallpapers: [
            { key: 'default', name: '기본',       price: 0,    emoji: '⬜', gradients: ['#f8f9fa', '#e9ecef'] },
            { key: 'blossom', name: '벚꽃',        price: 500,  emoji: '🌸', gradients: ['#fce4ec', '#f8bbd9'] },
            { key: 'night',   name: '별밤',         price: 800,  emoji: '🌙', gradients: ['#0d1b4b', '#1a2a6c'] },
            { key: 'dawn',    name: '새벽',         price: 1000, emoji: '🌅', gradients: ['#312060', '#5c3380'] },
            { key: 'coral',   name: '산호',         price: 1200, emoji: '🪸', gradients: ['#fff3e0', '#ffe0b2'] },
            { key: 'forest',  name: '숲속',         price: 1500, emoji: '🌿', gradients: ['#e8f5e9', '#c8e6c9'] },
            { key: 'library', name: '황금 도서관',  price: 3000, emoji: '📖', gradients: ['#3e2723', '#4e342e'] },
            { key: 'space',   name: '우주',         price: 5000, emoji: '🚀', gradients: ['#050510', '#0a0520'] },
        ],
        props: [
            { key: 'plant',  name: '화분',   emoji: '🌱', price: 200  },
            { key: 'coffee', name: '커피',   emoji: '☕', price: 150  },
            { key: 'clock',  name: '탁상시계', emoji: '⏰', price: 300  },
            { key: 'lamp',   name: '스탠드',  emoji: '💡', price: 250  },
            { key: 'trophy', name: '트로피',  emoji: '🏆', price: 1000 },
            { key: 'pizza',  name: '피자',   emoji: '🍕', price: 100  },
            { key: 'cat',    name: '고양이',  emoji: '🐱', price: 500  },
            { key: 'books',  name: '책더미',  emoji: '📚', price: 200  },
            { key: 'ac',     name: '에어컨',  emoji: '❄️', price: 800  },
            { key: 'star',   name: '별',      emoji: '⭐', price: 300  },
            { key: 'music',  name: '스피커',  emoji: '🎵', price: 400  },
            { key: 'cookie', name: '쿠키',   emoji: '🍪', price: 100  },
        ],
    };

    const PROP_LAYOUTS = {
        plant:  { x: 16, y: 74 },
        coffee: { x: 36, y: 76 },
        clock:  { x: 80, y: 26 },
        lamp:   { x: 70, y: 63 },
        trophy: { x: 86, y: 71 },
        pizza:  { x: 52, y: 79 },
        cat:    { x: 27, y: 80 },
        books:  { x: 61, y: 73 },
        ac:     { x: 84, y: 18 },
        star:   { x: 15, y: 22 },
        music:  { x: 43, y: 72 },
        cookie: { x: 58, y: 81 },
    };

    const WALLPAPER_REALISM_BONUS = {
        default: 2,
        blossom: 8,
        night: 12,
        dawn: 10,
        coral: 9,
        forest: 11,
        library: 13,
        space: 14,
    };

    const GroupRooms = {
        myRooms: [],
        activeRoomId: null,
        activeRoomData: null,
        leaderboard: [],
        messages: [],
        activityLog: [],
        refreshInterval: null,
        creatingRoom: false,
        // decor state
        _decor: { wallpaper: 'default', props: [], owned: [] },
        // public browse state
        _browseTab: 'my',
        _publicRooms: [],
        _publicSort: 'study',
        _publicSearchQ: '',
        _publicPage: 1,
        _publicHasMore: false,
        _publicLoading: false,
        _searchTimer: null,

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
            this._bind(document.getElementById('rooms-open-create'),    () => this.showCreateModal());
            this._bind(document.getElementById('rooms-open-join'),       () => this.showJoinModal());
            this._bind(document.getElementById('room-create-cancel'),   () => this.hideCreateModal());
            this._bind(document.getElementById('room-join-cancel'),      () => this.hideJoinModal());
            this._bind(document.getElementById('room-decor-close-btn'), () => this.hideDecorModal());

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
                    <div class="room-card-meta">
                        <span>${members}/${room.max_members}명</span>
                        <span>·</span>
                        <span>${room.is_public ? '🌐 공개' : '🔒 비공개'}</span>
                        <span>·</span>
                        <span>코드 ${room.invite_code}</span>
                    </div>
                </div>`;
            }).join('');
        },

        // ── List view tabs ───────────────────────────────────────────────────
        switchListTab(tab) {
            this._browseTab = tab;
            document.querySelectorAll('.room-list-tab').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tab);
            });
            const myPanel = document.getElementById('room-list-panel-my');
            const pubPanel = document.getElementById('room-list-panel-public');
            if (tab === 'my') {
                myPanel && myPanel.classList.remove('hidden');
                pubPanel && pubPanel.classList.add('hidden');
            } else {
                myPanel && myPanel.classList.add('hidden');
                pubPanel && pubPanel.classList.remove('hidden');
                if (!this._publicRooms.length && !this._publicLoading) {
                    this.loadPublicRooms();
                }
            }
        },

        // ── Public rooms ─────────────────────────────────────────────────────
        async loadPublicRooms(append = false) {
            if (this._publicLoading) return;
            this._publicLoading = true;
            const listEl = document.getElementById('room-public-list');
            const moreBtn = document.getElementById('room-public-load-more');
            if (!append && listEl) {
                listEl.innerHTML = '<div class="rooms-loading">불러오는 중…</div>';
            }
            try {
                const params = new URLSearchParams({
                    sort: this._publicSort,
                    page: this._publicPage,
                });
                if (this._publicSearchQ) params.set('q', this._publicSearchQ);
                const data = await this.apiGet(`/api/rooms/public?${params}`);
                if (append) {
                    this._publicRooms = [...this._publicRooms, ...(data.rooms || [])];
                } else {
                    this._publicRooms = data.rooms || [];
                }
                this._publicHasMore = data.has_more;
                this.renderPublicRooms();
                if (moreBtn) moreBtn.classList.toggle('hidden', !this._publicHasMore);
            } catch (e) {
                if (listEl) listEl.innerHTML = '<div class="rooms-empty"><div class="rooms-empty-icon">😕</div><div class="rooms-empty-text">불러올 수 없어요</div></div>';
            } finally {
                this._publicLoading = false;
            }
        },

        renderPublicRooms() {
            const listEl = document.getElementById('room-public-list');
            if (!listEl) return;
            if (!this._publicRooms.length) {
                listEl.innerHTML = `<div class="rooms-empty">
                    <div class="rooms-empty-icon">🔍</div>
                    <div class="rooms-empty-text">공개된 방이 없어요</div>
                    <div class="rooms-empty-sub">방장이 공개로 설정한 방만 표시됩니다</div>
                </div>`;
                return;
            }
            const myRoomIds = new Set(this.myRooms.map(r => r.id));
            const isSortByStudy = this._publicSort === 'study';
            listEl.innerHTML = this._publicRooms.map((room, i) => {
                const members = parseInt(room.member_count, 10) || 0;
                const todaySec = parseInt(room.today_sec, 10) || 0;
                const isMember = myRoomIds.has(room.id);
                const rankBadge = isSortByStudy && i < 3
                    ? `<span class="room-rank-badge rank-${i}">${['🥇','🥈','🥉'][i]}</span>`
                    : (isSortByStudy ? `<span class="room-rank-badge rank-n">#${i+1}</span>` : '');
                const actionBtn = isMember
                    ? `<button class="room-public-action-btn room-public-action-open" onclick="GroupRooms.openRoom(${room.id})">열기</button>`
                    : `<button class="room-public-action-btn" onclick="GroupRooms.joinPublicRoom('${room.invite_code}')">입장하기</button>`;
                return `<div class="room-card room-card-public">
                    <div class="room-card-header">
                        <div class="room-card-name-row">
                            ${rankBadge}
                            <span class="room-card-name">${esc(room.name)}</span>
                        </div>
                        ${actionBtn}
                    </div>
                    ${room.goal ? `<div class="room-card-goal">${esc(room.goal)}</div>` : ''}
                    <div class="room-card-meta">
                        <span>👥 ${members}/${room.max_members}명</span>
                        <span>·</span>
                        <span>📖 오늘 ${_fmtHM(todaySec)}</span>
                        <span>·</span>
                        <span class="room-creator-label">by ${esc(room.creator_nickname)}</span>
                    </div>
                </div>`;
            }).join('');
        },

        async joinPublicRoom(inviteCode) {
            try {
                await this.handleJoinByCode(inviteCode);
                // Re-render public list to update the button state
                this.renderPublicRooms();
            } catch (e) {
                // handleJoinByCode already shows alert
            }
        },

        setPublicSort(sort) {
            if (this._publicSort === sort) return;
            this._publicSort = sort;
            this._publicPage = 1;
            this._publicRooms = [];
            document.querySelectorAll('.room-sort-pill').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.sort === sort);
            });
            this.loadPublicRooms();
        },

        _onPublicSearch(q) {
            this._publicSearchQ = q;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => {
                this._publicPage = 1;
                this._publicRooms = [];
                this.loadPublicRooms();
            }, 400);
        },

        async loadMorePublic() {
            this._publicPage += 1;
            await this.loadPublicRooms(true);
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
                this._loadDecor(),
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
            const room = this.myRooms.find(r => r.id === this.activeRoomId);
            const myId = typeof UI !== 'undefined' && UI.currentUser ? UI.currentUser.id : null;
            const isCreator = room && myId && String(room.creator_id) === String(myId);

            const creatorSection = document.getElementById('room-settings-creator-section');
            const deleteBtn = document.getElementById('room-settings-delete-btn');
            if (creatorSection) creatorSection.classList.toggle('hidden', !isCreator);
            if (deleteBtn) deleteBtn.classList.toggle('hidden', !isCreator);

            if (room && isCreator) {
                const nameEl   = document.getElementById('room-edit-name');
                const goalEl   = document.getElementById('room-edit-goal');
                const maxEl    = document.getElementById('room-edit-max');
                const publicEl = document.getElementById('room-edit-public');
                if (nameEl)   nameEl.value   = room.name;
                if (goalEl)   goalEl.value   = room.goal || '';
                if (maxEl)    maxEl.value    = room.max_members;
                if (publicEl) publicEl.checked = !!room.is_public;
            }
            modal.classList.remove('hidden');
        },

        hideSettingsModal() {
            document.getElementById('room-settings-modal')?.classList.add('hidden');
        },

        // ── Decoration ────────────────────────────────────────────────────────
        async showDecorModal() {
            const modal = document.getElementById('room-decor-modal');
            if (!modal) return;
            modal.classList.remove('hidden');
            // Update gold display
            const myGold = typeof UI !== 'undefined' && UI.currentUser ? UI.currentUser.gold : null;
            const goldEl = document.getElementById('room-decor-gold-val');
            if (goldEl && myGold !== null) goldEl.textContent = myGold.toLocaleString();
            // Load & render
            await this._loadDecor();
            this.switchDecorTab('wallpaper');
        },

        hideDecorModal() {
            document.getElementById('room-decor-modal')?.classList.add('hidden');
        },

        async _loadDecor() {
            if (!this.activeRoomId) return;
            try {
                const data = await this.apiGet(`/api/rooms/${this.activeRoomId}/decor`);
                this._decor = { wallpaper: data.wallpaper || 'default', props: data.props || [], owned: data.owned || [] };
                this._applyRoomVisual();
            } catch (e) {}
        },

        _applyRoomVisual() {
            const visual = document.getElementById('room-visual');
            if (!visual) return;
            // Swap wallpaper class
            ROOM_SHOP.wallpapers.forEach(w => visual.classList.remove(`wallpaper-${w.key}`));
            visual.classList.add(`wallpaper-${this._decor.wallpaper || 'default'}`);
            // Render props
            const propsEl = document.getElementById('room-props-display');
            if (propsEl) {
                const activeProps = (this._decor.props || []).map(k => ROOM_SHOP.props.find(p => p.key === k)).filter(Boolean);
                propsEl.innerHTML = activeProps.map((p, i) => {
                    const pos = PROP_LAYOUTS[p.key] || { x: 14 + (i * 9), y: 78 - ((i % 3) * 8) };
                    return `<span class="room-prop-badge" title="${esc(p.name)}" style="left:${pos.x}%;top:${pos.y}%;animation-delay:${(i % 5) * -0.55}s">${p.emoji}</span>`;
                }).join('');
            }
            this._renderDecorShowcase();
        },

        switchDecorTab(tab) {
            document.querySelectorAll('.room-decor-tab').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tab);
            });
            document.querySelectorAll('.room-decor-panel').forEach(panel => panel.classList.add('hidden'));
            const panel = document.getElementById(`room-decor-${tab}`);
            if (panel) panel.classList.remove('hidden');

            if (tab === 'wallpaper') this._renderWallpaperTab();
            else if (tab === 'props') this._renderPropsTab();
            else if (tab === 'contrib') this._renderContribTab().catch(() => {});
            else if (tab === 'showcase') this._renderDecorShowcase();
        },

        _ownedKeys() {
            const owned = new Set(this._decor.owned.map(o => o.item_key));
            owned.add('default');
            return owned;
        },

        _renderWallpaperTab() {
            const grid = document.getElementById('room-wallpaper-grid');
            if (!grid) return;
            const owned = this._ownedKeys();
            const current = this._decor.wallpaper || 'default';

            grid.innerHTML = ROOM_SHOP.wallpapers.map(w => {
                const isOwned = owned.has(w.key);
                const isActive = w.key === current;
                return `<div class="room-wp-card ${isActive ? 'room-wp-active' : ''}" onclick="GroupRooms._onWallpaperClick('${w.key}', ${isOwned})">
                    <div class="room-wp-preview wallpaper-${w.key}">
                        <span class="room-wp-emoji">${w.emoji}</span>
                        ${isActive ? '<span class="room-wp-check">✓</span>' : ''}
                    </div>
                    <div class="room-wp-info">
                        <div class="room-wp-name">${esc(w.name)}</div>
                        ${isOwned
                            ? `<div class="room-wp-tag room-wp-owned">${isActive ? '적용 중' : '보유'}</div>`
                            : `<div class="room-wp-tag room-wp-price">🪙 ${w.price.toLocaleString()}G</div>`
                        }
                    </div>
                </div>`;
            }).join('');
        },

        async _onWallpaperClick(key, isOwned) {
            if (!isOwned) {
                await this._buyItem(key);
            } else {
                await this._equipWallpaper(key);
            }
        },

        async _equipWallpaper(key) {
            if (!this.activeRoomId) return;
            try {
                await this.apiPost(`/api/rooms/${this.activeRoomId}/decor/equip`, { wallpaper: key, props: this._decor.props });
                this._decor.wallpaper = key;
                this._applyRoomVisual();
                this._renderWallpaperTab();
                showToast('벽지가 바뀌었어요!');
            } catch (e) { alert(e.message); }
        },

        _renderPropsTab() {
            const grid = document.getElementById('room-props-grid');
            if (!grid) return;
            const owned = this._ownedKeys();
            const active = new Set(this._decor.props || []);

            grid.innerHTML = ROOM_SHOP.props.map(p => {
                const isOwned = owned.has(p.key);
                const isOn = active.has(p.key);
                return `<div class="room-prop-item ${isOn ? 'room-prop-on' : ''}" onclick="GroupRooms._onPropClick('${p.key}', ${isOwned}, ${isOn})">
                    <div class="room-prop-emoji">${p.emoji}</div>
                    <div class="room-prop-name">${esc(p.name)}</div>
                    ${isOwned
                        ? `<div class="room-prop-tag ${isOn ? 'room-prop-tag-on' : 'room-prop-tag-owned'}">${isOn ? '배치 중' : '보유'}</div>`
                        : `<div class="room-prop-tag room-prop-tag-price">🪙 ${p.price.toLocaleString()}G</div>`
                    }
                </div>`;
            }).join('');
        },

        async _onPropClick(key, isOwned, isOn) {
            if (!isOwned) {
                await this._buyItem(key);
                return;
            }
            // Toggle prop on/off
            let props = [...(this._decor.props || [])];
            if (isOn) {
                props = props.filter(k => k !== key);
            } else {
                if (props.length >= 9) { showToast('소품은 최대 9개까지 배치할 수 있어요'); return; }
                props.push(key);
            }
            try {
                await this.apiPost(`/api/rooms/${this.activeRoomId}/decor/equip`, { wallpaper: this._decor.wallpaper, props });
                this._decor.props = props;
                this._applyRoomVisual();
                this._renderPropsTab();
            } catch (e) { alert(e.message); }
        },

        async _buyItem(key) {
            if (!this.activeRoomId) return;
            const all = [...ROOM_SHOP.wallpapers, ...ROOM_SHOP.props];
            const item = all.find(i => i.key === key);
            if (!item) return;
            if (!confirm(`"${item.name}"을(를) ${item.price.toLocaleString()}G에 구매할까요?`)) return;
            try {
                const data = await this.apiPost(`/api/rooms/${this.activeRoomId}/shop/buy`, { item_key: key });
                // Update gold in UI
                if (typeof UI !== 'undefined' && UI.currentUser) {
                    UI.currentUser.gold = data.new_gold;
                    if (UI.elements && UI.elements.goldVal) UI.elements.goldVal.textContent = data.new_gold.toLocaleString();
                    const goldEl = document.getElementById('room-decor-gold-val');
                    if (goldEl) goldEl.textContent = data.new_gold.toLocaleString();
                }
                this._decor.owned.push({ item_key: key });
                showToast(`"${item.name}" 구매 완료! 🎉`);
                // Re-render current tab
                const activeTab = document.querySelector('.room-decor-tab.active')?.dataset.tab;
                if (activeTab) this.switchDecorTab(activeTab);
            } catch (e) { alert(e.message); }
        },

        async _renderContribTab() {
            const list = document.getElementById('room-contrib-list');
            if (!list) return;
            list.innerHTML = '<div class="room-weekly-loading">불러오는 중…</div>';
            try {
                const data = await this.apiGet(`/api/rooms/${this.activeRoomId}/contributions`);
                const contribs = data.contributions || [];
                const total = contribs.reduce((s, c) => s + parseInt(c.total_gold, 10), 0);
                const myId = typeof UI !== 'undefined' && UI.currentUser ? UI.currentUser.id : null;

                list.innerHTML = contribs.length === 0
                    ? '<div class="donut-empty-msg">아직 기여 내역이 없어요<br>소품을 구매해서 방을 꾸며보세요!</div>'
                    : contribs.map((c, i) => {
                        const gold = parseInt(c.total_gold, 10);
                        const pct = total > 0 ? Math.round((gold / total) * 100) : 0;
                        const isMe = String(c.id) === String(myId);
                        const rankEmoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
                        return `<div class="room-contrib-row ${isMe ? 'room-contrib-me' : ''}">
                            <span class="room-contrib-rank">${rankEmoji}</span>
                            <div class="room-contrib-info">
                                <div class="room-contrib-name">${esc(c.nickname)}${isMe ? ' <span class="room-contrib-you">나</span>' : ''}</div>
                                <div class="room-contrib-bar-wrap">
                                    <div class="room-contrib-bar" style="width:${pct}%"></div>
                                </div>
                            </div>
                            <div class="room-contrib-gold">
                                <span class="room-contrib-gold-val">${gold.toLocaleString()}G</span>
                                <span class="room-contrib-pct">${pct}%</span>
                            </div>
                        </div>`;
                    }).join('');
            } catch (e) {
                list.innerHTML = '<div class="donut-empty-msg">기여도를 불러올 수 없어요</div>';
            }
        },

        _getWallpaperName(key) {
            const found = ROOM_SHOP.wallpapers.find(w => w.key === key);
            return found ? found.name : '기본';
        },

        _getDecorSummary() {
            const wallpaper = this._decor.wallpaper || 'default';
            const propKeys = this._decor.props || [];
            const propCount = propKeys.length;
            const uniqueCount = new Set(propKeys).size;

            const rareSet = new Set(['trophy', 'music', 'cat', 'ac', 'clock']);
            const comfortSet = new Set(['plant', 'coffee', 'lamp', 'books', 'cookie']);
            const rareCount = propKeys.filter(k => rareSet.has(k)).length;
            const comfortCount = propKeys.filter(k => comfortSet.has(k)).length;

            const base = 48;
            const wallpaperBonus = WALLPAPER_REALISM_BONUS[wallpaper] || 4;
            const densityBonus = Math.min(30, propCount * 5);
            const varietyBonus = Math.min(8, uniqueCount * 2);
            const balanceBonus = comfortCount >= 2 && rareCount >= 1 ? 6 : (comfortCount >= 1 ? 3 : 0);
            const penalty = propCount === 0 ? 18 : (propCount > 8 ? 6 : 0);

            const score = Math.max(20, Math.min(99, base + wallpaperBonus + densityBonus + varietyBonus + balanceBonus - penalty));

            let grade = '꾸미기 시작';
            if (score >= 90) grade = '전설의 쇼룸';
            else if (score >= 80) grade = '자랑 가능한 시그니처 룸';
            else if (score >= 70) grade = '완성도 높은 스터디룸';
            else if (score >= 60) grade = '분위기 좋은 베이직 룸';

            const moodMap = {
                default: '미니멀하고 집중하기 좋은 기본 무드',
                blossom: '포근하고 다정한 봄빛 무드',
                night: '차분하게 몰입되는 야간 무드',
                dawn: '긴장감 있는 새벽 러시 무드',
                coral: '따뜻하고 활기찬 에너지 무드',
                forest: '호흡이 편안해지는 자연 무드',
                library: '실전 몰입형 하이엔드 서재 무드',
                space: '스케일이 큰 SF 커맨드 무드',
            };

            return {
                score,
                grade,
                wallpaper,
                wallpaperName: this._getWallpaperName(wallpaper),
                propCount,
                mood: moodMap[wallpaper] || '집중형 커스텀 무드',
            };
        },

        _renderDecorShowcase() {
            const summary = this._getDecorSummary();
            const roomName = document.getElementById('room-view-name')?.textContent?.trim() || '우리 방';

            const chip = document.getElementById('room-decor-score-chip');
            if (chip) {
                chip.textContent = `REALISM ${summary.score}`;
            }

            const gradeEl = document.getElementById('room-showcase-grade');
            const scoreEl = document.getElementById('room-showcase-score');
            const moodEl = document.getElementById('room-showcase-mood');
            const captionEl = document.getElementById('room-showcase-caption');

            const caption = `${roomName} | ${summary.wallpaperName} 테마 + 소품 ${summary.propCount}개. 리얼리즘 ${summary.score}점으로 완성!`;
            if (gradeEl) gradeEl.textContent = summary.grade;
            if (scoreEl) scoreEl.textContent = String(summary.score);
            if (moodEl) moodEl.textContent = summary.mood;
            if (captionEl) captionEl.textContent = caption;

            return { ...summary, caption, roomName };
        },

        _generateDecorShareText() {
            const data = this._renderDecorShowcase();
            const code = document.getElementById('room-view-code')?.textContent?.trim() || '';
            const roomUrl = code ? `${location.origin}/room/${code}` : `${location.origin}/timer/`;
            return `🏠 ${data.roomName}\n${data.caption}\n무드: ${data.mood}\n\n같이 꾸미고 공부하러 오기\n${roomUrl}`;
        },

        async copyDecorShowcaseText() {
            const text = this._generateDecorShareText();
            try {
                await navigator.clipboard.writeText(text);
                showToast('룸 자랑 문구를 복사했어요');
            } catch {
                prompt('아래 문구를 복사하세요:', text);
            }
        },

        async shareDecorShowcase() {
            const text = this._generateDecorShareText();
            const code = document.getElementById('room-view-code')?.textContent?.trim() || '';
            const roomUrl = code ? `${location.origin}/room/${code}` : `${location.origin}/timer/`;
            const roomName = document.getElementById('room-view-name')?.textContent?.trim() || '그룹룸';

            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `P.A.T.H 룸 자랑 - ${roomName}`,
                        text,
                        url: roomUrl,
                    });
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') return;
                }
            }

            await this.copyDecorShowcaseText();
        },


        async submitEditRoom() {
            const name = document.getElementById('room-edit-name')?.value.trim();
            const goal = document.getElementById('room-edit-goal')?.value.trim();
            const maxMembers = parseInt(document.getElementById('room-edit-max')?.value, 10) || 10;
            const isPublic = document.getElementById('room-edit-public')?.checked || false;
            if (!name) { alert('방 이름을 입력해주세요.'); return; }

            const btn = document.getElementById('room-edit-submit');
            try {
                if (btn) { btn.disabled = true; btn.textContent = '저장 중…'; }
                const data = await this.apiPatch(`/api/rooms/${this.activeRoomId}`, { name, goal, max_members: maxMembers, is_public: isPublic });
                // Update local data
                const idx = this.myRooms.findIndex(r => r.id === this.activeRoomId);
                if (idx !== -1) {
                    this.myRooms[idx] = { ...this.myRooms[idx], ...data.room };
                    document.getElementById('room-view-name').textContent = data.room.name;
                    const goalEl = document.getElementById('room-view-goal');
                    if (goalEl) goalEl.textContent = data.room.goal || '';
                }
                this.hideSettingsModal();
                showToast(isPublic ? '방이 공개로 설정됐어요 🌐' : '방 정보가 업데이트됐어요');
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
    function _fmtHM(sec) {
        const s = parseInt(sec, 10) || 0;
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        if (h > 0) return `${h}시간 ${m}분`;
        if (m > 0) return `${m}분`;
        return '0분';
    }

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
