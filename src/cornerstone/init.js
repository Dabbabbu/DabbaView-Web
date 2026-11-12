import { init as coreInit, RenderingEngine, getRenderingEngine } from '@cornerstonejs/core';
import { init as dicomLoaderInit } from '@cornerstonejs/dicom-image-loader';
import {
  init as toolsInit,
  addTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  AngleTool,
  RectangleROITool,
  EllipticalROITool,
  PlanarFreehandROITool,
  ProbeTool,
  CrosshairsTool,
} from '@cornerstonejs/tools';
import PinchZoomTool from './PinchZoomTool';
import CineScrollTool from './CineScrollTool';   // StackScroll 자리에 등록 (이름은 그대로 'StackScroll')
import SoftWindowLevelTool, { SoftWindowLevelPrimaryTool } from './SoftWindowLevelTool';
import { ALL_SCRIBBLE_TOOLS, installScribbleArrowFix } from './ScribbleTool';

export const RENDERING_ENGINE_ID = 'dabbaview-engine';

let initPromise = null;
let engine = null;

/**
 * 휴대폰 · 태블릿인가 (안드로이드 앱 · iOS 홈 화면 앱 포함)
 *
 * Cornerstone은 기본으로 WebGL 컨텍스트를 7개 만들어 돌려 쓴다. 모바일 브라우저는 한 페이지가
 * 가질 수 있는 컨텍스트 수와 그래픽 메모리가 작아서, 썸네일을 만드는 동안 먼저 만든 컨텍스트가
 * 버려지면 썸네일은 보이는데 큰 화면만 검게 남는다. 모바일에서는 하나만 쓰게 한다.
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  if (navigator.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true;
  // '데스크톱 사이트 보기'를 켠 태블릿 · iPadOS (UA가 데스크톱처럼 보임)
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return coarse && (navigator.maxTouchPoints || 0) > 1;
}

/** Cornerstone core / tools / DICOM image loader 1회 초기화 */
export function initCornerstone() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await coreInit({ isMobile: isMobileDevice() });
    dicomLoaderInit({
      maxWebWorkers: Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2))),
    });
    await toolsInit();
    [
      WindowLevelTool,
      PanTool,
      ZoomTool,
      CineScrollTool,
      LengthTool,
      AngleTool,
      RectangleROITool,
      EllipticalROITool,
      PlanarFreehandROITool,
      ProbeTool,
      CrosshairsTool,
      SoftWindowLevelTool,
      SoftWindowLevelPrimaryTool,
      PinchZoomTool,
      ...ALL_SCRIBBLE_TOOLS,
    ].forEach((T) => addTool(T));
    installScribbleArrowFix();
    engine = getRenderingEngine(RENDERING_ENGINE_ID) || new RenderingEngine(RENDERING_ENGINE_ID);
    return engine;
  })();
  return initPromise;
}

export function getEngine() {
  // 개발 중 HMR로 이 모듈이 다시 실행돼도 Cornerstone 레지스트리의 엔진을 찾는다
  return engine || getRenderingEngine(RENDERING_ENGINE_ID);
}
