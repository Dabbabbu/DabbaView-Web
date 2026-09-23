import { createRoot } from 'react-dom/client';
import App from './App';
import { setupPwa } from './pwa';
import './styles/app.css';

createRoot(document.getElementById('root')).render(<App />);
setupPwa();   // 서비스 워커 등록 + '앱으로 설치' 기회 붙잡기

// 개발용: 콘솔에서 window.__dabbaview.ingestFiles(files) 로 파일 주입 (테스트 자동화)
if (import.meta.env.DEV) {
  import('./dicom/ingest').then(({ ingestFiles }) => {
    window.__dabbaview = { ingestFiles };
  });
}
