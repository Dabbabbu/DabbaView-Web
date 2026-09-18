import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getGraphToken, listChildren, downloadOneDriveItems, signOutOneDrive } from '../cloud/oneDrive';
import { useStore } from '../store/useStore';
import { ingestFiles } from '../dicom/ingest';
import { Icon } from './Icons';

/** Microsoft Graph로 OneDrive를 탐색해 파일/폴더를 고르는 창 */
export default function OneDriveBrowser({ onClose }) {
  const [token, setToken] = useState(null);
  const [path, setPath] = useState([{ id: null, name: 'OneDrive' }]);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(new Map());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy('로그인 중…');
        const t = await getGraphToken();
        if (alive) setToken(t);
      } catch (e) {
        if (alive) setError(e.message || String(e));
      } finally {
        if (alive) setBusy('');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const cur = path[path.length - 1];
  useEffect(() => {
    if (!token) return;
    let alive = true;
    setBusy('불러오는 중…');
    listChildren(token, cur.id, cur.driveId)
      .then((list) => alive && setItems(list))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setBusy(''));
    return () => {
      alive = false;
    };
  }, [token, cur]);

  const open = (it) => {
    const target = it.remoteItem || it;
    setSelected(new Map());
    setPath([...path, { id: target.id, name: it.name, driveId: target.parentReference?.driveId }]);
  };

  const toggle = (it) => {
    const m = new Map(selected);
    if (m.has(it.id)) m.delete(it.id);
    else m.set(it.id, it);
    setSelected(m);
  };

  const load = async (list) => {
    const { setLoading } = useStore.getState();
    onClose();
    try {
      const files = await downloadOneDriveItems(token, list, (done, total, label) => setLoading({ label, done, total }));
      setLoading(null);
      await ingestFiles(files, 'OneDrive');
    } catch (e) {
      setLoading(null);
      useStore.getState().showToast(`OneDrive 오류: ${e.message}`, 'error');
    }
  };

  return (
    <Modal
      title="OneDrive에서 열기"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={() => signOutOneDrive().then(onClose)}>
            로그아웃
          </button>
          <div className="spacer" />
          <button className="btn" disabled={!token || !cur.id} onClick={() => load([{ id: cur.id, name: cur.name, folder: {}, parentReference: { driveId: cur.driveId } }])}>
            이 폴더 전체 열기
          </button>
          <button className="btn primary" disabled={!selected.size} onClick={() => load([...selected.values()])}>
            선택 항목 열기 ({selected.size})
          </button>
        </>
      }
    >
      {error && <p className="warn">{error}</p>}
      <div className="crumbs">
        {path.map((p, i) => (
          <button key={i} className="crumb" onClick={() => setPath(path.slice(0, i + 1))}>
            {p.name}
          </button>
        ))}
        {busy && <span className="muted"> {busy}</span>}
      </div>
      <div className="file-list">
        {items.map((it) => {
          const isFolder = !!(it.folder || it.remoteItem?.folder);
          return (
            <div key={it.id} className={`file-row ${selected.has(it.id) ? 'sel' : ''}`}>
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it)} />
              <button className="file-name" onClick={() => (isFolder ? open(it) : toggle(it))}>
                <Icon name={isFolder ? 'folder' : 'open'} size={16} /> {it.name}
              </button>
              <span className="muted small">{isFolder ? `${(it.folder || it.remoteItem.folder).childCount ?? ''} 항목` : fmtSize(it.size)}</span>
            </div>
          );
        })}
        {token && !busy && !items.length && <p className="muted">비어 있음</p>}
      </div>
    </Modal>
  );
}

function fmtSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 ** 2).toFixed(1)} MB`;
}
