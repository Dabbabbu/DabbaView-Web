import { getEnabledElement } from '@cornerstonejs/core';
import { StackScrollTool } from '@cornerstonejs/tools';
import { stepSlice } from './actions';
import { getPhases } from '../dicom/phases';
import { useStore, getSeries } from '../store/useStore';

const GESTURE_GAP_MS = 250;   // 이만큼 쉬었다 다시 끌면 새 동작으로 본다 (방향을 다시 정함)
const AXIS_START = 6;         // 이만큼(px) 움직인 뒤에 위아래 · 좌우 중 한쪽으로 정함

/**
 * Scroll 도구 — cine(위상이 있는 시리즈)에서는 슬라이스와 위상을 따로 넘긴다
 *
 * 기본 StackScrollTool은 스택을 한 줄로 넘겨서, 330장짜리 cine을 끌면 위상 30개를 다 지나야
 * 다음 슬라이스로 간다. 여기서는
 *   위아래로 끌기 · 휠 = 슬라이스 위치 (위상은 그대로)
 *   좌우로 끌기        = 위상 (위치는 그대로)
 * 로 나눈다 — 두 손가락 넘기기 · 방향키 · 오른쪽/아래 막대와 같은 규칙.
 * 위상이 없는 시리즈와 MPR은 원래 도구 그대로 동작한다. 한 번 끌 때는 처음 정한 방향만 따른다.
 */
export default class CineScrollTool extends StackScrollTool {
  constructor(toolProps, defaultToolProps) {
    super(toolProps, defaultToolProps);
    this._cine = { at: 0, axis: null, x: 0, y: 0, moved: [0, 0] };
  }

  /** 이 칸이 cine이면 { index, phases, positions }, 아니면 null */
  _cineOf(viewport) {
    const at = /^stack-(\d+)$/.exec(viewport?.id || '');
    if (!at) return null;
    const index = +at[1];
    const st = useStore.getState();
    if (st.mode !== 'stack') return null;
    const phases = getPhases(getSeries(st.viewportSeries[index]));
    if (!phases || phases.length < 2) return null;
    return { index, phases: phases.length, positions: Math.max(...phases.map((ids) => ids.length)) };
  }

  mouseWheelCallback(evt) {
    const { viewport } = getEnabledElement(evt.detail.element);
    const cine = this._cineOf(viewport);
    if (!cine) return super.mouseWheelCallback(evt);
    const dir = evt.detail.wheel.direction * (this.configuration.invert ? -1 : 1);
    if (dir) stepSlice('position', Math.sign(dir), cine.index);
    return undefined;
  }

  _dragCallback(evt) {
    const { viewport } = getEnabledElement(evt.detail.element);
    const cine = this._cineOf(viewport);
    if (!cine) return super._dragCallback(evt);
    const [dx, dy] = evt.detail.deltaPoints.canvas;
    const g = this._cine;
    const now = performance.now();
    if (now - g.at > GESTURE_GAP_MS) Object.assign(g, { axis: null, x: 0, y: 0, moved: [0, 0] });
    g.at = now;
    if (!g.axis) {
      g.moved[0] += dx;
      g.moved[1] += dy;
      if (Math.hypot(g.moved[0], g.moved[1]) < AXIS_START) return undefined;
      g.axis = Math.abs(g.moved[0]) > Math.abs(g.moved[1]) ? 'phase' : 'position';
    }
    const el = viewport.element;
    if (g.axis === 'position') {
      const per = Math.max(10, el.offsetHeight / Math.max(cine.positions * 1.5, 8));
      g.y += dy;
      const steps = Math.trunc(g.y / per);
      g.y -= steps * per;
      const dir = this.configuration.invert ? -1 : 1;
      for (let k = 0; k < Math.abs(steps); k++) stepSlice('position', Math.sign(steps) * dir, cine.index);
    } else {
      const per = Math.max(8, el.offsetWidth / Math.max(cine.phases * 1.5, 8));
      g.x += dx;
      const steps = Math.trunc(g.x / per);
      g.x -= steps * per;
      for (let k = 0; k < Math.abs(steps); k++) stepSlice('phase', Math.sign(steps), cine.index);
    }
    return undefined;
  }
}
