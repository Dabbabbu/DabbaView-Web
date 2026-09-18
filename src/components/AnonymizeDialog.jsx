import { useState } from 'react';
import Modal from './Modal';
import { useStore } from '../store/useStore';
import { anonymizeImageIds } from '../dicom/anonymize';
import { makeZip, downloadBlob } from '../export/zip';

export default function AnonymizeDialog({ onClose }) {
  const series = useStore((s) => s.series);
  const activeKey = useStore((s) => (s.mode === 'mpr' ? s.mprSeriesKey : s.viewportSeries[s.activeIndex]));
  const [scope, setScope] = useState('series');
  const [name, setName] = useState('ANONYMOUS');
  const [pid, setPid] = useState('ANON0001');
  const [keepDates, setKeepDates] = useState(true);
  const [removePrivate, setRemovePrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const toast = useStore.getState().showToast;
  const active = series.find((s) => s.key === activeKey);

  const run = async () => {
    const target =
      scope === 'series' ? (active ? [active] : []) : scope === 'study' ? series.filter((s) => s.studyInstanceUID === active?.studyInstanceUID) : series;
    if (!target.length) return toast('익명화할 시리즈가 없습니다', 'error');
    setBusy(true);
    try {
      const ids = target.flatMap((s) => s.imageIds);
      const files = await anonymizeImageIds(ids, { patientName: name, patientId: pid, keepDates, removePrivate });
      const zip = makeZip(files.map((f, i) => ({ name: `ANON/${String(i + 1).padStart(5, '0')}_${f.name}`, bytes: f.bytes })));
      downloadBlob(zip, `anonymized_${pid || 'dicom'}.zip`);
      toast(`${files.length}개 파일 익명화 완료`);
      onClose();
    } catch (e) {
      console.error(e);
      toast(`익명화 실패: ${e.message}`, 'error');
    }
    setBusy(false);
  };

  return (
    <Modal
      title="DICOM 익명화"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            취소
          </button>
          <button className="btn primary" disabled={busy || !series.length} onClick={run}>
            {busy ? '처리 중…' : '익명화 후 ZIP 저장'}
          </button>
        </>
      }
    >
      <div className="form">
        <label>
          범위
          <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="series">현재 시리즈 {active ? `(${active.seriesDescription})` : ''}</option>
            <option value="study">현재 검사 전체</option>
            <option value="all">불러온 모든 시리즈</option>
          </select>
        </label>
        <label>
          Patient Name
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Patient ID
          <input className="input" value={pid} onChange={(e) => setPid(e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={keepDates} onChange={(e) => setKeepDates(e.target.checked)} /> 검사 날짜 유지 (생년월일은 연도만 남김)
        </label>
        <label className="check">
          <input type="checkbox" checked={removePrivate} onChange={(e) => setRemovePrivate(e.target.checked)} /> Private 태그 값 제거
        </label>
        <p className="muted small">
          환자/기관/의사 정보를 지우고 Study·Series·SOP UID를 새로 만듭니다(관계는 유지). 원본 파일은 바뀌지 않으며, 처리는 모두 브라우저 안에서만
          이루어집니다. 영상 픽셀에 새겨진 글자(burned-in)는 지워지지 않습니다.
        </p>
      </div>
    </Modal>
  );
}
