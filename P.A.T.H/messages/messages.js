/* ── 메시지 페이지 스크립트 ── */

'use strict';

// ── 상태 ────────────────────────────────────────────────────────────────────
let currentView = 'list';   // 'list' | 'chat'
let currentChatMode = 'dm'; // 'dm' | 'group'
let currentChatUserId   = null;
let currentChatUserName = null;
let currentChatRoomId   = null;
let chatPollInterval    = null;
let selectedFile        = null;
let searchKeyword       = '';
let searchHistory       = [];
let conversationCache   = { convs: [], newFriends: [], groupConvs: [] };
let _swipePointerId     = null;

const SEARCH_HISTORY_KEY = 'path_messenger_search_history';

// ── 유틸 ────────────────────────────────────────────────────────────────────
function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightMatch(text) {
    const raw = String(text ?? '');
    const escaped = esc(raw);
    const kw = searchKeyword.trim();
    if (!kw) return escaped;
    const idx = raw.toLowerCase().indexOf(kw.toLowerCase());
    if (idx < 0) return escaped;
    return esc(raw.slice(0, idx))
        + `<mark class="msg-highlight">${esc(raw.slice(idx, idx + kw.length))}</mark>`
        + esc(raw.slice(idx + kw.length));
}

// ── 검색 히스토리 ────────────────────────────────────────────────────────────
function loadSearchHistory() {
    try {
        const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed)
            ? parsed.map(v => String(v ?? '').trim()).filter(Boolean).slice(0, 8)
            : [];
    } catch { return []; }
}

function saveSearchHistory(list) {
    try { localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, 8))); } catch {}
}

function pushSearchHistory(kw) {
    const term = String(kw ?? '').trim();
    if (!term) return;
    const next = [term, ...searchHistory.filter(v => v.toLowerCase() !== term.toLowerCase())].slice(0, 8);
    searchHistory = next;
    saveSearchHistory(next);
}

function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory([]);
    renderSearchHistory();
}

function applySearch(term) {
    const input = document.getElementById('conv-search');
    if (input) input.value = term;
    searchKeyword = String(term ?? '').trim().toLowerCase();
    pushSearchHistory(term);
    renderConversations();
    renderSearchHistory();
    setSearchHistoryOpen(false);
}

function setSearchHistoryOpen(open) {
    const el = document.getElementById('conv-search-history');
    if (el) el.classList.toggle('hidden', !open);
}

function renderSearchHistory() {
    const el = document.getElementById('conv-search-history');
    if (!el) return;

    const kw = searchKeyword.trim().toLowerCase();
    const list = searchHistory.filter(v => !kw || v.toLowerCase().includes(kw));

    if (!searchHistory.length) {
        el.innerHTML = '<div class="conv-history-empty">최근 검색 없음</div>';
        return;
    }

    const itemsHtml = list.length
        ? list.map(v =>
            `<button type="button" class="conv-history-item" data-term="${encodeURIComponent(v)}" onclick="applySearch(decodeURIComponent(this.dataset.term))">${esc(v)}</button>`
          ).join('')
        : '<div class="conv-history-empty">일치하는 검색어 없음</div>';

    el.innerHTML = `
        <div class="conv-history-head">
            <span>최근 검색</span>
            <button type="button" class="conv-history-clear" onclick="clearSearchHistory()">지우기</button>
        </div>${itemsHtml}`;
}

// ── 헤더 제어 ────────────────────────────────────────────────────────────────
function setHeaderInfo(title, sub) {
    const t = document.getElementById('header-title');
    const s = document.getElementById('header-sub');
    if (t) t.textContent = title ?? '메시지';
    if (s) s.textContent = sub ?? '';
}

function setHeaderAvatar({ nickname, profileImageUrl, isOnline, isGroup }) {
    const text   = document.getElementById('header-avatar-text');
    const img    = document.getElementById('header-avatar-img');
    const online = document.getElementById('header-online');
    const center = document.getElementById('header-center');
    if (!text || !img || !online) return;

    const first = String(nickname ?? '').trim().charAt(0) || (isGroup ? '👥' : '💬');
    text.textContent = first;

    if (profileImageUrl) {
        img.src = profileImageUrl;
        img.classList.remove('hidden');
        text.classList.add('hidden');
    } else {
        img.src = '';
        img.classList.add('hidden');
        text.classList.remove('hidden');
    }

    online.classList.toggle('hidden', !isOnline);
    if (center) center.classList.toggle('clickable', !isGroup && currentChatMode === 'dm' && !!currentChatUserId);
}

function onHeaderCenterClick() {
    if (currentView !== 'chat' || currentChatMode !== 'dm' || !currentChatUserId) return;
    window.location.href = `/profile?id=${currentChatUserId}`;
}

// ── 뒤로 가기 ────────────────────────────────────────────────────────────────
function handleBack() {
    if (currentView === 'chat') {
        stopChatPoll();
        currentChatMode = 'dm';
        currentChatUserId = null;
        currentChatUserName = null;
        currentChatRoomId = null;
        showView('list');
        setHeaderInfo('메시지', '대화 목록');
        setHeaderAvatar({ nickname: '메시지', profileImageUrl: '', isOnline: false, isGroup: false });
    } else {
        const ref = document.referrer;
        if (ref && new URL(ref).origin === location.origin) {
            history.back();
        } else {
            location.href = '/mainHub/';
        }
    }
}

// ── 뷰 전환 ──────────────────────────────────────────────────────────────────
function showView(name) {
    currentView = name;
    document.getElementById('view-list').classList.toggle('hidden', name !== 'list');
    document.getElementById('view-chat').classList.toggle('hidden', name !== 'chat');
}

// ── 대화 목록 ────────────────────────────────────────────────────────────────
function getContactMeta(userId) {
    const uid = Number(userId);
    return (conversationCache.convs || []).find(c => Number(c.other_user) === uid)
        || (conversationCache.newFriends || []).find(f => Number(f.id) === uid)
        || null;
}

function renderConversations() {
    const container = document.getElementById('conv-items');
    if (!container) return;

    const kw = searchKeyword;
    const filter = (arr, fields) => !kw
        ? arr
        : arr.filter(item => fields.some(fn => String(fn(item) ?? '').toLowerCase().includes(kw)));

    const convs  = filter(conversationCache.convs,      [c => c.nickname, c => c.last_msg]);
    const groups = filter(conversationCache.groupConvs, [g => g.room_name, g => g.last_msg]);
    const newFr  = filter(conversationCache.newFriends, [f => f.nickname, f => f.university]);

    if (!convs.length && !groups.length && !newFr.length) {
        container.innerHTML = `<div class="conv-empty">${kw ? '검색 결과가 없습니다.' : '동맹을 추가하면<br>여기서 대화할 수 있어요.'}</div>`;
        return;
    }

    const dmHtml = convs.map(c => {
        const nickJson = JSON.stringify(String(c.nickname ?? ''));
        const avatarFirst = esc(c.nickname ?? '?').charAt(0);
        const avatarImg = c.profile_image_url
            ? `<img src="${esc(c.profile_image_url)}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : avatarFirst;
        return `
        <div class="conv-shell" data-kind="dm" data-id="${c.other_user}"
             ontouchstart="onConvTouchStart(event,this)"
             ontouchmove="onConvTouchMove(event,this)"
             ontouchend="onConvTouchEnd(event,this)">
            <div class="conv-item" onclick="openChatFromList(${c.other_user}, ${nickJson})">
                <div class="conv-avatar${c.unread_count > 0 ? ' has-unread' : ''}">${avatarImg}</div>
                <div class="conv-info">
                    <div class="conv-nick">
                        ${highlightMatch(c.nickname)}
                        ${c.unread_count > 0 ? `<span class="conv-unread">${c.unread_count}</span>` : ''}
                    </div>
                    <div class="conv-last">${highlightMatch(c.last_msg ?? '')}</div>
                </div>
                <div class="conv-studying${c.is_studying ? ' active' : ''}"></div>
            </div>
            <div class="conv-swipe-actions">
                <button type="button" class="conv-swipe-btn" onclick="event.stopPropagation();markRead('dm',${c.other_user})">읽음</button>
                <button type="button" class="conv-swipe-btn danger" onclick="event.stopPropagation();hideConv('dm',${c.other_user})">삭제</button>
            </div>
        </div>`;
    }).join('');

    const groupHtml = groups.map(g => {
        const roomName = (g.room_name ?? '그룹 채팅').trim() || '그룹 채팅';
        return `
        <div class="conv-shell" data-kind="group" data-id="${g.room_id}"
             ontouchstart="onConvTouchStart(event,this)"
             ontouchmove="onConvTouchMove(event,this)"
             ontouchend="onConvTouchEnd(event,this)">
            <div class="conv-item" onclick="openGroupChatFromList(${g.room_id}, ${JSON.stringify(roomName)})">
                <div class="conv-avatar">👥</div>
                <div class="conv-info">
                    <div class="conv-nick">${highlightMatch(roomName)}</div>
                    <div class="conv-last">${highlightMatch(g.last_msg ?? '아직 채팅이 없습니다')}</div>
                </div>
                <div class="conv-studying"></div>
            </div>
            <div class="conv-swipe-actions">
                <button type="button" class="conv-swipe-btn danger" onclick="event.stopPropagation();hideConv('group',${g.room_id})">숨김</button>
            </div>
        </div>`;
    }).join('');

    const newFrHtml = newFr.length ? `
        <div class="conv-section-title">동맹 - 새 대화 시작</div>
        ${newFr.map(f => `
        <div class="conv-item" onclick="openChatFromList(${f.id}, ${JSON.stringify(String(f.nickname ?? ''))})">
            <div class="conv-avatar is-new">${esc(f.nickname ?? '?').charAt(0)}</div>
            <div class="conv-info">
                <div class="conv-nick is-muted">${highlightMatch(f.nickname)}</div>
                <div class="conv-last is-muted">첫 메시지를 보내보세요</div>
            </div>
            <div class="conv-studying${f.is_studying ? ' active' : ''}"></div>
        </div>`).join('')}` : '';

    const dmSection = convs.length ? `<div class="conv-section-title">최근 대화</div>${dmHtml}` : dmHtml;
    const groupSection = groupHtml ? `<div class="conv-section-title">그룹 채팅</div>${groupHtml}` : '';
    container.innerHTML = dmSection + groupSection + newFrHtml;
}

async function loadConversations() {
    const container = document.getElementById('conv-items');
    if (container) container.innerHTML = '<div class="conv-empty">로딩 중...</div>';

    try {
        const [convRes, friendRes, groupRes] = await Promise.all([
            fetch('/api/messages/conversations',      { credentials: 'include' }),
            fetch('/api/friends/list',                { credentials: 'include' }),
            fetch('/api/messages/group-conversations', { credentials: 'include' })
        ]);
        const convs      = convRes.ok    ? await convRes.json()    : [];
        const friends    = friendRes.ok  ? await friendRes.json()  : [];
        const groupConvs = groupRes.ok   ? await groupRes.json()   : [];

        const convIds   = new Set(convs.map(c => c.other_user));
        const newFriends = friends.filter(f => !convIds.has(f.id));

        conversationCache = { convs, newFriends, groupConvs };
        renderConversations();
    } catch {
        if (container) container.innerHTML = '<div class="conv-error">로드 실패</div>';
    }
}

// ── 대화 열기 ────────────────────────────────────────────────────────────────
function openChatFromList(userId, nickname) {
    if (nickname) pushSearchHistory(nickname);
    openChat(userId, nickname);
}

function openGroupChatFromList(roomId, roomName) {
    if (roomName) pushSearchHistory(roomName);
    openGroupChat(roomId, roomName);
}

async function openChat(userId, nickname) {
    currentChatMode     = 'dm';
    currentChatUserId   = userId;
    currentChatUserName = nickname;
    currentChatRoomId   = null;

    const meta = getContactMeta(userId);
    setHeaderInfo(nickname, meta?.is_studying ? '온라인' : (meta?.university ?? '오프라인'));
    setHeaderAvatar({
        nickname,
        profileImageUrl: meta?.profile_image_url ?? '',
        isOnline: !!meta?.is_studying,
        isGroup: false
    });

    const statusEl = document.getElementById('chat-delivery-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }

    const fileBtn = document.getElementById('btn-file-attach');
    if (fileBtn) fileBtn.style.display = 'inline-flex';

    showView('chat');
    await loadChatMessages();
    setTimeout(() => document.getElementById('chat-input')?.focus(), 20);
    startChatPoll();
}

async function openGroupChat(roomId, roomName) {
    currentChatMode     = 'group';
    currentChatRoomId   = roomId;
    currentChatUserId   = null;
    currentChatUserName = null;

    const groupMeta   = (conversationCache.groupConvs ?? []).find(g => Number(g.room_id) === Number(roomId));
    const memberCount = Number(groupMeta?.member_count ?? 0);
    const memberLabel = memberCount > 0 ? `${memberCount}명 참여` : '그룹 채팅';
    setHeaderInfo(roomName || '그룹 채팅', memberLabel);
    setHeaderAvatar({ nickname: roomName ?? '그룹', profileImageUrl: '', isOnline: false, isGroup: true });

    const statusEl = document.getElementById('chat-delivery-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.style.display = 'none'; }

    cancelFileUpload();
    const fileBtn = document.getElementById('btn-file-attach');
    if (fileBtn) fileBtn.style.display = 'none';

    showView('chat');
    await loadChatMessages();
    setTimeout(() => document.getElementById('chat-input')?.focus(), 20);
    startChatPoll();
}

// ── 메시지 렌더링 ────────────────────────────────────────────────────────────
async function loadChatMessages() {
    if (currentChatMode === 'dm'    && !currentChatUserId)  return;
    if (currentChatMode === 'group' && !currentChatRoomId)  return;

    try {
        const endpoint = currentChatMode === 'group'
            ? `/api/messages/group-conversation/${currentChatRoomId}`
            : `/api/messages/conversation/${currentChatUserId}`;

        const r    = await fetch(endpoint, { credentials: 'include' });
        const msgs = r.ok ? await r.json() : [];
        const container = document.getElementById('chat-messages');

        container.innerHTML = msgs.map((m, i) => {
            const isMine = m.is_mine === true || m.is_mine === 1;
            const time   = new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
            const prev   = msgs[i - 1];
            const next   = msgs[i + 1];
            const pMine  = prev ? (prev.is_mine === true || prev.is_mine === 1) : null;
            const nMine  = next ? (next.is_mine === true || next.is_mine === 1) : null;
            const groupClass = [
                prev && pMine === isMine ? 'is-grouped-top'    : 'is-group-start',
                next && nMine === isMine ? 'is-grouped-bottom' : 'is-group-end'
            ].join(' ');

            let contentHtml = '';
            if (m.file_path) {
                const isImage = m.file_type?.startsWith('image/');
                if (isImage) {
                    contentHtml = `
                        <div class="file-attachment">
                            <img src="${esc(m.file_path)}" alt="${esc(m.file_name ?? 'image')}" onclick="window.open('${esc(m.file_path)}','_blank')">
                            ${m.content !== m.file_name ? `<div style="margin-top:4px;font-size:10px;">${esc(m.content)}</div>` : ''}
                        </div>`;
                } else {
                    const fileIcon = m.file_type?.includes('pdf')   ? '📄'
                                   : m.file_type?.includes('zip')   ? '📦'
                                   : m.file_type?.includes('video') ? '🎥' : '📎';
                    const fileSize = m.file_size ? `(${(m.file_size / 1024).toFixed(1)}KB)` : '';
                    contentHtml = `
                        <div class="file-attachment">
                            <div class="file-info">
                                <span class="file-icon">${fileIcon}</span>
                                <div>
                                    <div>${esc(m.file_name ?? 'file')}</div>
                                    <div style="font-size:9px;color:#888;">${fileSize}</div>
                                </div>
                            </div>
                            <a href="${esc(m.file_path)}" download="${esc(m.file_name ?? '')}" class="file-download">다운로드</a>
                            ${m.content !== m.file_name ? `<div style="margin-top:6px;font-size:10px;">${esc(m.content)}</div>` : ''}
                        </div>`;
                }
            } else {
                const prefix = currentChatMode === 'group' && !isMine
                    ? `<div class="group-sender-name">${esc(m.sender_nickname ?? '알 수 없음')}</div>`
                    : '';
                contentHtml = `${prefix}${esc(m.content)}`;
            }

            return `
            <div class="msg-row ${isMine ? 'mine' : 'theirs'} ${groupClass}">
                <div class="msg-bubble">${contentHtml}</div>
                <div class="msg-time">${time}</div>
            </div>`;
        }).join('');

        container.scrollTop = container.scrollHeight;
        updateDeliveryStatus(msgs);
    } catch {}
}

function updateDeliveryStatus(msgs) {
    const statusEl = document.getElementById('chat-delivery-status');
    if (!statusEl) return;

    if (currentChatMode !== 'dm') {
        statusEl.textContent = '';
        statusEl.style.display = 'none';
        return;
    }

    const myMsgs = (Array.isArray(msgs) ? msgs : []).filter(m => m.is_mine === true || m.is_mine === 1);
    if (!myMsgs.length) {
        statusEl.textContent = '';
        statusEl.style.display = 'none';
        return;
    }

    const latest        = myMsgs[myMsgs.length - 1];
    const latestRead    = [...myMsgs].reverse().find(m => !!m.is_read);
    const readerName    = String(currentChatUserName ?? '').trim();

    let label;
    let baseMsg;
    if (latestRead && latestRead.id === latest.id) {
        label   = readerName ? `${readerName}님이 읽음` : '읽음';
        baseMsg = latestRead;
    } else if (latestRead) {
        label   = '전송됨 · 이전 메시지 읽음';
        baseMsg = latest;
    } else {
        label   = '전송됨';
        baseMsg = latest;
    }

    const t = baseMsg?.created_at
        ? new Date(baseMsg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : '';
    statusEl.textContent = t ? `${label} · ${t}` : label;
    statusEl.style.display = 'block';
}

// ── 메시지 전송 ──────────────────────────────────────────────────────────────
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
        alert('파일 크기는 10MB 이하여야 합니다.');
        event.target.value = '';
        return;
    }
    selectedFile = file;
    const preview     = document.getElementById('file-preview');
    const previewName = document.getElementById('file-preview-name');
    if (previewName) previewName.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`;
    if (preview) preview.classList.remove('hidden');
}

function cancelFileUpload() {
    selectedFile = null;
    const fi = document.getElementById('chat-file-input');
    const fp = document.getElementById('file-preview');
    if (fi) fi.value = '';
    if (fp) fp.classList.add('hidden');
}

async function sendMessage() {
    const input   = document.getElementById('chat-input');
    const content = input?.value.trim() ?? '';

    if (currentChatMode === 'group') {
        if (!content || !currentChatRoomId) return;
        input.value = '';
        try {
            const r = await fetch(`/api/rooms/${currentChatRoomId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ content })
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                alert(d.error ?? '전송 실패');
                input.value = content;
                return;
            }
            await loadChatMessages();
        } catch {}
        return;
    }

    if (selectedFile) {
        if (!currentChatUserId) return;
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('receiver_id', currentChatUserId);
        if (content) formData.append('content', content);
        if (input) input.value = '';
        cancelFileUpload();
        try {
            const r = await fetch('/api/messages/send-file', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                alert(d.error ?? '전송 실패');
            } else {
                await loadChatMessages();
            }
        } catch { alert('파일 전송 실패'); }
        return;
    }

    if (!content || !currentChatUserId) return;
    if (input) input.value = '';
    try {
        const r = await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ receiver_id: currentChatUserId, content })
        });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            alert(d.error ?? '전송 실패');
            if (input) input.value = content;
            return;
        }
        await loadChatMessages();
    } catch {}
}

// ── 폴링 ────────────────────────────────────────────────────────────────────
function startChatPoll() {
    stopChatPoll();
    chatPollInterval = setInterval(() => {
        if (currentChatMode === 'group' && currentChatRoomId)  { loadChatMessages(); return; }
        if (currentChatMode === 'dm'    && currentChatUserId)  { loadChatMessages(); }
    }, 5000);
}

function stopChatPoll() {
    if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

// ── 스와이프 액션 ──────────────────────────────────────────────────────────
function closeAllSwipes(except = null) {
    document.querySelectorAll('.conv-shell.open').forEach(el => {
        if (except && el === except) return;
        el.classList.remove('open');
    });
}

function onConvTouchStart(event, shell) {
    if (!shell || event.touches.length !== 1) return;
    _swipePointerId      = `${shell.dataset.kind}:${shell.dataset.id}`;
    shell.dataset.touchStartX = String(event.touches[0].clientX);
    shell.dataset.touchDeltaX = '0';
}

function onConvTouchMove(event, shell) {
    if (!shell || event.touches.length !== 1) return;
    const id = `${shell.dataset.kind}:${shell.dataset.id}`;
    if (_swipePointerId !== id) return;
    const dx = event.touches[0].clientX - Number(shell.dataset.touchStartX ?? 0);
    shell.dataset.touchDeltaX = String(dx);
    if (dx < -24) closeAllSwipes(shell);
}

function onConvTouchEnd(event, shell) {
    if (!shell) return;
    const dx = Number(shell.dataset.touchDeltaX ?? 0);
    if (dx < -42)     { closeAllSwipes(shell); shell.classList.add('open'); }
    else if (dx > 24) { shell.classList.remove('open'); }
    _swipePointerId = null;
}

async function markRead(kind, id) {
    if (kind !== 'dm') return;
    const targetId = Number(id);
    try {
        const r = await fetch(`/api/messages/conversation/${targetId}/mark-read`, {
            method: 'POST',
            credentials: 'include'
        });
        if (!r.ok) return;
        conversationCache.convs = (conversationCache.convs ?? []).map(c =>
            Number(c.other_user) === targetId ? { ...c, unread_count: 0 } : c
        );
        renderConversations();
    } catch {}
}

async function hideConv(kind, id) {
    const numericId = Number(id);
    const endpoint  = kind === 'group'
        ? `/api/messages/group-conversation/${numericId}/hide`
        : `/api/messages/conversation/${numericId}/hide`;
    try {
        const r = await fetch(endpoint, { method: 'POST', credentials: 'include' });
        if (!r.ok) return;
        if (kind === 'dm') {
            conversationCache.convs = (conversationCache.convs ?? []).filter(c => Number(c.other_user) !== numericId);
        } else {
            conversationCache.groupConvs = (conversationCache.groupConvs ?? []).filter(g => Number(g.room_id) !== numericId);
        }
        renderConversations();
    } catch {}
}

// ── URL 파라미터로 직접 채팅 진입 ──────────────────────────────────────────
function handleInitialRoute() {
    const params = new URLSearchParams(location.search);
    const dm      = params.get('dm');
    const name    = params.get('name');
    const group   = params.get('group');
    const gname   = params.get('gname');

    if (dm) {
        openChat(Number(dm), decodeURIComponent(name ?? ''));
    } else if (group) {
        openGroupChat(Number(group), decodeURIComponent(gname ?? '그룹 채팅'));
    }
}

// ── 검색창 이벤트 바인딩 ─────────────────────────────────────────────────────
function bindSearchInput() {
    const input = document.getElementById('conv-search');
    if (!input) return;

    input.addEventListener('focus', () => {
        renderSearchHistory();
        setSearchHistoryOpen(true);
    });
    input.addEventListener('input', () => {
        searchKeyword = input.value.trim().toLowerCase();
        renderSearchHistory();
        setSearchHistoryOpen(true);
        renderConversations();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const v = input.value.trim();
            if (v) pushSearchHistory(v);
            setSearchHistoryOpen(false);
        } else if (e.key === 'Escape') {
            setSearchHistoryOpen(false);
        }
    });
    input.addEventListener('blur', () => {
        setTimeout(() => setSearchHistoryOpen(false), 120);
    });
}

// ── 외부 클릭 시 스와이프 닫기 ───────────────────────────────────────────────
document.addEventListener('click', e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('.conv-shell')) return;
    closeAllSwipes();
});

// ── 초기화 ───────────────────────────────────────────────────────────────────
(async () => {
    // 인증 확인
    try {
        const r = await fetch('/api/me', { credentials: 'include' });
        if (!r.ok) { location.replace('/login/?next=' + encodeURIComponent(location.href)); return; }
    } catch {
        location.replace('/login/');
        return;
    }

    searchHistory = loadSearchHistory();
    bindSearchInput();
    setHeaderInfo('메시지', '대화 목록');
    setHeaderAvatar({ nickname: '메시지', profileImageUrl: '', isOnline: false, isGroup: false });

    await loadConversations();
    handleInitialRoute();
})();
