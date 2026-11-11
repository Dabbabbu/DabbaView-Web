import { useEffect, useRef, useState } from 'react';
import { initCornerstone, getEngine } from './cornerstone/init';
import { getStackGroup, getMprGroup, setPrimaryTool } from './cornerstone/tools';
import {
  refreshAfterHidden,
  WINDOW_PRESETS,
  applyWindow,
  resetWindow,
  toggleInvert,
  rotate,
  flip,
  resetView,
  fitToWindow,
  scrollSlice,
  stepSlice,
  playCine,
  stopCine,
  clearAnnotations,
  undoAnnotation,
  redoAnnotation,
  deleteSelectedAnnotations,
} from './cornerstone/actions';
import { useStore, LAYOUTS, getSeries } from './store/useStore';
import { applyDrawStyle, drawCursor, watchNewAnnotations, colorLabel, DRAW_TOOLS } from './cornerstone/drawStyle';
import { applyRoiStats } from './cornerstone/roiStats';
import { folderLabel } from './dicom/source';
import { filesFromDataTransfer, filesFromInput } from './dicom/loader';
import { ingestFiles } from './dicom/ingest';
import {
  listRecent, rememberStudy, filesOfRecent, forgetRecent, forgetAllRecent,
  describeStudy, canRemember, formatBytes,
} from './dicom/recent';
import { pickFromGoogleDrive } from './cloud/googleDrive';
import { isGoogleConfigured, isOneDriveConfigured } from './cloud/config';
import { isAbort } from './cloud/transfer';
import { alignToActive } from './cornerstone/sync';
import { HeaderBar, ToolBar, PhaseBar } from './components/Toolbar';
import SeriesPanel from './components/SeriesPanel';
import ViewportGrid from './components/ViewportGrid';
import MprView from './components/MprView';
import TagViewer from './components/TagViewer';
import ExportDialog from './components/ExportDialog';
import AnonymizeDialog from './components/AnonymizeDialog';
import SettingsDialog from './components/SettingsDialog';
import LayoutConfig from './components/LayoutConfig';
import OneDriveBrowser from './components/OneDriveBrowser';
import HelpDialog from './components/HelpDialog';
import AboutDialog from './components/AboutDialog';
import CommandPalette from './components/CommandPalette';
import DragPads from './components/DragPads';
import { buildCommands } from './search/commands';
import UpdateBanner from './components/UpdateBanner';
import { APP_TITLE } from './version';
import { Icon } from './components/Icons';

/** 색 단축키 — 키 코드 → 색 이름 */
const COLOR_KEYS = { KeyR: 'red', KeyB: 'blue', KeyG: 'green', KeyW: 'white' };

export default function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(null);
  const [dropActive, setDropActive] = useState(false);
  const fileInput = useRef(null);
  const folderInput = useRef(null);
  const dragDepth = useRef(0);

  const mode = useStore((s) => s.mode);
  const hasSeries = useStore((s) => s.series.length > 0);
  const dialog = useStore((s) => s.dialog);
  const loading = useStore((s) => s.loading);
  const toast = useStore((s) => s.toast);
  const activeTool = useStore((s) => s.activeTool);
  const panelOpen = useStore((s) => s.seriesPanelOpen);
  const dragPads = useStore((s) => s.dragPads);
  const activeKey = useStore((s) => s.viewportSeries[s.activeIndex]);
  const drawColor = useStore((s) => s.drawColor);
  const drawWidth = useStore((s) => s.drawWidth);
  const scribbleShape = useStore((s) => s.scribbleShape);
  const roiStats = useStore((s) => s.roiStats);

  // 탭 제목에 지금 보는 시리즈의 폴더 이름 (어디서 왔는지)
  useEffect(() => {
    const folder = folderLabel(getSeries(activeKey)?.sourceFolder || '');
    document.title = folder ? `${folder} — DabbaView Web` : 'DabbaView Web';
  }, [activeKey]);

  useEffect(() => {
    initCornerstone()
      .then(() => {
        getStackGroup();
        getMprGroup();
        setReady(true);
      })
      .catch((e) => {
        console.error(e);
        setInitError(e.message || String(e));
      });
  }, []);

  // 좌클릭 도구 반영
  useEffect(() => {
    if (!ready) return;
    const tool = activeTool === 'Crosshairs' && mode !== 'mpr' ? 'WindowLevel' : activeTool;
    const opts = { shape: scribbleShape };
    setPrimaryTool(getStackGroup(), tool === 'Crosshairs' ? 'WindowLevel' : tool, opts);
    setPrimaryTool(getMprGroup(), tool, opts);
  }, [ready, activeTool, mode, scribbleShape]);

  // ── 그리기 색·굵기: 앞으로 그릴 것의 기본값 + 마우스 커서 ──
  useEffect(() => {
    if (!ready) return;
    applyDrawStyle(drawColor, drawWidth);
    const drawing = DRAW_TOOLS.includes(activeTool);
    document.body.classList.toggle('drawing', drawing);
    document.body.style.setProperty('--draw-cursor', drawing ? drawCursor(drawColor, drawWidth) : 'crosshair');
  }, [ready, drawColor, drawWidth, activeTool]);

  // ROI 상자에 보일 값 (Area · Avg · Max · Min · SD …)
  useEffect(() => {
    if (!ready) return;
    applyRoiStats([getStackGroup(), getMprGroup()], roiStats);
    getEngine()?.render();
  }, [ready, roiStats]);

  // 새로 그린 측정에 그때의 색·굵기를 찍어 둔다 (나중에 색을 바꿔도 옛 측정은 그대로)
  useEffect(() => {
    if (!ready) return undefined;
    return watchNewAnnotations(() => {
      const s = useStore.getState();
      return { colorKey: s.drawColor, width: s.drawWidth };
    });
  }, [ready]);

  // 탭을 다시 열었을 때 (숨겨진 동안 렌더링이 멈춰 카메라가 비어 있을 수 있음)
  useEffect(() => {
    if (!ready) return undefined;
    const onVisible = () => document.visibilityState === 'visible' && refreshAfterHidden();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [ready]);

  // ── 파일 열기 ──
  // 열기 = 지금 목록을 바꿈, ➕ 추가 = 지금 목록에 더해 빈 칸에 나란히 (데스크톱과 같음)
  const addMode = useRef(false);
  const pick = (input, add) => {
    addMode.current = add;
    input.current?.click();
  };
  const [recent, setRecent] = useState(() => listRecent());
  const refreshRecent = () => setRecent(listRecent());

  /** 불러오기 공통 — 끝나면 '최근에 본 검사'로 이 기기에 보관해 둔다 */
  const loadFiles = async (files, sourceLabel, name, add = false) => {
    if (!files?.length) return;
    if (!add) useStore.getState().clearAll();
    const series = await ingestFiles(files, sourceLabel);
    if (!add && series?.length && name) {
      await rememberStudy(files, name, describeStudy(series));
      refreshRecent();
    }
  };

  /** 고른 파일들의 이름 한 줄 (폴더로 열었으면 폴더 이름) */
  const nameOf = (files) => {
    const rel = files.find((f) => f.webkitRelativePath)?.webkitRelativePath;
    if (rel) return rel.split('/')[0];
    if (files.length === 1) return files[0].name;
    return `${files[0].name} 외 ${files.length - 1}개`;
  };

  const loadRef = useRef(loadFiles);
  loadRef.current = loadFiles;
  if (import.meta.env.DEV) {
    window.__dabbaview = { ...(window.__dabbaview || {}), loadFiles };   // 시험 자동화용
  }

  const onFiles = (list) => {
    const files = filesFromInput(list);
    if (!files.length) return;
    const add = addMode.current;
    loadFiles(files, add ? '추가한 파일' : '파일', nameOf(files), add);
  };

  /** 최근에 본 검사 다시 열기 — 파일 고르기 창 없이 바로 */
  const onOpenRecent = async (entry) => {
    const { setLoading, showToast } = useStore.getState();
    setLoading({ label: `${entry.label} 꺼내는 중…`, done: 0, total: entry.count });
    let files = null;
    try {
      files = await filesOfRecent(entry, (done, total) =>
        setLoading({ label: `${entry.label} 꺼내는 중…`, done, total }));
    } catch (e) {
      console.warn(e);
    }
    setLoading(null);
    if (!files) {
      showToast(
        canRemember()
          ? '보관해 둔 영상이 없어졌습니다 (저장 공간이 모자라 지워졌을 수 있습니다)'
          : "'이 기기에 보관'이 꺼져 있습니다 (⚙ 설정에서 켜 주세요)",
        'error',
      );
      refreshRecent();
      return;
    }
    useStore.getState().clearAll();
    await ingestFiles(files, entry.label);
  };
  const onGoogleDrive = async () => {
    const { setLoading, showToast, setDialog } = useStore.getState();
    if (!isGoogleConfigured()) {
      showToast('Google Drive API 키를 입력해주세요 (⚙ 설정)', 'error');
      setDialog('settings');
      return;
    }
    const ac = new AbortController();
    const onCancel = () => ac.abort();
    try {
      const files = await pickFromGoogleDrive((status) => setLoading({ ...status, onCancel }), ac.signal);
      setLoading(null);
      if (files.length) await ingestFiles(files, 'Google Drive');
    } catch (e) {
      setLoading(null);
      if (isAbort(e) || ac.signal.aborted) showToast('Google Drive 불러오기를 취소했습니다');
      else showToast(`Google Drive: ${e.message || e}`, 'error');
    }
  };
  const onOneDrive = () => {
    const { setDialog, showToast } = useStore.getState();
    if (!isOneDriveConfigured()) {
      showToast('OneDrive API 키(Client ID)를 입력해주세요 (⚙ 설정)', 'error');
      setDialog('settings');
      return;
    }
    setDialog('onedrive');
  };

  // ── 드래그 앤 드롭 (OS 파일/폴더) ──
  useEffect(() => {
    const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    const enter = (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDropActive(true);
    };
    const over = (e) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    const leave = (e) => {
      if (!isFileDrag(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDropActive(false);
    };
    const drop = async (e) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDropActive(false);
      const files = await filesFromDataTransfer(e.dataTransfer);
      loadRef.current(files, '파일', nameOf(files));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, []);

  // ── 키보드 단축키 ──
  useEffect(() => {
    const onKey = (e) => {
      const st = useStore.getState();
      // Ctrl/⌘+F: 기능 찾기 (브라우저의 페이지 찾기 대신)
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
        e.preventDefault();
        if (!st.dialog || st.dialog === 'find') st.setDialog('find');
        return;
      }
      if (e.target.closest?.('input, textarea, select')) return;
      if (st.dialog) return;
      const k = e.key;
      // (대문자 = Shift를 누른 것 — Shift+W는 ✍ 판서, 데스크톱과 같다)
      const toolKeys = { w: 'WindowLevel', p: 'Pan', z: 'Zoom', s: 'Scroll', l: 'Length', a: 'Angle',
                         b: 'Rectangle', e: 'Ellipse', d: 'Freehand', W: 'Scribble' };
      // ── 측정 편집: Ctrl(⌘)+E 모두 지우기 · Ctrl+Z 되돌리기 · Ctrl+Y(⌘+Shift+Z) 다시 되돌리기 ──
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      // 그리기 색: Ctrl(⌘)+R/B/G/W. Alt+R/B/G/W도 같은 색 (Ctrl+W를 브라우저가 가져가는 경우를 위해)
      const colorKey = COLOR_KEYS[e.code];
      if (colorKey && (mod || (e.altKey && !e.ctrlKey && !e.metaKey)) && !e.shiftKey) {
        st.setDrawColor(colorKey);
        st.showToast(`그리기 색: ${colorLabel(colorKey)}`);
        e.preventDefault();
        return;
      }
      if (mod) {
        const code = e.code;
        if (!e.shiftKey && code === 'KeyE') clearAnnotations();
        else if (!e.shiftKey && code === 'KeyZ') undoAnnotation();
        else if ((!e.shiftKey && code === 'KeyY') || (e.shiftKey && code === 'KeyZ')) redoAnnotation();
        else return;
        e.preventDefault();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Delete / Backspace: 고른 측정 삭제
      if (k === 'Delete' || k === 'Backspace') {
        deleteSelectedAnnotations();
        e.preventDefault();
        return;
      }
      // ↑↓ 슬라이스 (위상 영상은 위상을 고정한 채 위치), ←→ 위상 (위상 영상만)
      if (k === 'ArrowUp' || k === 'ArrowDown') stepSlice('position', k === 'ArrowUp' ? -1 : 1);
      else if (k === 'ArrowLeft' || k === 'ArrowRight') stepSlice('phase', k === 'ArrowLeft' ? -1 : 1);
      else if (k === 'PageUp' || k === 'PageDown') scrollSlice(k === 'PageUp' ? -5 : 5);
      else if (k === 'Home') scrollSlice(-100000);
      else if (k === 'End') scrollSlice(100000);
      else if (/^[1-9]$/.test(k)) {
        const p = WINDOW_PRESETS.find((x) => x.key === k);
        if (p) applyWindow(p.width, p.center);
      } else if (k === '0') resetWindow();
      else if (k === ' ') {
        const i = st.activeIndex;
        const c = st.cine[i] || { fps: 15 };
        if (c.playing) {
          stopCine(i);
          st.setCine(i, { playing: false });
        } else if (playCine(i, c.fps || 15)) st.setCine(i, { playing: true });
      } else if (k === 'i' || k === 'I') toggleInvert();
      else if (k === 'r') rotate(90);
      else if (k === 'R') rotate(-90);
      else if (k === 'h' || k === 'H') flip(true);
      else if (k === 'v' || k === 'V') flip(false);
      else if (k === 'f') fitToWindow();
      else if (k === 'Escape') resetView();
      else if (k === 'y' || k === 'Y') {
        const on = !st.syncScroll;
        st.setSyncScroll(on);
        if (on) alignToActive();
      } else if (k === 'o' || k === 'O') st.toggleOverlay();
      else if (k === 't' || k === 'T') st.setDialog('tags');
      else if (k === '?') st.setDialog('help');
      else if (k === 'F2') st.toggleSeriesPanel();
      else if (k === 'Tab') {
        const n = st.mode === 'mpr' ? 3 : LAYOUTS[st.layout].rows * LAYOUTS[st.layout].cols;
        st.setActiveIndex((st.activeIndex + (e.shiftKey ? n - 1 : 1)) % n);
      } else if (toolKeys[k]) st.setActiveTool(toolKeys[k]);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeDialog = () => useStore.getState().setDialog(null);

  return (
    <div className={`app ${panelOpen ? 'panel-open' : ''}`}>
      <UpdateBanner />
      <HeaderBar
        onOpenFiles={() => pick(fileInput, false)}
        onOpenFolder={() => pick(folderInput, false)}
        onAddFiles={() => pick(fileInput, true)}
        onAddFolder={() => pick(folderInput, true)}
        onGoogleDrive={onGoogleDrive}
        onOneDrive={onOneDrive}
        onFind={() => useStore.getState().setDialog('find')}
      />
      <ToolBar />
      <PhaseBar />
      <main className="main">
        <SeriesPanel />
        <div className="stage-col">
        <section className="stage">
          {initError && <div className="fatal">Cornerstone 초기화 실패: {initError}<br />WebGL을 지원하는 최신 브라우저를 사용하세요.</div>}
          {ready && !hasSeries && (
            <Welcome
              onOpenFiles={() => pick(fileInput, false)}
              onOpenFolder={() => pick(folderInput, false)}
              onGoogleDrive={onGoogleDrive}
              onOneDrive={onOneDrive}
              recent={recent}
              onOpenRecent={onOpenRecent}
              onForgetRecent={(id) => (forgetRecent(id), refreshRecent())}
              onForgetAllRecent={() => (forgetAllRecent(), refreshRecent())}
            />
          )}
          {ready && hasSeries && (mode === 'mpr' ? <MprView /> : <ViewportGrid />)}
        </section>
        {ready && hasSeries && dragPads && <DragPads />}
        </div>
      </main>

      <input ref={fileInput} type="file" multiple hidden onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))} />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        webkitdirectory=""
        directory=""
        onChange={(e) => (onFiles(e.target.files), (e.target.value = ''))}
      />

      {dropActive && (
        <div className="drop-overlay">
          <div>
            <Icon name="folder" size={48} />
            <p>DICOM 파일 또는 폴더를 놓으세요</p>
          </div>
        </div>
      )}
      {loading && (
        <div className="loading-bar" role="status">
          <div className="loading-main">
            <span>{loading.label}</span>
            {loading.total > 0 && (
              <>
                <div className="progress">
                  <div style={{ width: `${Math.min(100, (loading.done / loading.total) * 100)}%` }} />
                </div>
                <span className="muted">{loading.detail ? `${Math.floor((loading.done / loading.total) * 100)}%` : `${loading.done}/${loading.total}`}</span>
              </>
            )}
            {loading.onCancel && (
              <button className="btn sm" onClick={loading.onCancel}>
                취소
              </button>
            )}
          </div>
          {loading.detail && <div className="loading-detail muted">{loading.detail}</div>}
        </div>
      )}
      {toast && <div className={`toast ${toast.kind}`}>{toast.message}</div>}

      {dialog === 'tags' && <TagViewer onClose={closeDialog} />}
      {dialog === 'export' && <ExportDialog onClose={closeDialog} />}
      {dialog === 'anonymize' && <AnonymizeDialog onClose={closeDialog} />}
      {dialog === 'settings' && <SettingsDialog onClose={closeDialog} />}
      {dialog === 'layout' && <LayoutConfig onClose={closeDialog} />}
      {dialog === 'onedrive' && <OneDriveBrowser onClose={closeDialog} />}
      {dialog === 'help' && <HelpDialog onClose={closeDialog} />}
      {dialog === 'about' && <AboutDialog onClose={closeDialog} />}
      {dialog === 'find' && (
        <CommandPalette
          commands={buildCommands({
            onOpenFiles: () => pick(fileInput, false),
            onOpenFolder: () => pick(folderInput, false),
            onAddFiles: () => pick(fileInput, true),
            onAddFolder: () => pick(folderInput, true),
            onGoogleDrive,
            onOneDrive,
          })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}

function Welcome({ onOpenFiles, onOpenFolder, onGoogleDrive, onOneDrive,
                   recent = [], onOpenRecent, onForgetRecent, onForgetAllRecent }) {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-logo" />
        <h1>
          DabbaView <em>Web</em>
        </h1>
        <p className="muted">DICOM 파일이나 폴더를 여기로 끌어다 놓거나 아래에서 여세요.</p>
        <div className="welcome-actions">
          <button className="btn primary lg" onClick={onOpenFiles}>
            <Icon name="open" /> 파일 열기
          </button>
          <button className="btn lg" onClick={onOpenFolder}>
            <Icon name="folder" /> 폴더 열기
          </button>
          <button className="btn lg" onClick={onGoogleDrive}>
            <Icon name="gdrive" /> Google Drive
          </button>
          <button className="btn lg" onClick={onOneDrive}>
            <Icon name="onedrive" /> OneDrive
          </button>
        </div>
        {recent.length > 0 && (
          <div className="recent">
            <div className="recent-head">
              <span>최근에 본 검사</span>
              <button className="link" onClick={onForgetAllRecent} title="보관해 둔 영상을 모두 지웁니다">
                모두 지우기
              </button>
            </div>
            {recent.map((e) => (
              <div className="recent-row" key={e.id}>
                <button className="recent-open" onClick={() => onOpenRecent(e)} title="파일을 다시 고르지 않고 바로 엽니다">
                  <Icon name="folder" size={15} />
                  <span className="recent-text">
                    <span className="recent-label">{e.label}</span>
                    <span className="recent-sub">{[e.sub, formatBytes(e.bytes)].filter(Boolean).join('  ·  ')}</span>
                  </span>
                </button>
                <button className="recent-x" onClick={() => onForgetRecent(e.id)} title="이 검사만 지우기" aria-label="지우기">
                  ×
                </button>
              </div>
            ))}
            <p className="muted small recent-note">
              이 기기에만 보관됩니다 · 서버로 올라가지 않습니다
            </p>
          </div>
        )}
        {recent.length === 0 && canRemember() && (
          <p className="muted small">한 번 연 검사는 이 기기에 남아, 다음에 여기서 바로 열 수 있습니다.</p>
        )}
        <p className="app-version-static">{APP_TITLE}</p>
        <p className="muted small">모든 영상 처리는 브라우저 안에서만 이루어지며 서버로 업로드되지 않습니다. 진단용 의료기기가 아닙니다.</p>
      </div>
    </div>
  );
}
