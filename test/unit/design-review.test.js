// Số thứ tự trang trí tách khỏi tiêu đề mục (nhãn nhỏ trên tiêu đề / bỏ khi bố cục tự vẽ số) + vòng AI tự soát sau khi dựng bài.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { numberPrefix, tidyNumbers, drawsItemNumber, tidySlide } from '../../src/services/artDirection.js';
import { applyReview, altVariants, slideBrief, reviewResponseSchema, REVIEW_REDRAW_MAX } from '../../src/services/designReview.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';
import { deckParts } from '../../shared/deck/render.js';
import { isMovePath } from '../../shared/deck/layers.js';
import { applyFrameEdit } from '../../frontend/src/lib/editPaths.js';

const A = (n) => `a000000${n}-0000-4000-8000-000000000000`;
const art = (n) => ({ asset: A(n), fit: 'contain', frame: 'art' });

test('numberPrefix: tiền tố chung, số liên tiếp (Ả Rập / La Mã, có/không chữ dẫn); mục lẻ hoặc số rời rạc → null', () => {
  const p = numberPrefix([{ title: 'KIỂU 01: Cơ quan nhà nước' }, { title: 'Kiểu 02 – Ngân hàng' }, { title: 'KIỂU 03 Shipper' }]);
  assert.deepEqual(p.labels, ['Kiểu 01', 'Kiểu 02', 'Kiểu 03']);
  assert.equal(p.start, 1);
  assert.deepEqual(numberPrefix([{ title: '1. Giục gấp' }, { title: '2) Đe doạ' }]).labels, ['01', '02']);
  assert.deepEqual(numberPrefix([{ title: 'Giai đoạn I – A' }, { title: 'Giai đoạn II – B' }]).labels, ['Giai đoạn I', 'Giai đoạn II']);
  assert.equal(numberPrefix([{ title: '06. X' }, { title: '07. Y' }]).start, 6);
  assert.equal(numberPrefix([{ title: '3 bước để an toàn' }]), null, 'một mục');
  assert.equal(numberPrefix([{ title: '1. A' }, { title: '3. B' }]), null, 'không liên tiếp');
  assert.equal(numberPrefix([{ title: 'Kiểu 01 A' }, { title: 'Loại 02 B' }]), null, 'chữ dẫn khác nhau');
  assert.equal(numberPrefix([{ title: '2 triệu người' }, { title: '3 tỷ đồng' }]), null, 'số liệu, không phải số thứ tự');
  assert.deepEqual(numberPrefix([{ title: '01 Giục gấp' }, { title: '02 Đe doạ' }]).labels, ['01', '02']);
});

test('tidyNumbers: bố cục tự vẽ số → bỏ tiền tố; không vẽ số → nhãn nhỏ trên tiêu đề; dãy tiếp nối trên kiểu đánh số → bỏ kiểu', () => {
  const spec = {
    slides: [
      { layout: 'cards', variant: 'grid', items: [{ title: 'KIỂU 01: Cơ quan nhà nước' }, { title: 'KIỂU 02: Ngân hàng' }] },
      { layout: 'bullets', variant: 'numbered', items: [{ title: '01. Giục gấp' }, { title: '02. Đe doạ' }] },
      { layout: 'agenda', items: [{ title: 'Phần 1: Thực trạng', label: '' }, { title: 'Phần 2: Nhận diện' }] },
      { layout: 'cards', variant: 'numbered', items: [{ title: '06. X' }, { title: '07. Y' }] },
      { layout: 'process', steps: [{ title: 'Bước 1: A' }, { title: 'Bước 2: B' }] },
      { layout: 'timeline', steps: [{ title: 'Giai đoạn I – A' }, { title: 'Giai đoạn II – B' }] },
      { layout: 'bullets', variant: 'numbered', items: [{ title: 'A', label: 'Yếu tố 1' }, { title: 'B', label: 'Yếu tố 2' }] },
      { layout: 'cards', variant: 'numbered', items: [{ title: '1. Có hình', image: art(1) }, { title: '2. Có hình', image: art(2) }] },
    ],
  };
  assert.equal(tidyNumbers(spec), 8);
  const [a, b, c, d, e, f, g, h] = spec.slides;
  assert.deepEqual(a.items.map((x) => [x.label, x.title]), [['Kiểu 01', 'Cơ quan nhà nước'], ['Kiểu 02', 'Ngân hàng']]);
  assert.deepEqual(b.items.map((x) => [x.label, x.title]), [[undefined, 'Giục gấp'], [undefined, 'Đe doạ']], 'số lớn đã vẽ → không nhãn');
  assert.deepEqual(c.items.map((x) => x.title), ['Thực trạng', 'Nhận diện']);
  assert.equal(d.variant, '');
  assert.deepEqual(d.items.map((x) => x.label), ['06', '07']);
  assert.deepEqual(e.steps.map((x) => [x.title, x.value]), [['A', undefined], ['B', undefined]]);
  assert.deepEqual(f.steps.map((x) => [x.title, x.value]), [['A', 'Giai đoạn I'], ['B', 'Giai đoạn II']]);
  assert.deepEqual(g.items.map((x) => x.label), [undefined, undefined], 'nhãn số thứ tự trùng số bố cục vẽ → bỏ');
  assert.equal(drawsItemNumber(h, 0), false, 'mục có hình → bố cục không vẽ số');
  assert.deepEqual(h.items.map((x) => x.label), ['01', '02']);
  // Không có số thứ tự → không đổi gì.
  const none = { slides: [{ layout: 'cards', items: [{ title: 'Ngân hàng' }, { title: 'Công an' }] }] };
  assert.equal(tidyNumbers(none), 0);
});

test('tidySlide: nhãn "Kiểu 01…" liên tục ở danh sách mục → thành label (không mất chữ), nhãn chỉ là số → bỏ', () => {
  const s = { layout: 'cards', title: 'X', items: [{ title: 'Cơ quan', value: 'Kiểu 01' }, { title: 'Ngân hàng', value: 'Kiểu 02' }] };
  tidySlide(s);
  assert.deepEqual(s.items.map((x) => [x.value, x.label]), [['', 'Kiểu 01'], ['', 'Kiểu 02']]);
  const t = { layout: 'cards', title: 'X', items: [{ title: 'A', value: '01' }, { title: 'B', value: '02' }] };
  tidySlide(t);
  assert.deepEqual(t.items.map((x) => [x.value, x.label]), [['', undefined], ['', undefined]]);
  const q = { layout: 'cards', title: 'X', items: [{ title: 'amazon.com', value: 'A' }, { title: 'apple.com', value: 'C' }, { title: 'KIỂU 05 Bẫy', value: 'Kiểu 05' }] };
  tidySlide(q);
  assert.deepEqual(q.items.map((x) => x.value), ['A', 'C', ''], 'chỉ bỏ nhãn lặp nguyên từ trong tiêu đề');
});

test('label: normalizeSpec giữ khi có chữ, render nhãn nhỏ trên tiêu đề (kể cả kiểu rows), sửa trực tiếp được', () => {
  const { spec } = normalizeSpec({
    title: 'B',
    theme: 'paper',
    slides: [
      { layout: 'cards', title: 'Kiểu lừa', items: [{ title: 'Cơ quan nhà nước', label: 'Kiểu 01' }, { title: 'Ngân hàng', label: '' }] },
      { layout: 'cards', variant: 'rows', title: 'Hàng', items: [{ title: 'A', text: 'a', label: 'Kiểu <b>02</b>' }, { title: 'B', text: 'b' }, { title: 'C', text: 'c' }] },
    ],
  });
  assert.equal(spec.slides[0].items[0].label, 'Kiểu 01');
  assert.equal('label' in spec.slides[0].items[1], false, 'nhãn rỗng không lưu');
  const d = deckParts(spec, { ratio: '16:9', assetUrl: () => null });
  assert.match(d.slides[0], /<span class="ilab">Kiểu 01<\/span><h4/);
  assert.match(d.slides[1], /class="crow-t"><span class="ilab">Kiểu &lt;b&gt;02&lt;\/b&gt;<\/span>/, 'chuỗi vào HTML qua esc');
  const ed = deckParts(spec, { ratio: '16:9', assetUrl: () => null, mode: 'edit' });
  assert.match(ed.slides[0], /class="ilab"[^>]*data-e="items\.0\.label"/);
  assert.ok(isMovePath('items.0.label'));
  const draft = structuredClone(spec);
  assert.equal(applyFrameEdit(draft, 0, 'items.0.label', 'Kiểu 09'), true);
  assert.equal(draft.slides[0].items[0].label, 'Kiểu 09');
});

test('applyReview: chỉ đổi kiểu khi có lỗi bố cục + kiểu nằm trong danh sách được đổi; hình lỗi → vẽ lại / bỏ trong hạn mức', () => {
  const { spec } = normalizeSpec({
    title: 'B',
    theme: 'paper',
    slides: [
      { layout: 'cover', title: 'Bìa', image: art(1) },
      { layout: 'cards', variant: 'grid', title: 'Thẻ', items: [{ title: 'A', image: art(2) }, { title: 'B', image: art(3) }, { title: 'C', image: art(4) }] },
      { layout: 'cards', variant: 'grid', title: 'Thẻ 2', items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] },
      { layout: 'bullets', title: 'Ý', items: [{ title: 'A' }, { title: 'B' }], image: art(5) },
    ],
  });
  const alts = altVariants(spec.slides[2], 16 / 9);
  assert.ok(alts.includes('rows') && !alts.includes('grid') && !alts.includes('venn'), 'không gồm kiểu đang dùng / kiểu chỉ người dùng chọn');
  assert.match(slideBrief(spec.slides[1], 1, 16 / 9), /^Trang 2 · bố cục cards · kiểu đang dùng: grid · .*hình minh hoạ: hình 3D từng mục/);
  const res = applyReview(spec, [
    { slide: 1, ok: false, issues: [{ kind: 'bad_art', detail: 'nền xám' }], variant: '', art: 'redraw' },
    { slide: 2, ok: false, issues: [{ kind: 'art_mismatch', detail: 'hình to' }], variant: '', art: 'redraw' },
    { slide: 3, ok: false, issues: [{ kind: 'empty_space', detail: 'trống' }], variant: 'rows', art: 'keep' },
    { slide: 3, ok: false, issues: [{ kind: 'crowded', detail: 'lặp' }], variant: 'bento', art: 'keep' },
    { slide: 4, ok: false, issues: [{ kind: 'bad_art', detail: 'méo' }], variant: 'không-có', art: 'drop' },
    { slide: 9, ok: false, issues: [{ kind: 'overflow', detail: 'x' }], variant: 'rows', art: 'keep' },
  ]);
  assert.deepEqual(res.redraw, [{ slide: 0, item: null }, { slide: 1, item: 0 }, { slide: 1, item: 1 }, { slide: 1, item: 2 }]);
  assert.equal(spec.slides[2].variant, 'rows', 'chỉ lượt đầu của 1 trang được tính');
  assert.equal(spec.slides[3].image, undefined, 'bỏ hình');
  assert.equal(res.checked, 4);
  assert.equal(res.variants, 1);
  assert.equal(res.dropped, 1);
  // Kiểu ngoài danh sách / không có lỗi bố cục → không đổi; ok không lỗi → bỏ qua.
  const s2 = normalizeSpec({ title: 'B', theme: 'paper', slides: [{ layout: 'cards', variant: 'grid', title: 'T', items: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }] }).spec;
  applyReview(s2, [{ slide: 1, ok: false, issues: [{ kind: 'low_contrast', detail: 'x' }], variant: 'rows', art: 'keep' }]);
  assert.equal(s2.slides[0].variant, 'grid');
  assert.equal(applyReview(s2, [{ slide: 1, ok: true, issues: [], variant: 'rows', art: 'redraw' }]).flagged, 0);
  // Bộ hình từng mục vượt hạn mức vẽ lại → bỏ cả bộ.
  const items = Array.from({ length: REVIEW_REDRAW_MAX }, (_, k) => ({ title: `M${k}`, image: art(1) }));
  const s3 = normalizeSpec({ title: 'B', theme: 'paper', slides: [{ layout: 'cover', title: 'Bìa', image: art(1) }, { layout: 'cards', title: 'T', items }] }).spec;
  const r3 = applyReview(s3, [
    { slide: 1, ok: false, issues: [{ kind: 'bad_art', detail: 'x' }], variant: '', art: 'redraw' },
    { slide: 2, ok: false, issues: [{ kind: 'bad_art', detail: 'x' }], variant: '', art: 'redraw' },
  ]);
  assert.equal(r3.redraw.length, 1);
  assert.ok(s3.slides[1].items.every((it) => !it.image));
  assert.equal(reviewResponseSchema().properties.slides.items.required.includes('art'), true);
  // Chữ nhỏ trên trang có hình cỡ trang → bỏ hình (trừ bìa).
  const s4 = normalizeSpec({ title: 'B', theme: 'paper', slides: [{ layout: 'cover', title: 'Bìa', image: art(1) }, { layout: 'bullets', title: 'Ý', items: [{ title: 'A' }, { title: 'B' }], image: art(2) }] }).spec;
  const r4 = applyReview(s4, [
    { slide: 1, ok: false, issues: [{ kind: 'small_text', detail: 'x' }], variant: '', art: 'keep' },
    { slide: 2, ok: false, issues: [{ kind: 'small_text', detail: 'x' }], variant: '', art: 'keep' },
  ]);
  assert.ok(s4.slides[0].image, 'bìa giữ hình');
  assert.equal(s4.slides[1].image, undefined);
  assert.equal(r4.dropped, 1);
});

test('buildDeck + tự soát: chụp mọi trang, gửi theo lượt, vẽ lại hình lỗi, xoá hình cũ; lỗi soát không làm hỏng lượt dựng', async () => {
  process.env.NODE_ENV = 'test';
  const base = loadConfig();
  const os = (title, points = [], extra = {}) => ({ id: `s-${title}`, layout: 'auto', title, subtitle: '', points, notes: '', images: [], video: null, ...extra });
  const outline = { title: 'Bài', options: { aiImages: true, tone: 'light' }, slides: [os('Bìa', ['a'], { layout: 'cover' }), os('Kiểu lừa', ['KIỂU 01: Ngân hàng', 'KIỂU 02: Công an'])] };
  const run = async (reviewImpl) => {
    const config = { ...base, design: { direct: true, review: true }, aiImages: { ...base.aiImages, enabled: true, perDeck: 6, artPerDeck: 10 } };
    const created = [];
    const removed = [];
    const st = {};
    const shotCalls = [];
    let draws = 0;
    const gemini = {
      async designDeck() {
        return {
          style: 'soft',
          parts: [],
          slides: [
            { ref: 'S1', layout: 'cover', variant: 'split', title: 'Bìa', art: 'a shield' },
            { ref: 'S2', layout: 'cards', variant: 'grid', title: 'Kiểu lừa', art: '', items: [{ title: 'KIỂU 01: Ngân hàng', text: 'gọi', art: '' }, { title: 'KIỂU 02: Công an', text: 'doạ', art: '' }] },
          ],
        };
      },
      async generateImage() {
        draws += 1;
        return { buffer: await sharp({ create: { width: 64, height: 64, channels: 3, background: '#F0EEEA' } }).png().toBuffer() };
      },
      reviewSlides: reviewImpl,
    };
    const png = await sharp({ create: { width: 32, height: 18, channels: 3, background: '#FFFFFF' } }).png().toBuffer();
    const svc = createPresentationService({
      config,
      repos: {
        presentations: { async findOwned() { return { id: 'd1', tenant_id: 'u1', status: 'outline', ratio: '16:9', outline, outline_version: 1 }; }, async startBuildOwned() { return 1; }, async setGenerationResult(_t, _id, r) { st.spec = r.spec; }, async buildFailed(_t, _id, m) { st.failed = m; } },
        assets: {
          async create(_t, row) { created.push(row); },
          async listMediaForPresentation() { return created.map((a) => ({ id: a.id, kind: a.kind, original_name: a.originalName, mime: a.mime, width: a.width, height: a.height, storage_key: a.storageKey })); },
          async findById(id) { const a = created.find((x) => x.id === id); return a ? { storage_key: a.storageKey } : null; },
          async deleteOwned(_t, id) { removed.push(id); },
        },
        versions: {},
      },
      storage: { async put() {}, async get() { return png; }, async remove() {} },
      gemini,
      browser: { async screenshotSlides(_html, o) { shotCalls.push(o); return o.indices.map(() => png); } },
      signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {},
    });
    await svc.build({ id: 'u1' }, 'd1', { outlineVersion: 1 }, '');
    const t = Date.now();
    while (!st.spec && !st.failed && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 20));
    return { st, removed, shotCalls, draws, created };
  };
  let seen = null;
  const ok = await run(async ({ shots }) => {
    seen = shots;
    return { slides: [{ slide: 1, ok: false, issues: [{ kind: 'bad_art', detail: 'nền xám' }], variant: '', art: 'redraw' }, { slide: 2, ok: false, issues: [{ kind: 'empty_space', detail: 'trống' }], variant: 'rows', art: 'keep' }] };
  });
  assert.equal(ok.st.failed, undefined, ok.st.failed);
  assert.equal(ok.shotCalls.length, 1);
  assert.deepEqual(ok.shotCalls[0].indices, [0, 1]);
  assert.equal(seen.length, 2);
  assert.ok(Buffer.isBuffer(seen[0].jpeg) && seen[0].jpeg[0] === 0xff, 'ảnh gửi model là JPEG');
  assert.match(seen[1].brief, /^Trang 2 · bố cục cards/);
  const s = ok.st.spec;
  assert.equal(ok.draws, 2, 'bìa + 1 lần vẽ lại');
  assert.equal(ok.removed.length, 1, 'hình cũ bị thay → xoá');
  assert.ok(s.slides[0].image.asset && s.slides[0].image.asset !== ok.removed[0]);
  assert.equal(s.slides[1].variant, 'rows');
  assert.deepEqual(s.slides[1].items.map((it) => [it.label, it.title]), [['Kiểu 01', 'Ngân hàng'], ['Kiểu 02', 'Công an']]);
  // Model soát lỗi → giữ bản chưa soát, bài vẫn dựng xong.
  const bad = await run(async () => {
    throw new Error('mạng');
  });
  assert.equal(bad.st.failed, undefined);
  assert.ok(bad.st.spec.slides[0].image?.asset);
  assert.equal(bad.removed.length, 0);
});

test('tidyHeads: phụ đề/tiêu đề mở đầu bằng nhãn đầu trang → bỏ phần lặp; phụ đề trùng tiêu đề, thẻ trùng nhãn → bỏ; không cắt giữa từ', async () => {
  const { tidyHeads } = await import('../../src/services/artDirection.js');
  const spec = {
    slides: [
      { kicker: 'Câu hỏi 2 · Hình thức 1', title: 'Hình thức 1: Kẻ lừa đảo', subtitle: 'CÂU HỎI 2 · HÌNH THỨC 1' },
      { kicker: 'Câu hỏi 2 · Hình thức 1', title: 'X', subtitle: 'CÂU HỎI 2 · HÌNH THỨC 1 — Kẻ gian cần đủ 4 bước.' },
      { kicker: 'Phần 3', title: 'PHẦN 3 · PHÒNG TRÁNH', highlight: 'PHÒNG TRÁNH' },
      { kicker: 'Phần 3', title: 'Phần 30 năm' },
      { kicker: 'Thực hành', title: 'VIDEO MINH HỌA PHẢN XẠ', subtitle: 'video minh họa phản xạ' },
      { kicker: 'Phần 2', title: 'Cận cảnh', tags: ['Phần 2', 'Khung nhận diện'] },
      { kicker: 'Câu hỏi 1', title: 'Câu hỏi 1 · Ai mở lời trước?', highlight: 'Câu hỏi 1' },
      { kicker: 'Mở đầu', title: 'Mở đầu' },
    ],
  };
  assert.equal(tidyHeads(spec), 7);
  const [a, b, c, d, e, f, g, h] = spec.slides;
  assert.equal(a.subtitle, '');
  assert.equal(b.subtitle, 'Kẻ gian cần đủ 4 bước.');
  assert.deepEqual([c.title, c.highlight], ['PHÒNG TRÁNH', 'PHÒNG TRÁNH']);
  assert.equal(d.title, 'Phần 30 năm', 'không cắt giữa số');
  assert.equal(e.subtitle, '');
  assert.deepEqual(f.tags, ['Khung nhận diện']);
  assert.deepEqual([g.title, g.highlight], ['Ai mở lời trước?', ''], 'cụm nhấn không còn trong tiêu đề → bỏ');
  assert.deepEqual([h.kicker, h.title], ['', 'Mở đầu']);
  const k = { slides: [
    { kicker: 'Câu hỏi 2 · Kịch bản tấn công', title: 'Hình thức 1', subtitle: 'CÂU HỎI 2 · HÌNH THỨC 1 — Kẻ gian cần đủ 4 bước.' },
    { kicker: 'Bẫy thứ cấp', title: 'Bị lừa lần hai', subtitle: 'THÊM MỘT BẪY — Đã mất tiền' },
  ] };
  tidyHeads(k);
  assert.deepEqual([k.slides[0].kicker, k.slides[0].subtitle], ['CÂU HỎI 2 · HÌNH THỨC 1', 'Kẻ gian cần đủ 4 bước.']);
  assert.equal(k.slides[1].subtitle, 'THÊM MỘT BẪY — Đã mất tiền', 'đoạn đầu khác nhãn → giữ');
});
