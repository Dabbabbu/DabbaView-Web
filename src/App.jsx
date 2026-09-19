import { useEffect, useRef, useState } from 'react';
import { initCornerstone } from './cornerstone/init';
import { getStackGroup, getMprGroup, setPrimaryTool } from './cornerstone/tools';
import {
  WINDOW_PRESETS,
  applyWindow,
  resetWindow,
  toggleInvert,
  rotate,
  flip,
  resetView,
  fitToWindow,
  scrollSlice,
  playCine,
  stopCine,
} from './cornerstone/actions';
import { useStore, LAYOUTS } from './store/useStore';
import { filesFromDataTransfer, filesFromInput } from './dicom/loader';
import { ingestFiles } from './dicom/ingest';
import { pickFromGoogleDrive } from './cloud/googleDrive';
import { isGoogleConfigured, isOneDriveConfigured } from './cloud/config';
import { isAbort } from './cloud/transfer';
import { HeaderBar, ToolBar } from './components/Toolbar';
import SeriesPanel from './components/SeriesPanel';
import ViewportGrid from './components/ViewportGrid';
import MprView from './components/MprView';
import TagViewer from './components/TagViewer';
import ExportDialog from './components/ExportDialog';
import AnonymizeDialog from './components/AnonymizeDialog';
import SettingsDialog from './components/SettingsDialog';
import OneDriveBrowser from './components/OneDriveBrowser';
import HelpDialog from './components/HelpDialog';
import AboutDialog from './components/AboutDialog';
import { APP_TITLE } from './version';
import { Icon } from './components/Icons';

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
    setPrimaryTool(getStackGroup(), tool === 'Crosshairs' ? 'WindowLevel' : tool);
    setPrimaryTool(getMprGroup(), tool);
  }, [ready, activeTool, mode]);

  // ── 파일 열기 ──
  const onFiles = (list) => ingestFiles(filesFromInput(list), '파일');
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
      ingestFiles(files, '파일');
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
      if (e.target.closest?.('input, textarea, select')) return;
      const st = useStore.getState();
      if (st.dialog) return;
      const k = e.key;
      const toolKeys = { w: 'WindowLevel', p: 'Pan', z: 'Zoom', s: 'Scroll', l: 'Length', a: 'Angle', b: 'Rectangle', e: 'Ellipse', d: 'Freehand' };
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === 'ArrowUp' || k === 'PageUp') scrollSlice(k === 'PageUp' ? -5 : -1);
      else if (k === 'ArrowDown' || k === 'PageDown') scrollSlice(k === 'PageDown' ? 5 : 1);
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
      else if (k === 'o' || k === 'O') st.toggleOverlay();
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
      <HeaderBar
        onOpenFiles={() => fileInput.current?.click()}
        onOpenFolder={() => folderInput.current?.click()}
        onGoogleDrive={onGoogleDrive}
        onOneDrive={onOneDrive}
      />
      <ToolBar />
      <main className="main">
        <SeriesPanel />
        <section className="stage">
          {initError && <div className="fatal">Cornerstone 초기화 실패: {initError}<br />WebGL을 지원하는 최신 브라우저를 사용하세요.</div>}
          {ready && !hasSeries && (
            <Welcome
              onOpenFiles={() => fileInput.current?.click()}
              onOpenFolder={() => folderInput.current?.click()}
              onGoogleDrive={onGoogleDrive}
              onOneDrive={onOneDrive}
            />
          )}
          {ready && hasSeries && (mode === 'mpr' ? <MprView /> : <ViewportGrid />)}
        </section>
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
      {dialog === 'onedrive' && <OneDriveBrowser onClose={closeDialog} />}
      {dialog === 'help' && <HelpDialog onClose={closeDialog} />}
      {dialog === 'about' && <AboutDialog onClose={closeDialog} />}
    </div>
  );
}

function Welcome({ onOpenFiles, onOpenFolder, onGoogleDrive, onOneDrive }) {
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
        <p className="app-version-static">{APP_TITLE}</p>
        <p className="muted small">모든 영상 처리는 브라우저 안에서만 이루어지며 서버로 업로드되지 않습니다. 진단용 의료기기가 아닙니다.</p>
      </div>
    </div>
  );
}
