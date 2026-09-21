import { useStore } from '../store/useStore';
import { sameFrame } from '../cornerstone/planes';

export default function ViewportOverlay({ data, label }) {
  const cursor = useStore((s) => s.cursor3d);
  if (!data) return null;
  const Corner = ({ lines, pos }) => (
    <div className={`ov ov-${pos}`}>
      {lines.map((t, i) => (
        <div key={i}>{t}</div>
      ))}
    </div>
  );
  return (
    <div className="viewport-overlay">
      {label && <div className="ov-plane">{label}</div>}
      <Corner lines={data.topLeft} pos="tl" />
      <Corner lines={data.topRight} pos="tr" />
      <Corner lines={data.fileName ? [...data.bottomLeft, `📄 ${data.fileName}`] : data.bottomLeft} pos="bl" />
      {cursor && sameFrame(cursor, data) && (
        <div className="ov-cursor">
          ✛ {cursor.text}
          {cursor.value !== null && cursor.value !== undefined ? `   ${cursor.modality === 'CT' ? 'HU' : 'SI'} ${Math.round(cursor.value)}` : ''}
        </div>
      )}
      <Corner lines={data.bottomRight} pos="br" />
      {data.markers && (
        <>
          <div className="om om-top">{data.markers.top}</div>
          <div className="om om-bottom">{data.markers.bottom}</div>
          <div className="om om-left">{data.markers.left}</div>
          <div className="om om-right">{data.markers.right}</div>
        </>
      )}
    </div>
  );
}
