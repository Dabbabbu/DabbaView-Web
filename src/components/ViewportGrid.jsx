import { LAYOUTS, useStore } from '../store/useStore';
import StackViewport from './StackViewport';

export default function ViewportGrid() {
  const layout = useStore((s) => s.layout);
  const { rows, cols } = LAYOUTS[layout];
  const cells = Array.from({ length: rows * cols }, (_, i) => i);
  return (
    <div className="viewport-grid" style={{ gridTemplateRows: `repeat(${rows}, 1fr)`, gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {cells.map((i) => (
        <StackViewport key={i} index={i} />
      ))}
    </div>
  );
}
