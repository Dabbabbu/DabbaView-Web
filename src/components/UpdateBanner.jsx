import { useEffect, useState } from 'react';
import { APP_VERSION } from '../version';

// 새 버전 확인
//  1) 배포본과 함께 올라가는 version.json (같은 주소) - 새로 배포되면 바로 알아챔
//  2) 안 되면 GitHub Releases 태그
// 웹은 캐시 때문에 열어 둔 탭이 옛 버전으로 남을 수 있어 새로고침을 권한다.
const VERSION_JSON = 'version.json';
const RELEASES_API = 'https://api.github.com/repos/Dabbabbu/DabbaView-Web/releases/latest';
const SKIP_KEY = 'dabbaview.update.skip';

const parse = (text) => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(text || '').trim());
  return m ? [+m[1], +m[2], +m[3]] : null;
};

export function isNewer(latest, current) {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

async function latestTag() {
  try {   // 배포본의 version.json (캐시 무시)
    const res = await fetch(`${VERSION_JSON}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data?.version) return { tag: data.version, url: null };
    }
  } catch {
    /* 파일이 없거나 오프라인 */
  }
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
    if (res.ok) {
      const data = await res.json();
      if (data?.tag_name) return { tag: data.tag_name, url: data.html_url };
    }
  } catch {
    /* 네트워크가 없으면 조용히 넘어감 */
  }
  return null;
}

/** 새 버전이 나왔으면 위쪽에 띠로 알리고 새로고침을 권함 (캐시 때문에 그냥 두면 옛 버전이 남음) */
export default function UpdateBanner() {
  const [found, setFound] = useState(null);

  useEffect(() => {
    let alive = true;
    latestTag().then((r) => {
      if (!alive || !r) return;
      const skipped = localStorage.getItem(SKIP_KEY) || '';
      if (isNewer(r.tag, APP_VERSION) && skipped !== r.tag) setFound(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!found) return null;
  const reload = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs || []).map((r) => r.unregister()));
    } catch {
      /* 캐시를 못 지워도 새로고침은 함 */
    }
    window.location.reload(true);
  };
  return (
    <div className="update-banner">
      <span>
        새 버전 <b>v{String(found.tag).replace(/^v/, '')}</b>이 있습니다 (지금 v{APP_VERSION}). 새로고침하면 최신 버전으로 바뀝니다.
      </span>
      <button className="primary" onClick={reload}>새로고침</button>
      {found.url && (
        <a href={found.url} target="_blank" rel="noreferrer">변경 내용</a>
      )}
      <button
        className="ghost"
        onClick={() => {
          localStorage.setItem(SKIP_KEY, found.tag);
          setFound(null);
        }}
        title="이 버전은 다시 알리지 않습니다"
      >
        나중에
      </button>
    </div>
  );
}
