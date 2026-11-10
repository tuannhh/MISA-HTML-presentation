// Tuỳ chọn trình chiếu + vị trí của video trên trang (người dùng chọn ở bảng Video — KHÔNG qua AI). Dùng chung server (specService
// chuẩn hoá), renderer (thuộc tính data-*) và giao diện. Mặc định = hành vi cũ: bấm mới phát, phát toàn màn hình, có tiếng, căn giữa, cỡ đầy ô.
//  - autoplay   : tự phát khi tới trang (hoặc khi bước trình chiếu chứa video hiện ra)
//  - fullscreen : false → phát ngay trong khung video trên trang thay vì phóng toàn màn hình
//  - muted      : phát không tiếng (trình duyệt chặn tự phát có tiếng khi người xem chưa thao tác → engine tự lùi về tắt tiếng)
//  - align      : 'left' | 'right' (không có = giữa) trong ô media của bố cục
//  - size       : % bề rộng ô media (30–100, không có = 100)
export const VIDEO_ALIGNS = Object.freeze(['left', 'center', 'right']);
export const VIDEO_SIZE_MIN = 30;
export const VIDEO_SIZE_MAX = 100;
// Ảnh của ô media chính (slide.image.size): % so với cỡ bố cục đặt — người dùng kéo góc ảnh trên khung (engine) để thu / phóng theo tỷ lệ.
export const IMAGE_SIZE_MIN = 30;
export const IMAGE_SIZE_MAX = 150;
/** Cỡ ảnh hợp lệ (số nguyên %, khác 100) hoặc null. */
export function cleanImageSize(v) {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= IMAGE_SIZE_MIN && n <= IMAGE_SIZE_MAX && n !== 100 ? n : null;
}
// Vimeo: mã số video; video "không công khai" cần thêm mã riêng tư (h=…) mới nhúng được.
export const VIMEO_ID_RE = /^\d{5,12}$/;
export const VIMEO_HASH_RE = /^[0-9a-f]{6,24}$/i;

/** Tuỳ chọn hợp lệ từ dữ liệu không tin cậy — chỉ lưu khác mặc định. */
export function cleanVideoOpts(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  if (o.autoplay === true) out.autoplay = true;
  if (o.fullscreen === false) out.fullscreen = false;
  if (o.muted === true) out.muted = true;
  if (o.align === 'left' || o.align === 'right') out.align = o.align;
  const n = Math.round(Number(o.size));
  if (Number.isFinite(n) && n >= VIDEO_SIZE_MIN && n < VIDEO_SIZE_MAX) out.size = n;
  return out;
}

/** Thuộc tính cờ trình chiếu gắn lên figure.vid (engine đọc). */
export function videoFlags(v) {
  const o = cleanVideoOpts(v);
  return `${o.autoplay ? ' data-auto=""' : ''}${o.fullscreen === false ? ' data-inline=""' : ''}${o.muted ? ' data-muted=""' : ''}`;
}

/** Thuộc tính căn/cỡ gắn lên .vbox (CSS theme.css). */
export function videoBoxAttr(v) {
  const o = cleanVideoOpts(v);
  return `${o.align ? ` data-va="${o.align === 'left' ? 'l' : 'r'}"` : ''}${o.size ? ` style="--vz:${(o.size / 100).toFixed(2)}"` : ''}`;
}
