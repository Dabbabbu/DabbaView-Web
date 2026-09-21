// Multi View 동기 스크롤
//  - 같은 Frame of Reference + 평행한 시리즈: 환자 좌표(mm) 기준으로 가장 가까운 슬라이스 (데스크톱과 동일)
//  - 그 밖의 시리즈: 위치 비율로 비례 스크롤 (예: 20/60 → 10/30)
//  - 대상: Sync Scroll ON이면 모든 칸, 아니면 함께 선택한(Ctrl/⌘+클릭) 칸들
import { useStore, getSeries, LAYOUTS } from '../store/useStore';
import { instanceMeta } from '../dicom/loader';
import { getEngine, stackViewportId } from './actions';
import { sameFrame } from './planes';

export const VIEWPORT_CHANGED = 'dv-viewport-changed';

/** 다른 칸의 선/커서를 다시 그리도록 알림 */
export function notifyViewportChanged() {
  window.dispatchEvent(new Event(VIEWPORT_CHANGED));
}

const geomCache = new Map(); // seriesKey → { frameOfReferenceUID, normal, projections } | null

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 시리즈의 슬라이스 위치를 법선 방향 좌표(mm)로 */
export function seriesGeometry(series) {
  if (!series) return null;
  if (geomCache.has(series.key)) return geomCache.get(series.key);
  let geom = null;
  const first = instanceMeta.get(series.imageIds[0]);
  const iop = first?.imageOrientationPatient;
  if (iop?.length === 6 && first?.imagePositionPatient) {
    const normal = cross(iop.slice(0, 3), iop.slice(3, 6));
    const projections = series.imageIds.map((id) => {
      const ipp = instanceMeta.get(id)?.imagePositionPatient;
      return ipp ? dot(normal, ipp) : null;
    });
    if (projections.every((p) => p !== null)) {
      geom = { frameOfReferenceUID: first.frameOfReferenceUID || '', studyInstanceUID: first.studyInstanceUID || '', normal, projections };
    }
  }
  geomCache.set(series.key, geom);
  return geom;
}

export function clearGeometryCache() {
  geomCache.clear();
}

/** 같은 좌표계 + 평행(법선이 나란함)이면 mm 기준으로 연동 가능 */
function canLinkByPosition(a, b) {
  if (!sameFrame(a, b)) return false; // 연동 기준(좌표계 · 같은 검사 · 환자 좌표)
  return Math.abs(dot(a.normal, b.normal)) > 0.95;
}

function nearestIndex(projections, value) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < projections.length; i++) {
    const d = Math.abs(projections[i] - value);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** 소스 칸의 슬라이스 index에 대응하는 타겟 칸의 index */
export function mapIndex(sourceKey, sourceIndex, targetKey) {
  const source = getSeries(sourceKey);
  const target = getSeries(targetKey);
  if (!source || !target) return null;
  const sGeom = seriesGeometry(source);
  const tGeom = seriesGeometry(target);
  if (canLinkByPosition(sGeom, tGeom)) {
    // 같은 좌표계: 소스 슬라이스 위치에서 가장 가까운 슬라이스
    const value = sGeom.projections[sourceIndex] * Math.sign(dot(sGeom.normal, tGeom.normal));
    return { index: nearestIndex(tGeom.projections, value), mode: 'position' };
  }
  // 다른 시리즈: 비례 스크롤
  const sn = source.imageIds.length;
  const tn = target.imageIds.length;
  if (sn < 2 || tn < 2) return { index: 0, mode: 'proportional' };
  return { index: Math.round((sourceIndex / (sn - 1)) * (tn - 1)), mode: 'proportional' };
}

// 프로그램이 바꾼 슬라이스는 다시 전파하지 않도록 기대값을 기록
const expected = new Map(); // viewportId → index

/** 어떤 칸이 스크롤됐을 때 다른 칸으로 전파 */
export function propagateScroll(sourceViewportId, sourceIndex) {
  if (expected.get(sourceViewportId) === sourceIndex) {
    expected.delete(sourceViewportId);
    return;
  }
  const { mode, syncScroll, selected, viewportSeries, layout } = useStore.getState();
  if (mode !== 'stack') return;

  const sourceIdx = Number(sourceViewportId.split('-')[1]);
  const sourceKey = viewportSeries[sourceIdx];
  if (!sourceKey) return;

  const { rows, cols } = LAYOUTS[layout];
  const visible = rows * cols;
  let targets;
  if (syncScroll) targets = Array.from({ length: visible }, (_, i) => i);
  else if (selected.length > 1 && selected.includes(sourceIdx)) targets = selected;
  else return;

  const engine = getEngine();
  if (!engine) return;
  for (const i of targets) {
    if (i === sourceIdx || i >= visible) continue;
    const key = viewportSeries[i];
    if (!key) continue;
    const vp = engine.getViewport(stackViewportId(i));
    if (!vp?.getImageIds?.().length) continue;
    const mapped = mapIndex(sourceKey, sourceIndex, key);
    if (!mapped) continue;
    const clamped = Math.max(0, Math.min(vp.getImageIds().length - 1, mapped.index));
    if (clamped === vp.getCurrentImageIdIndex()) continue;
    expected.set(stackViewportId(i), clamped);
    vp.setImageIdIndex(clamped).catch(() => expected.delete(stackViewportId(i)));
  }
}


/**
 * 3D 커서: 같은 좌표계의 다른 칸을 그 점이 있는 슬라이스로 이동시킨다.
 * @returns 이동/대응된 칸 수
 */
export function jumpOthersToWorld(world, frameOfReferenceUID, exceptViewportId, studyInstanceUID = '') {
  const { viewportSeries, layout } = useStore.getState();
  const engine = getEngine();
  if (!engine) return 0;
  const { rows, cols } = LAYOUTS[layout];
  let matched = 0;
  for (let i = 0; i < rows * cols; i++) {
    const viewportId = stackViewportId(i);
    if (viewportId === exceptViewportId || !viewportSeries[i]) continue;
    const vp = engine.getViewport(viewportId);
    if (!vp?.getImageIds?.().length) continue;
    const geom = seriesGeometry(getSeries(viewportSeries[i]));
    if (!geom || !sameFrame(geom, { frameOfReferenceUID, studyInstanceUID })) continue;
    const value = geom.normal[0] * world[0] + geom.normal[1] * world[1] + geom.normal[2] * world[2];
    const index = nearestIndex(geom.projections, value);
    matched++;
    if (index !== vp.getCurrentImageIdIndex()) {
      expected.set(viewportId, index); // 동기 스크롤로 되전파되지 않도록
      vp.setImageIdIndex(index).catch(() => expected.delete(viewportId));
    }
  }
  return matched;
}

/** Sync Scroll을 켜거나 선택을 바꿨을 때, 활성 칸 기준으로 즉시 맞춤 */
export function alignToActive() {
  const { activeIndex, viewportSeries } = useStore.getState();
  const engine = getEngine();
  const vp = engine?.getViewport(stackViewportId(activeIndex));
  if (!vp?.getImageIds?.().length || !viewportSeries[activeIndex]) return;
  propagateScroll(stackViewportId(activeIndex), vp.getCurrentImageIdIndex());
}
