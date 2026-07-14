# 도개중고등학교 정보 허브

교내 교사를 위한 정보 허브입니다. 공지 대시보드, 업무분장, 진로 활동, 자리 배치표를 제공합니다.

## 주요 페이지

| 파일 | 기능 |
| --- | --- |
| `index.html` | 허브 메인 화면 및 관리자 모드 진입 |
| `dashboard.html` | 공지 캘린더, 게시판, 부서별 링크 |
| `mindmap.html` | 업무분장 검색 및 열람 |
| `career.html` | 진로 활동 기록 및 전공 추천 |
| `seating.html` | 학급별 자리 배치 및 저장 이력 |
| `forms.html` | 양식 자료실 화면 (등록·저장 기능은 현재 미구현) |

## 운영 구조

```text
교내 브라우저
  → Vercel Middleware: 학교 IP 확인
  → Vercel API: 입력값 처리 및 Firebase Admin SDK 호출
  → Cloud Firestore
```

- 브라우저는 Firestore에 직접 연결하지 않습니다.
- Firestore Rules는 모든 브라우저 요청을 차단합니다.
- 서버 API는 Firebase 서비스 계정으로 Firestore에 접근합니다.
- 현재 학교 IP 허용 대역은 `117.110.113.*`입니다. 학교 공인 IP가 바뀌면 `middleware.js`와 `lib/school-access.js`를 함께 갱신해야 합니다.

## Vercel 환경변수

값은 GitHub, 소스 코드, 채팅에 절대 저장하지 않습니다.

| 이름 | 용도 | 적용 환경 |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK 서비스 계정 JSON 전체 | Production, Preview |
| `GROQ_API_KEY` | 진로 활동 전공 추천 API 키 | Production, Preview |
| `SCHOOL_ALLOWED_CIDRS` | 서버 API의 추가 학교 IP CIDR 대역 | Production, Preview |
| `NEIS_API_KEY` | 나이스 교육정보 개방 포털 학사일정 인증키 | Production, Preview |
| `NEIS_OFFICE_CODE` | 나이스 교육청 코드 (도개중고등학교는 경상북도교육청 코드) | Production, Preview |
| `NEIS_SCHOOL_CODE` | 나이스 학교 코드. 병설 학교는 중·고 코드를 쉼표로 연결 | Production, Preview |
| `HOLIDAY_API_KEY` | 공공데이터포털 특일 정보 API 서비스키 | Production, Preview |
| `CRON_SECRET` | 새벽 자동 캘린더 캐시 갱신용 임의의 긴 비밀 문자열 | Production |

환경변수 변경 뒤에는 새 Vercel 배포가 필요합니다.

## 캘린더 외부 일정 캐시

- 매일 한국 시간 01:00에 나이스 학사일정과 공휴일 정보를 갱신합니다.
- 현재 연도 기준 앞뒤 10년(총 21년)의 정보를 Firestore `calendar_cache`에 연도별로 저장합니다.
- 교사가 캘린더를 열 때는 외부 API가 아닌 저장된 캐시만 읽습니다.
- 최초 테스트는 교내망에서 `/api/calendar-refresh?span=0`를 열어 현재 연도만 빠르게 저장한 뒤 확인합니다. 전체 범위는 `/api/calendar-refresh` 또는 다음 새벽 자동 갱신으로 처리합니다.

## Firestore Rules

현재 규칙은 [firestore.rules](./firestore.rules)에 있습니다. Firebase Console의 Firestore Database → Rules에도 같은 규칙을 적용해야 합니다.

```js
match /{document=**} {
  allow read, write: if false;
}
```

새 컬렉션을 추가해도 브라우저에서 직접 Firestore를 호출하지 말고, 학교 IP 확인을 하는 Vercel API를 추가해야 합니다.

## 관리자 모드

- 메인 화면에서 로고를 5회 클릭해 진입합니다.
- 관리자 상태는 같은 브라우저 탭의 `sessionStorage`에 저장되어 메인·대시보드·진로 활동에서 공유됩니다.
- 탭을 닫거나 로그아웃하면 관리자 모드가 해제됩니다.
- 현재 관리자는 사용성을 우선한 간단한 화면 모드입니다. 실제 데이터 쓰기는 학교 IP 제한을 통과한 사용자에게 허용됩니다.

## 배포 절차

1. `codex/` 접두어의 작업 브랜치에서 변경합니다.
2. Vercel Preview 배포에서 교내망 접속과 기능을 확인합니다.
3. GitHub Pull Request를 `main`으로 병합합니다.
4. Vercel Production 배포가 `Ready`인지 확인합니다.
5. 교내망에서 운영 주소의 읽기·쓰기 동작을 확인합니다.

## 개발 확인

Vercel API는 Node.js와 `firebase-admin`을 사용합니다.

```powershell
npm.cmd install
node --check api/dashboard.js
node --check api/career.js
node --check api/seating.js
```

## 알려진 제한사항

- `forms.html`은 양식 자료실 UI만 있으며 파일 등록·저장·다운로드 로직은 미구현입니다.
- `mindmap.html`의 업무분장 데이터는 HTML 내부에 직접 작성되어 있습니다. 새 업무분장 자료를 받을 때 해당 파일의 `ORG_DATA`를 갱신해야 합니다.
- 학교 IP가 변경되면 접근 제한이 발생할 수 있습니다. 교내에서 공인 IP를 확인한 뒤 허용 대역을 업데이트하고 Preview에서 먼저 검증합니다.
