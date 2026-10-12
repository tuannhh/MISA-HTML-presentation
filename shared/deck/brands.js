// Biểu tượng kênh liên hệ (đủ màu nhận diện, viewBox 48×48) cho số điện thoại trên trang Liên hệ / Ưu đãi và trình soạn thảo.
// Hình vẽ giản lược để người xem nhận ra kênh (Zalo, Viber, Telegram, iMessage) — hằng số tin cậy, không nhận SVG từ ngoài.
const PHONE = 'M17.6 12.5c.8-.6 1.9-.4 2.4.4l2.3 3.3c.5.8.4 1.8-.3 2.4l-1.5 1.2c.9 2.3 2.9 4.4 5.3 5.6l1.2-1.5c.6-.7 1.7-.9 2.4-.3l3.3 2.3c.8.6 1 1.7.3 2.4l-1.4 1.6c-1.2 1.2-2.9 1.5-4.4.9-5.6-2.2-9.8-6.4-11.7-11.9-.5-1.5-.1-3.2 1.1-4.3z';
export const BRAND_ICONS = Object.freeze({
  call: `<rect width="48" height="48" rx="12" fill="#16A34A"/><path transform="translate(1.5 2.5) scale(1.05)" d="${PHONE}" fill="#FFFFFF"/>`,
  zalo: '<rect width="48" height="48" rx="12" fill="#0068FF"/><path d="M24 8.5c-9.7 0-17.5 6.6-17.5 14.8 0 4.7 2.6 8.9 6.6 11.6l-1.3 5 5.6-2.8c2 .7 4.3 1 6.6 1 9.7 0 17.5-6.6 17.5-14.8S33.7 8.5 24 8.5z" fill="#FFFFFF"/><text x="24" y="27.4" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="10.5" fill="#0068FF">Zalo</text>',
  viber: `<rect width="48" height="48" rx="12" fill="#7360F2"/><path d="M24 8.5c-8.9 0-15.5 5.3-15.5 13.8 0 4.5 1.7 7.8 4.8 9.9v6.3l5.6-3.7c1.6.3 3.3.5 5.1.5 8.9 0 15.5-5.3 15.5-13.2S32.9 8.5 24 8.5z" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linejoin="round"/><path transform="translate(5.2 2.2) scale(.78)" d="${PHONE}" fill="#FFFFFF"/>`,
  telegram: '<circle cx="24" cy="24" r="24" fill="#229ED9"/><path d="M10.4 23.6 33.6 14.6c1.1-.4 2.1.3 1.7 1.9l-3.9 18.6c-.3 1.3-1.1 1.6-2.2 1l-6-4.4-2.9 2.8c-.3.3-.6.6-1.3.6l.5-6.1 11.2-10.1c.5-.4-.1-.7-.8-.3l-13.8 8.7-6-1.9c-1.3-.4-1.3-1.3.5-1.8z" fill="#FFFFFF"/>',
  imessage: '<rect width="48" height="48" rx="12" fill="#34C759"/><path d="M24 10.5c-8.8 0-16 5.7-16 12.8 0 4 2.3 7.6 5.9 9.9-.3 2-1.3 3.8-2.8 5.2 3 0 5.6-1.1 7.5-2.8 1.7.4 3.5.6 5.4.6 8.8 0 16-5.7 16-12.9S32.8 10.5 24 10.5z" fill="#FFFFFF"/>',
});

/** SVG biểu tượng kênh (đủ màu) | '' nếu kênh lạ. */
export const brandSvg = (ch, label = '') =>
  BRAND_ICONS[ch] ? `<svg viewBox="0 0 48 48" class="bico" role="img" aria-label="${String(label).replace(/[&<>"']/g, '')}">${BRAND_ICONS[ch]}</svg>` : '';
