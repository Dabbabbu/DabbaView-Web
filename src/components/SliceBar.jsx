import { useRef, useState } from 'react';
import { getEngine } from '../cornerstone/init';
import { stackViewportId } from '../cornerstone/actions';
import { useStore, getSeries } from '../store/useStore';
import { phaseShape, phaseWhere, imageAt } from '../dicom/phases';

/**
 * 영상에 붙는 막대 (INFINITT PACS 방식) — 데스크톱 DabbaView와 같은 모습
 *  - 오른쪽 세로 = 슬라이스(위치). 위상이 있는 cine에서는 위상을 그대로 둔 채 위치만 움직인다
 *  - 아래쪽 가로 = 위상. 위상이 여럿일 때만 나온다
 *  - 끌어서 빠르게 넘기고, 빈 곳을 누르면 그 자리로. 하나뿐이면 숨는다
 *    (설정 ▸ 슬라이스 막대에서 둘 다 끌 수 있음)
 */
const THUMB_MIN = 14;

/** 막대 하나 — vertical이면 세로(슬라이스), 아니면 가로(위상) */
function Bar({ vertical, current, total, label, onPick, index, short }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState(false);
  if (!total || total < 2) return null;

  const ratio = total > 1 ? current / (total - 1) : 0;
  const pick = (clientX, clientY) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const span = vertical ? rect.height : rect.width;
    const at = vertical ? clientY - rect.top : clientX - rect.left;
    const length = Math.max(THUMB_MIN, span / total);
    const free = Math.max(1, span - length);
    const r = Math.min(1, Math.max(0, (at - length / 2) / free));
    onPick(Math.round(r * (total - 1)));
  };

  const pct = `${(ratio * 100).toFixed(3)}%`;
  const size = `max(${THUMB_MIN}px, ${(100 / total).toFixed(3)}%)`;
  return (
    <div
      ref={ref}
      className={`slice-bar ${vertical ? '' : 'horizontal'} ${short ? 'short' : ''} ${drag || hover ? 'on' : ''}`}
      title={vertical ? '끌어서 슬라이스 이동 (위상은 그대로)' : '끌어서 위상 이동 (슬라이스는 그대로)'}
      onPointerDown={(e) => {
        e.stopPropagation();
        try {
          e.currentTarget.setPointerCapture(e.pointerId); // 칸 밖으로 나가도 계속 끌리게
        } catch {
          /* 포인터를 잡을 수 없는 환경에서도 이동은 되게 */
        }
        useStore.getState().setActiveIndex(index);
        setDrag(true);
        pick(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (drag) {
          e.stopPropagation();
          pick(e.clientX, e.clientY);
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
        style={
          vertical
            ? { height: size, top: pct, transform: `translateY(${(-ratio * 100).toFixed(3)}%)` }
            : { width: size, left: pct, transform: `translateX(${(-ratio * 100).toFixed(3)}%)` }
        }
      />
      {(drag || hover) && (
        <div className="slice-bar-label" style={vertical ? { top: pct } : { left: pct }}>
          {label}
        </div>
      )}
    </div>
  );
}

export default function SliceBar({ index, current, total }) {
  const show = useStore((s) => s.sliceBar);
  const seriesKey = useStore((s) => s.viewportSeries[index]);
  if (!show || !total) return null;

  const series = getSeries(seriesKey);
  const vp = getEngine()?.getViewport(stackViewportId(index));
  const shape = series ? phaseShape(series) : null;
  const where = shape && vp ? phaseWhere(series, vp.getCurrentImageId?.()) : null;

  const goToImage = (imageId) => {
    const ids = vp?.getImageIds?.() || [];
    const at = ids.indexOf(imageId);
    if (at >= 0 && at !== vp.getCurrentImageIdIndex()) {
      vp.setImageIdIndex(at);
      vp.render();
    }
  };
  const goToIndex = (target) => {
    if (vp && target !== vp.getCurrentImageIdIndex()) {
      vp.setImageIdIndex(target);
      vp.render();
    }
  };

  // 위상이 없는 보통 시리즈: 세로 막대 하나로 장 번호를 센다
  if (!shape || !where) {
    return (
      <Bar vertical index={index} current={current} total={total}
           label={`${current + 1}/${total}`} onPick={goToIndex} />
    );
  }

  // 위상이 있는 cine: 세로 = 위치(위상 고정), 가로 = 위상(위치 고정)
  const [phase, position] = where;
  return (
    <>
      <Bar
        vertical
        short
        index={index}
        current={position}
        total={shape.positions}
        label={`${position + 1}/${shape.positions}`}
        onPick={(p) => goToImage(imageAt(series, p, phase))}
      />
      <Bar
        index={index}
        current={phase}
        total={shape.phases}
        label={`Phase ${phase + 1}/${shape.phases}`}
        onPick={(p) => goToImage(imageAt(series, position, p))}
      />
    </>
  );
}
