# 학교 이메일 도메인 인증 시스템 설정 가이드

## 개요
기존의 전화번호 인증을 완전히 제거하고, 학교 이메일 도메인 기반 인증 시스템을 도입했습니다. 이를 통해 학생을 학교 이메일 도메인으로 검증합니다.

## ✅ 완료된 작업

### 1. 데이터베이스 스키마 (server/schema.js)
두 개의 새 테이블이 생성됩니다:

```sql
-- 정규화된 도메인 저장
CREATE TABLE school_email_domains (
  domain VARCHAR(255) PRIMARY KEY,
  is_active BOOLEAN DEFAULT TRUE,
  source VARCHAR(40),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 도메인과 대학명의 매핑 (하나의 도메인 = 여러 대학명 가능)
CREATE TABLE school_email_domain_universities (
  id SERIAL PRIMARY KEY,
  domain VARCHAR(255) REFERENCES school_email_domains(domain),
  university_name VARCHAR(255),
  UNIQUE(domain, university_name)
);
```

### 2. 유틸리티 함수 (server/utils/schoolEmailDomain.js)

#### `normalizeDomain(raw: string): string`
- 입력: `"  @www.example.ac.kr  "`
- 출력: `"example.ac.kr"`
- 정규화: 소문자, @/www 제거, 공백 정리

#### `isValidDomain(domain: string): boolean`
- RFC 규격에 맞는 도메인인지 검증

#### `parseUniversityDomainText(rawText: string): object`
- 형식: `"학교명 도메인"` (각 줄)
- 반환:
  ```javascript
  {
    entries: [
      { universityName: "가천대학교", domain: "gachon.ac.kr" },
      ...
    ],
    invalidLines: ["잘못된 줄 1", ...],
    stats: {
      totalLines: 46,
      validEntries: 40,
      uniqueDomains: 40,
      invalidCount: 0
    }
  }
  ```

### 3. 인증 엔드포인트 (server/routes/auth.js)

#### GET `/api/auth/school-email-domain/check?email=student@school.ac.kr`
학교 이메일의 도메인이 등록된 도메인인지 확인합니다.

**응답:**
```json
{
  "ok": true,
  "domain": "school.ac.kr",
  "allowed": true,
  "universities": ["학교 이름 1", "학교 이름 2"]
}
```

#### POST `/api/auth/school-email-domain/import` (관리자 전용)
대량의 도메인 데이터를 가져옵니다. 요청 본문:

```json
{
  "rawText": "가천대학교 gachon.ac.kr\n경복대학교 kbu.ac.kr\n..."
}
```

**응답:**
```json
{
  "success": true,
  "stats": {
    "inputPath": "...",
    "parsed": {
      "totalLines": 500,
      "validEntries": 480,
      "uniqueDomains": 450,
      "invalidCount": 20
    },
    "insertedDomains": 450,
    "insertedMappings": 480,
    "ignoredDuplicates": 0
  }
}
```

### 4. CLI 임포트 스크립트 (scripts/import-school-email-domains.js)
명령어로 도메인 데이터를 한 번에 가져옵니다:

```bash
# 기본 경로 사용 (server/data/school-email-domains.raw.txt)
npm run import:school-domains

# 커스텀 경로 사용
npm run import:school-domains ./my-domains.txt
```

### 5. 환경 변수 자동 로드 (dotenv)
- `server/db.js`에서 자동으로 `.env` 파일을 로드
- 더 이상 `export DATABASE_URL=...` 할 필요 없음

## 🚀 설정 방법

### 1. 로컬 개발 환경 설정

**.env 파일 생성** (`.env.example` 참고):
```bash
cp .env.example .env
```

`.env` 파일 편집:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/path
NODE_ENV=development
PORT=5000
SESSION_SECRET=your_random_secret_32_chars_here
CORS_ORIGIN=http://localhost:3000
SITE_URL=http://localhost:5000
```

### 2. 도메인 데이터 준비

**파일: `server/data/school-email-domains.raw.txt`**

형식 (각 줄):
```
가천대학교 gachon.ac.kr
경복대학교 kbu.ac.kr
한양대학교 hanyang.ac.kr
...
```

파일에 이미 250+ 한국 대학이 포함되어 있습니다.

### 3. 도메인 임포트

```bash
# 서버가 실행 중이지 않은 상태에서 실행
npm run import:school-domains
```

**출력 예시:**
```
[DONE] 학교 이메일 도메인 가져오기 완료
{
  "parsed": {
    "totalLines": 250,
    "validEntries": 245,
    "uniqueDomains": 245,
    "invalidCount": 5
  },
  "insertedDomains": 245,
  "insertedMappings": 245,
  "ignoredDuplicates": 0
}
```

### 4. API 테스트

```bash
# 도메인 확인
curl "http://localhost:5000/api/auth/school-email-domain/check?email=student@gachon.ac.kr"

# 응답
{
  "ok": true,
  "domain": "gachon.ac.kr",
  "allowed": true,
  "universities": ["가천대학교", "가천의과학대학교"]
}
```

## 📋 Render 배포 설정

### 환경 변수 설정
Render 대시보드에서 다음 환경 변수를 설정합니다:

- `DATABASE_URL`: Render가 자동으로 제공 (PostgreSQL 생성 시)
- `NODE_ENV=production`
- `SESSION_SECRET`: 안전한 임의의 문자열 (최소 32자)
- `CORS_ORIGIN`: https://yourdomain.com
- `SITE_URL`: https://yourdomain.com

### 배포 후 도메인 임포트

Render에서는 직접 스크립트를 실행할 수 없으므로 관리자 API를 사용:

```bash
curl -X POST https://api.yourdomain.com/api/auth/school-email-domain/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d @- << 'EOF'
{
  "rawText": "가천대학교 gachon.ac.kr\n경복대학교 kbu.ac.kr\n..."
}
EOF
```

## 🔧 다음 단계 (미완료)

### 1. OTP 인증 엔드포인트
- `POST /api/auth/school-email-otp/request` - OTP 요청
- `POST /api/auth/school-email-otp/verify` - OTP 검증

### 2. 회원가입 UI 통합
- 이메일 입력 필드
- 도메인 자동 검증
- OTP 입력 폼
- 학교명 자동 표시

### 3. 계정 티어 시스템
- **Community**: 이메일 미인증
- **Verified Student**: 학교 이메일로 인증됨
- **Instructor**: 대학원 이메일 또는 승인
- **Graduate**: 졸업생 도메인 허용

## 📝 폐기된 기능

다음 파일과 기능은 완전히 제거되었습니다:

- `PHONE_AUTH_SETUP.md` - 폐기됨 ❌
- `PHONE_AUTH_IMPLEMENTATION.md` - 폐기됨 ❌
- `server/utils/aligo.js` - 삭제됨 ❌
- `phone_verifications` 테이블 - 스키마에서 제거됨 ❌
- ALIGO_* 환경 변수 - .env.example에서 제거됨 ❌
- 모든 전화 인증 엔드포인트 - 410 Gone 반환 ❌

## ✨ 기술 상세

### 도메인 정규화 예시
```javascript
const schoolEmailDomain = require('./server/utils/schoolEmailDomain');

schoolEmailDomain.normalizeDomain('  @WWW.EXAMPLE.AC.KR  ')
// → 'example.ac.kr'

schoolEmailDomain.isValidDomain('example.ac.kr')
// → true

schoolEmailDomain.isValidDomain('invalid..domain')
// → false
```

### 파서 실행 예시
```javascript
const { parseUniversityDomainText } = require('./server/utils/schoolEmailDomain');

const result = parseUniversityDomainText(`
가천대학교 gachon.ac.kr
경복대학교 kbu.ac.kr

한양대학교 hanyang.ac.kr
`);

// {
//   entries: [
//     { universityName: '가천대학교', domain: 'gachon.ac.kr' },
//     { universityName: '경복대학교', domain: 'kbu.ac.kr' },
//     { universityName: '한양대학교', domain: 'hanyang.ac.kr' }
//   ],
//   invalidLines: [],
//   stats: {
//     totalLines: 4,
//     validEntries: 3,
//     uniqueDomains: 3,
//     invalidCount: 0
//   }
// }
```

## 🐛 문제 해결

### "DATABASE_URL이 설정되지 않았습니다" 오류
**해결:** `.env` 파일이 프로젝트 루트에 있는지 확인하고 `DATABASE_URL`이 설정되어 있는지 확인합니다.

```bash
cat .env | grep DATABASE_URL
```

### 도메인 임포트 실패
1. 파일 형식 확인: `학교명 도메인` (공백 구분)
2. UTF-8 인코딩 확인
3. 데이터베이스 연결 확인

### 관리자 API 접근 불가
- 계정이 관리자(`is_admin=TRUE`)인지 확인
- 세션 쿠키가 올바른지 확인

---

**생성 날짜**: 2026-03-20  
**시스템**: Node.js Express + PostgreSQL  
**버전**: 1.0.0
