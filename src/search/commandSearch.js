// 기능 찾기 (Ctrl/⌘+F) — 한글·영어·비슷한 말·초성으로 기능을 찾는다 (데스크톱 DabbaView와 같은 방식)
//   예) '내보내기', 'export', '저장', '동영상', '동영상으로 저장', 'ㄷㅇㅅ' → 내보내기 (동영상 GIF/WebM)

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';

export function choseong(text) {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0) - 0xac00;
    out += code >= 0 && code < 11172 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }
  return out;
}

export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s·….\-_/()…]+/g, '');
}

const isChoseong = (q) => q.length > 0 && [...q].every((c) => CHOSEONG.includes(c));

/** command: { label, path, keywords } → 점수 (0이면 결과에서 뺌) */
export function scoreCommand(query, cmd) {
  const q = normalize(query);
  if (!q) return 1;
  const name = normalize(cmd.label);
  const words = String(cmd.keywords || '')
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);
  const hay = normalize(`${cmd.path || ''} ${cmd.label} ${cmd.keywords || ''}`);
  let best = 0;
  if (name.startsWith(q)) best = 100;
  else if (name.includes(q)) best = 80;
  else if (words.includes(q)) best = 85;
  else if (hay.includes(q)) best = 60;
  // 입력 안에 든 낱말이 많이 맞을수록 위로 ('동영상으로 저장' → 동영상 + 저장)
  const hits = new Set(words.filter((w) => w.length >= 2 && q.includes(w)));
  if (hits.size) best = Math.max(best, 50 + 10 * hits.size);
  // 치는 중: '동영' → 동영상
  if (!best && q.length >= 2 && words.some((w) => w.startsWith(q))) best = 55;
  // 초성: ㄷㅇㅅ → 동영상
  if (isChoseong(q) && q.length >= 2 && choseong(`${cmd.label} ${cmd.keywords || ''}`).replace(/\s+/g, ' ').split(' ').some((w) => w.startsWith(q)))
    best = Math.max(best, 55);
  // 흩어진 글자 (ex: 'xlnk' → Crosslink)
  if (!best && q.length >= 3) {
    let i = 0;
    for (const ch of name) if (ch === q[i]) i++;
    if (i === q.length) best = 20;
  }
  if (best && cmd.disabled) best -= 15;
  return best;
}

export function searchCommands(query, commands, limit = 60) {
  return commands
    .map((cmd) => ({ cmd, score: scoreCommand(query, cmd) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.cmd.path.localeCompare(b.cmd.path))
    .slice(0, limit)
    .map((r) => r.cmd);
}

// 여러 명령에 공통으로 쓰는 비슷한 말
export const KW = {
  export: '내보내기 저장 export save 출력 다운로드 download',
  video: '동영상 비디오 video movie 영상저장 gif webm mp4 애니메이션 시네저장',
  image: '이미지 사진 그림 image png jpeg jpg 캡처 capture 스크린샷',
  open: '열기 불러오기 open load import 가져오기',
  cloud: '클라우드 cloud 드라이브 drive',
  settings: '설정 환경설정 옵션 settings preferences option',
  measure: '측정 measure 재기',
  window: '밝기 대조 윈도우 레벨 window level wl w/l',
};
