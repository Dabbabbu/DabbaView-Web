import { useEffect, useRef, useState } from 'react';
import { Enums } from '@cornerstonejs/core';
import { utilities as toolUtils } from '@cornerstonejs/tools';
import { getEngine } from '../cornerstone/init';
import { getStackGroup } from '../cornerstone/tools';
import {
  stackViewportId,
  ensureStandardOrientation,
  renderedViewports,
  stepSlice,
  takePendingStart,
  chordGain,
  CHORD_PX_PER_STEP,
} from '../cornerstone/actions';
import { buildOverlay } from '../cornerstone/overlay';
import { propagateScroll, notifyViewportChanged, jumpOthersToWorld } from '../cornerstone/sync';
import ViewportLines from './ViewportLines';
import { attachTouchGestures } from '../cornerstone/touchGestures';
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

    // ── 좌+우 버튼을 함께 누르고 끌기: 위아래 = 슬라이스, 좌우 = 위상 (빨리 끌수록 많이) ──
    // 먼저 누른 버튼의 동작(W/L · 측정)은 그 순간 멈추도록 이벤트를 가로챈다
    const cell = element.parentElement;
    let chord = null;
    const BOTH = 3; // buttons: 1 = 왼쪽, 2 = 오른쪽
    const onChordDown = (e) => {
      if ((e.buttons & BOTH) !== BOTH) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      chord = { x: e.clientX, y: e.clientY, t: performance.now(), v: 0, h: 0 };
      useStore.getState().setActiveIndex(index);
      element.style.cursor = 'ns-resize';
    };
    const onChordMove = (e) => {
      if (!chord) return;
      e.stopImmediatePropagation();
      if ((e.buttons & BOTH) === 0) return;
      const dx = e.clientX - chord.x;
      const dy = e.clientY - chord.y;
      const now = performance.now();
      const dt = Math.max(1, now - chord.t);
      Object.assign(chord, { x: e.clientX, y: e.clientY, t: now });
      const horizontal = Math.abs(dx) > Math.abs(dy);
      const d = horizontal ? dx : dy;
      if (!d) return;
      const amount = (d / CHORD_PX_PER_STEP) * chordGain(Math.abs(d) / dt);
      const key = horizontal ? 'h' : 'v';
      chord[key] += amount;
      const steps = Math.trunc(chord[key]);
      if (!steps) return;
      chord[key] -= steps;
      for (let k = 0; k < Math.min(Math.abs(steps), 200); k++) stepSlice(horizontal ? 'phase' : 'position', Math.sign(steps), index);
    };
    const onChordUp = (e) => {
      if (!chord) return;
      if ((e.buttons & BOTH) !== 0) {
        e.stopImmediatePropagation(); // 한쪽만 뗌 → 남은 버튼으로 계속
        return;
      }
      chord = null; // 마지막 버튼: 도구에도 알려 드래그를 끝내게 함
      element.style.cursor = '';
    };
    const detachTouch = attachTouchGestures(cell, element, () => engine.getViewport(viewportId), index);
    cell.addEventListener('mousedown', onChordDown, true);
    window.addEventListener('mousemove', onChordMove, true);
    window.addEventListener('mouseup', onChordUp, true);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      RENDER_EVENTS.forEach((e) => element.removeEventListener(e, update));
      element.removeEventListener(Enums.Events.STACK_NEW_IMAGE, onNewImage);
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, onRendered);
      element.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
      renderedViewports.delete(viewportId);
      element.removeEventListener('contextmenu', noMenu);
      detachTouch();
      cell.removeEventListener('mousedown', onChordDown, true);
      window.removeEventListener('mousemove', onChordMove, true);
      window.removeEventListener('mouseup', onChordUp, true);
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
  const shownSeries = useRef(null);
  useEffect(() => {
    const engine = getEngine();
    const vp = engine.getViewport(viewportId);
    if (!vp) return;
    const s = getSeries(seriesKey);
    // 같은 시리즈에서 위상만 바꿈(←→ 등): 확대·이동·W/L은 그대로
    const sameSeries = !!s && shownSeries.current === seriesKey && renderedViewports.has(viewportId);
    const keep = sameSeries ? { camera: vp.getCamera(), props: vp.getProperties() } : null;
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
    shownSeries.current = seriesKey;
    const start = takePendingStart(viewportId) ?? 0;
    vp.setStack(phases?.[phase] || s.imageIds, start)
      .then(() => {
        if (keep) {
          vp.setCamera(keep.camera);
          vp.setProperties(keep.props);
          vp.render();
          renderedViewports.add(viewportId);
          setOverlay(buildOverlay(vp));
          return;
        }
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
