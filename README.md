# DabbaView Web

브라우저에서 동작하는 DICOM 뷰어입니다. 데스크톱 [DabbaView](https://github.com/Dabbabbu/DabbaView)(Python/PyQt5)의 조작 방식(PACS 표준 마우스, INFINITT 스타일 시리즈 패널, GE 스타일 오버레이)을 웹으로 옮겼습니다.

**기술 스택**: [Cornerstone3D](https://www.cornerstonejs.org/) v3 (core / tools / dicom-image-loader) + React 19 + Vite 7

> ⚠️ 진단용으로 인증된 의료기기가 아닙니다. 학습·연구·참고용으로 사용하세요.
> 모든 DICOM 처리(파싱, 렌더링, 익명화, 내보내기)는 **브라우저 안에서만** 이루어지며 서버로 업로드되지 않습니다.

## 주요 기능

### 불러오기
- **로컬 파일/폴더 드래그 앤 드롭** (하위 폴더 포함), **파일 열기 / 폴더 열기**
- **Google Drive**: Google Picker로 파일·폴더 선택(내 드라이브 · 폴더 탭 · 공유 드라이브) → Drive API로 다운로드 → 로드
- **OneDrive**: MSAL.js 로그인 → Microsoft Graph로 폴더 탐색·선택(다른 사람이 공유한 폴더 포함) → 다운로드 → 로드
- **클라우드 폴더 단위 열기**: 폴더를 고르면 하위 폴더까지(최대 20단계) 모든 DICOM·ZIP을 재귀로 찾아 받아서 엽니다
  - 진행률: 폴더 탐색 중에는 `폴더 N개 · 파일 N개 (용량)`, 다운로드 중에는 `N/N개 · 받은 MB / 전체 MB`와 진행 막대
  - **취소** 버튼으로 언제든 중단, 이미지·PDF·문서 등 DICOM이 아닌 파일은 받지 않음, Google Drive 폴더 바로가기도 따라감
  - 폴더 목록은 4개, 다운로드는 6개씩 병렬 처리하고, 속도 제한(429/503)은 자동으로 기다렸다 다시 시도
- **캐시**: 클라우드에서 받은 파일을 브라우저(IndexedDB)에 보관 → 같은 파일을 다시 열면 다운로드 없이 캐시에서 로드
  - 클라우드에서 파일이 바뀌면(Google `md5Checksum`, OneDrive `cTag`) 새로 받고 옛 버전은 교체
  - 기본 최대 5 GB, **⚙ 설정 → 캐시**에서 변경·끄기 가능. 한도를 넘으면 가장 오래 안 쓴 파일부터 자동 삭제(LRU)
  - 설정 창에 사용량(용량·파일 수, 브라우저 허용 공간)과 **Clear Cache** 버튼
  - 캐시는 그 브라우저 안에만 있으며, 환자 정보가 든 파일이므로 공용 PC에서는 사용 후 Clear Cache를 권장
- **시리즈 자동 분류**: SeriesInstanceUID 기준, 한 시리즈 안에 방향이 여럿이면(로컬라이저 등) 방향별로 분리, 위치/Instance Number로 정렬, 멀티프레임 지원
- **ZIP 자동 해제**: 로컬·Google Drive·OneDrive의 `.zip`을 풀어서 로드 (DEFLATE/STORE, ZIP 안의 ZIP까지, 깨진 ZIP은 건너뛰고 알림)
- DICOM이 아닌 파일, 영상이 없는 객체(SR, PR, DICOMDIR)는 건너뜀
- 압축 전송 구문(JPEG Baseline/Lossless, JPEG-LS, JPEG 2000, HTJ2K, RLE) 디코딩 — Web Worker + WASM

### 다른 포맷 (DICOM 외)
- **NIfTI** (`.nii`, `.nii.gz`) — NIfTI-1/2, sform/qform 방향 인식, gzip 자동 해제
- **NRRD** (`.nrrd`, `.nhdr`) — raw 인코딩, space directions/origin 인식
- **NumPy** (`.npy`) — 2D/3D 배열 (C 순서). 간격 정보가 없으므로 1 mm로 가정
- RAS 좌표계(NIfTI 등)는 DICOM LPS로 변환해서 방향 표시·MPR·동기 스크롤이 DICOM과 똑같이 동작합니다
- 모든 파싱은 브라우저 안에서 File API로 처리합니다

### 뷰어
- **W/L**: 우클릭 드래그 (항상), 또는 W/L 도구로 좌클릭
- **Zoom / Pan**: Ctrl(⌘)+휠, Ctrl+드래그 / 가운데 버튼, Alt+드래그 · 모바일 핀치
- **슬라이스 스크롤**: 휠, ↑↓, PgUp/PgDn, **좌+우 버튼 함께 누르고 위아래 드래그**(빠르게 끌수록 많이) · 모바일 스와이프
- **위상(Phase) 영상**(heart cine 등): ↑↓ = 슬라이스 위치(위상 고정), **←→ = 위상**, 좌+우 버튼 드래그의 **좌우 = 위상**
- **🔍 기능 찾기 (Ctrl/⌘+F)**: 한글·영어·비슷한 말·초성으로 기능을 찾아 실행 — `동영상`, `내보내기`, `export`, `저장`, `ㄷㅇㅅ` → 내보내기
- **시네 재생** (1–60 fps)
- **측정**: 거리, 각도 / **ROI**: 사각형, 타원, 자유곡선 (면적·평균·SD·최소·최대) / Probe (픽셀 값, CT는 HU)
- **윈도우 프리셋**: Brain, Subdural, Stroke, Bone, Lung, Abdomen, Liver, Soft Tissue, Spine, Mediastinum (단축키 1–9)
- **DICOM 태그 보기** (시퀀스 포함, 검색)
- **흑백 반전, 90° 회전, 좌우/상하 반전, 화면 맞춤, 초기화**
- **오버레이**: 기관·환자명·ID·성별/나이·검사설명 / 날짜·시리즈·영상 번호·위치·두께·Matrix·FOV / 시리즈 설명·시퀀스·TR/TE/TI·FA/ETL/NEX·장비 / 실제 배율·W/L — 방향 표시(A/P/R/L/H/F)는 회전·반전에 따라 갱신

### Multi View / MPR
- **1x1, 1x2, 2x2** 레이아웃. 시리즈 패널에서 칸으로 **드래그 앤 드롭**, 또는 칸을 선택하고 시리즈 클릭
- **Crosslink**: 다른 칸 시리즈의 **전체 스캔 범위를 점선**으로, **현재 슬라이스를 노란 실선**으로 표시 (같은 좌표계일 때)
- **Reference Line**: 다른 칸의 **현재 슬라이스 한 줄만** 1:1로 표시
- **3D 커서**: 클릭한 지점의 환자 좌표(**L/P/S**)와 픽셀 값(CT는 HU, 그 외 SI)을 표시하고, 같은 좌표계의 다른 칸은 그 지점이 있는 슬라이스로 이동하며 **초록 커서**로 위치를 표시. 대응되지 않는 칸에는 **"대응 좌표 없음"** 표시
- **Phase 버튼**: Cine/다중 위상 시리즈에서 `[1][2][3]…[ALL]` 버튼으로 한 위상만 보기 (Temporal Position 태그 또는 위치 반복으로 자동 인식)
- **동기 스크롤**: 여러 칸을 함께 넘기기 (휠·방향키·시네 모두 반영)
  - **Ctrl(⌘)+칸 클릭**으로 함께 스크롤할 칸을 고르거나, 툴바의 **동기** 버튼(단축키 `Y`)을 켜면 모든 칸이 함께 이동
  - 같은 좌표계(Frame of Reference)의 평행한 시리즈는 **환자 좌표(mm) 기준**으로 가장 가까운 슬라이스를 맞춤 (예: 2 mm 60장 ↔ 5 mm 24장)
  - 좌표계가 다르거나 평행하지 않은 시리즈는 **비례 스크롤** (예: 30/60 → 10/20)
  - 동기 스크롤을 켜면 활성 칸 기준으로 즉시 맞춰지고, 선택한 칸은 파란 테두리로 표시
- **MPR**: Axial / Sagittal / Coronal 3평면 (실제 mm 비율, Crosshairs 도구로 평면 연동)

### 시리즈 패널 (INFINITT 스타일)
- 검사별 묶음, 가운데 슬라이스 **썸네일**, `시리즈번호/장수`, 시리즈(시퀀스) 이름, 선택 칸의 시리즈는 노란 테두리
- 마우스를 올리면 TR/TE/TI, FA, 두께, Matrix 툴팁. MPR 가능한 시리즈에는 `MPR` 버튼

### 모바일
- 반응형 레이아웃: 하단 도구 막대, 시리즈 패널은 서랍(drawer), MPR은 세로 3단
- 터치: 1손가락 = 선택 도구(기본: 스와이프 스크롤), 2손가락 = 핀치 줌(손가락 간격 비율대로, 두 손가락 가운데 기준) + 이동

### 내보내기
- **PNG / JPEG** 저장 (오버레이·측정 포함 여부 선택)
- **동영상**: **GIF** 또는 **WebM**(브라우저 MediaRecorder 녹화)으로 시리즈 전체 저장, FPS·최대 크기 선택
  - WebM은 모든 프레임을 먼저 그려 둔 뒤 정확히 1/FPS 간격으로 녹화하므로 재생 길이가 설정한 FPS와 맞습니다
  - 브라우저에서는 MP4 인코딩을 할 수 없어 WebM으로 대체합니다 (Chrome/Edge/Firefox 재생 가능, 대부분의 편집기에서도 열림)
- **파일 이름 규칙**: `{SeriesDescription}_{번호}.{확장자}` (예: `Ax T2_001.gif`, `SA CINE_002.webm`). 하나만 내보낼 때는 번호 없이 `Ax T2.gif`. PNG/JPEG는 번호 자리에 현재 슬라이스 번호가 들어갑니다
- **일괄 내보내기**: 여러 시리즈를 골라 각각 동영상으로 만들고 **ZIP 하나로** 저장 (화면 밖 임시 뷰포트에서 처리하므로 보던 화면은 그대로, 진행률·취소 지원)
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
2. 주소: `https://<사용자>.github.io/DabbaView-Web/`

빌드는 상대 경로(`base: './'`)라서 어떤 하위 경로에 올려도 동작합니다.

### Node.js 서버
```bash
npm run build
npm start            # http://localhost:8080  (PORT=3000 npm start 로 포트 변경)
```
`server/server.js`는 의존성 없는 정적 서버입니다 (WASM MIME, 캐시 헤더 포함). `dist/` 폴더를 nginx 등 아무 정적 호스팅에 올려도 됩니다.

## 클라우드 연동 설정

앱에는 API 키가 **들어 있지 않습니다.** 각 사용자가 본인의 키를 발급받아 앱의 **⚙ 설정** 창에 입력합니다. 입력한 값은 그 브라우저의 localStorage에만 저장되고 서버로 전송되지 않습니다.

- 키가 없으면 설정 창에 "API 키를 입력해주세요"가 표시되고, 각 서비스 옆에 `설정됨/미설정`이 나옵니다.
- 키 없이 Google Drive/OneDrive 버튼을 누르면 설정 창으로 안내합니다.

### Google Drive
1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트 생성 → **Google Drive API**, **Google Picker API** 사용 설정
2. **OAuth 동의 화면** 구성 (테스트 단계면 본인 계정을 테스트 사용자로 추가)
3. **사용자 인증 정보 → OAuth 클라이언트 ID (웹 애플리케이션)**: 승인된 JavaScript 원본에 `http://localhost:5173`, `https://<사용자>.github.io` 등 추가 → 설정 창의 **OAuth Client ID**
4. **API 키** 생성 (Picker API로 제한 권장) → 설정 창의 **API Key**
5. (선택) 프로젝트 번호 → 설정 창의 **App ID**

기본 범위는 `drive.readonly`입니다 (폴더를 골라 하위 파일까지 읽기 위해 필요). 공개 서비스로 운영하려면 Google 앱 검증이 필요합니다.

### OneDrive (Microsoft)
1. [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps) → 새 등록
   - 지원 계정: *모든 조직 디렉터리 + 개인 Microsoft 계정*
2. **Authentication → Add a platform → Single-page application**, Redirect URI:
   - `http://localhost:5173/auth-redirect.html`
   - `https://<사용자>.github.io/DabbaView-Web/auth-redirect.html`
3. **API permissions**: Microsoft Graph 위임 권한 `Files.Read`, `Files.Read.All`, `User.Read`
4. Application (client) ID → 설정 창의 **Application (client) ID**

MSAL v5는 팝업 응답을 `auth-redirect.html`(redirect bridge)이 메인 창으로 넘겨줍니다.

## 조작법

| 조작 | 기능 |
|---|---|
| 좌클릭 드래그 | 선택한 도구 |
| **우클릭 드래그** | **항상 W/L** (좌우 = Width, 상하 = Level) |
| 가운데 버튼 / Alt+드래그 | Pan |
| 휠 | 슬라이스 이동 |
| **좌 + 우클릭 함께 누르고 드래그** | **위아래 = 슬라이스, 좌우 = 위상** (빠르게 끌수록 많이, 최대 12배) |
| Ctrl(⌘)+휠, Ctrl+드래그 | Zoom |
| **오른쪽 막대 🔍 Zoom / ◐ W/L** 누르고 끌기 | 영상을 가리지 않고 확대(위아래) · W/L(좌우 = Width, 위아래 = Level). 두 번 클릭: 화면 맞춤 / 기본값 · 기능 찾기에서 숨기기 |
| 1손가락 (터치) | 선택한 도구 (기본: 스크롤) |
| **2손가락 벌리기 / 오므리기** | **확대 / 축소** (손가락 가운데 기준) |
| **2손가락 함께 위아래 / 좌우** | **슬라이스 / 위상** 넘기기 |
| **3손가락 끌기** | **이동 (Pan)** |

| 키 | 기능 |
|---|---|
| **Ctrl(⌘)+F** | **🔍 기능 찾기** |
| ↑ ↓ / PgUp PgDn / Home End | 슬라이스 이동 (1장 / 5장 / 처음·끝) — 위상 영상은 위상을 고정한 채 위치 |
| ← → | 위상 (위상 영상만) |
| 1–9, 0 | W/L 프리셋, 기본값 |
| Space | 시네 재생/정지 |
| I, R / Shift+R, H, V | 반전, 회전, 좌우/상하 반전 |
| F, Esc | 화면 맞춤, 보기 초기화 |
| W P Z S / L A B E D | W/L, Pan, Zoom, Scroll / 거리, 각도, 사각형, 타원, 자유곡선 |
| Y | 동기 스크롤 켜기/끄기 |
| Ctrl(⌘)/Shift + 칸 클릭 | 함께 스크롤할 칸 선택 (개별/범위) |
| O, T, F2, Tab, ? | 오버레이, 태그, 시리즈 패널, 다음 칸, 도움말 |

## 버전

버전은 `package.json`의 `version` 하나만 기준으로 삼습니다. 빌드할 때 `vite.config.js`가 이 값을 `__APP_VERSION__`으로 코드에 넣고(`src/version.js`), 화면에는 **시리즈 패널 아래**, **시작 화면**, **ⓘ 정보 창**에 `DabbaView Web v1.0.0` 형태로 표시됩니다.

```bash
npm version 1.1.0 --no-git-tag-version   # package.json만 바꾸면 다음 빌드부터 화면에 반영
```

## 프로젝트 구조

```
DabbaView-Web/
├─ index.html              # 앱
├─ auth-redirect.html      # MSAL 팝업 redirect bridge
├─ server/server.js        # Node 정적 서버 (npm start)
├─ src/
│  ├─ App.jsx              # 레이아웃, 드래그앤드롭, 단축키
│  ├─ cornerstone/         # 초기화, 도구 바인딩, 뷰 조작, 오버레이
│  ├─ dicom/               # 파일 수집·파싱·시리즈 분류, 메타데이터, 태그 사전, 익명화, Phase 분리
│  ├─ formats/             # NIfTI/NRRD/NumPy 파서와 Cornerstone 이미지 로더
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
- Crosslink/Reference Line/3D 커서는 **같은 Frame of Reference**(같은 검사에서 찍은 시리즈)끼리만 대응됩니다. 서로 다른 검사나 NIfTI 등 외부 볼륨은 좌표계가 달라 "대응 좌표 없음"으로 표시됩니다.
- NRRD는 raw 인코딩만 지원합니다 (gzip으로 압축된 내부 데이터는 미지원, 파일 전체를 gzip한 `.nrrd.gz`는 가능).
- `.npy`는 픽셀 간격 정보가 없어 1 mm 등방성으로 가정합니다.
