# DabbaView Web

브라우저에서 동작하는 DICOM 뷰어입니다. 데스크톱 [DabbaView](https://github.com/Dabbabbu/DabbaView)(Python/PyQt5)의 조작 방식(PACS 표준 마우스, INFINITT 스타일 시리즈 패널, GE 스타일 오버레이)을 웹으로 옮겼습니다.

**기술 스택**: [Cornerstone3D](https://www.cornerstonejs.org/) v3 (core / tools / dicom-image-loader) + React 19 + Vite 7

> ⚠️ 진단용으로 인증된 의료기기가 아닙니다. 학습·연구·참고용으로 사용하세요.
> 모든 DICOM 처리(파싱, 렌더링, 익명화, 내보내기)는 **브라우저 안에서만** 이루어지며 서버로 업로드되지 않습니다.

## 주요 기능

### 불러오기
- **로컬 파일/폴더 드래그 앤 드롭** (하위 폴더 포함), **파일 열기 / 폴더 열기**
- **Google Drive**: Google Picker로 파일·폴더 선택 → Drive API로 다운로드 → 로드 (폴더는 하위까지 재귀)
- **OneDrive**: MSAL.js 로그인 → Microsoft Graph로 폴더 탐색·선택 → 다운로드 → 로드
- **시리즈 자동 분류**: SeriesInstanceUID 기준, 한 시리즈 안에 방향이 여럿이면(로컬라이저 등) 방향별로 분리, 위치/Instance Number로 정렬, 멀티프레임 지원
- DICOM이 아닌 파일, 영상이 없는 객체(SR, PR, DICOMDIR)는 건너뜀
- 압축 전송 구문(JPEG Baseline/Lossless, JPEG-LS, JPEG 2000, HTJ2K, RLE) 디코딩 — Web Worker + WASM

### 뷰어
- **W/L**: 우클릭 드래그 (항상), 또는 W/L 도구로 좌클릭
- **Zoom / Pan**: Ctrl(⌘)+휠, Ctrl+드래그 / 가운데 버튼, Alt+드래그 · 모바일 핀치
- **슬라이스 스크롤**: 휠, ↑↓, PgUp/PgDn · 모바일 스와이프
- **시네 재생** (1–60 fps)
- **측정**: 거리, 각도 / **ROI**: 사각형, 타원, 자유곡선 (면적·평균·SD·최소·최대) / Probe (픽셀 값, CT는 HU)
- **윈도우 프리셋**: Brain, Subdural, Stroke, Bone, Lung, Abdomen, Liver, Soft Tissue, Spine, Mediastinum (단축키 1–9)
- **DICOM 태그 보기** (시퀀스 포함, 검색)
- **흑백 반전, 90° 회전, 좌우/상하 반전, 화면 맞춤, 초기화**
- **오버레이**: 기관·환자명·ID·성별/나이·검사설명 / 날짜·시리즈·영상 번호·위치·두께·Matrix·FOV / 시리즈 설명·시퀀스·TR/TE/TI·FA/ETL/NEX·장비 / 실제 배율·W/L — 방향 표시(A/P/R/L/H/F)는 회전·반전에 따라 갱신

### Multi View / MPR
- **1x1, 1x2, 2x2** 레이아웃. 시리즈 패널에서 칸으로 **드래그 앤 드롭**, 또는 칸을 선택하고 시리즈 클릭
- **MPR**: Axial / Sagittal / Coronal 3평면 (실제 mm 비율, Crosshairs 도구로 평면 연동)

### 시리즈 패널 (INFINITT 스타일)
- 검사별 묶음, 가운데 슬라이스 **썸네일**, `시리즈번호/장수`, 시리즈(시퀀스) 이름, 선택 칸의 시리즈는 노란 테두리
- 마우스를 올리면 TR/TE/TI, FA, 두께, Matrix 툴팁. MPR 가능한 시리즈에는 `MPR` 버튼

### 모바일
- 반응형 레이아웃: 하단 도구 막대, 시리즈 패널은 서랍(drawer), MPR은 세로 3단
- 터치: 1손가락 = 선택 도구(기본: 스와이프 스크롤), 2손가락 = 핀치 줌 + 이동

### 내보내기
- **PNG / JPEG** 저장 (오버레이·측정 포함 여부 선택)
- **GIF 동영상** (시리즈 전체, FPS·크기 선택)
- **익명화**: 환자/기관/의사 정보 제거, Study/Series/SOP UID를 일관되게 재생성, Private 태그 제거 → ZIP 다운로드

## 빠른 시작

Node.js 20 이상이 필요합니다.

```bash
git clone https://github.com/Dabbabbu/DabbaView-Web.git
cd DabbaView-Web
npm install
npm run dev          # http://localhost:5173
```

## 배포

### GitHub Pages (정적 사이트)
`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 빌드해서 Pages에 올립니다.
1. 저장소 **Settings → Pages → Source: GitHub Actions**
2. (선택) 클라우드 연동 키를 **Settings → Secrets and variables → Actions → Variables**에 `VITE_GOOGLE_CLIENT_ID` 등으로 등록
3. 주소: `https://<사용자>.github.io/DabbaView-Web/`

빌드는 상대 경로(`base: './'`)라서 어떤 하위 경로에 올려도 동작합니다.

### Node.js 서버
```bash
npm run build
npm start            # http://localhost:8080  (PORT=3000 npm start 로 포트 변경)
```
`server/server.js`는 의존성 없는 정적 서버입니다 (WASM MIME, 캐시 헤더 포함). `dist/` 폴더를 nginx 등 아무 정적 호스팅에 올려도 됩니다.

## 클라우드 연동 설정

키는 `.env`(빌드 시 기본값) 또는 앱의 **⚙ 설정** 창(이 브라우저의 localStorage에 저장)에 넣습니다.

```bash
cp .env.example .env   # 값 입력 후 npm run dev / npm run build
```

### Google Drive
1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성 → **Google Drive API**, **Google Picker API** 사용 설정
2. **OAuth 동의 화면** 구성 (테스트 단계면 본인 계정을 테스트 사용자로 추가)
3. **사용자 인증 정보 → OAuth 클라이언트 ID (웹 애플리케이션)**: 승인된 JavaScript 원본에 `http://localhost:5173`, `https://<사용자>.github.io` 등 추가 → `VITE_GOOGLE_CLIENT_ID`
4. **API 키** 생성 (Picker API로 제한 권장) → `VITE_GOOGLE_API_KEY`
5. 프로젝트 번호 → `VITE_GOOGLE_APP_ID`

기본 범위는 `drive.readonly`입니다 (폴더를 골라 하위 파일까지 읽기 위해 필요). 공개 서비스로 운영하려면 Google 앱 검증이 필요합니다.

### OneDrive (Microsoft)
1. [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) → 새 등록
   - 지원 계정: *모든 조직 디렉터리 + 개인 Microsoft 계정*
2. **Authentication → Add a platform → Single-page application**, Redirect URI:
   - `http://localhost:5173/auth-redirect.html`
   - `https://<사용자>.github.io/DabbaView-Web/auth-redirect.html`
3. **API permissions**: Microsoft Graph 위임 권한 `Files.Read`, `Files.Read.All`, `User.Read`
4. Application (client) ID → `VITE_MS_CLIENT_ID`

MSAL v5는 팝업 응답을 `auth-redirect.html`(redirect bridge)이 메인 창으로 넘겨줍니다.

## 조작법

| 조작 | 기능 |
|---|---|
| 좌클릭 드래그 | 선택한 도구 |
| **우클릭 드래그** | **항상 W/L** (좌우 = Width, 상하 = Level) |
| 가운데 버튼 / Alt+드래그 | Pan |
| 휠 | 슬라이스 이동 |
| Ctrl(⌘)+휠, Ctrl+드래그 | Zoom |
| 1손가락 / 2손가락 (터치) | 선택 도구(기본 스크롤) / 핀치 줌+이동 |

| 키 | 기능 |
|---|---|
| ↑ ↓ / PgUp PgDn / Home End | 슬라이스 이동 (1장 / 5장 / 처음·끝) |
| 1–9, 0 | W/L 프리셋, 기본값 |
| Space | 시네 재생/정지 |
| I, R / Shift+R, H, V | 반전, 회전, 좌우/상하 반전 |
| F, Esc | 화면 맞춤, 보기 초기화 |
| W P Z S / L A B E D | W/L, Pan, Zoom, Scroll / 거리, 각도, 사각형, 타원, 자유곡선 |
| O, T, F2, Tab, ? | 오버레이, 태그, 시리즈 패널, 다음 칸, 도움말 |

## 프로젝트 구조

```
DabbaView-Web/
├─ index.html              # 앱
├─ auth-redirect.html      # MSAL 팝업 redirect bridge
├─ server/server.js        # Node 정적 서버 (npm start)
├─ src/
│  ├─ App.jsx              # 레이아웃, 드래그앤드롭, 단축키
│  ├─ cornerstone/         # 초기화, 도구 바인딩, 뷰 조작, 오버레이
│  ├─ dicom/               # 파일 수집·파싱·시리즈 분류, 메타데이터, 태그 사전, 익명화
│  ├─ cloud/               # Google Drive(Picker), OneDrive(MSAL + Graph)
│  ├─ export/              # PNG/JPEG/GIF 캡처, ZIP
│  ├─ components/          # 툴바, 시리즈 패널, 뷰포트, MPR, 대화상자
│  ├─ store/useStore.js    # zustand 상태
│  └─ styles/app.css       # 다크 테마, 반응형
└─ .github/workflows/deploy.yml
```

## 참고 / 제한
- 파일 전체를 메모리에 올려 표시합니다. 매우 큰 검사(수천 장)는 브라우저 메모리에 따라 느릴 수 있습니다.
- 익명화는 값 영역을 같은 길이로 덮어쓰는 방식입니다(파일 구조 보존). 픽셀에 새겨진 글자(burned-in annotation)는 지우지 않습니다.
- MPR은 단일 프레임, 3장 이상, 위치 정보(Image Position/Orientation)가 있는 시리즈에서 동작합니다.
