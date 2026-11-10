// Chỉ đạo thiết kế khi dựng bài: dọn dàn ý (ảnh cắt sơ đồ, trang video rỗng, số gõ tay), chia phần + màu, biến thể theo AI,
// bộ hình 3D đồng bộ (trọn bộ hoặc bỏ), hiển thị màu phần + thanh tiến độ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { prepareOutline, applyDirection, planArt, artPrompt, cutoutArt, tidySlide, cropPage } from '../../src/services/artDirection.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';
import { deckParts } from '../../shared/deck/render.js';
import { artDirect } from '../../shared/deck/variants.js';

const os = (title, points = [], extra = {}) => ({ id: `s-${title}`, layout: 'auto', title, subtitle: '', points, notes: '', images: [], video: null, ...extra });
const A = (n) => `a000000${n}-0000-4000-8000-000000000000`;

test('cropPage: nhận tên ảnh cắt từ trang tệp nguồn', () => {
  assert.equal(cropPage('Bai.pptx · trang 14'), 14);
  assert.equal(cropPage('Bai.pdf — trang 3'), 3);
  assert.equal(cropPage('image-1-2.png'), null);
  assert.equal(cropPage(null), null);
});

test('prepareOutline: ảnh cắt sai trang / trang đã đủ chữ bị bỏ; ảnh khác giữ; dàn ý gốc không đổi', () => {
  const outline = {
    title: 'Bài',
    slides: [
      os('Trang 1', ['a', 'b', 'c', 'd'], { layout: 'image', images: [{ asset: A(1) }] }), // ảnh của trang 14 gắn nhầm
      os('Trang 2', ['x'], { images: [{ asset: A(2) }] }), // đúng trang, ít chữ → giữ
      os('Trang 3', ['m', 'n', 'o'], { layout: 'image', images: [{ asset: A(3) }] }), // đúng trang nhưng đủ chữ → bỏ
      os('Trang 4', ['p'], { images: [{ asset: A(4) }] }), // ảnh thường (không phải ảnh cắt) → giữ
    ],
  };
  const crops = new Map([[A(1), 14], [A(2), 2], [A(3), 3]]);
  const { outline: o, fixes } = prepareOutline(outline, crops);
  assert.deepEqual(o.slides.map((s) => s.images.length), [0, 1, 0, 1]);
  assert.equal(o.slides[0].layout, 'auto', 'trang ảnh hết ảnh → để AI chọn bố cục theo nội dung');
  assert.equal(o.slides[2].layout, 'auto');
  assert.equal(fixes.crops, 2);
  assert.equal(outline.slides[0].images.length, 1, 'dàn ý đã lưu giữ nguyên');
});

test('prepareOutline: trang video chưa có video bỏ chữ rác; số gõ tay liên tục bị bỏ, không liên tục thì giữ', () => {
  const { outline: o, fixes } = prepareOutline({
    title: 'Bài',
    slides: [
      os('VIDEO 2', ['Slide 6'], { layout: 'section', subtitle: '02 VIDEO' }),
      os('Phần 3', ['1 Vì sao: bối cảnh', '2 Kẻ gian tấn công gì', '3. Tư duy mới']),
      os('Số liệu', ['2 hình thức', '7 kiểu lừa']),
    ],
  });
  assert.deepEqual(o.slides[0].points, []);
  assert.equal(o.slides[0].subtitle, '');
  assert.equal(o.slides[0].layout, 'image');
  assert.deepEqual(o.slides[1].points, ['Vì sao: bối cảnh', 'Kẻ gian tấn công gì', 'Tư duy mới']);
  assert.deepEqual(o.slides[2].points, ['2 hình thức', '7 kiểu lừa'], 'số là nội dung (2, 7), không phải thứ tự → giữ');
  assert.deepEqual(fixes, { crops: 0, videoPages: 1, renumbered: 1 });
});

function composed(n) {
  return { title: 'Bài', slides: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, layout: i === 0 ? 'cover' : 'cards', title: `T${i}`, items: [{ title: 'A', art: 'a lock' }, { title: 'B', art: 'a key' }], variant: i % 2 ? 'rows' : 'grid', art: i === 0 ? 'a shield' : '' })) };
}

test('applyDirection: phần theo ref trang đầu, phần đầu luôn từ trang 1, màu lạ bị bỏ; normalizeSpec giữ phần + chỉ số trang', () => {
  const c = composed(6);
  const raw = { style: 'soft', parts: [{ start: 'S4', title: 'Phòng tránh', color: 'green' }, { start: 'S2', title: 'Thực trạng', color: 'blue' }, { start: 'S5', title: 'Lạ', color: 'pink' }] };
  const d = applyDirection(c, raw);
  assert.deepEqual(c.parts, [{ title: 'Thực trạng', color: 'blue' }, { title: 'Phòng tránh', color: 'green' }]);
  assert.deepEqual(c.slides.map((s) => s.part), [0, 0, 0, 1, 1, 1]);
  assert.equal(c.style, 'soft');
  assert.deepEqual(d.variants.slice(0, 3), ['', 'rows', 'grid'], 'bìa không có biến thể "grid" → bỏ');
  const { spec } = normalizeSpec(c);
  assert.deepEqual(spec.parts, c.parts);
  assert.deepEqual(spec.slides.map((s) => s.part), [0, 0, 0, 1, 1, 1]);
  assert.equal(spec.style, 'soft');
  // 1 phần hợp lệ → không chia phần.
  const c1 = composed(3);
  applyDirection(c1, { parts: [{ start: 'S1', title: 'Một', color: 'red' }] });
  assert.equal(c1.parts, undefined);
  assert.equal(normalizeSpec({ ...c1, parts: [{ title: 'Một', color: 'red' }] }).spec.parts, undefined);
});

test('artDirect(honor): giữ biến thể AI chọn nếu hợp nội dung; biến thể không hợp → chọn lại', () => {
  const spec = { slides: [{ layout: 'cards', variant: 'rows', items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] }, { layout: 'cards', variant: 'matrix', items: [{ title: 'a' }, { title: 'b' }] }] };
  artDirect(spec, { seed: 7, honor: true });
  assert.equal(spec.slides[0].variant, 'rows');
  assert.notEqual(spec.slides[1].variant, 'matrix', 'ma trận 2×2 cần đúng 4 mục');
});

test('planArt: ưu tiên bìa → mở đầu phần → bộ hình từng mục (trọn bộ) → hình trang khác; đúng hạn mức', () => {
  const spec = {
    slides: [
      { layout: 'cover', items: [] },
      { layout: 'cards', items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] },
      { layout: 'section', items: [] },
      { layout: 'bullets', items: [{ title: 'x' }] },
      { layout: 'cards', items: [{ title: 'P' }, { title: 'Q' }] }, // thiếu art 1 mục → không vẽ bộ
      { layout: 'stats', items: [] },
    ],
  };
  const arts = [
    { slide: 'a shield', items: [] },
    { slide: '', items: [{ title: 'A', art: 'a lock' }, { title: 'B', art: 'a key' }, { title: 'C', art: 'a phone' }] },
    { slide: 'a magnifier', items: [] },
    { slide: 'a bulb', items: [{ title: 'x', art: '' }] },
    { slide: '', items: [{ title: 'P', art: 'a cup' }, { title: 'Q', art: '' }] },
    { slide: 'a chart', items: [] },
  ];
  const all = planArt(spec, arts, 99);
  assert.deepEqual(all.map((w) => `${w.slide}:${w.item}`), ['0:null', '2:null', '1:0', '1:1', '1:2', '3:null']);
  const four = planArt(spec, arts, 4);
  assert.deepEqual(four.map((w) => `${w.slide}:${w.item}`), ['0:null', '2:null', '3:null'], 'bộ 3 hình không vừa hạn mức → bỏ cả bộ, không vẽ dở');
  assert.match(artPrompt('a lock', 'red'), /a lock\. .*coral red/);
  // Trang ý chính nhiều chữ không nhận hình cỡ trang (chữ sẽ bị co nhỏ).
  const long = 'x'.repeat(90);
  const dense = { slides: [{ layout: 'bullets', items: [1, 2, 3, 4].map((k) => ({ title: `Ý ${k}`, text: long })) }, { layout: 'bullets', items: [{ title: 'A', text: 'ngắn' }, { title: 'B', text: 'ngắn' }] }] };
  assert.deepEqual(planArt(dense, [{ slide: 'a maze', items: [] }, { slide: 'a key', items: [] }], 9).map((w) => w.slide), [1]);
});

test('cutoutArt: nền sáng → trong suốt, vật thể giữ nguyên; nền tối giữ nguyên ảnh', async () => {
  // Nền ngà 64×64, vật thể đỏ 24×24 ở giữa.
  const obj = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#E3262E' } }).png().toBuffer();
  const img = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#F4F1EC' } }).composite([{ input: obj, left: 20, top: 20 }]).png().toBuffer();
  const { data, info } = await sharp(await cutoutArt(img)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(data[3], 0, 'góc trong suốt');
  assert.ok(info.width === info.height && info.width < 40, `cắt sát vật thể + lề đều: ${info.width}×${info.height}`);
  const c = info.width >> 1;
  const mid = (c * info.width + c) * 4;
  assert.deepEqual([...data.subarray(mid, mid + 4)], [0xe3, 0x26, 0x2e, 255], 'tâm vật thể giữ màu, không trong suốt');
  const dark = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#223344' } }).png().toBuffer();
  assert.equal(await cutoutArt(dark), dark);
  const blank = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#FFFFFF' } }).png().toBuffer();
  assert.equal(await cutoutArt(blank), blank, 'loang hết ảnh (vật thể trắng liền nền) → giữ nguyên');
});

test('tidySlide: bỏ chỉ dẫn số trang nguồn, tiền tố "Phần N ·" ở trang mở đầu phần, nhãn chỉ là số thứ tự, "Bước N:" đầu tiêu đề bước', () => {
  const s = {
    layout: 'section',
    title: 'PHẦN 2 · CẬN CẢNH',
    subtitle: 'Hiểu lừa đảo (SLIDE 3 – 10)',
    items: [{ title: 'Lòng tham', value: 'Yếu tố 1' }, { title: 'Lo sợ', value: 'Yếu tố 2' }],
    steps: [{ title: 'BƯỚC 1: Bạn vừa bị lừa', value: '01' }, { title: 'Bước 2: Thấy dịch vụ', value: '02' }],
  };
  tidySlide(s);
  assert.equal(s.title, 'CẬN CẢNH');
  assert.equal(s.subtitle, 'Hiểu lừa đảo');
  assert.deepEqual(s.items.map((it) => it.value), ['', '']);
  assert.deepEqual(s.steps.map((it) => it.title), ['Bạn vừa bị lừa', 'Thấy dịch vụ']);
  // Nhãn có nghĩa, số không liên tục, trang không phải mở đầu phần → giữ nguyên.
  const t = { layout: 'cards', title: 'Phần 3 · Phòng tránh', items: [{ title: 'KIỂU 05 Bẫy', value: 'Lợi nhuận' }, { title: 'KIỂU 06', value: 'Việc làm' }], steps: [{ title: '1. Dừng' }, { title: '3. Làm' }] };
  tidySlide(t);
  const u = { layout: 'bullets', title: 'X', items: [{ title: 'KIỂU 05 Bẫy món hời', value: 'Kiểu 05' }, { title: 'Giới hạn trí nhớ', value: '01' }, { title: 'Bối cảnh', value: 'Bối cảnh mới' }] };
  tidySlide(u);
  assert.deepEqual(u.items.map((it) => it.value), ['', '', 'Bối cảnh mới']);
  assert.equal(t.title, 'Phần 3 · Phòng tránh');
  const h = { layout: 'bullets', title: 'NGÀNH CÔNG NGHIỆP LỪA ĐẢO TỶ ĐÔ', highlight: 'lừa đảo tỷ đô' };
  tidySlide(h);
  assert.equal(h.highlight, 'LỪA ĐẢO TỶ ĐÔ', 'cụm nhấn lệch hoa/thường → lấy đúng đoạn trong tiêu đề');
  assert.deepEqual(t.items.map((it) => it.value), ['Lợi nhuận', 'Việc làm']);
  assert.deepEqual(t.steps.map((it) => it.title), ['1. Dừng', '3. Làm']);
});

test('render: trang thuộc phần có lớp pt-N + biến màu phần; chân trang là thanh tiến độ; mọi thẻ có hình → has-art', () => {
  const { spec } = normalizeSpec({
    title: 'Bài',
    theme: 'paper',
    parts: [{ title: 'Thực trạng', color: 'blue' }, { title: 'Nhận diện', color: 'red' }],
    slides: [
      { layout: 'cover', title: 'Bìa', part: 0 },
      { layout: 'section', title: 'Phần 2', part: 1 },
      { layout: 'cards', title: 'Thẻ', part: 1, items: [{ title: 'A', image: { asset: A(1), fit: 'contain', frame: 'art' } }, { title: 'B', image: { asset: A(2), fit: 'contain', frame: 'art' } }] },
      { layout: 'cards', title: 'Logo', part: 1, items: [{ title: 'A', image: { asset: A(1), fit: 'contain' } }, { title: 'B', image: { asset: A(2), fit: 'contain' } }] },
    ],
  });
  const d = deckParts(spec, { ratio: '16:9', assetUrl: (id) => `/a/${id}` });
  assert.match(d.themeCss, /\.slide\.pt-1\{[^}]*--blue:#[0-9A-F]{6}/i);
  assert.match(d.slides[1], /class="slide L-section[^"]* pt-1/);
  assert.match(d.slides[1], /class="sec-no"[^>]*>02</, 'số trang mở đầu phần = số thứ tự phần');
  // Trang kiểu section giữa phần (trang video chờ chèn) không mang số phần.
  const mid = normalizeSpec({ title: 'B', theme: 'paper', parts: [{ title: 'A', color: 'blue' }, { title: 'B', color: 'red' }], slides: [{ layout: 'cover', title: 'Bìa', part: 0 }, { layout: 'section', title: 'Video 1', part: 0 }, { layout: 'section', title: 'Phần 2', part: 1 }] }).spec;
  const dm = deckParts(mid, { ratio: '16:9', assetUrl: () => null });
  assert.doesNotMatch(dm.slides[1], /sec-no/);
  assert.match(dm.slides[1], /class="sec no-num/);
  assert.match(dm.slides[2], /class="sec-no"[^>]*>02</);
  assert.match(d.slides[2], /ft-parts/);
  assert.match(d.slides[2], /class="fp done"[^>]*><b><\/b><span>Thực trạng/);
  assert.match(d.slides[2], /class="fp on"[^>]*><b><\/b><span>Nhận diện/);
  assert.match(d.slides[2], / has-art/);
  assert.match(d.themeCss, /\.slide\.pt-1\{[^}]*--accent:#[0-9A-F]{6}/i, 'chữ nhấn đổi theo màu phần (cả theme đặt --accent riêng)');
  assert.doesNotMatch(d.slides[3], / has-art/, 'logo/ảnh người dùng trên thẻ giữ ô nền trắng');
});

// Toàn luồng dựng bài với chỉ đạo thiết kế (AI giả): phần + biến thể + bộ hình 3D vào đúng trang/thẻ.
test('buildDeck (chỉ đạo thiết kế): spec có phần, biến thể AI chọn, hình 3D bìa + từng thẻ; trang lẫn thiếu hình không gắn dở', async () => {
  process.env.NODE_ENV = 'test';
  const base = loadConfig();
  const config = { ...base, design: { direct: true }, aiImages: { ...base.aiImages, enabled: true, perDeck: 6, artPerDeck: 10 } };
  const created = [];
  const st = {};
  const outline = {
    title: 'Bài', options: { aiImages: true, tone: 'light' },
    slides: [os('Bìa', ['a'], { layout: 'cover' }), os('Kiểu lừa', ['Ngân hàng: gọi điện', 'Công an: doạ']), os('Phòng tránh', ['Dừng', 'Kiểm chứng']), os('Kết', [], { layout: 'closing' })],
  };
  let n = 0;
  const gemini = {
    async designDeck() {
      return {
        style: 'soft',
        parts: [{ start: 'S1', title: 'Nhận diện', color: 'red' }, { start: 'S3', title: 'Phòng tránh', color: 'green' }],
        slides: [
          { ref: 'S1', layout: 'cover', variant: 'split', title: 'Bìa', art: 'a shield' },
          { ref: 'S2', layout: 'cards', variant: 'rows', title: 'Kiểu lừa', art: '', items: [{ title: 'Ngân hàng', text: 'gọi điện', art: 'a bank' }, { title: 'Công an', text: 'doạ', art: 'a badge' }] },
          { ref: 'S3', layout: 'cards', variant: 'grid', title: 'Phòng tránh', art: '', items: [{ title: 'Dừng', art: 'a hand' }, { title: 'Kiểm chứng', art: 'FAIL' }] },
          { ref: 'S4', layout: 'closing', variant: 'center', title: 'Kết', art: '' },
        ],
      };
    },
    async generateImage({ prompt }) {
      n += 1;
      if (/^FAIL/.test(prompt)) throw new Error('model lỗi');
      return { buffer: await sharp({ create: { width: 300, height: 300, channels: 3, background: '#F0EEEA' } }).png().toBuffer() };
    },
  };
  const svc = createPresentationService({
    config,
    repos: {
      presentations: { async findOwned() { return { id: 'd1', tenant_id: 'u1', status: 'outline', ratio: '16:9', outline, outline_version: 1 }; }, async startBuildOwned() { return 1; }, async setGenerationResult(_t, _id, r) { st.spec = r.spec; }, async buildFailed(_t, _id, m) { st.failed = m; } },
      assets: { async create(_t, row) { created.push(row); }, async listMediaForPresentation() { return created.map((a) => ({ id: a.id, kind: a.kind, original_name: a.originalName })); } },
      versions: {},
    },
    storage: { async put() {} }, gemini, browser: {}, signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {},
  });
  await svc.build({ id: 'u1' }, 'd1', { outlineVersion: 1 }, '');
  const t = Date.now();
  while (!st.spec && !st.failed && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 20));
  assert.equal(st.failed, undefined, st.failed);
  const s = st.spec;
  assert.deepEqual(s.parts, [{ title: 'Nhận diện', color: 'red' }, { title: 'Phòng tránh', color: 'green' }]);
  assert.deepEqual(s.slides.map((x) => x.part), [0, 0, 1, 1]);
  assert.equal(s.style, 'soft');
  assert.equal(s.slides[1].variant, 'rows', 'biến thể AI chọn được giữ');
  assert.ok(s.slides[0].image?.asset, 'bìa có hình 3D');
  assert.ok(s.slides[1].items.every((it) => it.image?.asset), 'trọn bộ hình cho từng thẻ');
  assert.ok(s.slides[2].items.every((it) => !it.image), 'thiếu 1 hình → không gắn dở bộ hình');
  assert.equal(n, 5, 'bìa + 2 + 2 (trang kết không nhận hình cỡ trang)');
  assert.ok(created.filter((a) => /^ai-hinh-3d-trang-/.test(a.originalName)).length >= 3);
});
