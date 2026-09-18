export default function ViewportOverlay({ data, label }) {
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
      <Corner lines={data.bottomLeft} pos="bl" />
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
