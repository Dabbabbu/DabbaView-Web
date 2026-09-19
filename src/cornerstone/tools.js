import {
  ToolGroupManager,
  Enums as ToolEnums,
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

const { MouseBindings, KeyboardBindings } = ToolEnums;

export const STACK_GROUP = 'dv-stack';
export const MPR_GROUP = 'dv-mpr';

/** 좌클릭(Primary)에 할당 가능한 도구들 */
export const PRIMARY_TOOLS = {
  WindowLevel: WindowLevelTool.toolName,
  Pan: PanTool.toolName,
  Zoom: ZoomTool.toolName,
  Scroll: StackScrollTool.toolName,
  Length: LengthTool.toolName,
  Angle: AngleTool.toolName,
  Rectangle: RectangleROITool.toolName,
  Ellipse: EllipticalROITool.toolName,
  Freehand: PlanarFreehandROITool.toolName,
  Probe: ProbeTool.toolName,
  Crosshairs: CrosshairsTool.toolName,
};

const ANNOTATION_TOOLS = [
  LengthTool.toolName,
  AngleTool.toolName,
  RectangleROITool.toolName,
  EllipticalROITool.toolName,
  PlanarFreehandROITool.toolName,
  ProbeTool.toolName,
];

/**
 * PACS 표준 마우스 배치 (데스크톱 DabbaView와 동일)
 *  - 좌클릭: 선택한 도구 / 우클릭 드래그: W/L / 가운데: Pan / 휠: 슬라이스 / Ctrl+휠: Zoom
 *  - 터치: 1손가락 = 선택 도구, 2손가락 = 핀치 줌+팬
 */
function baseBindings(group, { mpr = false } = {}) {
  group.addTool(WindowLevelTool.toolName);
  group.addTool(PanTool.toolName);
  group.addTool(ZoomTool.toolName, { minZoomScale: 0.05, maxZoomScale: 40 });
  group.addTool(StackScrollTool.toolName, { loop: false });
  ANNOTATION_TOOLS.forEach((t) => group.addTool(t));

  group.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Secondary }],
  });
  group.setToolActive(PanTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Auxiliary },
      { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Alt },
    ],
  });
  group.setToolActive(ZoomTool.toolName, {
    bindings: [
      { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Ctrl },
      { mouseButton: MouseBindings.Wheel, modifierKey: KeyboardBindings.Ctrl },
      { mouseButton: MouseBindings.Wheel, modifierKey: KeyboardBindings.Meta },
    ],
  });
  // 두 손가락: 손가락 간격 비율로 확대 + 이동
  group.addTool(PinchZoomTool.toolName);
  group.setToolActive(PinchZoomTool.toolName, { bindings: [{ numTouchPoints: 2 }] });
  group.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: MouseBindings.Wheel }],
  });
  ANNOTATION_TOOLS.forEach((t) => group.setToolPassive(t));
  if (mpr) group.addTool(CrosshairsTool.toolName);
}

export function getStackGroup() {
  let g = ToolGroupManager.getToolGroup(STACK_GROUP);
  if (!g) {
    g = ToolGroupManager.createToolGroup(STACK_GROUP);
    baseBindings(g);
  }
  return g;
}

export function getMprGroup() {
  let g = ToolGroupManager.getToolGroup(MPR_GROUP);
  if (!g) {
    g = ToolGroupManager.createToolGroup(MPR_GROUP);
    baseBindings(g, { mpr: true });
  }
  return g;
}

/** 좌클릭(+1손가락 터치) 도구 변경. 휠/우클릭/가운데 바인딩은 유지. */
export function setPrimaryTool(group, toolKey) {
  if (!group) return;
  const toolName = PRIMARY_TOOLS[toolKey];
  if (!toolName || !group.hasTool(toolName)) return;
  const current = group.getActivePrimaryMouseButtonTool?.();
  if (current && current !== toolName) {
    // Primary 바인딩만 제거 (다른 고정 바인딩이 있으면 Active 유지)
    if (current === CrosshairsTool.toolName) group.setToolDisabled(current);
    else group.setToolPassive(current);
  }
  group.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
}
