import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { formatDate } from '../dicom/meta';
import { Icon } from './Icons';
import { APP_TITLE } from '../version';

/** INFINITT 스타일 시리즈 패널: 검사별 묶음 + 썸네일 + 시리즈번호/장수 + 시퀀스명 */
export default function SeriesPanel() {
  const series = useStore((s) => s.series);
  const open = useStore((s) => s.seriesPanelOpen);
  const activeKey = useStore((s) => (s.mode === 'mpr' ? s.mprSeriesKey : s.viewportSeries[s.activeIndex]));
  const shownKeys = useStore((s) => s.viewportSeries);

  const studies = useMemo(() => {
    const map = new Map();
    for (const s of series) {
      const k = s.studyInstanceUID || 'unknown';
      if (!map.has(k)) map.set(k, { key: k, meta: s.meta, series: [] });
      map.get(k).series.push(s);
    }
    return [...map.values()];
  }, [series]);

  const select = (s) => {
    const st = useStore.getState();
    if (st.mode === 'mpr') {
      if (s.mprCapable) st.openMpr(s.key);
      else {
        st.setMode('stack');
        st.assignSeries(st.activeIndex, s.key);
      }
    } else st.assignSeries(st.activeIndex, s.key);
    if (window.innerWidth <= 800) st.setSeriesPanelOpen(false);
  };

  return (
    <aside className={`series-panel ${open ? 'open' : 'closed'}`}>
      <div className="series-panel-head">
        <span>Series</span>
        <span className="muted">{series.length}</span>
        <button className="icon-btn only-mobile" onClick={() => useStore.getState().setSeriesPanelOpen(false)} title="닫기">
          <Icon name="close" />
        </button>
      </div>
      <div className="series-scroll">
        {!series.length && <div className="series-empty">불러온 시리즈가 없습니다</div>}
        {studies.map((st) => (
          <div key={st.key} className="study-group">
            <div className="study-head" title={st.meta.studyDescription}>
              <div className="study-name">{st.meta.patientName || '(이름 없음)'}</div>
              <div className="study-sub">
                {formatDate(st.meta.studyDate)} · {st.meta.modality} {st.meta.studyDescription ? `· ${st.meta.studyDescription}` : ''}
              </div>
            </div>
            <div className="series-list">
              {st.series.map((s) => (
                <div
                  key={s.key}
                  className={`series-item ${activeKey === s.key ? 'selected' : ''} ${shownKeys.includes(s.key) ? 'shown' : ''}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-dabbaview-series', s.key);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => select(s)}
                  title={seriesTooltip(s)}
                >
                  <div className="thumb">
                    {s.thumbnail ? <img src={s.thumbnail} alt="" draggable={false} /> : <div className="thumb-ph">{s.modality}</div>}
                    <span className="thumb-count">
                      {s.seriesNumber ?? '-'}/{s.imageIds.length}
                    </span>
                  </div>
                  <div className="series-desc">{s.seriesDescription}</div>
                  {s.mprCapable && (
                    <button
                      className="mpr-chip"
                      title="MPR로 보기"
                      onClick={(e) => {
                        e.stopPropagation();
                        useStore.getState().openMpr(s.key);
                        if (window.innerWidth <= 800) useStore.getState().setSeriesPanelOpen(false);
                      }}
                    >
                      MPR
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="app-version" title="정보" onClick={() => useStore.getState().setDialog('about')}>
        {APP_TITLE}
      </button>
    </aside>
  );
}

function seriesTooltip(s) {
  const m = s.meta;
  const lines = [
    `#${s.seriesNumber ?? '-'} ${s.seriesDescription}`,
    `${s.modality} · ${s.imageIds.length} images`,
    m.sequenceName && `Sequence: ${m.sequenceName}`,
    m.repetitionTime !== undefined && `TR ${m.repetitionTime} / TE ${m.echoTime}${m.inversionTime ? ` / TI ${m.inversionTime}` : ''}`,
    m.flipAngle !== undefined && `FA ${m.flipAngle}°`,
    m.sliceThickness !== undefined && `Thickness ${m.sliceThickness} mm`,
    m.columns && `Matrix ${m.columns}×${m.rows}`,
  ];
  return lines.filter(Boolean).join('\n');
}
