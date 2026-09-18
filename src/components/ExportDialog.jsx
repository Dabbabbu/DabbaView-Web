import { useState } from 'react';
import { Enums } from '@cornerstonejs/core';
import Modal from './Modal';
import { getActiveViewport } from '../cornerstone/actions';
import { saveImage, exportGif } from '../export/capture';
import { useStore } from '../store/useStore';
import { instanceMeta } from '../dicom/loader';

export default function ExportDialog({ onClose }) {
  const [overlay, setOverlay] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [fps, setFps] = useState(10);
  const [maxSize, setMaxSize] = useState(512);
  const [progress, setProgress] = useState(null);
  const vp = getActiveViewport();
  const toast = useStore.getState().showToast;

  const baseName = () => {
    const m = instanceMeta.get(vp?.getCurrentImageId?.()) || {};
    return [m.modality, m.seriesNumber, (m.seriesDescription || '').replace(/[^\w가-힣-]+/g, '_')].filter(Boolean).join('_') || 'dabbaview';
  };

  const doImage = async (format) => {
    if (!vp) return;
    try {
      await saveImage(vp, format, { overlay, annotations, baseName: baseName() + (vp.getCurrentImageIdIndex ? `_${vp.getCurrentImageIdIndex() + 1}` : '') });
    } catch (e) {
      toast(`저장 실패: ${e.message}`, 'error');
    }
  };

  const doGif = async () => {
    if (!vp) return;
    setProgress({ done: 0, total: 1 });
    try {
      await exportGif(vp, { fps, overlay, maxSize, baseName: baseName(), onProgress: (done, total) => setProgress({ done, total }) });
      toast('GIF 저장 완료');
    } catch (e) {
      console.error(e);
      toast(`GIF 실패: ${e.message}`, 'error');
    }
    setProgress(null);
  };

  const frames = vp ? (vp.type === Enums.ViewportType.STACK ? vp.getImageIds().length : vp.getNumberOfSlices?.()) : 0;

  return (
    <Modal title="내보내기" onClose={onClose}>
      {!vp || !frames ? (
        <p className="muted">활성 뷰포트에 영상이 없습니다.</p>
      ) : (
        <div className="form">
          <label className="check">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> 오버레이 정보 포함
          </label>
          <label className="check">
            <input type="checkbox" checked={annotations} onChange={(e) => setAnnotations(e.target.checked)} /> 측정/ROI 포함
          </label>
          {overlay && <p className="warn">⚠ 오버레이에는 환자 정보가 들어갑니다. 외부 공유 시 끄세요.</p>}

          <h3>현재 영상</h3>
          <div className="row">
            <button className="btn primary" onClick={() => doImage('png')}>
              PNG 저장
            </button>
            <button className="btn" onClick={() => doImage('jpeg')}>
              JPEG 저장
            </button>
          </div>

          <h3>동영상 (GIF) — {frames}프레임</h3>
          <div className="row">
            <label>
              FPS&nbsp;
              <input className="input sm" type="number" min="1" max="50" value={fps} onChange={(e) => setFps(Math.max(1, Math.min(50, +e.target.value || 10)))} />
            </label>
            <label>
              최대 크기&nbsp;
              <select className="input sm" value={maxSize} onChange={(e) => setMaxSize(+e.target.value)}>
                <option value={256}>256px</option>
                <option value={512}>512px</option>
                <option value={768}>768px</option>
                <option value={1024}>1024px</option>
              </select>
            </label>
          </div>
          <div className="row">
            <button className="btn primary" disabled={!!progress} onClick={doGif}>
              {progress ? `만드는 중… ${progress.done}/${progress.total}` : 'GIF 저장'}
            </button>
          </div>
          {progress && (
            <div className="progress">
              <div style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
