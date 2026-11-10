// Đợt 5 (mục 8 + 11): kiểu trình bày mới người dùng chọn (danh sách, số liệu, trích dẫn), số cột, ảnh nhấn, hộp chú thích,
// chuyển trang — điều kiện hợp nội dung, AI không tự chọn kiểu "chỉ người dùng chọn", làm sạch spec, renderer, sửa chữ trên khung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, MANUAL_VARIANTS, COLS_VARIANTS, LIST_LAYOUTS, LIST_KEY, fits, artDirect, userCols } from '../../shared/deck/variants.js';
import { accentPos, ACCENT_LAYOUTS, TRANSITIONS, cleanTransition } from '../../shared/deck/blocks.js';
import { renderDeck } from '../../src/services/renderService.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { applyFrameEdit } from '../../frontend/src/lib/editPaths.js';

const it = (title, text = '', value = '') => ({ icon: 'sparkles', title, text, value });
const items = (n, value = false) => Array.from({ length: n }, (_, i) => it(`Mục ${i + 1}`, `Mô tả ${i + 1}`, value ? `Nhãn ${i + 1}` : ''));
const IMG = '11111111-1111-4111-8111-111111111111';
const html = (slides, extra = {}) => {
  const { spec, errors } = normalizeSpec({ title: 'Thử', ...extra, slides });
  assert.deepEqual(errors, []);
  return renderDeck(spec, { ratio: '16:9', assetUrl: (id) => (id === IMG ? '/a.png' : null) });
};

test('kiểu mới có trong danh mục, đều là kiểu "chỉ người dùng chọn"; số cột chỉ áp kiểu dạng lưới', () => {
  const add = { bullets: ['big'], cards: ['solid', 'outline', 'labeled', 'alternate', 'arrows'], stats: ['progress', 'stars'], timeline: ['minimal', 'pills', 'arrows'], process: ['pyramid', 'funnel'], quote: ['bubble'] };
  for (const [l, vs] of Object.entries(add)) for (const v of vs) {
    assert.ok(VARIANTS[l].includes(v), `${l}:${v}`);
    assert.ok(MANUAL_VARIANTS.has(`${l}:${v}`), `${l}:${v} manual`);
  }
  for (const k of MANUAL_VARIANTS) {
    const [l, v] = k.split(':');
    assert.ok(VARIANTS[l].includes(v), k);
  }
  for (const [l, vs] of Object.entries(COLS_VARIANTS)) for (const v of vs) assert.ok(VARIANTS[l].includes(v), `${l}:${v}`);
  assert.deepEqual(LIST_LAYOUTS.map((l) => LIST_KEY[l]), ['items', 'items', 'items', 'steps', 'steps']);
});

test('điều kiện hợp nội dung của kiểu mới', () => {
  const st = (...v) => v.map((x) => ({ value: x, suffix: '%', label: 'x' }));
  assert.equal(fits('cards', 'labeled', { items: items(3) }), false, 'thiếu nhãn');
  assert.equal(fits('cards', 'labeled', { items: items(3, true) }), true);
  assert.equal(fits('cards', 'alternate', { items: items(5) }), false);
  assert.equal(fits('cards', 'arrows', { items: items(5) }, 16 / 9), true);
  assert.equal(fits('cards', 'arrows', { items: items(5) }, 4 / 3), false);
  assert.equal(fits('bullets', 'big', { items: items(3), image: { asset: IMG } }), false, 'có ảnh');
  assert.equal(fits('stats', 'progress', { stats: st(62, 100, 0) }), true);
  assert.equal(fits('stats', 'progress', { stats: st(62, 140) }), false, 'quá 100%');
  assert.equal(fits('stats', 'progress', { stats: [{ value: 5, suffix: 'x' }] }), false, 'không phải %');
  assert.equal(fits('stats', 'stars', { stats: [{ value: 4.5, suffix: '/5' }, { value: 3, suffix: '' }] }), true);
  assert.equal(fits('stats', 'stars', { stats: [{ value: 7, suffix: '' }] }), false);
  assert.equal(fits('process', 'pyramid', { steps: items(2) }), false);
  assert.equal(fits('process', 'funnel', { steps: items(6) }), true);
  assert.equal(fits('timeline', 'pills', { steps: items(6) }, 4 / 3), false);
  assert.equal(fits('quote', 'bubble', { image: { asset: IMG } }), false);
});

test('chỉ đạo nghệ thuật (AI dựng bài) không bao giờ chọn kiểu chỉ người dùng chọn', () => {
  const slides = [
    { layout: 'bullets', items: items(3) },
    { layout: 'cards', items: items(4, true) },
    { layout: 'stats', stats: [{ value: 4.5, suffix: '/5', label: 'a' }, { value: 4, suffix: '/5', label: 'b' }] },
    { layout: 'stats', stats: [{ value: 40, suffix: '%', label: 'a' }, { value: 80, suffix: '%', label: 'b' }] },
    { layout: 'timeline', steps: items(4) },
    { layout: 'process', steps: items(4) },
    { layout: 'quote', quote: { text: 'Câu nói' } },
  ];
  for (let seed = 1; seed <= 300; seed += 1) {
    const { spec } = normalizeSpec({ slides: JSON.parse(JSON.stringify(slides)) });
    artDirect(spec, { seed });
    for (const s of spec.slides) assert.ok(!MANUAL_VARIANTS.has(`${s.layout}:${s.variant}`), `seed ${seed} ${s.layout}:${s.variant}`);
  }
});

test('userCols: 2–6, chỉ kiểu dạng lưới, không vượt số mục', () => {
  assert.equal(userCols({ layout: 'cards', cols: 3 }, 'grid', 6), 3);
  assert.equal(userCols({ layout: 'cards', cols: 6 }, 'grid', 4), 4);
  assert.equal(userCols({ layout: 'cards', cols: 3 }, 'bento', 6), null);
  assert.equal(userCols({ layout: 'cards', cols: 7 }, 'grid', 8), null);
  assert.equal(userCols({ layout: 'cards', cols: 1 }, 'grid', 8), null);
  assert.equal(userCols({ layout: 'timeline', cols: 3 }, 'line', 8), null);
});

test('normalizeSpec: giữ số cột / ảnh nhấn / hộp chú thích / chuyển trang hợp lệ, bỏ giá trị lạ', () => {
  const { spec } = normalizeSpec({
    transition: 'push',
    slides: [
      { layout: 'cards', items: items(4), cols: 3, accent: 'left', callout: { tone: 'warn', text: 'Lưu ý' }, transition: 'fade' },
      { layout: 'cards', items: items(4), cols: '9', accent: 'middle', callout: { tone: 'boom', text: 'x' }, transition: 'spin' },
    ],
  });
  assert.equal(spec.transition, 'push');
  const [a, b] = spec.slides;
  assert.equal(a.cols, 3);
  assert.equal(a.accent, 'left');
  assert.deepEqual(a.callout, { tone: 'warn', text: 'Lưu ý' });
  assert.equal(a.transition, 'fade', 'trang được đặt riêng "mờ dần" dù cả bài là "đẩy"');
  for (const k of ['cols', 'accent', 'callout', 'transition']) assert.equal(b[k], undefined, k);
  assert.equal(normalizeSpec({ transition: 'fade', slides: [{ layout: 'bullets', items: items(2) }] }).spec.transition, undefined, 'mặc định không lưu');
  assert.equal(cleanTransition('none', true), 'none');
  assert.equal(cleanTransition('fade', true), '');
  assert.equal(cleanTransition('fade'), 'fade');
  assert.deepEqual(TRANSITIONS, ['fade', 'push', 'zoom', 'flip', 'curtain', 'none']);
});

test('renderer: mỗi kiểu mới vẽ đúng khối; số cột người dùng chọn', () => {
  const out = html([
    { layout: 'bullets', title: 'a', items: items(3), variant: 'big' },
    { layout: 'cards', title: 'b', items: items(4, true), variant: 'labeled' },
    { layout: 'cards', title: 'c', items: items(3), variant: 'arrows' },
    { layout: 'cards', title: 'd', items: items(3), variant: 'alternate' },
    { layout: 'cards', title: 'e', items: items(4), variant: 'solid', cols: 2 },
    { layout: 'stats', title: 'f', stats: [{ value: 62, suffix: '%', label: 'x' }], variant: 'progress' },
    { layout: 'stats', title: 'g', stats: [{ value: 4.5, suffix: '/5', label: 'x' }], variant: 'stars' },
    { layout: 'timeline', title: 'h', steps: items(3), variant: 'pills' },
    { layout: 'timeline', title: 'i', steps: items(3), variant: 'minimal' },
    { layout: 'timeline', title: 'j', steps: items(3), variant: 'arrows' },
    { layout: 'process', title: 'k', steps: items(4), variant: 'pyramid' },
    { layout: 'process', title: 'l', steps: items(4), variant: 'funnel' },
    { layout: 'quote', title: 'm', quote: { text: 'Câu nói', author: 'An' }, variant: 'bubble' },
  ]);
  for (const cls of ['V-big', 'class="bbig"', 'class="lab"', 'class="arw"', 'data-a="draw"', 'class="alt"', 'cards k-solid" style="--cols:2"', 'st-prog', 'stars-fg', 'data-to="90"', 'tpill', 'tmin', 'tarw', 'tier pyramid', 'tier funnel', 'clip-path:polygon(', 'class="qb"']) {
    assert.ok(out.includes(cls), cls);
  }
  // Mũi tên nối: n−1 mũi tên cho n hộp.
  assert.equal((out.match(/class="arw-a"/g) || []).length, 2);
});

test('renderer: ảnh nhấn trái/phải/trên/nền; bố cục không hỗ trợ hoặc có video thì bỏ qua', () => {
  const base = { layout: 'cards', title: 'Thẻ', items: items(3), image: { asset: IMG, alt: 'Ảnh', pos: { x: 20, y: 70 } } };
  for (const pos of ['left', 'right', 'top']) {
    const out = html([{ ...base, accent: pos }]);
    assert.ok(out.includes(` A-${pos}`), pos);
    assert.ok(out.includes(`class="acc acc-${pos}"`), pos);
    assert.ok(out.includes('object-position:20% 70%'), 'điểm lấy nét');
  }
  const bg = html([{ ...base, accent: 'bg' }]);
  assert.ok(bg.includes(' A-bg') && bg.includes('class="bleed"'));
  // Ảnh nhấn trái → vùng nội dung hẹp → 3 thẻ chia 2 cột (khung đủ rộng là 3 cột).
  // 3 thẻ / 2 cột → hàng cuối lẻ 1 thẻ → căn giữa (lớp ctr, thẻ cuối bắt đầu ở rãnh 2 của lưới 4 rãnh).
  const left = html([{ ...base, accent: 'left' }]);
  assert.ok(left.includes('class="cards ctr" style="--cols:2"'));
  assert.ok(left.includes('grid-column:2 / span 2'));
  assert.ok(html([base]).includes('class="cards" style="--cols:3"'));
  assert.equal(accentPos({ ...base, layout: 'gallery', accent: 'left' }), '');
  assert.equal(accentPos({ ...base, accent: 'left', image: null }), '');
  assert.equal(accentPos({ ...base, accent: 'left', video: { provider: 'youtube', id: 'abcdefghijk' } }), '', 'trang có video');
  assert.ok(ACCENT_LAYOUTS.includes('bullets'));
  // Ý chính: ảnh nhấn thay ô ảnh chia đôi.
  const bl = html([{ layout: 'bullets', title: 'Ý', items: items(3), image: { asset: IMG }, accent: 'right' }]);
  assert.ok(bl.includes('A-right') && !bl.includes('class="split"'));
});

test('renderer: hộp chú thích (escape chữ) + chuyển trang trên #deck và từng trang', () => {
  const out = html(
    [
      { layout: 'bullets', title: 'a', items: items(2), callout: { tone: 'ok', text: 'Đạt <script>x</script>' }, transition: 'flip' },
      { layout: 'cover', title: 'b', callout: { tone: 'note', text: 'Không hiện ở trang bìa' } },
    ],
    { transition: 'curtain' },
  );
  assert.ok(out.includes('class="callout co-ok"'));
  assert.ok(!out.includes('<script>x</script>'));
  assert.ok(!out.includes('Không hiện ở trang bìa'));
  assert.ok(out.includes('data-tr="curtain"'), 'mặc định cả bài');
  assert.ok(/<section class="slide L-bullets[^"]*"[^>]*data-tr="flip"/.test(out), 'riêng trang');
  assert.ok(html([{ layout: 'bullets', title: 'a', items: items(2) }]).includes('data-tr="fade"'));
});

test('sửa chữ trên khung: callout.text (cắt theo giới hạn, bỏ ký tự điều khiển); không tạo hộp khi trang chưa có', () => {
  const spec = { slides: [{ layout: 'bullets', callout: { tone: 'note', text: '' } }, { layout: 'bullets' }] };
  assert.equal(applyFrameEdit(spec, 0, 'callout.text', 'Ghi\u0007 chú'), true);
  assert.equal(spec.slides[0].callout.text, 'Ghi chú');
  assert.equal(applyFrameEdit(spec, 0, 'callout.text', 'x'.repeat(900)), true);
  assert.equal(spec.slides[0].callout.text.length, 300);
  assert.equal(applyFrameEdit(spec, 1, 'callout.text', 'y'), false);
  assert.equal(spec.slides[1].callout, undefined);
  assert.equal(applyFrameEdit(spec, 0, 'callout.tone', 'warn'), false);
});
