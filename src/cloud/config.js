// 클라우드 연동 설정: .env(VITE_*) 기본값 + 앱 설정창(localStorage)에서 덮어쓰기
const KEY = 'dabbaview.cloud';

const defaults = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  googleApiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
  googleAppId: import.meta.env.VITE_GOOGLE_APP_ID || '',
  googleScope: 'https://www.googleapis.com/auth/drive.readonly',
  msClientId: import.meta.env.VITE_MS_CLIENT_ID || '',
  msAuthority: import.meta.env.VITE_MS_AUTHORITY || 'https://login.microsoftonline.com/common',
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

/** 동시 다운로드 제한 */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        results[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return results;
}
