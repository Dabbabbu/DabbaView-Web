import { useRef, useState } from 'react';
import { getEngine } from '../cornerstone/init';
import { stackViewportId } from '../cornerstone/actions';
import { useStore } from '../store/useStore';

/**
 * 영상 오른쪽 슬라이스 막대 (INFINITT PACS 방식)
 * - 칸마다 하나씩, 끌어서 빠르게 넘김 · 빈 곳을 누르면 그 자리로
 * - 영상이 한 장뿐이면 나오지 않음 (설정 ▸ 슬라이스 막대에서 끌 수 있음)
 */
const THUMB_MIN = 14;

export default function SliceBar({ index, current, total }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);
  const show = useStore((s) => s.sliceBar);
  if (!show || !total || total < 2) return null;

  const ratio = total > 1 ? current / (total - 1) : 0;

  const goTo = (clientY) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const length = Math.max(THUMB_MIN, rect.height / total);
    const free = Math.max(1, rect.height - length);
    const r = Math.min(1, Math.max(0, (clientY - rect.top - length / 2) / free));
    const target = Math.round(r * (total - 1));
    const vp = getEngine()?.getViewport(stackViewportId(index));
    if (vp && target !== vp.getCurrentImageIdIndex()) {
      vp.setImageIdIndex(target);
      vp.render();
    }
  };

  return (
    <div
      ref={ref}
      className={`slice-bar ${drag || hover ? 'on' : ''}`}
      title="끌어서 슬라이스 이동"
      onPointerDown={(e) => {
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);   // 칸 밖으로 나가도 계속 끌리게
        } catch {
          /* 포인터를 잡을 수 없는 환경(합성 이벤트 등)에서도 이동은 되게 */
        }
        useStore.getState().setActiveIndex(index);
        setDrag(true);
        goTo(e.clientY);
      }}
      onPointerMove={(e) => {
        if (drag) {
          e.stopPropagation();
          goTo(e.clientY);
        }
      }}
      onPointerUp={(e) => {
        setDrag(false);
        try {
          e.currentTarget.releasePointerCapture?.(e.pointerId);
        } catch {
          /* noop */
        }
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div
        className="slice-bar-thumb"
        style={{
          height: `max(${THUMB_MIN}px, ${(100 / total).toFixed(3)}%)`,
          // top은 막대 기준 %, translateY는 손잡이 자신의 높이 기준 % → 위아래 끝에서도 안 넘침
          top: `${(ratio * 100).toFixed(3)}%`,
          transform: `translateY(${(-ratio * 100).toFixed(3)}%)`,
        }}
      />
      {(drag || hover) && (
        <div className="slice-bar-label" style={{ top: `${(ratio * 100).toFixed(3)}%` }}>
          {current + 1}/{total}
        </div>
      )}
    </div>
  );
}
