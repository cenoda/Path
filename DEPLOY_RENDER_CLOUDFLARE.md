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
- `CORS_ORIGIN=https://sdij.cloud,https://www.sdij.cloud`
- `SESSION_SAME_SITE=lax`
- `SESSION_COOKIE_DOMAIN=.sdij.cloud`

세션이 앱/웹 분리 구조에서 크로스 사이트 요청까지 필요하면:
- `SESSION_SAME_SITE=none` + HTTPS 필수

### 휴대폰 인증 설정 (알리고 카카오톡 알림톡)
**필수 환경변수:**
- `ALIGO_API_KEY=<알리고_API_키>`
- `ALIGO_USER_ID=<알리고_사용자ID>`
- `ALIGO_SENDER=<발신번호>` (예: `01012345678`, 하이픈 제거)
- `ALIGO_TEMPLATE_CODE=<승인받은_템플릿_코드>` (예: `TM_0001`)
- `ALIGO_PLUSFRIEND_ID=<카카오톡_채널ID>` (예: `@your_channel`, @ 포함)

**선택 환경변수:**
- `ALIGO_TEST_MODE=false` (true 설정 시 실제 발송 없음, 과금 없음)
- `ALIGO_SMS_FALLBACK=true` (알림톡 실패 시 SMS 자동 발송)
- `PHONE_ACCOUNT_LIMIT=2` (1 전화번호당 최대 계정 수, 기본값 2)

### 구글 로그인 설정 (무료 대안)
**필수 환경변수:**
- `GOOGLE_CLIENT_ID=<google_oauth_client_id>`
- `GOOGLE_CLIENT_SECRET=<google_oauth_client_secret>`
- `GOOGLE_REDIRECT_URI=https://api.sdij.cloud/api/auth/google/callback`

**선택 환경변수:**
- `GOOGLE_AUTH_SUCCESS_REDIRECT=https://sdij.cloud/mainHub/`
- `GOOGLE_AUTH_ERROR_REDIRECT=https://sdij.cloud/login/?error=google_auth`

> 💡 **중요**: 알리고 설정이 없으면 회원가입이 불가능합니다. 
> 테스트 시에는 `ALIGO_TEST_MODE=true` 또는 `NODE_ENV=development` 설정

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
  - `POST /api/auth/send-verification` (5분에 3회) ⚠️ **중요: 휴대폰 인증 남용 방지**
  - `POST /api/auth/verify-phone` (5분에 10회)

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

### 휴대폰 인증 점검
- [ ] 알리고 잔액 확인 (최소 5만원 권장)
- [ ] 카카오톡 알림톡 템플릿 승인 상태 확인
- [ ] 테스트 번호로 인증번호 발송 테스트
  ```bash
  curl -X POST https://api.sdij.cloud/api/auth/send-verification \
    -H "Content-Type: application/json" \
    -d '{"phone": "01012345678"}'
  ```
- [ ] 카카오톡/SMS 수신 확인 (5분 내 도착)
- [ ] 인증번호 검증 테스트
- [ ] 회원가입 전체 플로우 테스트
- [ ] Cloudflare Rate Limit 작동 확인

## 8) 앱 전환(다음 단계)
- API는 그대로 재사용
- 모바일은 React Native(Expo) 권장
- 앱 클라이언트 인증은 장기적으로 JWT 전환 권장
