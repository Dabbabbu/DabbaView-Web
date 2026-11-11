/**
 * ✍ 판서 — 숫자 없는 필기 (데스크톱 DabbaView 4.6.26과 같게)
 *
 * 측정 도구와 달리 길이 · 넓이 · 평균값을 붙이지 않는다. 그린 선만 남는다.
 * ZoomIt처럼 수정키를 누른 채 끌면 도형이 된다 (손가락만 쓰는 기기를 위해
 * 판서 버튼 우클릭 메뉴에서 도형을 직접 고를 수도 있다).
 *
 *   그냥 끌기        → 자유 필기
 *   Shift + 끌기     → 직선
 *   Ctrl(⌘) + 끌기   → 사각형
 *   Alt(⌥) + 끌기    → 원 · 타원
 *   Ctrl+Shift + 끌기 → 화살표
 */
import {
  PlanarFreehandROITool,
  LengthTool,
  RectangleROITool,
  EllipticalROITool,
  ArrowAnnotateTool,
  annotation as csAnnotation,
  Enums as ToolEnums,
} from '@cornerstonejs/tools';
import { eventTarget } from '@cornerstonejs/core';

const noText = () => [];

/** 자유 필기 — 저절로 닫히지 않고, 넓이도 통계도 재지 않는다 */
export class ScribbleTool extends PlanarFreehandROITool {
  static toolName = 'Scribble';

  constructor(props = {}) {
    super(props);
    Object.assign(this.configuration, {
      calculateStats: false,
      allowOpenContours: true,
      closeContourProximity: 0, // 시작점 근처로 와도 닫지 않는다 (필기니까)
      getTextLines: noText,
    });
  }
}

/** 직선 — 길이(mm)를 붙이지 않는다 */
export class ScribbleLineTool extends LengthTool {
  static toolName = 'ScribbleLine';

  constructor(props = {}) {
    super(props);
    this.configuration.getTextLines = noText;
  }
}

export class ScribbleRectTool extends RectangleROITool {
  static toolName = 'ScribbleRect';

  constructor(props = {}) {
    super(props);
    Object.assign(this.configuration, { calculateStats: false, getTextLines: noText });
  }
}

export class ScribbleEllipseTool extends EllipticalROITool {
  static toolName = 'ScribbleEllipse';

  constructor(props = {}) {
    super(props);
    Object.assign(this.configuration, { calculateStats: false, getTextLines: noText });
  }
}

/**
 * 화살표 — 글자를 묻지 않는다.
 * ArrowAnnotateTool은 글자가 비면 주석을 지워 버리므로, 일단 한 글자를 넣고
 * 다 그려진 뒤에 지운다 (글자가 비면 글상자를 그리지 않는다).
 */
export class ScribbleArrowTool extends ArrowAnnotateTool {
  static toolName = 'ScribbleArrow';

  constructor(props = {}) {
    super(props);
    this.configuration.getTextCallback = (done) => done(' ');
    this.configuration.changeTextCallback = (_data, _evt, done) => done(' ');
  }
}

/** 화살표를 다 그리면 임시 글자를 지운다 (한 번만 설치) */
let arrowFixInstalled = false;
export function installScribbleArrowFix() {
  if (arrowFixInstalled) return;
  arrowFixInstalled = true;
  eventTarget.addEventListener(ToolEnums.Events.ANNOTATION_COMPLETED, (evt) => {
    const ann = evt?.detail?.annotation;
    if (ann?.metadata?.toolName !== ScribbleArrowTool.toolName) return;
    if (ann.data) ann.data.text = '';
    try {
      csAnnotation.config.style.setAnnotationStyles(ann.annotationUID, {
        ...(csAnnotation.config.style.getAnnotationToolStyles(ann.annotationUID) || {}),
        textBoxVisibility: false,
      });
    } catch {
      /* 글상자 숨기기는 못 해도 글자가 비어 있으면 그려지지 않는다 */
    }
  });
}

/** 판서 도형 — (키, 메뉴 글자, 수정키 안내, 도구 이름) */
export const SCRIBBLE_SHAPES = [
  { key: 'free', label: '자유 필기', keys: '그냥 끌기', tool: ScribbleTool.toolName },
  { key: 'line', label: '직선', keys: 'Shift', tool: ScribbleLineTool.toolName },
  { key: 'rect', label: '사각형', keys: 'Ctrl(⌘)', tool: ScribbleRectTool.toolName },
  { key: 'ellipse', label: '원 · 타원', keys: 'Alt(⌥)', tool: ScribbleEllipseTool.toolName },
  { key: 'arrow', label: '화살표', keys: 'Ctrl(⌘)+Shift', tool: ScribbleArrowTool.toolName },
];

export const SCRIBBLE_TOOL_NAMES = SCRIBBLE_SHAPES.map((s) => s.tool);
export const shapeTool = (key) =>
  (SCRIBBLE_SHAPES.find((s) => s.key === key) || SCRIBBLE_SHAPES[0]).tool;

export const ALL_SCRIBBLE_TOOLS = [
  ScribbleTool,
  ScribbleLineTool,
  ScribbleRectTool,
  ScribbleEllipseTool,
  ScribbleArrowTool,
];
