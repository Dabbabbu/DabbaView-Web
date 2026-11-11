// 측정·주석의 색과 굵기 — 지금 고른 값으로 새로 그리고, 이미 그린 것은 그대로 둔다
//
// Cornerstone은 색을 세 곳에서 찾는다: 그 측정에만 준 값 → 뷰포트 → 전체 기본값.
// 그래서 '지금 색'은 기본값으로 넣어 두고(그리는 중에 미리 보이게),
// 다 그려진 순간 그 측정에 색을 도장처럼 찍어 둔다. 나중에 색을 바꿔도 옛 측정은 안 바뀐다.
import { eventTarget } from '@cornerstonejs/core';
import { annotation, Enums as ToolEnums } from '@cornerstonejs/tools';

/** 고를 수 있는 색 — 영상(흑백) 위에서 잘 보이는 것들 */
export const DRAW_COLORS = [
  { key: 'red', label: '빨강', shortcut: 'Ctrl+R', css: 'rgb(255, 64, 64)' },
  { key: 'blue', label: '파랑', shortcut: 'Ctrl+B', css: 'rgb(80, 150, 255)' },
  { key: 'green', label: '초록', shortcut: 'Ctrl+G', css: 'rgb(0, 220, 90)' },
  { key: 'white', label: '흰색', shortcut: 'Ctrl+W', css: 'rgb(255, 255, 255)' },
];

/** 측정·주석을 그리는 도구 — 색·굵기·커서·우클릭 메뉴가 붙는다 */
export const DRAW_TOOLS = ['Length', 'Angle', 'Rectangle', 'Ellipse', 'Freehand', 'Probe', 'Scribble'];

export const DEFAULT_COLOR = 'red';
export const MIN_WIDTH = 1;
export const MAX_WIDTH = 8;
export const DEFAULT_WIDTH = 2;

export const colorCss = (key) => (DRAW_COLORS.find((c) => c.key === key) || DRAW_COLORS[0]).css;
export const colorLabel = (key) => (DRAW_COLORS.find((c) => c.key === key) || DRAW_COLORS[0]).label;
export const clampWidth = (w) => Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(Number(w) || DEFAULT_WIDTH)));

/** 고른 색·굵기로 만든 한 벌의 스타일 */
function stylesFor(colorKey, width) {
  const css = colorCss(colorKey);
  return {
    color: css,
    colorHighlighted: css,
    colorSelected: css,
    textBoxColor: css,
    textBoxColorHighlighted: css,
    textBoxColorSelected: css,
    lineWidth: String(clampWidth(width)),
    textBoxLinkLineWidth: '1',
  };
}

/** 지금 고른 색·굵기를 '앞으로 그릴 것'의 기본값으로 (그리는 중에도 그 색으로 보인다) */
export function applyDrawStyle(colorKey, width) {
  const style = annotation.config.style;
  const current = style.getDefaultToolStyles() || {};
  style.setDefaultToolStyles({
    ...current,
    global: { ...(current.global || {}), ...stylesFor(colorKey, width) },
  });
}

/** 다 그려진 측정에 그때의 색·굵기를 찍어 둔다 (나중에 색을 바꿔도 안 변하게) */
export function stampAnnotation(annotationUID, colorKey, width) {
  if (!annotationUID) return;
  const style = annotation.config.style;
  const own = style.getAnnotationToolStyles(annotationUID) || {};
  style.setAnnotationStyles(annotationUID, { ...own, ...stylesFor(colorKey, width) });
}

/** 측정이 추가될 때마다 그때의 색·굵기를 찍도록 한다. getStyle은 지금 값을 돌려주는 함수 */
export function watchNewAnnotations(getStyle) {
  const onAdded = (evt) => {
    const uid = evt?.detail?.annotation?.annotationUID;
    const { colorKey, width } = getStyle() || {};
    stampAnnotation(uid, colorKey, width);
  };
  eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_ADDED, onAdded);
  return () => eventTarget.removeEventListener(ToolEnums.Events.ANNOTATION_ADDED, onAdded);
}

/** 그리기 커서 — 고른 색의 점. 굵기가 굵을수록 점도 커진다 */
export function drawCursor(colorKey, width) {
  const css = colorCss(colorKey);
  const r = 2 + clampWidth(width) * 0.9; // 굵기 1 → 2.9px, 8 → 9.2px
  const size = Math.ceil((r + 2) * 2);
  const c = size / 2;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="${css}" stroke="rgba(0,0,0,.75)" stroke-width="1"/>` +
    `<circle cx="${c}" cy="${c}" r="0.8" fill="rgba(0,0,0,.85)"/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${c} ${c}, crosshair`;
}

/** 그리기 도구를 쓰는 동안 Ctrl+휠 = 굵기 조절 (그 밖에는 원래대로 Zoom)
 *
 * Cornerstone의 Zoom이 Ctrl+휠에 걸려 있어, 굵기를 바꿀 때는 그보다 먼저 가로채야 한다.
 * store를 직접 들여다보지 않도록 필요한 것만 받아서 쓴다.
 */
export function attachWidthWheel(cell, { isDrawing, nudge }) {
  if (!cell) return () => {};
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey) || !isDrawing()) return;
    e.preventDefault();
    e.stopPropagation();
    nudge(e.deltaY < 0 ? 1 : -1);
  };
  cell.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => cell.removeEventListener('wheel', onWheel, { capture: true });
}
