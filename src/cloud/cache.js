// 클라우드에서 받은 파일을 IndexedDB에 보관하는 LRU 캐시.
//  - blobs: key → Blob (파일 데이터)
//  - meta : { key, name, size, source, lastAccess, created } + lastAccess 인덱스 (LRU 삭제용)
// 키에 클라우드의 내용 버전(Google md5Checksum, OneDrive cTag)을 넣어서, 원본이 바뀌면 자동으로 새로 받는다.

const DB_NAME = 'dabbaview-cache';
const DB_VERSION = 1;
const SETTINGS_KEY = 'dabbaview.cache';
export const DEFAULT_LIMIT = 5 * 1024 ** 3; // 5 GB

let dbPromise = null;
let totalBytes = null; // 메모리에 유지하는 전체 크기 (처음 필요할 때 계산)
let evictTimer = null;

// ───────── 설정 ─────────

export function getCacheSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    /* 저장소 사용 불가 */
  }
  return {
    enabled: saved.enabled !== false,
    limit: Number(saved.limit) > 0 ? Number(saved.limit) : DEFAULT_LIMIT,
  };
}

export function saveCacheSettings({ enabled, limit }) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ enabled, limit }));
  } catch {
    /* noop */
  }
  scheduleEvict(0);
}

export const isCacheAvailable = () => typeof indexedDB !== 'undefined';

// ───────── IndexedDB ─────────

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('blobs');
        db.createObjectStore('meta', { keyPath: 'key' }).createIndex('lastAccess', 'lastAccess');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('캐시 DB가 다른 탭에서 사용 중입니다'));
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** 트랜잭션 실행: fn(stores)은 요청만 걸고, 완료(oncomplete) 시 fn의 반환값(또는 result 함수) 반환 */
async function run(storeNames, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    const stores = Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]));
    const result = fn(stores);
    tx.oncomplete = () => resolve(typeof result === 'function' ? result() : result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('캐시 트랜잭션 중단'));
  });
}

async function ensureTotal() {
  if (totalBytes !== null) return totalBytes;
  const stats = await cacheStats();
  totalBytes = stats.bytes;
  return totalBytes;
}

// ───────── 공개 API ─────────

/** 캐시에서 꺼내기 (없으면 null). 꺼내면 최근 사용 시각을 갱신 */
export async function cacheGet(key) {
  if (!isCacheAvailable() || !getCacheSettings().enabled) return null;
  try {
    const blob = await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
      let found = null;
      const req = blobs.get(key);
      req.onsuccess = () => {
        found = req.result || null;
        if (!found) return;
        const m = meta.get(key);
        m.onsuccess = () => m.result && meta.put({ ...m.result, lastAccess: Date.now() });
      };
      return () => found;
    });
    return blob;
  } catch (e) {
    console.warn('cache get failed', e);
    return null;
  }
}

/**
 * 캐시에 넣기. 한도를 넘으면 오래 안 쓴 것부터 삭제.
 * replacePrefix: 같은 파일의 이전 버전 키 접두사 (예: 'gdrive:<id>:') → 새 버전을 넣을 때 옛 버전은 지움
 */
export async function cachePut(key, blob, { name, source, replacePrefix } = {}) {
  if (!isCacheAvailable()) return;
  const { enabled, limit } = getCacheSettings();
  if (!enabled || blob.size > limit) return;
  try {
    await ensureTotal();
    const prevSize = await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
      let prev = 0;
      if (replacePrefix) {
        const old = meta.openCursor(IDBKeyRange.bound(replacePrefix, `${replacePrefix}\uffff`));
        old.onsuccess = () => {
          const c = old.result;
          if (!c) return;
          if (c.value.key !== key) {
            prev += c.value.size || 0;
            blobs.delete(c.value.key);
            c.delete();
          }
          c.continue();
        };
      }
      const m = meta.get(key);
      m.onsuccess = () => {
        prev += m.result?.size || 0; // 같은 키를 덮어쓰는 경우 (옛 버전 삭제분과 합산)
        const now = Date.now();
        blobs.put(blob, key);
        meta.put({ key, name, size: blob.size, source, lastAccess: now, created: m.result?.created || now });
      };
      return () => prev;
    });
    totalBytes += blob.size - prevSize;
    requestPersistence();
    if (totalBytes > limit) scheduleEvict(300);
  } catch (e) {
    // 브라우저 저장 공간 부족 등: 오래된 것을 정리하고 이번 파일은 캐시하지 않음
    console.warn('cache put failed', e);
    if (e?.name === 'QuotaExceededError') await evict(Math.max(0, (totalBytes || 0) - blob.size * 4));
  }
}

/** 여러 개를 한 번에 꺼내기 (없으면 그 자리는 null) — 검사 한 건을 되살릴 때 */
export async function cacheGetMany(keys) {
  if (!isCacheAvailable() || !getCacheSettings().enabled || !keys?.length) return keys.map(() => null);
  try {
    return await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
      const out = new Array(keys.length).fill(null);
      const now = Date.now();
      keys.forEach((key, i) => {
        const req = blobs.get(key);
        req.onsuccess = () => {
          out[i] = req.result || null;
          if (!out[i]) return;
          const m = meta.get(key);
          m.onsuccess = () => m.result && meta.put({ ...m.result, lastAccess: now });
        };
      });
      return () => out;
    });
  } catch (e) {
    console.warn('cache get many failed', e);
    return keys.map(() => null);
  }
}

/**
 * 여러 파일을 한 번에 넣기 (트랜잭션 하나) — 검사 한 건처럼 파일이 수백 개일 때 쓴다.
 * 하나씩 cachePut을 부르면 트랜잭션이 그만큼 생겨 느리다.
 */
export async function cachePutMany(items, { source } = {}) {
  if (!isCacheAvailable() || !items?.length) return false;
  const { enabled, limit } = getCacheSettings();
  const bytes = items.reduce((n, it) => n + (it.blob?.size || 0), 0);
  if (!enabled || bytes > limit) return false;
  try {
    await ensureTotal();
    const prevSize = await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
      let prev = 0;
      const now = Date.now();
      for (const { key, blob, name } of items) {
        const m = meta.get(key);
        m.onsuccess = () => {
          prev += m.result?.size || 0;
          blobs.put(blob, key);
          meta.put({ key, name, size: blob.size, source, lastAccess: now, created: m.result?.created || now });
        };
      }
      return () => prev;
    });
    totalBytes += bytes - prevSize;
    requestPersistence();
    if (totalBytes > limit) scheduleEvict(300);
    return true;
  } catch (e) {
    console.warn('cache put many failed', e);
    if (e?.name === 'QuotaExceededError') await evict(Math.max(0, (totalBytes || 0) - bytes * 2));
    return false;
  }
}

/** 접두사로 한꺼번에 지우기 (검사 한 건을 통째로 지울 때) */
export async function cacheDeletePrefix(prefix) {
  if (!isCacheAvailable() || !prefix) return 0;
  let freed = 0;
  try {
    await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
      const req = meta.openCursor(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        freed += c.value.size || 0;
        blobs.delete(c.value.key);
        c.delete();
        c.continue();
      };
    });
    if (totalBytes !== null) totalBytes = Math.max(0, totalBytes - freed);
  } catch (e) {
    console.warn('cache delete prefix failed', e);
  }
  return freed;
}

/** 전체 사용량 */
export async function cacheStats() {
  if (!isCacheAvailable()) return { count: 0, bytes: 0 };
  const stats = await run(['meta'], 'readonly', ({ meta }) => {
    const s = { count: 0, bytes: 0 };
    const req = meta.openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      s.count++;
      s.bytes += c.value.size || 0;
      c.continue();
    };
    return s;
  });
  totalBytes = stats.bytes;
  return stats;
}

/** 브라우저가 허용하는 저장 공간 (추정) */
export async function storageEstimate() {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { usage: e.usage || 0, quota: e.quota || 0 } : null;
  } catch {
    return null;
  }
}

export async function clearCache() {
  if (!isCacheAvailable()) return;
  await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
    blobs.clear();
    meta.clear();
  });
  totalBytes = 0;
}

/** 한도까지 오래 안 쓴 것부터 삭제 (LRU) */
export async function evict(target = getCacheSettings().limit) {
  if (!isCacheAvailable()) return 0;
  await ensureTotal();
  if (totalBytes <= target) return 0;
  let freed = 0;
  let removed = 0;
  await run(['blobs', 'meta'], 'readwrite', ({ blobs, meta }) => {
    const req = meta.index('lastAccess').openCursor(); // 오래된 순
    req.onsuccess = () => {
      const c = req.result;
      if (!c || totalBytes - freed <= target) return;
      freed += c.value.size || 0;
      removed++;
      blobs.delete(c.value.key);
      c.delete();
      c.continue();
    };
  });
  totalBytes -= freed;
  return removed;
}

function scheduleEvict(delay) {
  clearTimeout(evictTimer);
  evictTimer = setTimeout(() => evict().catch((e) => console.warn('cache evict failed', e)), delay);
}

let persistAsked = false;
function requestPersistence() {
  // 브라우저가 저장 공간이 부족할 때 캐시를 임의로 지우지 않도록 요청 (허용 여부는 브라우저가 결정)
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}
