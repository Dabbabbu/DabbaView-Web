import Modal from './Modal';
import { APP_NAME, APP_VERSION, BUILD_DATE } from '../version';

export default function AboutDialog({ onClose }) {
  return (
    <Modal title="정보" onClose={onClose}>
      <div className="about">
        <div className="welcome-logo" />
        <h1>
          DabbaView <em>Web</em>
        </h1>
        <div className="about-version">
          {APP_NAME} v{APP_VERSION}
        </div>
        {BUILD_DATE && <div className="muted small">Build {BUILD_DATE}</div>}
        <p className="muted small">
          브라우저 기반 DICOM 뷰어 · Cornerstone3D + React + Vite
          <br />
          <a href="https://github.com/Dabbabbu/DabbaView-Web" target="_blank" rel="noreferrer">
            github.com/Dabbabbu/DabbaView-Web
          </a>
        </p>
        <p className="muted small">⚠ 진단용으로 인증된 의료기기가 아닙니다.</p>
      </div>
    </Modal>
  );
}
