// Góp ý 12/11/2026: giãn chữ (moves.t / phần tử chữ ls), chữ nghiêng, thanh định dạng nổi cho phần tử chữ trang tự do (deck:ellook),
// dời khối bìa (blk.text / blk.media), tắt thanh tiến trình / số trang, chế độ xem ảnh, phông mới + mặc định Google Sans.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';
import { cleanMoves, moveAttr, blockMove, cleanLs, isMovePath, LS_MIN, LS_MAX } from '../../shared/deck/layers.js';
import { cleanTextLook } from '../../shared/deck/free.js';
import { parseRich, serializeRich, richHtml, formatRange } from '../../shared/deck/rich.js';
import { DECK_FONTS, DEFAULT_FONT, fontStack, FONT_FILES } from '../../shared/deck/fonts.js';
import { applyFrameMove, applyElementLook } from '../../frontend/src/lib/editPaths.js';

const html = (spec, mode = 'present') => renderDeckHtml(spec, { ratio: '16:9', mode, assetUrl: () => null, css: '', engineJs: '' });
const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../shared/deck/fonts');

test('cleanLs: kẹp trong [LS_MIN, LS_MAX], 0/NaN = theo mặc định', () => {
  assert.equal(cleanLs(0.05), 0.05);
  assert.equal(cleanLs(9), LS_MAX);
  assert.equal(cleanLs(-9), LS_MIN);
  assert.equal(cleanLs('x'), 0);
  assert.equal(cleanLs(0), 0);
});

test('cleanMoves: lưu giãn chữ t cho ô chữ; khối bìa blk.* chỉ giữ vị trí', () => {
  const m = cleanMoves({
    title: { x: 0, y: 0, t: 0.08 },
    subtitle: { x: 1, y: 2, t: 3 },
    'blk.text': { x: 5, y: -4, s: 2, l: 1.5, w: 50, t: 0.2 },
    'blk.media': { x: 0, y: 0, s: 2 },
    'blk.other': { x: 5, y: 5 },
  });
  assert.deepEqual(m, { title: { x: 0, y: 0, t: 0.08 }, subtitle: { x: 1, y: 2, t: LS_MAX }, 'blk.text': { x: 5, y: -4 } });
  assert.equal(isMovePath('blk.media'), true);
  assert.equal(isMovePath('blk.other'), false);
});

test('moveAttr: giãn chữ → data-ls + letter-spacing (em)', () => {
  const a = moveAttr({ title: { x: 0, y: 0, t: 0.05 } }, 'title', 2560, 1440);
  assert.match(a, /data-ls="0.05"/);
  assert.match(a, /letter-spacing:0.05em/);
});

test('blockMove: % khung → translate px; chế độ sửa gắn data-mk', () => {
  assert.deepEqual(blockMove({ 'blk.text': { x: 10, y: -5 } }, 'blk.text', 2560, 1440, true), { attr: ' data-mk="blk.text" data-mv="256 -72"', css: 'translate:256px -72px' });
  assert.deepEqual(blockMove(null, 'blk.media', 2560, 1440, false), { attr: '', css: '' });
  assert.deepEqual(blockMove(null, 'blk.media', 2560, 1440, true), { attr: ' data-mk="blk.media"', css: '' });
});

test('applyFrameMove: lưu / xoá giãn chữ; khối bìa bỏ cỡ chữ gửi kèm', () => {
  const spec = { slides: [{ layout: 'cover', title: 'A' }] };
  assert.equal(applyFrameMove(spec, 0, 'title', 0, 0, undefined, undefined, undefined, 0.1), true);
  assert.deepEqual(spec.slides[0].moves, { title: { x: 0, y: 0, t: 0.1 } });
  assert.equal(applyFrameMove(spec, 0, 'title', 0, 0, undefined, undefined, undefined, 0), true);
  assert.equal(spec.slides[0].moves, undefined);
  assert.equal(applyFrameMove(spec, 0, 'blk.media', 4, 3, 2, 1.5, 40, 0.2), true);
  assert.deepEqual(spec.slides[0].moves, { 'blk.media': { x: 4, y: 3 } });
});

test('applyElementLook: chỉ phần tử chữ; cỡ kẹp; lh/ls = 0 xoá trường', () => {
  const spec = { slides: [{ layout: 'free', elements: [{ id: 'e-a', type: 'text', text: 'x', size: 1 }, { id: 'e-b', type: 'table', rows: [['']] }] }] };
  assert.equal(applyElementLook(spec, 0, 'e-a', { size: 9 }), true);
  assert.equal(spec.slides[0].elements[0].size, 4);
  assert.equal(applyElementLook(spec, 0, 'e-a', { lh: 1.5, ls: 0.05 }), true);
  assert.equal(spec.slides[0].elements[0].lh, 1.5);
  assert.equal(spec.slides[0].elements[0].ls, 0.05);
  assert.equal(applyElementLook(spec, 0, 'e-a', { ls: 0 }), true);
  assert.equal('ls' in spec.slides[0].elements[0], false);
  assert.equal(applyElementLook(spec, 0, 'e-b', { size: 2 }), false);
  assert.equal(applyElementLook(spec, 0, 'e-zz', { size: 2 }), false);
});

test('normalizeSpec: phần tử chữ giữ lh/ls hợp lệ, bỏ giá trị rác', () => {
  assert.deepEqual(cleanTextLook({ lh: 1.4, ls: 0.02 }), { lh: 1.4, ls: 0.02 });
  assert.deepEqual(cleanTextLook({ lh: 'a', ls: 0 }), {});
  const { spec } = normalizeSpec({ title: 'T', slides: [{ layout: 'free', elements: [{ id: 'e-abc1', type: 'text', text: 'Xin chào', lh: 1.6, ls: 0.05 }] }] });
  const el = spec.slides[0].elements[0];
  assert.equal(el.lh, 1.6);
  assert.equal(el.ls, 0.05);
  const out = html(spec);
  assert.match(out, /data-ls="0.05"/);
  assert.match(out, /letter-spacing:0.05em/);
});

test('Chữ nghiêng: parse/serialize khứ hồi, HTML có font-style italic, formatRange bật/tắt', () => {
  const s = serializeRich([{ t: 'nghiêng', i: true }, { t: ' thường' }]);
  const back = parseRich(s);
  assert.equal(back[0].i, true);
  assert.equal(back[1].i, false);
  assert.match(richHtml(s, ''), /font-style:italic;/);
  assert.match(richHtml(s, ''), /data-ri=""/);
  const off = formatRange(s, 0, 3, { i: false });
  assert.equal(parseRich(off)[0].i, false);
});

test('Thiết lập bài: tắt thanh tiến trình / số trang, chế độ xem ảnh — chỉ lưu khi khác mặc định', () => {
  const base = { title: 'T', slides: [{ layout: 'bullets', title: 'A', items: [{ title: 'x' }] }, { layout: 'bullets', title: 'B', items: [{ title: 'y' }] }] };
  const d = normalizeSpec(base).spec;
  assert.equal('footerBar' in d, false);
  assert.equal('pageNum' in d, false);
  assert.equal('imageView' in d, false);
  const on = html(d);
  assert.match(on, /class="ft-n"/);
  assert.match(on, /data-iv="full"/);
  assert.match(on, /data-hud="bar num"/);

  const off = normalizeSpec({ ...base, footerBar: false, pageNum: false, imageView: 'natural' }).spec;
  assert.equal(off.footerBar, false);
  assert.equal(off.pageNum, false);
  assert.equal(off.imageView, 'natural');
  const h = html(off);
  assert.doesNotMatch(h, /class="ft-n"/);
  assert.doesNotMatch(h, /class="ft[ "]/);
  assert.match(h, /data-iv="natural"/);
  assert.match(h, /data-hud="none"/);

  const onlyNum = html(normalizeSpec({ ...base, footerBar: false }).spec);
  assert.match(onlyNum, /class="ft-n"/);
  assert.match(onlyNum, /data-hud="num"/);
  assert.equal('imageView' in normalizeSpec({ ...base, imageView: 'zoom' }).spec, false);
});

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((x) => x && existsSync(x));
async function withPage(html, fn, mode) {
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    if (mode === 'reduce') await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (window.__deck ? window.__deck.ready : null));
    await page.evaluate(() => document.fonts.ready);
    return await fn(page);
  } finally {
    await browser.close();
  }
}

test('Chromium thật: cụm nghĩa dài không để lỗ trống ở dòng trên; cụm ngắn trong thẻ hẹp vẫn giữ trọn (không rớt 1 chữ)', { skip: CHROME ? false : 'không có Chromium', timeout: 90000 }, async () => {
  const { renderDeck } = await import('../../src/services/renderService.js');
  const { spec, errors } = normalizeSpec({
    title: 'Thử',
    slides: [
      {
        layout: 'cards',
        title: 'TỔNG QUAN SỰ PHÁT TRIỂN CỦA NGÀNH CÔNG NGHIỆP LỪA ĐẢO',
        wrap: ['TỔNG QUAN', 'SỰ PHÁT TRIỂN CỦA NGÀNH CÔNG NGHIỆP LỪA ĐẢO'],
        items: ['Cơ quan nhà nước', 'Ngân hàng', 'Người quen, nhà sư', 'Giao hàng, thợ điện'].map((t, i) => ({ title: t, wrap: i === 2 ? ['Người quen,', 'nhà sư'] : i === 3 ? ['Giao hàng,', 'thợ điện'] : [t], text: 'Mô tả ngắn' })),
      },
    ],
  });
  assert.deepEqual(errors, []);
  const html = renderDeck(spec, { ratio: '16:9', mode: 'present', assetUrl: () => null, assetMeta: () => null, videoEmbed: () => null, embeds: [], embedFont: true });
  const r = await withPage(html, (page) => page.evaluate(() => {
    const t = document.querySelector('#deck .slide .title');
    const range = document.createRange();
    range.selectNodeContents(t);
    const tops = new Map();
    for (const x of range.getClientRects()) if (x.width) { const k = Math.round(x.top / 8); const v = tops.get(k) || [Infinity, -Infinity]; tops.set(k, [Math.min(v[0], x.left), Math.max(v[1], x.right)]); }
    const lines = [...tops.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const w = t.getBoundingClientRect().width;
    const h4 = [...document.querySelectorAll('#deck .slide h4')];
    return { flow: t.querySelectorAll('.nbf').length, lines: lines.length, fill: (lines[0][1] - lines[0][0]) / w, keep: h4[2].querySelectorAll('.nbf').length, h4lines: Math.round(h4[2].offsetHeight / parseFloat(getComputedStyle(h4[2]).lineHeight)) };
  }), 'reduce');
  assert.ok(r.flow >= 1, 'cụm dài phải chảy như chữ thường');
  assert.ok(r.lines <= 2, `tiêu đề ${r.lines} dòng`);
  assert.ok(r.fill > 0.75, `dòng 1 chỉ lấp ${Math.round(r.fill * 100)}%`);
  assert.equal(r.keep, 0, '"Người quen, / nhà sư" giữ trọn cụm');
  assert.equal(r.h4lines, 2);
});

test('Chromium thật: phần tử chữ trang tự do đang chọn không bị tự co (tay nắm không tính là tràn); cỡ pt giữ đúng giá trị đặt', { skip: CHROME ? false : 'không có Chromium', timeout: 90000 }, async () => {
  const { renderDeck } = await import('../../src/services/renderService.js');
  const { spec } = normalizeSpec({ title: 'Thử', slides: [{ layout: 'free', elements: [{ id: 'e-ttl01', type: 'text', style: 'title', text: 'Tiêu đề', x: 5, y: 5, w: 60, h: 14 }] }] });
  const html = renderDeck(spec, { ratio: '16:9', mode: 'edit', assetUrl: () => null, assetMeta: () => null, videoEmbed: () => null, embeds: [], embedFont: true });
  const r = await withPage(html, async (page) => {
    await page.evaluate(() => window.postMessage({ type: 'deck:select', id: 'e-ttl01', edit: true }, '*'));
    await new Promise((ok) => setTimeout(ok, 300));
    return page.evaluate(() => {
      const fe = document.querySelector('.fe[data-el="e-ttl01"]');
      const inp = document.querySelector('#rtb [aria-label="Cỡ chữ (pt)"]');
      const msgs = [];
      addEventListener('message', (e) => { if (e.data && e.data.type === 'deck:ellook') msgs.push(e.data); });
      inp.value = '40';
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      const fk1 = fe.style.getPropertyValue('--fk');
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      return new Promise((ok) => setTimeout(() => ok({ sel: fe.classList.contains('sel'), fk1, fk: fe.style.getPropertyValue('--fk'), pt: inp.value, ls: !!document.querySelector('#rtb [aria-label="Giãn chữ"]'), it: !!document.querySelector('#rtb .tb-it'), msgs }), 100));
    });
  });
  assert.equal(r.sel, true);
  assert.equal(r.fk1, '1');
  assert.equal(r.fk, '1');
  assert.equal(r.pt, '40');
  assert.ok(r.ls && r.it, 'thanh nổi có giãn chữ + nghiêng');
  assert.ok(r.msgs.length >= 1 && r.msgs.every((m) => m.size === r.msgs[0].size), 'Enter không làm cỡ chữ co dồn');
});

test('Phông: thêm Quicksand, Dosis, Prompt, Times New Roman (Tinos); mặc định Google Sans; đủ tệp', () => {
  assert.equal(DEFAULT_FONT, 'google-sans');
  for (const id of ['quicksand', 'dosis', 'prompt', 'tinos', 'montserrat', 'google-sans']) assert.ok(DECK_FONTS[id], id);
  assert.match(DECK_FONTS.tinos.label, /Times New Roman/);
  assert.match(fontStack('tinos'), /serif$/);
  assert.match(fontStack('nope'), /Deck Google Sans/);
  for (const f of FONT_FILES) assert.ok(existsSync(path.join(FONT_DIR, f)), f);
});
