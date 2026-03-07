# P.A.T.H - Copilot Instructions

## Project Overview

P.A.T.H is a multi-user web app that turns studying into an RPG game (Korean: 공부 타이머 게임). Users study in timed sessions to earn gold, build up their university estate, and compete against others through invasions. It is a competitor to the Korean study-timer app "열품타".

## Tech Stack

- **Backend**: Node.js + Express (`server/`)
- **Database**: PostgreSQL (via `pg` connection pool in `server/db.js`)
- **Auth**: Session-based authentication using `express-session` + `connect-pg-simple` + `bcryptjs`
- **Frontend**: Vanilla JavaScript + HTML/CSS (no framework)
- **File Uploads**: `multer` (score/GPA images)

## Project Structure

```
server/
  index.js          Main Express server (port 5000)
  db.js             PostgreSQL connection pool
  data/
    universities.js University percentile data + gold formula + score conversion formulas
  routes/
    auth.js         Auth + score image upload (/api/auth/*)
    study.js        Study records/rewards (/api/study/*)
    ranking.js      Rankings (/api/ranking/*)
    estate.js       Tax collection + ticket purchase (/api/estate/*)
    invasion.js     Invasion system (/api/invasion/*)
    notifications.js Notifications (/api/notifications/*)
    admin.js        Admin (score approval/rejection) (/api/admin/*)
    university.js   University/department info (/api/university/*)
P.A.T.H/
  login/            Login/register (real name, privacy consent, repeat-year student)
  mainHub/          World hub (map, castle interior, ranking/notification panel)
  mainPageDev/      Study timer screen
  admin/            Admin page (score review)
  assets/           Images (castle_main.png, hut.png)
uploads/
  scores/           Score verification images
  gpa/              GPA verification images
```

## How to Run

```bash
npm start   # starts node server/index.js on port 5000
```

There are no automated tests. Manual testing is done against the running server.

## Code Conventions

- **Language**: All user-facing strings, comments, and variable names related to domain concepts are in Korean. Code structure (variable names, function names) is in English.
- **Communication**: Respond in Korean when the user writes in Korean.
- **Style**: Dark theme / study-app aesthetic — restrained and minimal.
- **Images**: Building/castle images are hand-drawn by the developer. Do NOT replace them with AI-generated images.
- **No test framework**: There is no existing test infrastructure. Do not add tests unless explicitly requested.
- **No TypeScript**: The project uses plain JavaScript (CommonJS on the backend, vanilla JS on the frontend).

## Core Economy System

- **Study gold**: All users earn **10G/hr** on successful study session completion.
- **Tax (passive)**: `-log₁₀((100 - admissionPercentile) / 100)` G/hr, accumulates up to 24 hrs. Collected via `/api/estate/collect-tax`.
- **Repeat-year student (N수생) bonus**: +15% of the previous university's tax rate.
- **GPA bonus**: `(5 - grade) × 0.12 G/hr` (max 0.5G/hr, grade 1 = +0.48G/hr).
- **Tournament ticket**: Costs **140G**, consumed on each invasion attempt.
- **Invasion**: Compares CSAT (수능) standard scores (0–600). Winner takes over the loser's university estate.

## Database Schema (key tables)

- `users`: id, nickname, password_hash, university, gold, exp, tier, tickets, is_studying, study_started_at, last_tax_collected_at, tax_accumulated, mock_exam_score, real_name, privacy_agreed, is_n_su, prev_university, score_image_url, score_status, gpa_score, gpa_image_url, gpa_status, gpa_public, is_admin, created_at
- `study_records`: id, user_id, duration_sec, result, earned_gold, earned_exp, created_at
- `invasions`: id, attacker_id, defender_id, attacker_study_sec, defender_study_sec, result, loot_gold, created_at
- `notifications`: id, user_id, type, message, is_read, ref_id, created_at
- `sessions`: express-session store (managed by connect-pg-simple)

## Score Verification Flow

1. User uploads score image → `score_status` set to `pending`.
2. Admin reviews at `/P.A.T.H/admin/` and approves (enters actual scores) or rejects.
3. On approval, `mock_exam_score` is updated and `score_status` → `approved`.

## University Data (`server/data/universities.js`)

- `University` and `Department` classes define 52 universities with department-level admission data.
- Admission types: 학생부교과 (GPA-based), 학생부종합 (holistic), 논술 (essay), 정시 (CSAT: percentile, standard score total, converted cut score).
- `University.calcConvertedScore(scores, track)` converts raw scores to a university-specific weighted score.
- 의치한약수 (medicine/dentistry/pharmacy/nursing/veterinary) keywords → default 99.5% percentile.
- Unregistered university default: 50% percentile.

## Admin Access (for testing)

To test admin features, use an account with `is_admin = true` in the database. Set up a test admin account by directly updating the `users` table, or by seeding the database with a known test user.
