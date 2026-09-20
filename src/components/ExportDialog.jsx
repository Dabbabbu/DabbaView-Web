import { useState } from 'react';
import { Enums } from '@cornerstonejs/core';
import Modal from './Modal';
import { getActiveViewport } from '../cornerstone/actions';
import { saveImage } from '../export/capture';
import { makeVideo, videoExtension, batchExport, supportsWebm, exportFileName, seriesBaseName, downloadBlob } from '../export/video';
import { useStore } from '../store/useStore';
import { instanceMeta } from '../dicom/loader';
import { isAbort } from '../cloud/transfer';

export default function ExportDialog({ onClose }) {
  const [overlay, setOverlay] = useState(true);
  const [annotations, setAnnotations] = useState(true);
  const [format, setFormat] = useState(supportsWebm() ? 'webm' : 'gif');
  const [fps, setFps] = useState(10);
  const [maxSize, setMaxSize] = useState(512);
  const [progress, setProgress] = useState(null); // { label, done, total }
  const [abort, setAbort] = useState(null);
  const series = useStore((s) => s.series);
  const activeKey = useStore((s) => (s.mode === 'mpr' ? s.mprSeriesKey : s.viewportSeries[s.activeIndex]));
  const [picked, setPicked] = useState(() => new Set(activeKey ? [activeKey] : []));
  const vp = getActiveViewport();
  const toast = useStore.getState().showToast;

  // 파일 이름은 시리즈 설명 기준: {SeriesDescription}_{번호}.{확장자}
  const activeSeries = useStore((s) => s.series.find((x) => x.key === activeKey));
  const baseName = () => {
    const m = instanceMeta.get(vp?.getCurrentImageId?.()) || {};
    return seriesBaseName(activeSeries || { seriesDescription: m.seriesDescription, meta: m, modality: m.modality });
  };

  const doImage = async (fmt) => {
    if (!vp) return;
    try {
      // 현재 슬라이스 번호를 붙인다 (한 장짜리 시리즈면 번호 없음)
      const name = exportFileName(baseName(), fmt === 'jpeg' ? 'jpg' : 'png', { index: vp.getCurrentImageIdIndex?.() ?? 0, total: frames });
      await saveImage(vp, fmt, { overlay, annotations, fileName: name });
    } catch (e) {
      toast(`저장 실패: ${e.message}`, 'error');
    }
  };

  const doVideo = async () => {
    if (!vp) return;
    const ac = new AbortController();
    setAbort(ac);
    setProgress({ label: `${format.toUpperCase()} 만드는 중…`, done: 0, total: frames });
    try {
      const blob = await makeVideo(vp, format, {
        fps,
        overlay,
        annotations,
        maxSize,
        signal: ac.signal,
        onProgress: (done, total) => setProgress({ label: `${format.toUpperCase()} 만드는 중…`, done, total }),
      });
      downloadBlob(blob, exportFileName(baseName(), videoExtension(format)));
      toast(`${format.toUpperCase()} 저장 완료`);
    } catch (e) {
      if (isAbort(e)) toast('내보내기를 취소했습니다');
      else {
        console.error(e);
        toast(`내보내기 실패: ${e.message}`, 'error');
      }
    }
    setProgress(null);
    setAbort(null);
  };

  const doBatch = async () => {
    const list = series.filter((s) => picked.has(s.key));
    if (!list.length) return toast('시리즈를 선택하세요', 'error');
    const ac = new AbortController();
    setAbort(ac);
    try {
      const { zip, files, failed } = await batchExport(list, {
        format,
        fps,
        maxSize,
        overlay,
        signal: ac.signal,
        onProgress: ({ seriesDone, seriesTotal, name, frame, frames: fr }) =>
          setProgress({
            label: `일괄 내보내기 ${seriesDone + (frame && fr ? 1 : 0)}/${seriesTotal}${name ? ` — ${name}` : ''}`,
            done: fr ? seriesDone * 100 + (frame / fr) * 100 : seriesDone * 100,
            total: seriesTotal * 100,
          }),
      });
      downloadBlob(zip, `dabbaview_${format}_${list.length}series.zip`);
      toast(`${files.length}개 시리즈 저장 완료${failed.length ? ` (실패 ${failed.length})` : ''}`, failed.length ? 'error' : 'info');
    } catch (e) {
      if (isAbort(e)) toast('일괄 내보내기를 취소했습니다');
      else {
        console.error(e);
        toast(`일괄 내보내기 실패: ${e.message}`, 'error');
      }
    }
    setProgress(null);
    setAbort(null);
  };

  const frames = vp ? (vp.type === Enums.ViewportType.STACK ? vp.getImageIds().length : vp.getNumberOfSlices?.() || 0) : 0;
  const togglePick = (key) => {
    const next = new Set(picked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked(next);
  };
  const busy = !!progress;

  return (
    <Modal title="내보내기" onClose={onClose} wide>
      <div className="form">
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} disabled={busy} /> 오버레이 정보 포함
          </label>
          <label className="check">
            <input type="checkbox" checked={annotations} onChange={(e) => setAnnotations(e.target.checked)} disabled={busy} /> 측정/ROI 포함
          </label>
        </div>
        {overlay && <p className="warn">⚠ 오버레이에는 환자 정보가 들어갑니다. 외부 공유 시 끄세요.</p>}

        <h3>현재 영상</h3>
        {!frames ? (
          <p className="muted">활성 뷰포트에 영상이 없습니다.</p>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={() => doImage('png')}>
              PNG 저장
            </button>
            <button className="btn" disabled={busy} onClick={() => doImage('jpeg')}>
              JPEG 저장
            </button>
          </div>
        )}

        <h3>동영상</h3>
        <div className="row">
          <label>
            포맷&nbsp;
            <select className="input sm" value={format} onChange={(e) => setFormat(e.target.value)} disabled={busy}>
              <option value="gif">GIF</option>
              <option value="webm" disabled={!supportsWebm()}>
                WebM{supportsWebm() ? '' : ' (미지원)'}
              </option>
            </select>
          </label>
          <label>
            FPS&nbsp;
            <input
              className="input sm"
              type="number"
              min="1"
              max="50"
              value={fps}
              disabled={busy}
              onChange={(e) => setFps(Math.max(1, Math.min(50, +e.target.value || 10)))}
            />
          </label>
          <label>
            최대 크기&nbsp;
            <select className="input sm" value={maxSize} onChange={(e) => setMaxSize(+e.target.value)} disabled={busy}>
              <option value={256}>256px</option>
              <option value={512}>512px</option>
              <option value={768}>768px</option>
              <option value={1024}>1024px</option>
            </select>
          </label>
          <button className="btn primary" disabled={busy || !frames} onClick={doVideo}>
            현재 시리즈 저장 ({frames}프레임)
          </button>
        </div>
        <p className="muted small">
          WebM은 브라우저 녹화(MediaRecorder)로 만들기 때문에 재생 시간만큼 걸립니다. GIF는 더 빠르지만 용량이 큽니다. (브라우저에서 MP4 인코딩은
          지원되지 않아 WebM으로 대체합니다.)
        </p>

        <h3>일괄 내보내기</h3>
        {!series.length ? (
          <p className="muted">불러온 시리즈가 없습니다.</p>
        ) : (
          <>
            <div className="row">
              <button className="btn sm" disabled={busy} onClick={() => setPicked(new Set(series.map((s) => s.key)))}>
                전체 선택
              </button>
              <button className="btn sm" disabled={busy} onClick={() => setPicked(new Set())}>
                선택 해제
              </button>
              <span className="muted small">{picked.size}개 선택</span>
            </div>
            <div className="file-list export-list">
              {series.map((s) => (
                <label key={s.key} className={`file-row ${picked.has(s.key) ? 'sel' : ''}`}>
                  <input type="checkbox" checked={picked.has(s.key)} onChange={() => togglePick(s.key)} disabled={busy} />
                  <span className="file-name">
                    {s.seriesNumber ?? '-'} · {s.seriesDescription}
                  </span>
                  <span className="muted small">{s.imageIds.length}장</span>
                </label>
              ))}
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy || !picked.size} onClick={doBatch}>
                선택 시리즈 {format.toUpperCase()}로 저장 (ZIP)
              </button>
            </div>
          </>
        )}

        {progress && (
          <>
            <div className="row">
              <span className="small">{progress.label}</span>
              <div className="spacer" />
              <button className="btn sm" onClick={() => abort?.abort()}>
                취소
              </button>
            </div>
            <div className="progress wide">
              <div style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%` }} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
