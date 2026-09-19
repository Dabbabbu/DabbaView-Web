// 클라우드 연동 설정: 앱에 내장된 키는 없고, 각 사용자가 ⚙ 설정 창에서 직접 입력한다.
// 입력한 값은 그 사용자의 브라우저(localStorage)에만 저장된다.
const KEY = 'dabbaview.cloud';

const defaults = {
  googleClientId: '',
  googleApiKey: '',
  googleAppId: '',
  googleScope: 'https://www.googleapis.com/auth/drive.readonly',
  msClientId: '',
  msAuthority: 'https://login.microsoftonline.com/common',
};

export function getCloudConfig() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    /* 저장소 사용 불가 */
  }
  const merged = { ...defaults };
  for (const [k, v] of Object.entries(saved)) if (v) merged[k] = v;
  return merged;
}

export const isGoogleConfigured = (cfg = getCloudConfig()) => !!(cfg.googleClientId && cfg.googleApiKey);
export const isOneDriveConfigured = (cfg = getCloudConfig()) => !!cfg.msClientId;

export function saveCloudConfig(cfg) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* noop */
  }
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`));
    document.head.appendChild(s);
  });
}
