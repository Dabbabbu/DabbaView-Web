import { getDataSet } from './loader';

/**
 * 제자리(in-place) 익명화:
 *  원본 바이트를 복사한 뒤 식별 태그의 값 영역만 같은 길이로 덮어쓴다.
 *  파일 구조(길이/오프셋)가 그대로 유지되므로 Explicit/Implicit VR, 압축 전송구문 모두 안전.
 *  - 이름/주소/ID 등: 대체 문자열(공백 패딩)
 *  - 날짜: 생년월일은 연도만 유지(YYYY0101), 나머지 날짜는 유지 옵션
 *  - UID: 같은 길이의 새 UID로 일관되게 치환 (시리즈/검사 관계 유지)
 *  - Private 태그: 0으로 채움
 */

const BLANK_TAGS = [
  'x00080050', // Accession Number
  'x00080080', // Institution Name
  'x00080081', // Institution Address
  'x00080090', // Referring Physician
  'x00080092', // Referring Physician Address
  'x00080094', // Referring Physician Tel
  'x00081010', // Station Name
  'x00081040', // Institutional Department
  'x00081048', // Physicians of Record
  'x00081050', // Performing Physician
  'x00081060', // Reading Physician
  'x00081070', // Operators
  'x00101000', // Other Patient IDs
  'x00101001', // Other Patient Names
  'x00101040', // Patient Address
  'x00101060', // Mother's Birth Name
  'x00102154', // Patient Telephone
  'x00102160', // Ethnic Group
  'x00104000', // Patient Comments
  'x00181000', // Device Serial Number
  'x00200010', // Study ID
  'x00321032', // Requesting Physician
  'x00400006', // Scheduled Performing Physician
  'x00400244',
  'x00400253', // Performed Procedure Step ID
];

const UID_TAGS = ['x0020000d', 'x0020000e', 'x00080018', 'x00020003', 'x00200052', 'x00081155'];

export async function anonymizeImageIds(imageIds, { patientName = 'ANONYMOUS', patientId = 'ANON0001', keepDates = true, removePrivate = true } = {}) {
  const uidMap = new Map();
  const seen = new Set();
  const out = [];
  for (const imageId of imageIds) {
    const base = imageId.split('?')[0];
    if (seen.has(base)) continue; // 멀티프레임은 파일 하나
    seen.add(base);
    const ds = getDataSet(imageId);
    if (!ds) continue;
    const bytes = new Uint8Array(ds.byteArray); // copy
    const ctx = { bytes, uidMap, keepDates, removePrivate, patientName, patientId };
    anonymizeDataSet(ds, ctx, true);
    const sop = ds.string('x00080018') || String(out.length);
    out.push({ name: `${uidMap.get(sop) || sop}.dcm`, bytes });
  }
  return out;
}

function anonymizeDataSet(ds, ctx, topLevel) {
  const { bytes } = ctx;
  for (const tag of Object.keys(ds.elements)) {
    const el = ds.elements[tag];
    const group = parseInt(tag.slice(1, 5), 16);

    if (el.items) {
      if (ctx.removePrivate && group % 2 === 1) {
        fill(bytes, el, 0);
        continue;
      }
      el.items.forEach((it) => it.dataSet && anonymizeDataSet(it.dataSet, ctx, false));
      continue;
    }
    if (tag === 'x7fe00010') continue;
    if (group === 0x0002 && tag !== 'x00020003') continue;

    if (ctx.removePrivate && group % 2 === 1) {
      fill(bytes, el, 0);
    } else if (tag === 'x00100010') {
      writeString(bytes, el, ctx.patientName);
    } else if (tag === 'x00100020') {
      writeString(bytes, el, ctx.patientId);
    } else if (tag === 'x00100030') {
      const d = ds.string(tag) || '';
      writeString(bytes, el, d.length >= 4 ? d.slice(0, 4) + '0101' : '');
    } else if (BLANK_TAGS.includes(tag)) {
      writeString(bytes, el, '');
    } else if (UID_TAGS.includes(tag) || (el.vr === 'UI' && tag === 'x00081155')) {
      const old = (ds.string(tag) || '').replace(/\0/g, '');
      if (!old) continue;
      writeUid(bytes, el, mapUid(old, el.length, ctx.uidMap));
    } else if (!ctx.keepDates && (el.vr === 'DA' || /^x0008002[0-3]$/.test(tag))) {
      writeString(bytes, el, '19000101');
    }
  }
  return topLevel;
}

function fill(bytes, el, v) {
  bytes.fill(v, el.dataOffset, el.dataOffset + el.length);
}

function writeString(bytes, el, str) {
  const len = el.length;
  const enc = new TextEncoder().encode(str).slice(0, len);
  bytes.set(enc, el.dataOffset);
  bytes.fill(0x20, el.dataOffset + enc.length, el.dataOffset + len);
}

function writeUid(bytes, el, uid) {
  const len = el.length;
  const enc = new TextEncoder().encode(uid).slice(0, len);
  bytes.set(enc, el.dataOffset);
  bytes.fill(0x00, el.dataOffset + enc.length, el.dataOffset + len); // UID 패딩 = NULL
}

/** 같은 길이 이하의 새 UID (2.25.xxxx) — 같은 원본 UID는 같은 결과 */
function mapUid(old, maxLen, map) {
  if (map.has(old)) return map.get(old);
  const prefix = '2.25.';
  let digits = '';
  while (digits.length < 64) digits += String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
  digits = digits.replace(/^0+/, '1');
  let len = Math.min(old.length, maxLen);
  if (len <= prefix.length + 1) {
    map.set(old, old);
    return old;
  }
  const uid = prefix + digits.slice(0, len - prefix.length);
  map.set(old, uid);
  return uid;
}
