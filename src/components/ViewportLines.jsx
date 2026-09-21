import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { getEngine, stackViewportId } from '../cornerstone/actions';
import { viewportPlane, planeIntersectionOnCanvas, slicePlaneOf, sameFrame } from '../cornerstone/planes';
import { VIEWPORT_CHANGED } from '../cornerstone/sync';

// 칸마다 다른 색 (데스크톱 Reference Line과 같은 방식)
const COLORS = ['#59c3ff', '#ff9f43', '#9d7bff', '#4cd08a'];
const MAX_COVERAGE_LINES = 28;

/** Crosslink(전체 스캔 점선 + 현재 슬라이스 노란 실선), Reference Line(현재 슬라이스만), 3D 커서 */
export default function ViewportLines({ index }) {
  const crosslink = useStore((s) => s.crosslink);
  const referenceLines = useStore((s) => s.referenceLines);
  const cursor3d = useStore((s) => s.cursor3d);
  const viewportSeries = useStore((s) => s.viewportSeries);
  const layout = useStore((s) => s.layout);
  const [draw, setDraw] = useState(null);

  useEffect(() => {
    const viewportId = stackViewportId(index);
    let raf = 0;
    let timer = 0;
    // 탭이 숨겨져 있으면 rAF가 멈추므로 타이머로 계산한다
    const schedule = (fn) => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      if (document.hidden) timer = setTimeout(fn, 16);
      else raf = requestAnimationFrame(fn);
    };
    const compute = () => {
      schedule(() => {
        const engine = getEngine();
        const vp = engine?.getViewport(viewportId);
        if (!vp?.getImageIds?.().length) return setDraw(null);
        const me = viewportPlane(vp);
        if (!me) return setDraw(null);

        const lines = [];
        if (crosslink || referenceLines) {
          for (let j = 0; j < viewportSeries.length; j++) {
            if (j === index || !viewportSeries[j]) continue;
            const other = engine.getViewport(stackViewportId(j));
            const ids = other?.getImageIds?.() || [];
            if (!ids.length) continue;
            const current = other.getCurrentImageIdIndex();
            const currentPlane = slicePlaneOf(ids[current]);
            if (!currentPlane || !sameFrame(me, currentPlane)) continue;
            const color = COLORS[j % COLORS.length];

            if (crosslink) {
              // 전체 스캔 범위를 점선으로 (너무 많으면 균등하게 솎아냄)
              const step = Math.max(1, Math.ceil(ids.length / MAX_COVERAGE_LINES));
              for (let k = 0; k < ids.length; k += step) {
                if (k === current) continue;
                const plane = slicePlaneOf(ids[k]);
                const seg = plane && planeIntersectionOnCanvas(vp, me, plane);
                if (seg) lines.push({ seg, color, dashed: true, key: `c${j}-${k}` });
              }
            }
            // 현재 슬라이스: 노란 실선
            const seg = planeIntersectionOnCanvas(vp, me, currentPlane);
            if (seg) lines.push({ seg, color: '#ffd23f', dashed: false, key: `n${j}`, label: `S${j + 1}:${current + 1}` });
          }
        }

        // 3D 커서
        let cursor = null;
        if (cursor3d) {
          const inFrame = sameFrame(me, { frameOfReferenceUID: cursor3d.frameOfReferenceUID, studyInstanceUID: cursor3d.studyInstanceUID });
          if (inFrame) {
            const pt = vp.worldToCanvas(cursor3d.world);
            if (pt && Number.isFinite(pt[0])) cursor = { pt, own: cursor3d.viewportId === viewportId };
          } else if (cursor3d.viewportId !== viewportId) {
            cursor = { missing: true };
          }
        }
        setDraw({ lines, cursor, size: [vp.element.clientWidth, vp.element.clientHeight] });
      });
    };

    compute();
    const handler = () => compute();
    window.addEventListener(VIEWPORT_CHANGED, handler);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener(VIEWPORT_CHANGED, handler);
    };
  }, [index, crosslink, referenceLines, cursor3d, viewportSeries, layout]);

  if (!draw) return null;
  const [w, h] = draw.size;
  return (
    <svg className="viewport-lines" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {draw.lines.map((l) => (
        <line
          key={l.key}
          x1={l.seg[0][0]}
          y1={l.seg[0][1]}
          x2={l.seg[1][0]}
          y2={l.seg[1][1]}
          stroke={l.color}
          strokeWidth={l.dashed ? 1 : 1.6}
          strokeDasharray={l.dashed ? '3 5' : undefined}
          opacity={l.dashed ? 0.55 : 0.95}
        />
      ))}
      {draw.cursor?.pt && (
        <g stroke="#4cd08a" strokeWidth="1.5" fill="none">
          <line x1={draw.cursor.pt[0] - 12} y1={draw.cursor.pt[1]} x2={draw.cursor.pt[0] - 4} y2={draw.cursor.pt[1]} />
          <line x1={draw.cursor.pt[0] + 4} y1={draw.cursor.pt[1]} x2={draw.cursor.pt[0] + 12} y2={draw.cursor.pt[1]} />
          <line x1={draw.cursor.pt[0]} y1={draw.cursor.pt[1] - 12} x2={draw.cursor.pt[0]} y2={draw.cursor.pt[1] - 4} />
          <line x1={draw.cursor.pt[0]} y1={draw.cursor.pt[1] + 4} x2={draw.cursor.pt[0]} y2={draw.cursor.pt[1] + 12} />
          <circle cx={draw.cursor.pt[0]} cy={draw.cursor.pt[1]} r="14" opacity="0.5" />
        </g>
      )}
      {draw.cursor?.missing && (
        <text x={w / 2} y={h - 26} textAnchor="middle" fill="#ff9f43" fontSize="12">
          대응 좌표 없음
        </text>
      )}
    </svg>
  );
}
