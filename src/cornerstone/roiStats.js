// ROI 상자에 어떤 값을 보일지 — 데스크톱 DabbaView 4.6.11과 같은 표기
//
// Cornerstone 기본값은 Area / Mean / Max / Min / Std Dev를 '한 줄에 하나씩' 찍어
// 네 줄짜리 상자가 되고, ROI를 여러 개 그리면 영상이 가려진다.
// 여기서는 흔히 쓰는 Avg · Max · Min · SD를 한 줄에 묶고, 무엇을 보일지 고를 수 있게 한다.
import { utilities } from '@cornerstonejs/core';

// 둘레(Perim)는 Cornerstone이 값을 주지 않아 넣지 않는다 (켜도 안 나오는 항목은 두지 않음)
export const ROI_STAT_ORDER = ['area', 'avg', 'max', 'min', 'sd'];
export const ROI_STAT_LABELS = {
  area: '면적 (Area)',
  avg: '평균 (Avg)',
  max: '최대 (Max)',
  min: '최소 (Min)',
  sd: '표준편차 (SD)',
};
export const ROI_STAT_DEFAULT = ['area', 'avg', 'max', 'min', 'sd'];

const KEY = 'dv.roiStats';

export function loadRoiStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(saved)) {
      const fields = ROI_STAT_ORDER.filter((f) => saved.includes(f));
      if (fields.length) return fields;
    }
  } catch {
    /* 저장된 값이 깨졌으면 기본값 */
  }
  return [...ROI_STAT_DEFAULT];
}

export function saveRoiStats(fields) {
  try {
    localStorage.setItem(KEY, JSON.stringify(fields));
  } catch {
    /* 저장이 막혀 있어도 이번 실행에는 적용된다 */
  }
}

const round = (v) => utilities.roundNumber(v);

/** 고른 항목만, 통계는 한 줄에 묶어서 → Cornerstone의 getTextLines로 쓸 함수 */
export function makeTextLines(fields) {
  const want = new Set(fields);
  return (data, targetId) => {
    const stats = data?.cachedStats?.[targetId] || {};
    const { area, mean, stdDev, max, min, isEmptyArea, areaUnit, modalityUnit } = stats;
    const lines = [];
    const head = [];
    if (want.has('area') && Number.isFinite(area)) {
      head.push(isEmptyArea ? 'Area: 기울어진 면은 계산하지 않습니다' : `Area ${round(area)} ${areaUnit}`);
    }
    if (head.length) lines.push(head.join('  '));

    const unit = modalityUnit && modalityUnit !== 'unitless' ? ` ${modalityUnit}` : '';
    const row = [];
    if (want.has('avg') && Number.isFinite(mean)) row.push(`Avg ${round(mean)}${unit}`);
    if (want.has('max') && Number.isFinite(max)) row.push(`Max ${round(max)}`);
    if (want.has('min') && Number.isFinite(min)) row.push(`Min ${round(min)}`);
    if (want.has('sd') && Number.isFinite(stdDev)) row.push(`SD ${round(stdDev)}`);
    for (let i = 0; i < row.length; i += 4) lines.push(row.slice(i, i + 4).join('  '));
    return lines;
  };
}

/** 지금 고른 항목을 ROI 도구들에 적용 (그룹을 넘기면 그 그룹에) */
export function applyRoiStats(groups, fields) {
  const getTextLines = makeTextLines(fields);
  const tools = ['EllipticalROI', 'RectangleROI', 'PlanarFreehandROI', 'CircleROI'];
  for (const group of groups) {
    if (!group) continue;
    for (const name of tools) {
      try {
        group.setToolConfiguration(name, { getTextLines }, false);
      } catch {
        /* 그 그룹에 없는 도구는 건너뛴다 */
      }
    }
  }
}
