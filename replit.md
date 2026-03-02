# P.A.T.H - 공부 타이머 게임

공부를 RPG 게임처럼 만든 멀티유저 웹앱. 열품타의 경쟁 앱.

## 기술 스택

- **백엔드**: Node.js + Express (server/)
- **데이터베이스**: Replit PostgreSQL
- **인증**: express-session + bcryptjs (세션 기반)
- **프론트엔드**: 바닐라 JavaScript + HTML/CSS
- **파일 업로드**: multer (성적 이미지)

## 프로젝트 구조

```
server/
  index.js          메인 Express 서버 (포트 5000)
  db.js             PostgreSQL 연결 풀
  data/
    universities.js 대학별 백분위 데이터 + 골드 공식
  routes/
    auth.js         인증 + 점수 이미지 업로드 (/api/auth/*)
    study.js        공부 기록/보상 (/api/study/*)
    ranking.js      랭킹 (/api/ranking/*)
    estate.js       세금 수령 + 티켓 구매 (/api/estate/*)
    invasion.js     침략 시스템 (/api/invasion/*)
    notifications.js 알림 (/api/notifications/*)
    admin.js        관리자 (성적 승인/반려) (/api/admin/*)
    university.js   대학/학과 정보 조회 (/api/university/*)
P.A.T.H/
  login/            로그인/회원가입 (실명, 개인정보동의, N수생)
  mainHub/          월드 허브 (맵, 성 내부, 랭킹/알림 패널)
  mainPageDev/      공부 타이머 화면
  admin/            관리자 페이지 (성적 심사)
  assets/           이미지 (castle_main.png, hut.png)
uploads/
  scores/           성적 인증 이미지 저장소
package.json
```

## 핵심 경제 시스템

### 골드 획득
- **공부 골드**: 모든 유저 동일 **10G/hr** (성공 시)
- **세금(패시브)**: `-log₁₀((100 - 합격백분위) / 100)` G/hr (최대 24hr 축적)
  - 50% 백분위 → 0.3G/hr
  - 90% → 1.0G/hr
  - 99% → 2.0G/hr
  - 99.9% (의대급) → 3.0G/hr
- **N수생 전적대 보너스**: 전적 대학 세금률의 +15% 추가

### 토너먼트권
- 가격: **140G** (공부 10G/hr × 14시간)
- 침략 시 1장 소모

### 침략
- **평가원 모의고사 점수** 비교 (0~600 표준점수 합산)
- 승리 시 상대방 대학(영지)으로 이전
- 침략 알림 없음

### 대학별 영지
- University/Department 클래스 기반 (server/data/universities.js)
- 52개 대학, 학과별 입결/전형 데이터 포함
- 전형: 학생부교과(내신), 학생부종합(내신참고), 논술(경쟁률), 정시(백분위, 표준점수합)
- 의치한약수 키워드 포함 시 99.5%
- 미등록 대학 기본값 50%
- 백분위에 따라 건물 크기/밝기 자동 결정
- API: /api/university/list, /api/university/info?name=, /api/university/search?q=&region=&category=

## 회원가입 / 인증

- **회원가입 필드**: 실명, 닉네임, 목표 대학교, 비밀번호, N수생 여부(+전적대), 개인정보동의
- **성적 인증**: 평가원 점수는 직접 입력 불가 → 성적 사진 업로드 → 관리자 수동 승인
  - 상태: none → pending → approved/rejected
- **관리자 페이지**: /P.A.T.H/admin/index.html (is_admin=true 유저만 접근)

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/auth/register | 회원가입 (실명, 개인정보동의 필수) |
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET  | /api/auth/me | 현재 유저 정보 (score_status 포함) |
| POST | /api/auth/upload-score | 성적 이미지 업로드 (multipart) |
| POST | /api/auth/update-score | 점수 직접 등록 (관리자용 레거시) |
| POST | /api/study/start | 공부 시작 (is_studying=true) |
| POST | /api/study/complete | 공부 완료 및 보상 저장 |
| GET  | /api/study/stats | 내 공부 통계 |
| GET  | /api/ranking | 누적 공부 시간 기준 Top 50 |
| GET  | /api/ranking/today | 오늘 공부 시간 기준 |
| GET  | /api/ranking/me | 내 순위 및 상위 % |
| GET  | /api/estate/tax | 세금 현황 (N수 보너스 포함) |
| POST | /api/estate/collect-tax | 세금 수령 |
| POST | /api/estate/buy-ticket | 토너먼트권 구매 (140G) |
| POST | /api/invasion/attack | 침략 (점수 비교, 승리 시 대학 이전) |
| GET  | /api/invasion/logs | 침략 기록 |
| GET  | /api/notifications | 알림 목록 |
| POST | /api/notifications/read-all | 전체 읽음 처리 |
| GET  | /api/admin/pending | 성적 심사 대기 목록 |
| GET  | /api/admin/all-users | 전체 유저 목록 |
| POST | /api/admin/approve-score | 성적 승인 (점수 입력) |
| POST | /api/admin/reject-score | 성적 반려 |

## DB 스키마

- `users`: id, nickname, password_hash, university, gold, exp, tier, tickets, is_studying, study_started_at, last_tax_collected_at, tax_accumulated, mock_exam_score, real_name, privacy_agreed, is_n_su, prev_university, score_image_url, score_status, is_admin, created_at
- `study_records`: id, user_id, duration_sec, result, earned_gold, earned_exp, created_at
- `invasions`: id, attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold, created_at
- `notifications`: id, user_id, type, message, is_read, ref_id, created_at
- `sessions`: express-session 저장소

## 페이지 흐름

`/` → 로그인 → `/P.A.T.H/mainHub/` → 내 성채 클릭 → 성 내부 (풀스크린)
                                    → `[ PATH 진입 ]` → `/P.A.T.H/mainPageDev/`
                                    → 관리자: `/P.A.T.H/admin/`

## 테스트 계정

- nickname: `admin`, password: `admin1234` (is_admin=true)

## 사용자 선호

- 한국어 소통, 코딩 초보자
- 다크 테마 / Study-app 감성 (절제된 미니멀)
- 건물 이미지는 직접 그려서 제공 (AI 생성 이미지로 대체 금지)
