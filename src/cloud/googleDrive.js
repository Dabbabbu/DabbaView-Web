import { getCloudConfig, isGoogleConfigured, loadScript, mapLimit } from './config';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
let accessToken = null;
let tokenExpiry = 0;

async function ensureLibs() {
  await Promise.all([loadScript('https://accounts.google.com/gsi/client'), loadScript('https://apis.google.com/js/api.js')]);
  await new Promise((resolve, reject) => window.gapi.load('picker', { callback: resolve, onerror: reject }));
}

function requestToken(cfg) {
  return new Promise((resolve, reject) => {
    if (accessToken && Date.now() < tokenExpiry - 60_000) return resolve(accessToken);
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.googleClientId,
      scope: cfg.googleScope,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        accessToken = resp.access_token;
        tokenExpiry = Date.now() + (resp.expires_in || 3600) * 1000;
        resolve(accessToken);
      },
      error_callback: (err) => reject(new Error(err?.message || '로그인이 취소되었습니다')),
    });
    client.requestAccessToken({ prompt: accessToken ? '' : 'consent' });
  });
}

function showPicker(cfg, token) {
  return new Promise((resolve) => {
    const gp = window.google.picker;
    const docs = new gp.DocsView(gp.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(gp.DocsViewMode.LIST);
    // 공유 드라이브(Shared drives)
    const drives = new gp.DocsView(gp.ViewId.DOCS).setEnableDrives(true).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(gp.DocsViewMode.LIST);
    const builder = new gp.PickerBuilder()
      .addView(docs)
      .addView(drives)
      .enableFeature(gp.Feature.SUPPORT_DRIVES)
      .enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setTitle('DICOM 파일 또는 폴더 선택')
      .setCallback((data) => {
        const action = data[gp.Response.ACTION];
        if (action === gp.Action.PICKED) resolve(data[gp.Response.DOCUMENTS] || []);
        else if (action === gp.Action.CANCEL) resolve([]);
      });
    if (cfg.googleApiKey) builder.setDeveloperKey(cfg.googleApiKey);
    if (cfg.googleAppId) builder.setAppId(cfg.googleAppId);
    builder.build().setVisible(true);
  });
}

async function listFolder(folderId, token, out = [], depth = 0) {
  if (depth > 8) return out;
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw driveError(res.status, '목록');
    const json = await res.json();
    for (const f of json.files || []) {
      if (f.mimeType === FOLDER_MIME) await listFolder(f.id, token, out, depth + 1);
      else if (!f.mimeType.startsWith('application/vnd.google-apps')) out.push(f);
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return out;
}

/**
 * Google Picker로 파일/폴더를 고르고 다운로드해서 File[] 반환
 * @param onProgress (done,total,label)
 */
export async function pickFromGoogleDrive(onProgress = () => {}) {
  const cfg = getCloudConfig();
  if (!isGoogleConfigured(cfg)) throw new Error('Google Client ID / API Key가 설정되지 않았습니다. ⚙ 설정에서 입력하세요.');
  await ensureLibs();
  const token = await requestToken(cfg);
  const picked = await showPicker(cfg, token);
  if (!picked.length) return [];

  onProgress(0, 0, 'Google Drive 목록 확인 중…');
  const files = [];
  for (const d of picked) {
    if (d.mimeType === FOLDER_MIME) await listFolder(d.id, token, files);
    else if (!d.mimeType?.startsWith('application/vnd.google-apps')) files.push({ id: d.id, name: d.name, size: d.sizeBytes });
  }
  let done = 0;
  const failed = [];
  const out = await mapLimit(files, 6, async (f) => {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw driveError(res.status, '다운로드');
      const blob = await res.blob();
      return new File([blob], f.name || f.id, { type: 'application/dicom' });
    } catch (e) {
      console.warn('Drive download failed', f.name, e);
      failed.push(f.name);
      return null;
    } finally {
      onProgress(++done, files.length, 'Google Drive에서 다운로드 중…');
    }
  });
  const ok = out.filter(Boolean);
  if (!ok.length && failed.length) throw new Error(`파일 ${failed.length}개를 받지 못했습니다`);
  return ok;
}

function driveError(status, what) {
  if (status === 401) {
    accessToken = null; // 토큰 만료 → 다음 시도에 다시 로그인
    return new Error('Google 로그인이 만료되었습니다. 다시 시도하세요.');
  }
  if (status === 403) return new Error(`Drive ${what} 권한이 없습니다 (403). API 사용 설정/범위를 확인하세요.`);
  return new Error(`Drive ${what} 오류 ${status}`);
}
