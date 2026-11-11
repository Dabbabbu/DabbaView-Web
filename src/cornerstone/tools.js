import {
  ToolGroupManager,
  Enums as ToolEnums,
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
import SoftWindowLevelTool, { SoftWindowLevelPrimaryTool } from './SoftWindowLevelTool';
import { ScribbleTool, SCRIBBLE_TOOL_NAMES, SCRIBBLE_SHAPES, shapeTool } from './ScribbleTool';

const { MouseBindings, KeyboardBindings } = ToolEnums;

export const STACK_GROUP = 'dv-stack';
export const MPR_GROUP = 'dv-mpr';

/** 좌클릭(Primary)에 할당 가능한 도구들 */
export const PRIMARY_TOOLS = {
  WindowLevel: SoftWindowLevelPrimaryTool.toolName,
  Pan: PanTool.toolName,
  Zoom: ZoomTool.toolName,
  Scroll: StackScrollTool.toolName,
  Length: LengthTool.toolName,
  Angle: AngleTool.toolName,
  Rectangle: RectangleROITool.toolName,
  Ellipse: EllipticalROITool.toolName,
  Freehand: PlanarFreehandROITool.toolName,
  Scribble: ScribbleTool.toolName,
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
  ...SCRIBBLE_TOOL_NAMES,
];

// ✍ 판서에서 수정키를 누른 채 끌면 도형 (ZoomIt과 같은 방식).
// macOS에서 ⌘를 쓰는 분이 많아 Ctrl과 Meta를 같이 받는다.
const SHAPE_MODIFIERS = {
  line: [KeyboardBindings.Shift],
  rect: [KeyboardBindings.Ctrl, KeyboardBindings.Meta],
  ellipse: [KeyboardBindings.Alt],
  arrow: [KeyboardBindings.ShiftCtrl, KeyboardBindings.ShiftMeta],
};

// Pan · Zoom이 쓰는 좌클릭 조합 (판서 중에는 도형에 내준다)
const PAN_PRIMARY = { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Alt };
const ZOOM_PRIMARY = { mouseButton: MouseBindings.Primary, modifierKey: KeyboardBindings.Ctrl };

/**
 * 판서 중에는 Alt · Ctrl 좌드래그가 도형이므로, Pan · Zoom의 좌클릭 조합을 잠시 뗀다.
 *
 * setToolActive는 바인딩을 '더하기'만 하므로, 뗄 때는 setToolPassive에
 * removeAllBindings로 그 조합을 집어 줘야 한다 (안 그러면 Pan이 Alt를 계속 가로챈다).
 */
function setScribbleShapes(group, on) {
  SCRIBBLE_TOOL_NAMES.forEach((t) => {
    if (group.hasTool(t)) group.setToolPassive(t, { removeAllBindings: true });
  });
  group.setToolPassive(PanTool.toolName, { removeAllBindings: [PAN_PRIMARY] });
  group.setToolPassive(ZoomTool.toolName, { removeAllBindings: [ZOOM_PRIMARY] });
  if (!on) {
    group.setToolActive(PanTool.toolName, { bindings: [PAN_PRIMARY] });
    group.setToolActive(ZoomTool.toolName, { bindings: [ZOOM_PRIMARY] });
    return;
  }
  for (const shape of SCRIBBLE_SHAPES) {
    const mods = SHAPE_MODIFIERS[shape.key];
    if (!mods || !group.hasTool(shape.tool)) continue;
    group.setToolActive(shape.tool, {
      bindings: mods.map((m) => ({ mouseButton: MouseBindings.Primary, modifierKey: m })),
    });
  }
}

/**
 * PACS 표준 마우스 배치 (데스크톱 DabbaView와 동일)
 *  - 좌클릭: 선택한 도구 / 우클릭 드래그: W/L / 가운데: Pan / 휠: 슬라이스 / Ctrl+휠: Zoom
 *  - 터치: 1손가락 = 선택 도구, 2손가락 = 핀치 줌+팬
 */
function baseBindings(group, { mpr = false } = {}) {
  group.addTool(SoftWindowLevelPrimaryTool.toolName);
  group.addTool(PanTool.toolName);
  group.addTool(ZoomTool.toolName, { minZoomScale: 0.05, maxZoomScale: 40 });
  group.addTool(StackScrollTool.toolName, { loop: false });
  ANNOTATION_TOOLS.forEach((t) => group.addTool(t));

  // 우클릭 드래그 W/L — 감도 커브를 입힌 도구를 쓴다 (데스크톱과 같은 조작감)
  group.addTool(SoftWindowLevelTool.toolName);
  group.setToolActive(SoftWindowLevelTool.toolName, {
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
  // 두 손가락: 손가락 간격 비율로 확대 + 이동 (MPR). Stack 칸은 touchGestures.js가 두·세 손가락을 따로 처리
  if (mpr) {
    group.addTool(PinchZoomTool.toolName);
    group.setToolActive(PinchZoomTool.toolName, { bindings: [{ numTouchPoints: 2 }] });
  }
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

/**
 * 좌클릭(+1손가락 터치) 도구 변경. 휠/우클릭/가운데 바인딩은 유지.
 * 판서일 때는 고른 도형을 좌클릭에 걸고, 수정키 조합으로 나머지 도형도 쓸 수 있게 한다.
 */
export function setPrimaryTool(group, toolKey, { shape = 'free' } = {}) {
  if (!group) return;
  const scribble = toolKey === 'Scribble';
  const toolName = scribble ? shapeTool(shape) : PRIMARY_TOOLS[toolKey];
  if (!toolName || !group.hasTool(toolName)) return;
  const current = group.getActivePrimaryMouseButtonTool?.();
  if (current && current !== toolName) {
    // Primary 바인딩만 제거 (다른 고정 바인딩이 있으면 Active 유지)
    if (current === CrosshairsTool.toolName) group.setToolDisabled(current);
    else group.setToolPassive(current);
  }
  setScribbleShapes(group, scribble);
  group.setToolActive(toolName, { bindings: [{ mouseButton: MouseBindings.Primary }] });
}

// 시험 자동화용 (개발 빌드에만) — 도구 묶음의 실제 바인딩을 들여다볼 수 있게
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  window.__dvTools = { getStackGroup, getMprGroup, PRIMARY_TOOLS, SCRIBBLE_SHAPES };
}
