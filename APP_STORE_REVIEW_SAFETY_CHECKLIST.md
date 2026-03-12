# App Store Review Safety Checklist (P.A.T.H)

## 1) User Safety Core
- [x] User block feature implemented (hide blocked user's posts/comments).
- [x] Post reporting feature implemented with categorized reasons.
- [x] Report abuse protection implemented (rate limit + one report per post/user).
- [x] EULA agreement is mandatory for community interactions.

## 2) Content Moderation Workflow
- [x] Admin can list reports: `GET /api/admin/community-reports`
- [x] Admin can review/dismiss report: `POST /api/admin/community-reports/:id/review`
- [x] Admin panel UI exposes report queue with review/dismiss actions.
- [ ] Document moderation SLA internally (example: within 24-72h).

## 3) Legal / Policy Surfaces
- [x] EULA versioned fields stored per user (`eula_version`, `eula_agreed_at`).
- [x] Register flow includes explicit EULA consent.
- [x] Main app shows mandatory EULA modal for users without latest consent.
- [x] Publish full legal text URL (Privacy Policy + Terms) in app and store listing.
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

## 7) Advertising Implementation (Apple Policy Compliant)
- [x] **Ad Disclosure**: Clear "광고" (Advertisement) label displayed above all ads
- [x] **Content Separation**: Ads are visually distinct with borders and background colors
- [x] **User Experience**: Ads placed in non-intrusive locations (between content sections)
- [x] **Accidental Click Prevention**: Adequate spacing and clear visual separation from interactive elements
- [x] **Responsive Design**: Ads scale appropriately on different screen sizes
- [x] **Safe Area**: Ads are contained within clearly defined containers

## 8) Google Play App Access (Restricted Access Compliance)
- [ ] Prepare and maintain reviewer test credentials (ID/PW) for full app access.
- [ ] If 2FA is enabled, provide bypass steps or fixed test code for review.
- [ ] If geo-restrictions exist, whitelist reviewer flow or provide unrestricted test account.
- [ ] If membership/subscription is required, pre-activate entitlement on review account.
- [ ] If another device is required, provide reproducible alternative path in-app.
- [ ] Add fallback account credentials in case primary test account fails.
- [ ] Ensure reviewer can access all major surfaces without signup/free-trial/developer contact.
- [ ] Keep all provided review access information valid until review completion.
- [ ] Submission reference doc: `GOOGLE_PLAY_REVIEW_ACCESS_GUIDE.md`

### Apple App Store Advertising Guidelines Compliance:
1. **Guideline 3.1.1 - Advertising**: Ads are clearly distinguished from app content
2. **Guideline 5.1.1 - Data Collection**: Uses Google AdSense with user consent
3. **Guideline 5.1.2 - Data Use**: Ads do not target minors inappropriately
4. **User Control**: Users can block content but ads remain visible (standard monetization)

### Implementation Details:
- **Location**: Community tab, between Best section and post list
- **Ad Network**: Google AdSense (requires client ID configuration)
- **Format**: Responsive display ads (auto-sized)
- **Label**: "광고" text in uppercase, small font, above ad container
- **Styling**: Clearly bordered container with distinct background color

### Configuration Required:
Replace the following placeholders in `/P.A.T.H/community/index.html`:
- `ca-pub-XXXXXXXXXX` → Your Google AdSense Publisher ID
- `YYYYYYYYYY` → Your Ad Unit Slot ID

### Testing:
- [ ] Verify ad label is visible on all screen sizes
- [ ] Confirm adequate spacing prevents accidental clicks
- [ ] Test ad loading in production environment
- [ ] Verify GDPR/CCPA compliance through AdSense settings
