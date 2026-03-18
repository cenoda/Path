# P.A.T.H 배포 가이드 (Render + Cloudflare + sdij.cloud)

## 1) 목표 구조
- 웹: `https://sdij.cloud`
- API: `https://api.sdij.cloud`
- DB: 관리형 PostgreSQL (Neon/Render Postgres/Supabase 등)

## 2) Render 백엔드 서비스 생성
- New + Web Service
- Repository 연결: `cenoda/Path`
- Build Command: `npm install`
- Start Command: `npm start`
- Region: 한국 사용자 기준 가장 가까운 리전 선택

## 3) Render 환경변수 설정
아래 값을 Render Environment에 추가하세요.

### 기본 서버 설정
- `NODE_ENV=production`
- `PORT=5000` (Render가 자동 주입하는 경우 생략 가능)
- `DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require`
- `SESSION_SECRET=<랜덤_긴_문자열>`
- `SITE_URL=https://sdij.cloud` (SEO canonical/sitemap 절대 URL 기준)
- `CORS_ORIGIN=https://sdij.cloud,https://www.sdij.cloud`
- `SESSION_SAME_SITE=lax`
- `SESSION_COOKIE_DOMAIN=.sdij.cloud`

세션이 앱/웹 분리 구조에서 크로스 사이트 요청까지 필요하면:
- `SESSION_SAME_SITE=none` + HTTPS 필수

### 구글 로그인 설정 (무료 대안)
**필수 환경변수:**
- `GOOGLE_CLIENT_ID=<google_oauth_client_id>`
- `GOOGLE_CLIENT_SECRET=<google_oauth_client_secret>`
- `GOOGLE_REDIRECT_URI=https://api.sdij.cloud/api/auth/google/callback`

**선택 환경변수:**
- `GOOGLE_AUTH_SUCCESS_REDIRECT=https://sdij.cloud/study-hub/`
- `GOOGLE_AUTH_ERROR_REDIRECT=https://sdij.cloud/login/?error=google_auth`

## 4) Cloudflare DNS 설정
Cloudflare DNS에서:

- `@` (루트) → 웹 호스팅 대상(CNAME flattening 또는 A)
- `www` → `sdij.cloud` CNAME
- `api` → Render 기본 도메인 CNAME (예: `path-api.onrender.com`)

권장:
- Proxy status: ON (주황 구름)
- SSL/TLS: `Full (strict)`

## 5) Cloudflare 캐시/보안 규칙
- Cache Rule: `/api/*` 경로 캐시 비활성
- WAF 활성화
- Rate Limit 권장 경로:
  - `POST /api/auth/register` (5분에 5회)
  - `POST /api/auth/login` (5분에 10회)
  - `GET /api/auth/password-recovery/options` (5분에 30회)

## 6) 프론트엔드 API 주소 변경
현재 프론트에서 상대경로(`/api/...`)를 사용 중입니다.

- 웹이 `sdij.cloud`에서 같은 도메인 오리진으로 제공되면 그대로 사용 가능
- 웹과 API 오리진이 분리되면 프론트에 API Base URL 설정을 추가하세요
  - 예: `https://api.sdij.cloud`

## 7) 배포 후 점검 체크리스트
### 기본 점검
- [ ] `https://api.sdij.cloud/api/health` 응답 확인
- [ ] 회원가입/로그인 시 쿠키 저장 확인
- [ ] `Set-Cookie`에 `Secure`, `Domain=.sdij.cloud`, `SameSite` 값 확인
- [ ] `/api/*` 응답 헤더에서 캐시 비활성 확인

### 검색 노출(SEO) 점검
- [ ] `https://api.sdij.cloud/robots.txt` 응답 확인
- [ ] `https://api.sdij.cloud/sitemap.xml` 응답 확인
- [ ] `sitemap.xml`에 `/community/` 와 `/community/post/:id` URL 포함 확인
- [ ] 샘플 게시글 URL(`https://api.sdij.cloud/community/post/<id>`)의 `title/meta canonical/JSON-LD` 확인
- [ ] Google Search Console에 `https://sdij.cloud` 속성 등록 후 sitemap 제출
- [ ] Naver Search Advisor에 사이트 등록 후 sitemap 제출

### 인증/복구 점검
- [ ] Google OAuth 로그인 성공/실패 리다이렉트 확인
- [ ] Apple OAuth 로그인 성공/실패 리다이렉트 확인
- [ ] `/api/auth/password-recovery/options` 응답 확인

## 8) 앱 전환(다음 단계)
- API는 그대로 재사용
- 모바일은 React Native(Expo) 권장
- 앱 클라이언트 인증은 장기적으로 JWT 전환 권장

## 9) main 푸시 자동 배포(앱 자동 반영)
저장소에 `main` 브랜치 push 시 실행되는 워크플로가 있습니다.

- 파일: `.github/workflows/main-auto-update.yml`
- Render: `RENDER_DEPLOY_HOOK_URL` 시크릿이 설정되어 있으면 자동 재배포
- Cloudflare: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` 시크릿이 설정되어 있으면 캐시 자동 비우기

핵심 포인트:
- Capacitor 앱은 원격 URL을 로드하므로, 서버 배포만 완료되면 앱도 최신 상태를 즉시 반영합니다.
- 네이티브 코드 변경이 없는 웹/서버 수정은 앱 스토어 재심사 없이 반영 가능합니다.
