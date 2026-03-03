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

- `NODE_ENV=production`
- `PORT=5000` (Render가 자동 주입하는 경우 생략 가능)
- `DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<db>?sslmode=require`
- `SESSION_SECRET=<랜덤_긴_문자열>`
- `CORS_ORIGIN=https://sdij.cloud,https://www.sdij.cloud`
- `SESSION_SAME_SITE=lax`
- `SESSION_COOKIE_DOMAIN=.sdij.cloud`

세션이 앱/웹 분리 구조에서 크로스 사이트 요청까지 필요하면:
- `SESSION_SAME_SITE=none` + HTTPS 필수

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
  - `POST /api/auth/register`
  - `POST /api/auth/login`

## 6) 프론트엔드 API 주소 변경
현재 프론트에서 상대경로(`/api/...`)를 사용 중입니다.

- 웹이 `sdij.cloud`에서 같은 도메인 오리진으로 제공되면 그대로 사용 가능
- 웹과 API 오리진이 분리되면 프론트에 API Base URL 설정을 추가하세요
  - 예: `https://api.sdij.cloud`

## 7) 배포 후 점검 체크리스트
- `https://api.sdij.cloud/api/health` 응답 확인
- 회원가입/로그인 시 쿠키 저장 확인
- `Set-Cookie`에 `Secure`, `Domain=.sdij.cloud`, `SameSite` 값 확인
- `/api/*` 응답 헤더에서 캐시 비활성 확인

## 8) 앱 전환(다음 단계)
- API는 그대로 재사용
- 모바일은 React Native(Expo) 권장
- 앱 클라이언트 인증은 장기적으로 JWT 전환 권장
