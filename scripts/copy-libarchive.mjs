// libarchive.js(7z · RAR · tar.xz 등 풀기)의 웹워커와 WASM은 번들되지 않으므로 public/libarchive/로 복사한다.
// npm install · dev · build 때 자동으로 실행 (package.json scripts)
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'libarchive.js', 'dist');
const dest = join(root, 'public', 'libarchive');
if (!existsSync(src)) {
  console.warn('[copy-libarchive] libarchive.js가 설치되지 않았습니다 — 건너뜀');
} else {
  mkdirSync(dest, { recursive: true });
  for (const f of ['worker-bundle.js', 'libarchive.wasm']) cpSync(join(src, f), join(dest, f));
  console.log('[copy-libarchive] public/libarchive/ 준비됨');
}
