import { wadouri } from '@cornerstonejs/dicom-image-loader';
import { utilities } from '@cornerstonejs/core';
import { extractMeta } from './meta';

const { fileManager, dataSetCacheManager, loadFileRequest } = wadouri;

/** imageId → 추출한 메타데이터 (오버레이/태그/익명화용) */
export const instanceMeta = new Map();
/** imageId → dicomParser dataset url 키 (dataSetCacheManager 키) */
export const imageIdToUrl = new Map();

const SKIP_EXT = /\.(txt|xml|json|html?|pdf|jpe?g|png|gif|bmp|zip|exe|dll|ini|db|ds_store|md|csv)$/i;

// ─────────────────────────── 파일 수집 ───────────────────────────

/** <input type=file> 결과 → File[] */
export function filesFromInput(fileList) {
  return Array.from(fileList || []).filter((f) => !isObviouslyNotDicom(f.name));
}

/** 드래그 앤 드롭 DataTransfer → File[] (폴더 재귀) */
export async function filesFromDataTransfer(dt) {
  const items = Array.from(dt.items || []);
  const entries = items
    .map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (!entries.length) return filesFromInput(dt.files);
  const out = [];
  await Promise.all(entries.map((e) => walkEntry(e, out)));
  return out.filter((f) => !isObviouslyNotDicom(f.name));
}

function walkEntry(entry, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file(
        (f) => {
          out.push(f);
          resolve();
        },
        () => resolve(),
      );
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all = [];
      const readBatch = () =>
        reader.readEntries(
          async (batch) => {
            if (!batch.length) {
              await Promise.all(all.map((e) => walkEntry(e, out)));
              resolve();
            } else {
              all.push(...batch);
              readBatch();
            }
          },
          () => resolve(),
        );
      readBatch();
    } else resolve();
  });
}

function isObviouslyNotDicom(name = '') {
  const base = name.split('/').pop();
  if (base.startsWith('.')) return true;
  if (/^DICOMDIR$/i.test(base)) return true;
  return SKIP_EXT.test(base);
}

// ─────────────────────────── 파싱 / 분류 ───────────────────────────

/**
 * File[] 을 파싱해서 시리즈 목록을 만든다.
 * @returns {Promise<{series: object[], skipped: number}>}
 */
export async function loadDicomFiles(files, onProgress = () => {}) {
  const parsed = [];
  let skipped = 0;
  let done = 0;
  const total = files.length;
  const CONCURRENCY = 8;
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const file = files[cursor++];
      const imageId = fileManager.add(file);
      const url = imageId.substring(imageId.indexOf(':') + 1);
      try {
        const dataSet = await dataSetCacheManager.load(url, loadFileRequest, imageId);
        if (!dataSet.elements.x7fe00010) {
          // 영상이 없는 객체 (SR, PR, DICOMDIR 등)
          dataSetCacheManager.unload(url);
          fileManager.remove(parseInt(url, 10));
          skipped++;
        } else {
          const meta = extractMeta(dataSet);
          meta.fileName = file.name;
          meta.fileSize = file.size;
          parsed.push({ imageId, url, meta });
        }
      } catch {
        fileManager.remove(parseInt(url, 10));
        skipped++;
      }
      done++;
      if (done % 5 === 0 || done === total) onProgress(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));

  return { series: groupIntoSeries(parsed), skipped };
}

function orientationKey(iop) {
  if (!iop || iop.length < 6) return 'none';
  return iop.map((v) => Math.round(v * 10) / 10).join(',');
}

function groupIntoSeries(parsed) {
  const bySeries = new Map();
  for (const p of parsed) {
    const uid = p.meta.seriesInstanceUID || `nouid-${p.meta.studyInstanceUID}-${p.meta.seriesNumber}`;
    if (!bySeries.has(uid)) bySeries.set(uid, []);
    bySeries.get(uid).push(p);
  }

  const result = [];
  for (const [uid, items] of bySeries) {
    // 한 시리즈에 방향이 여러 개면 (로컬라이저 등) 방향별로 나눈다
    const byOri = new Map();
    for (const it of items) {
      const k = it.meta.numberOfFrames > 1 ? `mf-${it.imageId}` : orientationKey(it.meta.imageOrientationPatient);
      if (!byOri.has(k)) byOri.set(k, []);
      byOri.get(k).push(it);
    }
    const groups = [...byOri.values()];
    groups.forEach((group, gi) => {
      sortInstances(group);
      const imageIds = [];
      for (const it of group) {
        if (it.meta.numberOfFrames > 1) {
          for (let f = 1; f <= it.meta.numberOfFrames; f++) {
            const id = `${it.imageId}?frame=${f}`;
            imageIds.push(id);
            instanceMeta.set(id, { ...it.meta, frame: f });
            imageIdToUrl.set(id, it.url);
          }
        } else {
          imageIds.push(it.imageId);
          instanceMeta.set(it.imageId, it.meta);
          imageIdToUrl.set(it.imageId, it.url);
        }
      }
      const m = group[0].meta;
      result.push({
        key: groups.length > 1 ? `${uid}#${gi}` : uid,
        seriesInstanceUID: uid,
        studyInstanceUID: m.studyInstanceUID,
        seriesNumber: m.seriesNumber,
        seriesDescription:
          (m.seriesDescription || m.protocolName || m.modality || 'Series') + (groups.length > 1 ? ` (${gi + 1})` : ''),
        modality: m.modality,
        imageIds,
        instanceCount: group.length,
        multiframe: group.some((g) => g.meta.numberOfFrames > 1),
        meta: m,
        thumbnail: null,
        // MPR 가능: 단일프레임 + 3장 이상 + 같은 방향
        mprCapable: !group.some((g) => g.meta.numberOfFrames > 1) && group.length >= 3 && !!m.imagePositionPatient,
      });
    });
  }
  result.sort(
    (a, b) =>
      (a.meta.studyDate || '').localeCompare(b.meta.studyDate || '') ||
      (a.studyInstanceUID || '').localeCompare(b.studyInstanceUID || '') ||
      (a.seriesNumber ?? 9999) - (b.seriesNumber ?? 9999),
  );
  return result;
}

function sortInstances(group) {
  const m0 = group[0].meta;
  const iop = m0.imageOrientationPatient;
  const allPos = group.every((g) => g.meta.imagePositionPatient);
  if (iop && allPos && group.length > 1) {
    const n = cross(iop.slice(0, 3), iop.slice(3, 6));
    const d = (g) => dot(n, g.meta.imagePositionPatient);
    group.sort((a, b) => (a.meta.instanceNumber ?? 0) - (b.meta.instanceNumber ?? 0) || d(a) - d(b));
    // 인스턴스 번호가 모두 같거나 없으면 위치 기준
    const nums = new Set(group.map((g) => g.meta.instanceNumber));
    if (nums.size < group.length) group.sort((a, b) => d(a) - d(b));
  } else {
    group.sort((a, b) => (a.meta.instanceNumber ?? 0) - (b.meta.instanceNumber ?? 0));
  }
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ─────────────────────────── 썸네일 ───────────────────────────

let thumbCanvas = null;
/** 시리즈 가운데 영상으로 썸네일(dataURL) 생성 */
export async function makeThumbnail(series, size = 96) {
  const imageId = series.imageIds[Math.floor(series.imageIds.length / 2)];
  if (!thumbCanvas) thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = size;
  thumbCanvas.height = size;
  try {
    await utilities.loadImageToCanvas({ canvas: thumbCanvas, imageId, thumbnail: true });
    return thumbCanvas.toDataURL('image/jpeg', 0.8);
  } catch (e) {
    console.warn('thumbnail failed', e);
    return null;
  }
}

/** imageId의 dicomParser dataset */
export function getDataSet(imageId) {
  const url = imageIdToUrl.get(imageId);
  return url ? dataSetCacheManager.get(url) : null;
}
