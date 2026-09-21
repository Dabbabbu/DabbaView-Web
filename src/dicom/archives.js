// 압축파일 풀기 — 데스크톱 DabbaView와 같은 형식을 브라우저 안에서 푼다 (서버로 올리지 않음)
//   ZIP                : 내장 해제기(unzip.js) → 안 되면(ZIP64 · 다른 압축 방식) libarchive
//   .gz(파일 하나)       : 브라우저 내장 DecompressionStream
//   .tar · .tgz · .tar.gz : 내장 TAR 읽기
//   7z · RAR · ISO · .tar.bz2 · .tar.xz 등 : libarchive.js (WebAssembly, 처음 한 번 약 1 MB 받음)
// 제한: 풀린 파일은 모두 메모리에 올라가므로 매우 큰 압축파일은 브라우저가 감당하지 못할 수 있다.
import { unzipFile } from './unzip';

const MAX_DEPTH = 2; // 압축 안의 압축까지
export const MAX_ARCHIVE_BYTES = 2 * 1024 ** 3; // 브라우저 한 번에 읽을 수 있는 크기의 안전선
const NOT_ARCHIVE = /\.(nii|nrrd|mha|npy)\.gz$/i; // 영상 형식 자체가 gz — 그대로 읽음
const ARCHIVE = /\.(zip|7z|rar|iso|tar|tgz|tbz2?|txz|gz|bz2|xz|cab|xar|cpio|lzh|lha)$/i;

export function isArchiveName(name = '') {
  const base = name.split('/').pop();
  return ARCHIVE.test(base) && !NOT_ARCHIVE.test(base) && !base.startsWith('.');
}

const junk = (name) => {
  const base = name.split('/').pop();
  return !base || base.startsWith('._') || base === '.DS_Store' || name.startsWith('__MACOSX/');
};

async function gunzip(file) {
  const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** TAR 바이트 → File[] (일반 파일만; 긴 이름 · pax 헤더 처리) */
function untar(bytes) {
  const out = [];
  const dec = new TextDecoder();
  const str = (o, n) => dec.decode(bytes.subarray(o, o + n)).replace(/\0.*$/s, '');
  let p = 0;
  let longName = null;
  while (p + 512 <= bytes.length) {
    if (bytes[p] === 0) break; // 끝 표시
    const size = parseInt(str(p + 124, 12).trim() || '0', 8) || 0;
    const type = String.fromCharCode(bytes[p + 156] || 48);
    let name = str(p, 100);
    const prefix = str(p + 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    const dataStart = p + 512;
    if (type === 'L') longName = str(dataStart, size); // GNU 긴 이름
    else if (type === 'x') {
      const m = /\d+ path=([^\n]*)\n/.exec(dec.decode(bytes.subarray(dataStart, dataStart + size)));
      if (m) longName = m[1];
    } else {
      if ((type === '0' || type === '\0' || type === '7') && !junk(longName || name)) {
        const full = longName || name;
        out.push(new File([bytes.slice(dataStart, dataStart + size)], full.split('/').pop(), { type: 'application/octet-stream' }));
      }
      longName = null;
    }
    p = dataStart + Math.ceil(size / 512) * 512;
  }
  return out;
}

let libarchiveReady = null;
async function libarchive() {
  if (!libarchiveReady) {
    libarchiveReady = import('libarchive.js').then(({ Archive }) => {
      // 워커 · WASM은 public/libarchive/에 복사됨 (scripts/copy-libarchive.mjs)
      Archive.init({ workerUrl: new URL('libarchive/worker-bundle.js', document.baseURI).href });
      return Archive;
    });
  }
  return libarchiveReady;
}

async function viaLibarchive(file) {
  const Archive = await libarchive();
  const archive = await Archive.open(file);
  try {
    if (await archive.hasEncryptedData()) throw new Error(`${file.name}: 암호가 걸린 압축파일이라 풀 수 없습니다 (압축 프로그램으로 먼저 푸세요)`);
    const tree = await archive.extractFiles();
    const out = [];
    const walk = (node, path) => {
      for (const [key, value] of Object.entries(node)) {
        if (value instanceof File) {
          if (!junk(path + key)) out.push(value);
        } else if (value && typeof value === 'object') walk(value, `${path}${key}/`);
      }
    };
    walk(tree, '');
    return out;
  } finally {
    archive.close?.();
  }
}

/** 압축파일 하나 → File[] */
export async function extractArchive(file, depth = 0) {
  if (file.size > MAX_ARCHIVE_BYTES) {
    throw new Error(`${file.name}: 2 GB가 넘는 압축파일은 브라우저에서 풀 수 없습니다 (데스크톱 DabbaView를 쓰거나 먼저 풀어서 폴더를 여세요)`);
  }
  const name = file.name.toLowerCase();
  let files;
  if (name.endsWith('.zip')) {
    try {
      files = await unzipFile(file, MAX_DEPTH); // 안쪽 압축은 아래에서 함께 처리
    } catch {
      files = await viaLibarchive(file); // ZIP64 · 다른 압축 방식
    }
  } else if (/\.(tgz|tar\.gz)$/.test(name)) {
    files = untar(await gunzip(file));
  } else if (name.endsWith('.tar')) {
    files = untar(new Uint8Array(await file.arrayBuffer()));
  } else if (name.endsWith('.gz')) {
    const bytes = await gunzip(file);
    // 사실은 TAR를 gz로 누른 것일 수도 있음 (ustar 표시 확인)
    const isTar = bytes.length > 262 && new TextDecoder().decode(bytes.subarray(257, 262)) === 'ustar';
    files = isTar ? untar(bytes) : [new File([bytes], file.name.replace(/\.gz$/i, ''), { type: 'application/octet-stream' })];
  } else {
    files = await viaLibarchive(file);
  }
  // 압축 안의 압축
  const out = [];
  for (const f of files) {
    if (depth < MAX_DEPTH && isArchiveName(f.name)) {
      try {
        out.push(...(await extractArchive(f, depth + 1)));
      } catch {
        out.push(f);
      }
    } else out.push(f);
  }
  return out;
}

/** 목록 중 압축파일은 풀어서 합친다 (하나가 망가져도 나머지는 계속) */
export async function expandArchives(files, onProgress = () => {}) {
  const out = [];
  const errors = [];
  let count = 0;
  for (const f of files) {
    if (isArchiveName(f.name)) {
      count++;
      onProgress(count, f.name);
      try {
        out.push(...(await extractArchive(f)));
      } catch (e) {
        errors.push(e.message || String(e));
      }
    } else out.push(f);
  }
  return { files: out, archives: count, errors };
}
