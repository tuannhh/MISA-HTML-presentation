// Ghép renderer dùng chung (shared/deck) với tài nguyên tĩnh: CSS theme, engine chuyển động, font Inter.
// Đọc file 1 lần lúc khởi động (bộ nhớ đệm trong tiến trình).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderDeckHtml, RATIO_SIZES } from '../../shared/deck/render.js';

const DECK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shared/deck');

let cache = null;
function load() {
  if (cache) return cache;
  const css = readFileSync(path.join(DECK_DIR, 'theme.css'), 'utf8');
  const engineJs = readFileSync(path.join(DECK_DIR, 'engine.js'), 'utf8');
  const font = readFileSync(path.join(DECK_DIR, 'fonts', 'InterVariable.woff2'));
  if (engineJs.includes('</script') || css.includes('</style')) throw new Error('Tài nguyên deck chứa thẻ đóng không hợp lệ');
  cache = { css, engineJs, font, fontB64: font.toString('base64') };
  return cache;
}

const fontFace = (src) =>
  `@font-face{font-family:"InterVariable";font-style:normal;font-weight:100 900;font-display:block;src:url(${src}) format("woff2")}`;

export const DECK_FONT_PATH = '/deck-assets/InterVariable.woff2';

export function deckFontBuffer() {
  return load().font;
}

/**
 * @param {object} spec
 * @param {object} o { ratio, mode, assetUrl, nonce, embedFont }
 */
export function renderDeck(spec, { ratio, mode = 'present', assetUrl, nonce, embedFont = false }) {
  const r = load();
  const fontCss = fontFace(embedFont ? `data:font/woff2;base64,${r.fontB64}` : DECK_FONT_PATH);
  return renderDeckHtml(spec, { ratio, mode, assetUrl, nonce, css: r.css, engineJs: r.engineJs, fontCss });
}

export function deckSize(ratio) {
  const [width, height] = RATIO_SIZES[ratio] || RATIO_SIZES['16:9'];
  return { width, height };
}
