/**
 * DabbaView Web 서비스 워커 — 홈 화면에 추가해서 앱처럼 쓰고, 인터넷이 없어도 열리게
 *
 * - 화면(HTML)은 네트워크 먼저, 안 되면 저장해 둔 것 (새 배포를 바로 받되 비행기 모드에서도 열림)
 * - 번들 · 글꼴 · 아이콘 등 주소에 해시가 있는 파일은 저장해 둔 것 먼저 (빠르고 오프라인에서도 동작)
 * - version.json은 늘 네트워크로만 (새 버전 알림이 캐시 때문에 안 뜨지 않게)
 * - 영상 파일(DICOM)은 절대 저장하지 않는다 — 환자 정보가 브라우저 캐시에 남지 않게
 *   (클라우드에서 받은 파일 캐시는 앱이 IndexedDB에서 따로 관리하고, 설정에서 지울 수 있다)
 */
// 빌드할 때 vite.config.js가 이 자리에 버전을 새겨 넣는다 → 새 배포 = 새 캐시, 옛 캐시는 지움
const VERSION = 'dv-__SW_VERSION__';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const KEEP = new Set([SHELL, ASSETS]);

// 처음 설치할 때 받아 두는 것 (나머지는 쓰면서 채움)
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png'];

/** 한 개씩 받아서 캐시 — 하나가 실패해도 나머지는 저장 (addAll은 하나만 실패해도 전부 취소됨) */
async function cacheEach(cacheName, urls) {
  const cache = await caches.open(cacheName);
  await Promise.all(
    urls.map((url) =>
      fetch(url, { cache: 'reload' })
        .then((res) => (res.ok ? cache.put(url, res) : undefined))
        .catch(() => undefined),
    ),
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await cacheEach(SHELL, PRECACHE);
      try {
        // 빌드가 만들어 둔 목록(번들 · 코덱 WASM 등)을 미리 받아 두면 인터넷 없이도 영상을 열 수 있다
        const res = await fetch('./precache.json', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          await cacheEach(ASSETS, data.files || []);
        }
      } catch {
        /* 목록이 없으면 쓰면서 채운다 */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('dv-') && !KEEP.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/** 앱에서 '지금 업데이트'를 누르면 기다리던 새 워커를 바로 적용 */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

const isHashedAsset = (url) => /\/assets\/.+\.[0-9a-zA-Z_-]{8,}\.(js|css|wasm|woff2?|ttf|png|svg|jpg)$/.test(url.pathname);
const isStaticFile = (url) => /\.(css|js|wasm|woff2?|ttf|png|svg|jpg|jpeg|gif|ico|webmanifest)$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 클라우드 API 등은 그대로 통과
  if (url.pathname.endsWith('/version.json')) return; // 새 버전 확인은 늘 네트워크로

  // 화면 이동(주소창·홈 화면 아이콘): 네트워크 먼저 → 실패하면 저장해 둔 화면
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./'))),
    );
    return;
  }

  if (!isStaticFile(url)) return; // 그 밖의 요청(데이터 등)은 건드리지 않음

  // 해시가 붙은 파일은 내용이 바뀌면 주소도 바뀌므로 저장해 둔 것을 먼저 써도 안전
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit && isHashedAsset(url)) return hit;
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || fromNetwork;
    }),
  );
});
