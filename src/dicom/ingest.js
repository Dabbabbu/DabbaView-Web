import { loadDicomFiles, makeThumbnail } from './loader';
import { useStore } from '../store/useStore';
import { expandZips } from './unzip';
import { clearGeometryCache } from '../cornerstone/sync';
import { isVolumeFile, parseVolumeFile } from '../formats/parse';
import { addVolume } from '../formats/volumeLoader';

/** File[] → 파싱 → 스토어 반영 → 썸네일 생성 (공통 진입점) */
export async function ingestFiles(files, sourceLabel = '파일') {
  const { setLoading, addSeries, setThumbnail, showToast } = useStore.getState();
  if (!files?.length) return;
  try {
    const expanded = await expandZips(files, (n, name) => setLoading({ label: `ZIP 푸는 중… ${name}`, done: 0, total: 0 }));
    files = expanded.files;
    const zipNote = expanded.errors.length ? ` · ${expanded.errors.join(' / ')}` : '';
    if (!files.length) {
      showToast(`불러올 파일이 없습니다${zipNote}`, 'error');
      return;
    }
    // NIfTI / NRRD / NumPy 볼륨 파일은 따로 파싱
    const volumeFiles = files.filter((f) => isVolumeFile(f.name));
    const dicomFiles = files.filter((f) => !isVolumeFile(f.name));
    const volumeSeries = [];
    const volumeErrors = [];
    for (const f of volumeFiles) {
      setLoading({ label: `${f.name} 읽는 중…`, done: 0, total: 0 });
      try {
        volumeSeries.push(addVolume(await parseVolumeFile(f)));
      } catch (e) {
        console.warn(e);
        volumeErrors.push(e.message || String(e));
      }
    }

    setLoading({ label: `${sourceLabel} 읽는 중…`, done: 0, total: dicomFiles.length });
    const { series: dicomSeries, skipped } = await loadDicomFiles(dicomFiles, (done, total) =>
      setLoading({ label: `${sourceLabel} 읽는 중…`, done, total }),
    );
    const series = [...dicomSeries, ...volumeSeries];
    if (volumeErrors.length) showToast(volumeErrors.join(' / '), 'error');
    if (!series.length) {
      showToast(`DICOM 영상을 찾지 못했습니다 (${files.length}개 파일 확인)${zipNote}`, 'error');
      return;
    }
    addSeries(series);
    clearGeometryCache();
    const images = series.reduce((s, x) => s + x.imageIds.length, 0);
    showToast(
      `${series.length}개 시리즈, ${images}장 불러옴${skipped ? ` (DICOM 아님/영상 없음 ${skipped}개 건너뜀)` : ''}${zipNote}`,
      zipNote ? 'error' : 'info',
    );
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
