import { useEffect, useRef, useState } from 'react';
import { Enums, volumeLoader, setVolumesForViewports, cache } from '@cornerstonejs/core';
import { getEngine } from '../cornerstone/init';
import { getMprGroup } from '../cornerstone/tools';
import { MPR_VIEWPORT_IDS } from '../cornerstone/actions';
import { buildOverlay } from '../cornerstone/overlay';
import { useStore, getSeries } from '../store/useStore';
import ViewportOverlay from './ViewportOverlay';

const PLANES = [
  { id: MPR_VIEWPORT_IDS[0], label: 'Axial', orientation: Enums.OrientationAxis.AXIAL },
  { id: MPR_VIEWPORT_IDS[1], label: 'Sagittal', orientation: Enums.OrientationAxis.SAGITTAL },
  { id: MPR_VIEWPORT_IDS[2], label: 'Coronal', orientation: Enums.OrientationAxis.CORONAL },
];

const EVENTS = [Enums.Events.IMAGE_RENDERED, Enums.Events.VOI_MODIFIED, Enums.Events.CAMERA_MODIFIED];

export default function MprView() {
  const refs = [useRef(null), useRef(null), useRef(null)];
  const seriesKey = useStore((s) => s.mprSeriesKey);
  const activeIndex = useStore((s) => s.activeIndex);
  const showOverlay = useStore((s) => s.showOverlay);
  const [overlays, setOverlays] = useState([null, null, null]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const engine = getEngine();
    const group = getMprGroup();
    const series = getSeries(seriesKey);
    if (!series) return undefined;
    let cancelled = false;

    engine.setViewports(
      PLANES.map((p, i) => ({
        viewportId: p.id,
        type: Enums.ViewportType.ORTHOGRAPHIC,
        element: refs[i].current,
        defaultOptions: { orientation: p.orientation, background: [0, 0, 0] },
      })),
    );
    PLANES.forEach((p) => group.addViewport(p.id, engine.id));

    const cleanups = PLANES.map((p, i) => {
      const el = refs[i].current;
      let raf = 0;
      const update = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const vp = engine.getViewport(p.id);
          if (!vp) return;
          const data = buildOverlay(vp, { planeLabel: p.label, seriesMeta: series.meta });
          setOverlays((prev) => {
            const next = [...prev];
            next[i] = data;
            return next;
          });
        });
      };
      EVENTS.forEach((e) => el.addEventListener(e, update));
      const noMenu = (e) => e.preventDefault();
      el.addEventListener('contextmenu', noMenu);
      return () => {
        cancelAnimationFrame(raf);
        EVENTS.forEach((e) => el.removeEventListener(e, update));
        el.removeEventListener('contextmenu', noMenu);
      };
    });

    const ro = new ResizeObserver(() => engine.resize(true, true));
    refs.forEach((r) => ro.observe(r.current));

    const volumeId = `cornerstoneStreamingImageVolume:${series.key}`;
    (async () => {
      try {
        setStatus('볼륨 생성 중…');
        const volume = cache.getVolume(volumeId) || (await volumeLoader.createAndCacheVolume(volumeId, { imageIds: series.imageIds }));
        if (cancelled) return;
        volume.load?.();
        await setVolumesForViewports(engine, [{ volumeId }], MPR_VIEWPORT_IDS);
        if (cancelled) return;
        engine.renderViewports(MPR_VIEWPORT_IDS);
        setStatus('');
      } catch (e) {
        console.error(e);
        setStatus(`MPR 실패: ${e?.message || e}`);
      }
    })();

    return () => {
      cancelled = true;
      ro.disconnect();
      cleanups.forEach((c) => c());
      group.removeViewports(engine.id);
      PLANES.forEach((p) => engine.disableElement(p.id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesKey]);

  return (
    <div className="mpr-grid">
      {PLANES.map((p, i) => (
        <div
          key={p.id}
          className={`viewport-cell ${activeIndex === i ? 'active' : ''}`}
          onPointerDown={() => useStore.getState().setActiveIndex(i)}
        >
          <div ref={refs[i]} className="viewport-element" />
          <div className="ov-plane">{p.label}</div>
          {showOverlay && overlays[i] && <ViewportOverlay data={overlays[i]} />}
        </div>
      ))}
      {status && <div className="mpr-status">{status}</div>}
    </div>
  );
}
