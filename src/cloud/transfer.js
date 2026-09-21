// Google Drive / OneDrive 공통: 폴더 재귀 탐색 + 병렬 다운로드 (진행률, 재시도, 취소)
import { isObviouslyNotDicom } from '../dicom/loader';
import { cacheGet, cachePut } from './cache';

const MAX_DEPTH = 20;
const LIST_CONCURRENCY = 4;
const DOWNLOAD_CONCURRENCY = 6;
const RETRIES = 3;

export function abortError() {
  const e = new Error('취소했습니다');
  e.name = 'AbortError';
  return e;
}

export const isAbort = (e) => e?.name === 'AbortError';

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(abortError());
      },
      { once: true },
    );
  });

/** 다운로드할 가치가 있는 파일인가 (이미지·문서 등 명백히 DICOM이 아닌 것은 건너뜀, ZIP은 받음) */
export const wantFile = (name) => !isObviouslyNotDicom(name);

/**
 * 폴더들을 너비 우선으로 병렬 탐색해서 파일 목록을 모은다.
 * @param roots 시작 폴더들
 * @param list  (folder) => Promise<{ folders: any[], files: {name,size}[] }>
 * @param onProgress ({ folders, files, skipped, bytes }) 탐색 중 누적 수치
 */
export async function crawl(roots, list, { signal, onProgress = () => {} } = {}) {
  const queue = roots.map((f) => ({ folder: f, depth: 0, path: (typeof f === 'object' && f.name) || '' }));
  const files = [];
  const stats = { folders: 0, files: 0, skipped: 0, bytes: 0 };
  let active = 0;
  let error = null;

  await new Promise((resolve, reject) => {
    const pump = () => {
      if (error) return;
      if (!queue.length && !active) return resolve();
      while (active < LIST_CONCURRENCY && queue.length) {
        const { folder, depth, path } = queue.shift();
        active++;
        list(folder)
          .then(({ folders, files: found }) => {
            throwIfAborted(signal);
            stats.folders++;
            const sub = (f) => [path, typeof f === 'object' ? f.name : ''].filter(Boolean).join('/');
            if (depth < MAX_DEPTH) folders.forEach((f) => queue.push({ folder: f, depth: depth + 1, path: sub(f) }));
            for (const f of found) {
              f.dvPath = [path, f.name].filter(Boolean).join('/'); // 클라우드 폴더 경로 (어디서 왔는지 표시)
              if (wantFile(f.name)) {
                files.push(f);
                stats.files++;
                stats.bytes += Number(f.size) || 0;
              } else stats.skipped++;
            }
            onProgress({ ...stats });
          })
          .catch((e) => {
            error = e;
            reject(e);
          })
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    pump();
  });
  return { files, stats };
}

/**
 * 파일들을 병렬로 받아 File[] 로 만든다. 바이트 단위 진행률, 429/5xx(및 Drive 속도 제한 403) 재시도.
 * cacheKey가 있으면 브라우저 캐시(IndexedDB)에서 먼저 찾고, 새로 받은 파일은 캐시에 넣는다.
 * @param request (file, signal) => Promise<Response>
 * @param cacheKey (file) => string | null
 * @param onProgress ({ done, total, bytes, totalBytes, failed, cached })
 */
export async function downloadAll(files, request, { signal, onProgress = () => {}, cacheKey, cachePrefix, source } = {}) {
  const total = files.length;
  const totalBytes = files.reduce((s, f) => s + (Number(f.size) || 0), 0);
  let done = 0;
  let bytes = 0;
  let cached = 0;
  const failed = [];
  let last = 0;
  const report = (force) => {
    const now = performance.now();
    if (!force && now - last < 100) return; // 초당 10회까지만 갱신
    last = now;
    onProgress({ done, total, bytes, totalBytes, failed: failed.length, cached });
  };

  const fetchOne = async (f) => {
    for (let attempt = 0; ; attempt++) {
      throwIfAborted(signal);
      const res = await request(f, signal);
      if (res.ok) return res;
      const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && /rate ?limit/i.test(await res.clone().text()));
      if (!retryable || attempt >= RETRIES) throw new Error(`HTTP ${res.status}`);
      const wait = Number(res.headers.get('Retry-After')) * 1000 || 1000 * 2 ** attempt;
      await sleep(wait + Math.random() * 300, signal);
    }
  };

  const out = new Array(total);
  let next = 0;
  const worker = async () => {
    while (next < total) {
      const i = next++;
      const f = files[i];
      let got = 0;
      const key = cacheKey?.(f);
      try {
        throwIfAborted(signal);
        const hit = key ? await cacheGet(key) : null;
        if (hit) {
          out[i] = new File([hit], f.name || f.id, { type: 'application/octet-stream' });
          if (f.dvPath) out[i].dvPath = f.dvPath;
          bytes += hit.size;
          cached++;
          done++;
          report();
          continue;
        }
        const res = await fetchOne(f);
        // 스트림으로 읽으며 바이트 진행률 갱신
        const reader = res.body?.getReader();
        let blob;
        if (reader) {
          const chunks = [];
          for (;;) {
            const { done: end, value } = await reader.read();
            if (end) break;
            chunks.push(value);
            got += value.length;
            bytes += value.length;
            report();
          }
          blob = new Blob(chunks);
        } else {
          blob = await res.blob();
          got = blob.size;
          bytes += got;
        }
        out[i] = new File([blob], f.name || f.id, { type: 'application/octet-stream' });
        if (f.dvPath) out[i].dvPath = f.dvPath;
        if (key) cachePut(key, blob, { name: f.name, source, replacePrefix: cachePrefix?.(f) }); // 기다리지 않음
      } catch (e) {
        if (isAbort(e) || signal?.aborted) throw abortError();
        console.warn('download failed', f.name, e);
        failed.push(f.name);
        bytes -= got;
      }
      done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, total) }, worker));
  report(true);
  const ok = out.filter(Boolean);
  if (!ok.length && failed.length) throw new Error(`파일 ${failed.length}개를 받지 못했습니다`);
  return { files: ok, failed, cached };
}

export function formatBytes(b) {
  if (!b) return '0 KB';
  if (b < 1024 ** 2) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(b < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

/** 탐색/다운로드 진행 상황 → 로딩 바 표시용 */
export function crawlStatus(source, s) {
  return {
    label: `${source} 폴더 확인 중…`,
    done: 0,
    total: 0,
    detail: `폴더 ${s.folders}개 · 파일 ${s.files}개${s.bytes ? ` (${formatBytes(s.bytes)})` : ''}${s.skipped ? ` · 제외 ${s.skipped}개` : ''}`,
  };
}

export function downloadStatus(source, p) {
  const useBytes = p.totalBytes > 0;
  // 목록의 크기 정보가 실제보다 작을 수 있으므로 받은 양보다 작게 표시하지 않음
  p = { ...p, totalBytes: Math.max(p.totalBytes, p.bytes) };
  return {
    label: `${source}에서 다운로드 중…`,
    done: useBytes ? p.bytes : p.done,
    total: useBytes ? p.totalBytes : p.total,
    detail: `${p.done}/${p.total}개${useBytes ? ` · ${formatBytes(p.bytes)} / ${formatBytes(p.totalBytes)}` : ''}${p.cached ? ` · 캐시 ${p.cached}개` : ''}${p.failed ? ` · 실패 ${p.failed}` : ''}`,
  };
}
