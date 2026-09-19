import { getEnabledElement } from '@cornerstonejs/core';
import { ZoomTool } from '@cornerstonejs/tools';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * 두 손가락 핀치 줌: 손가락 간격 비율만큼 확대/축소(손가락을 따라가는 자연스러운 배율),
 * 두 손가락 가운데를 기준으로 확대하고, 두 손가락을 함께 움직이면 이동(Pan).
 * (기본 ZoomTool의 핀치는 이동 거리 × 상수라서 과하게 확대됨)
 */
export default class PinchZoomTool extends ZoomTool {
  static toolName = 'PinchZoom';

  constructor(toolProps = {}) {
    super(toolProps);
    this.configuration.pinchToZoom = true;
    this.configuration.pan = true;
    this.touchDragCallback = this._pinchCallback.bind(this);
  }

  _pinchCallback(evt) {
    const { currentPointsList, deltaDistance, currentPoints, element } = evt.detail;
    if (currentPointsList?.length > 1 && deltaDistance) {
      const { viewport } = getEnabledElement(element);
      const camera = viewport.getCamera();
      const cur = dist(currentPointsList[0].canvas, currentPointsList[1].canvas);
      const prev = cur - deltaDistance.canvas;
      if (camera.parallelProjection && cur > 1 && prev > 1) {
        const ratio = Math.min(1.5, Math.max(0.67, prev / cur)); // 한 이벤트당 급변 방지
        const ps = Math.min(5000, Math.max(0.5, camera.parallelScale * ratio));
        const r = ps / camera.parallelScale;
        const c = currentPoints.world; // 두 손가락 중심 (world)
        const scaleAbout = (p) => [c[0] + (p[0] - c[0]) * r, c[1] + (p[1] - c[1]) * r, c[2] + (p[2] - c[2]) * r];
        // 중심을 고정한 채 확대: focalPoint/position을 같은 평행이동량만큼 옮김
        const fp = scaleAbout(camera.focalPoint);
        const shift = [fp[0] - camera.focalPoint[0], fp[1] - camera.focalPoint[1], fp[2] - camera.focalPoint[2]];
        const pos = camera.position.map((v, i) => v + shift[i]);
        viewport.setCamera({ parallelScale: ps, focalPoint: fp, position: pos });
        viewport.render();
      }
    }
    if (this.configuration.pan) this._panCallback(evt);
  }
}
