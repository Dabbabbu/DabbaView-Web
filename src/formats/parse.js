// DICOM 외 볼륨 포맷 파서: NIfTI(.nii/.nii.gz), NRRD(.nrrd/.nhdr), NumPy(.npy)
// 결과는 공통 형태로 반환한다:
//   { name, dims:[nx,ny,nz], spacing:[sx,sy,sz], data: TypedArray (x가 가장 빠른 축),
//     origin:[x,y,z] (LPS mm), direction:[rowCos(3), colCos(3), normal(3)] (LPS), slope, intercept, format }

export const VOLUME_EXT = /\.(nii|nii\.gz|nhdr|nrrd|npy)$/i;

export function isVolumeFile(name = '') {
  return VOLUME_EXT.test(name);
}

async function bytesOf(file) {
  let buf = new Uint8Array(await file.arrayBuffer());
  // gzip (.gz 또는 매직 1f 8b)
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return buf;
}

export async function parseVolumeFile(file) {
  const bytes = await bytesOf(file);
  const name = file.name;
  if (/\.npy$/i.test(name)) return parseNpy(bytes, name);
  if (/\.(nrrd|nhdr)$/i.test(name)) return parseNrrd(bytes, name);
  return parseNifti(bytes, name);
}

// ───────────────────────── NIfTI ─────────────────────────

const NIFTI_TYPES = {
  2: ['Uint8Array', 1],
  4: ['Int16Array', 2],
  8: ['Int32Array', 4],
  16: ['Float32Array', 4],
  64: ['Float64Array', 8],
  256: ['Int8Array', 1],
  512: ['Uint16Array', 2],
  768: ['Uint32Array', 4],
};

export function parseNifti(bytes, name) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sizeof = dv.getInt32(0, true);
  let little = sizeof === 348;
  let v2 = false;
  if (!little && dv.getInt32(0, false) !== 348) {
    // NIfTI-2는 첫 4바이트가 540
    if (dv.getInt32(0, true) === 540) {
      little = true;
      v2 = true;
    } else if (dv.getInt32(0, false) === 540) {
      little = false;
      v2 = true;
    } else throw new Error(`${name}: NIfTI 헤더를 읽을 수 없습니다`);
  }

  const dim = [];
  let datatype;
  let pixdim = [];
  let voxOffset;
  let sclSlope;
  let sclInter;
  let qformCode;
  let sformCode;
  let quatern = [0, 0, 0];
  let qoffset = [0, 0, 0];
  const srow = [[], [], []];

  if (!v2) {
    for (let i = 0; i < 8; i++) dim.push(dv.getInt16(40 + i * 2, little));
    datatype = dv.getInt16(70, little);
    for (let i = 0; i < 8; i++) pixdim.push(dv.getFloat32(76 + i * 4, little));
    voxOffset = dv.getFloat32(108, little);
    sclSlope = dv.getFloat32(112, little);
    sclInter = dv.getFloat32(116, little);
    qformCode = dv.getInt16(252, little);
    sformCode = dv.getInt16(254, little);
    quatern = [dv.getFloat32(256, little), dv.getFloat32(260, little), dv.getFloat32(264, little)];
    qoffset = [dv.getFloat32(268, little), dv.getFloat32(272, little), dv.getFloat32(276, little)];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) srow[r].push(dv.getFloat32(280 + (r * 4 + c) * 4, little));
  } else {
    datatype = dv.getInt16(12, little);
    for (let i = 0; i < 8; i++) dim.push(Number(dv.getBigInt64(16 + i * 8, little)));
    for (let i = 0; i < 8; i++) pixdim.push(dv.getFloat64(104 + i * 8, little));
    voxOffset = Number(dv.getBigInt64(168, little));
    sclSlope = dv.getFloat64(176, little);
    sclInter = dv.getFloat64(184, little);
    qformCode = dv.getInt32(344, little);
    sformCode = dv.getInt32(348, little);
    quatern = [dv.getFloat64(352, little), dv.getFloat64(360, little), dv.getFloat64(368, little)];
    qoffset = [dv.getFloat64(376, little), dv.getFloat64(384, little), dv.getFloat64(392, little)];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) srow[r].push(dv.getFloat64(400 + (r * 4 + c) * 8, little));
  }

  const type = NIFTI_TYPES[datatype];
  if (!type) throw new Error(`${name}: 지원하지 않는 NIfTI 데이터 형식 (${datatype})`);
  const [ctorName, bpp] = type;
  const dims = [dim[1] || 1, dim[2] || 1, dim[3] || 1];
  const spacing = [Math.abs(pixdim[1]) || 1, Math.abs(pixdim[2]) || 1, Math.abs(pixdim[3]) || 1];
  const count = dims[0] * dims[1] * dims[2];
  const data = readTyped(bytes, Math.max(voxOffset, v2 ? 544 : 352), ctorName, count, bpp, little);

  // 방향: sform(srow) > qform(quaternion) > pixdim
  let rasDir; // 열 방향 벡터 3개 (i,j,k 축의 RAS 방향)
  let rasOrigin;
  if (sformCode > 0) {
    rasDir = [
      norm([srow[0][0], srow[1][0], srow[2][0]]),
      norm([srow[0][1], srow[1][1], srow[2][1]]),
      norm([srow[0][2], srow[1][2], srow[2][2]]),
    ];
    rasOrigin = [srow[0][3], srow[1][3], srow[2][3]];
  } else if (qformCode > 0) {
    const [b, c, d] = quatern;
    const a = Math.sqrt(Math.max(0, 1 - b * b - c * c - d * d));
    const qfac = pixdim[0] < 0 ? -1 : 1;
    rasDir = [
      [a * a + b * b - c * c - d * d, 2 * (b * c + a * d), 2 * (b * d - a * c)],
      [2 * (b * c - a * d), a * a + c * c - b * b - d * d, 2 * (c * d + a * b)],
      [2 * (b * d + a * c) * qfac, 2 * (c * d - a * b) * qfac, (a * a + d * d - c * c - b * b) * qfac],
    ];
    rasOrigin = qoffset;
  } else {
    rasDir = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    rasOrigin = [0, 0, 0];
  }
  // NIfTI는 RAS+, DICOM은 LPS → x, y 부호 반전
  const toLps = (v) => [-v[0], -v[1], v[2]];
  return {
    name,
    format: v2 ? 'NIfTI-2' : 'NIfTI-1',
    dims,
    spacing,
    data,
    origin: toLps(rasOrigin),
    direction: [toLps(rasDir[0]), toLps(rasDir[1]), toLps(rasDir[2])],
    slope: sclSlope || 1,
    intercept: sclSlope ? sclInter : 0,
  };
}

// ───────────────────────── NRRD ─────────────────────────

const NRRD_TYPES = {
  'signed char': 'Int8Array', int8: 'Int8Array', int8_t: 'Int8Array',
  uchar: 'Uint8Array', 'unsigned char': 'Uint8Array', uint8: 'Uint8Array', uint8_t: 'Uint8Array',
  short: 'Int16Array', 'signed short': 'Int16Array', 'short int': 'Int16Array', int16: 'Int16Array', int16_t: 'Int16Array',
  ushort: 'Uint16Array', 'unsigned short': 'Uint16Array', uint16: 'Uint16Array', uint16_t: 'Uint16Array',
  int: 'Int32Array', 'signed int': 'Int32Array', int32: 'Int32Array', int32_t: 'Int32Array',
  uint: 'Uint32Array', 'unsigned int': 'Uint32Array', uint32: 'Uint32Array', uint32_t: 'Uint32Array',
  float: 'Float32Array', double: 'Float64Array',
};
const BYTES = { Int8Array: 1, Uint8Array: 1, Int16Array: 2, Uint16Array: 2, Int32Array: 4, Uint32Array: 4, Float32Array: 4, Float64Array: 8 };

export function parseNrrd(bytes, name) {
  const headEnd = findHeaderEnd(bytes);
  const header = new TextDecoder('latin1').decode(bytes.subarray(0, headEnd));
  const fields = {};
  for (const line of header.split(/\r?\n/)) {
    const m = line.match(/^([^:#]+):[=\s]\s*(.*)$/);
    if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
  }
  const ctorName = NRRD_TYPES[(fields.type || '').toLowerCase()];
  if (!ctorName) throw new Error(`${name}: 지원하지 않는 NRRD type (${fields.type})`);
  if (fields.datafile || fields['data file']) throw new Error(`${name}: 분리형(detached) NRRD는 지원하지 않습니다`);
  const sizes = (fields.sizes || '').split(/\s+/).map(Number).filter(Number.isFinite);
  if (sizes.length < 2) throw new Error(`${name}: NRRD sizes를 읽을 수 없습니다`);
  const dims = [sizes[0], sizes[1], sizes[2] || 1];
  const little = (fields.endian || 'little') === 'little';
  const encoding = (fields.encoding || 'raw').toLowerCase();

  let raw = bytes.subarray(headEnd);
  if (encoding === 'gzip' || encoding === 'gz') raw = null; // 아래에서 비동기 처리 필요
  if (raw === null) throw new Error(`${name}: gzip NRRD는 .nrrd.gz 형태로 압축해 주세요`);
  if (encoding !== 'raw') throw new Error(`${name}: 지원하지 않는 NRRD encoding (${encoding})`);

  const count = dims[0] * dims[1] * dims[2];
  const data = readTyped(raw, 0, ctorName, count, BYTES[ctorName], little);

  // space directions: (a,b,c) (d,e,f) (g,h,i)
  const dirs = [...(fields['space directions'] || '').matchAll(/\(([^)]*)\)/g)].map((m) => m[1].split(',').map(Number));
  const spacing = dims.map((_, i) => (dirs[i] ? Math.hypot(...dirs[i]) : 1) || 1);
  const originVals = (fields['space origin'] || '').match(/\(([^)]*)\)/);
  let origin = originVals ? originVals[1].split(',').map(Number) : [0, 0, 0];
  let direction = [0, 1, 2].map((i) => (dirs[i] ? norm(dirs[i]) : [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]));
  // space가 RAS 계열이면 LPS로 변환
  const space = (fields.space || '').toLowerCase();
  if (space.includes('right-anterior-superior') || space === 'ras') {
    const f = (v) => [-v[0], -v[1], v[2]];
    direction = direction.map(f);
    origin = f(origin);
  }
  return { name, format: 'NRRD', dims, spacing, data, origin, direction, slope: 1, intercept: 0 };
}

function findHeaderEnd(bytes) {
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0a && bytes[i + 1] === 0x0a) return i + 2;
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a && bytes[i + 2] === 0x0d && bytes[i + 3] === 0x0a) return i + 4;
  }
  throw new Error('NRRD 헤더 끝을 찾을 수 없습니다');
}

// ───────────────────────── NumPy ─────────────────────────

const NPY_TYPES = { i1: 'Int8Array', u1: 'Uint8Array', i2: 'Int16Array', u2: 'Uint16Array', i4: 'Int32Array', u4: 'Uint32Array', f4: 'Float32Array', f8: 'Float64Array' };

export function parseNpy(bytes, name) {
  const magic = new TextDecoder().decode(bytes.subarray(1, 6));
  if (bytes[0] !== 0x93 || magic !== 'NUMPY') throw new Error(`${name}: .npy 파일이 아닙니다`);
  const major = bytes[6];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const headerLen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const headerStart = major === 1 ? 10 : 12;
  const header = new TextDecoder('latin1').decode(bytes.subarray(headerStart, headerStart + headerLen));
  const descr = header.match(/'descr':\s*'([^']+)'/)?.[1] || '';
  const fortran = /'fortran_order':\s*True/.test(header);
  const shape = (header.match(/'shape':\s*\(([^)]*)\)/)?.[1] || '')
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter(Number.isFinite);
  const little = descr[0] !== '>';
  const ctorName = NPY_TYPES[descr.slice(1)] || NPY_TYPES[descr.replace(/^[<>|=]/, '')];
  if (!ctorName) throw new Error(`${name}: 지원하지 않는 numpy dtype (${descr})`);
  if (fortran) throw new Error(`${name}: fortran_order 배열은 지원하지 않습니다`);
  if (shape.length < 2 || shape.length > 3) throw new Error(`${name}: 2D/3D 배열만 지원합니다 (shape ${shape.join('×')})`);

  // numpy는 (z, y, x) C 순서 → x가 가장 빠른 축
  const [nz, ny, nx] = shape.length === 3 ? shape : [1, shape[0], shape[1]];
  const count = nx * ny * nz;
  const data = readTyped(bytes, headerStart + headerLen, ctorName, count, BYTES[ctorName], little);
  return {
    name,
    format: 'NumPy',
    dims: [nx, ny, nz],
    spacing: [1, 1, 1], // .npy에는 간격 정보가 없음
    data,
    origin: [0, 0, 0],
    direction: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    slope: 1,
    intercept: 0,
  };
}

// ───────────────────────── 공통 ─────────────────────────

function readTyped(bytes, offset, ctorName, count, bpp, little) {
  const Ctor = { Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array }[ctorName];
  const start = bytes.byteOffset + Math.round(offset);
  const need = count * bpp;
  if (start + need > bytes.buffer.byteLength) throw new Error('파일이 잘렸거나 헤더 정보와 크기가 다릅니다');
  const hostLittle = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  if (little === hostLittle && start % bpp === 0) return new Ctor(bytes.buffer, start, count);
  // 정렬이 안 맞거나 엔디안이 다르면 복사하며 변환
  const out = new Ctor(count);
  const dv = new DataView(bytes.buffer, start, need);
  const getter = { Int8Array: 'getInt8', Uint8Array: 'getUint8', Int16Array: 'getInt16', Uint16Array: 'getUint16', Int32Array: 'getInt32', Uint32Array: 'getUint32', Float32Array: 'getFloat32', Float64Array: 'getFloat64' }[ctorName];
  for (let i = 0; i < count; i++) out[i] = dv[getter](i * bpp, little);
  return out;
}

function norm(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}
