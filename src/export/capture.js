import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { Enums, utilities as csUtils } from '@cornerstonejs/core';
import { overlayCache, buildOverlay } from '../cornerstone/overlay';
import { downloadBlob } from './zip';

/**
 * 뷰포트 화면(영상 + 측정 SVG + 오버레이 텍스트)을 하나의 canvas로 합성
 * @param viewport cornerstone viewport
 * @param {{overlay?:boolean, annotations?:boolean, maxSize?:number}} opts
 */
export async function composeViewport(viewport, { overlay = true, annotations = true, maxSize } = {}) {
  const element = viewport.element;
  const src = viewport.getCanvas();
  const rect = element.getBoundingClientRect();
  let w = src.width;
  let h = src.height;
  let scale = 1;
  if (maxSize && Math.max(w, h) > maxSize) {
    scale = maxSize / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);

  if (annotations) {
    const svg = element.querySelector('svg.svg-layer');
    if (svg && svg.childElementCount) {
      const clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', rect.width);
      clone.setAttribute('height', rect.height);
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      try {
        const img = await loadImg(url);
        ctx.drawImage(img, 0, 0, w, h);
      } catch {
        /* SVG 합성 실패 시 영상만 */
      }
      URL.revokeObjectURL(url);
    }
  }

  if (overlay) {
    const data = overlayCache.get(viewport.id) || buildOverlay(viewport);
    drawOverlayText(ctx, data, w, h, w / rect.width);
  }
  return out;
}

function loadImg(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function drawOverlayText(ctx, data, w, h, pxScale = 1) {
  const fs = Math.max(10, Math.round(12 * pxScale));
  const lh = Math.round(fs * 1.3);
  const pad = Math.round(6 * pxScale);
  ctx.font = `${fs}px -apple-system, "Segoe UI", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  ctx.fillStyle = '#e8e8e8';
  const draw = (lines, x, y, align, fromBottom) => {
    ctx.textAlign = align;
    lines.forEach((t, i) => {
      const yy = fromBottom ? y - (lines.length - i) * lh : y + i * lh;
      ctx.fillText(t, x, yy);
    });
  };
  draw(data.topLeft || [], pad, pad, 'left');
  draw(data.topRight || [], w - pad, pad, 'right');
  draw(data.bottomLeft || [], pad, h - pad, 'left', true);
  draw(data.bottomRight || [], w - pad, h - pad, 'right', true);
  if (data.markers) {
    ctx.fillStyle = '#ffd23f';
    ctx.textAlign = 'center';
    ctx.fillText(data.markers.top, w / 2, pad);
    ctx.fillText(data.markers.bottom, w / 2, h - pad - lh);
    ctx.textAlign = 'left';
    ctx.fillText(data.markers.left, pad, h / 2 - fs / 2);
    ctx.textAlign = 'right';
    ctx.fillText(data.markers.right, w - pad, h / 2 - fs / 2);
  }
  ctx.shadowBlur = 0;
}

export async function saveImage(viewport, format = 'png', opts = {}) {
  const canvas = await composeViewport(viewport, opts);
  const type = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise((r) => canvas.toBlob(r, type, 0.92));
  const id = viewport.getCurrentImageId?.() || 'image';
  const safe = (opts.baseName || id.replace(/[^a-z0-9]+/gi, '_')).slice(0, 60);
  downloadBlob(blob, `${safe}.${format === 'jpeg' ? 'jpg' : 'png'}`);
}

function waitRendered(element) {
  return new Promise((resolve) => {
    const done = () => {
      element.removeEventListener(Enums.Events.IMAGE_RENDERED, done);
      clearTimeout(t);
      resolve();
    };
    const t = setTimeout(done, 400);
    element.addEventListener(Enums.Events.IMAGE_RENDERED, done);
  });
}

/**
 * 스택(또는 MPR 평면) 전체를 GIF로 내보내기
 */
export async function exportGif(viewport, { fps = 10, overlay = true, maxSize = 512, onProgress = () => {}, baseName = 'cine' } = {}) {
  const isStack = viewport.type === Enums.ViewportType.STACK;
  const total = isStack ? viewport.getImageIds().length : viewport.getNumberOfSlices();
  const startIndex = isStack ? viewport.getCurrentImageIdIndex() : viewport.getSliceIndex();
  const gif = GIFEncoder();
  const delay = Math.round(1000 / fps);

  for (let i = 0; i < total; i++) {
    const rendered = waitRendered(viewport.element);
    await csUtils.jumpToSlice(viewport.element, { imageIndex: i });
    viewport.render();
    await rendered;
    buildOverlay(viewport);
    const canvas = await composeViewport(viewport, { overlay, maxSize });
    const { data, width, height } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    const indexed = applyPalette(data, palette);
    gif.writeFrame(indexed, width, height, { palette, delay });
    onProgress(i + 1, total);
    if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  gif.finish();
  await csUtils.jumpToSlice(viewport.element, { imageIndex: startIndex });
  viewport.render();
  downloadBlob(new Blob([gif.bytes()], { type: 'image/gif' }), `${baseName}.gif`);
}
