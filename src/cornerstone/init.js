import { init as coreInit, RenderingEngine } from '@cornerstonejs/core';
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
    ].forEach((T) => addTool(T));
    engine = new RenderingEngine(RENDERING_ENGINE_ID);
    return engine;
  })();
  return initPromise;
}

export function getEngine() {
  return engine;
}
