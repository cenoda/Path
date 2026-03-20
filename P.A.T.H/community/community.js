/**
 * community.js — P.A.T.H 커뮤니티 컨트롤러 (실서버 연동)
 *
 * API:
 *   GET  /api/community/posts?page=&limit=&category=&q=
 *   GET  /api/community/posts/hot?category=
 *   POST /api/community/uploads/image
 *   POST /api/community/posts
 *   POST /api/community/posts/:id/view
 *   POST /api/community/posts/:id/like
 *   POST /api/community/posts/:id/gold-like
 *   GET  /api/community/posts/:id/comments
 *   POST /api/community/posts/:id/comments
 */

import { PostListItem, SkeletonItem, CATEGORY_META } from './PostListItem.js';
import { useInfiniteScroll }                          from './useInfiniteScroll.js';

/* ─── 상수 ─────────────────────────────────────────────────── */
const PAGE_SIZE     = 25;
const HOT_THRESHOLD = 15;  // 베스트 승격 기준(추천 15+)
const WRITABLE_CATS = ['정보', '질문', '잡담'];
const GOLD_LIKE_COST = 30;
const WRITE_DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;
const COMMUNITY_SETTINGS_KEY = 'path.community.settings.v1';
const SETTINGS_ACTIVITY_PAGE_SIZE = 8;
const SETTINGS_ACTIVITY_TYPES = ['posts', 'comments', 'likes', 'bookmarks', 'commentLikes'];
const DEFAULT_COMMUNITY_SETTINGS = {
  layout: 'comfortable',
  hideBest: false,
  hideAd: false,
  hideMediaBadge: false,
};

/* ─── 카테고리 탭 ───────────────────────────────────────────── */
const CATEGORIES = [
    { key: '전체', label: '전체' },
    { key: '념글', label: '베스트' },
    { key: '정보', label: '정보'  },
    { key: '질문', label: 'Q&A'   },
    { key: '잡담', label: '잡담'  },
];

/* ─── 상태 ─────────────────────────────────────────────────── */
let currentCat   = '전체';
let currentPage  = 0;
let totalPosts   = 0;
let searchQuery  = '';
let currentSort  = 'latest';
let scrollHook   = null;
let isLoading    = false;
let currentUser  = null;  // { id, nickname, is_admin, admin_role } | null
let currentUserBlocks = new Set();
let communitySettings = { ...DEFAULT_COMMUNITY_SETTINGS };
let openedInlinePostId = null;
let openedInlineDetailEl = null;

const REPORT_REASON_OPTIONS = [
  { code: 'spam', label: '도배/광고' },
  { code: 'abuse', label: '욕설/괴롭힘' },
  { code: 'sexual', label: '성적/음란 콘텐츠' },
  { code: 'hate', label: '혐오/차별 표현' },
  { code: 'personal_info', label: '개인정보 노출' },
  { code: 'illegal', label: '불법 정보' },
  { code: 'other', label: '기타' },
];

/* ─── DOM ───────────────────────────────────────────────────── */
const categoryBar    = document.getElementById('category-bar');
const hotList        = document.getElementById('hot-list');
const hotSection     = document.getElementById('hot-section');
const postList       = document.getElementById('post-list');
const sentinel       = document.getElementById('scroll-sentinel');
const postCountBadge = document.getElementById('post-count-badge');
const searchToggle   = document.getElementById('search-toggle');
const searchWrap     = document.getElementById('search-wrap');
const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const settingsToggle = document.getElementById('settings-toggle');
const writeFab       = document.getElementById('write-fab');
const themeToggleBtn = document.getElementById('theme-toggle');
const adContainer = document.querySelector('.c-ad-container');
const sortChips = Array.from(document.querySelectorAll('.c-sort-chip'));

const REQUIRED_DOM = {
  categoryBar,
  hotList,
  hotSection,
  postList,
  sentinel,
  postCountBadge,
};

function hasRequiredDom() {
  const missing = Object.entries(REQUIRED_DOM)
    .filter(([, el]) => !el)
    .map(([name]) => name);

  if (missing.length === 0) return true;

  console.error('[community] missing required DOM nodes:', missing.join(', '));

  const root = document.querySelector('.c-main') || document.body;
  if (root && !document.getElementById('community-init-error')) {
    const box = document.createElement('div');
    box.id = 'community-init-error';
    box.className = 'c-empty';
    box.innerHTML = `
      <div class="c-empty__icon">⚠️</div>
      <p class="c-empty__title">페이지를 불러오는 중 문제가 발생했어요</p>
      <p class="c-empty__desc">잠시 후 새로고침해 주세요</p>`;
    root.appendChild(box);
  }

  return false;
}

/* ─── 테마(다크/라이트) ───────────────────────────────────── */
function getSystemFallbackTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

function applyThemeFromStorage() {
  const fallback = getSystemFallbackTheme();
  if (window.PathTheme && typeof window.PathTheme.applyStoredTheme === 'function') {
    window.PathTheme.applyStoredTheme({ fallback });
    syncThemeButton();
    return;
  }

  const savedTheme = localStorage.getItem('path_theme');
  const isLight = savedTheme ? savedTheme === 'light' : fallback === 'light';
  document.body.classList.toggle('light', isLight);
  syncThemeButton();
}

function toggleTheme() {
  const nextIsLight = !document.body.classList.contains('light');
  if (window.PathTheme && typeof window.PathTheme.setLightMode === 'function') {
    window.PathTheme.setLightMode(nextIsLight, { fallback: getSystemFallbackTheme() });
  } else {
    document.body.classList.toggle('light', nextIsLight);
    localStorage.setItem('path_theme', nextIsLight ? 'light' : 'dark');
  }
  syncThemeButton();
}

function syncThemeButton() {
  if (!themeToggleBtn) return;
  const isLight = document.body.classList.contains('light');
  themeToggleBtn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
  themeToggleBtn.setAttribute('aria-label', isLight ? '다크 모드 전환' : '라이트 모드 전환');
  themeToggleBtn.title = isLight ? '다크 모드 전환' : '라이트 모드 전환';
}

/* ─── 초기화 ──────────────────────────────────────────────── */
async function init() {
  if (!hasRequiredDom()) return;

  loadCommunitySettings();
  applyThemeFromStorage();
  applyCommunitySettings();
    syncSortChips();
    buildCategoryBar();
    bindEvents();

    // 로그인 상태 확인 (실패해도 게시판은 열람 가능)
    try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const me = await res.json();
        currentUser = me.user || me;

        const blocksRes = await fetch('/api/community/blocks', { credentials: 'include' });
        if (blocksRes.ok) {
          const blocksData = await blocksRes.json();
          const ids = (blocksData.blocks || []).map((b) => Number(b.blocked_id)).filter((n) => Number.isInteger(n));
          currentUserBlocks = new Set(ids);
        }
      }
    } catch (_) { /* 무시 */ }

    updateWriteControls();

    await Promise.all([renderHotPosts(), resetAndLoad({ preserveInlineUrl: true })]);
    await syncInlinePostFromLocation();
}

/* ─── 카테고리 탭 빌드 ───────────────────────────────────── */
function buildCategoryBar() {
    categoryBar.innerHTML = '';
    CATEGORIES.forEach(({ key, label }) => {
        const btn = document.createElement('button');
        btn.className = 'c-cat-chip';
        btn.textContent = label;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', key === currentCat ? 'true' : 'false');
        btn.addEventListener('click', () => onCatChange(key));
        categoryBar.appendChild(btn);
    });
}

function onCatChange(key) {
    if (key === currentCat) return;
    currentCat = key;
    categoryBar.querySelectorAll('.c-cat-chip').forEach((btn, i) => {
        const active = CATEGORIES[i].key === key;
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    updateWriteControls();
    renderHotPosts();
    resetAndLoad();
}

  function updateWriteControls() {
    const blocked = currentCat === '념글';
    const title = blocked ? '베스트 게시판에는 직접 글을 작성할 수 없어요' : '글쓰기';

    [writeFab].forEach((btn) => {
      if (!btn) return;
      btn.disabled = blocked;
      btn.title = title;
      btn.style.opacity = blocked ? '0.45' : '';
      btn.style.cursor = blocked ? 'not-allowed' : '';
    });
  }

/* ─── 베스트 게시글 ─────────────────────────────────────── */
async function renderHotPosts() {
  if (communitySettings.hideBest) {
    hotList.innerHTML = '';
    hotSection.hidden = true;
    return;
  }

    // 스켈레톤
    hotList.innerHTML = '';
    hotSection.hidden = false;
    for (let i = 0; i < 4; i++) {
        const s = document.createElement('li');
        s.className = 'c-hot-skel';
        hotList.appendChild(s);
    }

    try {
        const url = `/api/community/posts/hot${currentCat !== '전체' ? `?category=${encodeURIComponent(currentCat)}` : ''}`;
        const res  = await fetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(res.status);
        const { posts } = await res.json();

        hotList.innerHTML = '';
        if (!posts.length) { hotSection.hidden = true; return; }
        posts.forEach(p => hotList.appendChild(HotCard(p)));
    } catch (_) {
        hotSection.hidden = true;
    }
}

function HotCard(post) {
    const cat = CATEGORY_META[post.category] ?? CATEGORY_META['전체'];
    const li  = document.createElement('li');
    const postUrl = getPostDetailUrl(post.id);
    li.innerHTML = `
      <a class="c-hot-card" href="${postUrl}" data-post-id="${post.id}">
        <div class="c-hot-card__cat ${cat.cls}">${cat.label}</div>
        <p class="c-hot-card__title">${escHtml(post.title)}</p>
        <div class="c-hot-card__footer">
          <span class="c-hot-card__author">${renderNicknameWithBadge({
            nickname: post.display_nickname || post.nickname || '익명',
            isVerifiedNickname: post.is_verified_nickname,
            userId: post.user_id,
            profileImageUrl: post.profile_image_url,
            className: 'js-open-user-profile'
          })}(${escHtml(post.ip_prefix ?? '?')})</span>
          <span class="c-hot-card__stats">
            <span class="c-hot-card__stat">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
              </svg>${post.likes}
            </span>
            <span class="c-hot-card__stat" style="color:var(--text-2)">
              <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
                <path d="M2 2h8a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4l-2 2V3a1 1 0 0 1 1-1z"/>
              </svg>${post.comments_count}
            </span>
          </span>
        </div>
      </a>`;
    bindUserProfileTriggers(li);
    return li;
}

/* ─── 목록 초기화 + 첫 로드 ─────────────────────────────── */
async function resetAndLoad(options = {}) {
  const preserveInlineUrl = !!options.preserveInlineUrl;
  if (preserveInlineUrl) clearInlinePostDetailState();
  else closeInlinePostDetail({ updateHistory: true, replaceHistory: true });
    currentPage = 0;
    totalPosts  = 0;
    postList.innerHTML = '';
    if (scrollHook) { scrollHook.disconnect(); scrollHook = null; }

    // 스켈레톤
    for (let i = 0; i < 10; i++) postList.appendChild(SkeletonItem());

    await loadNextPage();

    scrollHook = useInfiniteScroll({
        onLoadMore: loadNextPage,
        hasMore:    () => currentPage * PAGE_SIZE < totalPosts,
        sentinel,
    });
}

/* ─── 페이지 로드 ────────────────────────────────────────── */
async function loadNextPage() {
    if (isLoading) return;
    isLoading = true;

    // 추가 스켈레톤 (2페이지~ )
    const extraSkels = [];
    if (currentPage > 0) {
        for (let i = 0; i < 5; i++) {
            const s = SkeletonItem();
            postList.appendChild(s);
            extraSkels.push(s);
        }
    }

    const params = new URLSearchParams({
        page:  currentPage,
        limit: PAGE_SIZE,
        category: currentCat,
      sort: currentSort,
    });
    if (searchQuery) params.set('q', searchQuery);

    try {
        const res = await fetch(`/api/community/posts?${params}`, { credentials: 'include' });
        if (!res.ok) throw new Error(res.status);
        const { total, posts } = await res.json();

        // 스켈레톤 제거
        postList.querySelectorAll('.skel-row').forEach(s => s.remove());
        extraSkels.forEach(s => s.remove());

        totalPosts = total;
        updateBadge(total);

        if (currentPage === 0 && posts.length === 0) {
            renderEmpty();
            isLoading = false;
            return;
        }

        const offset = currentPage * PAGE_SIZE;
        const frag   = document.createDocumentFragment();
        posts.forEach((post, i) => {
            const isHot      = post.likes >= HOT_THRESHOLD;
            const displayNum = total - offset - i;
            frag.appendChild(PostListItem({
                id:           post.id,
                displayNum,
                isHot,
              hasImage:     Boolean(post.has_image || post.image_url),
                category:     post.category,
                title:        post.title,
                nickname:     post.display_nickname || post.nickname || '익명',
                userId:       post.user_id,
                isVerifiedNickname: Boolean(post.is_verified_nickname),
                profileImageUrl: post.profile_image_url || '',
                ipPrefix:     post.ip_prefix ?? '?.?',
                likes:        post.likes,
                comments:     post.comments_count,
                views:        post.views,
                createdAt:    post.created_at,
                canBookmark:  !!currentUser,
                isBookmarked: !!post.is_bookmarked,
            }));
        });
        postList.appendChild(frag);

        // 클릭 이벤트 (게시글 상세)
        bindPostClicks();

        currentPage++;
    } catch (err) {
        postList.querySelectorAll('.skel-row').forEach(s => s.remove());
        extraSkels.forEach(s => s.remove());
        if (currentPage === 0) renderError();
        console.error('[community] loadNextPage', err);
    } finally {
        isLoading = false;
    }
}

/* ─── 게시글 클릭 → 조회수 증가 + 상세 열기 ──────────────── */
function bindPostClicks() {
  bindUserProfileTriggers(postList);

    postList.querySelectorAll('.post-row__bookmark-btn:not([data-bookmark-bound])').forEach((btn) => {
      btn.dataset.bookmarkBound = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
          showToast('로그인 후 이용할 수 있어요');
          return;
        }

        const postId = Number(btn.dataset.postId || 0);
        if (!postId) return;

        const before = btn.dataset.bookmarked === '1';
        const after = !before;

        // 낙관적 업데이트: 즉시 UI 반영
        applyRowBookmarkState(btn, after);
        btn.disabled = true;

        try {
          const r = await fetch(`/api/community/posts/${postId}/bookmark`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!r.ok) {
            applyRowBookmarkState(btn, before);
            const msg = await readApiError(r, '북마크 처리에 실패했어요');
            if (msg) showToast(msg);
            return;
          }

          const data = await r.json().catch(() => ({}));
          const serverBookmarked = !!data.bookmarked;
          applyRowBookmarkState(btn, serverBookmarked);
          showToast(serverBookmarked ? '북마크에 저장했어요' : '북마크를 해제했어요');
        } catch (_) {
          applyRowBookmarkState(btn, before);
          showToast('북마크 처리 중 오류가 발생했어요');
        } finally {
          btn.disabled = false;
        }
      });
    });

    postList.querySelectorAll('.post-row:not([data-bound])').forEach((row) => {
        row.dataset.bound = '1';
        row.addEventListener('click', (e) => {
            const bookmarkBtn = e.target.closest('.post-row__bookmark-btn');
            if (bookmarkBtn) return;
            const userProfileBtn = e.target.closest('.js-open-user-profile');
            if (userProfileBtn) return;

            const id = parseInt(row.dataset.id, 10);
            if (!id) return;
            markPostViewed(id);
        });
    });
}

function applyRowBookmarkState(buttonEl, bookmarked) {
  const active = !!bookmarked;
  buttonEl.dataset.bookmarked = active ? '1' : '0';
  buttonEl.classList.toggle('is-active', active);
  const label = active ? '북마크 해제' : '북마크';
  buttonEl.setAttribute('aria-label', label);
  buttonEl.title = label;
}

/* ─── 게시글 상세 모달 ───────────────────────────────────── */
async function openPostDetail(postId) {
  return openPostInline(postId, { updateHistory: true });
}

function getPostDetailUrl(postId) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return '/community/';
  return `/community/post/${id}`;
}

function getListUrl() {
  return '/community/';
}

function getPostIdFromPath(pathname) {
  const match = String(pathname || '').match(/^\/community\/post\/(\d+)\/?$/);
  if (!match) return 0;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function getPostIdFromHref(href) {
  if (!href) return 0;
  try {
    const url = new URL(href, window.location.origin);
    return getPostIdFromPath(url.pathname);
  } catch (_) {
    return 0;
  }
}

function updateUrlForPost(postId, { replace = false } = {}) {
  const target = postId > 0 ? getPostDetailUrl(postId) : getListUrl();
  if (window.location.pathname === target) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({ communityPostId: postId > 0 ? postId : null }, '', target);
}

function findPostRow(postId) {
  return postList.querySelector(`.post-row[data-id="${postId}"]`);
}

function setActivePostHighlight(postId) {
  postList.querySelectorAll('.post-row.is-open').forEach((el) => el.classList.remove('is-open'));
  hotList.querySelectorAll('.c-hot-card.is-open').forEach((el) => el.classList.remove('is-open'));

  if (!postId) return;

  const row = findPostRow(postId);
  if (row) row.classList.add('is-open');

  const hotCard = hotList.querySelector(`.c-hot-card[data-post-id="${postId}"]`);
  if (hotCard) hotCard.classList.add('is-open');
}

function closeInlinePostDetail({ updateHistory = true, replaceHistory = false } = {}) {
  if (openedInlineDetailEl) {
    openedInlineDetailEl.remove();
    openedInlineDetailEl = null;
  }
  openedInlinePostId = null;
  setActivePostHighlight(0);

  if (updateHistory) {
    updateUrlForPost(0, { replace: replaceHistory });
  }
}

function clearInlinePostDetailState() {
  if (openedInlineDetailEl) {
    openedInlineDetailEl.remove();
  }
  openedInlineDetailEl = null;
  openedInlinePostId = null;
  setActivePostHighlight(0);
}

async function ensurePostRowVisible(postId, maxPages = 8) {
  let row = findPostRow(postId);
  let loaded = 0;

  while (!row && loaded < maxPages && currentPage * PAGE_SIZE < totalPosts) {
    await loadNextPage();
    loaded += 1;
    row = findPostRow(postId);
  }

  return row;
}

async function openPostInline(postId, options = {}) {
  const {
    updateHistory = true,
    replaceHistory = false,
    sourceRow = null,
    scrollIntoView = true,
  } = options;

  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return;

  if (openedInlinePostId === id && openedInlineDetailEl) {
    closeInlinePostDetail({ updateHistory, replaceHistory });
    return;
  }

  markPostViewed(id);

  if (openedInlineDetailEl) {
    openedInlineDetailEl.remove();
    openedInlineDetailEl = null;
  }

  let anchorRow = sourceRow;
  if (!(anchorRow instanceof HTMLElement) || !anchorRow.classList.contains('post-row')) {
    anchorRow = await ensurePostRowVisible(id);
  }

  const detailRow = document.createElement('li');
  detailRow.className = 'post-inline-detail';
  detailRow.dataset.postDetailId = String(id);
  detailRow.innerHTML = `
    <section class="post-inline-detail__panel" role="region" aria-label="게시글 상세">
      <div class="post-inline-detail__head">
        <button class="post-inline-detail__close" type="button" aria-label="상세 닫기">목록으로</button>
      </div>
      <div class="post-inline-detail__body">
        <p class="community-settings-loading">게시글을 불러오는 중...</p>
      </div>
    </section>`;

  if (anchorRow?.parentElement === postList) {
    anchorRow.insertAdjacentElement('afterend', detailRow);
  } else {
    postList.prepend(detailRow);
  }

  openedInlinePostId = id;
  openedInlineDetailEl = detailRow;
  setActivePostHighlight(id);

  if (updateHistory) {
    updateUrlForPost(id, { replace: replaceHistory });
  }

  detailRow.querySelector('.post-inline-detail__close')?.addEventListener('click', () => {
    closeInlinePostDetail({ updateHistory: true });
  });

  const bodyEl = detailRow.querySelector('.post-inline-detail__body');

  try {
    const [postRes, commentsRes] = await Promise.all([
      fetch(`/api/community/posts/${id}`, { credentials: 'include' }),
      fetch(`/api/community/posts/${id}/comments`, { credentials: 'include' }),
    ]);

    if (!postRes.ok) {
      const msg = await readApiError(postRes, '게시글을 불러오지 못했어요');
      throw new Error(msg || '게시글을 불러오지 못했어요');
    }

    const postData = await postRes.json().catch(() => ({}));
    const commentsData = commentsRes.ok ? await commentsRes.json().catch(() => ({})) : {};
    const post = postData?.post;
    const comments = Array.isArray(commentsData?.comments) ? commentsData.comments : [];

    if (!post) {
      throw new Error('게시글을 불러오지 못했어요');
    }

    if (openedInlinePostId !== id || openedInlineDetailEl !== detailRow) return;
    renderDetailBody(bodyEl, { post, postId: id, comments, commentSort: 'latest' });

    if (scrollIntoView) {
      detailRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  } catch (err) {
    if (openedInlinePostId !== id || openedInlineDetailEl !== detailRow) return;
    bodyEl.innerHTML = `<p class="community-settings-loading">${escHtml(err?.message || '게시글을 불러오지 못했어요')}</p>`;
  }
}

async function syncInlinePostFromLocation() {
  const postId = getPostIdFromPath(window.location.pathname);
  if (postId > 0) {
    await openPostInline(postId, {
      updateHistory: false,
      scrollIntoView: false,
    });
    return;
  }

  closeInlinePostDetail({ updateHistory: false });
}

function markPostViewed(postId) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return;

  fetch(`/api/community/posts/${id}/view`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
  }).catch(() => {});
}

function renderDetailBody(container, { post, postId, comments, commentSort = 'latest' }) {
    const cat     = CATEGORY_META[post.category] ?? CATEGORY_META['전체'];
  const canModerateComments = currentUserIsAdmin();
  const currentUserId = Number(currentUser?.id || 0);
  const postAuthorId = Number(post.user_id || 0);
  const isPostAuthor = currentUserId > 0 && postAuthorId > 0 && currentUserId === postAuthorId;
  const canDeletePost = canModerateComments || isPostAuthor;
    const safeImageUrl = safeHttpUrl(post.image_url);
    const safeLinkUrl = safeHttpUrl(post.link_url);
  const authorUserId = Number(post.user_id || 0);
  const canBlockAuthor = !!currentUser && authorUserId > 0 && authorUserId !== Number(currentUser.id || 0);
  const alreadyBlocked = canBlockAuthor && currentUserBlocks.has(authorUserId);
  let isBookmarked = !!post.is_bookmarked;
  let isLiked = !!post.is_liked;
    const cmtHtml = comments.map(c => {
      const canEditComment = c.is_mine;
      const canDeleteComment = c.is_mine || canModerateComments;
      const canReportComment = !c.is_mine && currentUser;
      return `
      <li class="cmt-item${c.is_mine ? ' cmt-item--mine' : ''}${c.is_post_author ? ' cmt-item--author' : ''}" data-comment-id="${c.id}" id="comment-${c.id}">
        <div class="cmt-meta">
          <span class="cmt-nick">${renderNicknameWithBadge({
            nickname: c.display_nickname || c.nickname || '익명',
            isVerifiedNickname: c.is_verified_nickname,
            userId: c.user_id,
            profileImageUrl: c.profile_image_url,
            className: 'js-open-user-profile'
          })}</span>
          ${c.is_mine ? '<span class="cmt-badge cmt-badge--mine">내 댓글</span>' : ''}
          ${c.is_post_author ? '<span class="cmt-badge cmt-badge--author">작성자</span>' : ''}
          <span class="cmt-ip">(${escHtml(c.ip_prefix ?? '?.?')})</span>
          <span class="cmt-date">${fmtRelative(c.created_at)}</span>
          ${c.edit_count > 0 ? `<span class="cmt-badge cmt-badge--edited">수정됨 (${c.edit_count})</span>` : ''}
          ${canModerateComments ? '<button class="cmt-admin-del" type="button">삭제</button>' : ''}
        </div>
        <p class="cmt-body">${escHtml(c.body)}</p>
        <div class="cmt-actions">
          <button class="cmt-like-btn${c.is_liked ? ' is-active' : ''}" type="button" data-liked="${c.is_liked ? '1' : '0'}" data-comment-id="${c.id}" ${currentUser ? '' : 'disabled'}>
            공감 <span class="cmt-like-count">${Number(c.likes_count || 0)}</span>
          </button>
          ${canEditComment ? `<button class="cmt-edit-btn" type="button" data-comment-id="${c.id}">수정</button>` : ''}
          ${canDeleteComment ? `<button class="cmt-delete-btn" type="button" data-comment-id="${c.id}">삭제</button>` : ''}
          ${canReportComment ? `<button class="cmt-report-btn" type="button" data-comment-id="${c.id}">신고</button>` : ''}
        </div>
      </li>`;
    }).join('');

    container.innerHTML = `
      <div class="detail-cat-row">
        <span class="post-row__cat ${cat.cls}">${cat.label}</span>
        <span class="detail-date">${fmtRelative(post.created_at)}</span>
      </div>
      <h3 class="detail-title">${escHtml(post.title)}</h3>
      <div class="detail-author-row">
        <span class="cmt-nick">${renderNicknameWithBadge({
          nickname: post.display_nickname || post.nickname || '익명',
          isVerifiedNickname: post.is_verified_nickname,
          userId: post.user_id,
          profileImageUrl: post.profile_image_url,
          className: 'js-open-user-profile'
        })}</span>
        <span class="cmt-ip">(${escHtml(post.ip_prefix ?? '?.?')})</span>
        <span class="detail-stat">조회 ${post.views}</span>
        <span class="detail-stat" style="color:var(--accent-red)">추천 ${post.likes}</span>
      </div>
      ${safeImageUrl ? `<div class="detail-image-wrap"><img class="detail-image" src="${escHtml(safeImageUrl)}" alt="첨부 이미지" loading="lazy"></div>` : ''}
      ${post.body ? `<div class="detail-body-text">${escHtml(post.body)}</div>` : ''}
      ${safeLinkUrl ? `<a class="detail-link" href="${escHtml(safeLinkUrl)}" target="_blank" rel="noopener noreferrer nofollow">🔗 첨부 링크 열기</a>` : ''}
      <div class="detail-actions">
        <button class="detail-like-btn${isLiked ? ' is-active' : ''}" id="detail-like-btn">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
          </svg>
          추천 <span id="like-count">${post.likes}</span>
        </button>
        <button class="detail-gold-like-btn" id="detail-gold-like-btn" ${currentUser ? '' : 'disabled'}>
          🪙 ${GOLD_LIKE_COST}G 추천 +1
        </button>
        <span class="detail-gold-balance" id="detail-gold-balance">
          보유 골드 ${Number(currentUser?.gold || 0).toLocaleString()}G
        </span>
        ${currentUser ? '<button class="detail-report-btn" id="detail-report-btn">게시물 신고</button>' : ''}
        ${currentUser ? `<button class="detail-bookmark-btn" id="detail-bookmark-btn">${isBookmarked ? '북마크 해제' : '북마크'}</button>` : ''}
        ${canBlockAuthor ? `<button class="detail-block-btn" id="detail-block-btn">${alreadyBlocked ? '차단 해제' : '작성자 차단'}</button>` : ''}
        ${canDeletePost ? '<button class="detail-admin-del-btn" id="detail-admin-del-btn">게시글 삭제</button>' : ''}
      </div>
      <div class="detail-comments">
        <div class="detail-cmt-head-wrap">
          <p class="detail-cmt-head">댓글 <strong>${comments.length}</strong></p>
          <div class="detail-cmt-sort" role="tablist" aria-label="댓글 정렬">
            <button class="detail-cmt-sort-btn${commentSort === 'latest' ? ' is-active' : ''}" type="button" data-cmt-sort="latest" role="tab" aria-selected="${commentSort === 'latest' ? 'true' : 'false'}">최신순</button>
            <button class="detail-cmt-sort-btn${commentSort === 'likes' ? ' is-active' : ''}" type="button" data-cmt-sort="likes" role="tab" aria-selected="${commentSort === 'likes' ? 'true' : 'false'}">공감순</button>
          </div>
        </div>
        <ul class="cmt-list" id="cmt-list">${cmtHtml || '<li class="cmt-empty">아직 댓글이 없어요.</li>'}</ul>
        <div class="cmt-write">
          ${currentUser ? '' : '<input id="cmt-anon-nick" class="write-input" type="text" maxlength="20" placeholder="익명 닉네임 (2~20자, 기본: 익명)" autocomplete="off">'}
          <textarea id="cmt-input" class="write-textarea" rows="2" placeholder="댓글을 입력하세요 (최대 1,000자)" maxlength="1000"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
            <button class="write-submit-btn" id="cmt-submit">등록</button>
          </div>
        </div>
      </div>`;

    bindUserProfileTriggers(container);

    // 추천
    container.querySelector('#detail-like-btn').addEventListener('click', async () => {
        if (!currentUser) { showToast('로그인 후 이용할 수 있어요'); return; }
        const btn = container.querySelector('#detail-like-btn');
        const countSpan = container.querySelector('#like-count');
        const prevLiked = isLiked;
        const prevLikes = Number(countSpan?.textContent || post.likes || 0);
        const optimisticLikes = Math.max(0, prevLikes + (prevLiked ? -1 : 1));

        // 낙관적 업데이트
        isLiked = !prevLiked;
        if (countSpan) countSpan.textContent = optimisticLikes;
        btn.classList.toggle('is-active', isLiked);

        try {
            const r = await fetch(`/api/community/posts/${postId}/like`, {
                method: 'POST', credentials: 'include',
            });
          if (!r.ok) {
            isLiked = prevLiked;
            if (countSpan) countSpan.textContent = prevLikes;
            btn.classList.toggle('is-active', isLiked);
            const errorMsg = await readApiError(r, '오류가 발생했어요');
            if (errorMsg) showToast(errorMsg);
            return;
          }

          const { liked, likes } = await r.json();
          isLiked = !!liked;
          btn.classList.toggle('is-active', isLiked);
          if (countSpan) countSpan.textContent = likes;
          showToast(liked ? `추천 ${likes}` : '추천을 취소했어요');
          // 목록 카운트 갱신
          const likeEl = postList.querySelector(`[data-id="${postId}"] .post-row__likes`);
          if (likeEl) likeEl.lastChild.textContent = likes;
        } catch (_) {
          isLiked = prevLiked;
          if (countSpan) countSpan.textContent = prevLikes;
          btn.classList.toggle('is-active', isLiked);
          showToast('오류가 발생했어요');
        }
    });

    const goldLikeBtn = container.querySelector('#detail-gold-like-btn');
    const goldBalanceEl = container.querySelector('#detail-gold-balance');
    if (goldLikeBtn) {
      goldLikeBtn.addEventListener('click', async () => {
        if (!currentUser) {
          showToast('로그인 후 이용할 수 있어요');
          return;
        }

        goldLikeBtn.disabled = true;
        const prevText = goldLikeBtn.textContent;
        goldLikeBtn.textContent = '처리 중...';

        try {
          const r = await fetch(`/api/community/posts/${postId}/gold-like`, {
            method: 'POST',
            credentials: 'include',
          });

          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            if (data?.code === 'EULA_REQUIRED') {
              showToast('최신 이용약관 동의 후 이용할 수 있어요. 메인 화면에서 동의해 주세요.');
            } else {
              showToast(data.error || '오류가 발생했어요');
            }
            return;
          }

          const nextLikes = Number(data.likes || 0);
          const nextGold = Number(data.remainingGold || 0);
          currentUser.gold = nextGold;

          const countSpan = container.querySelector('#like-count');
          if (countSpan) countSpan.textContent = nextLikes;
          if (goldBalanceEl) {
            goldBalanceEl.textContent = `보유 골드 ${nextGold.toLocaleString()}G`;
          }

          const likeEl = postList.querySelector(`[data-id="${postId}"] .post-row__likes`);
          if (likeEl) likeEl.lastChild.textContent = nextLikes;

          showToast(`골드 추천 완료! (${GOLD_LIKE_COST}G 사용)`);
        } catch (_) {
          showToast('오류가 발생했어요');
        } finally {
          goldLikeBtn.disabled = false;
          goldLikeBtn.textContent = prevText;
        }
      });
    }

    const reportBtn = container.querySelector('#detail-report-btn');
    if (reportBtn) {
      reportBtn.addEventListener('click', async () => {
        if (!currentUser) {
          showToast('로그인 후 이용할 수 있어요');
          return;
        }

        const payload = await openReportModal();
        if (!payload) return;

        reportBtn.disabled = true;
        try {
          const r = await fetch(`/api/community/posts/${postId}/report`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
          if (!r.ok) {
            const errorMsg = await readApiError(r, '신고 처리에 실패했어요');
            if (errorMsg) showToast(errorMsg);
            return;
          }
          showToast('신고가 접수되었습니다. 운영팀이 검토할 예정입니다.');
        } catch (_) {
          showToast('신고 처리 중 오류가 발생했어요');
        } finally {
          reportBtn.disabled = false;
        }
      });
    }

    const bookmarkBtn = container.querySelector('#detail-bookmark-btn');
    if (bookmarkBtn) {
      bookmarkBtn.addEventListener('click', async () => {
        if (!currentUser) {
          showToast('로그인 후 이용할 수 있어요');
          return;
        }

        const before = isBookmarked;
        const after = !before;

        // 낙관적 업데이트
        isBookmarked = after;
        bookmarkBtn.textContent = isBookmarked ? '북마크 해제' : '북마크';
        bookmarkBtn.classList.toggle('is-active', isBookmarked);
        const rowBookmarkBtn = postList.querySelector(`[data-id="${postId}"] .post-row__bookmark-btn`);
        if (rowBookmarkBtn) applyRowBookmarkState(rowBookmarkBtn, isBookmarked);

        bookmarkBtn.disabled = true;
        try {
          const r = await fetch(`/api/community/posts/${postId}/bookmark`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!r.ok) {
            isBookmarked = before;
            bookmarkBtn.textContent = isBookmarked ? '북마크 해제' : '북마크';
            bookmarkBtn.classList.toggle('is-active', isBookmarked);
            if (rowBookmarkBtn) applyRowBookmarkState(rowBookmarkBtn, isBookmarked);
            const msg = await readApiError(r, '북마크 처리에 실패했어요');
            if (msg) showToast(msg);
            return;
          }

          const data = await r.json().catch(() => ({}));
          isBookmarked = !!data.bookmarked;
          bookmarkBtn.textContent = isBookmarked ? '북마크 해제' : '북마크';
          bookmarkBtn.classList.toggle('is-active', isBookmarked);
          if (rowBookmarkBtn) applyRowBookmarkState(rowBookmarkBtn, isBookmarked);
          showToast(isBookmarked ? '북마크에 저장했어요' : '북마크를 해제했어요');
        } catch (_) {
          isBookmarked = before;
          bookmarkBtn.textContent = isBookmarked ? '북마크 해제' : '북마크';
          bookmarkBtn.classList.toggle('is-active', isBookmarked);
          if (rowBookmarkBtn) applyRowBookmarkState(rowBookmarkBtn, isBookmarked);
          showToast('북마크 처리 중 오류가 발생했어요');
        } finally {
          bookmarkBtn.disabled = false;
        }
      });
    }

    const blockBtn = container.querySelector('#detail-block-btn');
    if (blockBtn && canBlockAuthor) {
      blockBtn.addEventListener('click', async () => {
        const targetUserId = Number(post.user_id || 0);
        if (!targetUserId) return;

        const currentlyBlocked = currentUserBlocks.has(targetUserId);
        const confirmed = window.confirm(
          currentlyBlocked
            ? '작성자 차단을 해제할까요?'
            : '작성자를 차단하면 해당 사용자의 게시글/댓글이 숨겨집니다. 계속할까요?'
        );
        if (!confirmed) return;

        blockBtn.disabled = true;
        try {
          const r = await fetch(`/api/community/blocks/${targetUserId}`, {
            method: currentlyBlocked ? 'DELETE' : 'POST',
            credentials: 'include',
          });
          if (!r.ok) {
            const errorMsg = await readApiError(r, '차단 설정에 실패했어요');
            if (errorMsg) showToast(errorMsg);
            return;
          }

          await refreshBlockedUsers();
          showToast(currentlyBlocked ? '차단을 해제했어요' : '작성자를 차단했어요');

          const modal = document.querySelector('.modal-backdrop.visible');
          if (modal) modal.remove();
          await Promise.all([renderHotPosts(), resetAndLoad()]);
        } catch (_) {
          showToast('차단 처리 중 오류가 발생했어요');
        } finally {
          blockBtn.disabled = false;
        }
      });
    }

    // 댓글 등록
    const submitComment = async () => {
        const input = container.querySelector('#cmt-input');
      const anonNickInput = container.querySelector('#cmt-anon-nick');
        const body  = input.value.trim();
        if (!body) { input.focus(); return; }
      const anonymousNickname = anonNickInput ? anonNickInput.value.trim() : '';

        try {
            const r = await fetch(`/api/community/posts/${postId}/comments`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
          body: JSON.stringify({ body, anonymous_nickname: anonymousNickname }),
            });
            if (!r.ok) {
              const errorMsg = await readApiError(r, '오류가 발생했어요');
              if (errorMsg) showToast(errorMsg);
                return;
            }
            const { comment } = await r.json();
            input.value = '';
        if (anonNickInput && !currentUser) anonNickInput.value = '';

            const li = document.createElement('li');
            li.className = 'cmt-item';
            li.innerHTML = `
              <div class="cmt-meta">
                <span class="cmt-nick">${renderNicknameWithBadge({
                  nickname: comment.display_nickname || comment.nickname || '익명',
                  isVerifiedNickname: comment.is_verified_nickname,
                  userId: comment.user_id,
                  profileImageUrl: comment.profile_image_url,
                  className: 'js-open-user-profile'
                })}</span>
                <span class="cmt-ip">(${escHtml(comment.ip_prefix ?? '?.?')})</span>
                <span class="cmt-date">방금</span>
              </div>
              <p class="cmt-body">${escHtml(comment.body)}</p>
              <div class="cmt-actions">
                <button class="cmt-like-btn" type="button" data-liked="0" data-comment-id="${comment.id}" ${currentUser ? '' : 'disabled'}>
                  공감 <span class="cmt-like-count">0</span>
                </button>
              </div>`;

            const emptyEl = container.querySelector('.cmt-empty');
            if (emptyEl) emptyEl.remove();
            container.querySelector('#cmt-list').appendChild(li);
            bindUserProfileTriggers(li);

            // 댓글 수 갱신
            const headEl = container.querySelector('.detail-cmt-head strong');
            if (headEl) headEl.textContent = parseInt(headEl.textContent) + 1;
            const cmtBadge = postList.querySelector(`[data-id="${postId}"] .post-row__cmts`);
            if (cmtBadge) cmtBadge.textContent = parseInt(cmtBadge.textContent || '0') + 1;
        } catch (_) { showToast('오류가 발생했어요'); }
    };

    container.querySelector('#cmt-submit').addEventListener('click', submitComment);
    container.querySelector('#cmt-input')?.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitComment();
      }
    });

    container.querySelectorAll('.detail-cmt-sort-btn').forEach((sortBtn) => {
      sortBtn.addEventListener('click', async () => {
        const nextSort = String(sortBtn.dataset.cmtSort || '').trim();
        if (!nextSort || nextSort === commentSort) return;
        try {
          const r = await fetch(`/api/community/posts/${postId}/comments?sort=${encodeURIComponent(nextSort)}`, {
            credentials: 'include',
          });
          if (!r.ok) {
            const msg = await readApiError(r, '댓글을 다시 불러오지 못했어요');
            if (msg) showToast(msg);
            return;
          }
          const data = await r.json().catch(() => ({}));
          const nextComments = Array.isArray(data.comments) ? data.comments : [];
          renderDetailBody(container, { post, postId, comments: nextComments, commentSort: nextSort });
        } catch (_) {
          showToast('댓글 정렬 변경 중 오류가 발생했어요');
        }
      });
    });

    container.querySelectorAll('.cmt-like-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!currentUser) {
          showToast('로그인 후 이용할 수 있어요');
          return;
        }

        const commentId = Number(btn.dataset.commentId || 0);
        if (!commentId) return;

        const countEl = btn.querySelector('.cmt-like-count');
        const beforeLiked = btn.dataset.liked === '1';
        const beforeCount = Number(countEl?.textContent || 0);
        const optimisticCount = Math.max(0, beforeCount + (beforeLiked ? -1 : 1));

        btn.dataset.liked = beforeLiked ? '0' : '1';
        btn.classList.toggle('is-active', !beforeLiked);
        if (countEl) countEl.textContent = String(optimisticCount);
        btn.disabled = true;

        try {
          const r = await fetch(`/api/community/posts/${postId}/comments/${commentId}/like`, {
            method: 'POST',
            credentials: 'include',
          });
          if (!r.ok) {
            btn.dataset.liked = beforeLiked ? '1' : '0';
            btn.classList.toggle('is-active', beforeLiked);
            if (countEl) countEl.textContent = String(beforeCount);
            const msg = await readApiError(r, '댓글 공감 처리에 실패했어요');
            if (msg) showToast(msg);
            return;
          }

          const data = await r.json().catch(() => ({}));
          const nextLiked = !!data.liked;
          const nextCount = Number(data.likes_count || 0);
          btn.dataset.liked = nextLiked ? '1' : '0';
          btn.classList.toggle('is-active', nextLiked);
          if (countEl) countEl.textContent = String(nextCount);
        } catch (_) {
          btn.dataset.liked = beforeLiked ? '1' : '0';
          btn.classList.toggle('is-active', beforeLiked);
          if (countEl) countEl.textContent = String(beforeCount);
          showToast('댓글 공감 처리 중 오류가 발생했어요');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // 댓글 수정
    container.querySelectorAll('.cmt-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const commentId = Number(btn.dataset.commentId || 0);
        if (!commentId) return;
        const cmtItem = btn.closest('.cmt-item');
        const bodyEl = cmtItem?.querySelector('.cmt-body');
        if (!bodyEl) return;
        const currentBody = bodyEl.textContent || '';
        const editModal = createModal({title: '댓글 수정'});
        const textarea = document.createElement('textarea');
        textarea.className = 'modal-textarea';
        textarea.value = currentBody;
        textarea.maxLength = 1000;
        textarea.rows = 3;
        editModal.body.appendChild(textarea);
        const actionBar = document.createElement('div');
        actionBar.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = '취소';
        const submitBtn = document.createElement('button');
        submitBtn.className = 'btn-primary';
        submitBtn.textContent = '저장';
        actionBar.appendChild(cancelBtn);
        actionBar.appendChild(submitBtn);
        editModal.body.appendChild(actionBar);
        cancelBtn.addEventListener('click', () => editModal.close());
        submitBtn.addEventListener('click', async () => {
          const newBody = textarea.value.trim();
          if (!newBody) { showToast('댓글 내용을 입력하세요'); return; }
          if (newBody === currentBody) { editModal.close(); return; }
          submitBtn.disabled = true;
          try {
            const r = await fetch(`/api/community/posts/${postId}/comments/${commentId}`, {
              method: 'PATCH',
              headers: {'Content-Type': 'application/json'},
              credentials: 'include',
              body: JSON.stringify({body: newBody})
            });
            if (!r.ok) {
              const msg = await readApiError(r, '댓글 수정에 실패했어요');
              showToast(msg);
              return;
            }
            bodyEl.textContent = newBody;
            const badgeEl = cmtItem?.querySelector('.cmt-badge--edited');
            if (!badgeEl) {
              const dateEl = cmtItem?.querySelector('.cmt-date');
              const editBadge = document.createElement('span');
              editBadge.className = 'cmt-badge cmt-badge--edited';
              editBadge.textContent = '수정됨 (1)';
              dateEl?.insertAdjacentElement('afterend', editBadge);
            } else {
              const match = badgeEl.textContent.match(/\((\d+)\)/);
              const count = match ? parseInt(match[1]) + 1 : 1;
              badgeEl.textContent = `수정됨 (${count})`;
            }
            editModal.close();
            showToast('댓글이 수정되었어요');
          } catch (e) {
            showToast('댓글 수정 중 오류가 발생했어요');
          } finally {
            submitBtn.disabled = false;
          }
        });
        editModal.show();
      });
    });

    // 댓글 삭제
    container.querySelectorAll('.cmt-delete-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const commentId = Number(btn.dataset.commentId || 0);
        if (!commentId) return;
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/community/me/comments/${commentId}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (!r.ok) {
            const msg = await readApiError(r, '댓글 삭제에 실패했어요');
            showToast(msg);
            return;
          }
          const cmtItem = btn.closest('.cmt-item');
          cmtItem?.remove();
          showToast('댓글이 삭제되었어요');
        } catch (e) {
          showToast('댓글 삭제 중 오류가 발생했어요');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // 댓글 신고
    container.querySelectorAll('.cmt-report-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const commentId = Number(btn.dataset.commentId || 0);
        if (!commentId) return;
        showReportModal({
          type: 'comment',
          id: commentId,
          postId: postId
        });
      });
    });

    // 댓글 관리자 삭제
    container.querySelectorAll('.cmt-admin-del').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const cmtItem = btn.closest('.cmt-item');
        const commentId = Number(cmtItem?.dataset.commentId || 0);
        if (!commentId) return;
        if (!confirm('댓글을 삭제하시겠습니까?')) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/community/posts/${postId}/comments/${commentId}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (!r.ok) {
            const msg = await readApiError(r, '댓글 삭제에 실패했어요');
            showToast(msg);
            return;
          }
          cmtItem?.remove();
          showToast('댓글이 삭제되었어요');
        } catch (e) {
          showToast('댓글 삭제 중 오류가 발생했어요');
        } finally {
          btn.disabled = false;
        }
      });
    });

      if (canDeletePost) {
        const postDeleteBtn = container.querySelector('#detail-admin-del-btn');
        if (postDeleteBtn) {
          postDeleteBtn.addEventListener('click', async () => {
            const ok = window.confirm('이 게시글을 삭제할까요?');
            if (!ok) return;
            try {
              const r = await fetch(`/api/community/posts/${postId}`, {
                method: 'DELETE',
                credentials: 'include',
              });
              if (!r.ok) {
                const data = await r.json().catch(() => ({}));
                showToast(data.error || '삭제에 실패했어요');
                return;
              }

              document.querySelector('.modal-backdrop.visible')?.remove();
              showToast('게시글을 삭제했어요');
              await Promise.all([renderHotPosts(), resetAndLoad()]);
            } catch (_) {
              showToast('오류가 발생했어요');
            }
          });
        }
      }

      if (canModerateComments) {
        container.querySelectorAll('.cmt-admin-del').forEach((btn) => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const item = btn.closest('.cmt-item');
            const commentId = parseInt(item?.dataset.commentId || '', 10);
            if (!commentId) return;

            const ok = window.confirm('이 댓글을 삭제할까요?');
            if (!ok) return;

            try {
              const r = await fetch(`/api/community/posts/${postId}/comments/${commentId}`, {
                method: 'DELETE',
                credentials: 'include',
              });

              if (!r.ok) {
                const data = await r.json().catch(() => ({}));
                showToast(data.error || '댓글 삭제에 실패했어요');
                return;
              }

              item?.remove();
              const listEl = container.querySelector('#cmt-list');
              if (listEl && listEl.children.length === 0) {
                listEl.innerHTML = '<li class="cmt-empty">아직 댓글이 없어요.</li>';
              }

              const headEl = container.querySelector('.detail-cmt-head strong');
              if (headEl) headEl.textContent = Math.max(0, parseInt(headEl.textContent || '0', 10) - 1);
              const cmtBadge = postList.querySelector(`[data-id="${postId}"] .post-row__cmts`);
              if (cmtBadge) {
                const nextCount = Math.max(0, parseInt(cmtBadge.textContent || '0', 10) - 1);
                if (nextCount === 0) cmtBadge.remove();
                else cmtBadge.textContent = nextCount;
              }

              showToast('댓글을 삭제했어요');
            } catch (_) {
              showToast('오류가 발생했어요');
            }
          });
        });
      }
}

function bindUserProfileTriggers(root) {
  root.querySelectorAll('.js-open-user-profile:not([data-user-bound])').forEach((nameEl) => {
    nameEl.dataset.userBound = '1';
    nameEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const userId = parseInt(nameEl.dataset.userId || '', 10);
      if (!userId) return;
      openUserProfile(userId);
    });
  });
}

/* ─── 이벤트 바인딩 ─────────────────────────────────────── */
function bindEvents() {
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  settingsToggle?.addEventListener('click', openSettingsModal);

  document.addEventListener('click', async (e) => {
    const postLink = e.target.closest('a[href^="/community/post/"]');
    if (!postLink) return;
    if (postLink.target === '_blank') return;

    const userProfileBtn = e.target.closest('.js-open-user-profile');
    if (userProfileBtn) return;

    const postId = Number(postLink.dataset.postId || getPostIdFromHref(postLink.getAttribute('href')));
    if (!postId) return;

    e.preventDefault();
    e.stopPropagation();

    const sourceRow = postLink.closest('.post-row');
    await openPostInline(postId, { sourceRow, updateHistory: true });
  });

  window.addEventListener('popstate', () => {
    syncInlinePostFromLocation();
  });

    // 검색 토글
    searchToggle?.addEventListener('click', () => {
        const open = searchWrap.classList.toggle('open');
        searchToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) { searchInput.focus(); }
        else {
            searchInput.value = '';
            searchClear.classList.add('hidden');
            if (searchQuery) { searchQuery = ''; resetAndLoad(); renderHotPosts(); }
        }
    });

    // 검색 입력 (디바운스)
    let searchTimer;
    searchInput?.addEventListener('input', () => {
        const val = searchInput.value.trim();
        searchClear.classList.toggle('hidden', !val);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = val;
            resetAndLoad();
        }, 320);
    });

    searchInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(searchTimer); searchQuery = searchInput.value.trim(); resetAndLoad(); }
        if (e.key === 'Escape') searchToggle.click();
    });

    searchClear?.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        searchInput.focus();
        searchQuery = '';
        resetAndLoad();
        renderHotPosts();
    });

    // 글쓰기
    writeFab?.addEventListener('click', handleWriteClick);

    // 정렬
    sortChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const nextSort = String(chip.dataset.sort || '').trim();
        if (!nextSort || nextSort === currentSort) return;
        currentSort = nextSort;
        syncSortChips();
        resetAndLoad();
      });
    });
}

function syncSortChips() {
  sortChips.forEach((chip) => {
    const active = chip.dataset.sort === currentSort;
    chip.classList.toggle('is-active', active);
    chip.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function loadCommunitySettings() {
  try {
    const raw = localStorage.getItem(COMMUNITY_SETTINGS_KEY);
    if (!raw) {
      communitySettings = { ...DEFAULT_COMMUNITY_SETTINGS };
      return;
    }

    const parsed = JSON.parse(raw);
    communitySettings = {
      layout: parsed?.layout === 'compact' ? 'compact' : 'comfortable',
      hideBest: !!parsed?.hideBest,
      hideAd: !!parsed?.hideAd,
      hideMediaBadge: !!parsed?.hideMediaBadge,
    };
  } catch (_) {
    communitySettings = { ...DEFAULT_COMMUNITY_SETTINGS };
  }
}

function saveCommunitySettings() {
  try {
    localStorage.setItem(COMMUNITY_SETTINGS_KEY, JSON.stringify(communitySettings));
  } catch (_) {
    // Ignore storage errors.
  }
}

function applyCommunitySettings() {
  document.body.classList.toggle('community-compact', communitySettings.layout === 'compact');
  document.body.classList.toggle('community-hide-media-badge', !!communitySettings.hideMediaBadge);

  if (adContainer) {
    adContainer.hidden = !!communitySettings.hideAd;
  }

  if (communitySettings.hideBest) {
    hotList.innerHTML = '';
    hotSection.hidden = true;
  }
}

function getThemeMode() {
  const savedTheme = localStorage.getItem('path_theme');
  if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
  return 'system';
}

function setThemeMode(mode) {
  if (mode === 'light' || mode === 'dark') {
    if (window.PathTheme && typeof window.PathTheme.setMode === 'function') {
      window.PathTheme.setMode(mode, { fallback: getSystemFallbackTheme() });
    } else {
      localStorage.setItem('path_theme', mode);
    }
  } else {
    localStorage.removeItem('path_theme');
  }
  applyThemeFromStorage();
}

function openSettingsModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="write-modal community-settings-modal" role="dialog" aria-modal="true" aria-label="커뮤니티 설정">
      <div class="write-modal-handle"></div>
      <div class="write-modal-header">
        <h2 class="write-modal-title">커뮤니티 설정</h2>
        <button class="write-modal-close" aria-label="닫기" id="settings-close-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
      </div>
      <div class="community-settings-tabs" role="tablist" aria-label="설정 탭">
        <button class="community-settings-tab is-active" role="tab" aria-selected="true" data-tab="view">화면</button>
        <button class="community-settings-tab" role="tab" aria-selected="false" data-tab="content">콘텐츠</button>
        <button class="community-settings-tab" role="tab" aria-selected="false" data-tab="profile">프로필</button>
        <button class="community-settings-tab" role="tab" aria-selected="false" data-tab="activity">내 활동</button>
        <button class="community-settings-tab" role="tab" aria-selected="false" data-tab="blocks">차단</button>
      </div>
      <div class="write-modal-body community-settings-body">
        <section class="community-settings-panel" data-panel="view">
          <label class="community-settings-item">
            <div>
              <p class="community-settings-item__title">테마</p>
              <p class="community-settings-item__desc">커뮤니티 색상 모드를 선택해요.</p>
            </div>
            <select id="settings-theme-mode" class="write-input community-settings-select">
              <option value="system">시스템</option>
              <option value="dark">다크</option>
              <option value="light">라이트</option>
            </select>
          </label>
          <label class="community-settings-item community-settings-item--toggle">
            <div>
              <p class="community-settings-item__title">컴팩트 목록</p>
              <p class="community-settings-item__desc">목록 간격을 줄여 더 많은 글을 한 화면에 보여줘요.</p>
            </div>
            <input id="settings-compact" type="checkbox" class="community-settings-switch">
          </label>
        </section>

        <section class="community-settings-panel hidden" data-panel="content">
          <label class="community-settings-item community-settings-item--toggle">
            <div>
              <p class="community-settings-item__title">베스트 숨기기</p>
              <p class="community-settings-item__desc">상단 베스트 게시글 섹션을 숨겨요.</p>
            </div>
            <input id="settings-hide-best" type="checkbox" class="community-settings-switch">
          </label>
          <label class="community-settings-item community-settings-item--toggle">
            <div>
              <p class="community-settings-item__title">광고 숨기기</p>
              <p class="community-settings-item__desc">커뮤니티 내 디스플레이 광고 영역을 숨겨요.</p>
            </div>
            <input id="settings-hide-ad" type="checkbox" class="community-settings-switch">
          </label>
          <label class="community-settings-item community-settings-item--toggle">
            <div>
              <p class="community-settings-item__title">이미지 아이콘 숨기기</p>
              <p class="community-settings-item__desc">목록의 이미지 포함 표시 아이콘을 숨겨요.</p>
            </div>
            <input id="settings-hide-media-badge" type="checkbox" class="community-settings-switch">
          </label>
        </section>

        <section class="community-settings-panel hidden" data-panel="profile">
          <div id="settings-profile-login-empty" class="community-settings-empty hidden">
            <p class="community-settings-empty__title">로그인 후 프로필을 수정할 수 있어요.</p>
            <p class="community-settings-empty__desc">닉네임, 대학 정보, 동맹 신청 수신 여부를 변경할 수 있습니다.</p>
          </div>

          <div id="settings-profile-form" class="community-profile-form">
            <div class="community-profile-avatar-editor">
              <div id="settings-profile-avatar-preview" class="community-profile-avatar-preview">U</div>
              <label class="community-profile-photo-btn" for="settings-profile-photo-input">사진 변경</label>
              <input id="settings-profile-photo-input" type="file" accept="image/*" hidden>
            </div>

            <label class="community-profile-field">
              <span>닉네임</span>
              <input id="settings-profile-nickname" class="write-input" type="text" maxlength="20" placeholder="2~20자">
            </label>

            <label class="community-profile-field community-profile-univ-wrap">
              <span>목표 대학교</span>
              <input id="settings-profile-university" class="write-input" type="text" maxlength="100" placeholder="대학명 검색">
              <div id="settings-profile-univ-results" class="community-profile-univ-results hidden"></div>
            </label>

            <label class="community-profile-inline-check">
              <input id="settings-profile-is-nsu" type="checkbox">
              <span>N수생입니다</span>
            </label>

            <label id="settings-profile-prev-wrap" class="community-profile-field community-profile-univ-wrap hidden">
              <span>전적 대학교</span>
              <input id="settings-profile-prev-university" class="write-input" type="text" maxlength="100" placeholder="재학/졸업한 대학">
              <div id="settings-profile-prev-univ-results" class="community-profile-univ-results hidden"></div>
            </label>

            <label class="community-settings-item community-settings-item--toggle">
              <div>
                <p class="community-settings-item__title">동맹 신청 받기</p>
                <p class="community-settings-item__desc">끄면 다른 사용자의 동맹 신청을 받지 않아요.</p>
              </div>
              <input id="settings-profile-allow-friend" type="checkbox" class="community-settings-switch">
            </label>

            <p id="settings-profile-error" class="community-profile-error"></p>
            <button id="settings-profile-save" class="write-submit-btn" type="button">프로필 저장</button>
          </div>
        </section>

        <section class="community-settings-panel hidden" data-panel="activity">
          <div class="community-settings-activity-head">
            <p class="community-settings-item__title">내 커뮤니티 활동</p>
            <button id="settings-activity-refresh" class="community-settings-action-btn" type="button">새로고침</button>
          </div>
          <div class="community-settings-activity-filters">
            <select id="settings-activity-filter-category" class="write-input community-settings-select">
              <option value="">전체 카테고리</option>
              <option value="정보">정보</option>
              <option value="질문">질문</option>
              <option value="잡담">잡담</option>
              <option value="념글">베스트</option>
            </select>
            <select id="settings-activity-filter-days" class="write-input community-settings-select">
              <option value="0">전체 기간</option>
              <option value="7">최근 7일</option>
              <option value="30">최근 30일</option>
              <option value="90">최근 90일</option>
            </select>
            <input id="settings-activity-filter-q" class="write-input" type="search" maxlength="100" placeholder="제목/내용 검색">
          </div>
          <div id="settings-activity-summary" class="community-settings-activity-summary"></div>
          <div class="community-settings-activity-types" role="tablist" aria-label="활동 목록 탭">
            <button class="community-settings-activity-type is-active" type="button" data-activity-type="posts" role="tab" aria-selected="true">나의 글</button>
            <button class="community-settings-activity-type" type="button" data-activity-type="comments" role="tab" aria-selected="false">나의 댓글</button>
            <button class="community-settings-activity-type" type="button" data-activity-type="likes" role="tab" aria-selected="false">좋아요한 글</button>
            <button class="community-settings-activity-type" type="button" data-activity-type="bookmarks" role="tab" aria-selected="false">북마크</button>
            <button class="community-settings-activity-type" type="button" data-activity-type="commentLikes" role="tab" aria-selected="false">공감한 댓글</button>
          </div>
          <div class="community-settings-activity-panels">
            <div id="settings-my-posts-wrap" class="community-settings-activity-list" data-activity-panel="posts"></div>
            <div id="settings-my-comments-wrap" class="community-settings-activity-list hidden" data-activity-panel="comments"></div>
            <div id="settings-my-liked-wrap" class="community-settings-activity-list hidden" data-activity-panel="likes"></div>
            <div id="settings-my-bookmarks-wrap" class="community-settings-activity-list hidden" data-activity-panel="bookmarks"></div>
            <div id="settings-my-liked-comments-wrap" class="community-settings-activity-list hidden" data-activity-panel="commentLikes"></div>
          </div>
        </section>

        <section class="community-settings-panel hidden" data-panel="blocks">
          <div id="settings-blocks-wrap" class="community-settings-blocks"></div>
        </section>
      </div>
      <div class="write-modal-footer">
        <button class="write-cancel-btn" id="settings-close-footer-btn">닫기</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const close = () => {
    backdrop.classList.remove('visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
  };

  const tabButtons = Array.from(backdrop.querySelectorAll('.community-settings-tab'));
  const panels = Array.from(backdrop.querySelectorAll('.community-settings-panel'));
  const themeModeSelect = backdrop.querySelector('#settings-theme-mode');
  const compactInput = backdrop.querySelector('#settings-compact');
  const hideBestInput = backdrop.querySelector('#settings-hide-best');
  const hideAdInput = backdrop.querySelector('#settings-hide-ad');
  const hideMediaBadgeInput = backdrop.querySelector('#settings-hide-media-badge');
  const profileLoginEmpty = backdrop.querySelector('#settings-profile-login-empty');
  const profileForm = backdrop.querySelector('#settings-profile-form');
  const profileAvatarPreview = backdrop.querySelector('#settings-profile-avatar-preview');
  const profilePhotoInput = backdrop.querySelector('#settings-profile-photo-input');
  const profileNicknameInput = backdrop.querySelector('#settings-profile-nickname');
  const profileUnivInput = backdrop.querySelector('#settings-profile-university');
  const profileUnivResults = backdrop.querySelector('#settings-profile-univ-results');
  const profileNsuInput = backdrop.querySelector('#settings-profile-is-nsu');
  const profilePrevWrap = backdrop.querySelector('#settings-profile-prev-wrap');
  const profilePrevUnivInput = backdrop.querySelector('#settings-profile-prev-university');
  const profilePrevUnivResults = backdrop.querySelector('#settings-profile-prev-univ-results');
  const profileAllowFriendInput = backdrop.querySelector('#settings-profile-allow-friend');
  const profileSaveBtn = backdrop.querySelector('#settings-profile-save');
  const profileErrorEl = backdrop.querySelector('#settings-profile-error');
  const blocksWrap = backdrop.querySelector('#settings-blocks-wrap');
  const activitySummaryWrap = backdrop.querySelector('#settings-activity-summary');
  const myPostsWrap = backdrop.querySelector('#settings-my-posts-wrap');
  const myCommentsWrap = backdrop.querySelector('#settings-my-comments-wrap');
  const myLikedWrap = backdrop.querySelector('#settings-my-liked-wrap');
  const myBookmarksWrap = backdrop.querySelector('#settings-my-bookmarks-wrap');
  const myLikedCommentsWrap = backdrop.querySelector('#settings-my-liked-comments-wrap');
  const activityTypeBtns = Array.from(backdrop.querySelectorAll('.community-settings-activity-type'));
  const activityPanels = Array.from(backdrop.querySelectorAll('[data-activity-panel]'));
  const activityCategoryFilter = backdrop.querySelector('#settings-activity-filter-category');
  const activityDaysFilter = backdrop.querySelector('#settings-activity-filter-days');
  const activitySearchFilter = backdrop.querySelector('#settings-activity-filter-q');
  const activityRefreshBtn = backdrop.querySelector('#settings-activity-refresh');
  let profileEditor = null;
  const activityState = {
    loading: false,
    activeType: 'posts',
    filters: {
      category: '',
      days: 0,
      q: '',
    },
    lists: {
      posts: { offset: 0, hasMore: false, items: [] },
      comments: { offset: 0, hasMore: false, items: [] },
      likes: { offset: 0, hasMore: false, items: [] },
      bookmarks: { offset: 0, hasMore: false, items: [] },
      commentLikes: { offset: 0, hasMore: false, items: [] },
    },
    selections: {
      posts: new Set(),
      comments: new Set(),
    },
  };

  themeModeSelect.value = getThemeMode();
  compactInput.checked = communitySettings.layout === 'compact';
  hideBestInput.checked = !!communitySettings.hideBest;
  hideAdInput.checked = !!communitySettings.hideAd;
  hideMediaBadgeInput.checked = !!communitySettings.hideMediaBadge;

  const ensureProfileEditor = () => {
    if (profileEditor || !window.PathProfileEditor || typeof window.PathProfileEditor.create !== 'function') {
      return profileEditor;
    }

    profileEditor = window.PathProfileEditor.create({
      elements: {
        avatarPreview: profileAvatarPreview,
        photoInput: profilePhotoInput,
        nicknameInput: profileNicknameInput,
        universityInput: profileUnivInput,
        univResults: profileUnivResults,
        nsuInput: profileNsuInput,
        prevWrap: profilePrevWrap,
        prevUniversityInput: profilePrevUnivInput,
        prevUnivResults: profilePrevUnivResults,
        allowFriendInput: profileAllowFriendInput,
        errorElement: profileErrorEl,
        saveButton: profileSaveBtn,
      },
      getUser: () => currentUser,
      applyUser: (nextUser) => {
        currentUser = nextUser;
      },
      setLoggedInState: (isLoggedIn) => {
        profileLoginEmpty?.classList.toggle('hidden', !!isLoggedIn);
        profileForm?.classList.toggle('hidden', !isLoggedIn);
      },
      saveButtonText: '프로필 저장',
      savingText: '저장 중...',
      avatarImageClass: 'community-profile-avatar-img',
      universityItemClass: 'community-profile-univ-item',
      universityRegionClass: 'community-profile-univ-region',
      onNoChanges: async () => {
        showToast('변경된 내용이 없어요.');
      },
      onSaveSuccess: async () => {
        showToast('프로필이 저장되었어요.');
        await Promise.all([
          renderHotPosts(),
          resetAndLoad({ preserveInlineUrl: true }),
        ]);
      },
    });

    profileEditor.bind();
    return profileEditor;
  };

  const updateTab = async (tabKey) => {
    tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === tabKey;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.panel !== tabKey);
    });

    if (tabKey === 'blocks') {
      await renderSettingsBlockedUsers(blocksWrap);
    }

    if (tabKey === 'profile') {
      const editor = ensureProfileEditor();
      if (editor) editor.syncFromUser();
    }

    if (tabKey === 'activity') {
      await renderSettingsActivityTab({
        summaryWrap: activitySummaryWrap,
        postsWrap: myPostsWrap,
        commentsWrap: myCommentsWrap,
        likedWrap: myLikedWrap,
        bookmarksWrap: myBookmarksWrap,
        likedCommentsWrap: myLikedCommentsWrap,
      }, activityState);
    }
  };

  activityTypeBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nextType = String(btn.dataset.activityType || '').trim();
      if (!SETTINGS_ACTIVITY_TYPES.includes(nextType)) return;
      if (activityState.activeType === nextType) return;
      activityState.activeType = nextType;
      activityTypeBtns.forEach((tabBtn) => {
        const active = tabBtn.dataset.activityType === nextType;
        tabBtn.classList.toggle('is-active', active);
        tabBtn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      activityPanels.forEach((panel) => {
        panel.classList.toggle('hidden', panel.dataset.activityPanel !== nextType);
      });
      await renderSettingsActivityTab({
        summaryWrap: activitySummaryWrap,
        postsWrap: myPostsWrap,
        commentsWrap: myCommentsWrap,
        likedWrap: myLikedWrap,
        bookmarksWrap: myBookmarksWrap,
        likedCommentsWrap: myLikedCommentsWrap,
      }, activityState);
    });
  });

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => updateTab(btn.dataset.tab));
  });

  themeModeSelect.addEventListener('change', () => {
    setThemeMode(themeModeSelect.value);
  });

  compactInput.addEventListener('change', () => {
    communitySettings.layout = compactInput.checked ? 'compact' : 'comfortable';
    saveCommunitySettings();
    applyCommunitySettings();
  });

  hideBestInput.addEventListener('change', async () => {
    communitySettings.hideBest = hideBestInput.checked;
    saveCommunitySettings();
    applyCommunitySettings();
    if (!communitySettings.hideBest) {
      await renderHotPosts();
    }
  });

  hideAdInput.addEventListener('change', () => {
    communitySettings.hideAd = hideAdInput.checked;
    saveCommunitySettings();
    applyCommunitySettings();
  });

  hideMediaBadgeInput.addEventListener('change', () => {
    communitySettings.hideMediaBadge = hideMediaBadgeInput.checked;
    saveCommunitySettings();
    applyCommunitySettings();
  });

  activityRefreshBtn?.addEventListener('click', async () => {
    await renderSettingsActivityTab({
      summaryWrap: activitySummaryWrap,
      postsWrap: myPostsWrap,
      commentsWrap: myCommentsWrap,
      likedWrap: myLikedWrap,
      bookmarksWrap: myBookmarksWrap,
      likedCommentsWrap: myLikedCommentsWrap,
    }, activityState, { reset: true });
  });

  const onActivityFilterChange = async () => {
    activityState.filters.category = String(activityCategoryFilter?.value || '');
    activityState.filters.days = Number(activityDaysFilter?.value || 0);
    activityState.filters.q = String(activitySearchFilter?.value || '').trim();
    await renderSettingsActivityTab({
      summaryWrap: activitySummaryWrap,
      postsWrap: myPostsWrap,
      commentsWrap: myCommentsWrap,
      likedWrap: myLikedWrap,
      bookmarksWrap: myBookmarksWrap,
      likedCommentsWrap: myLikedCommentsWrap,
    }, activityState, { reset: true, skipSummary: true });
  };

  let activitySearchTimer;
  activityCategoryFilter?.addEventListener('change', onActivityFilterChange);
  activityDaysFilter?.addEventListener('change', onActivityFilterChange);
  activitySearchFilter?.addEventListener('input', () => {
    clearTimeout(activitySearchTimer);
    activitySearchTimer = setTimeout(onActivityFilterChange, 260);
  });

  backdrop.querySelector('#settings-close-btn')?.addEventListener('click', close);
  backdrop.querySelector('#settings-close-footer-btn')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target instanceof Element && !e.target.closest('.community-profile-univ-wrap')) {
      const editor = ensureProfileEditor();
      if (editor) editor.hideUniversityResults();
    }
    if (e.target === backdrop) close();
  });
}

async function renderSettingsActivityTab(containers, state, options = {}) {
  if (!containers?.summaryWrap || !containers?.postsWrap || !containers?.commentsWrap || !containers?.likedWrap || !containers?.bookmarksWrap || !containers?.likedCommentsWrap) return;

  if (!currentUser) {
    containers.summaryWrap.innerHTML = '';
    containers.postsWrap.innerHTML = `
      <div class="community-settings-empty">
        <p class="community-settings-empty__title">로그인 후 내 활동을 볼 수 있어요.</p>
        <p class="community-settings-empty__desc">내가 쓴 글과 댓글을 한 번에 관리할 수 있습니다.</p>
      </div>`;
    containers.commentsWrap.innerHTML = '';
    containers.likedWrap.innerHTML = '';
    containers.bookmarksWrap.innerHTML = '';
    containers.likedCommentsWrap.innerHTML = '';
    return;
  }

  if (state.loading) return;
  state.loading = true;

  const shouldReset = !!options.reset;
  if (shouldReset) {
    SETTINGS_ACTIVITY_TYPES.forEach((type) => {
      state.lists[type] = { offset: 0, hasMore: false, items: [] };
    });
    state.selections.posts.clear();
    state.selections.comments.clear();
  }

  const activeWrap = getActivityContainerByType(containers, state.activeType);
  if (activeWrap && state.lists[state.activeType].items.length === 0) {
    activeWrap.innerHTML = '<p class="community-settings-loading">활동 목록을 불러오는 중...</p>';
  }

  if (!options.skipSummary) {
    containers.summaryWrap.innerHTML = '<p class="community-settings-loading">활동 요약을 불러오는 중...</p>';
  }

  try {
    const tasks = [];
    if (!options.skipSummary) {
      tasks.push(renderSettingsActivitySummary(containers.summaryWrap));
    }
    tasks.push(renderActivityListByType(containers, state, state.activeType, { reset: shouldReset }));
    await Promise.all(tasks);
  } finally {
    state.loading = false;
  }
}

async function renderSettingsActivitySummary(container) {
  try {
    const response = await fetch('/api/community/me/summary', { credentials: 'include' });
    if (!response.ok) {
      container.innerHTML = '<p class="community-settings-loading">활동 요약을 불러오지 못했어요.</p>';
      return;
    }

    const data = await response.json();
    const summary = data?.summary || {};
    const postsCount = Number(summary.posts_count || 0);
    const commentsCount = Number(summary.comments_count || 0);
    const receivedLikes = Number(summary.received_likes || 0);
    const likedPostsCount = Number(summary.liked_posts_count || 0);
    const bookmarksCount = Number(summary.bookmarks_count || 0);
    const likedCommentsCount = Number(summary.liked_comments_count || 0);
    const weeklyPostsCount = Number(summary.weekly_posts_count || 0);
    const weeklyCommentsCount = Number(summary.weekly_comments_count || 0);
    const topCategory7d = String(summary.top_category_7d || '').trim();

    container.innerHTML = `
      <div class="community-settings-stat-grid">
        <article class="community-settings-stat-card">
          <p class="community-settings-stat-card__label">내 글</p>
          <strong class="community-settings-stat-card__value">${postsCount.toLocaleString('ko-KR')}</strong>
        </article>
        <article class="community-settings-stat-card">
          <p class="community-settings-stat-card__label">내 댓글</p>
          <strong class="community-settings-stat-card__value">${commentsCount.toLocaleString('ko-KR')}</strong>
        </article>
        <article class="community-settings-stat-card">
          <p class="community-settings-stat-card__label">받은 추천</p>
          <strong class="community-settings-stat-card__value">${receivedLikes.toLocaleString('ko-KR')}</strong>
        </article>
        <article class="community-settings-stat-card">
          <p class="community-settings-stat-card__label">좋아요한 글</p>
          <strong class="community-settings-stat-card__value">${likedPostsCount.toLocaleString('ko-KR')}</strong>
        </article>
        <article class="community-settings-stat-card">
          <p class="community-settings-stat-card__label">북마크</p>
          <strong class="community-settings-stat-card__value">${bookmarksCount.toLocaleString('ko-KR')}</strong>
        </article>
        <article class="community-settings-stat-card">
          <p class="community-settings-stat-card__label">공감한 댓글</p>
          <strong class="community-settings-stat-card__value">${likedCommentsCount.toLocaleString('ko-KR')}</strong>
        </article>
      </div>
      <div class="community-settings-weekly-report">
        <p class="community-settings-weekly-report__title">주간 리포트</p>
        <p class="community-settings-weekly-report__desc">
          최근 7일 동안 글 ${weeklyPostsCount.toLocaleString('ko-KR')}개, 댓글 ${weeklyCommentsCount.toLocaleString('ko-KR')}개 활동했어요.
          ${topCategory7d ? `가장 많이 쓴 카테고리는 ${escHtml(topCategory7d)}입니다.` : '이번 주 첫 활동을 시작해 보세요.'}
        </p>
      </div>`;
  } catch (_) {
    container.innerHTML = '<p class="community-settings-loading">활동 요약을 불러오지 못했어요.</p>';
  }
}

function getActivityContainerByType(containers, type) {
  if (type === 'posts') return containers.postsWrap;
  if (type === 'comments') return containers.commentsWrap;
  if (type === 'likes') return containers.likedWrap;
  if (type === 'bookmarks') return containers.bookmarksWrap;
  if (type === 'commentLikes') return containers.likedCommentsWrap;
  return null;
}

function buildActivityFetchUrl(type, listState, filters) {
  const baseMap = {
    posts: '/api/community/me/posts',
    comments: '/api/community/me/comments',
    likes: '/api/community/me/liked-posts',
    bookmarks: '/api/community/me/bookmarks',
    commentLikes: '/api/community/me/liked-comments',
  };

  const params = new URLSearchParams({
    limit: String(SETTINGS_ACTIVITY_PAGE_SIZE),
    offset: String(listState.offset),
  });

  if (filters.category) params.set('category', filters.category);
  if (Number(filters.days) > 0) params.set('days', String(Number(filters.days)));
  if (filters.q) params.set('q', filters.q);

  return `${baseMap[type]}?${params.toString()}`;
}

async function renderActivityListByType(containers, state, type, options = {}) {
  const container = getActivityContainerByType(containers, type);
  if (!container) return;

  const listState = state.lists[type];
  const reset = !!options.reset;
  if (reset) {
    listState.items = [];
    listState.offset = 0;
    listState.hasMore = false;
  }

  try {
    const response = await fetch(buildActivityFetchUrl(type, listState, state.filters), { credentials: 'include' });
    if (!response.ok) {
      container.innerHTML = '<p class="community-settings-loading">활동 목록을 불러오지 못했어요.</p>';
      return;
    }

    const data = await response.json();
    const fetchedItems = Array.isArray(data.posts)
      ? data.posts
      : (Array.isArray(data.comments) ? data.comments : []);
    listState.items = reset ? fetchedItems : [...listState.items, ...fetchedItems];
    listState.offset = listState.items.length;
    listState.hasMore = !!data.has_more;

    if (listState.items.length === 0) {
      const emptyTitleMap = {
        posts: '작성한 글이 아직 없어요.',
        comments: '작성한 댓글이 아직 없어요.',
        likes: '좋아요한 글이 아직 없어요.',
        bookmarks: '북마크한 글이 아직 없어요.',
        commentLikes: '공감한 댓글이 아직 없어요.',
      };
      const emptyDescMap = {
        posts: '첫 글을 작성하고 활동을 시작해 보세요.',
        comments: '글에 댓글을 남기면 여기에 모아서 볼 수 있어요.',
        likes: '좋아요 버튼을 누른 글이 이곳에 표시됩니다.',
        bookmarks: '북마크한 글이 이곳에 표시됩니다.',
        commentLikes: '댓글의 공감 버튼을 누르면 이곳에 표시됩니다.',
      };
      container.innerHTML = `
        <div class="community-settings-empty">
          <p class="community-settings-empty__title">${emptyTitleMap[type]}</p>
          <p class="community-settings-empty__desc">${emptyDescMap[type]}</p>
        </div>`;
      return;
    }

    const listHtml = listState.items.map((item) => renderActivityItemHtml(type, item, state)).join('');
    const bulkDeleteBar = renderBulkDeleteToolbar(type, state);
    container.innerHTML = `
      ${bulkDeleteBar}
      <ul class="community-settings-activity-items">${listHtml}</ul>
      ${listState.hasMore ? `<button class="community-settings-more-btn" type="button" data-load-more="${type}">더보기</button>` : ''}`;

    bindActivityItemEvents(container, containers, state, type);

    const loadMoreBtn = container.querySelector(`[data-load-more="${type}"]`);
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = '불러오는 중...';
        await renderActivityListByType(containers, state, type, { reset: false });
      });
    }
  } catch (_) {
    container.innerHTML = '<p class="community-settings-loading">활동 목록을 불러오지 못했어요.</p>';
  }
}

function renderActivityItemHtml(type, item, state) {
  const selectedPosts = state?.selections?.posts;
  const selectedComments = state?.selections?.comments;

  if (type === 'comments') {
    const isSelected = selectedComments instanceof Set ? selectedComments.has(Number(item.id)) : false;
    return `
      <li class="community-settings-activity-item">
        <label class="community-settings-select-row">
          <input class="community-settings-select-check" type="checkbox" data-select-type="comment" data-comment-id="${Number(item.id)}" ${isSelected ? 'checked' : ''}>
          선택
        </label>
        <a href="${getPostDetailUrl(item.post_id)}" class="community-settings-activity-link" data-post-id="${Number(item.post_id)}">
          <p class="community-settings-activity-title">[${escHtml(item.post_category || '전체')}] ${escHtml(item.post_title || '원문')}</p>
          <p class="community-settings-activity-snippet">${escHtml(truncateText(item.body || '', 90))}</p>
          <p class="community-settings-activity-meta">${fmtRelative(item.created_at)}</p>
        </a>
        <div class="community-settings-activity-actions">
          <button class="community-settings-item-delete" type="button" data-delete-type="comment" data-comment-id="${Number(item.id)}">삭제</button>
        </div>
      </li>`;
  }

  if (type === 'commentLikes') {
    const commentId = Number(item.comment_id || 0);
    const commentAnchor = commentId > 0
      ? `${getPostDetailUrl(item.post_id)}?cmt=${commentId}#comment-${commentId}`
      : getPostDetailUrl(item.post_id);
    return `
      <li class="community-settings-activity-item">
        <a href="${commentAnchor}" class="community-settings-activity-link" data-post-id="${Number(item.post_id)}">
          <p class="community-settings-activity-title">[${escHtml(item.post_category || '전체')}] ${escHtml(item.post_title || '원문')}</p>
          <p class="community-settings-activity-snippet">${escHtml(truncateText(item.body || '', 90))}</p>
          <p class="community-settings-activity-meta">댓글 ${fmtRelative(item.comment_created_at)} · 공감 ${Number(item.likes_count || 0)} · 내가 공감 ${fmtRelative(item.liked_at)}</p>
        </a>
      </li>`;
  }

  const savedAt = type === 'likes' ? item.liked_at : item.bookmarked_at;
  const savedMeta = savedAt ? ` · 저장 ${fmtRelative(savedAt)}` : '';
  const showDelete = type === 'posts';
  const isSelected = selectedPosts instanceof Set ? selectedPosts.has(Number(item.id)) : false;
  return `
    <li class="community-settings-activity-item">
      ${showDelete ? `<label class="community-settings-select-row"><input class="community-settings-select-check" type="checkbox" data-select-type="post" data-post-id="${Number(item.id)}" ${isSelected ? 'checked' : ''}>선택</label>` : ''}
      <a href="${getPostDetailUrl(item.id)}" class="community-settings-activity-link" data-post-id="${Number(item.id)}">
        <p class="community-settings-activity-title">[${escHtml(item.category || '전체')}] ${escHtml(item.title || '')}</p>
        <p class="community-settings-activity-meta">${fmtRelative(item.created_at)}${savedMeta} · 조회 ${Number(item.views || 0)} · 댓글 ${Number(item.comments_count || 0)} · 추천 ${Number(item.likes || 0)}</p>
      </a>
      ${showDelete ? `<div class="community-settings-activity-actions"><button class="community-settings-item-delete" type="button" data-delete-type="post" data-post-id="${Number(item.id)}">삭제</button></div>` : ''}
    </li>`;
}

function renderBulkDeleteToolbar(type, state) {
  if (type !== 'posts' && type !== 'comments') return '';
  const selected = type === 'posts' ? state.selections.posts : state.selections.comments;
  const selectedCount = selected.size;
  const label = type === 'posts' ? '게시글' : '댓글';
  return `
    <div class="community-settings-bulk-bar" data-bulk-type="${type}">
      <label class="community-settings-bulk-all"><input type="checkbox" data-select-all="${type}"> 전체 선택</label>
      <span class="community-settings-bulk-count">선택 ${selectedCount}개</span>
      <button class="community-settings-bulk-delete" type="button" data-bulk-delete="${type}" ${selectedCount === 0 ? 'disabled' : ''}>선택 ${label} 삭제</button>
    </div>`;
}

function bindActivityItemEvents(container, containers, state, type) {
  container.querySelectorAll('.community-settings-activity-link').forEach((linkEl) => {
    linkEl.addEventListener('click', () => {
      const postId = Number(linkEl.dataset.postId || 0);
      if (postId > 0) markPostViewed(postId);
    });
  });

  container.querySelectorAll('.community-settings-select-check').forEach((inputEl) => {
    inputEl.addEventListener('change', () => {
      const selectType = inputEl.dataset.selectType;
      if (selectType === 'post') {
        const postId = Number(inputEl.dataset.postId || 0);
        if (!postId) return;
        if (inputEl.checked) state.selections.posts.add(postId);
        else state.selections.posts.delete(postId);
      }
      if (selectType === 'comment') {
        const commentId = Number(inputEl.dataset.commentId || 0);
        if (!commentId) return;
        if (inputEl.checked) state.selections.comments.add(commentId);
        else state.selections.comments.delete(commentId);
      }
      refreshBulkDeleteUi(container, state, type);
    });
  });

  const selectAllEl = container.querySelector(`[data-select-all="${type}"]`);
  if (selectAllEl) {
    selectAllEl.checked = isAllSelectedForType(state, type);
    selectAllEl.addEventListener('change', () => {
      const listState = state.lists[type];
      const shouldSelectAll = !!selectAllEl.checked;
      if (type === 'posts') {
        state.selections.posts.clear();
        if (shouldSelectAll) listState.items.forEach((it) => state.selections.posts.add(Number(it.id)));
      }
      if (type === 'comments') {
        state.selections.comments.clear();
        if (shouldSelectAll) listState.items.forEach((it) => state.selections.comments.add(Number(it.id)));
      }
      renderActivityListByType(containers, state, type, { reset: false });
    });
  }

  const bulkDeleteBtn = container.querySelector(`[data-bulk-delete="${type}"]`);
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener('click', async () => {
      const selectedIds = type === 'posts'
        ? Array.from(state.selections.posts)
        : Array.from(state.selections.comments);
      if (selectedIds.length === 0) return;

      const label = type === 'posts' ? '게시글' : '댓글';
      const confirmed = window.confirm(`선택한 ${label} ${selectedIds.length}개를 삭제할까요?`);
      if (!confirmed) return;

      bulkDeleteBtn.disabled = true;
      bulkDeleteBtn.textContent = '삭제 중...';

      const requests = selectedIds.map((id) => {
        const endpoint = type === 'posts'
          ? `/api/community/me/posts/${id}`
          : `/api/community/me/comments/${id}`;
        return fetch(endpoint, {
          method: 'DELETE',
          credentials: 'include',
        });
      });

      const results = await Promise.allSettled(requests);
      const okCount = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;

      if (type === 'posts') state.selections.posts.clear();
      if (type === 'comments') state.selections.comments.clear();

      if (okCount > 0) showToast(`${okCount}개 ${label}을 삭제했어요`);
      if (okCount < selectedIds.length) showToast(`일부 ${label} 삭제에 실패했어요`);

      await Promise.all([
        renderSettingsActivityTab(containers, state, { reset: true }),
        renderHotPosts(),
        resetAndLoad(),
      ]);
    });
  }

  container.querySelectorAll('.community-settings-item-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const deleteType = btn.dataset.deleteType;
      if (deleteType === 'post') {
        const postId = Number(btn.dataset.postId || 0);
        if (!postId) return;
        const ok = window.confirm('내 게시글을 삭제할까요?');
        if (!ok) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/community/me/posts/${postId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!r.ok) {
            const msg = await readApiError(r, '게시글 삭제에 실패했어요');
            if (msg) showToast(msg);
            btn.disabled = false;
            return;
          }
          showToast('게시글을 삭제했어요');
        } catch (_) {
          showToast('게시글 삭제 중 오류가 발생했어요');
        }
      }

      if (deleteType === 'comment') {
        const commentId = Number(btn.dataset.commentId || 0);
        if (!commentId) return;
        const ok = window.confirm('내 댓글을 삭제할까요?');
        if (!ok) return;
        btn.disabled = true;
        try {
          const r = await fetch(`/api/community/me/comments/${commentId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!r.ok) {
            const msg = await readApiError(r, '댓글 삭제에 실패했어요');
            if (msg) showToast(msg);
            btn.disabled = false;
            return;
          }
          showToast('댓글을 삭제했어요');
        } catch (_) {
          showToast('댓글 삭제 중 오류가 발생했어요');
        }
      }

      await Promise.all([
        renderSettingsActivityTab(containers, state, { reset: true }),
        renderHotPosts(),
        resetAndLoad(),
      ]);
    });
  });
}

function isAllSelectedForType(state, type) {
  const items = state.lists[type]?.items || [];
  if (items.length === 0) return false;
  if (type === 'posts') {
    return items.every((item) => state.selections.posts.has(Number(item.id)));
  }
  if (type === 'comments') {
    return items.every((item) => state.selections.comments.has(Number(item.id)));
  }
  return false;
}

function refreshBulkDeleteUi(container, state, type) {
  const countEl = container.querySelector('.community-settings-bulk-count');
  const deleteBtn = container.querySelector(`[data-bulk-delete="${type}"]`);
  const selectAllEl = container.querySelector(`[data-select-all="${type}"]`);

  const selectedCount = type === 'posts' ? state.selections.posts.size : state.selections.comments.size;
  if (countEl) countEl.textContent = `선택 ${selectedCount}개`;
  if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
  if (selectAllEl) selectAllEl.checked = isAllSelectedForType(state, type);
}

async function renderSettingsBlockedUsers(container) {
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `
      <div class="community-settings-empty">
        <p class="community-settings-empty__title">로그인 후 차단 목록을 관리할 수 있어요.</p>
        <p class="community-settings-empty__desc">게시글 상세에서 작성자를 차단하면 여기서 해제할 수 있습니다.</p>
      </div>`;
    return;
  }

  container.innerHTML = '<p class="community-settings-loading">차단 목록을 불러오는 중...</p>';

  try {
    const response = await fetch('/api/community/blocks', { credentials: 'include' });
    if (!response.ok) {
      const msg = await readApiError(response, '차단 목록을 불러오지 못했어요');
      if (msg) showToast(msg);
      container.innerHTML = '<p class="community-settings-loading">차단 목록을 불러오지 못했어요.</p>';
      return;
    }

    const data = await response.json();
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];

    if (blocks.length === 0) {
      container.innerHTML = `
        <div class="community-settings-empty">
          <p class="community-settings-empty__title">차단한 사용자가 없어요.</p>
          <p class="community-settings-empty__desc">불편한 사용자는 게시글 상세 화면에서 바로 차단할 수 있어요.</p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <ul class="community-block-list">
        ${blocks.map((block) => `
          <li class="community-block-item" data-blocked-id="${Number(block.blocked_id)}">
            <div class="community-block-item__meta">
              <p class="community-block-item__nick">${escHtml(block.nickname || '알 수 없음')}</p>
              <p class="community-block-item__date">차단일 ${escHtml(fmtRelative(block.created_at))}</p>
            </div>
            <button class="community-block-item__unblock" type="button">차단 해제</button>
          </li>
        `).join('')}
      </ul>`;

    container.querySelectorAll('.community-block-item__unblock').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const item = btn.closest('.community-block-item');
        const blockedId = parseInt(item?.dataset.blockedId || '', 10);
        if (!blockedId) return;

        btn.disabled = true;
        btn.textContent = '처리 중...';

        try {
          const r = await fetch(`/api/community/blocks/${blockedId}`, {
            method: 'DELETE',
            credentials: 'include',
          });
          if (!r.ok) {
            const msg = await readApiError(r, '차단 해제에 실패했어요');
            if (msg) showToast(msg);
            btn.disabled = false;
            btn.textContent = '차단 해제';
            return;
          }

          showToast('차단을 해제했어요');
          await refreshBlockedUsers();
          await Promise.all([renderHotPosts(), resetAndLoad()]);
          await renderSettingsBlockedUsers(container);
        } catch (_) {
          showToast('차단 해제 중 오류가 발생했어요');
          btn.disabled = false;
          btn.textContent = '차단 해제';
        }
      });
    });
  } catch (_) {
    container.innerHTML = '<p class="community-settings-loading">차단 목록을 불러오지 못했어요.</p>';
  }
}

function handleWriteClick() {
  if (currentCat === '념글') {
    showToast('베스트 게시판에는 글을 작성할 수 없어요');
    return;
  }
    showWriteModal();
}

function getWriteDraftKey() {
  const scope = currentUser?.id ? `u${currentUser.id}` : 'guest';
  return `path.community.writeDraft.${scope}`;
}

function loadWriteDraft() {
  try {
    const raw = localStorage.getItem(getWriteDraftKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const ts = Number(parsed.updatedAt || 0);
    if (!ts || Date.now() - ts > WRITE_DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(getWriteDraftKey());
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function saveWriteDraft(draft) {
  try {
    localStorage.setItem(getWriteDraftKey(), JSON.stringify({ ...draft, updatedAt: Date.now() }));
  } catch (_) {
    // Ignore storage quota / privacy mode errors.
  }
}

function clearWriteDraft() {
  try {
    localStorage.removeItem(getWriteDraftKey());
  } catch (_) {
    // Ignore storage removal errors.
  }
}

function getDefaultCommunityNickname() {
  const raw = typeof currentUser?.nickname === 'string' ? currentUser.nickname.trim() : '';
  if (raw && raw.length >= 2 && raw.length <= 20) return raw;
  return '익명';
}

/* ─── 글쓰기 모달 ─────────────────────────────────────────── */
function showWriteModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
  const cats = CATEGORIES.filter(c => WRITABLE_CATS.includes(c.key));
  const draft = loadWriteDraft();
  let selectedCat = WRITABLE_CATS.includes(currentCat) ? currentCat : '정보';
  if (draft && WRITABLE_CATS.includes(draft.category)) {
    selectedCat = draft.category;
  }

    backdrop.innerHTML = `
      <div class="write-modal" role="dialog" aria-modal="true" aria-label="게시글 작성">
        <div class="write-modal-handle"></div>
        <div class="write-modal-header">
          <h2 class="write-modal-title">게시글 작성</h2>
          <button class="write-modal-close" aria-label="닫기">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </div>
        <div class="write-modal-helper">자동 임시저장 · Ctrl/Cmd + Enter 등록 · Esc 닫기</div>
        <div class="write-modal-body">
          <div class="write-field">
            <label class="write-label">카테고리</label>
            <div class="write-cat-chips">
              ${cats.map(c => `<button class="write-cat-chip${c.key === selectedCat ? ' active' : ''}" data-cat="${c.key}">${c.label}</button>`).join('')}
            </div>
          </div>
          <div class="write-field">
            <div class="write-label-row">
              <label class="write-label" for="wt-anon-nick">익명 닉네임</label>
              <span class="write-inline-count" id="wt-nick-count">0 / 20</span>
            </div>
            <input id="wt-anon-nick" class="write-input" type="text" placeholder="익명 닉네임 (2~20자, 기본: 익명)" maxlength="20" autocomplete="off">
          </div>
          <div class="write-field">
            <div class="write-label-row">
              <label class="write-label" for="wt-title">제목</label>
              <span class="write-inline-count" id="wt-title-count">0 / 200</span>
            </div>
            <input id="wt-title" class="write-input" type="text" placeholder="제목을 입력하세요" maxlength="200" autocomplete="off">
          </div>
          <div class="write-field">
            <label class="write-label" for="wt-body">내용</label>
            <textarea id="wt-body" class="write-textarea" placeholder="자유롭게 작성해 보세요 (최대 5,000자)" maxlength="5000"></textarea>
            <span class="write-char-count" id="wt-char">0 / 5,000</span>
          </div>
          <div class="write-field">
            <label class="write-label">첨부</label>
            <div class="write-attach-actions">
              <button class="write-attach-btn" type="button" id="wt-attach-image-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="5" width="18" height="14" rx="2"></rect>
                  <circle cx="8.5" cy="10" r="1.5"></circle>
                  <path d="M21 15l-4-4L7 21"></path>
                </svg>
                이미지 첨부
              </button>
              <button class="write-attach-btn" type="button" id="wt-attach-link-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4"></path>
                  <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 20"></path>
                </svg>
                링크 첨부
              </button>
            </div>
            <input id="wt-image-file" type="file" accept="image/*" hidden>
            <div class="write-link-editor hidden" id="wt-link-editor">
              <input id="wt-link-input" class="write-input" type="url" placeholder="https://example.com" maxlength="1000" autocomplete="off" inputmode="url">
              <button class="write-link-apply" type="button" id="wt-link-apply">적용</button>
            </div>
            <div class="write-attachments" id="wt-attachments"></div>
          </div>
        </div>
        <div class="write-modal-footer">
          <button class="write-cancel-btn">취소</button>
          <button class="write-submit-btn" id="wt-submit-btn">등록하기</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const nickInput = backdrop.querySelector('#wt-anon-nick');
    const titleInput = backdrop.querySelector('#wt-title');
    const textarea  = backdrop.querySelector('#wt-body');
    const charCount = backdrop.querySelector('#wt-char');
    const nickCount = backdrop.querySelector('#wt-nick-count');
    const titleCount = backdrop.querySelector('#wt-title-count');
    const imageInput = backdrop.querySelector('#wt-image-file');
    const attachImageBtn = backdrop.querySelector('#wt-attach-image-btn');
    const attachLinkBtn = backdrop.querySelector('#wt-attach-link-btn');
    const linkEditor = backdrop.querySelector('#wt-link-editor');
    const linkInput = backdrop.querySelector('#wt-link-input');
    const linkApplyBtn = backdrop.querySelector('#wt-link-apply');
    const attachmentsWrap = backdrop.querySelector('#wt-attachments');
    const submitBtn = backdrop.querySelector('#wt-submit-btn');

    const closeModal = () => {
      if (selectedImagePreviewUrl) {
        URL.revokeObjectURL(selectedImagePreviewUrl);
        selectedImagePreviewUrl = '';
      }
      document.removeEventListener('keydown', onModalKeydown);
        backdrop.classList.remove('visible');
        backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    };

    const persistDraft = () => {
      saveWriteDraft({
        category: selectedCat,
        anonymousNickname: nickInput.value,
        title: titleInput.value,
        body: textarea.value,
        linkUrl: selectedLinkUrl || linkInput.value || '',
      });
    };

    const syncTextMeta = () => {
      const nickLen = nickInput.value.length;
      const titleLen = titleInput.value.length;
      const bodyLen = textarea.value.length;
      nickCount.textContent = `${nickLen.toLocaleString('ko-KR')} / 20`;
      titleCount.textContent = `${titleLen.toLocaleString('ko-KR')} / 200`;
      charCount.textContent = `${bodyLen.toLocaleString('ko-KR')} / 5,000`;
      charCount.classList.toggle('warn', bodyLen > 4500);
    };

    const autoResizeBody = () => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(130, textarea.scrollHeight)}px`;
    };

    const onModalKeydown = (e) => {
      if (!document.body.contains(backdrop)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submitBtn.click();
      }
    };
    document.addEventListener('keydown', onModalKeydown);

    backdrop.querySelector('.write-modal-close').addEventListener('click', closeModal);
    backdrop.querySelector('.write-cancel-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

    // 카테고리 선택
    backdrop.querySelectorAll('.write-cat-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            backdrop.querySelectorAll('.write-cat-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCat = btn.dataset.cat;
            persistDraft();
        });
    });

    let selectedImageFile = null;
    let selectedImagePreviewUrl = '';
    let selectedLinkUrl = '';

    nickInput.addEventListener('input', () => { syncTextMeta(); persistDraft(); });
    titleInput.addEventListener('input', () => { syncTextMeta(); persistDraft(); });
    textarea.addEventListener('input', () => {
      syncTextMeta();
      autoResizeBody();
      persistDraft();
    });

    const renderAttachments = () => {
      const attachmentItems = [];

      if (selectedImageFile) {
            if (selectedImagePreviewUrl) URL.revokeObjectURL(selectedImagePreviewUrl);
            selectedImagePreviewUrl = URL.createObjectURL(selectedImageFile);
        attachmentItems.push(`
          <div class="write-attachment-card" data-type="image">
                <img class="write-attachment-thumb" src="${escHtml(selectedImagePreviewUrl)}" alt="첨부 이미지 미리보기">
          <div class="write-attachment-meta">
            <p class="write-attachment-title">${escHtml(selectedImageFile.name)}</p>
            <p class="write-attachment-sub">${formatBytes(selectedImageFile.size)}</p>
          </div>
          <button class="write-attachment-remove" type="button" data-remove="image" aria-label="이미지 첨부 제거">삭제</button>
          </div>
        `);
      }

      if (selectedLinkUrl) {
        attachmentItems.push(`
          <div class="write-attachment-card" data-type="link">
          <div class="write-link-badge">LINK</div>
          <div class="write-attachment-meta">
            <p class="write-attachment-title">${escHtml(readableHost(selectedLinkUrl))}</p>
            <p class="write-attachment-sub">${escHtml(selectedLinkUrl)}</p>
          </div>
          <button class="write-attachment-remove" type="button" data-remove="link" aria-label="링크 첨부 제거">삭제</button>
          </div>
        `);
      }

      attachmentsWrap.innerHTML = attachmentItems.join('');
      attachmentsWrap.classList.toggle('is-empty', attachmentItems.length === 0);

      attachmentsWrap.querySelectorAll('.write-attachment-remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          const type = btn.dataset.remove;
          if (type === 'image') {
            if (selectedImagePreviewUrl) {
              URL.revokeObjectURL(selectedImagePreviewUrl);
              selectedImagePreviewUrl = '';
            }
            selectedImageFile = null;
            imageInput.value = '';
          }
          if (type === 'link') {
            selectedLinkUrl = '';
            linkInput.value = '';
          }
          renderAttachments();
          persistDraft();
        });
      });
    };

    attachImageBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        showToast('이미지 파일만 첨부할 수 있어요');
        imageInput.value = '';
        return;
      }
      if (file.size > 8 * 1024 * 1024) {
        showToast('이미지는 8MB 이하로 첨부해 주세요');
        imageInput.value = '';
        return;
      }
      selectedImageFile = file;
      renderAttachments();
      persistDraft();
    });

    attachLinkBtn.addEventListener('click', () => {
      linkEditor.classList.toggle('hidden');
      if (!linkEditor.classList.contains('hidden')) linkInput.focus();
    });

    const applyLinkAttachment = () => {
      const normalized = normalizeUserHttpUrl(linkInput.value);
      if (linkInput.value.trim() && !normalized) {
        showToast('링크는 http:// 또는 https:// 형식만 가능해요');
        linkInput.focus();
        return;
      }
      selectedLinkUrl = normalized;
      if (normalized) linkEditor.classList.add('hidden');
      renderAttachments();
      persistDraft();
    };

    linkApplyBtn.addEventListener('click', applyLinkAttachment);
    linkInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyLinkAttachment();
      }
    });

    submitBtn.addEventListener('click', async () => {
      const anonymousNickname = nickInput.value.trim();
        const title = titleInput.value.trim();
        const body  = textarea.value.trim();
        if (!title) { titleInput.focus(); return; }

        const pendingLinkUrl = normalizeUserHttpUrl(linkInput.value);
        if (linkInput.value.trim() && !pendingLinkUrl) {
            showToast('링크는 http:// 또는 https:// 형식만 가능해요');
            linkInput.focus();
            return;
        }
        if (pendingLinkUrl) selectedLinkUrl = pendingLinkUrl;

        submitBtn.disabled = true;
        submitBtn.textContent = '등록 중...';

        try {
          let uploadedImageUrl = '';

          if (selectedImageFile) {
            const fd = new FormData();
            fd.append('image', selectedImageFile);
            const uploadRes = await fetch('/api/community/uploads/image', {
              method: 'POST',
              body: fd,
              credentials: 'include',
            });

            if (!uploadRes.ok) {
              const data = await uploadRes.json().catch(() => ({}));
              showToast(data.error || '이미지 업로드에 실패했어요');
              submitBtn.disabled = false;
              submitBtn.textContent = '등록하기';
              return;
            }

            const uploadData = await uploadRes.json();
            uploadedImageUrl = uploadData.image_url || '';
          }

            const r = await fetch('/api/community/posts', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  category: selectedCat,
                  title,
                  body,
              image_url: uploadedImageUrl,
              link_url: selectedLinkUrl,
                  anonymous_nickname: anonymousNickname,
                }),
            });
            if (!r.ok) {
                const { error } = await r.json();
                showToast(error || '오류가 발생했어요');
                submitBtn.disabled = false;
                submitBtn.textContent = '등록하기';
                return;
            }
            closeModal();
            clearWriteDraft();
            showToast('게시글이 등록됐어요 ✓');
            // 최신 글이 맨 위: 카테고리 전체로 리셋 후 리로드
            if (currentCat !== '전체' && currentCat !== selectedCat) {
                currentCat = '전체';
                buildCategoryBar();
            }
            await Promise.all([renderHotPosts(), resetAndLoad()]);
        } catch (_) {
            showToast('네트워크 오류가 발생했어요');
            submitBtn.disabled = false;
            submitBtn.textContent = '등록하기';
        }
    });

    if (draft) {
      nickInput.value = draft.anonymousNickname || getDefaultCommunityNickname();
      titleInput.value = draft.title || '';
      textarea.value = draft.body || '';
      linkInput.value = draft.linkUrl || '';
      selectedLinkUrl = normalizeUserHttpUrl(linkInput.value);
      if (selectedLinkUrl) renderAttachments();
      if (draft.title || draft.body || draft.anonymousNickname) {
        showToast('임시저장 글을 불러왔어요');
      }
    }

    if (!draft) {
      nickInput.value = getDefaultCommunityNickname();
    }

    syncTextMeta();
    autoResizeBody();

    setTimeout(() => titleInput?.focus(), 260);

}

/* ─── UI 헬퍼 ────────────────────────────────────────────── */
function renderEmpty() {
    if (postList.querySelector('.c-empty')) return;
    const li = document.createElement('li');
    li.className = 'c-empty';
    li.innerHTML = `
      <div class="c-empty__icon">📭</div>
      <p class="c-empty__title">${searchQuery ? '검색 결과가 없어요' : '아직 게시글이 없어요'}</p>
      <p class="c-empty__desc">${searchQuery ? `"${escHtml(searchQuery)}"에 해당하는 글이 없습니다` : '첫 번째 글을 작성해 보세요!'}</p>`;
    postList.appendChild(li);
}

function renderError() {
    const li = document.createElement('li');
    li.className = 'c-empty';
    li.innerHTML = `
      <div class="c-empty__icon">⚠️</div>
      <p class="c-empty__title">게시글을 불러올 수 없어요</p>
      <p class="c-empty__desc">잠시 후 다시 시도해 주세요</p>`;
    postList.appendChild(li);
}

function updateBadge(total) {
    postCountBadge.textContent = total >= 1000
        ? `${(total / 1000).toFixed(1)}k`
        : String(total);
}

/* ─── Toast ─────────────────────────────────────────────── */
function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'c-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('visible')));
    setTimeout(() => {
        t.classList.remove('visible');
        t.addEventListener('transitionend', () => t.remove(), { once: true });
    }, 2400);
}

async function readApiError(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (data?.code === 'EULA_REQUIRED') {
    showToast('최신 이용약관 동의 후 이용할 수 있어요. 메인 화면에서 동의해 주세요.');
    return null;
  }
  return data?.error || fallback;
}

async function refreshBlockedUsers() {
  if (!currentUser) return;
  try {
    const r = await fetch('/api/community/blocks', { credentials: 'include' });
    if (!r.ok) return;
    const data = await r.json();
    const ids = (data.blocks || []).map((b) => Number(b.blocked_id)).filter((n) => Number.isInteger(n));
    currentUserBlocks = new Set(ids);
  } catch (_) {
    // Ignore refresh failures.
  }
}

function openReportModal() {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="write-modal" role="dialog" aria-modal="true" aria-label="게시물 신고" style="max-width:540px;">
        <div class="write-modal-handle"></div>
        <div class="write-modal-header">
          <h2 class="write-modal-title">게시물 신고</h2>
          <button class="write-modal-close" aria-label="닫기" id="report-close-btn">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </div>
        <div class="write-modal-body">
          <div class="write-field">
            <label class="write-label" for="report-reason-select">신고 사유</label>
            <select id="report-reason-select" class="write-input">
              ${REPORT_REASON_OPTIONS.map((o) => `<option value="${o.code}">${o.label}</option>`).join('')}
            </select>
          </div>
          <div class="write-field">
            <div class="write-label-row">
              <label class="write-label" for="report-detail-text">상세 사유(선택)</label>
              <span class="write-inline-count" id="report-detail-count">0 / 500</span>
            </div>
            <textarea id="report-detail-text" class="write-textarea" rows="4" maxlength="500" placeholder="운영팀 검토에 도움이 되는 내용을 입력해 주세요."></textarea>
          </div>
          <p style="font-size:11px;color:var(--text-3);line-height:1.5;">허위 신고 또는 반복 악용 시 이용이 제한될 수 있습니다.</p>
        </div>
        <div class="write-modal-footer">
          <button class="write-cancel-btn" id="report-cancel-btn">취소</button>
          <button class="write-submit-btn" id="report-submit-btn">신고하기</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const close = (payload) => {
      backdrop.classList.remove('visible');
      backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
      resolve(payload);
    };

    const closeBtn = backdrop.querySelector('#report-close-btn');
    const cancelBtn = backdrop.querySelector('#report-cancel-btn');
    const submitBtn = backdrop.querySelector('#report-submit-btn');
    const reasonSelect = backdrop.querySelector('#report-reason-select');
    const detailText = backdrop.querySelector('#report-detail-text');
    const detailCount = backdrop.querySelector('#report-detail-count');

    detailText.addEventListener('input', () => {
      detailCount.textContent = `${detailText.value.length.toLocaleString('ko-KR')} / 500`;
    });

    closeBtn.addEventListener('click', () => close(null));
    cancelBtn.addEventListener('click', () => close(null));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });

    submitBtn.addEventListener('click', () => {
      const reasonCode = String(reasonSelect.value || '').trim();
      const detail = String(detailText.value || '').trim();
      if (!REPORT_REASON_OPTIONS.some((o) => o.code === reasonCode)) {
        showToast('신고 사유를 선택해 주세요');
        return;
      }
      if (detail.length > 500) {
        showToast('상세 사유는 500자 이하로 입력해 주세요');
        return;
      }
      close({ reason_code: reasonCode, detail });
    });
  });
}

/* ─── 유틸리티 ───────────────────────────────────────────── */
function fmtRelative(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60)    return '방금';
    if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}.${dd}`;
}

function escHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getCommunityFriendActionConfig(user) {
  const viewerId = Number(currentUser?.id || 0);
  const targetId = Number(user?.id || 0);
  const friendshipId = Number(user?.friendship_id || 0);
  const status = String(user?.friendship_status || 'none');
  const direction = String(user?.friendship_dir || '');
  const allowFriendRequests = user?.allow_friend_requests !== false;

  if (!viewerId || !targetId || viewerId === targetId) return null;

  if (status === 'accepted') {
    return {
      label: '동맹 해제',
      action: 'remove',
      friendshipId,
      disabled: false,
      modifierClass: 'is-remove',
      status: 'accepted',
    };
  }

  if (status === 'pending' && direction === 'received') {
    return {
      label: friendshipId > 0 ? '신청 수락' : '신청 확인',
      action: friendshipId > 0 ? 'accept' : 'disabled',
      friendshipId,
      disabled: friendshipId <= 0,
      modifierClass: 'is-accept',
      status: 'pending',
      direction: 'received',
    };
  }

  if (status === 'pending' && direction === 'sent') {
    return {
      label: friendshipId > 0 ? '신청 취소' : '신청 중',
      action: friendshipId > 0 ? 'cancel' : 'disabled',
      friendshipId,
      disabled: friendshipId <= 0,
      modifierClass: 'is-pending',
      status: 'pending',
      direction: 'sent',
    };
  }

  if (!allowFriendRequests) {
    return {
      label: '신청 불가',
      action: 'disabled',
      friendshipId: 0,
      disabled: true,
      modifierClass: 'is-disabled',
    };
  }

  return {
    label: '동맹 신청',
    action: 'request',
    friendshipId: 0,
    disabled: false,
    modifierClass: '',
  };
}

function renderCommunityFriendActionButton(user) {
  const config = getCommunityFriendActionConfig(user);
  if (!config) return '';

  const className = ['user-profile-friend-btn', config.modifierClass].filter(Boolean).join(' ');
  const disabledAttr = config.disabled ? 'disabled' : '';
  
  // 받은 신청은 2버튼 레이아웃 (수락/거절)
  if (config.status === 'pending' && config.direction === 'received') {
    return `
      <div class="user-profile-actions is-dual">
        <button
          type="button"
          class="user-profile-friend-btn is-accept"
          data-target-id="${Number(user.id || 0)}"
          data-friendship-id="${config.friendshipId}"
          data-action="accept"
        >수락</button>
        <button
          type="button"
          class="user-profile-friend-btn is-reject"
          data-target-id="${Number(user.id || 0)}"
          data-friendship-id="${config.friendshipId}"
          data-action="reject"
        >거절</button>
      </div>`;
  }
  
  // 동맹 완료 상태는 2버튼 레이아웃 (메시지/해제)
  if (config.status === 'accepted') {
    return `
      <div class="user-profile-actions is-dual">
        <button
          type="button"
          class="user-profile-friend-btn is-message"
          data-target-id="${Number(user.id || 0)}"
          data-action="message"
        >메시지</button>
        <button
          type="button"
          class="user-profile-friend-btn is-remove"
          data-target-id="${Number(user.id || 0)}"
          data-friendship-id="${config.friendshipId}"
          data-action="remove"
        >동맹 해제</button>
      </div>`;
  }

  return `
    <div class="user-profile-actions">
      <button
        type="button"
        class="${className}"
        data-target-id="${Number(user.id || 0)}"
        data-friendship-id="${config.friendshipId}"
        data-action="${escHtml(config.action)}"
        ${disabledAttr}
      >${escHtml(config.label)}</button>
    </div>`;
}

async function refreshCommunityFriendState(user) {
  const targetId = Number(user?.id || 0);
  if (!targetId || !currentUser) return;

  try {
    const statusRes = await fetch(`/api/friends/status/${targetId}`, { credentials: 'include' });
    if (!statusRes.ok) return;
    const statusData = await statusRes.json().catch(() => ({}));
    user.friendship_status = statusData.status || 'none';
    user.friendship_dir = statusData.status === 'pending'
      ? (statusData.is_sender ? 'sent' : 'received')
      : null;
    user.friendship_id = statusData.friendship_id || null;
  } catch (_) {
    // 상태 재조회 실패 시 현재 값 유지
  }
}

async function handleCommunityFriendAction(button, user) {
  if (!button || !user) return;

  const targetId = Number(user.id || 0);
  const friendshipId = Number(user.friendship_id || 0);
  const action = String(button.dataset.action || '');
  if (!targetId || !action || action === 'disabled') return;

  // 메시지 버튼 클릭
  if (action === 'message') {
    const nickname = user.display_nickname || user.nickname || '사용자';
    const dmUrl = `/messages/?dm=${targetId}&name=${encodeURIComponent(nickname)}`;
    window.location.href = dmUrl;
    return;
  }

  if (action === 'remove') {
    const confirmed = window.confirm('동맹을 해제할까요?');
    if (!confirmed) return;
  }

  const previousState = {
    friendship_status: user.friendship_status || 'none',
    friendship_dir: user.friendship_dir || null,
    friendship_id: user.friendship_id || null,
  };
  const originalLabel = button.textContent;

  button.disabled = true;
  button.textContent = '처리 중...';

  try {
    let response;
    let apiAction = action;

    if (action === 'request') {
      response = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ target_id: targetId }),
      });
    } else if (action === 'accept') {
      response = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friendship_id: friendshipId }),
      });
    } else if (action === 'cancel' || action === 'reject') {
      apiAction = 'reject';
      response = await fetch('/api/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ friendship_id: friendshipId }),
      });
    } else if (action === 'remove') {
      response = await fetch(`/api/friends/${targetId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    } else {
      return;
    }

    if (!response.ok) {
      const errorMsg = await readApiError(response, '동맹 처리에 실패했어요');
      user.friendship_status = previousState.friendship_status;
      user.friendship_dir = previousState.friendship_dir;
      user.friendship_id = previousState.friendship_id;
      syncCommunityFriendActionModalButtons(button.closest('.user-profile-actions'), user);
      if (errorMsg) showToast(errorMsg);
      return;
    }

    if (action === 'request') {
      user.friendship_status = 'pending';
      user.friendship_dir = 'sent';
      showToast('동맹 신청을 보냈어요');
    } else if (action === 'accept') {
      user.friendship_status = 'accepted';
      user.friendship_dir = null;
      showToast('동맹을 맺었어요');
    } else if (action === 'reject') {
      user.friendship_status = 'none';
      user.friendship_dir = null;
      user.friendship_id = null;
      showToast('동맹 신청을 거절했어요');
    } else if (action === 'cancel') {
      user.friendship_status = 'none';
      user.friendship_dir = null;
      user.friendship_id = null;
      showToast('동맹 신청을 취소했어요');
    } else if (action === 'remove') {
      user.friendship_status = 'none';
      user.friendship_dir = null;
      user.friendship_id = null;
      showToast('동맹을 해제했어요');
    }

    await refreshCommunityFriendState(user);
    syncCommunityFriendActionModalButtons(button.closest('.user-profile-actions'), user);
  } catch (_) {
    user.friendship_status = previousState.friendship_status;
    user.friendship_dir = previousState.friendship_dir;
    user.friendship_id = previousState.friendship_id;
    button.textContent = originalLabel;
    syncCommunityFriendActionModalButtons(button.closest('.user-profile-actions'), user);
    showToast('동맹 처리 중 오류가 발생했어요');
  }
}

function syncCommunityFriendActionModalButtons(actionsContainer, user) {
  if (!actionsContainer) return;
  const newHtml = renderCommunityFriendActionButton(user);
  if (newHtml) {
    actionsContainer.outerHTML = newHtml;
  } else {
    actionsContainer.remove();
  }
}

async function openUserProfile(userId) {
  if (!Number.isInteger(userId) || userId <= 0) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="write-modal profile-modal" role="dialog" aria-modal="true" aria-label="유저 프로필" style="max-width:420px;">
      <div class="write-modal-handle"></div>
      <div class="write-modal-header">
        <h2 class="write-modal-title">유저 프로필</h2>
        <button class="write-modal-close" aria-label="닫기" id="profile-close-btn">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
          </svg>
        </button>
      </div>
      <div class="write-modal-body" id="profile-body" style="min-height:220px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="skel" style="width:54px;height:54px;border-radius:50%;"></div>
          <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
            <div class="skel" style="height:16px;width:70%;"></div>
            <div class="skel" style="height:12px;width:45%;"></div>
          </div>
        </div>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  const close = () => {
    backdrop.classList.remove('visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
  };

  backdrop.querySelector('#profile-close-btn')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  try {
    const r = await fetch(`/api/community/users/${userId}`, { credentials: 'include' });
    if (!r.ok) {
      const msg = await readApiError(r, '프로필을 불러올 수 없어요');
      if (msg) showToast(msg);
      close();
      return;
    }

    const { user } = await r.json();
    const profileBody = backdrop.querySelector('#profile-body');
    const profileImage = safeHttpUrl(user.profile_image_url);
    const friendActionHtml = renderCommunityFriendActionButton(user);
    profileBody.innerHTML = `
      <div class="user-profile-head">
        ${profileImage ? `<img class="user-profile-avatar" src="${escHtml(profileImage)}" alt="${escHtml(user.display_nickname || user.nickname)} 프로필">` : '<div class="user-profile-avatar user-profile-avatar--empty">👤</div>'}
        <div class="user-profile-main">
          <p class="user-profile-nick">${escHtml(user.display_nickname || user.nickname || '익명')}</p>
          <p class="user-profile-sub">${escHtml(user.university || '비공개')}</p>
        </div>
      </div>
      <div class="user-profile-grid">
        <div class="user-profile-cell"><span>티어</span><strong>${escHtml(user.tier || '-')}</strong></div>
        <div class="user-profile-cell"><span>연속 출석</span><strong>${Number(user.streak_count || 0).toLocaleString('ko-KR')}일</strong></div>
        <div class="user-profile-cell"><span>경험치</span><strong>${Number(user.exp || 0).toLocaleString('ko-KR')}</strong></div>
        <div class="user-profile-cell"><span>골드</span><strong>${Number(user.gold || 0).toLocaleString('ko-KR')}G</strong></div>
      </div>
      ${user.status_message ? `<p class="user-profile-status">${escHtml(user.status_emoji || '')} ${escHtml(user.status_message)}</p>` : ''}
      ${friendActionHtml}
    `;

    const friendActionBtns = profileBody.querySelectorAll('.user-profile-friend-btn');
    friendActionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        handleCommunityFriendAction(btn, user);
      });
    });
  } catch (_) {
    showToast('프로필을 불러올 수 없어요');
    close();
  }
}

function renderNicknameWithBadge({ nickname, isVerifiedNickname, userId = 0, profileImageUrl = '', className = '' }) {
  const badge = isVerifiedNickname
    ? '<span class="user-verified-badge" aria-label="본인 닉네임 인증" title="본인 닉네임 인증">✓</span>'
    : '';
  const safeClass = className ? ` ${escHtml(className)}` : '';
  const safeUserId = Number.isInteger(Number(userId)) ? Number(userId) : 0;
  const safeProfileImageUrl = safeHttpUrl(profileImageUrl);
  const avatar = isVerifiedNickname && safeProfileImageUrl
    ? `<img class="user-avatar-inline" src="${escHtml(safeProfileImageUrl)}" alt="" loading="lazy">`
    : '';

  if (isVerifiedNickname && safeUserId > 0) {
    return `<button class="user-name-inline js-open-user-profile${safeClass}" type="button" data-user-id="${safeUserId}">${avatar}${escHtml(nickname)}${badge}</button>`;
  }

  return `<span class="user-name-inline">${avatar}${escHtml(nickname)}${badge}</span>`;
}

function safeHttpUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (/^\/uploads\/community\/[a-zA-Z0-9._-]+$/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function normalizeUserHttpUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
  } catch (_) {
    return '';
  }
}

function readableHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '첨부 링크';
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
}

function truncateText(text, maxLength) {
  const raw = String(text || '');
  const limit = Math.max(1, Number(maxLength) || 0);
  if (raw.length <= limit) return raw;
  return `${raw.slice(0, limit).trim()}...`;
}

function currentUserIsAdmin() {
  if (!currentUser) return false;
  return currentUser.admin_role === 'main'
    || currentUser.admin_role === 'sub'
    || currentUser.is_admin === true;
}

/* ─── 상세 모달 추가 스타일 (동적 주입 — style.css 의존 최소화) */
const detailStyle = document.createElement('style');
detailStyle.textContent = `
.post-detail-modal { max-height: 90dvh; }
.post-inline-detail {
  list-style:none;
  margin:4px 0 14px;
}
.post-inline-detail__panel {
  border:1px solid var(--border-mid);
  border-radius:14px;
  background:var(--surface);
  padding:14px;
}
.post-inline-detail__head {
  display:flex;
  justify-content:flex-end;
  margin-bottom:8px;
}
.post-inline-detail__close {
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height:30px;
  padding:0 12px;
  border-radius:999px;
  border:1px solid var(--border-mid);
  background:var(--surface-2);
  color:var(--text-2);
  font-size:12px;
  font-weight:700;
}
.post-inline-detail__body {
  min-height:52px;
}
.post-row.is-open {
  background:color-mix(in srgb, var(--accent-blue) 10%, transparent);
}
.c-hot-card.is-open {
  box-shadow:0 0 0 1px color-mix(in srgb, var(--accent-blue) 55%, transparent) inset;
}
.detail-cat-row { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.detail-date { font-size:11.5px; color:var(--text-3); margin-left:auto; }
.detail-title { font-size:16px; font-weight:700; color:var(--text-1); line-height:1.5; margin-bottom:8px; word-break:break-word; }
.detail-author-row { display:flex; align-items:center; gap:6px; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.detail-stat { font-size:11.5px; color:var(--text-3); margin-left:4px; }
.detail-body-text { font-size:14px; color:var(--text-1); line-height:1.7; white-space:pre-wrap; word-break:break-word; margin-bottom:18px; padding-bottom:16px; border-bottom:1px solid var(--border); }
.detail-image-wrap { margin-bottom:14px; border:1px solid var(--border); border-radius:12px; overflow:hidden; background:var(--surface-2); }
.detail-image { display:block; width:100%; max-height:320px; object-fit:cover; }
.detail-link { display:inline-flex; margin:0 0 16px; font-size:13px; font-weight:600; color:var(--accent-blue); }
.detail-actions { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
.detail-actions > button,
.detail-actions > span { min-width:0; }
.detail-like-btn {
  display:inline-flex; align-items:center; gap:5px; height:32px; padding:0 14px;
  background:var(--surface-2); border-radius:var(--radius-pill); font-size:12.5px;
  font-weight:600; color:var(--text-2); border:1.5px solid var(--border-mid);
  transition:color var(--transition),border-color var(--transition);
  max-width:100%;
}
.detail-like-btn:hover { color:var(--accent-red); border-color:rgba(255,69,58,0.3); }
.detail-like-btn.is-active { color:var(--accent-red); border-color:rgba(255,69,58,0.35); background:rgba(255,69,58,0.12); }
.detail-gold-like-btn {
  display:inline-flex; align-items:center; justify-content:center; height:32px; padding:0 12px;
  background:rgba(246,166,35,0.16); border-radius:var(--radius-pill); font-size:12px;
  font-weight:700; color:var(--accent-gold); border:1px solid rgba(246,166,35,0.35);
  max-width:100%;
}
.detail-gold-like-btn:disabled { opacity:0.45; cursor:not-allowed; }
.detail-gold-balance {
  display:inline-flex; align-items:center; min-height:32px; font-size:12px; color:var(--text-2);
  padding:0 6px;
  white-space:normal;
}
.detail-comments { display:flex; flex-direction:column; gap:12px; }
.detail-cmt-head { font-size:13px; font-weight:700; color:var(--text-2); }
.detail-cmt-head-wrap { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.detail-cmt-sort { display:flex; align-items:center; gap:6px; }
.detail-cmt-sort-btn {
  height:24px; padding:0 8px; border-radius:999px; border:1px solid var(--border-mid);
  background:var(--surface-2); color:var(--text-3); font-size:10.5px; font-weight:700;
}
.detail-cmt-sort-btn.is-active {
  color:var(--accent-blue); border-color:rgba(59,130,246,0.35); background:rgba(59,130,246,0.12);
}
.cmt-list { display:flex; flex-direction:column; }
.cmt-item { padding:11px 0; border-bottom:1px solid var(--border); }
.cmt-item:last-child { border-bottom:none; }
.cmt-item--mine { background:color-mix(in srgb, var(--accent-blue) 8%, transparent); }
.cmt-item--author { background:color-mix(in srgb, var(--accent-green) 7%, transparent); }
.cmt-empty { padding:24px 0; text-align:center; color:var(--text-3); font-size:13px; }
.cmt-meta { display:flex; align-items:center; gap:5px; margin-bottom:5px; }
.cmt-nick { font-size:12px; font-weight:600; color:var(--text-1); }
.cmt-badge {
  display:inline-flex; align-items:center; height:16px; padding:0 6px; border-radius:999px;
  font-size:9.5px; font-weight:700;
}
.cmt-badge--mine { color:var(--accent-blue); background:rgba(59,130,246,0.14); border:1px solid rgba(59,130,246,0.28); }
.cmt-badge--author { color:var(--accent-green); background:rgba(48,209,88,0.14); border:1px solid rgba(48,209,88,0.28); }
.cmt-ip   { font-size:11px; color:var(--text-3); }
.cmt-date { font-size:11px; color:var(--text-3); margin-left:auto; }
.cmt-body { font-size:13.5px; color:var(--text-1); line-height:1.55; white-space:pre-wrap; word-break:break-word; }
.cmt-actions { margin-top:6px; display:flex; justify-content:flex-end; }
.cmt-like-btn {
  height:26px; padding:0 10px; border-radius:999px;
  border:1px solid var(--border-mid); background:var(--surface-2);
  color:var(--text-2); font-size:11px; font-weight:700;
}
.cmt-like-btn.is-active {
  color:var(--accent-red); border-color:rgba(255,69,58,0.35); background:rgba(255,69,58,0.1);
}
.cmt-write { display:flex; flex-direction:column; padding-top:10px; border-top:1px solid var(--border); }
.detail-admin-del-btn {
  display:inline-flex; align-items:center; justify-content:center; height:32px; padding:0 14px;
  background:rgba(255,69,58,0.14); border-radius:var(--radius-pill); font-size:12px; font-weight:700;
  color:var(--accent-red); border:1px solid rgba(255,69,58,0.35);
  max-width:100%;
}
.detail-report-btn {
  display:inline-flex; align-items:center; justify-content:center; height:32px; padding:0 14px;
  background:rgba(59,130,246,0.12); border-radius:var(--radius-pill); font-size:12px; font-weight:700;
  color:var(--accent-blue); border:1px solid rgba(59,130,246,0.3);
  max-width:100%;
}
.detail-bookmark-btn {
  display:inline-flex; align-items:center; justify-content:center; height:32px; padding:0 14px;
  background:rgba(48,209,88,0.12); border-radius:var(--radius-pill); font-size:12px; font-weight:700;
  color:var(--accent-green); border:1px solid rgba(48,209,88,0.3);
  max-width:100%;
}
.detail-bookmark-btn.is-active { background:rgba(48,209,88,0.18); border-color:rgba(48,209,88,0.45); }
.detail-block-btn {
  display:inline-flex; align-items:center; justify-content:center; height:32px; padding:0 14px;
  background:rgba(255,69,58,0.1); border-radius:var(--radius-pill); font-size:12px; font-weight:700;
  color:var(--accent-red); border:1px solid rgba(255,69,58,0.25);
  max-width:100%;
}
.cmt-admin-del {
  margin-left:8px; font-size:11px; color:var(--accent-red); font-weight:700;
  border:1px solid rgba(255,69,58,0.3); border-radius:999px; padding:2px 8px;
}
.user-profile-head { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
.user-profile-avatar {
  width:54px; height:54px; border-radius:50%; object-fit:cover;
  border:1px solid var(--border-mid); background:var(--surface-2);
}
.user-profile-avatar--empty {
  display:flex; align-items:center; justify-content:center; font-size:24px; color:var(--text-3);
}
.user-profile-main { min-width:0; }
.user-profile-nick { font-size:15px; font-weight:700; color:var(--text-1); }
.user-profile-sub {
  margin-top:4px; font-size:12px; color:var(--text-2);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.user-profile-grid {
  display:grid; grid-template-columns:1fr 1fr; gap:8px;
}
.user-profile-cell {
  display:flex; flex-direction:column; gap:3px;
  padding:10px 11px; background:var(--surface-2); border:1px solid var(--border);
  border-radius:10px;
}
.user-profile-cell span { font-size:11px; color:var(--text-3); }
.user-profile-cell strong { font-size:13px; color:var(--text-1); }
.user-profile-status {
  margin-top:12px; padding:10px 11px; border-radius:10px;
  background:color-mix(in srgb, var(--surface-2) 72%, transparent);
  border:1px solid var(--border); font-size:12.5px; line-height:1.45; color:var(--text-2);
}
@media (max-width: 720px) {
  .post-inline-detail__panel {
    padding:12px;
  }
  .detail-actions > button {
    flex:1 1 calc(50% - 4px);
    min-width:140px;
    height:auto;
    min-height:34px;
    padding:8px 12px;
    line-height:1.35;
    white-space:normal;
    text-align:center;
  }
  .detail-gold-balance {
    flex:1 1 100%;
    padding:2px 2px 0;
  }
}
@media (max-width: 540px) {
  .detail-cat-row,
  .detail-cmt-head-wrap {
    flex-wrap:wrap;
    align-items:flex-start;
  }
  .detail-date {
    margin-left:0;
  }
  .detail-actions {
    gap:6px;
  }
  .detail-actions > button {
    flex:1 1 100%;
    min-width:0;
    font-size:11.5px;
  }
  .detail-gold-balance {
    font-size:11.5px;
  }
  .post-inline-detail__close {
    width:100%;
  }
}
`;
document.head.appendChild(detailStyle);

/* ─── 부트스트랩 ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
