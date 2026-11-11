// W/L 조작감 — 데스크톱 DabbaView(mouse_feel.py)의 비선형 감도 커브를 그대로 옮긴 것
//
//  - 천천히 끌면 0.4배(정밀), 보통이면 1배, 빠르게 끌면 최대 2.5배
//  - 한 픽셀이 바꾸는 값은 '드래그를 시작할 때의 Window Width / 250' (0.4%)
//    (드래그 도중에 다시 재지 않아야 Width가 커질수록 더 빨리 커지는 복리가 생기지 않는다)
//  - 좁은 창에서 꿈쩍 않거나 넓은 창에서 튀지 않게 영상 값 범위의 0.02%~2%로 묶는다

const SLOW_GAIN = 0.4; // 아주 천천히 움직일 때 배율
const SLOW_SPEED = 0.05; // px/ms — 이보다 느리면 SLOW_GAIN
const NORMAL_SPEED = 0.45; // px/ms — 보통 드래그 = 1배
const FAST_SPEED = 2.0; // px/ms — 이보다 빠르면 최대 가속
const MAX_EXTRA = 1.5; // 가속 100%일 때 더해지는 최대 배율 (1 + 1.5 = 2.5배)
const WL_PER_PX = 250; // 한 픽셀 = 지금 Width의 1/250 — 숫자가 클수록 둔감

const smoothstep = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/** 드래그 속도(px/ms) → 감도 배율. accel 0이면 늘 1배(옛 동작) */
export function speedGain(speed, accel = 100) {
  const a = Math.max(0, accel) / 100;
  if (a <= 0) return 1;
  const v = Math.max(0, Number(speed) || 0);
  if (v <= NORMAL_SPEED) {
    const t = smoothstep((v - SLOW_SPEED) / (NORMAL_SPEED - SLOW_SPEED));
    const slow = 1 - (1 - SLOW_GAIN) * Math.min(1, a);
    return slow + (1 - slow) * t;
  }
  return 1 + MAX_EXTRA * a * smoothstep((v - NORMAL_SPEED) / (FAST_SPEED - NORMAL_SPEED));
}

/** 한 픽셀이 바꾸는 값 — 드래그 시작 시의 Width 기준
 *
 * 가로로 250px 끌면 Width가 두 배가 된다. 1/100이던 때는 100px 만에 두 배가 되어
 * 심장 MRI처럼 Width가 1800쯤인 영상에서 한 픽셀에 18씩 뛰었다 (데스크톱과 같은 값).
 */
export function wlUnit(width, valueRange) {
  let unit = Math.max(Number(width) || 0, 1e-6) / WL_PER_PX;
  if (valueRange) {
    const span = Math.max(Number(valueRange) || 0, 1e-6);
    unit = Math.max(span * 0.0002, Math.min(span * 0.02, unit));
  }
  return unit;
}

/** 드래그 한 번(버튼 누름~뗌) 동안의 상태 — 시작 Width와 속도를 들고 있는다 */
export class WlDrag {
  constructor(width, center, { valueRange = 0, sensitivity = 100, accel = 100 } = {}) {
    this.width = Math.max(1, Number(width) || 1);
    this.center = Number(center) || 0;
    this.unit = wlUnit(this.width, valueRange); // 드래그 내내 고정
    this.sensitivity = Math.max(1, Number(sensitivity) || 100) / 100;
    this.accel = accel;
    this.lastAt = 0;
    this.speed = 0;
  }

  /** 마우스가 움직인 만큼 → 새 [width, center] */
  move(dx, dy, now = Date.now()) {
    const dt = this.lastAt ? Math.max(1, now - this.lastAt) : 16;
    this.lastAt = now;
    const dist = Math.hypot(dx, dy);
    // 속도는 조금씩 섞어 튀지 않게
    this.speed = this.speed * 0.6 + (dist / dt) * 0.4;
    const step = this.unit * this.sensitivity * speedGain(this.speed, this.accel);
    this.width = Math.max(1, this.width + dx * step);
    this.center += dy * step;
    return [this.width, this.center];
  }
}
