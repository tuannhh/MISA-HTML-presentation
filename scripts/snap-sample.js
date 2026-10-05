// Công cụ dev: render spec mẫu rồi chụp toàn bộ slide thành 1 ảnh "contact sheet" để soát nhanh bố cục.
// Dùng: node scripts/snap-sample.js [ratio] [theme] [specFile]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { renderDeck, deckSize } from '../src/services/renderService.js';
import { createBrowserService } from '../src/services/browserService.js';

const [ratio = '16:9', theme, specFile = 'test/fixtures/sample-spec.json'] = process.argv.slice(2);
const spec = JSON.parse(readFileSync(specFile, 'utf8'));
if (theme) spec.theme = theme;
const { width, height } = deckSize(ratio);
const html = renderDeck(spec, { ratio, embedFont: true });
const browser = createBrowserService({ chromePath: process.env.CHROME_PATH, concurrency: 1 });
try {
  const indices = spec.slides.map((_, i) => i);
  const shots = await browser.screenshotSlides(html, { width, height, indices });
  const tw = ratio === '3:1' ? 960 : 720;
  const th = Math.round((tw * height) / width);
  const cols = ratio === '3:1' ? 2 : 3;
  const rows = Math.ceil(shots.length / cols);
  const gap = 12;
  const tiles = await Promise.all(shots.map((b) => sharp(b).resize(tw, th).png().toBuffer()));
  const sheet = await sharp({ create: { width: cols * tw + (cols + 1) * gap, height: rows * th + (rows + 1) * gap, channels: 3, background: '#808080' } })
    .composite(tiles.map((input, i) => ({ input, left: gap + (i % cols) * (tw + gap), top: gap + Math.floor(i / cols) * (th + gap) })))
    .png()
    .toBuffer();
  mkdirSync('tmp', { recursive: true });
  const out = `tmp/sheet-${ratio.replace(':', 'x')}-${spec.theme || 'midnight'}.png`;
  writeFileSync(out, sheet);
  shots.forEach((b, i) => writeFileSync(`tmp/slide-${String(i + 1).padStart(2, '0')}.png`, b));
  console.log(`Đã ghi ${out}`);
} finally {
  await browser.close();
}
