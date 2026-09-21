// 터치 제스처 (Stack 칸) — 스마트폰 · 태블릿에서 익숙한 방식
//   두 손가락 벌리기 / 오므리기 = 확대 / 축소 (손가락 가운데 기준)
//   두 손가락을 함께 위아래로 = 슬라이스, 좌우로 = 위상 (위상 영상)
//   세 손가락으로 끌기 = 이동(Pan)
// 한 손가락은 그대로 선택한 도구가 처리한다. 두 손가락 이상은 여기서 가로채 도구로 넘기지 않는다.
import { stepSlice } from './actions';

const PINCH_START = 22; // 손가락 간격이 이만큼(px) 바뀌면 확대 동작으로 정함
const SWIPE_START = 16; // 가운데가 이만큼 움직이면 넘기기 동작으로 정함
const SWIPE_STEP = 22; // 넘기기: 이만큼마다 한 장

const mean = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const spread = (pts) => Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);

export function attachTouchGestures(target, element, getViewport, index) {
  let g = null; // 진행 중인 제스처

  const points = (e) => {
    const r = element.getBoundingClientRect();
    return [...e.touches].map((t) => [t.clientX - r.left, t.clientY - r.top]);
  };
  const begin = (pts) => {
    g = { n: pts.length, start: mean(pts), last: mean(pts), startSpread: pts.length >= 2 ? spread(pts) : 0, lastSpread: pts.length >= 2 ? spread(pts) : 0, mode: pts.length >= 3 ? 'pan' : null, acc: 0 };
  };

  const zoomAbout = (vp, center, ratio) => {
    const camera = vp.getCamera();
    if (!camera.parallelProjection) return;
    const ps = Math.min(5000, Math.max(0.5, camera.parallelScale * ratio));
    const r = ps / camera.parallelScale;
    const c = vp.canvasToWorld(center);
    const fp = camera.focalPoint.map((v, i) => c[i] + (v - c[i]) * r);
    const shift = fp.map((v, i) => v - camera.focalPoint[i]);
    vp.setCamera({ parallelScale: ps, focalPoint: fp, position: camera.position.map((v, i) => v + shift[i]) });
    vp.render();
  };
  const panBy = (vp, from, to) => {
    const a = vp.canvasToWorld(from);
    const b = vp.canvasToWorld(to);
    const d = a.map((v, i) => v - b[i]);
    const camera = vp.getCamera();
    vp.setCamera({ focalPoint: camera.focalPoint.map((v, i) => v + d[i]), position: camera.position.map((v, i) => v + d[i]) });
    vp.render();
  };

  const onStart = (e) => {
    if (e.touches.length < 2) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    begin(points(e)); // 손가락 수가 바뀌면 새로 시작
  };
  const onMove = (e) => {
    if (!g) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    if (e.touches.length < 2) return;
    const pts = points(e);
    if (pts.length !== g.n) return begin(pts);
    const vp = getViewport();
    if (!vp) return;
    const c = mean(pts);
    if (!g.mode) {
      const pinch = Math.abs(spread(pts) - g.startSpread);
      const move = Math.hypot(c[0] - g.start[0], c[1] - g.start[1]);
      if (pinch > PINCH_START && pinch > move) g.mode = 'pinch';
      else if (move > SWIPE_START) g.mode = Math.abs(c[0] - g.start[0]) > Math.abs(c[1] - g.start[1]) ? 'phase' : 'position';
    }
    if (g.mode === 'pinch') {
      const s = spread(pts);
      if (s > 1 && g.lastSpread > 1) zoomAbout(vp, c, Math.min(1.5, Math.max(0.67, g.lastSpread / s)));
      g.lastSpread = s;
    } else if (g.mode === 'pan') {
      panBy(vp, g.last, c);
    } else if (g.mode) {
      g.acc += (g.mode === 'phase' ? c[0] - g.last[0] : c[1] - g.last[1]) / SWIPE_STEP;
      const steps = Math.trunc(g.acc);
      g.acc -= steps;
      for (let k = 0; k < Math.abs(steps); k++) stepSlice(g.mode, Math.sign(steps), index);
    }
    g.last = c;
  };
  const onEnd = (e) => {
    if (!g) return;
    if (e.touches.length >= 2) {
      e.stopImmediatePropagation();
      begin(points(e));
    } else if (e.touches.length === 1) {
      e.stopImmediatePropagation(); // 한 손가락이 남음: 도구가 이어받지 않게 (다 뗄 때까지)
    } else {
      g = null; // 모두 뗌 → 도구에도 알려 끝내게
    }
  };

  const opts = { capture: true, passive: false };
  target.addEventListener('touchstart', onStart, opts);
  window.addEventListener('touchmove', onMove, opts);
  window.addEventListener('touchend', onEnd, true);
  window.addEventListener('touchcancel', onEnd, true);
  return () => {
    target.removeEventListener('touchstart', onStart, opts);
    window.removeEventListener('touchmove', onMove, opts);
    window.removeEventListener('touchend', onEnd, true);
    window.removeEventListener('touchcancel', onEnd, true);
  };
}
