// 파싱한 볼륨(NIfTI/NRRD/NumPy)을 Cornerstone 영상으로 제공하는 로더 + 메타데이터 공급자.
// imageId 형식: dvvol:<volumeKey>:<sliceIndex>
import { imageLoader, metaData, registerImageLoader, utilities, Enums } from '@cornerstonejs/core';
import { instanceMeta } from '../dicom/loader';

const SCHEME = 'dvvol';
const volumes = new Map(); // key → { vol, min, max, sliceSize, frameOfReferenceUID }
let registered = false;
let counter = 0;

function parseId(imageId) {
  const [, key, index] = imageId.split(':');
  return { key, index: Number(index), entry: volumes.get(key) };
}

/** 슬라이스 k의 위치 (LPS mm) */
function slicePosition(vol, k) {
  const n = vol.direction[2];
  return [vol.origin[0] + n[0] * vol.spacing[2] * k, vol.origin[1] + n[1] * vol.spacing[2] * k, vol.origin[2] + n[2] * vol.spacing[2] * k];
}

function imagePlane(vol, k) {
  const [rowCosines, columnCosines] = vol.direction;
  return {
    frameOfReferenceUID: vol.frameOfReferenceUID,
    rows: vol.dims[1],
    columns: vol.dims[0],
    imageOrientationPatient: [...rowCosines, ...columnCosines],
    rowCosines,
    columnCosines,
    imagePositionPatient: slicePosition(vol, k),
    sliceThickness: vol.spacing[2],
    sliceLocation: k * vol.spacing[2],
    pixelSpacing: [vol.spacing[1], vol.spacing[0]], // [row(y), column(x)]
    rowPixelSpacing: vol.spacing[1],
    columnPixelSpacing: vol.spacing[0],
  };
}

function metaDataProvider(type, imageId) {
  if (typeof imageId !== 'string' || !imageId.startsWith(`${SCHEME}:`)) return undefined;
  const { index, entry } = parseId(imageId);
  if (!entry) return undefined;
  const { vol, min, max } = entry;
  const { MetadataModules } = Enums;
  switch (type) {
    case MetadataModules.IMAGE_PLANE:
    case 'imagePlaneModule':
      return imagePlane(vol, index);
    case MetadataModules.IMAGE_PIXEL:
    case 'imagePixelModule':
      return {
        samplesPerPixel: 1,
        photometricInterpretation: 'MONOCHROME2',
        rows: vol.dims[1],
        columns: vol.dims[0],
        bitsAllocated: vol.data.BYTES_PER_ELEMENT * 8,
        bitsStored: vol.data.BYTES_PER_ELEMENT * 8,
        highBit: vol.data.BYTES_PER_ELEMENT * 8 - 1,
        pixelRepresentation: /Uint/.test(vol.data.constructor.name) ? 0 : 1,
        smallestPixelValue: min,
        largestPixelValue: max,
      };
    case MetadataModules.VOI_LUT:
    case 'voiLutModule':
      return { windowCenter: [(max + min) / 2], windowWidth: [Math.max(1, max - min)] };
    case MetadataModules.MODALITY_LUT:
    case 'modalityLutModule':
      return { rescaleSlope: vol.slope, rescaleIntercept: vol.intercept, rescaleType: 'US' };
    case MetadataModules.GENERAL_SERIES:
    case 'generalSeriesModule':
      return { modality: 'OT', seriesInstanceUID: vol.seriesInstanceUID, seriesNumber: 1, studyInstanceUID: vol.studyInstanceUID };
    case MetadataModules.GENERAL_IMAGE:
    case 'generalImageModule':
      return { instanceNumber: index + 1 };
    case MetadataModules.SOP_COMMON:
    case 'sopCommonModule':
      return { sopClassUID: '1.2.840.10008.5.1.4.1.1.7', sopInstanceUID: imageId };
    case 'calibratedPixelSpacing':
      return undefined;
    default:
      return undefined;
  }
}

function loadImage(imageId) {
  const { index, entry } = parseId(imageId);
  if (!entry) return { promise: Promise.reject(new Error(`알 수 없는 볼륨: ${imageId}`)) };
  const { vol, min, max, sliceSize } = entry;
  const pixelData = vol.data.subarray(index * sliceSize, (index + 1) * sliceSize);
  const voxelManager = utilities.VoxelManager.createImageVoxelManager({
    scalarData: pixelData,
    width: vol.dims[0],
    height: vol.dims[1],
    numberOfComponents: 1,
  });
  const image = {
    imageId,
    dataType: vol.data.constructor.name,
    color: false,
    rgba: false,
    numberOfComponents: 1,
    columns: vol.dims[0],
    rows: vol.dims[1],
    width: vol.dims[0],
    height: vol.dims[1],
    columnPixelSpacing: vol.spacing[0],
    rowPixelSpacing: vol.spacing[1],
    invert: false,
    intercept: vol.intercept,
    slope: vol.slope,
    minPixelValue: min,
    maxPixelValue: max,
    windowCenter: (max + min) / 2,
    windowWidth: Math.max(1, max - min),
    sizeInBytes: pixelData.byteLength,
    getPixelData: () => pixelData,
    voxelManager,
    preScale: { scaled: false },
  };
  return { promise: Promise.resolve(image) };
}

function ensureRegistered() {
  if (registered) return;
  registerImageLoader(SCHEME, loadImage);
  metaData.addProvider(metaDataProvider, 10_000);
  registered = true;
}

/** 파싱 결과 → 시리즈 객체 (스토어에 넣을 수 있는 형태) */
export function addVolume(parsed) {
  ensureRegistered();
  const key = `vol${++counter}`;
  const vol = {
    ...parsed,
    frameOfReferenceUID: `dvvol-for-${key}`,
    seriesInstanceUID: `dvvol-series-${key}`,
    studyInstanceUID: `dvvol-study-${key}`,
  };
  const sliceSize = vol.dims[0] * vol.dims[1];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < vol.data.length; i++) {
    const v = vol.data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  min = min * vol.slope + vol.intercept;
  max = max * vol.slope + vol.intercept;
  volumes.set(key, { vol, min, max, sliceSize });

  const imageIds = Array.from({ length: vol.dims[2] }, (_, k) => `${SCHEME}:${key}:${k}`);
  const baseMeta = {
    patientName: vol.name.replace(/\.(nii\.gz|nii|nrrd|nhdr|npy)$/i, ''),
    patientId: vol.format,
    studyInstanceUID: vol.studyInstanceUID,
    seriesInstanceUID: vol.seriesInstanceUID,
    frameOfReferenceUID: vol.frameOfReferenceUID,
    studyDescription: `${vol.format} · ${vol.dims.join('×')}`,
    seriesDescription: vol.name,
    modality: 'OT',
    seriesNumber: 1,
    rows: vol.dims[1],
    columns: vol.dims[0],
    pixelSpacing: [vol.spacing[1], vol.spacing[0]],
    sliceThickness: vol.spacing[2],
    imageOrientationPatient: [...vol.direction[0], ...vol.direction[1]],
    numberOfFrames: 1,
  };
  imageIds.forEach((id, k) => {
    instanceMeta.set(id, {
      ...baseMeta,
      instanceNumber: k + 1,
      sliceLocation: k * vol.spacing[2],
      imagePositionPatient: slicePosition(vol, k),
      sopInstanceUID: id,
    });
  });

  return {
    key: vol.seriesInstanceUID,
    seriesInstanceUID: vol.seriesInstanceUID,
    studyInstanceUID: vol.studyInstanceUID,
    seriesNumber: 1,
    seriesDescription: vol.name,
    modality: 'OT',
    imageIds,
    instanceCount: imageIds.length,
    multiframe: false,
    meta: instanceMeta.get(imageIds[0]),
    thumbnail: null,
    mprCapable: imageIds.length >= 3,
    volumeFormat: vol.format,
  };
}

/** 뷰어에서 쓰는 볼륨 여부 (태그 보기 등에서 구분) */
export const isVolumeImageId = (imageId = '') => imageId.startsWith(`${SCHEME}:`);

/** imageId → 파싱 정보 (3D 커서의 픽셀 값 계산 등에 사용) */
export function getVolumeEntry(imageId) {
  return isVolumeImageId(imageId) ? parseId(imageId) : null;
}

export { imageLoader };
