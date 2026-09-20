import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import * as nodeFs from 'node:fs';

const require_fs = () => nodeFs;
import react from '@vitejs/plugin-react';
import { viteCommonjs } from '@originjs/vite-plugin-commonjs';

// 버전은 package.json 하나만 기준으로 삼고, 빌드 시 코드에 상수로 주입한다
const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf-8'));

// base: 상대 경로라서 GitHub Pages 하위 경로(/DabbaView-Web/)에서도 그대로 동작
export default defineConfig({
  base: process.env.VITE_BASE || './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toLocaleDateString('sv-SE')), // YYYY-MM-DD (로컬 시간)
  },
  plugins: [
    react(),
    viteCommonjs(),
    {
      // 배포본에 version.json을 함께 올려, 열어 둔 탭이 새 배포를 알아채게 함
      name: 'dabbaview-version-json',
      closeBundle() {
        const { writeFileSync, mkdirSync } = require_fs();
        mkdirSync(resolve(import.meta.dirname, 'dist'), { recursive: true });
        writeFileSync(
          resolve(import.meta.dirname, 'dist/version.json'),
          JSON.stringify({ version: pkg.version, built: new Date().toISOString() }, null, 2),
        );
      },
    },
  ],
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
