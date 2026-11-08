// Kiểm thử Đợt 3: nhập bài trình bày HTML làm ở công cụ khác (htmlDeckService) + chế độ "giữ nguyên nội dung và số trang"
// (pageSource) + trang tự do "giữ nguyên thiết kế" (ảnh đứng yên, ẩn chân trang) + tuỳ chọn dàn ý keepOriginal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeHtml, stripHeavyMedia, decodeDataImage, assignVideos, designSlide, slidesText } from '../../src/services/htmlDeckService.js';
import { splitTextPages, markPages, countMarked, paginateSource, KEEP_MAX_PAGES } from '../../src/services/pageSource.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { normalizeOutline } from '../../src/services/outlineService.js';
import { importViewport } from '../../src/services/presentationService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';

const A = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';

// MP4 tối thiểu: hộp ftyp ở đầu (sniffVideo nhận) + phần đệm cho đủ lớn.
const fakeMp4 = (n = 80000) => {
  const b = Buffer.alloc(n, 7);
  b.writeUInt32BE(24, 0);
  b.write('ftypisom', 4, 'latin1');
  return b;
};

test('looksLikeHtml: bỏ BOM, khoảng trắng, chú thích đầu tệp; văn bản thường → false', () => {
  assert.equal(looksLikeHtml(Buffer.from('﻿  <!-- made by tool -->\n<!DOCTYPE html><html>')), true);
  assert.equal(looksLikeHtml(Buffer.from('<html lang="vi"><head>')), true);
  assert.equal(looksLikeHtml(Buffer.from('<meta charset="utf-8"><body>')), true);
  assert.equal(looksLikeHtml(Buffer.from('Báo cáo quý 3\n<html> trong câu')), false);
  assert.equal(looksLikeHtml(Buffer.from('a,b,c\n1,2,3')), false);
});

test('stripHeavyMedia: tách video trong <script> dữ liệu và URI data:video, giữ script JS, cắt đúng chỗ', () => {
  const v1 = fakeMp4().toString('base64');
  const v2 = fakeMp4(4000).toString('base64');
  const html = `<!doctype html><html><body><section><video id="x" src="data:video/mp4;base64,${v2}"></video></section>`
    + `<script type="application/octet-stream" id="dv-5">\n${v1}\n</script><script>var big = "${'a'.repeat(70000)}";</script></body></html>`;
  const out = stripHeavyMedia(Buffer.from(html), { maxVideos: 10, maxVideoBytes: 1048576 });
  assert.equal(out.videos.length, 2);
  assert.deepEqual(out.videos.map((v) => v.ref).sort(), ['dv-5', 'impvid-2'].sort());
  assert.ok(out.videos.every((v) => v.type === 'mp4' && v.buffer.subarray(4, 8).toString('latin1') === 'ftyp'));
  assert.ok(out.html.includes('<script type="application/octet-stream" id="dv-5"></script>'));
  assert.ok(out.html.includes('src="data:,impvid-'));
  assert.ok(out.html.includes('var big = "aaaa'), 'script JS giữ nguyên');
  assert.ok(out.html.length < 80000);
  // Quá trần số video / dung lượng → bỏ qua (đếm skipped), vẫn cắt khỏi HTML.
  const capped = stripHeavyMedia(Buffer.from(html), { maxVideos: 1, maxVideoBytes: 1048576 });
  assert.equal(capped.videos.length, 1);
  assert.equal(capped.skipped, 1);
  const tiny = stripHeavyMedia(Buffer.from(html), { maxVideos: 10, maxVideoBytes: 1000 });
  assert.equal(tiny.videos.length, 0);
  assert.equal(tiny.skipped, 2);
});

test('stripHeavyMedia: khối base64 không phải video (ảnh, dữ liệu) → không đụng tới', () => {
  const png = Buffer.alloc(70000, 1);
  png.write('\x89PNG', 0, 'latin1');
  const html = `<html><script type="application/octet-stream" id="img">${png.toString('base64')}</script></html>`;
  const out = stripHeavyMedia(Buffer.from(html));
  assert.equal(out.videos.length, 0);
  assert.equal(out.html.length, html.length);
});

test('decodeDataImage: chỉ ảnh raster base64', () => {
  const b = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
  assert.deepEqual(decodeDataImage(`data:image/png;base64,${b.toString('base64')}`), b);
  assert.equal(decodeDataImage('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(decodeDataImage('https://x/y.png'), null);
});

test('assignVideos: theo tham chiếu trong trang → theo số cuối mã khối → trang có khung video kế tiếp', () => {
  const slides = [
    { videoRefs: [], vbox: null },
    { videoRefs: ['impvid-1'], vbox: { x: 10, y: 10, w: 50, h: 50 } },
    { videoRefs: [], vbox: { x: 0, y: 0, w: 40, h: 40 } },
    { videoRefs: [], vbox: null },
    { videoRefs: [], vbox: { x: 0, y: 0, w: 40, h: 40 } },
  ];
  const vids = [{ ref: 'impvid-1' }, { ref: 'dv-5' }, { ref: 'other' }];
  const m = assignVideos(slides, vids);
  assert.deepEqual(m.get(1).map((v) => v.ref), ['impvid-1']);
  assert.deepEqual(m.get(4).map((v) => v.ref), ['dv-5']); // dv-5 → trang 5 (chỉ số 4) có khung video
  assert.deepEqual(m.get(2).map((v) => v.ref), ['other']); // trang có khung video còn trống đầu tiên
});

test('designSlide: ảnh trang phủ kín đứng yên + video đúng khung; qua normalizeSpec giữ still/hide', () => {
  let n = 0;
  const newId = () => `e${++n}`;
  const sl = designSlide({ title: 'Mở đầu', notes: 'ghi chú', shotAsset: A, fit: 'cover', videos: [{ asset: V, title: 'Clip', box: { x: 16, y: 23, w: 68, h: 68 } }] }, newId);
  assert.equal(sl.layout, 'free');
  assert.deepEqual(sl.hide, ['glow', 'grid', 'bg', 'ft']);
  assert.deepEqual(sl.elements[0], { id: 'e1', type: 'image', x: 0, y: 0, w: 100, h: 100, radius: 'none', still: true, image: { asset: A, alt: 'Mở đầu', caption: '', fit: 'cover' } });
  assert.equal(sl.elements[1].type, 'video');
  assert.equal(sl.elements[1].video.asset, V);
  assert.ok(sl.elements[1].y + sl.elements[1].h <= 100, 'khung video kẹp trong trang');
  const { spec } = normalizeSpec({ title: 'T', slides: [sl] });
  const s = spec.slides[0];
  assert.equal(s.elements[0].still, true);
  assert.ok(s.hide.includes('ft'));
  const html = renderDeckHtml(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}`, css: '', engineJs: '' });
  assert.ok(html.includes('x-ft'), 'ẩn chân trang');
  // Ảnh trang đứng yên (không hiệu ứng xuất hiện), video vẫn có hiệu ứng.
  const imgEl = html.match(/<div class="fe fe-[a-z]+"[^>]*>/g) || [];
  assert.ok(imgEl.length >= 2);
  assert.ok(!/data-a=/.test(imgEl[0]));
  assert.ok(/data-a="up"/.test(imgEl[1]));
});

test('slidesText: mỗi trang 1 khối "--- Trang N ---", bỏ lặp tiêu đề, kèm ghi chú', () => {
  const t = slidesText([
    { title: 'Mở đầu', text: 'Mở đầu\nDòng 1\n\n\n\nDòng 2', notes: '' },
    { title: '', text: 'Chỉ có chữ', notes: 'Nói chậm' },
  ]);
  assert.equal(t, '--- Trang 1 ---\nMở đầu\nDòng 1\n\nDòng 2\n\n--- Trang 2 ---\nChỉ có chữ\n[Ghi chú: Nói chậm]');
  assert.equal(countMarked(t), 2);
});

test('splitTextPages / markPages: dòng "---" ngăn trang, bỏ đoạn rỗng; không có → null', () => {
  assert.deepEqual(splitTextPages('Trang A\n---\nTrang B\n  -----  \n\n---\nTrang C'), ['Trang A', 'Trang B', 'Trang C']);
  assert.equal(splitTextPages('Một đoạn - không - ngăn trang'), null);
  assert.equal(splitTextPages('Chỉ\n---\n'), null);
  assert.equal(markPages(['a', '']), '--- Trang 1 ---\na\n\n--- Trang 2 ---\n(trang không có chữ)');
});

test('paginateSource: văn bản có ngăn trang → đánh dấu + đếm; trang PPTX đã đánh dấu; không chia trang → null; vượt 40 → từ chối', async () => {
  const text = { pieces: [{ label: 'Nội dung nhập tay', text: 'A\n---\nB\n---\nC' }], media: [], images: [], docs: [] };
  const r1 = await paginateSource(text, { tempDir: '/tmp' });
  assert.equal(r1.pages, 3);
  assert.equal(countMarked(text.pieces[0].text), 3);
  await r1.cleanup();

  const pptx = { pieces: [{ label: 'a.pptx', text: markPages(['x', 'y', 'z', 'w']) }], media: [], images: [], docs: [{ name: 'a.pptx', ext: 'pptx', buffer: Buffer.alloc(0) }] };
  assert.equal((await paginateSource(pptx, { tempDir: '/tmp' })).pages, 4);

  const plain = { pieces: [{ label: 'ghi chú', text: 'không có ngăn trang' }], media: [], images: [], docs: [] };
  assert.equal((await paginateSource(plain, { tempDir: '/tmp' })).pages, null);

  const big = { pieces: [{ label: 'b.pptx', text: markPages(Array.from({ length: KEEP_MAX_PAGES + 1 }, (_, i) => `t${i}`)) }], media: [], images: [], docs: [] };
  await assert.rejects(paginateSource(big, { tempDir: '/tmp' }), (err) => err.status === 422 && err.code === 'TOO_MANY_PAGES' && /41 trang/.test(err.message));
});

test('normalizeOutline: keepOriginal chỉ nhận true (tuỳ chọn do server giữ)', () => {
  const base = { title: 'T', slides: [{ layout: 'cover', title: 'A', points: [] }] };
  assert.equal(normalizeOutline(base, { options: { keepOriginal: true } }).outline.options.keepOriginal, true);
  assert.equal('keepOriginal' in normalizeOutline(base, { options: { keepOriginal: 'yes' } }).outline.options, false);
  assert.equal('keepOriginal' in normalizeOutline(base, { options: {} }).outline.options, false);
});

test('importViewport: cạnh dài 1920 theo tỷ lệ bài', () => {
  assert.deepEqual(importViewport('16:9'), { width: 1920, height: 1080 });
  assert.deepEqual(importViewport('4:3'), { width: 1920, height: 1440 });
  assert.deepEqual(importViewport('9:16'), { width: 1080, height: 1920 });
  assert.deepEqual(importViewport('x'), { width: 1920, height: 1080 });
});
