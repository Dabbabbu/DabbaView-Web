import { init as coreInit, RenderingEngine, getRenderingEngine } from '@cornerstonejs/core';
import { init as dicomLoaderInit } from '@cornerstonejs/dicom-image-loader';
import {
  init as toolsInit,
  addTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  AngleTool,
  RectangleROITool,
  EllipticalROITool,
  PlanarFreehandROITool,
  ProbeTool,
  CrosshairsTool,
} from '@cornerstonejs/tools';
import PinchZoomTool from './PinchZoomTool';

export const RENDERING_ENGINE_ID = 'dabbaview-engine';

let initPromise = null;
let engine = null;

/** Cornerstone core / tools / DICOM image loader 1회 초기화 */
export function initCornerstone() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await coreInit();
    dicomLoaderInit({
      maxWebWorkers: Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2))),
    });
    await toolsInit();
    [
      WindowLevelTool,
      PanTool,
      ZoomTool,
      StackScrollTool,
      LengthTool,
      AngleTool,
      RectangleROITool,
      EllipticalROITool,
      PlanarFreehandROITool,
      ProbeTool,
      CrosshairsTool,
      PinchZoomTool,
    ].forEach((T) => addTool(T));
    engine = getRenderingEngine(RENDERING_ENGINE_ID) || new RenderingEngine(RENDERING_ENGINE_ID);
    return engine;
  })();
  return initPromise;
}

export function getEngine() {
  // 개발 중 HMR로 이 모듈이 다시 실행돼도 Cornerstone 레지스트리의 엔진을 찾는다
  return engine || getRenderingEngine(RENDERING_ENGINE_ID);
}
