// 동영상 내보내기: GIF(gifenc) / WebM(MediaRecorder) + 여러 시리즈 일괄 내보내기(ZIP)
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Enums, utilities as csUtils } from '@cornerstonejs/core';
import { composeViewport } from './capture';
import { buildOverlay } from '../cornerstone/overlay';
import { getEngine } from '../cornerstone/actions';
import { makeZip, downloadBlob } from './zip';

export const WEBM_MIMES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export function webmMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return WEBM_MIMES.find((m) => MediaRecorder.isTypeSupported?.(m)) || null;
}

export const supportsWebm = () => !!webmMimeType();

function waitRendered(element, timeout = 400) {
  return new Promise((resolve) => {
    const done = () => {
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, done);
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, timeout);
    element.addEventListener(Enums.Events.IMAGE_RENDERED, done);
  });
}

const frameCount = (viewport) =>
  viewport.type === Enums.ViewportType.STACK ? viewport.getImageIds().length : viewport.getNumberOfSlices?.() || 0;

const currentIndex = (viewport) =>
  viewport.type === Enums.ViewportType.STACK ? viewport.getCurrentImageIdIndex() : viewport.getSliceIndex?.() || 0;

/** 슬라이스를 하나씩 넘기며 합성된 canvas를 넘겨준다 */
async function eachFrame(viewport, { overlay, annotations, maxSize, signal, onProgress }, fn) {
  const total = frameCount(viewport);
  const start = currentIndex(viewport);
  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw Object.assign(new Error('취소했습니다'), { name: 'AbortError' });
    const rendered = waitRendered(viewport.element);
    await csUtils.jumpToSlice(viewport.element, { imageIndex: i });
    viewport.render();
    await rendered;
    buildOverlay(viewport);
    await fn(await composeViewport(viewport, { overlay, annotations, maxSize }), i, total);
    onProgress?.(i + 1, total);
  }
  await csUtils.jumpToSlice(viewport.element, { imageIndex: start }).catch(() => {});
  viewport.render();
}

/** 시리즈 전체를 GIF Blob으로 */
export async function makeGif(viewport, opts = {}) {
  const { fps = 10 } = opts;
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);
  await eachFrame(viewport, opts, async (canvas) => {
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    gif.writeFrame(applyPalette(data, palette), width, height, { palette, delay });
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

/**
 * 시리즈 전체를 WebM Blob으로.
 * MediaRecorder는 "실제 시간"으로 기록하므로, 렌더링하며 바로 녹화하면 렌더링이 느린 만큼
 * 영상이 늘어진다. 그래서 (1) 모든 프레임을 먼저 그려 두고 (2) 정확히 1/fps 간격으로 재생하며 녹화한다.
 */
export async function makeWebm(viewport, opts = {}) {
  const mimeType = webmMimeType();
  if (!mimeType) throw new Error('이 브라우저는 WebM 녹화를 지원하지 않습니다 (GIF를 사용하세요)');
  const { fps = 10, signal, onProgress } = opts;
  const total = frameCount(viewport);
  if (!total) throw new Error('내보낼 프레임이 없습니다');

  // (1) 프레임 준비 — 메모리 보호를 위해 크기를 미리 확인
  const bitmaps = [];
  let width = 0;
  let height = 0;
  try {
    await eachFrame(viewport, { ...opts, onProgress: (done, t) => onProgress?.(done, t * 2) }, async (canvas, i) => {
      if (i === 0) {
        width = canvas.width;
        height = canvas.height;
        const estimate = width * height * 4 * total;
        if (estimate > 500 * 1024 ** 2) {
          throw new Error(`프레임이 너무 큽니다 (약 ${Math.round(estimate / 1024 ** 2)}MB). 최대 크기를 줄이거나 GIF로 저장하세요`);
        }
      }
      bitmaps.push(await createImageBitmap(canvas));
    });

    // (2) 정확한 간격으로 재생하며 녹화
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const ctx = out.getContext('2d');
    const stream = out.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1024 * 1024 * 8 });
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();

    const frameMs = 1000 / fps;
    const t0 = performance.now();
    for (let i = 0; i < bitmaps.length; i++) {
      if (signal?.aborted) throw Object.assign(new Error('취소했습니다'), { name: 'AbortError' });
      ctx.drawImage(bitmaps[i], 0, 0);
      track.requestFrame?.();
      onProgress?.(total + i + 1, total * 2);
      const nextAt = t0 + (i + 1) * frameMs;
      const wait = nextAt - performance.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    // 마지막 프레임이 잘리지 않도록 한 프레임만큼 더 유지
    await new Promise((r) => setTimeout(r, frameMs));
    await new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.stop();
    });
    return new Blob(chunks, { type: mimeType.split(';')[0] });
  } finally {
    bitmaps.forEach((b) => b.close?.());
  }
}

export function videoExtension(format) {
  return format === 'webm' ? 'webm' : 'gif';
}

export async function makeVideo(viewport, format, opts) {
  return format === 'webm' ? makeWebm(viewport, opts) : makeGif(viewport, opts);
}

// ───────────────── 일괄 내보내기 ─────────────────

/** 화면 밖 임시 뷰포트에서 시리즈를 렌더링 (현재 화면을 건드리지 않음) */
async function withTempViewport(size, fn) {
  const engine = getEngine();
  if (!engine) throw new Error('렌더링 엔진이 준비되지 않았습니다');
  const viewportId = `export-temp-${Date.now()}`;
  const element = document.createElement('div');
  element.style.cssText = `position:fixed;left:-20000px;top:0;width:${size}px;height:${size}px;background:#000;`;
  document.body.appendChild(element);
  engine.enableElement({ viewportId, type: Enums.ViewportType.STACK, element, defaultOptions: { background: [0, 0, 0] } });
  try {
    return await fn(engine.getViewport(viewportId));
  } finally {
    try {
      engine.disableElement(viewportId);
    } catch {
      /* noop */
    }
    element.remove();
  }
}

export function safeFileName(series) {
  const raw = [series.modality, series.seriesNumber, series.seriesDescription].filter(Boolean).join('_');
  return (raw || 'series').replace(/[^\w가-힣.-]+/g, '_').slice(0, 80);
}

/**
 * 여러 시리즈를 각각 동영상으로 만들어 ZIP 하나로 저장
 * @param seriesList 스토어의 시리즈 객체들
 * @param onProgress ({ seriesDone, seriesTotal, name, frame, frames })
 */
export async function batchExport(seriesList, { format = 'gif', fps = 10, maxSize = 512, overlay = true, signal, onProgress = () => {} } = {}) {
  const files = [];
  const failed = [];
  for (let i = 0; i < seriesList.length; i++) {
    const series = seriesList[i];
    onProgress({ seriesDone: i, seriesTotal: seriesList.length, name: series.seriesDescription, frame: 0, frames: series.imageIds.length });
    try {
      const blob = await withTempViewport(maxSize, async (vp) => {
        await vp.setStack(series.imageIds, 0);
        vp.resetCamera();
        vp.render();
        await new Promise((r) => setTimeout(r, 60));
        return makeVideo(vp, format, {
          fps,
          maxSize,
          overlay,
          annotations: false, // 임시 뷰포트에는 측정이 없음
          signal,
          onProgress: (frame, frames) =>
            onProgress({ seriesDone: i, seriesTotal: seriesList.length, name: series.seriesDescription, frame, frames }),
        });
      });
      files.push({ name: `${String(i + 1).padStart(2, '0')}_${safeFileName(series)}.${videoExtension(format)}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      console.warn('batch export failed', series.seriesDescription, e);
      failed.push(series.seriesDescription);
    }
  }
  onProgress({ seriesDone: seriesList.length, seriesTotal: seriesList.length, name: '', frame: 0, frames: 0 });
  if (!files.length) throw new Error(`내보내기에 실패했습니다${failed.length ? ` (${failed.join(', ')})` : ''}`);
  return { zip: makeZip(files), files, failed };
}

export { downloadBlob };
