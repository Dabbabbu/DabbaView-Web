import { useEffect, useRef, useState } from 'react';
import { Enums } from '@cornerstonejs/core';
import { utilities as toolUtils } from '@cornerstonejs/tools';
import { getEngine } from '../cornerstone/init';
import { getStackGroup } from '../cornerstone/tools';
import { stackViewportId, ensureStandardOrientation, renderedViewports } from '../cornerstone/actions';
import { buildOverlay } from '../cornerstone/overlay';
import { propagateScroll, notifyViewportChanged, jumpOthersToWorld } from '../cornerstone/sync';
import ViewportLines from './ViewportLines';
import { getPhases } from '../dicom/phases';
import { valueAtWorld, formatLps } from '../cornerstone/planes';
import { instanceMeta } from '../dicom/loader';
import { useStore, getSeries } from '../store/useStore';
import ViewportOverlay from './ViewportOverlay';

const RENDER_EVENTS = [
  Enums.Events.IMAGE_RENDERED,
  Enums.Events.VOI_MODIFIED,
  Enums.Events.CAMERA_MODIFIED,
  Enums.Events.STACK_NEW_IMAGE,
];

export default function StackViewport({ index }) {
  const elRef = useRef(null);
  const [overlay, setOverlay] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const seriesKey = useStore((s) => s.viewportSeries[index]);
  const active = useStore((s) => s.activeIndex === index);
  const selected = useStore((s) => s.selected.includes(index) && s.selected.length > 1);
  const showOverlay = useStore((s) => s.showOverlay);
  const series = useStore((s) => s.series.find((x) => x.key === seriesKey));
  const viewportId = stackViewportId(index);

  // 뷰포트 활성화/해제
  useEffect(() => {
    const engine = getEngine();
    const element = elRef.current;
    engine.enableElement({
      viewportId,
      type: Enums.ViewportType.STACK,
      element,
      defaultOptions: { background: [0, 0, 0] },
    });
    const group = getStackGroup();
    group.addViewport(viewportId, engine.id);

    const onRendered = () => renderedViewports.add(viewportId);
    element.addEventListener(Enums.Events.IMAGE_RENDERED, onRendered);

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vp = engine.getViewport(viewportId);
        if (vp && vp.getImageIds().length) setOverlay(buildOverlay(vp));
      });
    };
    RENDER_EVENTS.forEach((e) => element.addEventListener(e, update));
    // 슬라이스가 바뀌면 함께 선택한 칸(또는 Sync Scroll ON이면 전체)으로 전파
    const onNewImage = (e) => {
      propagateScroll(viewportId, e.detail?.imageIdIndex ?? 0);
      notifyViewportChanged();
    };
    const onCamera = () => notifyViewportChanged();
    element.addEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
    element.addEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);

    const ro = new ResizeObserver(() => {
      engine.resize(true, true);
    });
    ro.observe(element);
    const noMenu = (e) => e.preventDefault();
    element.addEventListener('contextmenu', noMenu);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      RENDER_EVENTS.forEach((e) => element.removeEventListener(e, update));
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, onRendered);
      element.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
      renderedViewports.delete(viewportId);
      element.removeEventListener('contextmenu', noMenu);
      try {
        toolUtils.cine.stopClip(element);
      } catch {
        /* noop */
      }
      group.removeViewports(engine.id, viewportId);
      engine.disableElement(viewportId);
    };
  }, [viewportId]);

  // 시리즈 표시 (새 파일이 합쳐져 imageIds가 바뀌어도 반영)
  const phase = useStore((s) => s.phaseByViewport[index] ?? null);
  const imageIdsKey = series ? series.imageIds.length : 0;
  useEffect(() => {
    const engine = getEngine();
    const vp = engine.getViewport(viewportId);
    if (!vp) return;
    const s = getSeries(seriesKey);
    try {
      toolUtils.cine.stopClip(vp.element);
    } catch {
      /* noop */
    }
    useStore.getState().setCine(index, { playing: false });
    renderedViewports.delete(viewportId); // 새 시리즈 → 카메라 다시 잡아야 함
    if (!s) {
      setOverlay(null);
      return;
    }
    const phases = phase !== null ? getPhases(s) : null;
    vp.setStack(phases?.[phase] || s.imageIds, 0)
      .then(() => {
        vp.resetCamera();
        ensureStandardOrientation(vp);
        vp.render();
        setOverlay(buildOverlay(vp));
        // 레이아웃 전환 직후 캔버스 크기가 확정된 뒤 한 번 더 그림
        requestAnimationFrame(() => {
          if (engine.getViewport(viewportId) === vp) {
            vp.resetCamera();
            ensureStandardOrientation(vp);
            vp.render();
          }
        });
      })
      .catch((e) => {
        console.error(e);
        useStore.getState().showToast(`영상 표시 실패: ${e?.message || e?.error?.message || e}`, 'error');
      });
  }, [seriesKey, imageIdsKey, viewportId, index, phase]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const key = e.dataTransfer.getData('application/x-dabbaview-series');
    if (key) {
      e.stopPropagation();
      useStore.getState().assignSeries(index, key);
    }
  };

  return (
    <div
      className={`viewport-cell ${active ? 'active' : ''} ${selected ? 'selected' : ''} ${dragOver ? 'drag-over' : ''}`}
      onPointerDown={(e) => {
        const st = useStore.getState();
        // 3D 커서: 클릭한 지점의 환자 좌표(L/P/S)와 픽셀 값
        if (st.activeTool === 'Cursor3D' && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          const vp = getEngine()?.getViewport(viewportId);
          if (vp?.getImageIds?.().length) {
            const rect = elRef.current.getBoundingClientRect();
            const world = vp.canvasToWorld([e.clientX - rect.left, e.clientY - rect.top]);
            const meta = instanceMeta.get(vp.getCurrentImageId()) || {};
            st.setActiveIndex(index);
            st.setCursor3d({
              world,
              frameOfReferenceUID: meta.frameOfReferenceUID || '',
              viewportId,
              text: formatLps(world),
              value: valueAtWorld(vp, world),
              modality: meta.modality || '',
            });
            const matched = jumpOthersToWorld(world, meta.frameOfReferenceUID || '', viewportId);
            notifyViewportChanged();
            if (!matched && st.viewportSeries.filter(Boolean).length > 1) st.showToast('다른 칸에 대응되는 좌표가 없습니다');
            return;
          }
        }
        // Ctrl(⌘)+클릭: 하나씩 추가/제외, Shift+클릭: 활성 칸부터 여기까지
        if (e.ctrlKey || e.metaKey) st.toggleSelected(index);
        else if (e.shiftKey) st.selectRange(index);
        else st.setActiveIndex(index);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-dabbaview-series')) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div ref={elRef} className="viewport-element" />
      {!series && <div className="viewport-empty">시리즈를 끌어다 놓거나 선택하세요</div>}
      {series && showOverlay && overlay && <ViewportOverlay data={overlay} />}
      {series && <ViewportLines index={index} />}
    </div>
  );
}
