import { useEffect, useRef, useState } from 'react';
import { useStore, getSeries } from '../store/useStore';
import { getPhases } from '../dicom/phases';
import { Icon } from './Icons';
import { APP_TITLE, APP_VERSION } from '../version';
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
} from '../cornerstone/actions';

const TOOLS = [
  { key: 'WindowLevel', icon: 'wl', label: 'W/L', title: 'Window/Level (우클릭 드래그는 항상 W/L)' },
  { key: 'Pan', icon: 'pan', label: 'Pan', title: 'Pan (가운데 버튼 / Alt+드래그)' },
  { key: 'Zoom', icon: 'zoom', label: 'Zoom', title: 'Zoom (Ctrl+휠 / 핀치)' },
  { key: 'Scroll', icon: 'scroll', label: 'Scroll', title: '슬라이스 스크롤 (휠 / 스와이프)' },
  { key: 'Length', icon: 'length', label: '거리', title: '거리 측정' },
  { key: 'Angle', icon: 'angle', label: '각도', title: '각도 측정' },
  { key: 'Rectangle', icon: 'rect', label: '사각', title: '사각형 ROI' },
  { key: 'Ellipse', icon: 'ellipse', label: '타원', title: '타원 ROI' },
  { key: 'Freehand', icon: 'freehand', label: '자유', title: '자유곡선 ROI' },
  { key: 'Probe', icon: 'probe', label: 'Probe', title: '픽셀 값' },
  { key: 'Cursor3D', icon: 'cursor3d', label: '3D', title: '3D 커서 — 클릭한 지점의 환자 좌표(L/P/S)와 값, 다른 칸에 초록 커서 표시' },
];

export function HeaderBar({ onOpenFiles, onOpenFolder, onGoogleDrive, onOneDrive }) {
  const layout = useStore((s) => s.layout);
  const mode = useStore((s) => s.mode);
  const hasSeries = useStore((s) => s.series.length > 0);
  const [menu, setMenu] = useState(null);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenu(null));
  const st = useStore.getState;

  const openMpr = () => {
    const s = st();
    const key = s.viewportSeries[s.activeIndex] || s.series.find((x) => x.mprCapable)?.key;
    const series = getSeries(key);
    if (!series) return s.showToast('MPR로 볼 시리즈를 먼저 선택하세요', 'error');
    if (!series.mprCapable) return s.showToast('이 시리즈는 MPR을 지원하지 않습니다 (단일 프레임, 3장 이상, 위치 정보 필요)', 'error');
    s.openMpr(key);
  };

  return (
    <header className="header" ref={menuRef}>
      <button className="icon-btn" title="시리즈 패널 (F2)" onClick={() => st().toggleSeriesPanel()}>
        <Icon name="panel" />
      </button>
      <div className="brand" title={APP_TITLE} onClick={() => st().setDialog('about')}>
        <span className="brand-mark" />
        <span className="brand-name">
          DabbaView <em>Web</em>
        </span>
      </div>

      <div className="hgroup">
        <div className="dropdown">
          <button className="btn" onClick={() => setMenu(menu === 'open' ? null : 'open')}>
            <Icon name="open" /> <span className="hide-sm">열기</span>
          </button>
          {menu === 'open' && (
            <div className="menu" onClick={() => setMenu(null)}>
              <button onClick={onOpenFiles}>
                <Icon name="open" /> 파일 열기…
              </button>
              <button onClick={onOpenFolder}>
                <Icon name="folder" /> 폴더 열기…
              </button>
              <div className="menu-sep" />
              <button onClick={onGoogleDrive}>
                <Icon name="gdrive" /> Google Drive…
              </button>
              <button onClick={onOneDrive}>
                <Icon name="onedrive" /> OneDrive…
              </button>
              {hasSeries && (
                <>
                  <div className="menu-sep" />
                  <button onClick={() => st().clearAll()}>
                    <Icon name="trash" /> 모두 닫기
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="hgroup seg">
        {['1x1', '1x2', '2x2'].map((l) => (
          <button key={l} className={`btn seg-btn ${mode === 'stack' && layout === l ? 'on' : ''}`} onClick={() => st().setLayout(l)}>
            {l.toUpperCase()}
          </button>
        ))}
        <button className={`btn seg-btn ${mode === 'mpr' ? 'on' : ''}`} onClick={openMpr} title="MPR (Axial/Sagittal/Coronal)">
          MPR
        </button>
      </div>

      <div className="spacer" />

      <div className="hgroup hide-sm">
        <button className="icon-btn" title="DICOM 태그 (T)" onClick={() => st().setDialog('tags')}>
          <Icon name="tags" />
        </button>
        <button className="icon-btn" title="내보내기 (PNG/JPEG/GIF)" onClick={() => st().setDialog('export')}>
          <Icon name="export" />
        </button>
        <button className="icon-btn" title="익명화" onClick={() => st().setDialog('anonymize')}>
          <Icon name="anon" />
        </button>
        <button className="icon-btn" title="설정" onClick={() => st().setDialog('settings')}>
          <Icon name="settings" />
        </button>
        <button className="icon-btn" title="도움말 (?)" onClick={() => st().setDialog('help')}>
          <Icon name="help" />
        </button>
        <button className="icon-btn" title="정보" onClick={() => st().setDialog('about')}>
          <Icon name="info" />
        </button>
      </div>
      <div className="dropdown only-sm">
        <button className="icon-btn" onClick={() => setMenu(menu === 'more' ? null : 'more')} title="더보기">
          <Icon name="more" />
        </button>
        {menu === 'more' && (
          <div className="menu right" onClick={() => setMenu(null)}>
            <button onClick={() => st().setDialog('tags')}>
              <Icon name="tags" /> DICOM 태그
            </button>
            <button onClick={() => st().setDialog('export')}>
              <Icon name="export" /> 내보내기
            </button>
            <button onClick={() => st().setDialog('anonymize')}>
              <Icon name="anon" /> 익명화
            </button>
            <button onClick={() => st().toggleOverlay()}>
              <Icon name="overlay" /> 오버레이 표시/숨김
            </button>
            <button onClick={clearAnnotations}>
              <Icon name="trash" /> 측정 모두 지우기
            </button>
            <button onClick={() => st().setDialog('settings')}>
              <Icon name="settings" /> 설정
            </button>
            <button onClick={() => st().setDialog('help')}>
              <Icon name="help" /> 도움말
            </button>
            <button onClick={() => st().setDialog('about')}>
              <Icon name="info" /> 정보 <span className="muted">v{APP_VERSION}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

export function ToolBar() {
  const activeTool = useStore((s) => s.activeTool);
  const mode = useStore((s) => s.mode);
  const syncScroll = useStore((s) => s.syncScroll);
  const crosslink = useStore((s) => s.crosslink);
  const referenceLines = useStore((s) => s.referenceLines);
  const selectedCount = useStore((s) => s.selected.length);
  const activeIndex = useStore((s) => s.activeIndex);
  const cine = useStore((s) => s.cine[s.activeIndex]) || { playing: false, fps: 15 };
  const [menu, setMenu] = useState(null);
  const ref = useRef(null);
  useClickOutside(ref, () => setMenu(null));
  const st = useStore.getState;

  const tools = mode === 'mpr' ? [...TOOLS, { key: 'Crosshairs', icon: 'crosshairs', label: 'Cross', title: 'Crosshairs (MPR)' }] : TOOLS;

  const toggleCine = () => {
    if (cine.playing) {
      stopCine(activeIndex);
      st().setCine(activeIndex, { playing: false });
    } else if (playCine(activeIndex, cine.fps)) {
      st().setCine(activeIndex, { playing: true });
    }
  };
  const setFps = (fps) => {
    st().setCine(activeIndex, { fps });
    if (cine.playing) {
      stopCine(activeIndex);
      playCine(activeIndex, fps);
    }
  };

  return (
    <nav className="toolbar" ref={ref}>
      <div className="tgroup">
        {tools.map((t) => (
          <button key={t.key} className={`tool ${activeTool === t.key ? 'on' : ''}`} title={t.title} onClick={() => st().setActiveTool(t.key)}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="tsep" />
      <div className="tgroup">
        <div className="dropdown up-sm">
          <button className="tool" title="윈도우 프리셋 (1~9)" onClick={() => setMenu(menu === 'preset' ? null : 'preset')}>
            <Icon name="wl" />
            <span>프리셋</span>
          </button>
          {menu === 'preset' && (
            <div className="menu" onClick={() => setMenu(null)}>
              <button onClick={resetWindow}>Default (DICOM)</button>
              {WINDOW_PRESETS.map((p) => (
                <button key={p.name} onClick={() => applyWindow(p.width, p.center)}>
                  <span className="menu-key">{p.key || ''}</span>
                  {p.name}
                  <span className="muted">
                    {' '}
                    W{p.width} L{p.center}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="tool" title="흑백 반전 (I)" onClick={toggleInvert}>
          <Icon name="invert" />
          <span>반전</span>
        </button>
        <button className="tool" title="왼쪽 90° 회전 (Shift+R)" onClick={() => rotate(-90)}>
          <Icon name="rotL" />
          <span>↺90</span>
        </button>
        <button className="tool" title="오른쪽 90° 회전 (R)" onClick={() => rotate(90)}>
          <Icon name="rotR" />
          <span>↻90</span>
        </button>
        <button className="tool" title="좌우 반전 (H)" onClick={() => flip(true)}>
          <Icon name="flipH" />
          <span>좌우</span>
        </button>
        <button className="tool" title="상하 반전 (V)" onClick={() => flip(false)}>
          <Icon name="flipV" />
          <span>상하</span>
        </button>
        <button className="tool" title="화면 맞춤 (F)" onClick={fitToWindow}>
          <Icon name="fit" />
          <span>맞춤</span>
        </button>
        <button className="tool" title="초기화 (Esc)" onClick={resetView}>
          <Icon name="reset" />
          <span>리셋</span>
        </button>
      </div>
      <div className="tsep" />
      <div className="tgroup">
        <button className={`tool ${cine.playing ? 'on' : ''}`} title="시네 재생/정지 (Space)" onClick={toggleCine}>
          <Icon name={cine.playing ? 'stop' : 'play'} />
          <span>{cine.playing ? '정지' : '시네'}</span>
        </button>
        <label className="fps" title="초당 프레임">
          <input type="range" min="1" max="60" value={cine.fps} onChange={(e) => setFps(+e.target.value)} />
          <span>{cine.fps}fps</span>
        </label>
      </div>
      <div className="tsep" />
      <div className="tgroup">
        <button
          className={`tool ${crosslink ? 'on' : ''}`}
          title={'Crosslink — 다른 칸의 전체 스캔 범위를 점선으로, 현재 슬라이스를 노란 실선으로 표시'}
          onClick={() => st().toggleCrosslink()}
        >
          <Icon name="crosslink" />
          <span>Crosslink</span>
        </button>
        <button
          className={`tool ${referenceLines ? 'on' : ''}`}
          title={'Reference Line — 다른 칸의 현재 슬라이스 한 줄만 표시'}
          onClick={() => st().toggleReferenceLines()}
        >
          <Icon name="refline" />
          <span>Ref Line</span>
        </button>
        <button
          className={`tool ${syncScroll ? 'on' : ''}`}
          title={'동기 스크롤 (Y)\n켜면 모든 칸이 함께 이동합니다.\n끄면 Ctrl(⌘)+클릭으로 함께 선택한 칸끼리만 이동합니다.\n같은 좌표계면 위치(mm) 기준, 아니면 비례로 맞춥니다.'}
          onClick={() => {
            const on = !syncScroll;
            st().setSyncScroll(on);
            if (on) alignToActive();
          }}
        >
          <Icon name="sync" />
          <span>{syncScroll ? '동기 ON' : selectedCount > 1 ? `동기 ${selectedCount}칸` : '동기'}</span>
        </button>
      </div>
      <div className="tsep hide-sm" />
      <div className="tgroup hide-sm">
        <button className="tool" title="오버레이 표시/숨김 (O)" onClick={() => st().toggleOverlay()}>
          <Icon name="overlay" />
          <span>정보</span>
        </button>
        <button className="tool" title="측정 모두 지우기" onClick={clearAnnotations}>
          <Icon name="trash" />
          <span>지우기</span>
        </button>
      </div>
    </nav>
  );
}

function useClickOutside(ref, fn) {
  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) fn();
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [ref, fn]);
}

/** Cine/다중 Phase 시리즈용 [1][2][3]…[ALL] 버튼 (활성 칸 기준) */
export function PhaseBar() {
  const activeIndex = useStore((s) => s.activeIndex);
  const mode = useStore((s) => s.mode);
  const activeSeries = useStore((s) => s.series.find((x) => x.key === s.viewportSeries[s.activeIndex]));
  const phase = useStore((s) => s.phaseByViewport[s.activeIndex] ?? null);
  const phases = mode === 'stack' && activeSeries ? getPhases(activeSeries) : null;
  if (!phases || phases.length < 2) return null;
  return (
    <div className="phase-bar">
      <Icon name="phase" size={16} />
      <span className="muted small">Phase</span>
      {phases.map((p, i) => (
        <button
          key={i}
          className={`phase-btn ${phase === i ? 'on' : ''}`}
          title={`Phase ${i + 1} — ${p.length}장만 보기`}
          onClick={() => useStore.getState().setPhase(activeIndex, i)}
        >
          {i + 1}
        </button>
      ))}
      <button className={`phase-btn ${phase === null ? 'on' : ''}`} title="전체 Phase" onClick={() => useStore.getState().setPhase(activeIndex, null)}>
        ALL
      </button>
      <span className="muted small">
        {phases.length}개 위상 · 위상당 {phases[0].length}장
      </span>
    </div>
  );
}
