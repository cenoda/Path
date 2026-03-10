/**
 * PostListItem — DCinside-style table row (Toss design)
 *
 * Columns (desktop): 번호 | [카테고리] 제목 [댓글] | 작성자(ip) | 날짜 | 조회 | 추천
 * Mobile: compact card row
 */

/* ── Category metadata ─────────────────────────────────────────────────── */
export const CATEGORY_META = {
  '전체': { label: '전체', cls: 'cat--all' },
  '념글': { label: '베스트', cls: 'cat--best' },
  '정보': { label: '정보', cls: 'cat--info' },
  '질문': { label: 'Q&A',  cls: 'cat--qa'   },
  '잡담': { label: '잡담', cls: 'cat--chat'  },
};

/**
 * @param {object} post
 * @param {number}  post.id
 * @param {number}  post.displayNum  - 게시글 번호 (1-based descending)
 * @param {string}  post.category
 * @param {string}  post.title
 * @param {string}  post.nickname
 * @param {number}  post.userId
 * @param {boolean} post.isVerifiedNickname
 * @param {string}  post.profileImageUrl
 * @param {string}  post.ipPrefix
 * @param {number}  post.likes
 * @param {number}  post.comments
 * @param {number}  post.views
 * @param {string}  post.createdAt    - ISO timestamp
 * @param {boolean} post.isHot        - true if likes ≥ HOT_THRESHOLD
 * @param {boolean} post.hasImage     - true if image_url exists
 * @returns {HTMLElement}
 */
export function PostListItem(post) {
  const el = document.createElement('li');
  el.className = 'post-row' + (post.isHot ? ' is-hot' : '');
  el.dataset.id = post.id;

  const cat    = CATEGORY_META[post.category] ?? CATEGORY_META['전체'];
  const date   = formatDate(post.createdAt);
  const views  = fmtNum(post.views);
  const likes  = fmtNum(post.likes);
  const verifiedBadge = post.isVerifiedNickname
    ? '<span class="user-verified-badge" aria-label="본인 닉네임 인증" title="본인 닉네임 인증">✓</span>'
    : '';
  const showProfileAvatar = post.isVerifiedNickname && !!post.profileImageUrl;
  const authorDataAttrs = post.isVerifiedNickname && Number(post.userId) > 0
    ? `data-user-id="${post.userId}"`
    : '';
  const authorBtnClass = post.isVerifiedNickname && Number(post.userId) > 0
    ? 'post-row__author-btn js-open-user-profile'
    : 'post-row__author-btn';

  const numCell = post.isHot
    ? `<span class="post-row__num post-row__num--hot">
         <span class="post-row__hot-badge">HOT</span>
       </span>`
    : `<span class="post-row__num">${post.displayNum}</span>`;

  el.innerHTML = `
    <a class="post-row__link" href="/community/post/${post.id}" aria-label="${escHtml(post.title)}">
      ${numCell}
      <div class="post-row__top">
        <span class="post-row__cat ${cat.cls}">${cat.label}</span>
        ${post.hasImage ? `<span class="post-row__media-icon" aria-label="이미지 포함" title="이미지 포함">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" ry="2"></rect>
            <circle cx="9" cy="10" r="1.5"></circle>
            <path d="M21 15l-4.5-4.5a1 1 0 0 0-1.4 0L8 17"></path>
          </svg>
        </span>` : ''}
        <span class="post-row__title">${escHtml(post.title)}</span>
        ${post.comments > 0 ? `<span class="post-row__cmts" aria-label="댓글 ${post.comments}개">${post.comments}</span>` : ''}
      </div>
      <span class="post-row__author">
        <button class="${authorBtnClass}" type="button" ${authorDataAttrs}>
          ${showProfileAvatar ? `<img class="user-avatar-inline" src="${escHtml(post.profileImageUrl)}" alt="" loading="lazy">` : ''}
          <span class="post-row__author-nick">${escHtml(post.nickname)}${verifiedBadge}</span>
        </button><!-- --><span class="post-author-ip">(${escHtml(post.ipPrefix)})</span>
      </span>
      <span class="post-row__sep">·</span>
      <span class="post-row__date">${date}</span>
      <span class="post-row__views">${views}</span>
      <span class="post-row__likes">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M6 1 7.5 4.5H11L8.2 6.8 9.3 10.5 6 8.3 2.7 10.5 3.8 6.8 1 4.5H4.5Z"/>
        </svg>
        ${likes}
      </span>
    </a>
  `;

  return el;
}

/**
 * SkeletonItem — loading placeholder
 */
export function SkeletonItem() {
  const el = document.createElement('li');
  el.className = 'skel-row';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="skel-top">
      <div class="skel skel-badge"></div>
      <div class="skel skel-title"></div>
    </div>
    <div class="skel-bottom">
      <div class="skel skel-meta"></div>
      <div class="skel skel-meta skel-meta-w"></div>
    </div>
  `;
  return el;
}

/* ── Utilities ───────────────────────────────────────────────────────────── */

function formatDate(iso) {
  const now  = Date.now();
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return '방금';
  if (diff < 3600)  return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const d = new Date(iso);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  // Same year → MM.DD, different year → YY.MM.DD
  return d.getFullYear() === new Date().getFullYear()
    ? `${mm}.${dd}`
    : `${String(yy).slice(2)}.${mm}.${dd}`;
}

function fmtNum(n) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  if (n >= 1000)  return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
