// Bảng màu (tông màu) của bài trình bày. Hàm thuần — dùng chung cho renderer (server), giao diện chọn màu (Vue) và kiểm thử.
//  - 5 theme gốc (midnight, ocean, aurora, paper, ember) được tinh chỉnh tay trong theme.css.
//  - Các theme còn lại + "Tuỳ chỉnh" (người dùng nhập 2 màu) được SINH từ (nền sáng/tối, màu chính, màu phụ):
//    mọi màu dùng làm chữ đều được tự đẩy đậm/nhạt tới khi đạt tương phản tối thiểu với nền
//    (≥ 4.5:1 cho màu nhấn) → nền sáng không bao giờ ra chữ vàng/xám nhạt khó đọc.

export const PALETTE_TONES = Object.freeze(['dark', 'light']);

// swatch = màu minh hoạ cho ô chọn (theme gốc lấy từ theme.css; theme sinh ra tính bằng paletteVars).
export const THEME_PRESETS = Object.freeze({
  midnight: { tone: 'dark', label: 'Xanh đêm – cyan', hint: 'sang trọng, công nghệ', swatch: { bg: '#0A1530', ink: '#EEF3FF', a: '#2EE6D6', b: '#4D8DFF' } },
  ocean: { tone: 'dark', label: 'Xanh navy – trắng', hint: 'doanh nghiệp, tin cậy', swatch: { bg: '#06244A', ink: '#F0F7FF', a: '#2F8CFF', b: '#3CD3FF' } },
  aurora: { tone: 'dark', label: 'Tím – hồng', hint: 'sáng tạo, trẻ trung', swatch: { bg: '#1B0E2E', ink: '#F6F0FF', a: '#B79BFF', b: '#FF7AA8' } },
  carbon: { tone: 'dark', label: 'Đen – cam', hint: 'năng lượng, bứt phá', primary: '#FF7A1A', secondary: '#FFB547', bg: '#0B0B0D' },
  emerald: { tone: 'dark', label: 'Đen – xanh lá', hint: 'tăng trưởng, bền vững', primary: '#34D399', secondary: '#22D3EE', bg: '#04110D' },
  crimson: { tone: 'dark', label: 'Đen – đỏ', hint: 'mạnh mẽ, khẩn trương', primary: '#FF4D5E', secondary: '#FF9F43', bg: '#0F0709' },
  gold: { tone: 'dark', label: 'Đen – vàng kim', hint: 'cao cấp, vinh danh', primary: '#F5C451', secondary: '#E9DCC0', bg: '#0C0A06' },
  paper: { tone: 'light', label: 'Xanh dương – đen', hint: 'trang trọng, rõ ràng', swatch: { bg: '#F7F9FC', ink: '#0B1220', a: '#1D4ED8', b: '#0F172A' } },
  ember: { tone: 'light', label: 'Cam – đen', hint: 'năng động', swatch: { bg: '#FBF8F3', ink: '#111111', a: '#B83A0B', b: '#1C1917' } },
  sky: { tone: 'light', label: 'Xanh – trắng', hint: 'tươi sáng, hiện đại', primary: '#0B63E5', secondary: '#0A2A66', bg: '#FFFFFF' },
  sunset: { tone: 'light', label: 'Cam – trắng', hint: 'ấm áp, thân thiện', primary: '#C2410C', secondary: '#7C2D12', bg: '#FFFFFF' },
  forest: { tone: 'light', label: 'Xanh lá – đen', hint: 'tự nhiên, bền vững', primary: '#047857', secondary: '#0F172A', bg: '#F6FAF7' },
  royal: { tone: 'light', label: 'Tím – đen', hint: 'sáng tạo, khác biệt', primary: '#6D28D9', secondary: '#111827', bg: '#F8F7FC' },
  ruby: { tone: 'light', label: 'Đỏ – đen', hint: 'quyết liệt, nổi bật', primary: '#B91C1C', secondary: '#111111', bg: '#FCF8F8' },
});
export const CUSTOM_THEME = 'custom';
// Theme có CSS viết tay trong theme.css (không sinh biến).
export const CSS_THEMES = Object.freeze(['midnight', 'ocean', 'aurora', 'paper', 'ember']);

/* ---------------- màu cơ bản ---------------- */
const HEX_RE = /^#?([0-9a-f]{6})$/i;
export const isHex = (v) => typeof v === 'string' && HEX_RE.test(v.trim());
export const normHex = (v) => (isHex(v) ? `#${HEX_RE.exec(v.trim())[1].toUpperCase()}` : null);

const rgbOf = (hex) => {
  const n = parseInt(normHex(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hexOf = (rgb) => `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
export const mix = (a, b, t) => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return hexOf(x.map((c, i) => c + (y[i] - c) * t));
};
const rgba = (hex, a) => `rgba(${rgbOf(hex).join(', ')}, ${a})`;
const rgbList = (hex) => rgbOf(hex).join(', ');

function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function toHsl(hex) {
  const [r, g, b] = rgbOf(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl([h, s, l]) {
  if (s === 0) return hexOf([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return hexOf([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]);
}

// Đổi độ sáng (giữ sắc độ + độ bão hoà) về phía `toward` (trắng trên nền tối, đen trên nền sáng) tới khi đủ tương phản
// với nền → cam vẫn là cam đậm (không ngả nâu xám như khi pha đen), vàng thành vàng đồng đậm.
export function ensureContrast(color, bg, min, toward) {
  const c = normHex(color);
  if (contrast(c, bg) >= min) return c;
  const [h, s, l] = toHsl(c);
  const up = normHex(toward) === '#FFFFFF';
  for (let i = 1; i <= 50; i += 1) {
    const out = fromHsl([h, s, Math.min(1, Math.max(0, l + (up ? 0.02 : -0.02) * i))]);
    if (contrast(out, bg) >= min) return out;
  }
  return up ? '#FFFFFF' : '#000000';
}

/**
 * Sinh toàn bộ biến CSS của 1 bảng màu.
 * @param {{ tone:'dark'|'light', primary:string, secondary:string, bg?:string }} p
 * @returns {{ vars: Record<string,string>, primary: string, secondary: string, adjusted: boolean }}
 *   primary/secondary = màu thực dùng (có thể đã chỉnh đậm/nhạt), adjusted = có chỉnh đáng kể so với màu nhập.
 */
export function paletteVars(p) {
  const tone = p.tone === 'light' ? 'light' : 'dark';
  const primaryIn = normHex(p.primary) || (tone === 'light' ? '#1D4ED8' : '#2EE6D6');
  const secondaryIn = normHex(p.secondary) || (tone === 'light' ? '#0F172A' : '#4D8DFF');
  const dark = tone === 'dark';
  const toward = dark ? '#FFFFFF' : '#000000';

  const bg1 = normHex(p.bg) || (dark ? mix('#05070D', primaryIn, 0.06) : mix('#F8FAFC', primaryIn, 0.03));
  const bg2 = dark ? mix(mix(bg1, primaryIn, 0.1), '#FFFFFF', 0.03) : mix(mix(bg1, primaryIn, 0.05), '#000000', 0.03);
  // Màu chữ dựa trên tông nền, ám nhẹ màu chính cho hài hoà.
  const text = dark ? mix('#F4F6FB', primaryIn, 0.04) : ensureContrast(mix('#0B0F19', primaryIn, 0.06), bg2, 13, toward);
  const soft = ensureContrast(mix(text, bg1, dark ? 0.16 : 0.12), bg2, dark ? 9 : 10, toward);
  const muted = ensureContrast(mix(text, bg1, dark ? 0.4 : 0.3), bg2, dark ? 5.5 : 7, toward);
  const dim = ensureContrast(mix(text, bg1, dark ? 0.52 : 0.42), bg2, dark ? 4.5 : 5.5, toward);

  const primary = ensureContrast(primaryIn, bg2, 4.5, toward);
  const secondary = ensureContrast(secondaryIn, bg2, dark ? 4.5 : 4.5, toward);
  const blend = ensureContrast(mix(primary, secondary, 0.5), bg2, 4.5, toward);
  const shade = ensureContrast(mix(primary, toward, 0.28), bg2, 4.5, toward);
  const good = ensureContrast(dark ? '#4ADE80' : '#047857', bg2, 4.5, toward);
  const bad = ensureContrast(dark ? '#F87171' : '#B91C1C', bg2, 4.5, toward);
  const onAccent = contrast(primary, '#FFFFFF') >= contrast(primary, '#0A0A0A') ? '#FFFFFF' : mix(bg1, '#000000', 0.4);
  const line = dark ? mix(primary, '#FFFFFF', 0.5) : text;

  const vars = {
    '--bg1': bg1,
    '--bg2': bg2,
    '--glow-a': rgba(primary, dark ? 0.18 : 0.1),
    '--glow-b': rgba(secondary, dark ? 0.11 : 0.06),
    '--gridline': rgba(dark ? mix(primary, '#FFFFFF', 0.4) : text, 0.06),
    '--panel-a': dark ? rgba(mix(bg2, primary, 0.16), 0.82) : '#FFFFFF',
    '--panel-b': dark ? rgba(mix(bg1, primary, 0.06), 0.86) : mix('#FFFFFF', bg1, 0.5),
    '--line': rgba(line, 0.16),
    '--line-2': rgba(line, dark ? 0.3 : 0.32),
    '--text': text,
    '--soft': soft,
    '--muted': muted,
    '--dim': dim,
    // Bảng màu nhấn cho các mục (render.js xoay vòng cyan→blue→amber→mint→violet→coral):
    // 2 màu chính/phụ + biến thể của chúng; mint/coral giữ nghĩa tích cực/hạn chế ở trang so sánh.
    '--cyan': secondary,
    '--blue': primary,
    '--amber': blend,
    '--mint': good,
    '--violet': shade,
    '--coral': bad,
    '--accent': 'var(--blue)',
    '--accent-2': 'var(--cyan)',
    '--on-accent': onAccent,
    '--chip-bg': dark ? rgba(mix(bg2, primary, 0.12), 0.8) : '#FFFFFF',
    '--shadow': dark ? '0 40px 100px rgba(0, 0, 0, .38)' : `0 24px 60px ${rgba(text, 0.1)}`,
    '--node': rgbList(dark ? mix(primary, '#FFFFFF', 0.45) : primary),
    '--edge': rgbList(secondary),
    '--core': dark ? '#FFFFFF' : 'var(--accent)',
    '--core-ink': dark ? bg1 : '#FFFFFF',
    'color-scheme': tone,
  };
  const moved = (a, b) => contrast(a, b) > 1.15;
  return { vars, primary, secondary, adjusted: moved(primary, primaryIn) || moved(secondary, secondaryIn) };
}

/** Theme đã chọn → { tone, vars|null } (vars = null với theme viết tay trong theme.css). */
export function resolveTheme(theme, palette) {
  if (theme === CUSTOM_THEME && palette && isHex(palette.primary)) {
    return { tone: palette.tone === 'light' ? 'light' : 'dark', vars: paletteVars(palette).vars };
  }
  const p = THEME_PRESETS[theme] || THEME_PRESETS.midnight;
  if (CSS_THEMES.includes(theme)) return { tone: p.tone, vars: null };
  return { tone: p.tone, vars: paletteVars(p).vars };
}

/** Khối CSS gán biến cho theme sinh ra (chèn SAU theme.css để ghi đè :root). */
export function themeVarsCss(theme, palette) {
  const { vars } = resolveTheme(theme, palette);
  if (!vars) return '';
  const body = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';');
  return `[data-deck-theme="${theme === CUSTOM_THEME ? CUSTOM_THEME : theme}"]{${body}}`;
}

/** Màu minh hoạ cho ô chọn tông màu trong giao diện. */
export function themeSwatch(theme, palette) {
  if (theme === CUSTOM_THEME) {
    const r = paletteVars(palette || {});
    return { bg: r.vars['--bg1'], ink: r.vars['--text'], a: r.primary, b: r.secondary };
  }
  const p = THEME_PRESETS[theme] || THEME_PRESETS.midnight;
  if (p.swatch) return p.swatch;
  const r = paletteVars(p);
  return { bg: r.vars['--bg1'], ink: r.vars['--text'], a: r.primary, b: r.secondary };
}

export const themeTone = (theme, palette) => resolveTheme(theme, palette).tone;
export const presetsForTone = (tone) => Object.keys(THEME_PRESETS).filter((k) => THEME_PRESETS[k].tone === tone);
