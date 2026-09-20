import { utilities, Enums } from '@cornerstonejs/core';
import { instanceMeta } from '../dicom/loader';
import { formatDate, formatTime, round } from '../dicom/meta';

/** 뷰포트별 마지막 오버레이 텍스트 (캡처 시 그대로 그리기 위해 보관) */
export const overlayCache = new Map();

/** LPS 방향 벡터 → 방향 문자 (가장 큰 성분부터 최대 2글자) */
function dirLabel(v) {
  const axes = [
    [v[0], 'L', 'R'],
    [v[1], 'P', 'A'],
    [v[2], 'H', 'F'],
  ]
    .filter(([c]) => Math.abs(c) > 0.3)
    .sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
  return axes
    .slice(0, 2)
    .map(([c, pos, neg]) => (c > 0 ? pos : neg))
    .join('');
}

export function orientationMarkers(viewport) {
  try {
    const { viewUp, viewPlaneNormal } = viewport.getCamera();
    if (!viewUp || !viewPlaneNormal) return null;
    // 화면 오른쪽 = viewUp × viewPlaneNormal
    const u = viewUp;
    const n = viewPlaneNormal;
    const right = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
    const neg = (v) => v.map((x) => -x);
    return {
      top: dirLabel(u),
      bottom: dirLabel(neg(u)),
      left: dirLabel(neg(right)),
      right: dirLabel(right),
    };
  } catch {
    return null;
  }
}

/** 4개 모서리 텍스트 */
export function buildOverlay(viewport, extra = {}) {
  const isStack = viewport.type === Enums.ViewportType.STACK;
  let imageId;
  let index = 0;
  let total = 0;
  if (isStack) {
    imageId = viewport.getCurrentImageId();
    index = viewport.getCurrentImageIdIndex();
    total = viewport.getImageIds().length;
  } else {
    imageId = viewport.getCurrentImageId?.();
    index = viewport.getSliceIndex?.() ?? 0;
    total = viewport.getNumberOfSlices?.() ?? 0;
  }
  // MPR(볼륨) 평면은 개별 영상의 위치 정보가 맞지 않으므로 시리즈 공통 정보만 사용
  const m = (isStack ? imageId && instanceMeta.get(imageId) : extra.seriesMeta) || instanceMeta.get(imageId) || {};

  let ww = '';
  let wl = '';
  try {
    const { voiRange, invert } = viewport.getProperties();
    if (voiRange) {
      const { windowWidth, windowCenter } = utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);
      ww = Math.round(windowWidth);
      wl = Math.round(windowCenter);
    }
    extra.invert = invert;
  } catch {
    /* noop */
  }
  const m0 = (imageId && instanceMeta.get(imageId)) || extra.seriesMeta || {};
  let zoom = '';
  try {
    // 실제 배율: 화면 1px 당 영상 1px = 100%
    const { parallelScale } = viewport.getCamera();
    const spacing = m0.pixelSpacing?.[0] || 1;
    const z = Math.round(((spacing * viewport.element.clientHeight) / (2 * parallelScale)) * 100);
    zoom = Number.isFinite(z) ? z : '-';
  } catch {
    /* noop */
  }

  const fov =
    m.pixelSpacing && m.rows && m.columns
      ? `FOV ${round((m.columns * m.pixelSpacing[1]) / 10)}×${round((m.rows * m.pixelSpacing[0]) / 10)}cm`
      : '';
  const sexAge = [m.patientSex, m.patientAge].filter(Boolean).join(' / ');
  const mr = m.modality === 'MR';
  const params = mr
    ? [
        m.repetitionTime !== undefined && `TR ${round(m.repetitionTime)}`,
        m.echoTime !== undefined && `TE ${round(m.echoTime)}`,
        m.inversionTime ? `TI ${round(m.inversionTime)}` : null,
      ]
        .filter(Boolean)
        .join('  ')
    : m.modality === 'CT'
      ? [m.kvp && `${round(m.kvp, 0)} kV`, m.exposure && `${m.exposure} mAs`, m.convolutionKernel].filter(Boolean).join('  ')
      : '';
  const mrParams2 = mr
    ? [m.flipAngle !== undefined && `FA ${round(m.flipAngle)}°`, m.echoTrainLength && `ETL ${m.echoTrainLength}`, m.nex && `NEX ${round(m.nex)}`]
        .filter(Boolean)
        .join('  ')
    : '';

  const data = {
    topLeft: [m.institutionName, m.patientName, m.patientId && `ID: ${m.patientId}`, sexAge, m.studyDescription].filter(Boolean),
    topRight: [
      [formatDate(m.studyDate), formatTime(m.studyTime)].filter(Boolean).join(' '),
      `Se: ${m.seriesNumber ?? '-'}   Im: ${index + 1}/${total}${m.frame ? ` (F${m.frame})` : ''}`,
      isStack && m.sliceLocation !== undefined ? `Loc: ${round(m.sliceLocation)} mm` : '',
      isStack
        ? [m.sliceThickness !== undefined && `Thk ${round(m.sliceThickness)} mm`, m.columns && `${m.columns}×${m.rows}`].filter(Boolean).join('  ')
        : '',
      isStack ? fov : '',
    ].filter(Boolean),
    bottomLeft: [
      m.seriesDescription,
      m.sequenceName || m.protocolName,
      params,
      mrParams2,
      [m.manufacturer, m.model, m.fieldStrength && `${round(m.fieldStrength)}T`].filter(Boolean).join(' '),
    ].filter(Boolean),
    frameOfReferenceUID: m.frameOfReferenceUID || '',
    bottomRight: [`Zoom: ${zoom}%`, `W: ${ww}  L: ${wl}${extra.invert ? '  INV' : ''}`].filter(Boolean),
    markers: orientationMarkers(viewport),
  };
  overlayCache.set(viewport.id, data);
  return data;
}
