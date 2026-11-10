// Nhấn mạnh khi dựng bài: mục then chốt (huy hiệu) + câu chốt cuối trang (dải kết luận / câu chốt cỡ lớn kèm hình 3D),
// làm sạch spec, renderer, sửa chữ trên khung, kế hoạch vẽ hình, lược đồ trả lời của model; lưới thẻ hàng cuối lẻ căn giữa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEmphasis, applyDirection, planArt, tidyHeads } from '../../src/services/artDirection.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { designResponseSchema } from '../../src/services/geminiService.js';
import { fitTrials, fitProbe, applyFit, FIT_TIGHT } from '../../src/services/designReview.js';
import { deckParts } from '../../shared/deck/render.js';
import { calloutArt, QUOTE_ART_LAYOUTS, CALLOUT_LAYOUTS } from '../../shared/deck/blocks.js';
import { applyFrameEdit } from '../../frontend/src/lib/editPaths.js';

const A = 'a0000001-0000-4000-8000-000000000000';
const steps = () => [
  { title: 'Nhận cuộc gọi', text: 'Kẻ gian giả danh công an' },
  { title: 'Cài ứng dụng lạ', text: 'Bấm link, cài ứng dụng (DỪNG LẠI Ở ĐÂY LÀ AN TOÀN)' },
  { title: 'Bị chiếm quyền', text: 'Điện thoại bị điều khiển từ xa' },
  { title: 'Mất tiền', text: 'Tài khoản bị rút sạch' },
];
const cards = () => [
  { icon: 'clock', title: 'Giục gấp', text: 'Tạo áp lực thời gian' },
  { icon: 'cash', title: 'Đòi chuyển tiền', text: 'Yêu cầu chuyển khoản ngay' },
  { icon: 'lock', title: 'Bắt giữ bí mật', text: 'Không cho kể với ai' },
  { icon: 'flag', title: 'Kết luận', text: 'Không có gì là miễn phí' },
];
const quote = (extra = {}) => ({ style: 'quote', text: 'Không có gì là miễn phí', sub: 'Cái gì cho không rồi cũng đòi lại', highlight: 'miễn phí', art: 'a mousetrap holding a gift box', ...extra });
const parts = (slides) => {
  const { spec, errors } = normalizeSpec({ title: 'Thử', slides });
  assert.deepEqual(errors, []);
  return { spec, html: deckParts(spec, { ratio: '16:9', assetUrl: (id) => (id === A ? '/a.png' : null) }).slides };
};

test('applyEmphasis: huy hiệu gắn đúng bước then chốt, câu huy hiệu (cả trong ngoặc, khác hoa/thường) bị bỏ khỏi mô tả', () => {
  const s = { layout: 'process', title: 'Hành trình', steps: steps(), focus: { at: 2, badge: 'Dừng lại ở đây là an toàn' }, takeaway: { style: 'none', text: '', sub: '', highlight: '', art: '' } };
  assert.deepEqual(applyEmphasis(s), { focus: true, takeaway: false, quote: false, art: '' });
  assert.equal(s.steps[1].badge, 'Dừng lại ở đây là an toàn');
  assert.equal(s.steps[1].text, 'Bấm link, cài ứng dụng');
  assert.equal(s.steps.filter((x) => x.badge).length, 1);
  assert.ok(!('focus' in s) && !('takeaway' in s) && !s.callout, 'trường tạm bị xoá, không tạo khối cuối');
});

test('applyEmphasis: focus sai (at 0 / vượt danh sách / huy hiệu > 8 từ / danh sách 1 mục / bố cục không hỗ trợ / không được phép) → bỏ qua', () => {
  const bad = [
    { at: 0, badge: 'Then chốt' },
    { at: 9, badge: 'Then chốt' },
    { at: 1, badge: 'một hai ba bốn năm sáu bảy tám chín' },
    { at: 1, badge: '   ' },
  ];
  for (const focus of bad) {
    const s = { layout: 'cards', title: 'T', items: cards(), focus };
    assert.equal(applyEmphasis(s).focus, false, JSON.stringify(focus));
    assert.ok(s.items.every((x) => !x.badge));
  }
  const one = { layout: 'cards', title: 'T', items: cards().slice(0, 1), focus: { at: 1, badge: 'Then chốt' } };
  assert.equal(applyEmphasis(one).focus, false);
  const quoteSlide = { layout: 'quote', title: 'T', items: cards(), focus: { at: 1, badge: 'Then chốt' } };
  assert.equal(applyEmphasis(quoteSlide).focus, false);
  const capped = { layout: 'cards', title: 'T', items: cards(), focus: { at: 1, badge: 'Then chốt' } };
  assert.equal(applyEmphasis(capped, { focus: false, takeaway: true }).focus, false);
});

test('applyEmphasis: câu chốt → khối cuối trang; mục "Kết luận" trùng câu chốt rời danh sách; cụm tô nhấn phải nằm trong câu', () => {
  const s = { layout: 'cards', title: '4 dấu hiệu', subtitle: 'Không có gì là miễn phí', items: cards(), takeaway: quote() };
  assert.deepEqual(applyEmphasis(s), { focus: false, takeaway: true, quote: true, art: 'a mousetrap holding a gift box' });
  assert.deepEqual(s.items.map((x) => x.title), ['Giục gấp', 'Đòi chuyển tiền', 'Bắt giữ bí mật']);
  assert.deepEqual(s.callout, { tone: 'note', style: 'quote', text: 'Không có gì là miễn phí', sub: 'Cái gì cho không rồi cũng đòi lại', highlight: 'miễn phí' });
  assert.equal(s.subtitle, '', 'phụ đề trùng câu chốt bị bỏ');

  const band = { layout: 'bullets', title: 'T', items: cards(), takeaway: quote({ style: 'band', highlight: 'không có trong câu' }) };
  assert.deepEqual(applyEmphasis(band), { focus: false, takeaway: true, quote: false, art: '' }, 'dải kết luận không kèm hình');
  assert.equal(band.callout.style, 'band');
  assert.ok(!('highlight' in band.callout));

  // Bố cục không có ô hình riêng cho câu chốt (bullets) → câu chốt cỡ lớn không kèm hình.
  const q = { layout: 'bullets', title: 'T', items: cards(), takeaway: quote() };
  assert.equal(applyEmphasis(q).art, '');
});

test('applyEmphasis: không chồng hộp chú thích có sẵn; danh sách chỉ còn ≤ 2 mục mà câu chốt trùng 1 mục → giữ nguyên', () => {
  const own = { layout: 'cards', title: 'T', items: cards(), callout: { tone: 'warn', text: 'Của người dùng' }, takeaway: quote() };
  assert.equal(applyEmphasis(own).takeaway, false);
  assert.deepEqual(own.callout, { tone: 'warn', text: 'Của người dùng' });
  assert.equal(own.items.length, 4);

  const few = { layout: 'cards', title: 'T', items: cards().slice(2), takeaway: quote() };
  assert.equal(applyEmphasis(few).takeaway, false);
  assert.equal(few.items.length, 2);
  assert.ok(!few.callout);

  for (const style of ['none', 'box', '']) {
    const s = { layout: 'cards', title: 'T', items: cards(), takeaway: quote({ style }) };
    assert.equal(applyEmphasis(s).takeaway, false, style);
  }
  const chart = { layout: 'chart', title: 'T', takeaway: quote() };
  assert.equal(applyEmphasis(chart).takeaway, false, 'bố cục không nhận câu chốt');
});

test('applyDirection: mỗi loại nhấn mạnh tối đa ~1/3 số trang; vật thể hình câu chốt chuyển sang arts', () => {
  const mk = () => ({ layout: 'cards', title: 'T', items: cards(), focus: { at: 1, badge: 'Then chốt' }, takeaway: quote() });
  const composed = { title: 'B', slides: [mk(), mk(), mk()] };
  const out = applyDirection(composed, {});
  assert.deepEqual(out.emphasis, { focus: 1, takeaways: 1, quotes: 1 });
  assert.equal(composed.slides.filter((s) => s.callout).length, 1);
  assert.equal(composed.slides.filter((s) => s.items.some((x) => x.badge)).length, 1);
  assert.equal(out.arts[0].quote, 'a mousetrap holding a gift box');
  assert.equal(out.arts[1].quote, '');
  assert.ok(composed.slides.every((s) => !('focus' in s) && !('takeaway' in s)));
});

test('normalizeSpec: giữ kiểu khối (band/quote) + câu phụ + cụm tô nhấn; box = mặc định không lưu; huy hiệu mục giữ khi có chữ', () => {
  const { spec } = parts([
    { layout: 'cards', title: 'A', items: [{ title: 'x', badge: 'Then chốt' }, { title: 'y', badge: '  ' }], callout: { tone: 'note', style: 'quote', text: 'Không có gì là miễn phí', sub: 'Giải thích', highlight: 'miễn phí' } },
    { layout: 'cards', title: 'B', items: [{ title: 'x' }, { title: 'y' }], callout: { tone: 'ok', style: 'box', text: 'Hộp', sub: 'bỏ', highlight: 'Hộp' } },
    { layout: 'cards', title: 'C', items: [{ title: 'x' }, { title: 'y' }], callout: { tone: 'note', style: 'band', text: 'Dải', highlight: 'không có' } },
    { layout: 'cards', title: 'D', items: [{ title: 'x' }, { title: 'y' }], callout: { tone: 'note', style: 'lạ', text: 'Lạ' } },
  ]);
  assert.deepEqual(spec.slides[0].callout, { tone: 'note', text: 'Không có gì là miễn phí', style: 'quote', sub: 'Giải thích', highlight: 'miễn phí' });
  assert.equal(spec.slides[0].items[0].badge, 'Then chốt');
  assert.ok(!('badge' in spec.slides[0].items[1]));
  assert.deepEqual(spec.slides[1].callout, { tone: 'ok', text: 'Hộp' });
  assert.deepEqual(spec.slides[2].callout, { tone: 'note', text: 'Dải', style: 'band' });
  assert.deepEqual(spec.slides[3].callout, { tone: 'note', text: 'Lạ' });
});

test('render: huy hiệu + lớp is-focus đúng mục (chữ được thoát HTML); thẻ "hot" dời sang thẻ then chốt', () => {
  const { html } = parts([
    { layout: 'cards', title: 'T', items: [{ title: 'a' }, { title: 'b', badge: '<b>Then chốt</b>' }, { title: 'c' }] },
    { layout: 'process', title: 'T', steps: [{ title: 'a' }, { title: 'b', badge: 'Dừng ở đây' }, { title: 'c' }] },
  ]);
  assert.ok(html[0].includes('<span class="fbadge">&lt;b&gt;Then chốt&lt;/b&gt;</span>'));
  assert.equal((html[0].match(/ is-focus/g) || []).length, 1);
  assert.equal((html[0].match(/ hot/g) || []).length, 1);
  assert.ok(/class="panel card hot is-focus"/.test(html[0]), 'thẻ then chốt là thẻ nổi bật');
  assert.ok(html[1].includes('<span class="fbadge">Dừng ở đây</span>'));
});

test('render: dải kết luận + câu chốt cỡ lớn (kèm hình của trang khi bố cục không có ô ảnh riêng, không ảnh nhấn)', () => {
  const items = [{ title: 'a' }, { title: 'b' }, { title: 'c' }];
  const img = { asset: A, fit: 'contain', frame: 'art', alt: 'Bẫy' };
  const { html } = parts([
    { layout: 'cards', title: 'T', items, callout: { tone: 'note', style: 'band', text: 'Chậm lại <1 phút>', sub: 'Gọi lại số chính thức' } },
    { layout: 'cards', title: 'T', items, image: img, callout: { tone: 'note', style: 'quote', text: 'Không có gì là miễn phí', highlight: 'miễn phí' } },
    { layout: 'cards', title: 'T', items, image: img, accent: 'left', callout: { tone: 'note', style: 'quote', text: 'Câu chốt' } },
    { layout: 'bullets', title: 'T', items, image: img, callout: { tone: 'note', style: 'quote', text: 'Câu chốt' } },
  ]);
  assert.ok(/<aside class="callout cb co-note"/.test(html[0]));
  assert.ok(html[0].includes('Chậm lại &lt;1 phút&gt;'));
  assert.ok(html[0].includes('<div class="co-s">Gọi lại số chính thức</div>'));

  assert.ok(/<aside class="callout cq co-note cq-has"/.test(html[1]));
  assert.ok(html[1].includes('Không có gì là <em class="hl">miễn phí</em>'));
  assert.ok(/<span class="cq-art art"[^>]*><img src="\/a\.png" alt="Bẫy"><\/span>/.test(html[1]));
  assert.equal((html[1].match(/<img/g) || []).length, 1, 'hình chỉ hiện 1 lần');

  // Ảnh nhấn đang dùng hình của trang → câu chốt không kèm hình.
  assert.ok(!html[2].includes('cq-art') && html[2].includes('class="acc acc-left'));
  assert.ok(!html[3].includes('cq-art'), 'bullets có ô ảnh riêng');
  assert.equal(calloutArt({ layout: 'cards', image: img, callout: { style: 'quote' }, video: { provider: 'youtube', id: 'abcdefghijk' } }), false);
  assert.equal(calloutArt({ layout: 'cards', image: img, callout: { style: 'band' } }), false);
  for (const l of QUOTE_ART_LAYOUTS) assert.ok(CALLOUT_LAYOUTS.includes(l), l);
});

test('render: lưới thẻ có hàng cuối lẻ → căn giữa (5 thẻ / 3 cột: 2 thẻ cuối bắt đầu ở rãnh 2 của lưới 6 rãnh)', () => {
  const five = Array.from({ length: 5 }, (_, i) => ({ title: `Thẻ ${i + 1}` }));
  const { html } = parts([
    { layout: 'cards', title: 'T', cols: 3, items: five },
    { layout: 'cards', title: 'T', cols: 3, items: five.slice(0, 3) },
  ]);
  assert.ok(/class="cards ctr" style="--cols:3"/.test(html[0]));
  assert.equal((html[0].match(/grid-column:2 \/ span 2/g) || []).length, 1, 'chỉ thẻ đầu hàng cuối được đặt rãnh');
  assert.ok(!html[1].includes(' ctr'), 'hàng đủ → không căn');
});

test('editPaths: sửa huy hiệu mục/bước và câu phụ của khối cuối trang trên khung', () => {
  const { spec } = parts([{ layout: 'cards', title: 'T', items: [{ title: 'a', badge: 'Cũ' }, { title: 'b' }], callout: { tone: 'note', style: 'band', text: 'Chốt' } }]);
  assert.equal(applyFrameEdit(spec, 0, 'items.0.badge', 'Mới'), true);
  assert.equal(spec.slides[0].items[0].badge, 'Mới');
  assert.equal(applyFrameEdit(spec, 0, 'callout.sub', 'Giải thích'), true);
  assert.equal(spec.slides[0].callout.sub, 'Giải thích');
  assert.equal(applyFrameEdit(spec, 0, 'items.0.badge', 'x'.repeat(200)), true);
  assert.ok(spec.slides[0].items[0].badge.length <= 40);
  delete spec.slides[0].callout;
  assert.equal(applyFrameEdit(spec, 0, 'callout.sub', 'x'), false);
});

test('planArt: trang câu chốt cỡ lớn → 1 hình bên câu chốt (ưu tiên như mở đầu phần), không vẽ bộ hình từng mục', () => {
  const { spec } = parts([
    { layout: 'cover', title: 'Bìa' },
    { layout: 'cards', title: 'T', items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], callout: { tone: 'note', style: 'quote', text: 'Chốt' } },
    { layout: 'cards', title: 'U', items: [{ title: 'a' }, { title: 'b' }] },
  ]);
  const arts = [
    { slide: 'a rocket', quote: '', items: [] },
    { slide: '', quote: 'a mousetrap', items: ['a', 'b', 'c'].map((title) => ({ title, art: `obj ${title}` })) },
    { slide: '', quote: '', items: ['a', 'b'].map((title) => ({ title, art: `obj ${title}` })) },
  ];
  const plan = planArt(spec, arts, 3);
  assert.deepEqual(plan.slice(0, 2).map((p) => [p.slide, p.item, p.subject]), [[0, null, 'a rocket'], [1, null, 'a mousetrap']]);
  assert.equal(plan[1].quote, true);
  assert.equal(plan.length, 2, 'bộ hình 2 mục vượt hạn mức → bỏ trọn bộ');
  assert.equal(planArt(spec, arts, 4).length, 4, 'đủ hạn mức → vẽ trọn bộ');
});

test('designResponseSchema (chỉ đạo thiết kế): trang có focus + takeaway bắt buộc; chế độ thường không có', () => {
  const direct = designResponseSchema({ direct: true }).properties.slides.items;
  assert.ok(direct.required.includes('focus') && direct.required.includes('takeaway'));
  assert.deepEqual(direct.properties.takeaway.properties.style.enum, ['none', 'band', 'quote']);
  assert.ok(direct.propertyOrdering.includes('takeaway'));
  const plain = designResponseSchema({}).properties.slides.items;
  assert.ok(!plain.properties.focus && !plain.properties.takeaway);
});

test('applyEmphasis: khẩu hiệu ngắn + có vật thể trên trang thoáng → câu chốt cỡ lớn; trang dày / hết hạn mức → dải kết luận', () => {
  const up = { layout: 'cards', title: 'T', items: cards().slice(0, 3), takeaway: quote({ style: 'band' }) };
  assert.equal(applyEmphasis(up).quote, true);
  assert.equal(up.callout.style, 'quote');

  const long = { layout: 'cards', title: 'T', items: cards().slice(0, 3), takeaway: quote({ style: 'band', text: 'Một câu kết luận khá dài gồm hơn mười từ để giải thích kỹ hành động cần làm' }) };
  assert.equal(applyEmphasis(long).quote, false, 'câu dài giữ dải kết luận');
  assert.equal(long.callout.style, 'band');

  const dense = { layout: 'cards', title: 'T', items: [...cards().slice(0, 3), ...cards().slice(0, 3)], takeaway: quote() };
  assert.deepEqual(applyEmphasis(dense), { focus: false, takeaway: true, quote: false, art: '' }, '6 mục → dải kết luận');
  assert.equal(dense.callout.style, 'band');

  const capped = { layout: 'cards', title: 'T', items: cards().slice(0, 3), takeaway: quote() };
  assert.equal(applyEmphasis(capped, { focus: true, takeaway: true, quote: false }).quote, false);
  assert.equal(capped.callout.style, 'band');
});

test('đo độ vừa: trang co chữ nhiều thử mọi kiểu còn hợp nội dung; đổi khi kiểu mới vừa hơn rõ rệt, giữ khi không hơn', () => {
  const { spec } = parts([
    { layout: 'cards', title: 'A', items: cards() },
    { layout: 'cards', title: 'B', items: cards() },
    { layout: 'process', title: 'C', steps: steps() },
  ]);
  const ks = [0.6, 1, 0.7];
  const trials = fitTrials(spec, ks);
  assert.ok(trials.length > 0);
  assert.ok(trials.every((t) => ks[t.slide] < FIT_TIGHT), 'chỉ trang dày');
  assert.equal(trials[0].slide, 0, 'trang dày nhất thử trước');
  assert.ok(trials.every((t) => t.variant !== (spec.slides[t.slide].variant || '')));
  const probe = fitProbe(spec, trials);
  assert.equal(probe.slides.length, trials.length);
  assert.equal(probe.slides[0].title, 'A');
  assert.equal(spec.slides[0].variant || '', '', 'bài gốc không đổi khi dựng bài thử');
  // Trang A: kiểu thử đầu vừa hơn nhiều → đổi; trang C: kiểu thử chỉ hơn chút → giữ.
  const tks = trials.map((t, n) => (t.slide === 0 ? (n === 0 ? 0.95 : 0.7) : 0.74));
  assert.deepEqual(applyFit(spec, ks, trials, tks), { changed: 1, dropped: 0 });
  const want = trials[0].variant;
  assert.equal(spec.slides[0].variant, want === 'grid' ? '' : want);
  assert.equal(spec.slides[2].variant || '', '');
});

test('đo độ vừa: trang có bộ hình từng mục thử thêm "bỏ bộ hình"; chỉ bỏ hình khi không kiểu nào giữ hình mà vừa chữ', () => {
  const withArt = () => cards().map((c, k) => ({ ...c, image: { asset: A, fit: 'contain', frame: 'art', alt: `h${k}` } }));
  const { spec } = parts([{ layout: 'cards', title: 'A', items: withArt() }, { layout: 'cards', title: 'B', items: withArt() }]);
  const ks = [0.6, 0.6];
  const trials = fitTrials(spec, ks);
  const noArt = trials.filter((t) => t.noArt);
  assert.equal(noArt.length, 2, 'mỗi trang 1 phép thử bỏ hình');
  assert.ok(fitProbe(spec, noArt).slides.every((s) => s.items.every((it) => !it.image)));
  assert.ok(spec.slides[0].items.every((it) => it.image), 'bài gốc giữ hình khi dựng bài thử');
  // Trang A: 1 kiểu giữ hình đạt 0,8 (vừa) dù bỏ hình đạt 1 → giữ hình. Trang B: kiểu giữ hình chỉ 0,7 → bỏ hình.
  const firstA = trials.findIndex((t) => t.slide === 0 && !t.noArt);
  const tks = trials.map((t, n) => (t.noArt ? 1 : t.slide === 0 && n === firstA ? 0.8 : 0.7));
  assert.deepEqual(applyFit(spec, ks, trials, tks), { changed: 2, dropped: 1 });
  assert.ok(spec.slides[0].items.every((it) => it.image));
  assert.ok(spec.slides[1].items.every((it) => !it.image));
});

test('tidyHeads: trang chưa có nhãn → nhãn gốc của tài liệu (tiền tố "Phần 3 ·" của tiêu đề, cụm IN HOA đầu phụ đề) làm nhãn', () => {
  const spec = { slides: [
    { layout: 'agenda', kicker: '', title: 'PHẦN 3 · PHÒNG TRÁNH', highlight: 'PHÒNG TRÁNH', subtitle: 'Làm sao để phòng tránh?' },
    { layout: 'cards', kicker: '', title: '5 ĐIỂM YẾU', subtitle: 'CÂU HỎI 3 · VÌ SAO SẬP BẪY? — Kẻ gian chỉ cần chạm đúng một điểm yếu' },
    { layout: 'cards', kicker: '', title: 'HÌNH THỨC 1', subtitle: 'CÂU HỎI 2 · HÌNH THỨC 1' },
    { layout: 'cards', kicker: '', title: 'MÔ HÌNH', subtitle: 'DỪNG — KIỂM CHỨNG — HÀNH ĐỘNG ĐÚNG' },
    { layout: 'cards', kicker: '', title: 'HÌNH THỨC 1: KẺ LỪA ĐẢO TÌM ĐẾN TA', subtitle: 'THAY ĐỔI CÁCH TIẾP CẬN' },
    { layout: 'cards', kicker: 'Có sẵn', title: 'PHẦN 2 · X', subtitle: 'NHÃN — phụ đề' },
    { layout: 'section', kicker: '', title: 'PHẦN 2 · CẬN CẢNH', subtitle: '' },
    { layout: 'agenda', kicker: 'Phần 3 · Định hướng', title: 'PHẦN 3 · PHÒNG TRÁNH', highlight: 'PHÒNG TRÁNH', subtitle: '' },
    { layout: 'agenda', kicker: 'Phần 4 · Kế hoạch', title: 'PHẦN 3 · PHÒNG TRÁNH', subtitle: '' },
  ] };
  tidyHeads(spec);
  const [a, b, c, d, e, f, g, h, i] = spec.slides;
  assert.deepEqual([h.kicker, h.title, h.highlight], ['Phần 3 · Định hướng', 'PHÒNG TRÁNH', 'PHÒNG TRÁNH'], 'tiền tố trùng nhãn → bỏ');
  assert.equal(i.title, 'PHẦN 3 · PHÒNG TRÁNH', 'khác số phần → giữ');
  assert.deepEqual([a.kicker, a.title, a.highlight], ['PHẦN 3', 'PHÒNG TRÁNH', 'PHÒNG TRÁNH']);
  assert.deepEqual([b.kicker, b.subtitle], ['CÂU HỎI 3 · VÌ SAO SẬP BẪY?', 'Kẻ gian chỉ cần chạm đúng một điểm yếu']);
  assert.deepEqual([c.kicker, c.subtitle], ['CÂU HỎI 2 · HÌNH THỨC 1', '']);
  assert.deepEqual([d.kicker, d.subtitle], ['', 'DỪNG — KIỂM CHỨNG — HÀNH ĐỘNG ĐÚNG'], 'phần sau cũng IN HOA → không phải nhãn');
  assert.deepEqual([e.kicker, e.title, e.subtitle], ['', 'HÌNH THỨC 1: KẺ LỪA ĐẢO TÌM ĐẾN TA', 'THAY ĐỔI CÁCH TIẾP CẬN'], '"Hình thức 1" là nội dung');
  assert.equal(f.kicker, 'Có sẵn');
  assert.equal(f.subtitle, 'NHÃN — phụ đề');
  assert.equal(g.kicker, '', 'trang mở đầu phần do tidySlide xử lý');
});
