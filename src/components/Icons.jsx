// 단순 선형 아이콘 (stroke = currentColor)
const P = {
  open: 'M3 7h6l2 2h10v10H3z',
  folder: 'M3 6h6l2 2h10v11H3zM3 10h18',
  wl: 'M12 3a9 9 0 1 0 0 18V3z',
  pan: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  zoom: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6',
  scroll: 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4',
  length: 'M4 20 20 4M4 20l3 0M4 20l0-3M20 4l-3 0M20 4l0 3',
  angle: 'M4 20h16M4 20 14 6M9 20a5 5 0 0 0-2-4',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c5 0 9 3.1 9 7s-4 7-9 7-9-3.1-9-7 4-7 9-7z',
  freehand: 'M4 16c2-6 5-10 8-9s1 6 4 6 4-5 4-5M4 16c1 3 5 4 8 3',
  probe: 'M12 4v4M12 16v4M4 12h4M16 12h4M12 12h.01',
  crosshairs: 'M12 2v20M2 12h20M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  invert: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18',
  rotR: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  rotL: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  flipH: 'M12 3v18M4 7l5 5-5 5zM20 7l-5 5 5 5z',
  flipV: 'M3 12h18M7 4l5 5 5-5zM7 20l5-5 5 5z',
  reset: 'M4 4v6h6M4.5 15a8 8 0 1 0 1.9-8.3L4 10',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  tags: 'M4 4h9l7 7-9 9-7-7zM8.5 8.5h.01',
  export: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  anon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6M3 3l18 18',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  overlay: 'M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6',
  panel: 'M3 4h18v16H3zM9 4v16',
  mpr: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
  gdrive: 'M8 3h8l6 11-4 7H6l-4-7zM8 3l6 11M16 3l-6 11M2 14h20',
  onedrive: 'M7 18h11a4 4 0 0 0 .6-7.9A6 6 0 0 0 7.2 9 4.5 4.5 0 0 0 7 18z',
  close: 'M6 6l12 12M18 6 6 18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  sync: 'M4 9a8 8 0 0 1 13-3l3 3M20 15a8 8 0 0 1-13 3l-3-3M20 6v4h-4M4 18v-4h4',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] || ''} />
    </svg>
  );
}
