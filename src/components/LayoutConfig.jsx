import { useState } from 'react';
import Modal from './Modal';
import { useStore } from '../store/useStore';
import { DEFAULT_ACTIVE, DEFAULT_LAYOUTS, MAX_COLS, MAX_ROWS, cleanList, layoutLabel, layoutName, parseLayout } from '../store/layouts';

/** 레이아웃 미리보기 (작은 격자) */
function Preview({ id }) {
  const { rows, cols } = parseLayout(id) || { rows: 1, cols: 1 };
  return (
    <span className="layout-preview" style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {Array.from({ length: rows * cols }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
}

/** 드롭다운에 나올 레이아웃 고르기 (INFINITT의 Image set layout Config) */
export default function LayoutConfig({ onClose }) {
  const presets = useStore((s) => s.layoutPresets);
  const auto = useStore((s) => s.autoLayout);
  const [chosen, setChosen] = useState(presets);
  const [pick, setPick] = useState(null);
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(3);
  const [autoOn, setAutoOn] = useState(auto);
  const available = [...DEFAULT_LAYOUTS, ...chosen.filter((id) => !DEFAULT_LAYOUTS.includes(id))];

  const add = (id) => setChosen((list) => (list.includes(id) ? list : [...list, id]));
  const remove = (id) => setChosen((list) => (list.length > 1 ? list.filter((x) => x !== id) : list));
  const move = (id, step) =>
    setChosen((list) => {
      const i = list.indexOf(id);
      const j = i + step;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      next.splice(j, 0, next.splice(i, 1)[0]);
      return next;
    });

  const save = () => {
    const st = useStore.getState();
    st.setLayoutPresets(cleanList(chosen));
    st.setAutoLayout(autoOn);
    if (autoOn) st.applyAutoLayout();
    onClose();
  };

  return (
    <Modal title="레이아웃 목록 (Image set layout)" onClose={onClose} wide>
      <p className="hint">
        드롭다운에 나올 레이아웃을 고르세요. 이름은 <b>행 x 열</b>입니다 (2x3 = 2줄 3칸).
      </p>
      <div className="layout-config">
        <div>
          <h4>고를 수 있는 레이아웃 (Default)</h4>
          <div className="layout-list">
            {available.map((id) => (
              <button key={id} className={`layout-item ${pick === id ? 'on' : ''}`} onClick={() => setPick(id)} onDoubleClick={() => add(id)}>
                <Preview id={id} />
                {layoutLabel(id)}
              </button>
            ))}
          </div>
          <div className="layout-make">
            직접 만들기:
            <input type="number" min={1} max={MAX_ROWS} value={rows} onChange={(e) => setRows(+e.target.value)} /> 줄 ×
            <input type="number" min={1} max={MAX_COLS} value={cols} onChange={(e) => setCols(+e.target.value)} /> 칸
            <button className="btn" onClick={() => add(layoutName(rows, cols))}>
              ➕ 넣기
            </button>
          </div>
        </div>
        <div className="layout-move">
          <button className="btn" onClick={() => pick && add(pick)} title="오른쪽 목록에 넣기">
            ➕
          </button>
          <button className="btn" onClick={() => pick && remove(pick)} title="목록에서 빼기">
            ➖
          </button>
          <button className="btn" onClick={() => pick && move(pick, -1)} title="위로">
            ▲
          </button>
          <button className="btn" onClick={() => pick && move(pick, 1)} title="아래로">
            ▼
          </button>
        </div>
        <div>
          <h4>드롭다운에 나올 목록 (User define)</h4>
          <div className="layout-list">
            {chosen.map((id) => (
              <button key={id} className={`layout-item ${pick === id ? 'on' : ''}`} onClick={() => setPick(id)} onDoubleClick={() => remove(id)}>
                <Preview id={id} />
                {layoutLabel(id)}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setChosen([...DEFAULT_ACTIVE])}>
            기본값으로
          </button>
        </div>
      </div>
      <label className="row">
        <input type="checkbox" checked={autoOn} onChange={(e) => setAutoOn(e.target.checked)} />
        Auto — 영상을 열 때 시리즈 수에 맞는 레이아웃을 스스로 고름
      </label>
      <div className="modal-buttons">
        <button className="btn" onClick={onClose}>
          취소
        </button>
        <button className="btn primary" onClick={save}>
          확인
        </button>
      </div>
    </Modal>
  );
}
