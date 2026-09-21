// 최소 ZIP 해제기: STORE(0) / DEFLATE(8) 지원, 브라우저 내장 DecompressionStream 사용.
// 클라우드/로컬에서 DICOM을 .zip으로 묶어 두는 경우가 많아서 불러오기 전에 풀어 준다.

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOC = 0x04034b50;
const MAX_DEPTH = 2; // zip 안의 zip까지

export function isZipName(name = '') {
  return /\.zip$/i.test(name);
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** ZIP File → File[] (폴더 경로는 이름에 유지) */
export async function unzipFile(file, depth = 0) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  // End of Central Directory: 파일 끝 쪽(주석 최대 64KB)에서 역방향 탐색
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${file.name}: ZIP 형식이 아닙니다`);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error(`${file.name}: ZIP64(4GB 초과)는 지원하지 않습니다`);

  const dec = new TextDecoder();
  let korean = null; // 윈도우에서 만든 ZIP: UTF-8 표시가 없으면 CP949(EUC-KR)로 읽어 봄
  try {
    korean = new TextDecoder('euc-kr', { fatal: true });
  } catch {
    /* 지원하지 않는 브라우저 */
  }
  const out = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== SIG_CEN) break;
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const rawName = buf.subarray(p + 46, p + 46 + nameLen);
    let name = dec.decode(rawName);
    if (!(flags & 0x800) && korean && /[^\x00-\x7f]/.test(name)) {
      try {
        name = korean.decode(rawName);
      } catch {
        /* 그대로 */
      }
    }
    p += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
    if (dv.getUint32(localOff, true) !== SIG_LOC) continue;
    const dataStart = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let bytes;
    if (method === 0) bytes = raw.slice();
    else if (method === 8) bytes = await inflateRaw(raw);
    else continue; // 암호화/기타 압축 방식은 건너뜀

    const base = name.split('/').pop();
    const inner = new File([bytes], base, { type: 'application/octet-stream' });
    inner.dvPath = name; // 압축 안의 경로 (어디서 왔는지 표시)
    if (depth < MAX_DEPTH && isZipName(base)) out.push(...(await unzipFile(inner, depth + 1)));
    else out.push(inner);
  }
  return out;
}

/** 목록 중 ZIP은 풀어서 합친다 */
export async function expandZips(files, onProgress = () => {}) {
  const out = [];
  const errors = [];
  let zips = 0;
  for (const f of files) {
    if (isZipName(f.name)) {
      zips++;
      onProgress(zips, f.name);
      try {
        out.push(...(await unzipFile(f)));
      } catch (e) {
        errors.push(e.message || String(e)); // 깨진 ZIP 하나 때문에 전체가 멈추지 않도록
      }
    } else out.push(f);
  }
  return { files: out, zips, errors };
}
