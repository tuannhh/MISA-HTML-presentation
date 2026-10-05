// Kiểm thử chuẩn hoá spec (allowlist, giới hạn, layout dự phòng) và renderer (chống XSS, kích thước theo tỷ lệ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeSpec, collectAssetIds, dropForeignAssets, SPEC_LIMITS } from '../../src/services/specService.js';
import { renderDeckHtml, RATIO_SIZES, esc } from '../../shared/deck/render.js';

const sample = JSON.parse(readFileSync(new URL('../fixtures/sample-spec.json', import.meta.url), 'utf8'));
const XSS = '<img src=x onerror=alert(1)><script>alert(2)</script>"\'&';

test('normalizeSpec strict (người dùng lưu): bỏ trường lạ, giữ đủ 13 layout của bộ mẫu', () => {
  const { spec, errors } = normalizeSpec({ ...sample, evil: 'x', slides: sample.slides.map((s) => ({ ...s, onclick: 'x' })) }, { strict: true });
  assert.deepEqual(errors, []);
  assert.equal(spec.evil, undefined);
  assert.equal(spec.slides.length, sample.slides.length);
  assert.ok(spec.slides.every((s) => s.onclick === undefined));
  assert.equal(new Set(spec.slides.map((s) => s.layout)).size, 13);
});

test('normalizeSpec strict: báo lỗi khi vượt giới hạn; lenient: cắt ngắn', () => {
  const long = 'a'.repeat(SPEC_LIMITS.title + 50);
  const input = { title: 'T', slides: [{ layout: 'section', title: long }] };
  assert.ok(normalizeSpec(input, { strict: true }).errors.length > 0);
  const lenient = normalizeSpec(input);
  assert.ok(lenient.spec.slides[0].title.length <= SPEC_LIMITS.title);
});

test('normalizeSpec lenient (AI): ảnh/bộ sưu tập không có ảnh thật được hạ bố cục', () => {
  const { spec } = normalizeSpec(sample);
  assert.equal(spec.slides.find((s) => s.title === sample.slides[10].title)?.layout !== 'image', true);
});

test('normalizeSpec: layout thiếu dữ liệu được hạ về bố cục an toàn (chế độ AI)', () => {
  const { spec } = normalizeSpec({ slides: [{ layout: 'stats', title: 'Không có số liệu', stats: [] }] });
  assert.notEqual(spec.slides[0].layout, 'stats');
});

test('normalizeSpec: theme lạ → mặc định, không có trang → báo lỗi', () => {
  const { spec, errors } = normalizeSpec({ theme: 'javascript:alert(1)', slides: [] });
  assert.equal(spec.theme, 'midnight');
  assert.ok(errors.some((e) => e.includes('ít nhất 1 trang')));
});

test('dropForeignAssets: bỏ tham chiếu ảnh không thuộc bài', () => {
  const mine = '0b6f1c1e-5a0b-4c7e-9d36-1f1e2a3b4c5d';
  const foreign = '9b6f1c1e-5a0b-4c7e-9d36-1f1e2a3b4c5d';
  const { spec } = normalizeSpec({
    slides: [
      { layout: 'image', title: 'A', image: { asset: foreign, fit: 'cover' } },
      { layout: 'image', title: 'B', image: { asset: mine, fit: 'cover' } },
    ],
  });
  assert.deepEqual([...collectAssetIds(spec)].sort(), [foreign, mine].sort());
  dropForeignAssets(spec, new Set([mine]));
  assert.deepEqual([...collectAssetIds(spec)], [mine]);
});

test('renderer: mọi chuỗi người dùng đều được escape (chống XSS)', () => {
  const { spec } = normalizeSpec({
    title: XSS,
    footer: XSS,
    slides: [
      { layout: 'cover', kicker: XSS, title: XSS, subtitle: XSS, tags: [XSS], caption: XSS },
      { layout: 'bullets', title: 'B', items: [{ title: XSS, text: XSS }, { title: 'x', text: 'y' }] },
      { layout: 'quote', title: 'Q', quote: { text: XSS, author: XSS, role: XSS } },
    ],
  });
  const html = renderDeckHtml(spec, { ratio: '16:9', mode: 'present', nonce: 'abc', assetUrl: () => null, css: '', engineJs: '' });
  assert.ok(!html.includes('<img src=x'), 'không có thẻ img chèn từ dữ liệu');
  assert.ok(!html.includes('<script>alert(2)'), 'không có script chèn từ dữ liệu');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'dữ liệu hiển thị dạng chữ');
  assert.equal(esc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('renderer: kích thước canvas theo tỷ lệ', () => {
  assert.deepEqual(RATIO_SIZES['16:9'], [2560, 1440]);
  assert.deepEqual(RATIO_SIZES['4:3'], [1920, 1440]);
  assert.deepEqual(RATIO_SIZES['2:1'], [2880, 1440]);
  assert.deepEqual(RATIO_SIZES['3:1'], [4320, 1440]);
});
