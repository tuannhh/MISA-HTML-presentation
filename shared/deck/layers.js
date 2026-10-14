// Tinh chỉnh tay trên trang có bố cục (người dùng làm trên khung soạn thảo — KHÔNG qua AI):
//  1) moves — dời vị trí, đổi cỡ chữ, giãn dòng, độ rộng khung từng ô chữ: { "<đường dẫn trường>": { x, y, s?, l?, w? } }
//     x/y = % bề rộng/cao khung, dịch tương đối so với chỗ bố cục đặt (giống kéo hộp chữ trong PowerPoint); s = hệ số cỡ chữ
//     (1 = cỡ bố cục, 0,5–3); l = giãn dòng (line-height không đơn vị 0,8–3, không có = theo bố cục); w = độ rộng khung chữ
//     (% bề rộng khung 5–100, không có = theo bố cục — chữ tự xuống dòng theo khung mới). Renderer gắn data-mv/data-fz/data-lh/data-bw
//     + style `zoom` (cỡ chữ), `line-height`, `width` và `translate` (độc lập với `transform` của hiệu ứng) → mọi chế độ
//     (trình chiếu, HTML xuất, PDF, ảnh bìa) đều đúng vị trí, đúng cỡ.
//  2) hide — tắt hoạ tiết trang trí của trang (quầng sáng, hình bìa, số phần lớn, dấu ngoặc kép…). Thay hoạ tiết bằng ảnh/hình khối
//     = tắt hoạ tiết + chèn phần tử (elements) đúng chỗ hoạ tiết cũ.
// Dùng chung server (specService chuẩn hoá), renderer và trình soạn thảo.
import { SPEC_LIMITS } from './limits.js';

// Trường chữ được phép dời (khớp đường dẫn data-e của renderer, trừ phần tử tự do/chân trang — phần tử tự do đã có toạ độ riêng).
const MOVE_PATH_RE = /^(?:kicker|title|subtitle|caption|root|quote\.(?:text|author|role)|(?:items|steps)\.\d{1,2}\.(?:title|text|value)|stats\.\d{1,2}\.(?:value|label|prefix|suffix)|columns\.\d\.(?:title|subtitle|points\.\d{1,2})|tags\.\d{1,2}|images\.\d{1,2}\.caption|(?:image|video)\.caption)$/;
export const MOVE_LIMIT = SPEC_LIMITS.moves; // số ô chữ dời được mỗi trang
export const MOVE_RANGE = 100; // ±% khung
export const SIZE_MIN = 0.5; // cỡ chữ tối thiểu / tối đa so với cỡ bố cục
export const SIZE_MAX = 3;
export const cleanSize = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(Math.max(SIZE_MIN, Math.min(SIZE_MAX, n)) * 100) / 100 : 1;
};
export const LH_MIN = 0.8; // giãn dòng (line-height không đơn vị)
export const LH_MAX = 3;
export const BOX_MIN = 5; // độ rộng khung chữ, % bề rộng khung trang
export const BOX_MAX = 100;
// 0 / rỗng / không phải số = theo bố cục (không lưu).
export const cleanLh = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(Math.max(LH_MIN, Math.min(LH_MAX, n)) * 100) / 100 : 0;
};
export const cleanBox = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(Math.max(BOX_MIN, Math.min(BOX_MAX, n)) * 10) / 10 : 0;
};

export const isMovePath = (p) => typeof p === 'string' && p.length <= 40 && MOVE_PATH_RE.test(p);
const r2 = (v) => Math.round(v * 100) / 100;

/** Chuẩn hoá moves từ dữ liệu không tin cậy → object (không prototype) hoặc null khi rỗng. Mục sai bị bỏ (không phải chữ người dùng gõ). */
export function cleanMoves(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= MOVE_LIMIT) break;
    if (!isMovePath(k) || !v || typeof v !== 'object') continue;
    const x = Number(v.x ?? 0);
    const y = Number(v.y ?? 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const m = { x: r2(Math.max(-MOVE_RANGE, Math.min(MOVE_RANGE, x))), y: r2(Math.max(-MOVE_RANGE, Math.min(MOVE_RANGE, y))) };
    const sz = v.s === undefined ? 1 : cleanSize(v.s);
    const lh = cleanLh(v.l);
    const bw = cleanBox(v.w);
    if (sz !== 1) m.s = sz;
    if (lh) m.l = lh;
    if (bw) m.w = bw;
    if (Math.abs(m.x) < 0.05 && Math.abs(m.y) < 0.05 && sz === 1 && !lh && !bw) continue; // về chỗ cũ, mọi thứ theo bố cục = không lưu
    out[k] = m;
    n += 1;
  }
  return n ? out : null;
}

/**
 * Thuộc tính data-mv/data-fz/data-lh/data-bw + style cho ô chữ đã chỉnh tay; '' nếu giữ nguyên. Ô chữ không có thuộc tính style khác.
 * `translate` (thuộc tính riêng, không phải transform — hiệu ứng xuất hiện của engine ghi đè transform) và `width` tính trong hệ
 * toạ độ đã `zoom` của chính ô → chia cho hệ số cỡ chữ để ô dịch / rộng đúng px trên khung. Độ rộng khung bỏ max-width của bố cục
 * (tiêu đề, phụ đề có trần riêng) và không co theo hàng flex — người dùng chủ động kéo rộng.
 */
export function moveAttr(moves, path, W, H) {
  const m = moves && Object.prototype.hasOwnProperty.call(moves, path) ? moves[path] : null;
  if (!m) return '';
  const x = Math.round(((m.x || 0) * W) / 100);
  const y = Math.round(((m.y || 0) * H) / 100);
  const s = m.s && m.s !== 1 ? cleanSize(m.s) : 1;
  const l = cleanLh(m.l);
  const bw = cleanBox(m.w);
  if (!x && !y && s === 1 && !l && !bw) return '';
  const st = [
    x || y ? `translate:${r2(x / s)}px ${r2(y / s)}px` : '',
    s !== 1 ? `zoom:${s}` : '',
    l ? `line-height:${l}` : '',
    bw ? `width:${r2((bw * W) / 100 / s)}px;max-width:none;flex-shrink:0` : '',
  ].filter(Boolean).join(';');
  return ` data-mv="${x} ${y}"${s !== 1 ? ` data-fz="${s}"` : ''}${l ? ` data-lh="${l}"` : ''}${bw ? ` data-bw="${bw}"` : ''} style="${st}"`;
}

// Hoạ tiết trang trí ẩn được theo từng trang. layouts: bố cục có hoạ tiết đó (null = mọi bố cục có cấu trúc).
// pick = hoạ tiết bấm chọn được trên khung soạn thảo (để xoá / thay bằng ảnh, hình khối).
export const DECORS = Object.freeze({
  glow: { label: 'Quầng sáng nền', layouts: null },
  grid: { label: 'Lưới kẻ nền', layouts: null },
  bg: { label: 'Nền động (riêng trang này)', layouts: null },
  art: { label: 'Hình trang trí trang bìa', layouts: ['cover'], pick: true },
  secno: { label: 'Số thứ tự phần cỡ lớn', layouts: ['section'], pick: true },
  qmark: { label: 'Dấu ngoặc kép lớn', layouts: ['quote'], pick: true },
  vs: { label: 'Biểu tượng VS / mũi tên giữa hai cột', layouts: ['comparison'], pick: true },
  icons: { label: 'Biểu tượng ở các ý, thẻ', layouts: ['bullets', 'cards', 'stats', 'image', 'org', 'comparison', 'closing'] },
  nums: { label: 'Số thứ tự (01, 02…)', layouts: ['agenda', 'bullets', 'cards', 'stats', 'image', 'gallery', 'timeline', 'process', 'quote', 'comparison'] },
  arrows: { label: 'Mũi tên nối các bước', layouts: ['process', 'timeline'] },
});
export const DECOR_KEYS = Object.freeze(Object.keys(DECORS));

/** Hoạ tiết có ở bố cục này (thứ tự hiển thị trên bảng điều khiển). Trang tự do không có hoạ tiết bố cục, chỉ có nền. */
export function decorsFor(layout) {
  if (layout === 'free') return ['glow', 'grid', 'bg'];
  return DECOR_KEYS.filter((k) => !DECORS[k].layouts || DECORS[k].layouts.includes(layout));
}

/** Chuẩn hoá danh sách hoạ tiết ẩn → mảng khoá hợp lệ (theo thứ tự chuẩn, không trùng) hoặc null. */
export function cleanHide(raw) {
  if (!Array.isArray(raw)) return null;
  const set = new Set(raw.filter((k) => typeof k === 'string'));
  const out = DECOR_KEYS.filter((k) => set.has(k));
  return out.length ? out : null;
}

/** Lớp CSS trên <section class="slide"> cho các hoạ tiết đã ẩn (theme.css: .x-<khoá>). */
export const hideClasses = (hide) => (Array.isArray(hide) ? hide.filter((k) => DECORS[k]).map((k) => ` x-${k}`).join('') : '');
