// Cine / 다중 Phase 시리즈에서 Phase(시간 위상) 분리
//  1) Temporal Position Identifier (0020,0100)가 있으면 그 값으로 묶는다
//  2) 없으면 같은 슬라이스 위치가 N번 반복되는지 보고 반복 횟수를 Phase 수로 본다
import { instanceMeta } from './loader';

const cache = new Map(); // seriesKey → string[][] | null

export function getPhases(series) {
  if (!series) return null;
  if (cache.has(series.key)) return cache.get(series.key);
  const ids = series.imageIds;
  let phases = null;

  const temporal = ids.map((id) => instanceMeta.get(id)?.temporalPositionIdentifier);
  if (temporal.every((t) => Number.isFinite(t))) {
    const groups = new Map();
    ids.forEach((id, i) => {
      const t = temporal[i];
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(id);
    });
    if (groups.size > 1) phases = [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }

  if (!phases) {
    // 같은 위치가 반복되는 4D 시리즈
    const counts = new Map();
    const order = [];
    for (const id of ids) {
      const m = instanceMeta.get(id);
      const pos = m?.imagePositionPatient;
      const key = pos ? pos.map((v) => Math.round(v * 100) / 100).join(',') : String(m?.sliceLocation ?? '');
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      order.push(n - 1); // 이 위치가 몇 번째로 나왔는지 = phase 번호
    }
    const repeats = [...counts.values()];
    const k = repeats[0];
    if (k > 1 && repeats.every((r) => r === k) && counts.size > 1) {
      phases = Array.from({ length: k }, () => []);
      ids.forEach((id, i) => phases[order[i]].push(id));
    }
  }

  cache.set(series.key, phases);
  return phases;
}

const whereCache = new Map(); // seriesKey → Map(imageId → [phase, position])

/** imageId가 몇 번째 위상의 몇 번째 위치인지 → [phase, position] (위상 시리즈가 아니면 null) */
export function phaseWhere(series, imageId) {
  const phases = getPhases(series);
  if (!phases || !imageId) return null;
  let map = whereCache.get(series.key);
  if (!map) {
    map = new Map();
    phases.forEach((ids, p) => ids.forEach((id, i) => map.set(id, [p, i])));
    whereCache.set(series.key, map);
  }
  return map.get(imageId) || null;
}

export function clearPhaseCache() {
  cache.clear();
  whereCache.clear();
}
