# 휴대폰 인증 구현 문서 (폐기)

이 문서는 과거 구현 기록입니다.

현재 상태:
- 휴대폰 인증 기능 종료
- 휴대폰 인증 기반 비밀번호 재설정 종료
- 소셜 로그인(Google/Apple) 중심 가입/복구로 전환

현재 API 상태:
- `POST /api/auth/send-verification` -> `410 Gone`
- `POST /api/auth/verify-phone` -> `410 Gone`
- `POST /api/auth/password-recovery/send-code` -> `410 Gone`
- `POST /api/auth/password-recovery/reset` -> `410 Gone`
- `GET /api/auth/password-recovery/options` -> 사용 가능

현재 권장 흐름:
1. 신규 가입: Google/Apple 로그인 후 최소 정보 입력(닉네임 중심)
2. 계정 복구: 닉네임 기반으로 소셜 연동 옵션 확인 후 해당 소셜 로그인

참고:
- 휴대폰 인증 관련 예제는 더 이상 사용하지 않습니다.
- 과거 구현 이력 보존 목적의 문서입니다.
