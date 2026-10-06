// Ghép renderer dùng chung (shared/deck) với tài nguyên tĩnh: CSS theme, mẫu nền động + engine chuyển động, phông chữ.
// Đọc file 1 lần lúc khởi động (bộ nhớ đệm trong tiến trình).
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDeckHtml, RATIO_SIZES } from '../../shared/deck/render.js';
import { fontFaceCss, FONT_FILES, DEFAULT_FONT } from '../../shared/deck/fonts.js';
import { uses3d } from '../../shared/deck/bg3d.js';

const DECK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shared/deck');
const FONT_DIR = path.join(DECK_DIR, 'fonts');
// Gói hiệu ứng 3D (three.js) do `npm run build` sinh — thiếu (chạy dev chưa build) thì bài 3D tự lùi về nền 2D/ảnh phẳng.
const DECK3D_FILE = path.resolve(DECK_DIR, '../../dist/deck-runtime/deck3d.js');
const FONT_SET = new Set(FONT_FILES);

let cache = null;
function load() {
  if (cache) return cache;
  const css = readFileSync(path.join(DECK_DIR, 'theme.css'), 'utf8');
  // backgrounds.js khai báo window.DeckBg (IIFE) — phải chạy trước engine.js.
  const engineJs = `${readFileSync(path.join(DECK_DIR, 'backgrounds.js'), 'utf8')}\n;\n${readFileSync(path.join(DECK_DIR, 'engine.js'), 'utf8')}`;
  if (/<\/script/i.test(engineJs) || /<\/style/i.test(css)) throw new Error('Tài nguyên deck chứa thẻ đóng không hợp lệ');
  let deck3d = null;
  if (existsSync(DECK3D_FILE)) {
    // Gói đã rút gọn: chặn chuỗi "</script" (nếu có) để nhúng inline an toàn.
    const js = readFileSync(DECK3D_FILE, 'utf8').replace(/<\/script/gi, '<\\/script');
    deck3d = { js, buf: Buffer.from(js), v: createHash('sha256').update(js).digest('hex').slice(0, 12) };
  }
  cache = { css, engineJs, fonts: new Map(), deck3d };
  return cache;
}

// Tệp phông (woff2) theo danh sách cho phép — đường dẫn không bao giờ lấy trực tiếp từ người dùng.
export function deckFontFile(file) {
  if (!FONT_SET.has(file)) return null;
  const c = load();
  if (!c.fonts.has(file)) c.fonts.set(file, readFileSync(path.join(FONT_DIR, file)));
  return c.fonts.get(file);
}

export const DECK3D_PATH = '/deck-assets/deck3d.js';
// Nội dung gói 3D cho route /deck-assets/deck3d.js (null = chưa build).
export function deck3dBuffer() {
  return load().deck3d?.buf || null;
}

export const DECK_FONT_BASE = '/deck-assets/fonts/';
// Giữ đường dẫn cũ (bản xuất/khung xem trước đời trước có thể còn tham chiếu).
export const DECK_FONT_PATH = '/deck-assets/InterVariable.woff2';
export function deckFontBuffer() {
  return deckFontFile('InterVariable.woff2');
}

/**
 * @param {object} spec
 * @param {object} o { ratio, mode, assetUrl, assetMeta, videoEmbed, embeds, nonce, embedFont }
 *   embedFont: nhúng phông dạng data URI (xuất HTML/PDF/thumbnail chạy không có máy chủ); không thì tải từ /deck-assets/fonts/.
 */
export function renderDeck(spec, { ratio, mode = 'present', assetUrl, assetMeta, videoEmbed, embeds, nonce, embedFont = false }) {
  const r = load();
  const ids = [spec.font?.heading || DEFAULT_FONT, spec.font?.body || DEFAULT_FONT];
  const fontCss = fontFaceCss(ids, (file) => (embedFont ? `data:font/woff2;base64,${deckFontFile(file).toString('base64')}` : `${DECK_FONT_BASE}${file}`));
  // 3D: bản tự chứa (xuất HTML/PDF/thumbnail) nhúng inline khi bài dùng 3D; khung xem trước tải qua URL (trình duyệt lưu đệm) —
  // trình soạn thảo luôn tải để đổi sang nền 3D là thấy ngay.
  const d3 = r.deck3d;
  const want = d3 && (uses3d(spec) || (!embedFont && mode === 'edit'));
  const preJs = want && embedFont ? d3.js : '';
  const preSrc = want && !embedFont ? `${DECK3D_PATH}?v=${d3.v}` : '';
  return renderDeckHtml(spec, { ratio, mode, assetUrl, assetMeta, videoEmbed, embeds, nonce, css: r.css, engineJs: r.engineJs, fontCss, preJs, preSrc });
}

export function deckSize(ratio) {
  const [width, height] = RATIO_SIZES[ratio] || RATIO_SIZES['16:9'];
  return { width, height };
}
