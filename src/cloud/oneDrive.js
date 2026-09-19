import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { getCloudConfig, isOneDriveConfigured } from './config';
import { crawl, downloadAll, crawlStatus, downloadStatus } from './transfer';

const SCOPES = ['Files.Read', 'Files.Read.All', 'User.Read'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

let msal = null;
let msalClientId = null;

async function getMsal() {
  const cfg = getCloudConfig();
  if (!isOneDriveConfigured(cfg)) throw new Error('Microsoft Client ID가 설정되지 않았습니다. ⚙ 설정에서 입력하세요.');
  if (msal && msalClientId === cfg.msClientId) return msal;
  msal = await PublicClientApplication.createPublicClientApplication({
    auth: {
      clientId: cfg.msClientId,
      authority: cfg.msAuthority,
      // MSAL v5: 팝업 응답은 auth-redirect.html(redirect bridge)이 메인 창으로 전달
      redirectUri: new URL('auth-redirect.html', window.location.href).href.split('?')[0],
    },
    cache: { cacheLocation: 'sessionStorage' },
  });
  msalClientId = cfg.msClientId;
  return msal;
}

export async function getGraphToken() {
  const app = await getMsal();
  let account = app.getActiveAccount() || app.getAllAccounts()[0];
  if (!account) {
    const res = await app.loginPopup({ scopes: SCOPES, prompt: 'select_account' });
    account = res.account;
    app.setActiveAccount(account);
  }
  try {
    const res = await app.acquireTokenSilent({ scopes: SCOPES, account });
    return res.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError || e?.errorCode) {
      const res = await app.acquireTokenPopup({ scopes: SCOPES, account });
      return res.accessToken;
    }
    throw e;
  }
}

export async function signOutOneDrive() {
  if (!msal) return;
  const account = msal.getActiveAccount() || msal.getAllAccounts()[0];
  if (account) await msal.logoutPopup({ account }).catch(() => {});
}

async function graph(path, token, signal) {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) throw new Error(`Microsoft Graph 오류 ${res.status}`);
  return res.json();
}

/** 폴더 내용 (itemId 없으면 루트) */
export async function listChildren(token, itemId, driveId, signal) {
  const base = itemId ? (driveId ? `/drives/${driveId}/items/${itemId}` : `/me/drive/items/${itemId}`) : '/me/drive/root';
  const items = [];
  let url = `${base}/children?$top=500&$select=id,name,size,folder,file,parentReference,remoteItem`;
  while (url) {
    const json = await graph(url, token, signal);
    items.push(...json.value);
    url = json['@odata.nextLink'] || null;
  }
  return items.sort((a, b) => isFolder(b) - isFolder(a) || a.name.localeCompare(b.name));
}

/** 내 폴더 또는 다른 드라이브에서 공유된 폴더(remoteItem) */
export function isFolder(item) {
  return !!(item.folder || item.remoteItem?.folder);
}

/** 폴더 참조 { id, driveId } (다른 사람이 공유한 폴더는 remoteItem의 드라이브) */
export function folderRef(item) {
  const target = item.remoteItem || item;
  return { id: target.id, driveId: target.parentReference?.driveId, name: item.name };
}

function fileRef(item) {
  const target = item.remoteItem || item;
  return { id: target.id, name: target.name || item.name, driveId: target.parentReference?.driveId, size: target.size };
}

/**
 * 선택 항목(파일/폴더) → 폴더는 하위까지 재귀로 모아서 다운로드 → File[]
 * @param onStatus 로딩 바 상태 ({label, done, total, detail})
 */
export async function downloadOneDriveItems(token, selected, onStatus = () => {}, signal) {
  const roots = selected.filter(isFolder).map(folderRef);
  const direct = selected.filter((it) => !isFolder(it)).map(fileRef);

  onStatus(crawlStatus('OneDrive', { folders: 0, files: direct.length, skipped: 0, bytes: 0 }));
  const { files: found } = await crawl(
    roots,
    async (ref) => {
      const children = await listChildren(token, ref.id, ref.driveId, signal);
      return { folders: children.filter(isFolder).map(folderRef), files: children.filter((c) => !isFolder(c)).map(fileRef) };
    },
    { signal, onProgress: (st) => onStatus(crawlStatus('OneDrive', { ...st, files: st.files + direct.length })) },
  );
  const files = [...direct, ...found];
  if (!files.length) throw new Error('선택한 폴더에 받을 파일이 없습니다');

  const { files: out } = await downloadAll(
    files,
    (f, sig) => {
      const path = f.driveId ? `/drives/${f.driveId}/items/${f.id}/content` : `/me/drive/items/${f.id}/content`;
      return fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: sig });
    },
    { signal, onProgress: (p) => onStatus(downloadStatus('OneDrive', p)) },
  );
  return out;
}
