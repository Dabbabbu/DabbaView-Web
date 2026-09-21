import { useEffect, useState } from 'react';
import Modal from './Modal';
import { getGraphToken, listChildren, downloadOneDriveItems, signOutOneDrive, isFolder } from '../cloud/oneDrive';
import { useStore } from '../store/useStore';
import { ingestFiles } from '../dicom/ingest';
import { Icon } from './Icons';
import { isAbort } from '../cloud/transfer';

/** Microsoft Graph로 OneDrive를 탐색해 파일/폴더를 고르는 창 */
export default function OneDriveBrowser({ onClose }) {
  const [token, setToken] = useState(null);
  const [path, setPath] = useState([{ id: null, name: 'OneDrive' }]);
  const [items, setItems] = useState([]);
  const [reloadTick, setReloadTick] = useState(0); // 🔄 새로 고침
  const [prevIds, setPrevIds] = useState(null); // 새로 고침 전 목록 → 새로 생긴 항목 표시
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
    setError('');
    listChildren(token, cur.id, cur.driveId)
      .then((list) => {
        if (!alive) return;
        setItems(list);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setBusy(''));
    return () => {
      alive = false;
    };
  }, [token, cur, reloadTick]);
  const reload = () => {
    setPrevIds(new Set(items.map((i) => i.id)));
    setReloadTick((n) => n + 1);
  };
  const isNew = (it) => prevIds && !prevIds.has(it.id);
  const newCount = prevIds ? items.filter((i) => !prevIds.has(i.id)).length : 0;

  const open = (it) => {
    const target = it.remoteItem || it;
    setSelected(new Map());
    setPrevIds(null);
    setPath([...path, { id: target.id, name: it.name, driveId: target.parentReference?.driveId }]);
  };

  const toggle = (it) => {
    const m = new Map(selected);
    if (m.has(it.id)) m.delete(it.id);
    else m.set(it.id, it);
    setSelected(m);
  };

  const load = async (list) => {
    const { setLoading, showToast } = useStore.getState();
    onClose();
    const ac = new AbortController();
    const onCancel = () => ac.abort();
    try {
      const files = await downloadOneDriveItems(token, list, (status) => setLoading({ ...status, onCancel }), ac.signal);
      setLoading(null);
      await ingestFiles(files, 'OneDrive');
    } catch (e) {
      setLoading(null);
      if (isAbort(e) || ac.signal.aborted) showToast('OneDrive 불러오기를 취소했습니다');
      else showToast(`OneDrive 오류: ${e.message}`, 'error');
    }
  };

  const selFolders = [...selected.values()].filter(isFolder).length;
  const selFiles = selected.size - selFolders;

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
            {selected.size ? `선택 열기 (${[selFolders && `폴더 ${selFolders}`, selFiles && `파일 ${selFiles}`].filter(Boolean).join(', ')})` : '선택 열기'}
          </button>
        </>
      }
    >
      {error && <p className="warn">{error}</p>}
      <p className="muted small">폴더를 선택하거나 "이 폴더 전체 열기"를 누르면 하위 폴더의 DICOM(ZIP 포함)을 모두 받아서 엽니다.</p>
      <div className="crumbs">
        {path.map((p, i) => (
          <button key={i} className="crumb" onClick={() => (setPrevIds(null), setPath(path.slice(0, i + 1)))}>
            {p.name}
          </button>
        ))}
        {busy && <span className="muted"> {busy}</span>}
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={reload} disabled={!!busy} title="그사이 OneDrive에 추가 · 삭제된 파일 반영">
          🔄 새로 고침
        </button>
      </div>
      {prevIds && !busy && <p className="muted small">🔄 새로 고침 — {newCount ? `새 항목 ${newCount}개 (🆕)` : '새 항목 없음'}</p>}
      <div className="file-list">
        {items.map((it) => {
          return (
            <div key={it.id} className={`file-row ${selected.has(it.id) ? 'sel' : ''}`}>
              <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it)} />
              <button className="file-name" onClick={() => (isFolder(it) ? open(it) : toggle(it))}>
                <Icon name={isFolder(it) ? 'folder' : 'open'} size={16} /> {isNew(it) ? '🆕 ' : ''}
                {it.name}
              </button>
              <span className="muted small">{isFolder(it) ? `${(it.folder || it.remoteItem.folder).childCount ?? ''} 항목` : fmtSize(it.size)}</span>
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
