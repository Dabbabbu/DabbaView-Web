/**
 * 최근에 본 검사 — 이 기기에만 보관해 다음에 한 번 눌러 바로 열기
 *
 * 웹과 안드로이드 앱은 보안 때문에 '파일 경로'를 알 수 없다 (브라우저가 알려주지 않는다).
 * 그래서 경로를 기억하는 대신, 불러온 파일을 브라우저 저장소(IndexedDB)에 그대로 두고
 * 시작 화면에서 한 번 눌러 바로 다시 연다 — 파일 고르기 창을 거치지 않는다.
 *
 * - 서버로 올라가지 않는다. 이 기기 안에만 남는다.
 * - 언제든 하나씩 또는 모두 지울 수 있다 (시작 화면의 ×).
 * - 저장 공간이 모자라면 오래된 것부터 자동으로 지워진다 (설정 ▸ 캐시 한도와 같은 저장소).
 */
import { cachePutMany, cacheGetMany, cacheDeletePrefix, isCacheAvailable, getCacheSettings } from '../cloud/cache';

const KEY = 'dv.recent';
const PREFIX = 'local:';
const MAX_ENTRIES = 4;                     // 최근 네 건까지
const MAX_FILES = 4000;                    // 너무 많으면 보관하지 않는다
const MAX_BYTES = 2 * 1024 ** 3;           // 한 건이 2GB를 넘으면 보관하지 않는다

export const canRemember = () => isCacheAvailable() && getCacheSettings().enabled;

export function listRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((e) => e && e.id && e.count > 0) : [];
  } catch {
    return [];
  }
}

function saveList(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
  } catch {
    /* 저장소가 막혀 있어도 이번 보기에는 지장이 없다 */
  }
}

/** 시리즈 목록에서 '환자 · 검사' 한 줄 만들기 */
export function describeStudy(series) {
  if (!series?.length) return '';
  const m = series[0].meta || {};
  const images = series.reduce((n, s) => n + (s.imageIds?.length || 0), 0);
  const who = [m.patientName, m.studyDescription].filter(Boolean).join(' · ');
  return [who, `${series.length}개 시리즈 · ${images}장`].filter(Boolean).join('  ·  ');
}

/** 불러온 파일을 이 기기에 보관 (실패해도 조용히 넘어간다 — 보기에는 지장 없음) */
export async function rememberStudy(files, label, sub) {
  if (!canRemember() || !files?.length || !label) return false;
  const bytes = files.reduce((n, f) => n + (f.size || 0), 0);
  if (files.length > MAX_FILES || bytes > MAX_BYTES) return false;
  const id = `${Date.now().toString(36)}`;
  const items = files.map((f, i) => ({ key: `${PREFIX}${id}:${i}`, blob: f, name: f.name }));
  if (!(await cachePutMany(items, { source: 'local' }))) return false;

  const entry = { id, label, sub: sub || '', count: files.length, bytes, at: Date.now(),
                  names: files.map((f) => f.name) };
  // 같은 이름으로 다시 열었으면 옛 것은 지우고 새것으로 (목록이 같은 줄로 채워지지 않게)
  const before = listRecent();
  const kept = [entry, ...before.filter((e) => e.label !== label)].slice(0, MAX_ENTRIES);
  const keep = new Set(kept.map((e) => e.id));
  for (const gone of before) {
    if (!keep.has(gone.id)) cacheDeletePrefix(`${PREFIX}${gone.id}:`);
  }
  saveList(kept);
  return true;
}

/** 보관해 둔 파일 되살리기 → File[] (하나도 없으면 목록에서 지우고 null) */
export async function filesOfRecent(entry, onProgress) {
  if (!canRemember()) return null;     // 보관을 꺼 두었으면 목록은 그대로 두고 알리기만
  const files = [];
  const CHUNK = 200;                      // 한 번에 200개씩 (진행 표시를 위해 나눠 읽는다)
  for (let from = 0; from < entry.count; from += CHUNK) {
    const to = Math.min(from + CHUNK, entry.count);
    const keys = [];
    for (let i = from; i < to; i += 1) keys.push(`${PREFIX}${entry.id}:${i}`);
    const blobs = await cacheGetMany(keys);
    blobs.forEach((blob, k) => {
      if (blob) files.push(new File([blob], entry.names?.[from + k] || `${from + k}.dcm`));
    });
    if (onProgress) onProgress(to, entry.count);
  }
  if (!files.length) {
    forgetRecent(entry.id);
    return null;
  }
  return files;
}

export function forgetRecent(id) {
  saveList(listRecent().filter((e) => e.id !== id));
  cacheDeletePrefix(`${PREFIX}${id}:`);
}

export function forgetAllRecent() {
  for (const e of listRecent()) cacheDeletePrefix(`${PREFIX}${e.id}:`);
  saveList([]);
}

export function formatBytes(n) {
  if (!n) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let v = n;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u += 1;
  }
  return `${v >= 10 || u === 0 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}
