import { folderOf } from './source';
import { wadouri } from '@cornerstonejs/dicom-image-loader';
import { utilities } from '@cornerstonejs/core';
import { extractMeta } from './meta';

const { fileManager, dataSetCacheManager, loadFileRequest } = wadouri;

/** imageId → 추출한 메타데이터 (오버레이/태그/익명화용) */
export const instanceMeta = new Map();
/** imageId → dicomParser dataset url 키 (dataSetCacheManager 키) */
export const imageIdToUrl = new Map();

import { isVolumeFile } from '../formats/parse';

const SKIP_EXT = /\.(txt|xml|json|html?|pdf|jpe?g|png|gif|bmp|exe|dll|ini|db|ds_store|md|csv)$/i;

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
          f.dvPath = entry.fullPath.replace(/^\//, ''); // 끌어다 놓은 폴더 안의 경로 (어디서 왔는지 표시)
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

export function isObviouslyNotDicom(name = '') {
  const base = name.split('/').pop();
  if (isVolumeFile(base)) return false; // NIfTI/NRRD/NumPy는 따로 처리
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
          meta.sourcePath = file.dvPath || file.webkitRelativePath || '';
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
        sourceFolder: folderOf(m.sourcePath || ''), // 불러온 폴더 (카드 📁 줄)
        thumbnail: null,
        // MPR 가능: 단일프레임 + 3장 이상 + 같은 방향
        mprCapable: !group.some((g) => g.meta.numberOfFrames > 1) && group.length >= 3 && !!m.imagePositionPatient,
      });
    });
  }
  result.sort(seriesOrder);
  return result;
}

// DICOM TM 'HHMMSS.ffffff' → 비교할 수 있게 자릿수를 맞춘 글자
const timeText = (v) => {
  const t = String(v || '').trim().replace(/:/g, '');
  if (!t) return '';
  const [whole, frac = ''] = t.split('.');
  return `${whole.padEnd(6, '0').slice(0, 6)}.${frac.padEnd(6, '0').slice(0, 6)}`;
};
const timeOf = (m) =>
  m.triggerTime != null ? [0, m.triggerTime, ''] : m.temporalPositionIdentifier != null ? [0, m.temporalPositionIdentifier, ''] : timeText(m.acquisitionTime || m.contentTime) ? [1, 0, timeText(m.acquisitionTime || m.contentTime)] : [2, 0, ''];
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x ?? '').localeCompare(String(y ?? ''));
  }
  return 0;
};

/**
 * 시리즈 안 영상 정렬 — 불러올 때마다 늘 같은 순서 (데스크톱 slice_order_keys와 같음)
 * 1. 시간 시리즈(같은 위치 여러 장 + 시간 태그가 다름) → 위치(찍은 순서) → TriggerTime · TemporalPosition · AcquisitionTime
 * 2. InstanceNumber가 모두 있으면 → InstanceNumber (찍은 순서)
 * 3. SliceLocation → 4. 슬라이스 법선 방향 위치 → 5. 시간
 * 같으면 InstanceNumber → SOPInstanceUID → 파일 이름
 */
function sortInstances(group) {
  const metas = group.map((g) => g.meta);
  const iop = metas[0].imageOrientationPatient;
  let proj = null;
  if (iop?.length === 6 && metas.every((m) => m.imagePositionPatient && m.imageOrientationPatient?.length === 6)) {
    const n = cross(iop.slice(0, 3), iop.slice(3, 6));
    const same = metas.every((m) => Math.abs(dot(cross(m.imageOrientationPatient.slice(0, 3), m.imageOrientationPatient.slice(3, 6)), n)) >= 0.99);
    if (same) proj = metas.map((m) => dot(n, m.imagePositionPatient));
  }
  const inst = metas.map((m) => (Number.isFinite(m.instanceNumber) ? m.instanceNumber : null));
  const times = metas.map(timeOf);
  const tail = group.map((g, i) => [inst[i] == null ? 1 : 0, inst[i] ?? 0, g.meta.sopInstanceUID || '', g.meta.fileName || '']);
  let keys = null;
  if (proj) {
    const where = proj.map((p) => Math.round(p * 100) / 100);
    if (new Set(where).size < where.length) {
      const byPos = new Map();
      where.forEach((w, i) => byPos.set(w, [...(byPos.get(w) || []), i]));
      const timed = [...byPos.values()].some((idx) => new Set(idx.map((i) => times[i].join('|'))).size > 1);
      if (timed) {
        const firstSeen = (idx) => {
          const nums = idx.map((i) => inst[i]).filter((v) => v != null);
          return nums.length ? Math.min(...nums) : Math.min(...idx.map((i) => where[i]));
        };
        const ranked = [...byPos.keys()].sort((a, b) => firstSeen(byPos.get(a)) - firstSeen(byPos.get(b)) || a - b);
        const rank = new Map(ranked.map((w, r) => [w, r]));
        keys = group.map((_, i) => [0, rank.get(where[i]), ...times[i], ...tail[i]]);
      }
    }
  }
  if (!keys && inst.every((v) => v != null)) keys = group.map((_, i) => [1, inst[i], ...times[i], ...tail[i]]);
  const loc = metas.map((m) => (Number.isFinite(m.sliceLocation) ? m.sliceLocation : null));
  if (!keys && loc.every((v) => v != null)) keys = group.map((_, i) => [2, loc[i], ...times[i], ...tail[i]]);
  if (!keys && proj) keys = group.map((_, i) => [3, Math.round(proj[i] * 1000) / 1000, ...times[i], ...tail[i]]);
  if (!keys) keys = group.map((_, i) => [4, 0, ...times[i], ...tail[i]]);
  const order = group.map((_, i) => i).sort((a, b) => cmp(keys[a], keys[b]));
  const sorted = order.map((i) => group[i]);
  group.splice(0, group.length, ...sorted);
}

/** 시리즈 순서: 검사 날짜 · 시각 → 시리즈를 찍은 때 → 시리즈 번호 → 설명 (데스크톱과 같음) */
export const seriesDateTime = (s) => {
  const m = s.meta || {};
  const date = m.seriesDate || m.acquisitionDate || m.contentDate || m.studyDate || '';
  return `${date}${timeText(m.seriesTime || m.acquisitionTime || m.contentTime)}`;
};
export const seriesOrder = (a, b) =>
  cmp(
    [a.meta?.studyDate || '', timeText(a.meta?.studyTime), a.studyInstanceUID || '', seriesDateTime(a), a.seriesNumber ?? 1e9, a.seriesDescription || '', a.key],
    [b.meta?.studyDate || '', timeText(b.meta?.studyTime), b.studyInstanceUID || '', seriesDateTime(b), b.seriesNumber ?? 1e9, b.seriesDescription || '', b.key],
  );

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
