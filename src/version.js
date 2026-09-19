// 빌드 시 vite.config.js의 define으로 package.json version이 주입된다
/* global __APP_VERSION__, __BUILD_DATE__ */
export const APP_NAME = 'DabbaView Web';
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0-dev';
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : '';
export const APP_TITLE = `${APP_NAME} v${APP_VERSION}`;
