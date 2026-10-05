// Kiểm tra loại tệp phía trình duyệt TRƯỚC khi tải lên (báo ngay lý do + cách xử lý, không đợi tải xong mới lỗi)
// và đổi ảnh HEIC (iPhone) sang JPEG — máy chủ không giải mã được HEIC (nén HEVC). Máy chủ vẫn tự kiểm tra lại bằng magic bytes.
import { ApiError } from '@/lib/api.js';

const ext = (name) => ((String(name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();

const DOCS = ['pptx', 'docx', 'xlsx', 'pdf', 'txt', 'md', 'markdown', 'csv', 'tsv', 'html', 'htm', 'odt', 'odp', 'ods'];
const IMAGES = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'heic', 'heif'];
const AUDIO = ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'opus', 'flac', 'aac', 'aiff', 'aif', 'webm', 'mp4'];
const SOURCE_EXT = new Set([...DOCS, ...IMAGES, ...AUDIO]);
const IMAGE_EXT = new Set(IMAGES);

// Hộp chọn tệp: liệt kê cả định dạng cũ (.doc/.xls/.ppt…) để người dùng chọn được và nhận hướng dẫn lưu lại,
// thay vì tệp bị làm mờ mà không biết vì sao.
export const SOURCE_ACCEPT = [
  ...[...SOURCE_EXT].map((e) => `.${e}`),
  '.doc', '.xls', '.ppt', '.pps', '.key', '.pages', '.numbers',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'audio/*', 'image/heic', 'image/heif',
].join(',');
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/heic,image/heif,.heic,.heif,.avif';

const ADVICE = {
  doc: 'Word đời cũ (.doc) — mở bằng Word, chọn Lưu thành .docx',
  dot: 'Word đời cũ — mở bằng Word, chọn Lưu thành .docx',
  rtf: 'mở bằng Word, chọn Lưu thành .docx',
  xls: 'Excel đời cũ (.xls) — mở bằng Excel, chọn Lưu thành .xlsx',
  xlt: 'Excel đời cũ — mở bằng Excel, chọn Lưu thành .xlsx',
  ppt: 'PowerPoint đời cũ (.ppt) — mở bằng PowerPoint, chọn Lưu thành .pptx',
  pps: 'PowerPoint đời cũ — mở bằng PowerPoint, chọn Lưu thành .pptx',
  pot: 'PowerPoint đời cũ — mở bằng PowerPoint, chọn Lưu thành .pptx',
  key: 'tệp Keynote — chọn Tệp → Xuất sang → PowerPoint hoặc PDF',
  pages: 'tệp Pages — chọn Tệp → Xuất sang → Word hoặc PDF',
  numbers: 'tệp Numbers — chọn Tệp → Xuất sang → Excel',
  zip: 'tệp nén — giải nén rồi chọn từng tệp bên trong',
  rar: 'tệp nén — giải nén rồi chọn từng tệp bên trong',
  '7z': 'tệp nén — giải nén rồi chọn từng tệp bên trong',
  mov: 'video MOV — tư liệu chỉ nhận ghi âm/ghi hình MP4, WebM (video gắn slide thêm ở bước dàn ý)',
};

/** Tệp tư liệu nguồn: null = nhận; chuỗi = lý do không nhận (kèm cách xử lý). */
export function sourceProblem(file) {
  const e = ext(file.name);
  if (!e || SOURCE_EXT.has(e)) return null;
  return `"${file.name}": ${ADVICE[e] || 'định dạng chưa hỗ trợ (dùng PPTX, DOCX, XLSX, PDF, CSV, TXT/MD, ảnh hoặc ghi âm)'}`;
}

export const isImageFile = (file) => /^image\//.test(file.type || '') || IMAGE_EXT.has(ext(file.name));
const isHeic = (file) => /^image\/hei[cf]/i.test(file.type || '') || /^hei[cf]$/.test(ext(file.name));

/**
 * Ảnh HEIC → JPEG ngay trên trình duyệt (Safari giải mã được HEIC; Chrome/Edge/Firefox thì chưa → báo cách chuyển).
 * Tệp khác giữ nguyên. Thu cạnh dài về ≤ 2560px cho nhẹ (máy chủ còn thu tiếp về 1920px).
 */
export async function heicToJpeg(file) {
  if (!isHeic(file)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, 2560 / Math.max(img.naturalWidth, img.naturalHeight));
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k));
    cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) throw new Error('canvas');
    return new File([blob], file.name.replace(/\.(heic|heif)$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    throw new ApiError(0, 'HEIC_UNSUPPORTED', `"${file.name}": trình duyệt này chưa đọc được ảnh HEIC (iPhone). Mở bằng Safari, hoặc chuyển ảnh sang JPEG (trên Mac: Xem trước → Xuất → JPEG) rồi tải lại.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
