# 휴대폰 인증 가이드 (폐기)

이 문서는 과거 휴대폰 인증(알리고 SMS/알림톡) 운영 기록입니다.

현재 정책:
- 휴대폰 인증 기능 종료
- `POST /api/auth/send-verification` -> `410 Gone`
- `POST /api/auth/verify-phone` -> `410 Gone`
- `POST /api/auth/password-recovery/send-code` -> `410 Gone`
- `POST /api/auth/password-recovery/reset` -> `410 Gone`

현재 권장 인증/복구 방식:
- Google OAuth 로그인
- Apple OAuth 로그인
- `GET /api/auth/password-recovery/options?nickname=<닉네임>` 으로 소셜 연동 여부 확인

운영 참고:
- 알리고 관련 환경변수(`ALIGO_*`)는 현재 필수 아님
- 과거 설정 내용은 히스토리 보존 목적이며 신규 설정 기준으로 사용하지 않음
