// 기능 찾기에 나오는 기능 목록 — 화면의 버튼·메뉴와 같은 동작을 부른다
import { useStore, LAYOUTS } from '../store/useStore';
import { alignToActive } from '../cornerstone/sync';
import {
  WINDOW_PRESETS,
  applyWindow,
  resetWindow,
  toggleInvert,
  rotate,
  flip,
  resetView,
  fitToWindow,
  clearAnnotations,
  playCine,
  stopCine,
  stepSlice,
  selectPhase,
} from '../cornerstone/actions';
import { TOOLS, openMprForActive } from '../components/Toolbar';
import { KW } from './commandSearch';
import { cacheStats, clearCache } from '../cloud/cache';
import { LINK_MODES, getLinkMode, setLinkMode } from '../cornerstone/planes';
import { notifyViewportChanged } from '../cornerstone/sync';
import { formatBytes } from '../cloud/transfer';

// 캐시 지우기: 얼마나 쓰는지 보여 주고 확인
async function clearCacheCommand() {
  const { showToast } = useStore.getState();
  try {
    const { count, bytes } = await cacheStats();
    if (!count) return showToast('캐시가 이미 비어 있습니다');
    if (!window.confirm(`캐시 ${formatBytes(bytes)} (클라우드 파일 ${count}개)를 모두 지울까요?\n지금 열린 영상은 그대로이고, 다음에 같은 클라우드 파일을 열면 다시 내려받습니다.`)) return;
    await clearCache();
    showToast(`캐시 ${formatBytes(bytes)}를 지웠습니다`);
  } catch (e) {
    showToast(`캐시 지우기 실패: ${e.message || e}`, 'error');
  }
}

const TOOL_WORDS = {
  WindowLevel: KW.window,
  Pan: '이동 팬 끌기 옮기기 pan move',
  Zoom: '확대 축소 줌 zoom magnify',
  Scroll: '스크롤 넘기기 슬라이스 scroll slice',
  Length: `${KW.measure} 거리 길이 length distance ruler 자`,
  Angle: `${KW.measure} 각도 angle`,
  Rectangle: `${KW.measure} 사각형 사각 roi rectangle box 관심영역`,
  Ellipse: `${KW.measure} 타원 원 roi ellipse circle 관심영역`,
  Freehand: `${KW.measure} 자유곡선 자유 roi freehand 그리기 관심영역`,
  Probe: '픽셀값 값 hu probe pixel value',
  Cursor3D: '3d커서 3차원 좌표 cursor 3d 위치',
};

export function buildCommands({ onOpenFiles, onOpenFolder, onGoogleDrive, onOneDrive }) {
  const st = useStore.getState;
  const s = st();
  const hasSeries = s.series.length > 0;
  const dlg = (d) => () => st().setDialog(d);
  const toggleCine = () => {
    const i = st().activeIndex;
    const c = st().cine[i] || { fps: 15 };
    if (c.playing) {
      stopCine(i);
      st().setCine(i, { playing: false });
    } else if (playCine(i, c.fps || 15)) st().setCine(i, { playing: true });
  };
  const list = [
    { label: '파일 열기…', path: '열기', keywords: `${KW.open} 파일 file dicom`, run: onOpenFiles },
    { label: '폴더 열기…', path: '열기', keywords: `${KW.open} 폴더 folder directory`, run: onOpenFolder },
    { label: 'Google Drive…', path: '열기', keywords: `${KW.cloud} ${KW.open} 구글 google gdrive`, run: onGoogleDrive },
    { label: 'OneDrive…', path: '열기', keywords: `${KW.cloud} ${KW.open} 원드라이브 onedrive microsoft ms`, run: onOneDrive },
    { label: '모두 닫기', path: '열기', keywords: '닫기 지우기 비우기 close clear all 초기화', run: () => st().clearAll(), disabled: !hasSeries },
    ...Object.keys(LAYOUTS).map((l) => ({
      label: `레이아웃 ${l}`,
      path: '화면',
      keywords: `레이아웃 화면분할 분할 여러화면 멀티뷰 multi view layout grid ${l}`,
      run: () => st().setLayout(l),
    })),
    { label: 'MPR (Axial · Sagittal · Coronal)', path: '화면', keywords: 'mpr 재구성 다평면 axial sagittal coronal 3방향 단면', run: openMprForActive, disabled: !hasSeries },
    { label: 'DICOM 태그', path: '헤더', shortcut: 'T', keywords: '태그 헤더 정보 tag tags dicom header meta', run: dlg('tags'), disabled: !hasSeries },
    {
      label: '내보내기 (이미지 · 동영상 GIF/WebM · ZIP)',
      path: '헤더',
      keywords: `${KW.export} ${KW.video} ${KW.image} zip 일괄 batch 여러장`,
      run: dlg('export'),
      disabled: !hasSeries,
    },
    { label: '익명화', path: '헤더', keywords: '익명 개인정보 비식별 anonymize deidentify privacy 환자정보삭제', run: dlg('anonymize'), disabled: !hasSeries },
    { label: '설정', path: '헤더', keywords: `${KW.settings} api 키 key`, run: dlg('settings') },
    {
      label: '캐시 지우기 (받아 둔 클라우드 파일 정리)',
      path: '캐시',
      keywords: '캐시 cache 지우기 비우기 삭제 정리 임시 임시파일 용량 저장공간 공간 디스크 clear',
      run: clearCacheCommand,
    },
    {
      label: '캐시 용량 한도 · 사용량 (설정)',
      path: '캐시',
      keywords: '캐시 cache 용량 한도 사용량 limit 저장공간 설정',
      run: dlg('settings'),
    },
    { label: '도움말 · 단축키', path: '헤더', shortcut: '?', keywords: '도움말 단축키 사용법 매뉴얼 help shortcut manual keyboard', run: dlg('help') },
    { label: '정보 (버전)', path: '헤더', keywords: '정보 버전 about version', run: dlg('about') },
    { label: '시리즈 패널 열기/닫기', path: '헤더', shortcut: 'F2', keywords: '시리즈 목록 패널 series panel list 썸네일', run: () => st().toggleSeriesPanel() },
    ...TOOLS.map((t) => ({
      label: `${t.label} 도구`,
      path: '도구',
      keywords: `${TOOL_WORDS[t.key] || ''} ${t.title}`,
      run: () => st().setActiveTool(t.key),
    })),
    { label: 'W/L 기본값 (DICOM)', path: '프리셋', shortcut: '0', keywords: `${KW.window} 프리셋 preset 기본 default 리셋`, run: resetWindow },
    ...WINDOW_PRESETS.map((p) => ({
      label: `W/L 프리셋: ${p.name}`,
      path: '프리셋',
      shortcut: p.key,
      keywords: `${KW.window} 프리셋 preset ${p.name}`,
      run: () => applyWindow(p.width, p.center),
    })),
    { label: '흑백 반전', path: '보기', shortcut: 'I', keywords: '반전 흑백 네거티브 invert negative', run: toggleInvert },
    { label: '오른쪽 90° 회전', path: '보기', shortcut: 'R', keywords: '회전 돌리기 rotate right 시계', run: () => rotate(90) },
    { label: '왼쪽 90° 회전', path: '보기', shortcut: 'Shift+R', keywords: '회전 돌리기 rotate left 반시계', run: () => rotate(-90) },
    { label: '좌우 반전', path: '보기', shortcut: 'H', keywords: '뒤집기 반전 좌우 flip horizontal mirror', run: () => flip(true) },
    { label: '상하 반전', path: '보기', shortcut: 'V', keywords: '뒤집기 반전 상하 flip vertical', run: () => flip(false) },
    { label: '화면 맞춤', path: '보기', shortcut: 'F', keywords: '맞춤 크기맞춤 fit window 전체보기', run: fitToWindow },
    { label: '보기 초기화', path: '보기', shortcut: 'Esc', keywords: '초기화 리셋 되돌리기 reset view', run: resetView },
    { label: '시네 재생 / 정지', path: '시네', shortcut: 'Space', keywords: '재생 정지 시네 동영상재생 play stop cine 애니메이션', run: toggleCine, disabled: !hasSeries },
    { label: '다음 위상', path: '위상', shortcut: '→', keywords: '위상 페이즈 phase next 심장 cine', run: () => stepSlice('phase', 1) },
    { label: '이전 위상', path: '위상', shortcut: '←', keywords: '위상 페이즈 phase previous 심장 cine', run: () => stepSlice('phase', -1) },
    { label: '전체 위상 보기 (ALL)', path: '위상', keywords: '위상 페이즈 phase all 전체', run: () => selectPhase(st().activeIndex, null) },
    { label: 'Crosslink', path: '동기', keywords: '크로스링크 스캔범위 교차선 crosslink scout 위치선', run: () => st().toggleCrosslink() },
    ...Object.entries(LINK_MODES).map(([key, text]) => ({
      label: `연동 기준: ${text}${getLinkMode() === key ? '  ✓' : ''}`,
      path: 'Crosslink',
      keywords: '연동 기준 크로스링크 crosslink reference line 위치선 스캔 플래닝 planning 좌표계 frame study 같은 검사 다른 폴더',
      run: () => {
        setLinkMode(key);
        notifyViewportChanged();
        st().showToast(`연동 기준: ${text}`);
      },
    })),
    { label: 'Reference Line', path: '동기', keywords: '기준선 참조선 reference line ref', run: () => st().toggleReferenceLines() },
    {
      label: '동기 스크롤 켜기/끄기',
      path: '동기',
      shortcut: 'Y',
      keywords: '동기 싱크 함께 같이 sync scroll link',
      run: () => {
        const on = !st().syncScroll;
        st().setSyncScroll(on);
        if (on) alignToActive();
      },
    },
    { label: '오버레이(환자 정보) 표시/숨김', path: '보기', shortcut: 'O', keywords: '오버레이 정보 글자 환자정보 overlay text info 숨기기', run: () => st().toggleOverlay() },
    {
      label: '영상 아래 Zoom · W/L 조절 칸 보이기/숨기기',
      path: '보기',
      keywords: `확대 축소 줌 zoom ${KW.window} 조절 막대 패드 슬라이더 pad`,
      run: () => st().toggleDragPads(),
    },
    { label: '측정 모두 지우기', path: '측정', keywords: `${KW.measure} 지우기 삭제 clear delete annotation 주석`, run: clearAnnotations },
  ];
  return list;
}
