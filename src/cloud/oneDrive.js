import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';
import { getCloudConfig, mapLimit } from './config';

const SCOPES = ['Files.Read', 'Files.Read.All', 'User.Read'];
const GRAPH = 'https://graph.microsoft.com/v1.0';

let msal = null;
let msalClientId = null;

async function getMsal() {
  const cfg = getCloudConfig();
  if (!cfg.msClientId) throw new Error('Microsoft Client ID가 설정되지 않았습니다. ⚙ 설정에서 입력하세요.');
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

async function graph(path, token) {
  const res = await fetch(path.startsWith('http') ? path : `${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Microsoft Graph 오류 ${res.status}`);
  return res.json();
}

/** 폴더 내용 (itemId 없으면 루트) */
export async function listChildren(token, itemId, driveId) {
  const base = itemId ? (driveId ? `/drives/${driveId}/items/${itemId}` : `/me/drive/items/${itemId}`) : '/me/drive/root';
  const items = [];
  let url = `${base}/children?$top=500&$select=id,name,size,folder,file,parentReference,remoteItem`;
  while (url) {
    const json = await graph(url, token);
    items.push(...json.value);
    url = json['@odata.nextLink'] || null;
  }
  return items.sort((a, b) => !!b.folder - !!a.folder || a.name.localeCompare(b.name));
}

async function collectFiles(token, item, out, depth = 0) {
  if (depth > 8) return;
  const target = item.remoteItem || item;
  const driveId = target.parentReference?.driveId;
  if (target.folder) {
    const children = await listChildren(token, target.id, driveId);
    for (const c of children) await collectFiles(token, c, out, depth + 1);
  } else {
    out.push({ id: target.id, name: target.name || item.name, driveId, size: target.size });
  }
}

/** 선택 항목(파일/폴더) 다운로드 → File[] */
export async function downloadOneDriveItems(token, selected, onProgress = () => {}) {
  onProgress(0, 0, 'OneDrive 목록 확인 중…');
  const files = [];
  for (const it of selected) await collectFiles(token, it, files);
  let done = 0;
  const out = await mapLimit(files, 6, async (f) => {
    try {
      const path = f.driveId ? `/drives/${f.driveId}/items/${f.id}/content` : `/me/drive/items/${f.id}/content`;
      const res = await fetch(`${GRAPH}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status);
      return new File([await res.blob()], f.name, { type: 'application/dicom' });
    } catch (e) {
      console.warn('OneDrive download failed', f.name, e);
      return null;
    } finally {
      onProgress(++done, files.length, 'OneDrive에서 다운로드 중…');
    }
  });
  return out.filter(Boolean);
}
