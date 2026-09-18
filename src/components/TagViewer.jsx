import { useMemo, useState } from 'react';
import Modal from './Modal';
import { getActiveViewport } from '../cornerstone/actions';
import { getDataSet } from '../dicom/loader';
import { tagName, formatTag, elementValue } from '../dicom/dictionary';

function flatten(ds, depth = 0, out = []) {
  const keys = Object.keys(ds.elements).sort();
  for (const k of keys) {
    const el = ds.elements[k];
    out.push({ id: `${depth}-${out.length}`, depth, tag: k, vr: el.vr || '', len: el.length, name: tagName(k), value: elementValue(ds, el) });
    if (el.items && depth < 4) {
      el.items.forEach((it, i) => {
        out.push({ id: `${depth}-${out.length}`, depth: depth + 1, tag: '', vr: '', name: `Item ${i + 1}`, value: '', item: true });
        if (it.dataSet) flatten(it.dataSet, depth + 1, out);
      });
    }
  }
  return out;
}

export default function TagViewer({ onClose }) {
  const [q, setQ] = useState('');
  const vp = getActiveViewport();
  const imageId = vp?.getCurrentImageId?.();
  const ds = imageId ? getDataSet(imageId) : null;
  const rows = useMemo(() => (ds ? flatten(ds) : []), [ds]);
  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const s = q.toLowerCase();
    return rows.filter((r) => formatTag(r.tag || 'x00000000').toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || String(r.value).toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <Modal title="DICOM 태그" onClose={onClose} wide>
      {!ds ? (
        <p className="muted">활성 뷰포트에 영상이 없습니다.</p>
      ) : (
        <>
          <div className="tag-toolbar">
            <input className="input" placeholder="검색 (태그, 이름, 값)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <span className="muted">{filtered.length} / {rows.length}</span>
          </div>
          <div className="tag-table-wrap">
            <table className="tag-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>VR</th>
                  <th>Name</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className={r.item ? 'item-row' : ''}>
                    <td className="mono" style={{ paddingLeft: 6 + r.depth * 14 }}>
                      {r.tag ? formatTag(r.tag) : ''}
                    </td>
                    <td className="mono">{r.vr}</td>
                    <td>{r.name}</td>
                    <td className="val">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
