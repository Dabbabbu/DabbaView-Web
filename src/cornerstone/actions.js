import { utilities, Enums, getRenderingEngine } from '@cornerstonejs/core';
import { utilities as toolUtils, annotation } from '@cornerstonejs/tools';
import { RENDERING_ENGINE_ID } from './init';
import { useStore } from '../store/useStore';

export const WINDOW_PRESETS = [
  { name: 'Brain', center: 40, width: 80, key: '1' },
  { name: 'Subdural', center: 75, width: 215, key: '2' },
  { name: 'Stroke', center: 40, width: 40, key: '3' },
  { name: 'Bone', center: 400, width: 2000, key: '4' },
  { name: 'Lung', center: -600, width: 1600, key: '5' },
  { name: 'Abdomen', center: 60, width: 400, key: '6' },
  { name: 'Liver', center: 80, width: 150, key: '7' },
  { name: 'Soft Tissue', center: 50, width: 350, key: '8' },
  { name: 'Spine', center: 50, width: 250, key: '9' },
  { name: 'Mediastinum', center: 50, width: 350 },
];

export const stackViewportId = (i) => `stack-${i}`;
export const MPR_VIEWPORT_IDS = ['mpr-axial', 'mpr-sagittal', 'mpr-coronal'];

export function getEngine() {
  return getRenderingEngine(RENDERING_ENGINE_ID);
}

/** 현재 활성 뷰포트 (Stack 모드: 선택 칸, MPR 모드: 선택 평면) */
export function getActiveViewport() {
  const engine = getEngine();
  if (!engine) return null;
  const { mode, activeIndex } = useStore.getState();
  const id = mode === 'mpr' ? MPR_VIEWPORT_IDS[Math.min(activeIndex, 2)] : stackViewportId(activeIndex);
  return engine.getViewport(id) || null;
}

function allTargets(applyToAll) {
  const engine = getEngine();
  if (!engine) return [];
  if (!applyToAll) return [getActiveViewport()].filter(Boolean);
  return engine.getViewports();
}

export function applyWindow(width, center, applyToAll = false) {
  allTargets(applyToAll).forEach((vp) => {
    vp.setProperties({ voiRange: utilities.windowLevel.toLowHighRange(width, center) });
    vp.render();
  });
}

export function resetWindow() {
  const vp = getActiveViewport();
  if (!vp) return;
  vp.resetProperties?.();
  vp.render();
}

export function toggleInvert() {
  const vp = getActiveViewport();
  if (!vp) return;
  const { invert } = vp.getProperties();
  vp.setProperties({ invert: !invert });
  vp.render();
}

export function rotate(delta) {
  const vp = getActiveViewport();
  if (!vp) return;
  const { rotation = 0 } = vp.getViewPresentation();
  vp.setViewPresentation({ rotation: (((rotation + delta) % 360) + 360) % 360 });
  vp.render();
}

export function flip(horizontal) {
  const vp = getActiveViewport();
  if (!vp) return;
  const cam = vp.getCamera();
  if (horizontal) vp.setCamera({ flipHorizontal: !cam.flipHorizontal });
  else vp.setCamera({ flipVertical: !cam.flipVertical });
  vp.render();
}

/**
 * 새 스택을 띄운 뒤 카메라가 영상 법선의 반대편을 보고 있으면(사용자가 반전하지 않았는데 좌우가 뒤집힌 상태)
 * Cornerstone 기본 방향(viewPlaneNormal = -영상 법선, 방사선과 표준 표시)으로 되돌린다.
 */
export function ensureStandardOrientation(vp) {
  const direction = vp?.getImageData?.()?.direction;
  if (!direction) return false;
  const cam = vp.getCamera();
  if (cam.flipHorizontal || cam.flipVertical) return false;
  const expected = [-direction[6], -direction[7], -direction[8]];
  const n = cam.viewPlaneNormal;
  if (n[0] * expected[0] + n[1] * expected[1] + n[2] * expected[2] >= 0) return false;
  vp.setCamera({ viewPlaneNormal: expected, viewUp: [-direction[3], -direction[4], -direction[5]] });
  vp.resetCamera();
  console.warn('[DabbaView] 카메라 방향이 뒤집혀 있어 표준 방향으로 복원했습니다');
  return true;
}

/**
 * 탭이 숨겨진 동안에는 렌더링이 멈춰서 카메라가 초기화되지 않는다(검은 화면·Zoom NaN).
 * 다시 보이게 되면 카메라가 비정상인 뷰포트를 복구하고 다시 그린다.
 */
export function refreshAfterHidden() {
  const engine = getEngine();
  if (!engine) return;
  for (const vp of engine.getViewports()) {
    const hasImage = vp.getImageIds?.().length || vp.getActors?.().length;
    if (!hasImage) continue;
    if (!Number.isFinite(vp.getCamera().parallelScale)) {
      vp.resetCamera();
      ensureStandardOrientation(vp);
    }
    vp.render();
  }
}

export function resetView() {
  const vp = getActiveViewport();
  if (!vp) return;
  vp.resetCamera();
  vp.resetProperties?.();
  vp.render();
}

export function fitToWindow() {
  const vp = getActiveViewport();
  if (!vp) return;
  const pres = vp.getViewPresentation();
  vp.resetCamera();
  vp.setViewPresentation({ rotation: pres.rotation, flipHorizontal: pres.flipHorizontal, flipVertical: pres.flipVertical });
  vp.render();
}

export function zoomBy(factor) {
  const vp = getActiveViewport();
  if (!vp) return;
  vp.setZoom(vp.getZoom() * factor);
  vp.render();
}

export function scrollSlice(delta) {
  const vp = getActiveViewport();
  if (!vp) return;
  utilities.scroll(vp, { delta });
}

export function clearAnnotations() {
  annotation.state.removeAllAnnotations();
  getEngine()?.render();
}

// ─────────────── 시네 ───────────────

export function playCine(index, fps = 15) {
  const vp = getViewportForIndex(index);
  if (!vp) return false;
  if ((vp.getImageIds?.() || []).length < 2 && vp.type === Enums.ViewportType.STACK) return false;
  toolUtils.cine.playClip(vp.element, { framesPerSecond: fps, loop: true });
  return true;
}

export function stopCine(index) {
  const vp = getViewportForIndex(index);
  if (vp) toolUtils.cine.stopClip(vp.element);
}

function getViewportForIndex(index) {
  const engine = getEngine();
  const { mode } = useStore.getState();
  if (!engine) return null;
  return engine.getViewport(mode === 'mpr' ? MPR_VIEWPORT_IDS[index] : stackViewportId(index));
}
