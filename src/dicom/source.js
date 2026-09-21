// 불러온 영상이 어디서 왔는지 — 폴더 이름 표시 (시리즈 카드 · 탭 제목)
// 파일마다 file.dvPath(폴더 끌어다 놓기 · 폴더 열기 · 압축 · 클라우드에서 붙임) 또는 webkitRelativePath를 쓴다.
const ARCHIVE_SEG = /\.(zip|7z|rar|iso|tar|tgz|tbz2?|txz|gz|bz2|xz)$/i;

export function filePath(file) {
  return (file && (file.dvPath || file.webkitRelativePath)) || '';
}

/** 전체 경로 → 폴더 경로 */
export function folderOf(path = '') {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}

/** 폴더 경로 → 짧은 이름 ('65001_CS MRCP' 또는 '묶음.zip ▸ MRCP') */
export function folderLabel(folder = '') {
  if (!folder) return '';
  const parts = folder.split('/').filter(Boolean);
  const a = parts.findIndex((p) => ARCHIVE_SEG.test(p));
  if (a >= 0) {
    const inner = parts.slice(a + 1).join('/');
    return inner ? `${parts[a]} ▸ ${inner}` : parts[a];
  }
  return parts[parts.length - 1] || folder;
}
