// Kiểu khung ảnh + lớp phủ màu — áp cho MỌI ảnh trên trang (ô ảnh của bố cục, ảnh bộ sưu tập, ảnh chèn tự do).
// Lưu ngay trên tham chiếu ảnh (đi theo ảnh khi đổi bố cục/nhân bản trang), không đụng tới tệp ảnh — hiển thị bằng CSS.
//   radius  : 'none' | 'sm' | 'md' | 'lg' | 'circle'        (bỏ trống = theo phong cách bài)
//   shadow  : 'none' | 'sm' | 'md' | 'lg'                    (bỏ trống = theo phong cách bài)
//   border  : 'none' | { color, w }                          w = 1…16 px khung 1920; bỏ trống = theo phong cách bài
//   overlay : { kind: 'flat'|'fade'|'frosted', color, opacity: 5…95 }
// color = token theo bảng màu bài (đổi theo tông khi đổi chủ đề) | '#RRGGBB'.
// Dùng chung: specService (làm sạch), render.js (CSS), giao diện (bảng chọn + xem trước).

export const IMG_RADII = Object.freeze(['none', 'sm', 'md', 'lg', 'circle']);
export const IMG_SHADOWS = Object.freeze(['none', 'sm', 'md', 'lg']);
export const OVERLAY_KINDS = Object.freeze(['flat', 'fade', 'frosted']);
export const BORDER_W = Object.freeze({ min: 1, max: 16 });
export const OVERLAY_OPACITY = Object.freeze({ min: 5, max: 95, def: 45 });

// Token màu → CSS theo biến của chủ đề.
export const IMG_COLORS = Object.freeze({
  accent: { label: 'Màu nhấn', css: 'var(--accent)' },
  'accent-2': { label: 'Màu nhấn phụ', css: 'var(--accent-2)' },
  text: { label: 'Màu chữ', css: 'var(--text)' },
  bg: { label: 'Màu nền', css: 'var(--bg2)' },
  white: { label: 'Trắng', css: '#FFFFFF' },
  dark: { label: 'Đen', css: '#0B0F19' },
});

const HEX = /^#[0-9a-f]{6}$/i;
const RADIUS_CSS = { none: '0', sm: '12px', md: '28px', lg: '64px', circle: '50%' };
const SHADOW_CSS = {
  none: 'none',
  sm: '0 6px 18px rgba(0,0,0,.20)',
  md: '0 18px 44px rgba(0,0,0,.30)',
  lg: '0 36px 90px rgba(0,0,0,.42)',
};

export function cleanColor(v) {
  if (typeof v !== 'string') return null;
  if (Object.prototype.hasOwnProperty.call(IMG_COLORS, v)) return v;
  return HEX.test(v) ? v.toLowerCase() : null;
}
export const colorCss = (c) => (IMG_COLORS[c] ? IMG_COLORS[c].css : HEX.test(c || '') ? c : IMG_COLORS.dark.css);

const intIn = (v, min, max) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Math.round(Number(v)))) : null);

/** Làm sạch các trường kiểu ảnh từ đối tượng bất kỳ → { radius?, shadow?, border?, overlay? } (chỉ khoá hợp lệ). */
export function cleanImgLook(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  if (IMG_RADII.includes(o.radius)) out.radius = o.radius;
  if (IMG_SHADOWS.includes(o.shadow)) out.shadow = o.shadow;
  if (o.border === 'none') out.border = 'none';
  else if (o.border && typeof o.border === 'object') {
    const color = cleanColor(o.border.color);
    const w = intIn(o.border.w, BORDER_W.min, BORDER_W.max);
    if (color && w) out.border = { color, w };
  }
  const ov = o.overlay;
  if (ov && typeof ov === 'object' && OVERLAY_KINDS.includes(ov.kind)) {
    out.overlay = {
      kind: ov.kind,
      color: cleanColor(ov.color) || 'dark',
      opacity: intIn(ov.opacity, OVERLAY_OPACITY.min, OVERLAY_OPACITY.max) ?? OVERLAY_OPACITY.def,
    };
  }
  return out;
}

/** CSS nội tuyến cho khung ảnh (ghi đè kiểu mặc định của phong cách bài) — '' khi không chỉnh gì. */
export function lookCss(ref) {
  if (!ref) return '';
  let s = '';
  if (RADIUS_CSS[ref.radius]) s += `border-radius:${RADIUS_CSS[ref.radius]};`;
  if (SHADOW_CSS[ref.shadow]) s += `box-shadow:${SHADOW_CSS[ref.shadow]};`;
  if (ref.border === 'none') s += 'border:0;';
  else if (ref.border && ref.border.w) s += `border:${ref.border.w}px solid ${colorCss(ref.border.color)};`;
  return s;
}

/** CSS của lớp phủ (đặt trên ảnh, dưới chú thích). Dùng chung cho xem trước ở giao diện (color = mã màu thật). */
export function overlayCss(ov, cssColor) {
  if (!ov || !OVERLAY_KINDS.includes(ov.kind)) return '';
  const c = cssColor || colorCss(ov.color);
  const p = intIn(ov.opacity, OVERLAY_OPACITY.min, OVERLAY_OPACITY.max) ?? OVERLAY_OPACITY.def;
  const mix = (k) => `color-mix(in srgb, ${c} ${Math.round(k)}%, transparent)`;
  if (ov.kind === 'fade') return `background:linear-gradient(to top, ${mix(p)} 0%, ${mix(p * 0.55)} 38%, transparent 78%);`;
  if (ov.kind === 'frosted') return `background:${mix(p * 0.6)};backdrop-filter:blur(14px) saturate(1.15);-webkit-backdrop-filter:blur(14px) saturate(1.15);`;
  return `background:${mix(p)};`;
}

/** Thẻ lớp phủ cho renderer ('' khi không có). */
export const overlayHtml = (ref) => (ref && ref.overlay ? `<i class="ovl" aria-hidden="true" style="${overlayCss(ref.overlay)}"></i>` : '');

/** Chép các trường kiểu (khi thay ảnh khác vào cùng khung — giữ kiểu khung). */
export function pickLook(ref) {
  const out = {};
  if (!ref) return out;
  for (const k of ['radius', 'shadow', 'border', 'overlay']) if (ref[k] !== undefined) out[k] = ref[k];
  return out;
}
