// Thiết kế bài trình bày phía giao diện: tông màu (mẫu + tuỳ chỉnh), mẫu nền động, phông chữ, logo.
// Dùng chung renderer (shared/deck) để màu/nền/phông ở ô chọn khớp đúng bài trình bày sau khi dựng.
import '@shared/deck/backgrounds.js';
import { THEME_PRESETS, CUSTOM_THEME, presetsForTone, themeSwatch, themeTone, paletteVars, normHex, contrast } from '@shared/deck/palette.js';
import { DECK_FONTS, DEFAULT_FONT, fontStack, fontFaceCss } from '@shared/deck/fonts.js';

export { THEME_PRESETS, CUSTOM_THEME, presetsForTone, themeSwatch, themeTone, paletteVars, normHex, contrast, DEFAULT_FONT, fontStack };

export const DeckBg = globalThis.DeckBg;

export const BACKGROUND_OPTIONS = [
  ...DeckBg.NAMES.map((name) => ({ value: name, label: DeckBg.LABELS[name] || name })),
  { value: 'none', label: 'Không hiệu ứng' },
];

export const FONT_OPTIONS = Object.entries(DECK_FONTS).map(([value, f]) => ({ value, label: f.label || value, stack: fontStack(value) }));

export const LOGO_POSITIONS = [
  { value: 'tl', label: 'Trên – trái' },
  { value: 'tc', label: 'Trên – giữa' },
  { value: 'tr', label: 'Trên – phải' },
  { value: 'bl', label: 'Dưới – trái' },
  { value: 'bc', label: 'Dưới – giữa' },
  { value: 'br', label: 'Dưới – phải' },
];
export const LOGO_SHOW = [
  { value: 'all', label: 'Mọi trang' },
  { value: 'cover', label: 'Trang bìa & trang kết' },
  { value: 'inner', label: 'Trừ trang bìa' },
];
export const LOGO_SIZE = { min: 40, max: 360, def: 110 };
export const CUTOUT_MODES = [
  { value: 'auto', label: 'Tự động' },
  { value: 'color', label: 'Nền 1 màu (trắng/đơn sắc)' },
  { value: 'ai', label: 'Nền phức tạp (AI)' },
];

// Gợi ý cặp màu cho "Tuỳ chỉnh" theo tông nền.
export const CUSTOM_SUGGESTIONS = {
  dark: [
    { label: 'Xanh – đen', primary: '#3B82F6', secondary: '#22D3EE' },
    { label: 'Cam – đen', primary: '#FF7A1A', secondary: '#FFB547' },
    { label: 'Xanh lá – đen', primary: '#22C55E', secondary: '#A3E635' },
    { label: 'Hồng – tím', primary: '#F472B6', secondary: '#A78BFA' },
  ],
  light: [
    { label: 'Xanh – trắng', primary: '#0B63E5', secondary: '#0A2A66' },
    { label: 'Cam – trắng', primary: '#EA580C', secondary: '#7C2D12' },
    { label: 'Đỏ – trắng', primary: '#DC2626', secondary: '#111827' },
    { label: 'Xanh ngọc – trắng', primary: '#0D9488', secondary: '#134E4A' },
  ],
};

// Màu dùng cho ô xem trước nền động: lấy từ bảng màu thật của theme.
export function previewColors(theme, palette) {
  const sw = themeSwatch(theme, palette);
  const tone = themeTone(theme, palette);
  const rgb = (hex) => {
    const n = parseInt((normHex(hex) || '#808080').slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  };
  return { bg: sw.bg, ink: sw.ink, a: sw.a, b: sw.b, tone, node: rgb(sw.a), edge: rgb(sw.b), accent: rgb(sw.a), accent2: rgb(sw.b) };
}

// @font-face cho mọi phông bài trình bày (tải từ /deck-assets/fonts/) — chèn 1 lần để ô chọn phông hiển thị đúng mặt chữ.
let fontsInjected = false;
export function ensureDeckFonts() {
  if (fontsInjected || typeof document === 'undefined') return;
  fontsInjected = true;
  const style = document.createElement('style');
  style.dataset.deckFonts = '';
  style.textContent = fontFaceCss(Object.keys(DECK_FONTS), (file) => `/deck-assets/fonts/${file}`);
  document.head.appendChild(style);
}

// Thiết kế mặc định (khi dữ liệu cũ thiếu trường).
export function withDesignDefaults(d) {
  if (!d.theme) d.theme = 'midnight';
  if (d.palette === undefined) d.palette = null;
  if (!d.background) d.background = 'network';
  if (!d.font) d.font = { heading: DEFAULT_FONT, body: DEFAULT_FONT };
  if (d.logo === undefined) d.logo = null;
  return d;
}
