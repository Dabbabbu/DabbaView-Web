import { useEffect, useRef, useState } from 'react';
import { Enums } from '@cornerstonejs/core';
import { utilities as toolUtils } from '@cornerstonejs/tools';
import { getEngine } from '../cornerstone/init';
import { getStackGroup } from '../cornerstone/tools';
import { stackViewportId } from '../cornerstone/actions';
import { buildOverlay } from '../cornerstone/overlay';
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

    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const vp = engine.getViewport(viewportId);
        if (vp && vp.getImageIds().length) setOverlay(buildOverlay(vp));
      });
    };
    RENDER_EVENTS.forEach((e) => element.addEventListener(e, update));

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
    if (!s) {
      setOverlay(null);
      return;
    }
    vp.setStack(s.imageIds, 0)
      .then(() => {
        vp.resetCamera();
        vp.render();
        setOverlay(buildOverlay(vp));
        // 레이아웃 전환 직후 캔버스 크기가 확정된 뒤 한 번 더 그림
        requestAnimationFrame(() => {
          if (engine.getViewport(viewportId) === vp) {
            vp.resetCamera();
            vp.render();
          }
        });
      })
      .catch((e) => {
        console.error(e);
        useStore.getState().showToast(`영상 표시 실패: ${e?.message || e?.error?.message || e}`, 'error');
      });
  }, [seriesKey, imageIdsKey, viewportId, index]);

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
      className={`viewport-cell ${active ? 'active' : ''} ${dragOver ? 'drag-over' : ''}`}
      onPointerDown={() => useStore.getState().setActiveIndex(index)}
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
    </div>
  );
}
