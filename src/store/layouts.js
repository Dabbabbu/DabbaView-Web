/**
 * Multi View 레이아웃 (INFINITT의 Image set layout) — 데스크톱 dabbaview/layouts.py와 같은 규칙
 * 이름은 "행x열" (2x3 = 2줄 3칸). Auto는 열린 시리즈 수에 맞춰 스스로 고른다.
 */
export const MAX_ROWS = 6;
export const MAX_COLS = 6;
export const MAX_CELLS = 24;
export const AUTO = 'auto';

export const DEFAULT_LAYOUTS = [
  '1x1', '1x2', '1x3', '1x4', '2x1', '2x2', '2x3', '2x4',
  '3x1', '3x2', '3x3', '3x4', '4x1', '4x2', '4x3', '4x4', '4x5',
];
export const DEFAULT_ACTIVE = ['1x1', '1x2', '2x1', '2x2', '2x3', '3x3', '4x4'];
const AUTO_ORDER = ['1x1', '1x2', '2x2', '2x3', '3x3', '3x4', '4x4', '4x5'];

/** '2x3' · '2X3' → { rows, cols } (범위를 벗어나면 null) */
export function parseLayout(id) {
  const m = typeof id === 'string' && id.trim().match(/^(\d+)\s*[xX×*]\s*(\d+)$/);
  if (!m) return null;
  const rows = +m[1];
  const cols = +m[2];
  if (rows < 1 || cols < 1 || rows > MAX_ROWS || cols > MAX_COLS || rows * cols > MAX_CELLS) return null;
  return { rows, cols };
}

export const layoutName = (rows, cols) => `${rows}x${cols}`;

export function cleanLayout(id) {
  if (typeof id === 'string' && id.trim().toLowerCase() === AUTO) return AUTO;
  const size = parseLayout(id);
  return size ? layoutName(size.rows, size.cols) : null;
}

export function layoutCells(id) {
  const size = parseLayout(id);
  return size ? size.rows * size.cols : 0;
}

export function layoutLabel(id) {
  if (id === AUTO) return 'Auto';
  const size = parseLayout(id);
  return size ? `${size.rows}X${size.cols}` : String(id);
}

export function cleanList(values, fallback = DEFAULT_ACTIVE) {
  const out = [];
  (values || []).forEach((v) => {
    const id = cleanLayout(v);
    if (id && id !== AUTO && !out.includes(id)) out.push(id);
  });
  return out.length ? out : [...fallback];
}

/** n개가 들어가는 가장 작은 레이아웃 */
export function layoutForCount(n, choices) {
  const list = choices && choices.length ? choices : AUTO_ORDER;
  const want = Math.max(1, n | 0);
  return list.find((id) => layoutCells(id) >= want) || list[list.length - 1];
}

/** 모든 레이아웃 이름 → { rows, cols } (예전 코드 호환용) */
export const LAYOUT_SIZES = Object.fromEntries(DEFAULT_LAYOUTS.map((id) => [id, parseLayout(id)]));
