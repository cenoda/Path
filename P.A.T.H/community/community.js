/**
 * community.js — P.A.T.H 커뮤니티 컨트롤러 (실서버 연동)
 *
 * API:
 *   GET  /api/community/posts?page=&limit=&category=&q=
 *   GET  /api/community/posts/hot?category=
 *   POST /api/community/posts
 *   POST /api/community/posts/:id/view
 *   POST /api/community/posts/:id/like
 *   GET  /api/community/posts/:id/comments
 *   POST /api/community/posts/:id/comments
 */

import { PostListItem, SkeletonItem, CATEGORY_META } from './PostListItem.js';
import { useInfiniteScroll }                          from './useInfiniteScroll.js';

/* ─── 상수 ─────────────────────────────────────────────────── */
const PAGE_SIZE     = 25;
const HOT_THRESHOLD = 15;  // 베스트 승격 기준(추천 15+)
const WRITABLE_CATS = ['정보', '질문', '잡담'];

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
let scrollHook   = null;
let isLoading    = false;
let currentUser  = null;  // { id, nickname, is_admin, admin_role } | null

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
const writeFab       = document.getElementById('write-fab');
const writeHeaderBtn = document.getElementById('write-header-btn');

/* ─── 초기화 ──────────────────────────────────────────────── */
async function init() {
    buildCategoryBar();
    bindEvents();

    // 로그인 상태 확인 (실패해도 게시판은 열람 가능)
    try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const me = await res.json();
        currentUser = me.user || me;
      }
    } catch (_) { /* 무시 */ }

    updateWriteControls();

    await Promise.all([renderHotPosts(), resetAndLoad()]);
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

    [writeFab, writeHeaderBtn].forEach((btn) => {
      btn.disabled = blocked;
      btn.title = title;
      btn.style.opacity = blocked ? '0.45' : '';
      btn.style.cursor = blocked ? 'not-allowed' : '';
    });
  }

/* ─── 베스트 게시글 ─────────────────────────────────────── */
async function renderHotPosts() {
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
    li.innerHTML = `
      <div class="c-hot-card" role="button" tabindex="0" data-post-id="${post.id}">
        <div class="c-hot-card__cat ${cat.cls}">${cat.label}</div>
        <p class="c-hot-card__title">${escHtml(post.title)}</p>
        <div class="c-hot-card__footer">
          <span class="c-hot-card__author">${escHtml(post.nickname ?? '익명')}(${escHtml(post.ip_prefix ?? '?')})</span>
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
      </div>`;
    li.querySelector('.c-hot-card').addEventListener('click', () => openPostDetail(post.id));
    return li;
}

/* ─── 목록 초기화 + 첫 로드 ─────────────────────────────── */
async function resetAndLoad() {
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
                category:     post.category,
                title:        post.title,
                nickname:     post.nickname ?? '익명',
                ipPrefix:     post.ip_prefix ?? '?.?',
                likes:        post.likes,
                comments:     post.comments_count,
                views:        post.views,
                createdAt:    post.created_at,
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
    postList.querySelectorAll('.post-row:not([data-bound])').forEach(row => {
        row.dataset.bound = '1';
        row.addEventListener('click', e => {
            e.preventDefault();
            const id = parseInt(row.dataset.id);
            if (id) openPostDetail(id);
        });
    });
}

/* ─── 게시글 상세 모달 ───────────────────────────────────── */
async function openPostDetail(postId) {
    // 조회수 증가 (fire-and-forget)
    fetch(`/api/community/posts/${postId}/view`, {
        method: 'POST', credentials: 'include',
    }).catch(() => {});

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="write-modal post-detail-modal" role="dialog" aria-modal="true" style="max-width:640px">
        <div class="write-modal-handle"></div>
        <div class="write-modal-header">
          <button class="write-modal-close" aria-label="닫기" id="detail-close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="1" y1="1" x2="13" y2="13"/><line x1="13" y1="1" x2="1" y2="13"/>
            </svg>
          </button>
        </div>
        <div class="write-modal-body" id="detail-body">
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="skel" style="height:20px;width:70%"></div>
            <div class="skel" style="height:14px;width:40%"></div>
            <div class="skel" style="height:100px;width:100%"></div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const closeDetail = () => {
        backdrop.classList.remove('visible');
        backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    };
    backdrop.querySelector('#detail-close').addEventListener('click', closeDetail);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDetail(); });

    try {
        // 게시글 + 댓글 병렬 로드
        const [postRes, cmtRes] = await Promise.all([
            fetch(`/api/community/posts/${postId}`, { credentials: 'include' }),
            fetch(`/api/community/posts/${postId}/comments`, { credentials: 'include' }),
        ]);

        if (!postRes.ok) throw new Error('not found');
        const { post } = await postRes.json();
        const cmts = cmtRes.ok ? (await cmtRes.json()).comments : [];

        renderDetailBody(backdrop.querySelector('#detail-body'), { post, postId, comments: cmts });
    } catch (_) {
        backdrop.querySelector('#detail-body').innerHTML =
            `<p style="color:var(--text-2);text-align:center;padding:32px">게시글을 불러올 수 없어요.</p>`;
    }
}

function renderDetailBody(container, { post, postId, comments }) {
    const cat     = CATEGORY_META[post.category] ?? CATEGORY_META['전체'];
    const canModerate = currentUserIsAdmin();
    const cmtHtml = comments.map(c => `
      <li class="cmt-item" data-comment-id="${c.id}">
        <div class="cmt-meta">
          <span class="cmt-nick">${escHtml(c.nickname ?? '익명')}</span>
          <span class="cmt-ip">(${escHtml(c.ip_prefix ?? '?.?')})</span>
          <span class="cmt-date">${fmtRelative(c.created_at)}</span>
          ${canModerate ? '<button class="cmt-admin-del" type="button">삭제</button>' : ''}
        </div>
        <p class="cmt-body">${escHtml(c.body)}</p>
      </li>`).join('');

    container.innerHTML = `
      <div class="detail-cat-row">
        <span class="post-row__cat ${cat.cls}">${cat.label}</span>
        <span class="detail-date">${fmtRelative(post.created_at)}</span>
      </div>
      <h3 class="detail-title">${escHtml(post.title)}</h3>
      <div class="detail-author-row">
        <span class="cmt-nick">${escHtml(post.nickname ?? '익명')}</span>
        <span class="cmt-ip">(${escHtml(post.ip_prefix ?? '?.?')})</span>
        <span class="detail-stat">조회 ${post.views}</span>
        <span class="detail-stat" style="color:var(--accent-red)">추천 ${post.likes}</span>
      </div>
      ${post.body ? `<div class="detail-body-text">${escHtml(post.body)}</div>` : ''}
      <div class="detail-actions">
        <button class="detail-like-btn" id="detail-like-btn">
          <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor">
            <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
          </svg>
          추천 <span id="like-count">${post.likes}</span>
        </button>
        ${canModerate ? '<button class="detail-admin-del-btn" id="detail-admin-del-btn">게시글 삭제</button>' : ''}
      </div>
      <div class="detail-comments">
        <p class="detail-cmt-head">댓글 <strong>${comments.length}</strong></p>
        <ul class="cmt-list" id="cmt-list">${cmtHtml || '<li class="cmt-empty">아직 댓글이 없어요.</li>'}</ul>
        <div class="cmt-write">
          <textarea id="cmt-input" class="write-textarea" rows="2" placeholder="댓글을 입력하세요 (최대 1,000자)" maxlength="1000"></textarea>
          <div style="display:flex;justify-content:flex-end;margin-top:8px">
            <button class="write-submit-btn" id="cmt-submit">등록</button>
          </div>
        </div>
      </div>`;

    // 추천
    container.querySelector('#detail-like-btn').addEventListener('click', async () => {
        if (!currentUser) { showToast('로그인 후 이용할 수 있어요'); return; }
        try {
            const r = await fetch(`/api/community/posts/${postId}/like`, {
                method: 'POST', credentials: 'include',
            });
            if (r.ok) {
                const { liked, likes } = await r.json();
                const btn = container.querySelector('#detail-like-btn');
                btn.style.color = liked ? 'var(--accent-red)' : '';
                btn.querySelector('svg').style.fill = liked ? 'var(--accent-red)' : '';
                const countSpan = container.querySelector('#like-count');
                if (countSpan) countSpan.textContent = likes;
                showToast(liked ? `추천 ${likes}` : '추천을 취소했어요');
                // 목록 카운트 갱신
                const likeEl = postList.querySelector(`[data-id="${postId}"] .post-row__likes`);
                if (likeEl) likeEl.lastChild.textContent = likes;
            }
        } catch (_) { showToast('오류가 발생했어요'); }
    });

    // 댓글 등록
    container.querySelector('#cmt-submit').addEventListener('click', async () => {
        if (!currentUser) { showToast('로그인 후 댓글을 달 수 있어요'); return; }
        const input = container.querySelector('#cmt-input');
        const body  = input.value.trim();
        if (!body) { input.focus(); return; }

        try {
            const r = await fetch(`/api/community/posts/${postId}/comments`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ body }),
            });
            if (!r.ok) {
                const { error } = await r.json();
                showToast(error || '오류가 발생했어요');
                return;
            }
            const { comment } = await r.json();
            input.value = '';

            const li = document.createElement('li');
            li.className = 'cmt-item';
            li.innerHTML = `
              <div class="cmt-meta">
                <span class="cmt-nick">${escHtml(comment.nickname ?? '익명')}</span>
                <span class="cmt-ip">(${escHtml(comment.ip_prefix ?? '?.?')})</span>
                <span class="cmt-date">방금</span>
              </div>
              <p class="cmt-body">${escHtml(comment.body)}</p>`;

            const emptyEl = container.querySelector('.cmt-empty');
            if (emptyEl) emptyEl.remove();
            container.querySelector('#cmt-list').appendChild(li);

            // 댓글 수 갱신
            const headEl = container.querySelector('.detail-cmt-head strong');
            if (headEl) headEl.textContent = parseInt(headEl.textContent) + 1;
            const cmtBadge = postList.querySelector(`[data-id="${postId}"] .post-row__cmts`);
            if (cmtBadge) cmtBadge.textContent = parseInt(cmtBadge.textContent || '0') + 1;
        } catch (_) { showToast('오류가 발생했어요'); }
    });

      if (canModerate) {
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

/* ─── 이벤트 바인딩 ─────────────────────────────────────── */
function bindEvents() {
    // 검색 토글
    searchToggle.addEventListener('click', () => {
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
    searchInput.addEventListener('input', () => {
        const val = searchInput.value.trim();
        searchClear.classList.toggle('hidden', !val);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            searchQuery = val;
            resetAndLoad();
        }, 320);
    });

    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(searchTimer); searchQuery = searchInput.value.trim(); resetAndLoad(); }
        if (e.key === 'Escape') searchToggle.click();
    });

    searchClear.addEventListener('click', () => {
        searchInput.value = '';
        searchClear.classList.add('hidden');
        searchInput.focus();
        searchQuery = '';
        resetAndLoad();
        renderHotPosts();
    });

    // 글쓰기
    writeFab.addEventListener('click', handleWriteClick);
    writeHeaderBtn.addEventListener('click', handleWriteClick);
}

function handleWriteClick() {
  if (currentCat === '념글') {
    showToast('베스트 게시판에는 글을 작성할 수 없어요');
    return;
  }

    if (!currentUser) {
        showToast('로그인 후 글을 작성할 수 있어요');
        setTimeout(() => { window.location.href = '/login/'; }, 1200);
        return;
    }
    showWriteModal();
}

/* ─── 글쓰기 모달 ─────────────────────────────────────────── */
function showWriteModal() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
  const cats = CATEGORIES.filter(c => WRITABLE_CATS.includes(c.key));
  let selectedCat = WRITABLE_CATS.includes(currentCat) ? currentCat : '정보';

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
        <div class="write-modal-body">
          <div class="write-field">
            <label class="write-label">카테고리</label>
            <div class="write-cat-chips">
              ${cats.map(c => `<button class="write-cat-chip${c.key === selectedCat ? ' active' : ''}" data-cat="${c.key}">${c.label}</button>`).join('')}
            </div>
          </div>
          <div class="write-field">
            <label class="write-label" for="wt-anon-nick">익명 닉네임</label>
            <input id="wt-anon-nick" class="write-input" type="text" placeholder="익명 닉네임 (2~20자, 기본: 익명)" maxlength="20" autocomplete="off">
          </div>
          <div class="write-field">
            <label class="write-label" for="wt-title">제목</label>
            <input id="wt-title" class="write-input" type="text" placeholder="제목을 입력하세요" maxlength="200" autocomplete="off">
          </div>
          <div class="write-field">
            <label class="write-label" for="wt-body">내용</label>
            <textarea id="wt-body" class="write-textarea" placeholder="자유롭게 작성해 보세요 (최대 5,000자)" maxlength="5000"></textarea>
            <span class="write-char-count" id="wt-char">0 / 5,000</span>
          </div>
        </div>
        <div class="write-modal-footer">
          <button class="write-cancel-btn">취소</button>
          <button class="write-submit-btn" id="wt-submit-btn">등록하기</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('visible'));

    const closeModal = () => {
        backdrop.classList.remove('visible');
        backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true });
    };

    backdrop.querySelector('.write-modal-close').addEventListener('click', closeModal);
    backdrop.querySelector('.write-cancel-btn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModal(); });

    // 카테고리 선택
    backdrop.querySelectorAll('.write-cat-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            backdrop.querySelectorAll('.write-cat-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedCat = btn.dataset.cat;
        });
    });

    // 글자수
    const textarea  = backdrop.querySelector('#wt-body');
    const charCount = backdrop.querySelector('#wt-char');
    textarea.addEventListener('input', () => {
        const len = textarea.value.length;
        charCount.textContent = `${len.toLocaleString('ko-KR')} / 5,000`;
        charCount.classList.toggle('warn', len > 4500);
    });

    // 제출
    const submitBtn = backdrop.querySelector('#wt-submit-btn');
    submitBtn.addEventListener('click', async () => {
      const anonymousNickname = backdrop.querySelector('#wt-anon-nick').value.trim();
        const title = backdrop.querySelector('#wt-title').value.trim();
        const body  = textarea.value.trim();
        if (!title) { backdrop.querySelector('#wt-title').focus(); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = '등록 중...';

        try {
            const r = await fetch('/api/community/posts', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  category: selectedCat,
                  title,
                  body,
                  anonymous_nickname: anonymousNickname,
                }),
            });
            if (r.status === 401) {
                showToast('로그인이 필요해요');
                closeModal();
                return;
            }
            if (!r.ok) {
                const { error } = await r.json();
                showToast(error || '오류가 발생했어요');
                submitBtn.disabled = false;
                submitBtn.textContent = '등록하기';
                return;
            }
            closeModal();
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

    setTimeout(() => backdrop.querySelector('#wt-title')?.focus(), 260);
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
.detail-cat-row { display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.detail-date { font-size:11.5px; color:var(--text-3); margin-left:auto; }
.detail-title { font-size:16px; font-weight:700; color:var(--text-1); line-height:1.5; margin-bottom:8px; word-break:break-word; }
.detail-author-row { display:flex; align-items:center; gap:6px; margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--border); flex-wrap:wrap; }
.detail-stat { font-size:11.5px; color:var(--text-3); margin-left:4px; }
.detail-body-text { font-size:14px; color:var(--text-1); line-height:1.7; white-space:pre-wrap; word-break:break-word; margin-bottom:18px; padding-bottom:16px; border-bottom:1px solid var(--border); }
.detail-actions { display:flex; gap:8px; margin-bottom:18px; }
.detail-like-btn {
  display:inline-flex; align-items:center; gap:5px; height:32px; padding:0 14px;
  background:var(--surface-2); border-radius:var(--radius-pill); font-size:12.5px;
  font-weight:600; color:var(--text-2); border:1.5px solid var(--border-mid);
  transition:color var(--transition),border-color var(--transition);
}
.detail-like-btn:hover { color:var(--accent-red); border-color:rgba(255,69,58,0.3); }
.detail-comments { display:flex; flex-direction:column; gap:12px; }
.detail-cmt-head { font-size:13px; font-weight:700; color:var(--text-2); }
.cmt-list { display:flex; flex-direction:column; }
.cmt-item { padding:11px 0; border-bottom:1px solid var(--border); }
.cmt-item:last-child { border-bottom:none; }
.cmt-empty { padding:24px 0; text-align:center; color:var(--text-3); font-size:13px; }
.cmt-meta { display:flex; align-items:center; gap:5px; margin-bottom:5px; }
.cmt-nick { font-size:12px; font-weight:600; color:var(--text-1); }
.cmt-ip   { font-size:11px; color:var(--text-3); }
.cmt-date { font-size:11px; color:var(--text-3); margin-left:auto; }
.cmt-body { font-size:13.5px; color:var(--text-1); line-height:1.55; white-space:pre-wrap; word-break:break-word; }
.cmt-write { display:flex; flex-direction:column; padding-top:10px; border-top:1px solid var(--border); }
.detail-admin-del-btn {
  display:inline-flex; align-items:center; justify-content:center; height:32px; padding:0 14px;
  background:rgba(255,69,58,0.14); border-radius:var(--radius-pill); font-size:12px; font-weight:700;
  color:var(--accent-red); border:1px solid rgba(255,69,58,0.35);
}
.cmt-admin-del {
  margin-left:8px; font-size:11px; color:var(--accent-red); font-weight:700;
  border:1px solid rgba(255,69,58,0.3); border-radius:999px; padding:2px 8px;
}
`;
document.head.appendChild(detailStyle);

/* ─── 부트스트랩 ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
