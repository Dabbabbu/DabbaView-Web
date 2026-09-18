import { useState } from 'react';
import Modal from './Modal';
import { getCloudConfig, saveCloudConfig } from '../cloud/config';
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
          값은 이 브라우저(localStorage)에만 저장됩니다. 빌드 시 <code>.env</code>의 <code>VITE_*</code> 값이 기본값으로 쓰입니다. 자세한 발급 방법은 README를
          참고하세요.
        </p>
        <h3>Google Drive</h3>
        <label>
          OAuth Client ID
          <input className="input" value={cfg.googleClientId} onChange={set('googleClientId')} placeholder="xxxx.apps.googleusercontent.com" />
        </label>
        <label>
          API Key
          <input className="input" value={cfg.googleApiKey} onChange={set('googleApiKey')} placeholder="AIza…" />
        </label>
        <label>
          App ID (프로젝트 번호)
          <input className="input" value={cfg.googleAppId} onChange={set('googleAppId')} placeholder="123456789012" />
        </label>
        <p className="muted small">
          승인된 JavaScript 원본: <code>{window.location.origin}</code>
        </p>

        <h3>OneDrive (Microsoft)</h3>
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
