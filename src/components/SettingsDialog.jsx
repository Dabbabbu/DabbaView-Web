import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import { getCloudConfig, saveCloudConfig, isGoogleConfigured, isOneDriveConfigured } from '../cloud/config';
import { useStore } from '../store/useStore';
import {
  getCacheSettings,
  saveCacheSettings,
  cacheStats,
  clearCache,
  storageEstimate,
  isCacheAvailable,
  DEFAULT_LIMIT,
} from '../cloud/cache';
import { formatBytes } from '../cloud/transfer';

const GB = 1024 ** 3;

export default function SettingsDialog({ onClose }) {
  const [cfg, setCfg] = useState(getCloudConfig);
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value.trim() });
  const [cache, setCache] = useState(() => {
    const c = getCacheSettings();
    return { enabled: c.enabled, limitGb: +(c.limit / GB).toFixed(2) };
  });
  const [usage, setUsage] = useState(null); // { count, bytes, quota }
  const [clearing, setClearing] = useState(false);

  const refreshUsage = useCallback(async () => {
    if (!isCacheAvailable()) return;
    const [stats, est] = await Promise.all([cacheStats().catch(() => ({ count: 0, bytes: 0 })), storageEstimate()]);
    setUsage({ ...stats, quota: est?.quota || 0 });
  }, []);
  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const onClear = async () => {
    if (!window.confirm('캐시에 보관한 클라우드 파일을 모두 지울까요? (다음에 열 때 다시 다운로드합니다)')) return;
    setClearing(true);
    try {
      await clearCache();
      useStore.getState().showToast('캐시를 비웠습니다');
    } catch (e) {
      useStore.getState().showToast(`캐시 비우기 실패: ${e.message}`, 'error');
    }
    setClearing(false);
    refreshUsage();
  };
  const limitBytes = Math.max(0.5, Number(cache.limitGb) || DEFAULT_LIMIT / GB) * GB;
  const origin = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

  const save = () => {
    saveCloudConfig(cfg);
    saveCacheSettings({ enabled: cache.enabled, limit: limitBytes }); // 한도를 줄이면 오래된 것부터 바로 정리
    useStore.getState().showToast('설정 저장됨');
    onClose();
  };

  return (
    <Modal
      title="설정"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" onClick={save}>
            저장
          </button>
        </>
      }
    >
      <div className="form">
        <p className="muted small">
          Google Drive / OneDrive를 쓰려면 본인의 API 키를 입력하세요. 앱에는 키가 들어 있지 않으며, 입력한 값은 이 브라우저(localStorage)에만
          저장되고 서버로 전송되지 않습니다. 발급 방법은{' '}
          <a href="https://github.com/Dabbabbu/DabbaView-Web#클라우드-연동-설정" target="_blank" rel="noreferrer">
            README
          </a>
          를 참고하세요.
        </p>
        <h3>
          Google Drive <Status ok={isGoogleConfigured(cfg)} />
        </h3>
        {!isGoogleConfigured(cfg) && <p className="key-notice">API 키를 입력해주세요 — OAuth Client ID와 API Key가 필요합니다.</p>}
        <label>
          OAuth Client ID
          <input className="input" value={cfg.googleClientId} onChange={set('googleClientId')} placeholder="xxxx.apps.googleusercontent.com" />
        </label>
        <label>
          API Key
          <input className="input" value={cfg.googleApiKey} onChange={set('googleApiKey')} placeholder="AIza…" />
        </label>
        <label>
          App ID (프로젝트 번호, 선택)
          <input className="input" value={cfg.googleAppId} onChange={set('googleAppId')} placeholder="123456789012" />
        </label>
        <p className="muted small">
          승인된 JavaScript 원본: <code>{window.location.origin}</code>
        </p>

        <h3>
          OneDrive (Microsoft) <Status ok={isOneDriveConfigured(cfg)} />
        </h3>
        {!isOneDriveConfigured(cfg) && <p className="key-notice">API 키를 입력해주세요 — Application (client) ID가 필요합니다.</p>}
        <label>
          Application (client) ID
          <input className="input" value={cfg.msClientId} onChange={set('msClientId')} placeholder="00000000-0000-0000-0000-000000000000" />
        </label>
        <label>
          Authority
          <input className="input" value={cfg.msAuthority} onChange={set('msAuthority')} />
        </label>
        <p className="muted small">
          SPA Redirect URI: <code>{origin}auth-redirect.html</code>
        </p>

        <h3>화면</h3>
        <label className="check">
          <input type="checkbox" checked={useStore((st) => st.sliceBar)} onChange={() => useStore.getState().toggleSliceBar()} /> 영상 오른쪽
          슬라이스 막대 (끌어서 빠르게 이동)
        </label>
        <label className="check">
          <input type="checkbox" checked={useStore((st) => st.dragPads)} onChange={() => useStore.getState().toggleDragPads()} /> 영상 아래 Zoom ·
          W/L 조절 칸
        </label>
        <label className="check">
          <input type="checkbox" checked={useStore((st) => st.autoLayout)} onChange={(e) => useStore.getState().setAutoLayout(e.target.checked)} />{' '}
          Auto 레이아웃 (영상을 열 때 시리즈 수에 맞게 칸 나누기)
        </label>

        <h3>캐시 (클라우드 파일)</h3>
        {!isCacheAvailable() ? (
          <p className="muted small">이 브라우저는 IndexedDB를 지원하지 않아 캐시를 쓸 수 없습니다.</p>
        ) : (
          <>
            <p className="muted small">
              Google Drive / OneDrive에서 받은 파일을 이 브라우저에 보관해서, 같은 파일을 다시 열 때 다운로드 없이 바로 엽니다. 클라우드에서 파일이
              바뀌면 새로 받습니다. 한도를 넘으면 가장 오래 안 쓴 파일부터 지웁니다.
            </p>
            <div className="cache-usage">
              <div className="progress wide">
                <div style={{ width: `${usage ? Math.min(100, (usage.bytes / limitBytes) * 100) : 0}%` }} />
              </div>
              <span className="small">
                {usage ? `${formatBytes(usage.bytes)} / ${formatBytes(limitBytes)} · 파일 ${usage.count}개` : '계산 중…'}
              </span>
            </div>
            {usage?.quota > 0 && <p className="muted small">브라우저가 이 사이트에 허용한 저장 공간: 약 {formatBytes(usage.quota)}</p>}
            <label className="check">
              <input type="checkbox" checked={cache.enabled} onChange={(e) => setCache({ ...cache, enabled: e.target.checked })} /> 캐시 사용
            </label>
            <label>
              최대 크기 (GB)
              <input
                className="input"
                type="number"
                min="0.5"
                step="0.5"
                value={cache.limitGb}
                onChange={(e) => setCache({ ...cache, limitGb: e.target.value })}
              />
            </label>
            {usage?.quota > 0 && limitBytes > usage.quota && (
              <p className="warn">브라우저 허용량보다 큽니다. 실제로는 허용량까지만 저장됩니다.</p>
            )}
            <div className="row">
              <button className="btn" disabled={clearing || !usage?.count} onClick={onClear}>
                {clearing ? '지우는 중…' : 'Clear Cache'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Status({ ok }) {
  return <span className={`status ${ok ? 'ok' : ''}`}>{ok ? '설정됨' : '미설정'}</span>;
}
