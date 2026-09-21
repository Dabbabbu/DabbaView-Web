import Modal from './Modal';

const MOUSE = [
  ['좌클릭 드래그', '선택한 도구'],
  ['우클릭 드래그', '항상 W/L (좌우 = Width, 상하 = Level)'],
  ['가운데 버튼 드래그 / Alt+드래그', 'Pan'],
  ['휠', '슬라이스 이동'],
  ['영상 아래 🔍 Zoom / ◐ W/L 칸 누르고 끌기', '영상을 가리지 않고 확대(위아래) · W/L(좌우 = Width, 위아래 = Level). 두 번 클릭: 화면 맞춤 / 기본값'],
  ['좌 + 우클릭 함께 누르고 드래그', '위아래 = 슬라이스, 좌우 = 위상 (위상 영상) — 빠르게 끌수록 많이 넘어감'],
  ['Ctrl(⌘)+휠 / Ctrl+드래그', 'Zoom'],
  ['1손가락 (터치)', '선택한 도구 (모바일 기본: 스와이프 스크롤)'],
  ['2손가락 벌리기 / 오므리기 (터치)', '확대 / 축소 (손가락 가운데 기준)'],
  ['2손가락 함께 위아래 / 좌우 (터치)', '슬라이스 / 위상 넘기기'],
  ['3손가락 끌기 (터치)', '이동 (Pan)'],
  ['Ctrl(⌘) + 칸 클릭', 'Multi View에서 함께 스크롤할 칸 선택/해제'],
  ['Shift + 칸 클릭', '활성 칸부터 그 칸까지 범위 선택'],
  ['3D 커서 도구 + 클릭', '그 지점의 환자 좌표(L/P/S)와 값 표시, 다른 칸은 같은 위치로 이동'],
];

const KEYS = [
  ['Ctrl(⌘) + F / 오른쪽 위 검색 칸', '🔍 기능 찾기 — 한글·영어·비슷한 말로 (예: 동영상, 내보내기, export, ㄷㅇㅅ)'],
  ['↑ / ↓', '이전 / 다음 슬라이스 (위상 영상: 위상은 그대로, 위치만)'],
  ['← / →', '이전 / 다음 위상 (heart cine 등 위상 영상만)'],
  ['PgUp / PgDn', '5장씩 이동'],
  ['Home / End', '첫 / 마지막 슬라이스'],
  ['1 ~ 9', 'W/L 프리셋 (Brain, Subdural, Stroke, Bone, Lung, Abdomen, Liver, Soft Tissue, Spine)'],
  ['0', 'W/L 기본값'],
  ['Space', '시네 재생/정지'],
  ['I', '흑백 반전'],
  ['R / Shift+R', '90° 회전 (오른쪽 / 왼쪽)'],
  ['H / V', '좌우 / 상하 반전'],
  ['F', '화면 맞춤'],
  ['Esc', '보기 초기화'],
  ['Y', '동기 스크롤 켜기/끄기 (모든 칸 함께 이동)'],
  ['O', '오버레이 표시/숨김'],
  ['T', 'DICOM 태그'],
  ['W, P, Z, S', 'W/L, Pan, Zoom, Scroll 도구'],
  ['L, A, B, E, D', '거리, 각도, 사각형, 타원, 자유곡선'],
  ['F2', '시리즈 패널 접기/펼치기'],
  ['Tab', '다음 칸 선택'],
];

export default function HelpDialog({ onClose }) {
  return (
    <Modal title="조작법" onClose={onClose}>
      <h3>마우스 / 터치</h3>
      <table className="kv">
        <tbody>
          {MOUSE.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>키보드</h3>
      <table className="kv">
        <tbody>
          {KEYS.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        ⚠ DabbaView Web은 진단용으로 인증된 의료기기가 아닙니다. 모든 DICOM 처리는 브라우저 안에서만 이루어지며 서버로 전송되지 않습니다.
      </p>
    </Modal>
  );
}
