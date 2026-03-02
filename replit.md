# P.A.T.H - 공부 타이머 게임

공부를 RPG 게임처럼 만든 멀티유저 웹앱. 열품타의 경쟁 앱.

## 기술 스택

- **백엔드**: Node.js + Express (server/)
- **데이터베이스**: Replit PostgreSQL
- **인증**: express-session + bcryptjs (세션 기반)
- **프론트엔드**: 바닐라 JavaScript + HTML/CSS

## 프로젝트 구조

```
server/
  index.js          메인 Express 서버 (포트 5000)
  db.js             PostgreSQL 연결 풀
  routes/
    auth.js         인증 API (/api/auth/*)
    study.js        공부 기록/보상 API (/api/study/*)
    ranking.js      랭킹 API (/api/ranking/*)
    estate.js       세금 수령 API (/api/estate/*)
    invasion.js     침략 시스템 API (/api/invasion/*)
    notifications.js 알림 API (/api/notifications/*)
P.A.T.H/
  login/            로그인/회원가입 화면
  mainHub/          월드 허브 (hex 격자 맵, 랭킹/알림 패널)
  mainPageDev/      공부 타이머 화면
  assets/           이미지 (castle_main.png, hut.png)
package.json
```

## 주요 기능

### 핵심
- **회원가입/로그인**: 닉네임 + 대학교 + 비밀번호
- **공부 타이머**: 목표 시간 설정 → 카운트다운 → 보상 지급 (1/100초 정밀도, Wake Lock)
  - 성공: 골드 + EXP 지급, 티켓 30% 확률 (1시간 이상 성공 시)
  - 중단: EXP만 지급, 골드 몰수
  - 탈주(페이지 이탈): 모든 보상 소멸, FAILED 기록

### RPG 시스템
- **티어 시스템**: BRONZE(0) / SILVER(300) / GOLD(1000) / PLATINUM(2000) / DIAMOND(5000) / CHALLENGER(10000) EXP
- **영지 시각화**: 티어별 다른 건물 표시 (BRONZE/SILVER/GOLD/PLATINUM=오두막, DIAMOND/CHALLENGER=성채)
- **세금 징수**: 티어별 시간당 골드 축적 (BRONZE=0, SILVER=2, GOLD=5, PLATINUM=10, DIAMOND=20, CHALLENGER=50 G/hr, 최대 24h 캡)
- **토너먼트권(🎟️)**: 1시간 이상 공부 성공 시 30% 확률로 획득
- **침략 시스템**: 토너먼트권 1장 소모 → 최근 7일 공부량 비교 → 승리 시 상대 미수령 세금 50% 약탈

### 허브
- **월드 맵**: hex 격자 배경, 드래그/줌, 상위 10명 건물 배치
- **실시간 공부 중 표시**: 공부 시작 시 is_studying=true → 맵에서 📖 아이콘 표시
- **랭킹 패널**: 우측 슬라이드, 누적(EXP)/오늘(공부시간) 탭, 내 순위 하이라이트
- **알림 패널**: 침략 알림, 읽음 처리, 뱃지
- **유저 영지 클릭**: 유저 정보 + 침략 버튼 모달
- **내 성채 클릭**: 세금 현황 + 수령 버튼 모달
- **유저 검색**: 닉네임/대학 필터링

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/auth/register | 회원가입 |
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET  | /api/auth/me | 현재 유저 정보 (tickets, is_studying 포함) |
| POST | /api/study/start | 공부 시작 (is_studying=true) |
| POST | /api/study/complete | 공부 완료 및 보상 저장 |
| GET  | /api/study/stats | 내 공부 통계 |
| GET  | /api/ranking | 상위 50명 랭킹 (is_studying 포함) |
| GET  | /api/ranking/today | 오늘 공부 시간 기준 랭킹 |
| GET  | /api/ranking/me | 내 순위 및 상위 % |
| GET  | /api/estate/tax | 세금 현황 조회 |
| POST | /api/estate/collect-tax | 세금 수령 |
| POST | /api/invasion/attack | 침략 시도 (티켓 1장 소모) |
| GET  | /api/invasion/logs | 침략 기록 |
| GET  | /api/notifications | 알림 목록 |
| POST | /api/notifications/read-all | 전체 읽음 처리 |

## DB 스키마

- `users`: id, nickname, password_hash, university, gold, exp, tier, tickets, is_studying, study_started_at, last_tax_collected_at, tax_accumulated, created_at
- `study_records`: id, user_id, duration_sec, result, earned_gold, earned_exp, created_at
- `invasions`: id, attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold, created_at
- `notifications`: id, user_id, type, message, is_read, ref_id, created_at
- `sessions`: express-session 저장소 (connect-pg-simple)

## 세금 요율

| 티어 | G/hr |
|------|------|
| BRONZE | 0 |
| SILVER | 2 |
| GOLD | 5 |
| PLATINUM | 10 |
| DIAMOND | 20 |
| CHALLENGER | 50 |

## 페이지 흐름

`/` → 로그인 → `/P.A.T.H/mainHub/` → `[ PATH 진입 ]` → `/P.A.T.H/mainPageDev/`

## 테스트 계정

- nickname: `admin`, password: `admin1234`
- CHALLENGER 티어, 999,999G 보유

## 도메인

sdij.cloud (Replit 배포 후 CNAME 설정 예정)

## 사용자 선호 사항

- 한국어 소통
- 코딩 초보자 - 기술적인 설명은 쉽게
- 다크 테마 / Study-app 감성 (게임보다는 절제된 미니멀)
- 건물 이미지는 직접 그려서 제공 (AI 생성 이미지로 대체 금지)
  - castle_main.png: 유저 직접 그린 성채
  - hut.png: 임시 AI 생성, 유저가 추후 교체 예정
