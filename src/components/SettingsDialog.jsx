import { useState } from 'react';
import Modal from './Modal';
import { getCloudConfig, saveCloudConfig, isGoogleConfigured, isOneDriveConfigured } from '../cloud/config';
import { useStore } from '../store/useStore';

export default function SettingsDialog({ onClose }) {
  const [cfg, setCfg] = useState(getCloudConfig);
  const set = (k) => (e) => setCfg({ ...cfg, [k]: e.target.value.trim() });
  const origin = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');

  const save = () => {
    saveCloudConfig(cfg);
    useStore.getState().showToast('설정 저장됨');
    onClose();
  };

  return (
    <Modal
      title="설정 — 클라우드 연동"
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
      </div>
    </Modal>
  );
}

function Status({ ok }) {
  return <span className={`status ${ok ? 'ok' : ''}`}>{ok ? '설정됨' : '미설정'}</span>;
}
