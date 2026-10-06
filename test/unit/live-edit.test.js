// Kiểm thử bản cập nhật lớn: sửa trực tiếp trên khung xem trước (đường dẫn trường), trang tự do (phần tử), ảnh đã chỉnh sửa
// (src/edit/pos/zoom), tìm ảnh Pixabay (giả lập fetch), chỉnh sửa ảnh bằng sharp, đường dẫn thân thiện /ten-bai/ma/tinh-nang.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeSpec, collectAssetIds, dropForeignAssets, cleanImageEdit, SPEC_LIMITS } from '../../src/services/specService.js';
import { deckParts, renderDeckHtml, AI_LAYOUTS, LAYOUTS } from '../../shared/deck/render.js';
import { FREE_TEMPLATES, elementsFromTemplate, newElement } from '../../shared/deck/free.js';
import { applyFrameEdit, mediaTarget, setMedia } from '../../frontend/src/lib/editPaths.js';
import { slugify, deckPath } from '../../frontend/src/lib/deckPath.js';
import { createStockImageService } from '../../src/services/stockImageService.js';
import { applyImageEdit } from '../../src/services/imageService.js';
import { newShortCode, SHORT_CODE_RE } from '../../src/services/presentationService.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const XSS = '<img src=x onerror=alert(1)>"\'&';

const freeSlide = (elements) => ({ layout: 'free', title: 'Tự do', elements });

test('trang tự do: không nằm trong danh sách layout cho AI, mọi mẫu dựng ra phần tử hợp lệ', () => {
  assert.ok(!AI_LAYOUTS.includes('free'));
  assert.ok(LAYOUTS.includes('free'));
  for (const t of FREE_TEMPLATES) {
    const els = elementsFromTemplate(t.key);
    const { spec, errors } = normalizeSpec({ title: 'T', slides: [freeSlide(els)] }, { strict: true });
    assert.deepEqual(errors, [], `mẫu ${t.key}`);
    assert.equal(spec.slides[0].elements.length, t.elements.length);
    assert.ok(spec.slides[0].elements.every((e) => /^e-[a-z0-9]+$/.test(e.id)));
  }
});

test('normalizeSpec: phần tử trang tự do được kẹp toạ độ, chuẩn hoá kiểu, bảng luôn hình chữ nhật, id trùng được cấp lại', () => {
  const els = [
    { id: 'e-a1', type: 'text', text: 'Xin chào', x: 500, y: -999, w: 0, h: 9999, style: 'nope', color: 'red', size: 99 },
    { id: 'e-a1', type: 'table', rows: [['a', 'b', 'c'], ['d']], x: 5, y: 5, w: 50, h: 30 },
    { id: 'e-sh', type: 'shape', shape: 'star', fill: 'x', opacity: 5, x: 1, y: 1, w: 10, h: 10 },
    { id: 'e-bad', type: 'script', x: 1, y: 1, w: 1, h: 1 },
  ];
  const { spec } = normalizeSpec({ title: 'T', slides: [freeSlide(els)] });
  const [t, tb, sh, ...rest] = spec.slides[0].elements;
  assert.equal(rest.length, 0, 'loại phần tử lạ bị bỏ');
  assert.deepEqual([t.x, t.y, t.w, t.h], [100, -50, 2, 150]);
  assert.equal(t.style, 'body');
  assert.equal(t.color, 'text');
  assert.equal(t.size, 4);
  assert.notEqual(tb.id, t.id);
  assert.deepEqual(tb.rows, [['a', 'b', 'c'], ['d', '', '']]);
  assert.equal(sh.shape, 'round');
  assert.equal(sh.fill, 'soft');
  assert.equal(sh.opacity, 1);
});

test('normalizeSpec strict: báo lỗi khi bảng quá nhiều hàng hoặc chữ phần tử quá dài', () => {
  const rows = Array.from({ length: SPEC_LIMITS.tableRows + 3 }, () => ['x']);
  const els = [{ id: 'e-t', type: 'table', rows, x: 0, y: 0, w: 10, h: 10 }, { id: 'e-x', type: 'text', text: 'a'.repeat(SPEC_LIMITS.elText + 5), x: 0, y: 0, w: 10, h: 10 }];
  const { errors } = normalizeSpec({ title: 'T', slides: [freeSlide(els)] }, { strict: true });
  assert.ok(errors.length >= 2);
});

test('ảnh đã chỉnh sửa: giữ src/edit hợp lệ, bỏ edit khi src trùng asset; pos/zoom được kẹp', () => {
  const img = { asset: B, src: A, edit: { rotate: 90, crop: { x: 0.1, y: 0.1, w: 2, h: 0.5 }, brightness: 500, flipH: 'yes' }, pos: { x: 130, y: 20 }, zoom: 9 };
  const { spec } = normalizeSpec({ title: 'T', slides: [{ layout: 'image', title: 'x', image: img }] });
  const out = spec.slides[0].image;
  assert.equal(out.src, A);
  assert.deepEqual(out.edit, { rotate: 90, crop: { x: 0.1, y: 0.1, w: 0.9, h: 0.5 }, brightness: 100 });
  assert.deepEqual(out.pos, { x: 100, y: 20 });
  assert.equal(out.zoom, 4);
  const same = normalizeSpec({ title: 'T', slides: [{ layout: 'image', title: 'x', image: { asset: A, src: A, edit: { rotate: 90 } } }] }).spec.slides[0].image;
  assert.equal(same.src, undefined);
  assert.equal(same.edit, undefined);
  assert.equal(cleanImageEdit({ rotate: 360, crop: { x: 0, y: 0, w: 1, h: 1 } }), null, 'không có thay đổi thực → null');
});

test('collectAssetIds/dropForeignAssets: tính cả ảnh gốc (src) và ảnh/video trong phần tử trang tự do', () => {
  const spec = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'image', title: 'x', image: { asset: B, src: A, edit: { rotate: 90 } } },
      freeSlide([{ id: 'e-i', type: 'image', image: { asset: FOREIGN }, x: 0, y: 0, w: 10, h: 10 }]),
    ],
  }).spec;
  const ids = [...collectAssetIds(spec)];
  for (const id of [A, B, FOREIGN]) assert.ok(ids.includes(id), id);
  const kept = dropForeignAssets(spec, new Set([A, B]));
  assert.equal(kept.slides[0].image.asset, B);
  assert.ok(![...collectAssetIds(kept)].includes(FOREIGN));
});

test('renderer: chế độ edit gắn data-e/data-m, chế độ trình chiếu thì không; nội dung phần tử luôn được escape', () => {
  const spec = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'bullets', kicker: 'K', title: 'Tiêu đề', items: [{ title: 'Ý 1', text: 'abc' }], image: { asset: A } },
      freeSlide([newElement('text', { text: XSS }), { ...newElement('table'), rows: [[XSS, 'b']] }, newElement('image')]),
    ],
  }).spec;
  const opts = { ratio: '16:9', assetUrl: (id) => `/a/${id}` };
  const ed = deckParts(spec, { ...opts, mode: 'edit' });
  assert.equal(ed.mode, 'edit');
  assert.match(ed.slides[0], /data-e="title"/);
  assert.match(ed.slides[0], /data-e="items\.0\.title"/);
  assert.match(ed.slides[0], /data-m="slot"/);
  assert.match(ed.slides[1], /data-e="elements\.e-[a-z0-9]+\.text"/);
  assert.match(ed.slides[1], /data-e="elements\.e-[a-z0-9]+\.rows\.0\.0"/);
  assert.match(ed.slides[1], /Bấm để chọn ảnh/);
  assert.ok(!ed.slides[1].includes('<img src=x'));
  const pr = renderDeckHtml(spec, { ...opts, mode: 'present', css: '', engineJs: '' });
  assert.ok(!pr.includes('data-e='));
  assert.ok(!pr.includes('data-m='));
  assert.ok(!pr.includes('Bấm để chọn ảnh'), 'ô ảnh trống không hiện chữ hướng dẫn khi trình chiếu');
  assert.ok(!pr.includes('<img src=x'));
});

test('renderer: ảnh có vị trí/phóng → object-position + scale; không bật Ken Burns khi đã phóng', () => {
  const spec = normalizeSpec({ title: 'T', slides: [{ layout: 'image', title: 'x', image: { asset: A, pos: { x: 20, y: 70 }, zoom: 1.5 } }] }).spec;
  const html = deckParts(spec, { ratio: '16:9', assetUrl: (id) => `/a/${id}` }).slides[0];
  assert.match(html, /object-position:20% 70%/);
  assert.match(html, /scale:1\.5/);
  assert.ok(!html.includes('data-loop="kb"'));
});

test('applyFrameEdit: chỉ nhận đường dẫn cho phép, cắt theo giới hạn, bỏ ký tự điều khiển', () => {
  const spec = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'stats', title: 'Cũ', stats: [{ value: 5, label: 'a' }], items: [{ title: 'x' }] },
      freeSlide([{ ...newElement('text'), id: 'e-t1' }, { ...newElement('table'), id: 'e-tb' }]),
    ],
  }).spec;
  assert.equal(applyFrameEdit(spec, 0, 'title', 'Mới\u0007'), true);
  assert.equal(spec.slides[0].title, 'Mới');
  assert.equal(applyFrameEdit(spec, 0, 'title', 'a'.repeat(1000)), true);
  assert.equal(spec.slides[0].title.length, SPEC_LIMITS.title);
  assert.equal(applyFrameEdit(spec, 0, 'stats.0.label', 'Doanh thu'), true);
  assert.equal(applyFrameEdit(spec, 0, 'items.0.text', 'nội dung'), true);
  assert.equal(applyFrameEdit(spec, 1, 'elements.e-t1.text', 'Đoạn mới'), true);
  assert.equal(spec.slides[1].elements[0].text, 'Đoạn mới');
  assert.equal(applyFrameEdit(spec, 1, 'elements.e-tb.rows.1.2', 'ô'), true);
  assert.equal(spec.slides[1].elements[1].rows[1][2], 'ô');
  // Bị từ chối: trường không cho sửa, vượt chỉ số, prototype pollution, slide không tồn tại.
  for (const [i, p] of [[0, 'layout'], [0, 'image.asset'], [0, 'items.9.title'], [0, '__proto__.x'], [0, 'stats.0.__proto__'], [1, 'elements.e-tb.rows.99.0'], [1, 'elements.e-zz.text'], [7, 'title']]) {
    assert.equal(applyFrameEdit(spec, i, p, 'x'), false, p);
  }
  assert.equal({}.x, undefined);
  assert.equal(applyFrameEdit(spec, 0, '@footer', 'Chân trang'), true);
  assert.equal(spec.footer, 'Chân trang');
});

test('mediaTarget/setMedia: ô media chính đổi ảnh ↔ video, bộ sưu tập, phần tử ảnh', () => {
  const s = { layout: 'image', image: { asset: A }, video: null, images: [{ asset: A }, { asset: B }], elements: [{ id: 'e-i', type: 'image', image: null }] };
  assert.equal(mediaTarget(s, 'slot').kind, 'slot');
  setMedia(s, 'slot', { video: { provider: 'youtube', id: 'dQw4w9WgXcQ' } });
  assert.equal(s.image, null);
  setMedia(s, 'slot', { image: { asset: B } });
  assert.equal(s.video, null);
  assert.equal(s.image.asset, B);
  setMedia(s, 'images.1', { image: { asset: A } });
  assert.equal(s.images[1].asset, A);
  setMedia(s, 'images.0', { image: null });
  assert.equal(s.images.length, 1);
  setMedia(s, 'elements.e-i', { image: { asset: B } });
  assert.equal(s.elements[0].image.asset, B);
  assert.equal(mediaTarget(s, 'images.9'), null);
  assert.equal(mediaTarget(s, 'elements.e-none'), null);
  assert.equal(mediaTarget(s, 'constructor'), null);
});

test('đường dẫn thân thiện: bỏ dấu, giữ hoa/thường, mã 8 ký tự; bài cũ chưa có mã dùng /p/:id', () => {
  assert.equal(slugify('Giới thiệu AMIS oneAI'), 'Gioi-thieu-AMIS-oneAI');
  assert.equal(slugify('Đường đến 2026!!'), 'Duong-den-2026');
  assert.equal(slugify('   '), 'bai-trinh-bay');
  assert.equal(deckPath({ id: 'x', code: '1234abcd', title: 'Giới thiệu' }, 'edit'), '/Gioi-thieu/1234abcd/edit');
  assert.equal(deckPath({ id: 'uuid', title: 'X' }, 'view'), '/p/uuid/view');
  const codes = new Set(Array.from({ length: 300 }, () => newShortCode()));
  assert.ok(codes.size > 295);
  assert.ok([...codes].every((c) => SHORT_CODE_RE.test(c)));
});

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    const u = new URL(url);
    calls.push(u);
    const r = routes(u);
    if (r instanceof Error) throw r;
    return {
      ok: r.status ? r.status < 400 : true,
      status: r.status || 200,
      headers: new Map(Object.entries(r.headers || {})),
      json: async () => r.json,
      arrayBuffer: async () => r.body || new ArrayBuffer(8),
    };
  };
  fn.calls = calls;
  return fn;
}

test('stockImageService: tìm ảnh (tiếng Việt → lang=vi), ánh xạ kết quả, nhớ đệm; không lộ khoá API trong kết quả', async () => {
  const f = fakeFetch((u) => ({ json: { totalHits: 60, hits: [{ id: 7, webformatURL: 'https://pixabay.com/get/7.jpg', previewURL: 'https://cdn.pixabay.com/7_150.jpg', tags: 'hội nghị', user: 'tac-gia', imageWidth: 1920, imageHeight: 1080 }, { id: 0 }] } }));
  const svc = createStockImageService({ apiKey: 'test-key', baseUrl: 'https://pixabay.com/api/' }, { fetchImpl: f });
  const r = await svc.search({ q: '  hội   nghị ', page: 1 });
  assert.equal(r.hits.length, 1);
  assert.equal(r.hits[0].id, 7);
  assert.equal(r.hasNext, true);
  assert.equal(f.calls[0].searchParams.get('lang'), 'vi');
  assert.equal(f.calls[0].searchParams.get('safesearch'), 'true');
  assert.ok(!JSON.stringify(r).includes('test-key'));
  await svc.search({ q: 'hội nghị', page: 1 });
  assert.equal(f.calls.length, 1, 'kết quả thứ 2 lấy từ bộ nhớ đệm');
  assert.deepEqual(await svc.search({ q: '   ' }), { hits: [], total: 0, page: 1, hasNext: false });
});

test('stockImageService: tải ảnh chỉ từ máy chủ Pixabay, chặn ảnh quá lớn, thiếu khoá → 503', async () => {
  const evil = createStockImageService({ apiKey: 'k', baseUrl: 'https://pixabay.com/api/' }, { fetchImpl: fakeFetch(() => ({ json: { hits: [{ id: 1, largeImageURL: 'https://evil.example.com/x.jpg' }] } })) });
  await assert.rejects(evil.fetchImage(1), (e) => e.status === 422);
  const big = createStockImageService({ apiKey: 'k', baseUrl: 'https://pixabay.com/api/' }, {
    fetchImpl: fakeFetch((u) => (u.hostname === 'cdn.pixabay.com' ? { headers: { 'content-length': String(50 * 1048576) } } : { json: { hits: [{ id: 1, largeImageURL: 'https://cdn.pixabay.com/x.jpg' }] } })),
  });
  await assert.rejects(big.fetchImage(1), (e) => e.status === 422);
  const ok = createStockImageService({ apiKey: 'k', baseUrl: 'https://pixabay.com/api/' }, {
    fetchImpl: fakeFetch((u) => (u.hostname === 'cdn.pixabay.com' ? { body: new Uint8Array([1, 2, 3]).buffer } : { json: { hits: [{ id: 9, largeImageURL: 'https://cdn.pixabay.com/x.jpg', tags: 'a, b' }] } })),
  });
  const got = await ok.fetchImage('9');
  assert.equal(got.buffer.length, 3);
  assert.equal(got.name, 'pixabay-9');
  await assert.rejects(ok.fetchImage('abc'), (e) => e.status === 404);
  const none = createStockImageService({ apiKey: '', baseUrl: 'https://pixabay.com/api/' }, { fetchImpl: fakeFetch(() => ({})) });
  await assert.rejects(none.search({ q: 'x' }), (e) => e.status === 503);
});

// Ảnh 200×100: nửa trái đỏ, nửa phải xanh dương, ô vàng 10×10 ở góc trên-trái.
async function testImage() {
  const W = 200;
  const H = 100;
  const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (x < 10 && y < 10) raw.set([255, 255, 0], i);
      else if (x < 100) raw[i] = 255;
      else raw[i + 2] = 255;
    }
  }
  return sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
}
async function pixel(buf, x, y) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { w: info.width, h: info.height, rgb: [data[i], data[i + 1], data[i + 2]] };
}

test('applyImageEdit: lật rồi mới xoay (khớp trình chỉnh sửa phía trình duyệt), cắt theo khung bao sau xoay', async () => {
  const src = await testImage();
  // Lật ngang → ô vàng sang góc trên-phải; xoay 90° chiều kim đồng hồ → góc dưới-phải.
  const a = await applyImageEdit(src, { flipH: true, rotate: 90 });
  const br = await pixel(a.buffer, 95, 195);
  assert.deepEqual([br.w, br.h], [100, 200]);
  assert.ok(br.rgb[0] > 200 && br.rgb[1] > 200 && br.rgb[2] < 60, `vàng: ${br.rgb}`);
  // Cắt nửa phải → chỉ còn màu xanh dương.
  const b = await applyImageEdit(src, { crop: { x: 0.5, y: 0, w: 0.5, h: 1 } });
  const p = await pixel(b.buffer, 50, 50);
  assert.deepEqual([p.w, p.h], [100, 100]);
  assert.ok(p.rgb[2] > 200 && p.rgb[0] < 60);
  // Sáng/tối, độ rực, tương phản theo đúng công thức bộ lọc CSS (khớp bản xem trước trên trình duyệt).
  const c = await applyImageEdit(src, { brightness: -50 });
  const d = await pixel(c.buffer, 150, 50);
  assert.ok(Math.abs(d.rgb[2] - 128) <= 3 && d.rgb[0] <= 3, `brightness(0.5) của xanh dương: ${d.rgb}`);
  const g = await applyImageEdit(src, { saturation: -100 });
  const gray = (await pixel(g.buffer, 50, 50)).rgb;
  assert.ok(Math.abs(gray[0] - 54) <= 3 && Math.abs(gray[1] - 54) <= 3, `saturate(0) của đỏ = xám 0.213·255: ${gray}`);
  // Xoay góc lẻ (có kênh alpha) + đủ 3 chỉnh màu không lỗi, giữ vùng trong suốt.
  const t = await applyImageEdit(src, { rotate: 15, brightness: 10, saturation: 20, contrast: 30 });
  const meta = await sharp(t.buffer).metadata();
  assert.equal(meta.hasAlpha, true);
});
