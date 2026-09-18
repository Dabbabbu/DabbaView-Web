// 자주 쓰는 DICOM 태그 이름 사전 (태그 보기용). 없는 태그는 이름 없이 표시.
// key: 'ggggeeee' (소문자 hex)
export const DICOM_DICT = {
  '00020000': 'File Meta Information Group Length',
  '00020001': 'File Meta Information Version',
  '00020002': 'Media Storage SOP Class UID',
  '00020003': 'Media Storage SOP Instance UID',
  '00020010': 'Transfer Syntax UID',
  '00020012': 'Implementation Class UID',
  '00020013': 'Implementation Version Name',
  '00020016': 'Source Application Entity Title',
  '00080005': 'Specific Character Set',
  '00080008': 'Image Type',
  '00080012': 'Instance Creation Date',
  '00080013': 'Instance Creation Time',
  '00080016': 'SOP Class UID',
  '00080018': 'SOP Instance UID',
  '00080020': 'Study Date',
  '00080021': 'Series Date',
  '00080022': 'Acquisition Date',
  '00080023': 'Content Date',
  '00080030': 'Study Time',
  '00080031': 'Series Time',
  '00080032': 'Acquisition Time',
  '00080033': 'Content Time',
  '00080050': 'Accession Number',
  '00080060': 'Modality',
  '00080064': 'Conversion Type',
  '00080070': 'Manufacturer',
  '00080080': 'Institution Name',
  '00080081': 'Institution Address',
  '00080090': "Referring Physician's Name",
  '00081010': 'Station Name',
  '00081030': 'Study Description',
  '0008103e': 'Series Description',
  '00081040': 'Institutional Department Name',
  '00081048': 'Physician(s) of Record',
  '00081050': "Performing Physician's Name",
  '00081060': 'Name of Physician(s) Reading Study',
  '00081070': "Operators' Name",
  '00081090': "Manufacturer's Model Name",
  '00081140': 'Referenced Image Sequence',
  '00100010': "Patient's Name",
  '00100020': 'Patient ID',
  '00100030': "Patient's Birth Date",
  '00100040': "Patient's Sex",
  '00101000': 'Other Patient IDs',
  '00101001': 'Other Patient Names',
  '00101010': "Patient's Age",
  '00101020': "Patient's Size",
  '00101030': "Patient's Weight",
  '00101040': "Patient's Address",
  '00102154': "Patient's Telephone Numbers",
  '00104000': 'Patient Comments',
  '00180010': 'Contrast/Bolus Agent',
  '00180015': 'Body Part Examined',
  '00180020': 'Scanning Sequence',
  '00180021': 'Sequence Variant',
  '00180022': 'Scan Options',
  '00180023': 'MR Acquisition Type',
  '00180024': 'Sequence Name',
  '00180050': 'Slice Thickness',
  '00180060': 'KVP',
  '00180080': 'Repetition Time',
  '00180081': 'Echo Time',
  '00180082': 'Inversion Time',
  '00180083': 'Number of Averages',
  '00180084': 'Imaging Frequency',
  '00180085': 'Imaged Nucleus',
  '00180086': 'Echo Number(s)',
  '00180087': 'Magnetic Field Strength',
  '00180088': 'Spacing Between Slices',
  '00180091': 'Echo Train Length',
  '00180093': 'Percent Sampling',
  '00180094': 'Percent Phase Field of View',
  '00180095': 'Pixel Bandwidth',
  '00181000': 'Device Serial Number',
  '00181020': 'Software Versions',
  '00181030': 'Protocol Name',
  '00181063': 'Frame Time',
  '00181088': 'Heart Rate',
  '00181100': 'Reconstruction Diameter',
  '00181120': 'Gantry/Detector Tilt',
  '00181150': 'Exposure Time',
  '00181151': 'X-Ray Tube Current',
  '00181152': 'Exposure',
  '00181210': 'Convolution Kernel',
  '00181250': 'Receive Coil Name',
  '00181251': 'Transmit Coil Name',
  '00181310': 'Acquisition Matrix',
  '00181312': 'In-plane Phase Encoding Direction',
  '00181314': 'Flip Angle',
  '00181316': 'SAR',
  '00185100': 'Patient Position',
  '0020000d': 'Study Instance UID',
  '0020000e': 'Series Instance UID',
  '00200010': 'Study ID',
  '00200011': 'Series Number',
  '00200012': 'Acquisition Number',
  '00200013': 'Instance Number',
  '00200020': 'Patient Orientation',
  '00200032': 'Image Position (Patient)',
  '00200037': 'Image Orientation (Patient)',
  '00200052': 'Frame of Reference UID',
  '00201040': 'Position Reference Indicator',
  '00201041': 'Slice Location',
  '00204000': 'Image Comments',
  '00280002': 'Samples per Pixel',
  '00280004': 'Photometric Interpretation',
  '00280006': 'Planar Configuration',
  '00280008': 'Number of Frames',
  '00280010': 'Rows',
  '00280011': 'Columns',
  '00280030': 'Pixel Spacing',
  '00280100': 'Bits Allocated',
  '00280101': 'Bits Stored',
  '00280102': 'High Bit',
  '00280103': 'Pixel Representation',
  '00280106': 'Smallest Image Pixel Value',
  '00280107': 'Largest Image Pixel Value',
  '00281050': 'Window Center',
  '00281051': 'Window Width',
  '00281052': 'Rescale Intercept',
  '00281053': 'Rescale Slope',
  '00281054': 'Rescale Type',
  '00281055': 'Window Center & Width Explanation',
  '00282110': 'Lossy Image Compression',
  '00321032': 'Requesting Physician',
  '00321060': 'Requested Procedure Description',
  '00400244': 'Performed Procedure Step Start Date',
  '00400245': 'Performed Procedure Step Start Time',
  '00400253': 'Performed Procedure Step ID',
  '00400254': 'Performed Procedure Step Description',
  '00540081': 'Number of Slices',
  '52009229': 'Shared Functional Groups Sequence',
  '52009230': 'Per-frame Functional Groups Sequence',
  '7fe00010': 'Pixel Data',
};

export function tagName(tag) {
  const key = tag.replace(/^x/, '').toLowerCase();
  if (DICOM_DICT[key]) return DICOM_DICT[key];
  const group = parseInt(key.slice(0, 4), 16);
  if (group % 2 === 1) return 'Private Tag';
  if (key.endsWith('0000')) return 'Group Length';
  return '';
}

export function formatTag(tag) {
  const k = tag.replace(/^x/, '').toUpperCase();
  return `(${k.slice(0, 4)},${k.slice(4, 8)})`;
}

const TEXT_VR = new Set(['AE', 'AS', 'CS', 'DA', 'DS', 'DT', 'IS', 'LO', 'LT', 'PN', 'SH', 'ST', 'TM', 'UC', 'UI', 'UR', 'UT']);

/** dataset 요소 값을 사람이 읽을 수 있는 문자열로 */
export function elementValue(ds, el) {
  const vr = el.vr;
  const tag = el.tag;
  try {
    if (tag === 'x7fe00010') return `<pixel data ${el.length} bytes>`;
    if (el.items) return `<${el.items.length} item(s)>`;
    if (vr && TEXT_VR.has(vr)) return ds.string(tag) ?? '';
    const n = (fn, size) => {
      const count = Math.min(el.length / size, 16);
      const out = [];
      for (let i = 0; i < count; i++) out.push(fn.call(ds, tag, i));
      return out.join('\\') + (el.length / size > 16 ? ' …' : '');
    };
    switch (vr) {
      case 'US':
        return n(ds.uint16, 2);
      case 'SS':
        return n(ds.int16, 2);
      case 'UL':
        return n(ds.uint32, 4);
      case 'SL':
        return n(ds.int32, 4);
      case 'FL':
        return n(ds.float, 4);
      case 'FD':
        return n(ds.double, 8);
      case 'AT': {
        const g = ds.uint16(tag, 0);
        const e = ds.uint16(tag, 1);
        return `(${g?.toString(16).padStart(4, '0')},${e?.toString(16).padStart(4, '0')})`;
      }
      case 'OB':
      case 'OW':
      case 'OF':
      case 'OD':
      case 'UN':
        return `<binary ${el.length} bytes>`;
      default: {
        // implicit VR: 짧고 출력 가능한 문자열이면 표시
        if (el.length === 0) return '';
        if (el.length > 256) return `<${el.length} bytes>`;
        const str = ds.string(tag) ?? '';
        // eslint-disable-next-line no-control-regex
        if (/^[\x20-\x7e -￿\\]*$/.test(str)) return str;
        if (el.length === 2) return String(ds.uint16(tag));
        if (el.length === 4) return String(ds.uint32(tag));
        return `<${el.length} bytes>`;
      }
    }
  } catch {
    return '';
  }
}
