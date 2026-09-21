import { getCloudConfig, isGoogleConfigured, loadScript } from './config';
import { crawl, downloadAll, crawlStatus, downloadStatus } from './transfer';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
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
    // 폴더만 보여 주는 탭: 폴더를 고르면 하위 DICOM을 모두 받음
    const folders = new gp.DocsView(gp.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setMode(gp.DocsViewMode.LIST);
    const builder = new gp.PickerBuilder()
      .addView(docs)
      .addView(folders)
      .addView(drives)
      .enableFeature(gp.Feature.SUPPORT_DRIVES)
      .enableFeature(gp.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(token)
      .setTitle('DICOM 파일 또는 폴더 선택 (폴더는 하위까지 모두 받음)')
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

/** 폴더 한 단계 목록 (페이지 전체) */
async function listFolder(folderId, token, signal) {
  const folders = [];
  const files = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,md5Checksum,version,shortcutDetails)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!res.ok) throw driveError(res.status, '목록');
    const json = await res.json();
    for (const f of json.files || []) {
      // 폴더 바로가기(shortcut)는 대상 폴더로 따라감
      const target = f.mimeType === SHORTCUT_MIME ? f.shortcutDetails : null;
      if (f.mimeType === FOLDER_MIME || target?.targetMimeType === FOLDER_MIME) folders.push({ id: target ? target.targetId : f.id, name: f.name });
      else if (!f.mimeType.startsWith('application/vnd.google-apps')) files.push(fileRef(f));
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return { folders, files };
}

/**
 * Google Picker로 파일/폴더를 고르고, 폴더는 하위까지 재귀로 모아서 다운로드 → File[]
 * @param onStatus 로딩 바 상태 ({label, done, total, detail})
 */
export async function pickFromGoogleDrive(onStatus = () => {}, signal) {
  const cfg = getCloudConfig();
  if (!isGoogleConfigured(cfg)) throw new Error('Google Client ID / API Key가 설정되지 않았습니다. ⚙ 설정에서 입력하세요.');
  await ensureLibs();
  const token = await requestToken(cfg);
  const picked = await showPicker(cfg, token);
  if (!picked.length) return [];

  const rootFolders = picked.filter((d) => d.mimeType === FOLDER_MIME).map((d) => ({ id: d.id, name: d.name }));
  // 직접 고른 파일은 캐시 키에 쓸 내용 버전(md5)을 위해 메타데이터를 한 번 조회
  const direct = await Promise.all(
    picked
      .filter((d) => d.mimeType !== FOLDER_MIME && !d.mimeType?.startsWith('application/vnd.google-apps'))
      .map((d) => fileMeta(d, token, signal)),
  );

  onStatus(crawlStatus('Google Drive', { folders: 0, files: direct.length, skipped: 0, bytes: 0 }));
  const { files: found } = await crawl(rootFolders, (folder) => listFolder(folder.id ?? folder, token, signal), {
    signal,
    onProgress: (s) => onStatus(crawlStatus('Google Drive', { ...s, files: s.files + direct.length })),
  });
  const files = [...direct, ...found];
  if (!files.length) throw new Error('선택한 폴더에 받을 파일이 없습니다');

  const { files: out } = await downloadAll(
    files,
    (f, sig) =>
      fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: sig,
      }).then((res) => {
        if (res.status === 401) throw driveError(401, '다운로드');
        return res;
      }),
    { signal, onProgress: (p) => onStatus(downloadStatus('Google Drive', p)), cacheKey: googleCacheKey, cachePrefix: (f) => `gdrive:${f.id}:`, source: 'Google Drive' },
  );
  return out;
}

function fileRef(f) {
  return { id: f.id, name: f.name, size: f.size, ver: f.md5Checksum || f.version };
}

async function fileMeta(doc, token, signal) {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${doc.id}?fields=id,name,size,md5Checksum,version&supportsAllDrives=true`,
      { headers: { Authorization: `Bearer ${token}` }, signal },
    );
    if (res.ok) return fileRef(await res.json());
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
  }
  return { id: doc.id, name: doc.name, size: doc.sizeBytes }; // 버전을 모르면 캐시하지 않음
}

/** 내용이 바뀌면 키도 바뀐다 (md5 또는 version) */
export const googleCacheKey = (f) => (f.ver ? `gdrive:${f.id}:${f.ver}` : null);

function driveError(status, what) {
  if (status === 401) {
    accessToken = null; // 토큰 만료 → 다음 시도에 다시 로그인
    return new Error('Google 로그인이 만료되었습니다. 다시 시도하세요.');
  }
  if (status === 403) return new Error(`Drive ${what} 권한이 없습니다 (403). API 사용 설정/범위를 확인하세요.`);
  return new Error(`Drive ${what} 오류 ${status}`);
}
