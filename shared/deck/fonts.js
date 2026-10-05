// Phông chữ của bài trình bày — tự lưu trữ (woff2 trong shared/deck/fonts/, giấy phép OFL kèm theo thư mục từng phông).
// Máy người xem không cần cài phông: xem trước tải qua /deck-assets/fonts/…, HTML/PDF xuất ra nhúng base64.
// Mỗi phông (trừ Inter bản đầy đủ) chia 3 tệp theo bảng mã latin / latin-ext / vietnamese — trình duyệt chỉ tải phần
// chứa ký tự đang dùng (unicode-range). Nguồn: gói @fontsource 5.3 (Google Fonts). Hàm thuần, không đọc tệp.
const R = Object.freeze({
  vietnamese: 'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  'latin-ext': 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
});
const sub3 = (id, weight, name) => ['latin', 'latin-ext', 'vietnamese'].map((s) => ({ file: `${id}/${name.replace('{s}', s)}`, weight, range: R[s] }));

export const DECK_FONTS = Object.freeze({
  inter: { label: 'Inter', family: 'InterVariable', features: '"cv11", "ss01"', faces: [{ file: 'InterVariable.woff2', weight: '100 900' }] },
  montserrat: { label: 'Montserrat', family: 'Deck Montserrat', faces: sub3('montserrat', '100 900', 'montserrat-{s}-wght-normal.woff2') },
  barlow: {
    label: 'Barlow',
    family: 'Deck Barlow',
    // Barlow không có bản biến thiên → mỗi độ đậm 1 tệp (400–900).
    faces: [400, 500, 600, 700, 800, 900].flatMap((w) => sub3('barlow', String(w), `barlow-{s}-${w}-normal.woff2`)),
  },
  roboto: { label: 'Roboto', family: 'Deck Roboto', faces: sub3('roboto', '100 900', 'roboto-{s}-wght-normal.woff2') },
  // Google Sans (OFL từ 2025) chỉ có độ đậm 400–700: tiêu đề đậm nhất hiển thị ở 700.
  'google-sans': { label: 'Google Sans', family: 'Deck Google Sans', faces: sub3('google-sans', '400 700', 'google-sans-{s}-wght-normal.woff2') },
});
export const FONT_IDS = Object.freeze(Object.keys(DECK_FONTS));
export const DEFAULT_FONT = 'inter';
const FALLBACK = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif';

export const fontStack = (id) => `"${(DECK_FONTS[id] || DECK_FONTS[DEFAULT_FONT]).family}", ${FALLBACK}`;

// Mọi tệp phông hợp lệ (allowlist cho route /deck-assets/fonts/… và khi nhúng base64).
export const FONT_FILES = Object.freeze([...new Set(Object.values(DECK_FONTS).flatMap((f) => f.faces.map((x) => x.file)))]);

/**
 * @font-face cho các phông được dùng. src(file) → URL hoặc data URI (nơi gọi quyết định).
 * font-display: block để engine đo/co chữ (fitText) với đúng phông, không đo trên phông dự phòng.
 */
export function fontFaceCss(ids, src) {
  return [...new Set(ids)]
    .filter((id) => DECK_FONTS[id])
    .flatMap((id) =>
      DECK_FONTS[id].faces.map(
        (f) => `@font-face{font-family:"${DECK_FONTS[id].family}";font-style:normal;font-weight:${f.weight};font-display:block;src:url(${src(f.file)}) format("woff2")${f.range ? `;unicode-range:${f.range}` : ''}}`,
      ),
    )
    .join('\n');
}
