import { useEffect, useRef, useState } from 'react';
import { adjustWindowBy, zoomByDrag, fitToWindow, resetWindow } from '../cornerstone/actions';
import { Icon } from './Icons';
import { useStore } from '../store/useStore';
import { DRAW_TOOLS, DRAW_COLORS, colorCss } from '../cornerstone/drawStyle';
import { TOOLS } from './Toolbar';

/**
 * 영상 아래 Zoom · W/L 조절 칸 (데스크톱 DabbaView 상태바와 같음) — 영상을 가리지 않고 끌어서 조절
 *  Zoom: 누른 채 위로 = 확대, 아래로 = 축소 · 두 번 클릭 = 화면 맞춤
 *  W/L : 좌우 = Width, 위아래 = Level · 두 번 클릭 = 원본 W/L
 *  원본: 한 번 눌러 DICOM 태그의 Window Center/Width로 되돌리기
 *  그리기: 눌러서 측정 도구 고르기 (쓰던 도구가 켜져 있으면 눌러서 끄기)
 */
function Pad({ icon, label, hint, cursor, onDrag, onDouble, title }) {
  const last = useRef(null);
  const [value, setValue] = useState(null);
  return (
    <div
      className={`drag-pad ${value !== null ? 'dragging' : ''}`}
      style={{ cursor }}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        last.current = [e.clientX, e.clientY];
        setValue('');
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const dx = e.clientX - last.current[0];
        const dy = e.clientY - last.current[1];
        last.current = [e.clientX, e.clientY];
        if (dx || dy) {
          const shown = onDrag(dx, dy);
          if (shown != null) setValue(shown);
        }
      }}
      onPointerUp={() => {
        last.current = null;
        setValue(null);
      }}
      onPointerCancel={() => {
        last.current = null;
        setValue(null);
      }}
      onDoubleClick={onDouble}
    >
      <span className="drag-pad-icon">{icon}</span>
      <span className="drag-pad-text">{value || label}</span>
      {!value && <span className="muted">{hint}</span>}
    </div>
  );
}

/** 끌지 않고 한 번 누르는 칸 (원본 W/L 되돌리기) */
function TapPad({ icon, label, title, onTap }) {
  return (
    <button type="button" className="drag-pad tap" title={title} onClick={onTap}>
      <span className="drag-pad-icon">{icon}</span>
      <span className="drag-pad-text">{label}</span>
    </button>
  );
}

/** ✏️ 그리기 — 누르면 측정 도구 목록, 이미 그리는 중이면 눌러서 끄기 */
function DrawPad() {
  const activeTool = useStore((s) => s.activeTool);
  const drawColor = useStore((s) => s.drawColor);
  const drawWidth = useStore((s) => s.drawWidth);
  const setActiveTool = useStore((s) => s.setActiveTool);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const [at, setAt] = useState(null);
  const drawing = DRAW_TOOLS.includes(activeTool);
  const lastDraw = useRef('Length');
  if (drawing) lastDraw.current = activeTool;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const tools = TOOLS.filter((t) => DRAW_TOOLS.includes(t.key));
  const current = tools.find((t) => t.key === activeTool);
  const toggle = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt({ left: r.left, bottom: window.innerHeight - r.top + 6 });
    setOpen((v) => !v);
  };
  const choose = (key) => {
    setActiveTool(key);
    setOpen(false);
  };

  return (
    <div className="drawpad-wrap" ref={ref}>
      <button
        type="button"
        className={`drag-pad tap ${drawing ? 'on' : ''}`}
        title={
          drawing
            ? `그리는 중: ${current?.label || ''} — 눌러서 도구를 바꾸거나 끕니다\n색 ${
                DRAW_COLORS.find((c) => c.key === drawColor)?.label
              } · 굵기 ${drawWidth} (Ctrl+R/B/G/W · Ctrl+휠)`
            : '그리기 도구 고르기 — 거리 · 각도 · 사각 · 타원 · 자유 · Probe'
        }
        onClick={toggle}
      >
        <span className="drag-pad-icon">
          <Icon name={drawing ? current?.icon || 'freehand' : 'freehand'} size={14} />
        </span>
        <span className="drag-pad-text">{drawing ? current?.label || '그리기' : '그리기'}</span>
        <span className="draw-dot" style={{ '--swatch': colorCss(drawColor), '--w': `${4 + drawWidth}px` }} />
      </button>
      {open && at && (
        <div className="menu drawpad-menu" style={{ left: at.left, bottom: at.bottom }}>
          {tools.map((t) => (
            <button key={t.key} className={activeTool === t.key ? 'on' : ''} onClick={() => choose(t.key)}>
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          ))}
          {drawing && (
            <>
              <div className="menu-sep" />
              <button onClick={() => choose('WindowLevel')}>
                <Icon name="wl" size={16} /> 그리기 끄기 (W/L로)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function DragPads() {
  return (
    <footer className="drag-pads hide-sm" title="영상을 가리지 않는 조절 칸 — 누른 채 끌기">
      <Pad
        icon={<Icon name="zoom" size={14} />}
        label="Zoom"
        hint="↕"
        cursor="ns-resize"
        title={'누른 채 위로 끌면 확대, 아래로 축소\n두 번 클릭: 화면 맞춤'}
        onDrag={(_dx, dy) => {
          const z = zoomByDrag(dy);
          return z == null ? null : `${Math.round(z * 100)}%`;
        }}
        onDouble={fitToWindow}
      />
      <Pad
        icon={<Icon name="wl" size={14} />}
        label="W/L"
        hint="✥"
        cursor="move"
        title={'누른 채 끌기: 좌우 = Width(대비), 위아래 = Level(밝기)\n두 번 클릭: 원본 W/L'}
        onDrag={(dx, dy) => {
          const r = adjustWindowBy(dx, dy);
          return r ? `W ${Math.round(r[0])} L ${Math.round(r[1])}` : null;
        }}
        onDouble={resetWindow}
      />
      <TapPad
        icon={<Icon name="wlsrc" size={14} />}
        label="원본 W/L"
        title={'DICOM 원본의 Window Center/Width로 되돌리기\n영상을 더블클릭하거나 0 키를 눌러도 됩니다'}
        onTap={() => resetWindow()}
      />
      <DrawPad />
    </footer>
  );
}
