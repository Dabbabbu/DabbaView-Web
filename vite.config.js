import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

// base: GitHub Pages 배포 시 `npm run build:pages` (=/DabbaView-Web/) 사용
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react(), viteCommonjs()],
  optimizeDeps: {
    exclude: ['@cornerstonejs/dicom-image-loader'],
    include: ['dicom-parser'],
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // OneDrive(MSAL v5) 팝업 로그인 응답을 메인 창으로 넘겨주는 페이지
        authRedirect: resolve(import.meta.dirname, 'auth-redirect.html'),
      },
    },
  },
  server: { port: 5173, host: true },
});
