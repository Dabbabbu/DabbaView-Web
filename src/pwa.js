/**
 * PWA — 안드로이드 · 데스크톱에서 '홈 화면에 추가'로 앱처럼 쓰기
 *
 * - 서비스 워커(public/sw.js)를 등록해 인터넷이 없어도 앱이 열리게 함
 * - 브라우저가 설치를 제안할 수 있으면(beforeinstallprompt) 그 기회를 붙잡아 두었다가
 *   기능 검색의 '앱으로 설치'에서 쓴다 (한 번 쓰면 사라짐)
 */
let deferredPrompt = null;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(canInstall()));

/** 설치 버튼을 보여 줄 수 있는 상태인지 */
export function canInstall() {
  return !!deferredPrompt;
}

/** 이미 앱으로 실행 중인지 (홈 화면 아이콘 · 설치된 창) */
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function onInstallAvailable(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 설치 안내를 띄움 → 'accepted' | 'dismissed' | 'unavailable' */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  try {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    return outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'dismissed';
  }
}

/** iOS Safari 등 자동 설치가 없는 브라우저용 안내 문구 */
export function manualInstallHint() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'Safari 아래 공유 버튼 → "홈 화면에 추가"를 누르면 앱처럼 쓸 수 있습니다.';
  if (/Android/.test(ua)) return 'Chrome 오른쪽 위 ⋮ → "앱 설치" 또는 "홈 화면에 추가"를 누르세요.';
  return '브라우저 주소창 오른쪽의 설치 아이콘(⊕)을 누르면 앱처럼 쓸 수 있습니다.';
}

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // 브라우저 기본 배너 대신 우리가 원할 때 띄움
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const register = () => {
    // base가 상대 경로라서 GitHub Pages 하위 경로(/DabbaView-Web/)에서도 그대로 동작
    const url = new URL('sw.js', document.baseURI);
    navigator.serviceWorker.register(url, { scope: './' }).catch(() => {
      /* 사파리 시크릿 창 등 등록이 막힌 환경 — 앱은 그대로 동작 */
    });
  };
  // 첫 화면을 먼저 띄우고 등록하되, load가 이미 끝났으면 바로 (모듈이 늦게 실행되는 경우)
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);
}
