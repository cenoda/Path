(function () {
  const SEARCH_HISTORY_KEY = 'path_messages_search_history';
  const SEARCH_HISTORY_LIMIT = 8;
  const CHAT_POLL_MS = 5000;

  let currentChatMode = 'dm';
  let currentChatUserId = null;
  let currentChatUserName = '';
  let currentChatRoomId = null;
  let selectedFile = null;
  let chatPollInterval = null;
  let searchKeyword = '';
  let searchHistory = [];
  let swipePointerId = null;
  let initialOpenHandled = false;

  const conversationCache = {
    convs: [],
    newFriends: [],
    groupConvs: []
  };

  function esc(value) {
    if (value === null || value === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
  }

  function formatClock(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }

  function formatConversationTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return formatClock(value);

    const sameYear = date.getFullYear() === now.getFullYear();
    return sameYear
      ? date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
      : date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  function setListSummary() {
    const countLabel = document.getElementById('list-count-label');
    const unreadLabel = document.getElementById('list-unread-total');
    const total = (conversationCache.convs || []).length + (conversationCache.groupConvs || []).length;
    const unread = (conversationCache.convs || []).reduce(function (sum, item) {
      return sum + Number(item && item.unread_count ? item.unread_count : 0);
    }, 0);

    if (countLabel) countLabel.textContent = total + ' 대화';
    if (unreadLabel) unreadLabel.textContent = '미확인 ' + unread;
  }

  function loadSearchHistory() {
    try {
      const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map(function (value) { return String(value || '').trim(); })
        .filter(Boolean)
        .slice(0, SEARCH_HISTORY_LIMIT);
    } catch (error) {
      return [];
    }
  }

  function saveSearchHistory(values) {
    try {
      localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(values.slice(0, SEARCH_HISTORY_LIMIT)));
    } catch (error) {}
  }

  function pushSearchHistory(term) {
    const keyword = String(term || '').trim();
    if (!keyword) return;
    searchHistory = [keyword].concat(searchHistory.filter(function (item) {
      return item.toLowerCase() !== keyword.toLowerCase();
    })).slice(0, SEARCH_HISTORY_LIMIT);
    saveSearchHistory(searchHistory);
  }

  function setSearchHistoryOpen(open) {
    const history = document.getElementById('conv-search-history');
    if (!history) return;
    history.classList.toggle('hidden', !open);
  }

  function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory([]);
    renderSearchHistory();
  }

  function renderSearchHistory() {
    const history = document.getElementById('conv-search-history');
    if (!history) return;

    if (!searchHistory.length) {
      history.innerHTML = '<div class="conv-history-empty">최근 검색 없음</div>';
      return;
    }

    const keyword = String(searchKeyword || '').trim().toLowerCase();
    const filtered = searchHistory.filter(function (value) {
      return !keyword || value.toLowerCase().indexOf(keyword) >= 0;
    });

    const itemsHtml = filtered.length
      ? filtered.map(function (value) {
          return '<button type="button" class="conv-history-item" data-term="' + encodeURIComponent(value) + '" onclick="applyConversationSearch(decodeURIComponent(this.dataset.term))">' + esc(value) + '</button>';
        }).join('')
      : '<div class="conv-history-empty">일치하는 검색어 없음</div>';

    history.innerHTML = [
      '<div class="conv-history-head">',
      '  <span>최근 검색</span>',
      '  <button type="button" class="conv-history-clear" onclick="clearConversationSearchHistory()">지우기</button>',
      '</div>',
      itemsHtml
    ].join('');
  }

  function applySearch(term) {
    const input = document.getElementById('conv-search');
    if (!input) return;
    input.value = term;
    searchKeyword = String(term || '').trim().toLowerCase();
    pushSearchHistory(term);
    renderSearchHistory();
    renderConversationList();
    setSearchHistoryOpen(false);
  }

  function highlightMatch(value) {
    const raw = String(value || '');
    const keyword = String(searchKeyword || '').trim().toLowerCase();
    if (!keyword) return esc(raw);

    const source = raw.toLowerCase();
    const index = source.indexOf(keyword);
    if (index < 0) return esc(raw);

    const head = esc(raw.slice(0, index));
    const mid = esc(raw.slice(index, index + keyword.length));
    const tail = esc(raw.slice(index + keyword.length));
    return head + '<mark class="msg-highlight">' + mid + '</mark>' + tail;
  }

  function filterByKeyword(values) {
    if (!searchKeyword) return true;
    return values.some(function (value) {
      return String(value || '').toLowerCase().indexOf(searchKeyword) >= 0;
    });
  }

  function closeAllConversationSwipes(exceptShell) {
    document.querySelectorAll('.conv-shell.open').forEach(function (shell) {
      if (exceptShell && shell === exceptShell) return;
      shell.classList.remove('open');
    });
  }

  function renderConversationList() {
    const convItems = document.getElementById('conv-items');
    if (!convItems) return;

    const convs = (conversationCache.convs || []).filter(function (item) {
      return filterByKeyword([item.nickname, item.university, item.last_msg]);
    });
    const groups = (conversationCache.groupConvs || []).filter(function (item) {
      return filterByKeyword([item.room_name, item.last_msg]);
    });
    const newFriends = (conversationCache.newFriends || []).filter(function (item) {
      return filterByKeyword([item.nickname, item.university]);
    });

    const dmHtml = convs.map(function (item) {
      const nickname = String(item.nickname || '사용자');
      const nicknameJson = JSON.stringify(nickname);
      const unread = Number(item.unread_count || 0);
      const imageHtml = item.profile_image_url
        ? '<img src="' + esc(item.profile_image_url) + '" alt="' + esc(nickname) + '">' 
        : esc(nickname).charAt(0);
      const timeHtml = item.last_time ? '<span class="conv-last-time">' + esc(formatConversationTime(item.last_time)) + '</span>' : '';
      const unreadHtml = unread > 0 ? '<span class="conv-unread">' + Math.min(99, unread) + '</span>' : '';

      return [
        '<div class="conv-shell" data-kind="dm" data-id="' + Number(item.other_user) + '" ontouchstart="onConvTouchStart(event,this)" ontouchmove="onConvTouchMove(event,this)" ontouchend="onConvTouchEnd(event,this)">',
        '  <button type="button" class="conv-item" onclick="openChatFromList(' + Number(item.other_user) + ', ' + nicknameJson + ')">',
        '    <div class="conv-avatar ' + (unread > 0 ? 'has-unread' : '') + '">' + imageHtml + '</div>',
        '    <div class="conv-info">',
        '      <div class="conv-row-top">',
        '        <div class="conv-nick">' + highlightMatch(nickname) + ' ' + unreadHtml + '</div>',
        '        <div class="conv-meta-right">' + timeHtml + '</div>',
        '      </div>',
        '      <div class="conv-last">' + highlightMatch(item.last_msg || '') + '</div>',
        '    </div>',
        '    <div class="conv-studying ' + (item.is_studying ? 'active' : '') + '"></div>',
        '  </button>',
        '  <div class="conv-swipe-actions">',
        '    <button type="button" class="conv-swipe-btn" onclick="event.stopPropagation();markConversationRead(\'dm\',' + Number(item.other_user) + ')">읽음</button>',
        '    <button type="button" class="conv-swipe-btn danger" onclick="event.stopPropagation();hideConversation(\'dm\',' + Number(item.other_user) + ')">삭제</button>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    const groupHtml = groups.map(function (item) {
      const roomName = String(item.room_name || '그룹 채팅').trim() || '그룹 채팅';
      const roomNameJson = JSON.stringify(roomName);
      const timeHtml = item.last_time ? '<span class="conv-last-time">' + esc(formatConversationTime(item.last_time)) + '</span>' : '';
      return [
        '<div class="conv-shell" data-kind="group" data-id="' + Number(item.room_id) + '" ontouchstart="onConvTouchStart(event,this)" ontouchmove="onConvTouchMove(event,this)" ontouchend="onConvTouchEnd(event,this)">',
        '  <button type="button" class="conv-item" onclick="openGroupChatFromList(' + Number(item.room_id) + ', ' + roomNameJson + ')">',
        '    <div class="conv-avatar">&#128101;</div>',
        '    <div class="conv-info">',
        '      <div class="conv-row-top">',
        '        <div class="conv-nick">' + highlightMatch(roomName) + '</div>',
        '        <div class="conv-meta-right">' + timeHtml + '</div>',
        '      </div>',
        '      <div class="conv-last">' + highlightMatch(item.last_msg || '아직 채팅이 없습니다') + '</div>',
        '    </div>',
        '    <div class="conv-studying"></div>',
        '  </button>',
        '  <div class="conv-swipe-actions">',
        '    <button type="button" class="conv-swipe-btn danger" onclick="event.stopPropagation();hideConversation(\'group\',' + Number(item.room_id) + ')">숨김</button>',
        '  </div>',
        '</div>'
      ].join('');
    }).join('');

    const newHtml = newFriends.length ? [
      '<div class="conv-section-title">동맹 - 새 대화 시작</div>',
      newFriends.map(function (item) {
        const nickname = String(item.nickname || '사용자');
        return [
          '<button type="button" class="conv-item" onclick="openChatFromList(' + Number(item.id) + ', ' + JSON.stringify(nickname) + ')">',
          '  <div class="conv-avatar is-new">' + esc(nickname).charAt(0) + '</div>',
          '  <div class="conv-info">',
          '    <div class="conv-nick is-muted">' + highlightMatch(nickname) + '</div>',
          '    <div class="conv-last is-muted">첫 메시지를 보내보세요</div>',
          '  </div>',
          '  <div class="conv-studying ' + (item.is_studying ? 'active' : '') + '"></div>',
          '</button>'
        ].join('');
      }).join('')
    ].join('') : '';

    if (!dmHtml && !groupHtml && !newHtml) {
      convItems.innerHTML = '<div class="conv-empty">' + (searchKeyword ? '검색 결과가 없습니다.' : '동맹을 추가하면<br>여기서 대화할 수 있어요.') + '</div>';
      return;
    }

    const sections = [];
    if (dmHtml) sections.push('<div class="conv-section-title">최근 대화</div>' + dmHtml);
    if (newHtml) sections.push(newHtml);
    if (groupHtml) sections.push('<div class="conv-section-title">그룹 채팅</div>' + groupHtml);
    convItems.innerHTML = sections.join('');
  }

  function setListLoading(message, isError) {
    const convItems = document.getElementById('conv-items');
    if (!convItems) return;
    convItems.innerHTML = '<div class="' + (isError ? 'conv-error' : 'conv-empty') + '">' + message + '</div>';
  }

  function setChatPlaceholder(title, subtitle) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = [
      '<div class="chat-placeholder">',
      '  <div class="chat-placeholder__badge">PATH CHAT</div>',
      '  <h2>' + esc(title || '대화를 선택해 주세요') + '</h2>',
      '  <p>' + esc(subtitle || '왼쪽 목록에서 상대를 선택하면 새 채팅 화면이 열립니다.') + '</p>',
      '</div>'
    ].join('');
  }

  function setChatView(active) {
    const listPane = document.getElementById('view-list');
    const chatPane = document.getElementById('view-chat');
    document.body.setAttribute('data-view', active ? 'chat' : 'list');
    if (listPane) listPane.classList.toggle('hidden', !!active);
    if (chatPane) chatPane.classList.toggle('hidden', !active);
  }

  function setHeaderAvatar(options) {
    const avatarWrap = document.getElementById('header-avatar');
    const avatarText = document.getElementById('header-avatar-text');
    const avatarImg = document.getElementById('header-avatar-img');
    const onlineDot = document.getElementById('header-online');
    if (!avatarWrap || !avatarText || !avatarImg || !onlineDot) return;

    const nickname = String(options && options.nickname ? options.nickname : '').trim();
    const isGroup = !!(options && options.isGroup);
    const profileImageUrl = options && options.profileImageUrl ? String(options.profileImageUrl) : '';
    const isOnline = !!(options && options.isOnline);
    const first = nickname.charAt(0) || (isGroup ? 'G' : 'M');

    avatarText.textContent = first;
    if (profileImageUrl) {
      avatarImg.src = profileImageUrl;
      avatarImg.classList.remove('hidden');
      avatarText.classList.add('hidden');
    } else {
      avatarImg.src = '';
      avatarImg.classList.add('hidden');
      avatarText.classList.remove('hidden');
    }

    onlineDot.classList.toggle('hidden', !isOnline);
    avatarWrap.classList.toggle('group', isGroup);
  }

  function setHeaderInfo(title, subtitle, badgeText) {
    const titleEl = document.getElementById('header-title');
    const subEl = document.getElementById('header-sub');
    const badgeEl = document.getElementById('msg-badge');
    const center = document.getElementById('header-center');
    if (titleEl) titleEl.textContent = title || '메시지';
    if (subEl) subEl.textContent = subtitle || '';

    if (badgeEl) {
      const text = String(badgeText || '').trim();
      badgeEl.textContent = text;
      badgeEl.classList.toggle('hidden', !text);
    }

    if (center) {
      center.classList.toggle('clickable', currentChatMode === 'dm' && !!currentChatUserId);
    }
  }

  function getDmMeta(userId) {
    const numericId = Number(userId);
    const current = (conversationCache.convs || []).find(function (item) {
      return Number(item.other_user) === numericId;
    });
    const nextFriend = (conversationCache.newFriends || []).find(function (item) {
      return Number(item.id) === numericId;
    });
    return current || nextFriend || null;
  }

  function syncReadStateForCurrentDm() {
    if (!currentChatUserId) return;
    conversationCache.convs = (conversationCache.convs || []).map(function (item) {
      if (Number(item.other_user) !== Number(currentChatUserId)) return item;
      return Object.assign({}, item, { unread_count: 0 });
    });
    setListSummary();
    renderConversationList();
  }

  function updateDeliveryStatus(messages) {
    const statusEl = document.getElementById('chat-delivery-status');
    if (!statusEl) return;

    if (currentChatMode !== 'dm') {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
      return;
    }

    const mine = (Array.isArray(messages) ? messages : []).filter(function (item) {
      return item && (item.is_mine === true || item.is_mine === 1);
    });
    if (!mine.length) {
      statusEl.textContent = '';
      statusEl.style.display = 'none';
      return;
    }

    const latestMine = mine[mine.length - 1];
    const latestReadMine = mine.slice().reverse().find(function (item) { return !!item.is_read; }) || null;
    const readerName = String(currentChatUserName || '').trim();
    let label = '전송됨';
    let baseMessage = latestMine;

    if (latestReadMine && latestReadMine.id === latestMine.id) {
      label = readerName ? readerName + '님이 읽음' : '읽음';
      baseMessage = latestReadMine;
    } else if (latestReadMine) {
      label = '전송됨 · 이전 메시지 읽음';
    }

    const timeText = baseMessage && baseMessage.created_at ? formatClock(baseMessage.created_at) : '';
    statusEl.textContent = timeText ? label + ' · ' + timeText : label;
    statusEl.style.display = 'block';
  }

  function renderMessages(messages) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    if (!Array.isArray(messages) || !messages.length) {
      setChatPlaceholder('아직 대화가 없습니다', '첫 메시지를 보내 대화를 시작해 보세요.');
      updateDeliveryStatus([]);
      return;
    }

    container.innerHTML = messages.map(function (item, index) {
      const isMine = item.is_mine === true || item.is_mine === 1;
      const prev = messages[index - 1];
      const next = messages[index + 1];
      const prevMine = prev ? (prev.is_mine === true || prev.is_mine === 1) : null;
      const nextMine = next ? (next.is_mine === true || next.is_mine === 1) : null;
      const groupClass = [
        prev && prevMine === isMine ? 'is-grouped-top' : 'is-group-start',
        next && nextMine === isMine ? 'is-grouped-bottom' : 'is-group-end'
      ].join(' ');

      let contentHtml = '';
      if (item.file_path) {
        const isImage = String(item.file_type || '').indexOf('image/') === 0;
        if (isImage) {
          contentHtml = [
            '<div class="file-attachment">',
            '  <img src="' + esc(item.file_path) + '" alt="' + esc(item.file_name || 'image') + '" onclick="window.open(this.src,\'_blank\')">',
            item.content && item.content !== item.file_name ? '  <div style="margin-top:4px;font-size:10px;">' + esc(item.content) + '</div>' : '',
            '</div>'
          ].join('');
        } else {
          const fileSize = item.file_size ? '(' + (Number(item.file_size) / 1024).toFixed(1) + 'KB)' : '';
          contentHtml = [
            '<div class="file-attachment">',
            '  <div class="file-info">',
            '    <div>' + esc(item.file_name || 'file') + '</div>',
            '    <div style="font-size:9px;color:var(--msg-sub);">' + esc(fileSize) + '</div>',
            '  </div>',
            '  <a href="' + esc(item.file_path) + '" download="' + esc(item.file_name || '') + '" class="file-download">다운로드</a>',
            item.content && item.content !== item.file_name ? '  <div style="margin-top:6px;font-size:10px;">' + esc(item.content) + '</div>' : '',
            '</div>'
          ].join('');
        }
      } else {
        const prefix = currentChatMode === 'group' && !isMine
          ? '<div class="group-sender-name">' + esc(item.sender_nickname || '알 수 없음') + '</div>'
          : '';
        contentHtml = prefix + esc(item.content || '');
      }

      return [
        '<div class="msg-row ' + (isMine ? 'mine' : 'theirs') + ' ' + groupClass + '">',
        '  <div class="msg-bubble">' + contentHtml + '</div>',
        '  <div class="msg-time">' + esc(formatClock(item.created_at)) + '</div>',
        '</div>'
      ].join('');
    }).join('');

    container.scrollTop = container.scrollHeight;
    updateDeliveryStatus(messages);
  }

  async function loadChatMessages() {
    if (currentChatMode === 'dm' && !currentChatUserId) return;
    if (currentChatMode === 'group' && !currentChatRoomId) return;

    const endpoint = currentChatMode === 'group'
      ? '/api/messages/group-conversation/' + Number(currentChatRoomId)
      : '/api/messages/conversation/' + Number(currentChatUserId);

    try {
      const response = await fetch(endpoint, { credentials: 'include' });
      if (!response.ok) throw new Error('chat-load-failed');
      const messages = await response.json();
      renderMessages(Array.isArray(messages) ? messages : []);
      if (currentChatMode === 'dm') syncReadStateForCurrentDm();
    } catch (error) {
      setChatPlaceholder('메시지를 불러오지 못했습니다', '잠시 후 다시 시도해 주세요.');
      updateDeliveryStatus([]);
    }
  }

  function stopChatPoll() {
    if (!chatPollInterval) return;
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }

  function startChatPoll() {
    stopChatPoll();
    chatPollInterval = window.setInterval(function () {
      if (document.body.getAttribute('data-view') !== 'chat') {
        stopChatPoll();
        return;
      }
      loadChatMessages();
    }, CHAT_POLL_MS);
  }

  async function openChat(userId, nickname) {
    currentChatMode = 'dm';
    currentChatUserId = Number(userId);
    currentChatUserName = String(nickname || '').trim();
    currentChatRoomId = null;

    const meta = getDmMeta(currentChatUserId);
    setHeaderInfo(
      currentChatUserName || (meta && meta.nickname) || '메시지',
      meta ? (meta.is_studying ? '온라인' : (meta.university || '오프라인')) : '대화 중',
      ''
    );
    setHeaderAvatar({
      nickname: currentChatUserName || (meta && meta.nickname) || '메시지',
      profileImageUrl: meta && meta.profile_image_url ? meta.profile_image_url : '',
      isOnline: !!(meta && meta.is_studying),
      isGroup: false
    });
    setChatView(true);
    setChatPlaceholder('메시지 불러오는 중...', '잠시만 기다려 주세요.');
    await loadChatMessages();
    startChatPoll();
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }

  async function openGroupChat(roomId, roomName) {
    currentChatMode = 'group';
    currentChatRoomId = Number(roomId);
    currentChatUserId = null;
    currentChatUserName = '';

    const meta = (conversationCache.groupConvs || []).find(function (item) {
      return Number(item.room_id) === Number(roomId);
    }) || null;
    const memberCount = Number(meta && meta.member_count ? meta.member_count : 0);

    setHeaderInfo(
      String(roomName || '그룹 채팅'),
      memberCount > 0 ? memberCount + '명 참여' : '그룹 채팅',
      meta && meta.invite_code ? String(meta.invite_code) : ''
    );
    setHeaderAvatar({
      nickname: String(roomName || '그룹'),
      profileImageUrl: '',
      isOnline: false,
      isGroup: true
    });
    cancelFileUpload();
    const fileButton = document.getElementById('btn-file-attach');
    if (fileButton) fileButton.style.display = 'none';
    setChatView(true);
    setChatPlaceholder('그룹 채팅 불러오는 중...', '잠시만 기다려 주세요.');
    await loadChatMessages();
    startChatPoll();
    const input = document.getElementById('chat-input');
    if (input) input.focus();
  }

  async function loadConversations() {
    setListLoading('대화 목록을 불러오는 중...', false);

    try {
      const responses = await Promise.all([
        fetch('/api/messages/conversations', { credentials: 'include' }),
        fetch('/api/friends/list', { credentials: 'include' }),
        fetch('/api/messages/group-conversations', { credentials: 'include' })
      ]);

      const convs = responses[0].ok ? await responses[0].json() : [];
      const friends = responses[1].ok ? await responses[1].json() : [];
      const groups = responses[2].ok ? await responses[2].json() : [];
      const convIds = new Set((Array.isArray(convs) ? convs : []).map(function (item) {
        return Number(item.other_user);
      }));

      conversationCache.convs = Array.isArray(convs) ? convs : [];
      conversationCache.groupConvs = Array.isArray(groups) ? groups : [];
      conversationCache.newFriends = (Array.isArray(friends) ? friends : []).filter(function (item) {
        return !convIds.has(Number(item.id));
      });

      setListSummary();
      renderConversationList();
      maybeOpenInitialConversation();
    } catch (error) {
      setListSummary();
      setListLoading('대화 목록을 불러오지 못했습니다.<br>잠시 후 다시 시도해 주세요.', true);
    }
  }

  function parseInitialConversation() {
    const params = new URLSearchParams(window.location.search || '');
    const dm = Number(params.get('dm') || 0);
    const name = String(params.get('name') || '').trim();
    if (dm > 0) {
      return { mode: 'dm', id: dm, name: name };
    }
    return null;
  }

  function maybeOpenInitialConversation() {
    if (initialOpenHandled) return;
    const initial = parseInitialConversation();
    if (!initial) return;

    initialOpenHandled = true;
    if (initial.mode === 'dm') {
      openChat(initial.id, initial.name);
    }
  }

  async function markRead(kind, id) {
    if (kind !== 'dm') return;
    try {
      const response = await fetch('/api/messages/conversation/' + Number(id) + '/mark-read', {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('mark-read-failed');
      conversationCache.convs = (conversationCache.convs || []).map(function (item) {
        if (Number(item.other_user) !== Number(id)) return item;
        return Object.assign({}, item, { unread_count: 0 });
      });
      setListSummary();
      renderConversationList();
    } catch (error) {}
  }

  async function hideConversationInternal(kind, id) {
    try {
      const numericId = Number(id);
      const endpoint = kind === 'group'
        ? '/api/messages/group-conversation/' + numericId + '/hide'
        : '/api/messages/conversation/' + numericId + '/hide';
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include'
      });
      if (!response.ok) throw new Error('hide-failed');

      if (kind === 'group') {
        conversationCache.groupConvs = (conversationCache.groupConvs || []).filter(function (item) {
          return Number(item.room_id) !== numericId;
        });
      } else {
        conversationCache.convs = (conversationCache.convs || []).filter(function (item) {
          return Number(item.other_user) !== numericId;
        });
      }
      setListSummary();
      renderConversationList();
    } catch (error) {}
  }

  function handleFileSelectInternal(event) {
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('파일 크기는 10MB 이하여야 합니다.');
      event.target.value = '';
      return;
    }

    selectedFile = file;
    const preview = document.getElementById('file-preview');
    const previewName = document.getElementById('file-preview-name');
    if (previewName) {
      previewName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + 'KB)';
    }
    if (preview) preview.classList.remove('hidden');
  }

  function cancelFileUploadInternal() {
    selectedFile = null;
    const input = document.getElementById('chat-file-input');
    const preview = document.getElementById('file-preview');
    if (input) input.value = '';
    if (preview) preview.classList.add('hidden');
  }

  async function sendMessageInternal() {
    const input = document.getElementById('chat-input');
    const content = input ? String(input.value || '').trim() : '';

    if (currentChatMode === 'group') {
      if (!content || !currentChatRoomId) return;
      if (input) input.value = '';
      try {
        const response = await fetch('/api/rooms/' + Number(currentChatRoomId) + '/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ content: content })
        });
        if (!response.ok) {
          const data = await response.json().catch(function () { return {}; });
          throw new Error(data.error || '전송 실패');
        }
        await Promise.all([loadChatMessages(), loadConversations()]);
      } catch (error) {
        alert(error.message || '전송 실패');
        if (input) input.value = content;
      }
      return;
    }

    if (!currentChatUserId) return;

    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('receiver_id', String(currentChatUserId));
      if (content) formData.append('content', content);

      if (input) input.value = '';
      cancelFileUploadInternal();

      try {
        const response = await fetch('/api/messages/send-file', {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
        if (!response.ok) {
          const data = await response.json().catch(function () { return {}; });
          throw new Error(data.error || '파일 전송 실패');
        }
        await Promise.all([loadChatMessages(), loadConversations()]);
      } catch (error) {
        alert(error.message || '파일 전송 실패');
      }
      return;
    }

    if (!content) return;

    if (input) input.value = '';
    try {
      const response = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ receiver_id: currentChatUserId, content: content })
      });
      if (!response.ok) {
        const data = await response.json().catch(function () { return {}; });
        throw new Error(data.error || '전송 실패');
      }
      await Promise.all([loadChatMessages(), loadConversations()]);
    } catch (error) {
      alert(error.message || '전송 실패');
      if (input) input.value = content;
    }
  }

  function bindSearchInput() {
    const input = document.getElementById('conv-search');
    if (!input) return;

    input.addEventListener('focus', function () {
      renderSearchHistory();
      setSearchHistoryOpen(true);
    });

    input.addEventListener('input', function (event) {
      searchKeyword = String(event.target.value || '').trim().toLowerCase();
      renderSearchHistory();
      setSearchHistoryOpen(true);
      renderConversationList();
    });

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        const value = String(input.value || '').trim();
        if (value) pushSearchHistory(value);
        setSearchHistoryOpen(false);
      }
      if (event.key === 'Escape') {
        setSearchHistoryOpen(false);
      }
    });

    input.addEventListener('blur', function () {
      window.setTimeout(function () {
        setSearchHistoryOpen(false);
      }, 120);
    });
  }

  function bindInputArea() {
    const input = document.getElementById('chat-input');
    if (!input) return;

    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessageInternal();
      }
    });
  }

  function bindOutsideClickClose() {
    document.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.conv-shell')) return;
      if (target.closest('#conv-search-history')) return;
      if (target.closest('#conv-search')) return;
      closeAllConversationSwipes();
    });
  }

  function bindViewObserver() {
    const observer = new MutationObserver(function () {
      if (document.body.getAttribute('data-view') !== 'chat') {
        stopChatPoll();
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-view'] });
  }

  function init() {
    searchHistory = loadSearchHistory();
    renderSearchHistory();
    bindSearchInput();
    bindInputArea();
    bindOutsideClickClose();
    bindViewObserver();
    setHeaderInfo('메시지', '대화를 선택해 주세요', '');
    setHeaderAvatar({ nickname: '메시지', profileImageUrl: '', isOnline: false, isGroup: false });
    setChatPlaceholder('대화를 선택해 주세요', '왼쪽 목록에서 상대를 선택하면 새 채팅 화면이 열립니다.');
    loadConversations();
  }

  window.applyConversationSearch = applySearch;
  window.clearConversationSearchHistory = clearSearchHistory;
  window.openChatFromList = function (userId, nickname) {
    if (nickname) pushSearchHistory(nickname);
    openChat(userId, nickname);
  };
  window.openGroupChatFromList = function (roomId, roomName) {
    if (roomName) pushSearchHistory(roomName);
    openGroupChat(roomId, roomName);
  };
  window.markConversationRead = markRead;
  window.hideConversation = hideConversationInternal;
  window.handleFileSelect = handleFileSelectInternal;
  window.cancelFileUpload = cancelFileUploadInternal;
  window.sendMessage = sendMessageInternal;
  window.onHeaderCenterClick = function () {
    return false;
  };
  window.onConvTouchStart = function (event, shell) {
    if (!shell || !event.touches || event.touches.length !== 1) return;
    swipePointerId = String(shell.dataset.kind || '') + ':' + String(shell.dataset.id || '');
    shell.dataset.touchStartX = String(event.touches[0].clientX);
    shell.dataset.touchDeltaX = '0';
  };
  window.onConvTouchMove = function (event, shell) {
    if (!shell || !event.touches || event.touches.length !== 1) return;
    const currentId = String(shell.dataset.kind || '') + ':' + String(shell.dataset.id || '');
    if (swipePointerId !== currentId) return;
    const startX = Number(shell.dataset.touchStartX || 0);
    const deltaX = event.touches[0].clientX - startX;
    shell.dataset.touchDeltaX = String(deltaX);
    if (deltaX < -24) {
      closeAllConversationSwipes(shell);
    }
  };
  window.onConvTouchEnd = function (event, shell) {
    if (!shell) return;
    const deltaX = Number(shell.dataset.touchDeltaX || 0);
    if (deltaX < -42) {
      closeAllConversationSwipes(shell);
      shell.classList.add('open');
    } else if (deltaX > 24) {
      shell.classList.remove('open');
    }
    swipePointerId = null;
  };

  document.addEventListener('DOMContentLoaded', init);
})();