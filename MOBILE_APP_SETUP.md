# P.A.T.H 모바일 앱 전환 가이드 (Capacitor)

이 저장소는 Capacitor 설정이 포함되어 있으며, 웹 서비스(`https://path.sdij.cloud/login/`)를 네이티브 앱 WebView로 래핑합니다.

## 1) 현재 적용된 내용
- `capacitor.config.json` 추가
- 앱 식별자: `cloud.sdij.path`
- 앱 이름: `P.A.T.H`
- 앱 시작 URL: `https://path.sdij.cloud/login/`
- npm 스크립트 추가:
  - `npm run cap:doctor`
  - `npm run cap:add:android`
  - `npm run cap:add:ios`
  - `npm run cap:sync`
  - `npm run cap:android`
  - `npm run cap:ios`
  - `npm run apk:debug`
  - `npm run apk:release`
  - `npm run aab:release`

## 2) Android 앱 만들기
1. 의존성 설치
```bash
npm install
```

2. Capacitor 설정 점검
```bash
npm run cap:doctor
```

3. Android 프로젝트 생성 (최초 1회)
```bash
npm run cap:add:android
```

4. 네이티브 프로젝트 동기화
```bash
npm run cap:sync
```

5. Android Studio 열기
```bash
npm run cap:android
```

6. Android Studio에서 실행/서명
- 디버그: Run 버튼으로 에뮬레이터/실기기 실행
- 릴리스: Build > Generate Signed Bundle / APK

## 2-1) CLI로 APK 직접 빌드
Android Studio 대신 CLI로도 APK를 만들 수 있습니다.

1. 원클릭 디버그 APK 빌드 (android 없으면 자동 생성)
```bash
npm run apk:debug
```

2. 원클릭 릴리스 APK 빌드
```bash
export ANDROID_KEYSTORE_PATH=/abs/path/to/upload-keystore.jks
export ANDROID_KEYSTORE_PASSWORD=your_keystore_password
export ANDROID_KEY_ALIAS=upload
export ANDROID_KEY_PASSWORD=your_key_password
npm run apk:release
```

3. 원클릭 릴리스 AAB 빌드 (Play Store 업로드용)
```bash
export ANDROID_KEYSTORE_PATH=/abs/path/to/upload-keystore.jks
export ANDROID_KEYSTORE_PASSWORD=your_keystore_password
export ANDROID_KEY_ALIAS=upload
export ANDROID_KEY_PASSWORD=your_key_password
npm run aab:release
```

4. 수동 절차가 필요하면 아래 순서 사용

5. Android 프로젝트가 없다면 먼저 생성
```bash
npm run cap:add:android
```

6. 최신 웹/설정 반영
```bash
npm run cap:sync
```

7. 디버그 APK 빌드
```bash
cd android
./gradlew assembleDebug
```

8. 생성 파일 경로
```bash
android/app/build/outputs/apk/debug/app-debug.apk
```

9. 릴리스 APK 빌드(서명 필수)
```bash
cd android
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file=/abs/path/to/upload-keystore.jks \
  -Pandroid.injected.signing.store.password=your_keystore_password \
  -Pandroid.injected.signing.key.alias=upload \
  -Pandroid.injected.signing.key.password=your_key_password
```

10. 생성 파일 경로
```bash
android/app/build/outputs/apk/release/app-release.apk
```

업로드되는 릴리스 번들(APK/AAB)은 반드시 서명된 산출물만 사용하세요.

## 3) iOS 앱 만들기 (macOS 필요)
1. iOS 프로젝트 생성 (최초 1회)
```bash
npm run cap:add:ios
```

2. 동기화
```bash
npm run cap:sync
```

3. Xcode 열기
```bash
npm run cap:ios
```

4. Xcode에서 Signing 설정 후 Archive 배포

## 4) 운영 체크 포인트
- 앱은 원격 URL을 로드하므로 서버 장애 시 앱도 영향받습니다.
- 로그인 세션/쿠키 정책은 현재 서버 설정(`SameSite`, `Secure`, 도메인 정책)을 따릅니다.
- 앱 심사 대응을 위해 개인정보처리방침/이용약관 URL을 앱 스토어 정보에 준비하세요.
- 카메라/파일 업로드 등 브라우저 권한 동작은 실제 디바이스에서 반드시 점검하세요.

## 5) 추후 고도화 권장
- 앱 로딩 스크린, 오프라인 안내 페이지 추가
- 푸시 알림 연동(`@capacitor/push-notifications`)
- 앱 딥링크/유니버설 링크 연결
- 버전 강제 업데이트 체크 API 추가

## 5-1) 학습 절전 모드(앱 밝기 최소화) 적용
웹 브라우저에서는 시스템 밝기 제어가 불가하지만, Capacitor 네이티브 앱에서는 플러그인으로 제어할 수 있습니다.

1. 밝기 플러그인 설치 (프로젝트 정책에 맞는 패키지 1개 선택)
```bash
npm i @capawesome-team/capacitor-screen-brightness
```

2. 네이티브 프로젝트 생성/동기화
```bash
npm run cap:add:android
npm run cap:sync
```

3. 앱에서 확인
- 설정 탭의 `학습 시 절전 모드`를 ON
- 공부 시작 시: 화면은 숫자만 보이는 절전 UI + 밝기 최소
- 공부 종료/중단 시: 기존 밝기로 자동 복원

참고:
- 현재 코드(`P.A.T.H/mainPageDev/cam.js`)는 Capacitor 환경에서 `ScreenBrightness` 또는 `Brightness` 플러그인을 자동 탐지해 동작합니다.
- 플러그인이 없으면 UI 절전 모드만 동작하고 하드웨어 밝기 제어는 생략됩니다.

## 6) GitHub Actions로 자동 빌드
로컬 환경이 불안정할 때는 CI로 APK/AAB를 생성할 수 있습니다.

1. GitHub 저장소의 Actions 탭으로 이동
2. `Android Build` 워크플로 실행 (`Run workflow`)
3. 완료 후 Artifacts에서 아래 파일 다운로드
  - `app-debug-apk` -> `app-debug.apk`
  - `app-release-aab` -> `app-release.aab`

워크플로 파일:
- `.github/workflows/android-build.yml`

참고:
- 현재 AAB는 release 빌드 시 서명 정보가 없으면 실패하도록 설정되어 있습니다.
- Play 스토어 정식 배포 전에는 서명/버전코드 정책을 최종 점검하세요.
- APK/AAB 런처 아이콘은 `.github/workflows/android-build.yml`의 `ICON_SOURCE` 파일(현재 `icons/IMG_0219.png`)로 자동 생성됩니다.

## 7) main 커밋마다 앱 자동 업데이트 반영
현재 앱은 `capacitor.config.json`에서 원격 URL(`https://path.sdij.cloud/login/`)을 로드합니다.
즉, 서버가 새 커밋으로 배포되면 앱도 자동으로 최신 화면/기능을 받습니다(앱 재설치 불필요).

이 저장소에는 아래 워크플로가 추가되어 있습니다.
- `.github/workflows/main-auto-update.yml`

동작:
- `main` 브랜치 push 시 실행
- `RENDER_DEPLOY_HOOK_URL` 시크릿이 있으면 Render 재배포 트리거
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` 시크릿이 있으면 Cloudflare 캐시 비우기

GitHub Secrets 설정:
1. 저장소 `Settings` -> `Secrets and variables` -> `Actions`
2. 아래 시크릿 추가
  - `RENDER_DEPLOY_HOOK_URL` (Render 서비스 Deploy Hook URL)
  - `CLOUDFLARE_API_TOKEN` (Zone Cache Purge 권한 포함 토큰)
  - `CLOUDFLARE_ZONE_ID` (sdij.cloud Zone ID)

검증 방법:
1. `main`에 커밋/푸시
2. GitHub `Actions` 탭에서 `Main Auto Update` 성공 확인
3. `https://path.sdij.cloud/login/` 새로고침 시 최신 변경 반영 확인

주의:
- 네이티브 권한/플러그인 변경(예: 카메라 권한, 푸시 SDK 추가)은 앱 재빌드/재배포가 필요합니다.
- 웹 코드/서버 로직 변경은 위 자동화로 즉시 반영됩니다.
