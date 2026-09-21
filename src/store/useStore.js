import { create } from 'zustand';

export const LAYOUTS = {
  '1x1': { rows: 1, cols: 1 },
  '1x2': { rows: 1, cols: 2 },
  '2x1': { rows: 2, cols: 1 },
  '2x2': { rows: 2, cols: 2 },
};

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export const useStore = create((set, get) => ({
  // 데이터
  series: [], // loader.groupIntoSeries 결과
  loading: null, // { label, done, total, detail?, onCancel? }
  toast: null,

  // 화면
  mode: 'stack', // 'stack' | 'mpr'
  layout: '1x1',
  viewportSeries: [null, null, null, null], // 칸별 series key
  activeIndex: 0,
  selected: [0], // 함께 스크롤할 칸들 (Ctrl/⌘+클릭으로 추가)
  syncScroll: false, // ON이면 모든 칸이 함께 이동
  crosslink: false, // 다른 칸의 전체 스캔 범위를 점선으로
  referenceLines: false, // 다른 칸의 현재 슬라이스만 한 줄로
  cursor3d: null, // { world, frameOfReferenceUID, viewportId, text, value, modality }
  phaseByViewport: {}, // 칸별 선택 Phase (null = ALL)
  mprSeriesKey: null,
  activeTool: isTouch ? 'Scroll' : 'WindowLevel',
  showOverlay: true,
  seriesPanelOpen: typeof window !== 'undefined' ? window.innerWidth > 800 : true,
  dragPads: (() => {
    try {
      return localStorage.getItem('dv.dragPads') !== '0';
    } catch {
      return true;
    }
  })(), // 영상 옆 Zoom · W/L 조절 막대
  toggleDragPads() {
    const on = !get().dragPads;
    try {
      localStorage.setItem('dv.dragPads', on ? '1' : '0');
    } catch {
      /* noop */
    }
    set({ dragPads: on });
  },
  dialog: null, // 'tags' | 'export' | 'anonymize' | 'settings' | 'onedrive' | 'help' | 'about'
  cine: {}, // index → { playing, fps }

  addSeries(newSeries) {
    const existing = new Map(get().series.map((s) => [s.key, s]));
    newSeries.forEach((s) => {
      const prev = existing.get(s.key);
      if (prev) {
        // 같은 시리즈 파일이 추가로 들어오면 합침
        const ids = new Set(prev.imageIds);
        s.imageIds.forEach((id) => ids.add(id));
        existing.set(s.key, { ...prev, imageIds: [...ids], instanceCount: ids.size });
      } else existing.set(s.key, s);
    });
    const series = [...existing.values()];
    const vs = [...get().viewportSeries];
    // 빈 칸에 자동 배치
    const { rows, cols } = LAYOUTS[get().layout];
    let si = 0;
    for (let i = 0; i < rows * cols && si < newSeries.length; i++) {
      if (!vs[i]) vs[i] = newSeries[si++].key;
    }
    set({ series, viewportSeries: vs });
  },

  setThumbnail(key, thumbnail) {
    set({ series: get().series.map((s) => (s.key === key ? { ...s, thumbnail } : s)) });
  },

  clearAll() {
    set({ cursor3d: null, phaseByViewport: {} });
    set({ series: [], viewportSeries: [null, null, null, null], mprSeriesKey: null, mode: 'stack', activeIndex: 0 });
  },

  assignSeries(index, key) {
    const vs = [...get().viewportSeries];
    vs[index] = key;
    set({ viewportSeries: vs, activeIndex: index });
  },

  setLayout(layout) {
    set({ selected: [Math.min(get().activeIndex, LAYOUTS[layout].rows * LAYOUTS[layout].cols - 1)] });
    set({ layout, mode: 'stack', activeIndex: Math.min(get().activeIndex, LAYOUTS[layout].rows * LAYOUTS[layout].cols - 1) });
  },

  setActiveIndex: (activeIndex) => set({ activeIndex, selected: [activeIndex] }),
  /** Ctrl/⌘+클릭: 선택에 추가/제외 (활성 칸은 항상 선택에 포함) */
  toggleSelected(index) {
    const { selected, activeIndex } = get();
    const next = selected.includes(index) ? selected.filter((i) => i !== index || i === activeIndex) : [...selected, index];
    set({ selected: next.length ? next : [activeIndex] });
  },
  /** Shift+클릭: 활성 칸부터 이 칸까지 한 번에 선택 (데스크톱과 동일) */
  selectRange(index) {
    const { activeIndex, layout } = get();
    const visible = LAYOUTS[layout].rows * LAYOUTS[layout].cols;
    const [lo, hi] = activeIndex <= index ? [activeIndex, index] : [index, activeIndex];
    const next = [];
    for (let i = lo; i <= hi && i < visible; i++) next.push(i);
    set({ selected: next.length ? next : [activeIndex] });
  },
  setSyncScroll: (syncScroll) => set({ syncScroll }),
  toggleCrosslink: () => set({ crosslink: !get().crosslink, referenceLines: false }),
  toggleReferenceLines: () => set({ referenceLines: !get().referenceLines, crosslink: false }),
  setCursor3d: (cursor3d) => set({ cursor3d }),
  setPhase(index, phase) {
    set({ phaseByViewport: { ...get().phaseByViewport, [index]: phase } });
  },
  setActiveTool: (activeTool) => set({ activeTool }),
  setMode: (mode) => set({ mode }),
  openMpr(key) {
    set({ mode: 'mpr', mprSeriesKey: key });
  },
  setDialog: (dialog) => set({ dialog }),
  toggleOverlay: () => set({ showOverlay: !get().showOverlay }),
  toggleSeriesPanel: () => set({ seriesPanelOpen: !get().seriesPanelOpen }),
  setSeriesPanelOpen: (seriesPanelOpen) => set({ seriesPanelOpen }),
  setLoading: (loading) => set({ loading }),
  setCine(index, patch) {
    const cine = { ...get().cine, [index]: { fps: 15, playing: false, ...get().cine[index], ...patch } };
    set({ cine });
  },
  showToast(message, kind = 'info') {
    const id = Date.now();
    set({ toast: { id, message, kind } });
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null });
    }, 4000);
  },
}));

export const getSeries = (key) => useStore.getState().series.find((s) => s.key === key);
