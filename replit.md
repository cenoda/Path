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
P.A.T.H/
  login/            로그인/회원가입 화면
  mainHub/          월드 허브 (아이소메트릭 맵)
  mainPageDev/      공부 타이머 화면
package.json
```

## 주요 기능

- **회원가입/로그인**: 닉네임 + 대학교 + 비밀번호
- **공부 타이머**: 목표 시간 설정 → 카운트다운 → 보상 지급
  - 성공: 골드 + EXP 지급
  - 중단: EXP만 지급, 골드 몰수
  - 탈주(페이지 이탈): 모든 보상 소멸
- **티어 시스템**: BRONZE / SILVER / GOLD / PLATINUM / DIAMOND / CHALLENGER (EXP 기준)
- **월드 허브**: 아이소메트릭 맵에서 다른 유저 영지 탐험 가능
- **랭킹**: 전체 유저 EXP 기준 순위 및 상위 몇% 표시

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | /api/auth/register | 회원가입 |
| POST | /api/auth/login | 로그인 |
| POST | /api/auth/logout | 로그아웃 |
| GET  | /api/auth/me | 현재 유저 정보 |
| POST | /api/study/complete | 공부 완료 및 보상 저장 |
| GET  | /api/study/stats | 내 공부 통계 |
| GET  | /api/ranking | 상위 50명 랭킹 |
| GET  | /api/ranking/me | 내 순위 및 상위 % |

## DB 스키마

- `users`: id, nickname, password_hash, university, gold, exp, tier, created_at
- `study_records`: id, user_id, duration_sec, result, earned_gold, earned_exp, created_at
- `sessions`: express-session 저장소 (connect-pg-simple)

## 페이지 흐름

`/` → 로그인 → `/P.A.T.H/mainHub/` → `[ PATH 진입 ]` → `/P.A.T.H/mainPageDev/`

## 도메인

sdij.cloud (Replit 배포 후 CNAME 설정 예정)

## 사용자 선호 사항

- 한국어 소통
- 코딩 초보자 - 기술적인 설명은 쉽게
- 다크 테마 / 게임 RPG 감성 UI 유지
