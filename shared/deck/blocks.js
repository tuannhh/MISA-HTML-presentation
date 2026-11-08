// Khối trình bày gắn thêm vào trang có bố cục (người dùng chọn trong trình soạn thảo, AI không tự đặt):
// - Ảnh nhấn (slide.accent): đặt ảnh của trang (slide.image) sát mép trái / phải / trên hoặc làm nền — độc lập với nội dung.
// - Hộp chú thích (slide.callout): ghi chú / cảnh báo / thành công ở cuối trang.
// - Chuyển trang (spec.transition mặc định cả bài, slide.transition riêng từng trang).
// Hàm thuần, dùng chung server (specService làm sạch), renderer và trình soạn thảo.

export const ACCENT_POS = Object.freeze(['left', 'right', 'top', 'bg']);
// Bố cục nhận ảnh nhấn: các bố cục nội dung chưa có ô ảnh riêng (+ "Ý chính" — ảnh nhấn thay ô ảnh chia đôi mặc định).
export const ACCENT_LAYOUTS = Object.freeze(['agenda', 'bullets', 'cards', 'stats', 'timeline', 'process', 'comparison', 'closing']);

export const CALLOUT_TONES = Object.freeze(['note', 'warn', 'ok']);
export const CALLOUT_LAYOUTS = Object.freeze(['agenda', 'bullets', 'cards', 'stats', 'timeline', 'process', 'comparison', 'image', 'chart']);

// Phần tử đầu = mặc định (mờ dần — giao diện gốc); 'none' = chuyển ngay.
export const TRANSITIONS = Object.freeze(['fade', 'push', 'zoom', 'flip', 'curtain', 'none']);

// Ảnh nhấn chiếm ~40% khung → trang quá nhiều mục (thẻ, bước, số liệu, cột) thì tạm ẩn ảnh để chữ không bị co quá nhỏ.
export const ACCENT_MAX_ITEMS = 6;
const len = (v) => (Array.isArray(v) ? v.length : 0);
/** Trang quá dày cho ảnh nhấn (giao diện báo người dùng). */
export const accentTooDense = (s) => Math.max(len(s?.items), len(s?.steps), len(s?.stats), len(s?.columns)) > ACCENT_MAX_ITEMS;
/** Vị trí ảnh nhấn còn hiển thị được: bố cục hỗ trợ + trang có ảnh (không phải video) + không quá dày. */
export function accentPos(s) {
  return s && ACCENT_POS.includes(s.accent) && ACCENT_LAYOUTS.includes(s.layout) && !s.video && s.image?.asset && !accentTooDense(s) ? s.accent : '';
}

export const cleanAccent = (v) => (ACCENT_POS.includes(v) ? v : '');
// Cả bài: mặc định không lưu. Từng trang: '' = theo cả bài; giá trị khác (kể cả 'fade') ghi đè.
export const cleanTransition = (v, deck = false) => (TRANSITIONS.includes(v) && !(deck && v === TRANSITIONS[0]) ? v : '');
