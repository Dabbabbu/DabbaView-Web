import { loadDicomFiles, makeThumbnail } from './loader';
import { useStore } from '../store/useStore';

/** File[] → 파싱 → 스토어 반영 → 썸네일 생성 (공통 진입점) */
export async function ingestFiles(files, sourceLabel = '파일') {
  const { setLoading, addSeries, setThumbnail, showToast } = useStore.getState();
  if (!files?.length) return;
  setLoading({ label: `${sourceLabel} 읽는 중…`, done: 0, total: files.length });
  try {
    const { series, skipped } = await loadDicomFiles(files, (done, total) =>
      setLoading({ label: `${sourceLabel} 읽는 중…`, done, total }),
    );
    if (!series.length) {
      showToast(`DICOM 영상을 찾지 못했습니다 (${files.length}개 파일 확인)`, 'error');
      return;
    }
    addSeries(series);
    const images = series.reduce((s, x) => s + x.imageIds.length, 0);
    showToast(`${series.length}개 시리즈, ${images}장 불러옴${skipped ? ` (DICOM 아님/영상 없음 ${skipped}개 건너뜀)` : ''}`);
    setLoading(null);
    // 썸네일은 뒤에서 순차 생성
    for (const s of series) {
      const thumb = await makeThumbnail(s);
      if (thumb) setThumbnail(s.key, thumb);
    }
  } catch (e) {
    console.error(e);
    showToast(`불러오기 실패: ${e.message || e}`, 'error');
  } finally {
    setLoading(null);
  }
}
