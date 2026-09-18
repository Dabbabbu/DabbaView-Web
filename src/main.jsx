import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

createRoot(document.getElementById('root')).render(<App />);

// 개발용: 콘솔에서 window.__dabbaview.ingestFiles(files) 로 파일 주입 (테스트 자동화)
if (import.meta.env.DEV) {
  import('./dicom/ingest').then(({ ingestFiles }) => {
    window.__dabbaview = { ingestFiles };
  });
}
