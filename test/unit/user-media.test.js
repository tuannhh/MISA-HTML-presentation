// Kiểm thử media người dùng gửi kèm khi tạo bài (bắt buộc đưa vào bài): đặt vào dàn ý (placeUserMedia), kiểm tra tệp
// (precheckMedia), schema AI có trường video khi có video, biến thể không cắt ảnh đồ hoạ (fit contain).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { placeUserMedia, normalizeOutline, applyOutlineMedia } from '../../src/services/outlineService.js';
import { precheckMedia } from '../../src/services/ingestService.js';
import { outlineResponseSchema } from '../../src/services/geminiService.js';
import { fits } from '../../shared/deck/variants.js';

const U = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const slide = (layout, extra = {}) => ({ id: `s-${Math.random().toString(36).slice(2, 8)}`, layout, title: layout, subtitle: '', points: ['x'], notes: '', images: [], video: null, ...extra });
const vid = (n) => ({ provider: 'file', asset: U(100 + n), poster: null, title: `Video ${n}`, caption: '' });
const allImages = (slides) => slides.flatMap((s) => s.images.map((im) => im.asset));
const allVideos = (slides) => slides.filter((s) => s.video).map((s) => s.video.asset);

test('placeUserMedia: AI đặt đủ → giữ nguyên; bỏ trùng; trang có video không kèm ảnh', () => {
  const slides = [
    slide('cover'),
    slide('image', { images: [{ asset: U(1), caption: 'Hội nghị' }] }),
    slide('bullets', { images: [{ asset: U(1) }], video: vid(1) }), // ảnh trùng + trang có video
    slide('closing'),
  ];
  const r = placeUserMedia(slides, { images: [{ asset: U(1) }], videos: [vid(1)] });
  assert.deepEqual(allImages(slides), [U(1)]);
  assert.deepEqual(allVideos(slides), [U(101)]);
  assert.equal(slides[1].images[0].caption, 'Hội nghị');
  assert.equal(r.added, 0);
});

test('placeUserMedia: AI bỏ sót → đặt vào trang chữ trống trước, không đụng trang số liệu/trang kết', () => {
  const slides = [slide('cover'), slide('stats'), slide('bullets'), slide('timeline'), slide('closing')];
  placeUserMedia(slides, { images: [{ asset: U(1), fit: 'contain' }], videos: [vid(1)] });
  assert.equal(slides[2].video?.asset, U(101), 'video vào trang bullets');
  // ảnh: trang chữ đã có video → ứng viên kế tiếp theo ưu tiên là cover (trước stats/timeline)
  assert.deepEqual(slides[0].images, [{ asset: U(1), caption: '', fit: 'contain' }]);
  assert.ok(!slides[1].images.length && !slides[3].images.length && !slides[4].images.length);
});

test('placeUserMedia: nhiều ảnh thiếu chỗ → thêm trang bộ sưu tập trước trang kết (còn hạn mức trang)', () => {
  const slides = [slide('cover'), slide('stats'), slide('closing')];
  const images = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ asset: U(n) }));
  const r = placeUserMedia(slides, { images, videos: [] }, { room: 5 });
  assert.equal(r.added, 2);
  assert.deepEqual(new Set(allImages(slides)), new Set(images.map((x) => x.asset)));
  assert.equal(slides.at(-1).layout, 'closing');
  assert.equal(slides[2].layout, 'gallery');
  assert.equal(slides[2].images.length, 6);
  assert.ok(slides.every((s) => s.images.length <= 6));
});

test('placeUserMedia: số trang cố định (room 0) → dồn vào trang sẵn có, vẫn đủ mọi ảnh', () => {
  const slides = [slide('cover'), slide('bullets'), slide('cards'), slide('closing')];
  const images = [1, 2, 3, 4, 5].map((n) => ({ asset: U(n) }));
  const r = placeUserMedia(slides, { images, videos: [] }, { room: 0 });
  assert.equal(r.added, 0);
  assert.equal(slides.length, 4);
  assert.deepEqual(new Set(allImages(slides)), new Set(images.map((x) => x.asset)));
  assert.equal(slides[1].layout, 'gallery');
});

test('placeUserMedia: không còn trang nào trống cho video → buộc thêm trang (không bỏ media người dùng)', () => {
  const slides = [slide('cover', { video: vid(1) }), slide('closing')];
  const r = placeUserMedia(slides, { images: [], videos: [vid(1), vid(2)] }, { room: 0 });
  assert.equal(r.added, 1);
  assert.deepEqual(allVideos(slides).sort(), [U(101), U(102)]);
  assert.equal(slides.at(-1).layout, 'closing');
});

test('dàn ý giữ fit contain của ảnh đồ hoạ → slide hiển thị trọn khung, bố cục không cắt ảnh', () => {
  const { outline } = normalizeOutline({ slides: [{ layout: 'image', title: 'Sơ đồ', points: ['a'], images: [{ asset: U(1), fit: 'contain' }, { asset: U(2), fit: 'evil' }] }] });
  assert.equal(outline.slides[0].images[0].fit, 'contain');
  assert.equal(outline.slides[0].images[1].fit, undefined);
  const s = applyOutlineMedia({ layout: 'image', items: [] }, { images: [outline.slides[0].images[0]], video: null });
  assert.equal(s.image.fit, 'contain');
  assert.equal(fits('image', 'full', { ...s, items: [] }), false);
  assert.equal(fits('image', 'full', { image: { asset: U(1), fit: 'cover' }, items: [] }), true);
  assert.equal(fits('gallery', 'polaroid', { images: [{ asset: U(1), fit: 'contain' }, { asset: U(2) }] }), false);
});

test('precheckMedia: nhận ảnh/video theo magic bytes, ghép ảnh bìa theo vị trí, từ chối loại khác + vượt giới hạn', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-'));
  const file = (name, buf, field = 'media') => {
    const path = join(dir, `${Math.random()}`);
    writeFileSync(path, buf);
    return { path, originalname: name, size: buf.length, fieldname: field };
  };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64)]);
  const limits = { maxCreateMedia: 3, maxImageUploadMb: 15, maxVideoMb: 150, maxVideosPerDeck: 1 };
  const r = await precheckMedia([file('Ảnh.png', png), file('clip.mp4', mp4)], [file('poster-1.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'posters')], limits);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].name, 'Ảnh.png');
  assert.equal(r.videos[0].type, 'mp4');
  assert.ok(r.videos[0].poster, 'ảnh bìa ghép theo vị trí 1');
  assert.deepEqual(await precheckMedia([], [], limits), { images: [], videos: [] });
  await assert.rejects(precheckMedia([file('a.pdf', Buffer.from('%PDF-1.7 xxxxxxxx'))], [], limits), (e) => e.status === 415);
  await assert.rejects(precheckMedia([file('1.png', png), file('2.png', png), file('3.png', png), file('4.png', png)], [], limits), (e) => e.code === 'TOO_MANY_FILES');
  await assert.rejects(precheckMedia([file('1.mp4', mp4), file('2.mp4', mp4)], [], limits), (e) => e.code === 'TOO_MANY_FILES');
  await assert.rejects(precheckMedia([file('big.png', png)], [], { ...limits, maxImageUploadMb: 0.00001 }), (e) => e.status === 413);
});

test('schema dàn ý: có video gửi kèm → mỗi trang bắt buộc trường video; không có → giữ schema cũ', () => {
  const withV = outlineResponseSchema({ hasVideos: true }).properties.slides.items;
  assert.ok(withV.properties.video && withV.required.includes('video'));
  const noV = outlineResponseSchema({}).properties.slides.items;
  assert.ok(!noV.properties.video && !noV.required.includes('video'));
});
