import { useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import { searchCommands } from '../search/commandSearch';

/** 기능 찾기 (Ctrl/⌘+F) — 입력하면 기능 목록이 좁혀지고 Enter로 실행 */
export default function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const results = useMemo(() => searchCommands(query, commands), [query, commands]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setSel(0), [query]);
  useEffect(() => {
    listRef.current?.children[sel]?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const run = (cmd) => {
    if (!cmd || cmd.disabled) return;
    onClose();
    setTimeout(() => cmd.run(), 0); // 창을 닫은 뒤 실행 (다른 창을 여는 기능)
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') setSel((i) => Math.min(results.length - 1, i + 1));
    else if (e.key === 'ArrowUp') setSel((i) => Math.max(0, i - 1));
    else if (e.key === 'Enter') run(results[sel]);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <Modal title="기능 찾기" onClose={onClose}>
      <input
        ref={inputRef}
        className="palette-input"
        type="search"
        value={query}
        placeholder="찾을 기능 — 예: 내보내기, 동영상, export, 설정, ㄷㅇㅅ"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
      />
      <div className="palette-list" ref={listRef} role="listbox">
        {results.map((c, i) => (
          <button
            key={`${c.path}-${c.label}`}
            className={`palette-item ${i === sel ? 'on' : ''} ${c.disabled ? 'disabled' : ''}`}
            title={c.disabled ? '영상을 먼저 열어야 쓸 수 있습니다' : ''}
            onMouseEnter={() => setSel(i)}
            onClick={() => run(c)}
          >
            <span className="muted small">{c.path} ▸</span> {c.label}
            {c.shortcut && <kbd>{c.shortcut}</kbd>}
          </button>
        ))}
        {!results.length && <p className="muted small">맞는 기능이 없습니다</p>}
      </div>
      <p className="muted small">
        {query ? `${results.length}개 · ` : ''}↑↓ 고르기 · Enter 실행 · Esc 닫기
      </p>
    </Modal>
  );
}
