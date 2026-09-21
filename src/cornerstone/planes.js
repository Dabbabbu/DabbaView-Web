// 평면 교선(Crosslink / Reference Line)과 3D 커서 계산
import { utilities as csUtils } from '@cornerstonejs/core';
import { instanceMeta } from '../dicom/loader';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

export function viewportPlane(viewport) {
  try {
    const { viewPlaneNormal, focalPoint } = viewport.getCamera();
    if (!viewPlaneNormal || !focalPoint) return null;
    const imageId = viewport.getCurrentImageId?.();
    const meta = imageId ? instanceMeta.get(imageId) : null;
    return { normal: viewPlaneNormal, point: focalPoint, frameOfReferenceUID: meta?.frameOfReferenceUID || '', studyInstanceUID: meta?.studyInstanceUID || '' };
  } catch {
    return null;
  }
}

/** 슬라이스(평면)와 화면 평면의 교선을 캔버스 좌표 두 점으로 (없으면 null) */
export function planeIntersectionOnCanvas(viewport, targetPlane, slicePlane, halfLength = 600) {
  const d = cross(targetPlane.normal, slicePlane.normal);
  const dl = len(d);
  if (dl < 1e-6) return null; // 평행 → 교선 없음
  const dn = mul(d, 1 / dl);
  const c1 = dot(targetPlane.normal, targetPlane.point);
  const c2 = dot(slicePlane.normal, slicePlane.point);
  // 두 평면 위의 한 점
  const p0 = mul(add(mul(cross(slicePlane.normal, dn), c1), mul(cross(dn, targetPlane.normal), c2)), 1 / dl / dl);
  try {
    const a = viewport.worldToCanvas(sub(p0, mul(dn, halfLength)));
    const b = viewport.worldToCanvas(add(p0, mul(dn, halfLength)));
    if (![a[0], a[1], b[0], b[1]].every(Number.isFinite)) return null;
    return [a, b];
  } catch {
    return null;
  }
}

/** 시리즈의 슬라이스 평면 (index별) */
export function slicePlaneOf(imageId) {
  const m = instanceMeta.get(imageId);
  if (!m?.imagePositionPatient || !m?.imageOrientationPatient) return null;
  const iop = m.imageOrientationPatient;
  const normal = cross(iop.slice(0, 3), iop.slice(3, 6));
  // 슬라이스 중심 (코너 위치 → 중심)
  const spacing = m.pixelSpacing || [1, 1];
  const center = add(
    m.imagePositionPatient,
    add(mul(iop.slice(0, 3), ((m.columns || 1) - 1) * 0.5 * spacing[1]), mul(iop.slice(3, 6), ((m.rows || 1) - 1) * 0.5 * spacing[0])),
  );
  return { normal, point: m.imagePositionPatient, center, frameOfReferenceUID: m.frameOfReferenceUID || '', studyInstanceUID: m.studyInstanceUID || '' };
}

// Crosslink · Ref Line · 3D 커서 연동 기준 (데스크톱 View ▸ 연동 기준과 같음, 이 브라우저에 기억)
export const LINK_MODES = {
  frame: '좌표계(Frame of Reference)가 같을 때만 (기본)',
  study: '같은 검사(Study)면 — 좌표계 표시가 없거나 달라도',
  position: '환자 좌표만 보고 항상 — 다른 날 검사도 (위치가 어긋날 수 있음)',
};
let linkMode = (() => {
  try {
    const v = localStorage.getItem('dv.linkMode');
    return LINK_MODES[v] ? v : 'frame';
  } catch {
    return 'frame';
  }
})();
export const getLinkMode = () => linkMode;
export function setLinkMode(mode) {
  if (!LINK_MODES[mode]) return;
  linkMode = mode;
  try {
    localStorage.setItem('dv.linkMode', mode);
  } catch {
    /* noop */
  }
}

/** 두 평면(또는 시리즈)을 같은 공간으로 보고 위치를 맞춰도 되는지 */
export function sameFrame(a, b) {
  if (!a || !b) return false;
  if (a.frameOfReferenceUID && a.frameOfReferenceUID === b.frameOfReferenceUID) return true;
  if (linkMode === 'study') return !!a.studyInstanceUID && a.studyInstanceUID === b.studyInstanceUID;
  return linkMode === 'position';
}

/** 화면 좌표 → 환자 좌표(LPS)와 픽셀 값 */
export function probeAt(viewport, canvasPoint) {
  const world = viewport.canvasToWorld(canvasPoint);
  const value = valueAtWorld(viewport, world);
  return { world, value };
}

/** 환자 좌표에서의 픽셀 값 (현재 슬라이스 밖이면 null) */
export function valueAtWorld(viewport, world) {
  try {
    const data = viewport.getImageData();
    if (!data) return null;
    const { imageData, dimensions, voxelManager } = data;
    const index = csUtils.transformWorldToIndex(imageData, world);
    if (!index) return null;
    const [i, j, k] = index.map((v) => Math.round(v));
    if (i < 0 || j < 0 || k < 0 || i >= dimensions[0] || j >= dimensions[1] || k >= dimensions[2]) return null;
    const value = voxelManager?.getAtIJK?.(i, j, k);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** L/P/S 표기 (LPS 좌표를 사람이 읽는 방향 문자와 함께) */
export function formatLps(world) {
  const [x, y, z] = world;
  const f = (v, pos, neg) => `${v >= 0 ? pos : neg} ${Math.abs(v).toFixed(1)}`;
  return `${f(x, 'L', 'R')}  ${f(y, 'P', 'A')}  ${f(z, 'S', 'I')}`;
}

export { dot, cross, sub, add, mul, len };
