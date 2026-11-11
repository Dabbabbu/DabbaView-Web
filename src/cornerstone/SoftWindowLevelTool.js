// 우클릭 드래그 W/L — Cornerstone 기본 도구에 데스크톱과 같은 조작감을 입힌다
//
// 기본 WindowLevelTool은 한 픽셀당 고정 배율(또는 영상 범위에서 구한 배율)을 써서
// 조금만 끌어도 확 바뀐다. 여기서는
//   · 한 픽셀이 바꾸는 값 = 드래그를 시작할 때의 Window Width / 100
//   · 천천히 끌면 0.4배(정밀) · 보통 1배 · 빠르게 끌면 최대 2.5배
// 를 적용한다. 나머지(여러 칸 동기화 · 터치 · 이벤트 처리)는 그대로 물려받는다.
import { WindowLevelTool } from '@cornerstonejs/tools';
import { utilities } from '@cornerstonejs/core';

import { WlDrag } from './wlFeel';

const NEW_DRAG_GAP_MS = 250; // 이만큼 쉬었다 움직이면 새 드래그로 본다

let settings = { sensitivity: 100, accel: 100 };

/** 설정 ▸ 마우스에서 바꾼 값을 넣는다 (감도 %, 가속 %) */
export function setWlFeel(next = {}) {
  settings = { ...settings, ...next };
}
export function getWlFeel() {
  return { ...settings };
}

export default class SoftWindowLevelTool extends WindowLevelTool {
  static toolName = 'SoftWindowLevel';

  getNewRange({ viewport, deltaPointsCanvas, volumeId, lower, upper }) {
    const now = Date.now();
    const { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(lower, upper);

    // 드래그가 새로 시작됐으면 지금 Width로 다시 잡는다 (드래그 중에는 고정)
    if (!this._drag || now - (this._drag.lastAt || 0) > NEW_DRAG_GAP_MS) {
      this._drag = new WlDrag(windowWidth, windowCenter, {
        valueRange: this._dynamicRange(viewport, volumeId),
        sensitivity: settings.sensitivity,
        accel: settings.accel,
      });
    } else {
      // 다른 곳에서 W/L이 바뀌었을 수 있으니 현재 값을 따라간다 (단위는 그대로)
      this._drag.width = Math.max(1, windowWidth);
      this._drag.center = windowCenter;
    }

    const [width, center] = this._drag.move(deltaPointsCanvas[0], deltaPointsCanvas[1], now);
    const voiLutFunction = viewport.getProperties().VOILUTFunction;
    return utilities.windowLevel.toLowHighRange(width, center, voiLutFunction);
  }

  /** 영상 값 범위 — 너무 좁은 창에서 꿈쩍 않거나 넓은 창에서 튀지 않게 쓰는 값 */
  _dynamicRange(viewport, volumeId) {
    try {
      const m = this._getMultiplierFromDynamicRange?.(viewport, volumeId);
      // 기본 구현은 (범위 / 1024)를 배율로 쓴다 — 거꾸로 범위를 되짚는다
      return Number.isFinite(m) && m > 0 ? m * 1024 : 0;
    } catch {
      return 0;
    }
  }
}

/** 좌클릭(툴바에서 W/L을 고른 상태)용 — 우클릭 바인딩과 섞이지 않게 이름만 다른 쌍둥이
 *
 * 하나의 도구에 Primary·Secondary를 같이 걸면 도구를 바꿀 때
 * setToolActive가 바인딩을 통째로 바꿔 우클릭 W/L이 풀린다. 그래서 둘로 나눈다.
 */
export class SoftWindowLevelPrimaryTool extends SoftWindowLevelTool {
  static toolName = 'SoftWindowLevelPrimary';
}
