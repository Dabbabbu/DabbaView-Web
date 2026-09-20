/** dicomParser DataSet → 뷰어에서 쓰는 메타데이터 */
export function extractMeta(ds) {
  const s = (t) => {
    try {
      const v = ds.string(t);
      return v === undefined ? '' : v.trim();
    } catch {
      return '';
    }
  };
  const f = (t, i = 0) => {
    const v = ds.floatString ? safe(() => ds.floatString(t, i)) : undefined;
    return Number.isFinite(v) ? v : undefined;
  };
  const n = (t) => {
    const v = safe(() => ds.intString(t));
    return Number.isFinite(v) ? v : undefined;
  };
  const multi = (t) => {
    const v = s(t);
    if (!v) return undefined;
    const arr = v.split('\\').map(Number);
    return arr.every(Number.isFinite) ? arr : undefined;
  };
  const u16 = (t) => safe(() => ds.uint16(t));

  // Enhanced(멀티프레임) 영상의 위치/방향은 Shared/PerFrame functional group에 있음
  let ipp = multi('x00200032');
  let iop = multi('x00200037');
  let pixelSpacing = multi('x00280030');
  let sliceThickness = f('x00180050');
  if (!iop || !ipp) {
    const shared = ds.elements.x52009229?.items?.[0]?.dataSet;
    const perFrame = ds.elements.x52009230?.items?.[0]?.dataSet;
    const fromSeq = (d, seq, tag) => {
      const inner = d?.elements?.[seq]?.items?.[0]?.dataSet;
      const v = inner?.string?.(tag);
      return v ? v.split('\\').map(Number) : undefined;
    };
    iop = iop || fromSeq(shared, 'x00209116', 'x00200037') || fromSeq(perFrame, 'x00209116', 'x00200037');
    ipp = ipp || fromSeq(perFrame, 'x00209113', 'x00200032');
    pixelSpacing =
      pixelSpacing || fromSeq(shared, 'x00289110', 'x00280030') || fromSeq(perFrame, 'x00289110', 'x00280030');
    if (sliceThickness === undefined) {
      const st = fromSeq(shared, 'x00289110', 'x00180050') || fromSeq(perFrame, 'x00289110', 'x00180050');
      sliceThickness = st?.[0];
    }
  }

  return {
    // 환자
    patientName: formatPN(s('x00100010')),
    patientId: s('x00100020'),
    patientBirthDate: s('x00100030'),
    patientSex: s('x00100040'),
    patientAge: s('x00101010'),
    patientWeight: s('x00101030'),
    // 검사
    studyInstanceUID: s('x0020000d'),
    studyDate: s('x00080020'),
    studyTime: s('x00080030'),
    studyDescription: s('x00081030'),
    accessionNumber: s('x00080050'),
    institutionName: s('x00080080'),
    referringPhysician: formatPN(s('x00080090')),
    bodyPart: s('x00180015'),
    // 시리즈
    seriesInstanceUID: s('x0020000e'),
    frameOfReferenceUID: s('x00200052'),
    seriesNumber: n('x00200011'),
    seriesDescription: s('x0008103e'),
    seriesDate: s('x00080021'),
    seriesTime: s('x00080031'),
    modality: s('x00080060'),
    protocolName: s('x00181030'),
    sequenceName: s('x00180024'),
    scanningSequence: s('x00180020'),
    manufacturer: s('x00080070'),
    model: s('x00081090'),
    stationName: s('x00081010'),
    fieldStrength: f('x00180087'),
    receiveCoil: s('x00181250'),
    // 영상
    sopInstanceUID: s('x00080018'),
    sopClassUID: s('x00080016'),
    instanceNumber: n('x00200013'),
    temporalPositionIdentifier: n('x00200100'),
    numberOfTemporalPositions: n('x00200105'),
    acquisitionDate: s('x00080022'),
    acquisitionTime: s('x00080032'),
    contentDate: s('x00080023'),
    contentTime: s('x00080033'),
    rows: u16('x00280010'),
    columns: u16('x00280011'),
    pixelSpacing,
    sliceThickness,
    spacingBetweenSlices: f('x00180088'),
    sliceLocation: f('x00201041'),
    imagePositionPatient: ipp,
    imageOrientationPatient: iop,
    numberOfFrames: n('x00280008') || 1,
    windowCenter: f('x00281050'),
    windowWidth: f('x00281051'),
    rescaleSlope: f('x00281053'),
    rescaleIntercept: f('x00281052'),
    photometric: s('x00280004'),
    transferSyntax: s('x00020010'),
    // MR 파라미터
    repetitionTime: f('x00180080'),
    echoTime: f('x00180081'),
    inversionTime: f('x00180082'),
    flipAngle: f('x00181314'),
    echoTrainLength: n('x00180091'),
    nex: f('x00180083'),
    // CT
    kvp: f('x00180060'),
    exposure: n('x00181152'),
    convolutionKernel: s('x00181210'),
    frameTime: f('x00181063'),
  };
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export function formatPN(pn) {
  if (!pn) return '';
  // 알파벳=표의문자=음성 표현 중 첫 번째 비어있지 않은 그룹
  const group = pn.split('=').find((g) => g.trim()) || '';
  return group.replace(/\^+/g, ' ').trim();
}

export function formatDate(d) {
  if (!d || d.length < 8) return d || '';
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

export function formatTime(t) {
  if (!t || t.length < 4) return t || '';
  return `${t.slice(0, 2)}:${t.slice(2, 4)}${t.length >= 6 ? ':' + t.slice(4, 6) : ''}`;
}

export const round = (v, d = 1) => (v === undefined || v === null || !Number.isFinite(v) ? '' : +v.toFixed(d));
