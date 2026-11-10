// Kéo góc đổi cỡ ảnh / video theo tỷ lệ: ảnh ô media chính (image.size), phần tử ảnh tự do (giữ tỷ lệ mặc định), ghi vào bản nháp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeck } from '../../src/services/renderService.js';
import { applyMediaSize } from '../../frontend/src/lib/editPaths.js';
import { cleanImageSize } from '../../shared/deck/video.js';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((x) => x && existsSync(x));
const A = '11111111-2222-4333-8444-555555555555';
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const opts = (mode) => ({ ratio: '16:9', mode, assetUrl: () => PX, assetMeta: () => ({ width: 800, height: 600 }), videoEmbed: () => null, embeds: [], embedFont: true });

const deckSpec = (extra = {}) =>
  normalizeSpec({
    title: 'Thử',
    theme: 'paper',
    slides: [
      { layout: 'cover', title: 'MISA AMIS', subtitle: 'Nền tảng hợp nhất', image: { asset: A, fit: 'contain', ...extra } },
      { layout: 'free', title: 'Tự do', elements: [{ id: 'e-abc12', type: 'image', x: 10, y: 10, w: 40, h: 30, image: { asset: A, fit: 'cover' } }] },
    ],
  });

test('image.size: chỉ lưu số nguyên 30–150 khác 100; renderer gắn --mz cho ô media chính', () => {
  assert.equal(cleanImageSize(100), null);
  assert.equal(cleanImageSize(29), null);
  assert.equal(cleanImageSize(151), null);
  assert.equal(cleanImageSize('64.6'), 65);
  assert.equal(cleanImageSize('x'), null);
  const { spec, errors } = deckSpec({ size: 64.6 });
  assert.deepEqual(errors, []);
  assert.equal(spec.slides[0].image.size, 65);
  assert.equal(deckSpec({ size: 100 }).spec.slides[0].image.size, undefined);
  assert.equal(deckSpec({ size: 900 }).spec.slides[0].image.size, undefined);
  const html = renderDeck(spec, opts('present'));
  assert.match(html, /<figure[^>]*data-mz=""[^>]*style="[^"]*--mz:0\.65/);
  assert.doesNotMatch(renderDeck(deckSpec().spec, opts('present')), /<figure[^>]*data-mz/);
});

test('applyMediaSize: ghi cỡ ảnh / video của ô media chính, kẹp số, 100% = bỏ trường; đường dẫn khác bị từ chối', () => {
  const spec = { slides: [{ layout: 'cover', image: { asset: A } }, { layout: 'image', video: { provider: 'youtube', id: 'dQw4w9WgXcQ' } }, { layout: 'bullets' }] };
  assert.equal(applyMediaSize(spec, 0, 'slot', 72.4), true);
  assert.equal(spec.slides[0].image.size, 72);
  assert.equal(applyMediaSize(spec, 0, 'slot', 999), true);
  assert.equal(spec.slides[0].image.size, 150);
  assert.equal(applyMediaSize(spec, 0, 'slot', 100), true);
  assert.equal('size' in spec.slides[0].image, false);
  assert.equal(applyMediaSize(spec, 1, 'slot', 55), true);
  assert.equal(spec.slides[1].video.size, 55);
  assert.equal(applyMediaSize(spec, 1, 'slot', 140), true);
  assert.equal('size' in spec.slides[1].video, false);
  assert.equal(applyMediaSize(spec, 1, 'slot', 5), true);
  assert.equal(spec.slides[1].video.size, 30);
  assert.equal(applyMediaSize(spec, 2, 'slot', 50), false);
  assert.equal(applyMediaSize(spec, 0, 'images.0', 50), false);
  assert.equal(applyMediaSize(spec, 9, 'slot', 50), false);
  assert.equal(applyMediaSize(spec, 0, 'slot', 'abc'), false);
});

test('Chromium thật: kéo góc ảnh ô media chính → thu theo tỷ lệ + gửi deck:msize; ảnh tự do kéo góc giữ nguyên tỷ lệ khung', { skip: CHROME ? false : 'không có Chromium', timeout: 90000 }, async () => {
  const { spec, errors } = deckSpec();
  assert.deepEqual(errors, []);
  const html = renderDeck(spec, opts('edit'));
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e.message || e)));
    await page.setViewport({ width: 1600, height: 900 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (window.__deck ? window.__deck.ready : null));
    await page.evaluate(() => { window.__msgs = []; window.addEventListener('message', (e) => window.__msgs.push(e.data)); });
    const rect = (sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, sel);

    // --- ảnh ô media chính của bìa ---
    const fig = '.slide.L-cover figure.media[data-m="slot"]';
    const r0 = await rect(fig);
    await page.mouse.move(r0.x + r0.w / 2, r0.y + r0.h / 2);
    await page.waitForSelector('#msz.on');
    const h0 = await rect('#msz i[data-h="se"]');
    const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
    const sx = h0.x + h0.w / 2, sy = h0.y + h0.h / 2;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    // kéo góc về phía tâm còn 60% khoảng cách
    await page.mouse.move(cx + (sx - cx) * 0.8, cy + (sy - cy) * 0.8, { steps: 4 });
    await page.mouse.move(cx + (sx - cx) * 0.6, cy + (sy - cy) * 0.6, { steps: 4 });
    await page.mouse.up();
    const r1 = await rect(fig);
    const mz = await page.evaluate((s) => document.querySelector(s).style.getPropertyValue('--mz'), fig);
    assert.ok(Math.abs(Number(mz) - 0.6) < 0.04, `--mz ≈ 0.6: ${mz}`);
    assert.ok(Math.abs(r1.w / r0.w - Number(mz)) < 0.02 && Math.abs(r1.h / r0.h - Number(mz)) < 0.02, 'thu đều hai chiều');
    assert.ok(Math.abs(r1.w / r1.h - r0.w / r0.h) < 0.01, 'giữ tỷ lệ khung');
    assert.ok(Math.abs(r1.x + r1.w / 2 - cx) < 2 && Math.abs(r1.y + r1.h / 2 - cy) < 2, 'thu quanh tâm');
    await new Promise((r) => setTimeout(r, 50));
    const msg = await page.evaluate(() => window.__msgs.filter((m) => m && m.type === 'deck:msize'));
    assert.equal(msg.length, 1);
    assert.deepEqual({ index: msg[0].index, path: msg[0].path, kind: msg[0].kind }, { index: 0, path: 'slot', kind: 'image' });
    assert.equal(msg[0].size, Math.round(Number(mz) * 100));

    // --- phần tử ảnh tự do: kéo góc lệch hẳn tỷ lệ vẫn giữ tỷ lệ khung ---
    await page.evaluate(() => window.postMessage({ type: 'deck:goto', index: 1 }, '*'));
    await page.waitForFunction(() => document.querySelector('.slide.L-free') && document.querySelector('.slide.L-free').getAttribute('aria-hidden') !== 'true');
    const fe = '.slide.L-free .fe-image';
    const f0 = await rect(fe);
    await page.mouse.click(f0.x + f0.w / 2, f0.y + f0.h / 2);
    await page.waitForSelector(`${fe} .fe-h[data-h="se"]`);
    const g = await rect(`${fe} .fe-h[data-h="se"]`);
    await page.mouse.move(g.x + g.w / 2, g.y + g.h / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.w / 2 + 120, g.y + g.h / 2 + 10, { steps: 5 });
    await page.mouse.up();
    const f1 = await rect(fe);
    assert.ok(f1.w > f0.w + 80, 'ảnh to ra');
    assert.ok(Math.abs(f1.w / f1.h - f0.w / f0.h) < 0.02, `giữ tỷ lệ: ${(f1.w / f1.h).toFixed(3)} / ${(f0.w / f0.h).toFixed(3)}`);
    assert.ok(Math.abs(f1.x - f0.x) < 2 && Math.abs(f1.y - f0.y) < 2, 'góc đối diện đứng yên');
    assert.deepEqual(errs, []);
  } finally {
    await browser.close();
  }
});
