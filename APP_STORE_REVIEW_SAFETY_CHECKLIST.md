# App Store Review Safety Checklist (P.A.T.H)

## 1) User Safety Core
- [x] User block feature implemented (hide blocked user's posts/comments).
- [x] Post reporting feature implemented with categorized reasons.
- [x] Report abuse protection implemented (rate limit + one report per post/user).
- [x] EULA agreement is mandatory for community interactions.

## 2) Content Moderation Workflow
- [x] Admin can list reports: `GET /api/admin/community-reports`
- [x] Admin can review/dismiss report: `POST /api/admin/community-reports/:id/review`
- [ ] Admin panel UI should expose report queue clearly (if not yet built).
- [ ] Document moderation SLA internally (example: within 24-72h).

## 3) Legal / Policy Surfaces
- [x] EULA versioned fields stored per user (`eula_version`, `eula_agreed_at`).
- [x] Register flow includes explicit EULA consent.
- [x] Main app shows mandatory EULA modal for users without latest consent.
- [ ] Publish full legal text URL (Privacy Policy + Terms) in app and store listing.
- [ ] Add in-app contact channel for abuse/legal requests.

## 4) Recommended Store Submission Notes
- App includes user-generated content controls:
  - report abusive content
  - block other users
  - moderation review pipeline
- App enforces acceptance of latest Terms before content interaction.
- Harmful content categories are explicitly blocked by policy and moderation process.

## 5) API Summary (Implemented)
- Community block APIs:
  - `GET /api/community/blocks`
  - `POST /api/community/blocks/:userId`
  - `DELETE /api/community/blocks/:userId`
- Community report API:
  - `POST /api/community/posts/:id/report`
- EULA APIs:
  - `GET /api/auth/eula`
  - `POST /api/auth/eula/agree`
- Admin moderation APIs:
  - `GET /api/admin/community-reports`
  - `POST /api/admin/community-reports/:id/review`

## 6) Final Pre-Submission Test Cases
- [ ] New user cannot complete registration without privacy + EULA consent.
- [ ] Existing user without latest EULA is blocked by mandatory agreement modal.
- [ ] Blocked author content is hidden from list, detail, and comment views.
- [ ] Report submission works and appears in admin queue.
- [ ] Admin review status changes are persisted and visible.
- [ ] All failed API cases show user-safe messages (401/403/429/500).
