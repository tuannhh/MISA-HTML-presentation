// Kiểm thử tinh chỉnh tay trên trang có bố cục (shared/deck/layers.js): dời vị trí ô chữ (slide.moves), tắt/xoá/thay hoạ tiết
// (slide.hide + phần tử chèn), đổi ảnh ↔ hình khối — chuẩn hoá server, renderer, thao tác từ khung xem trước (dữ liệu không tin cậy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml, deckParts } from '../../shared/deck/render.js';
import { cleanMoves, cleanHide, decorsFor, isMovePath, moveAttr, DECORS, MOVE_LIMIT } from '../../shared/deck/layers.js';
import { applyFrameMove, applyDeco, convertElement, shiftMoves, setDecorHidden } from '../../frontend/src/lib/editPaths.js';

const html = (spec, mode = 'present') => renderDeckHtml(spec, { ratio: '16:9', mode, assetUrl: () => null, css: '', engineJs: '' });

test('cleanMoves: chỉ nhận đường dẫn ô chữ của bố cục, kẹp ±100%, bỏ mục ≈0, tối đa MOVE_LIMIT', () => {
  const raw = {
    title: { x: 12.3456, y: -7 },
    'items.2.text': { x: 500, y: -500 },
    subtitle: { x: 0.01, y: 0 },
    '__proto__': { x: 5, y: 5 },
    'elements.e-a1.text': { x: 5, y: 5 },
    '@footer': { x: 5, y: 5 },
    'items.1.title': { x: 'a', y: 2 },
    'columns.1.points.3': { x: 1, y: 1 },
    'title<script>': { x: 1, y: 1 },
  };
  assert.deepEqual(cleanMoves(raw), { title: { x: 12.35, y: -7 }, 'items.2.text': { x: 100, y: -100 }, 'columns.1.points.3': { x: 1, y: 1 } });
  assert.equal(cleanMoves(null), null);
  assert.equal(cleanMoves([]), null);
  assert.equal(cleanMoves({ subtitle: { x: 0, y: 0 } }), null);
  const many = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`tags.${i % 60}`, { x: 1, y: 1 }]));
  assert.equal(Object.keys(cleanMoves(many)).length, MOVE_LIMIT);
  assert.ok(isMovePath('quote.text') && isMovePath('stats.3.label') && !isMovePath('elements.x.text') && !isMovePath('items.123.title'));
});

test('cleanHide + decorsFor: khoá hợp lệ theo thứ tự chuẩn; trang tự do chỉ có hoạ tiết nền', () => {
  assert.deepEqual(cleanHide(['qmark', 'glow', 'x', 'glow', 5]), ['glow', 'qmark']);
  assert.equal(cleanHide([]), null);
  assert.equal(cleanHide('glow'), null);
  assert.deepEqual(decorsFor('free'), ['glow', 'grid', 'bg']);
  assert.ok(decorsFor('cover').includes('art') && !decorsFor('cover').includes('qmark'));
  assert.ok(decorsFor('process').includes('arrows') && decorsFor('process').includes('nums'));
  for (const k of Object.keys(DECORS)) assert.ok(DECORS[k].label);
});

test('normalizeSpec: giữ moves/hide hợp lệ; trang tự do bỏ moves; mục sai bị bỏ không báo lỗi', () => {
  const { spec, errors } = normalizeSpec(
    {
      title: 'T',
      slides: [
        { layout: 'bullets', title: 'A', items: [{ title: 'x' }], moves: { title: { x: 5, y: 3 }, bad: { x: 1, y: 1 } }, hide: ['glow', 'nope', 'nums'] },
        { layout: 'free', title: 'B', elements: [], moves: { title: { x: 5, y: 3 } }, hide: ['grid'] },
        { layout: 'quote', title: 'C', quote: { text: 'q' } },
      ],
    },
    { strict: true },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(spec.slides[0].moves, { title: { x: 5, y: 3 } });
  assert.deepEqual(spec.slides[0].hide, ['glow', 'nums']);
  assert.equal(spec.slides[1].moves, undefined);
  assert.deepEqual(spec.slides[1].hide, ['grid']);
  assert.equal(spec.slides[2].moves, undefined);
  assert.equal(spec.slides[2].hide, undefined);
});

test('renderer: ô chữ đã dời có translate ở MỌI chế độ (px theo khung), hoạ tiết tắt → lớp x-*, chế độ sửa gắn data-dc', () => {
  const { spec } = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'section', title: 'Phần', moves: { title: { x: 10, y: -5 } }, hide: ['secno', 'glow'] },
      { layout: 'quote', title: '', quote: { text: 'Câu nói', author: 'Ai đó' }, moves: { 'quote.author': { x: -2.5, y: 50 } } },
      { layout: 'comparison', title: 'So sánh', columns: [{ title: 'A', points: ['a'] }, { title: 'B', points: ['b'] }] },
      { layout: 'cover', title: 'Bìa' },
    ],
  });
  const out = html(spec);
  // 16:9 = 2560×1440 → 10% = 256px, -5% = -72px; -2,5% = -64px, 50% = 720px.
  assert.match(out, /class="sec-t"[^>]*data-mv="256 -72" style="translate:256px -72px"/);
  assert.match(out, /<b data-mv="-64 720" style="translate:-64px 720px">Ai đó<\/b>/);
  assert.match(out, /class="slide L-section[^"]* x-glow x-secno"/);
  assert.ok(!/data-dc=/.test(out), 'bản trình chiếu không có thuộc tính sửa');
  assert.ok(!/data-mv="[^"]*"[^>]*data-e=/.test(out));
  const ed = deckParts(spec, { ratio: '16:9', mode: 'edit', assetUrl: () => null }).slides.join('');
  assert.match(ed, /class="sec-no"[^>]*data-dc="secno"/);
  assert.match(ed, /class="qt-mark"[^>]*data-dc="qmark"/);
  assert.match(ed, /class="vs"[^>]*data-dc="vs"/);
  assert.match(ed, /class="cv-art"[^>]*data-dc="art"/);
  assert.match(ed, /data-e="title" data-max="\d+" data-ml=""[^>]*data-mv="256 -72"/);
  // Khung 4:3 (1920×1440): % đổi theo bề rộng khung.
  assert.equal(moveAttr({ title: { x: 10, y: 10 } }, 'title', 1920, 1440), ' data-mv="192 144" style="translate:192px 144px"');
  assert.equal(moveAttr({ title: { x: 10, y: 10 } }, 'subtitle', 1920, 1440), '');
  // Cỡ chữ: zoom + translate chia cho hệ số (translate tính trong hệ toạ độ đã zoom).
  assert.equal(moveAttr({ title: { x: 10, y: 0, s: 2 } }, 'title', 1920, 1440), ' data-mv="192 0" data-fz="2" style="translate:96px 0px;zoom:2"');
  assert.equal(moveAttr({ title: { x: 0, y: 0, s: 1.3 } }, 'title', 1920, 1440), ' data-mv="0 0" data-fz="1.3" style="zoom:1.3"');
});

test('cỡ chữ: cleanMoves kẹp 0,5–3, mục chỉ đổi cỡ vẫn giữ; applyFrameMove giữ cỡ khi chỉ dời, xoá khi về gốc', () => {
  assert.deepEqual(cleanMoves({ title: { s: 9 }, subtitle: { x: 0, y: 0, s: 1 }, kicker: { x: 1, y: 0, s: 'x' }, caption: { s: 0.1 } }), { title: { x: 0, y: 0, s: 3 }, kicker: { x: 1, y: 0 }, caption: { x: 0, y: 0, s: 0.5 } });
  const spec = { slides: [{ layout: 'cards', items: [] }] };
  assert.equal(applyFrameMove(spec, 0, 'title', 0, 0, 1.2), true);
  assert.deepEqual(spec.slides[0].moves, { title: { x: 0, y: 0, s: 1.2 } });
  assert.equal(applyFrameMove(spec, 0, 'title', 5, 0), true, 'dời, không gửi cỡ → giữ cỡ');
  assert.deepEqual(spec.slides[0].moves.title, { x: 5, y: 0, s: 1.2 });
  assert.equal(applyFrameMove(spec, 0, 'title', 0, 0), true);
  assert.deepEqual(spec.slides[0].moves.title, { x: 0, y: 0, s: 1.2 }, 'về chỗ cũ nhưng còn cỡ → giữ');
  assert.equal(applyFrameMove(spec, 0, 'title', 0, 0, 1), true);
  assert.equal(spec.slides[0].moves, undefined);
  const { spec: n } = normalizeSpec({ title: 'T', slides: [{ layout: 'bullets', title: 'A', items: [{ title: 'x' }], moves: { title: { x: 0, y: 0, s: 1.5 } } }] });
  assert.match(html(n), /class="title"[^>]*data-fz="1\.5" style="zoom:1\.5"/);
});

test('applyFrameMove: chỉ đường dẫn cho phép, kẹp số, ≈0 = xoá; không quá giới hạn; trang tự do bỏ qua', () => {
  const spec = { slides: [{ layout: 'bullets', items: [{}, {}] }, { layout: 'free', elements: [] }] };
  assert.equal(applyFrameMove(spec, 0, 'title', 12.345, -400), true);
  assert.deepEqual(spec.slides[0].moves, { title: { x: 12.35, y: -100 } });
  assert.equal(applyFrameMove(spec, 0, 'title', 12.35, -100), false, 'không đổi');
  assert.equal(applyFrameMove(spec, 0, 'constructor', 1, 1), false);
  assert.equal(applyFrameMove(spec, 0, 'items.0.title', 'x', 1), false);
  assert.equal(applyFrameMove(spec, 0, 'items.0.title', NaN, 1), false);
  assert.equal(applyFrameMove(spec, 1, 'title', 5, 5), false, 'trang tự do');
  assert.equal(applyFrameMove(spec, 9, 'title', 5, 5), false);
  assert.equal(applyFrameMove(spec, 0, 'title', 0.01, 0), true);
  assert.equal(spec.slides[0].moves, undefined, 'về chỗ cũ → bỏ trường');
  for (let i = 0; i < MOVE_LIMIT; i += 1) applyFrameMove(spec, 0, `tags.${i}`, 1, 1);
  assert.equal(applyFrameMove(spec, 0, 'title', 1, 1), false, 'đủ giới hạn');
  assert.equal(applyFrameMove(spec, 0, 'tags.3', 2, 2), true, 'mục đã có vẫn sửa được');
});

test('shiftMoves: đổi chỗ / xoá mục → vị trí chữ đi theo mục', () => {
  const s = { moves: { 'items.0.title': { x: 1, y: 1 }, 'items.1.text': { x: 2, y: 2 }, 'items.2.title': { x: 3, y: 3 }, 'steps.0.title': { x: 9, y: 9 }, title: { x: 5, y: 5 } } };
  shiftMoves(s, 'items', { from: 0, to: 1 });
  assert.deepEqual(Object.keys(s.moves).sort(), ['items.0.text', 'items.1.title', 'items.2.title', 'steps.0.title', 'title']);
  shiftMoves(s, 'items', { remove: 1 });
  assert.deepEqual(s.moves, { 'items.0.text': { x: 2, y: 2 }, 'items.1.title': { x: 3, y: 3 }, 'steps.0.title': { x: 9, y: 9 }, title: { x: 5, y: 5 } });
  const one = { moves: { 'tags.0': { x: 1, y: 1 } } };
  shiftMoves(one, 'tags', { remove: 0 });
  assert.equal(one.moves, undefined);
});

test('applyDeco: xoá / thay bằng hình khối / thay bằng ảnh đúng hộp hoạ tiết; bìa thay ảnh = ô media; dữ liệu lạ bị bỏ', () => {
  const sec = { layout: 'section', title: 'P' };
  const r1 = applyDeco(sec, 'secno', 'shape', { x: 5, y: 20, w: 25, h: 40 });
  assert.equal(r1.changed, true);
  assert.deepEqual(sec.hide, ['secno']);
  assert.equal(sec.elements[0].type, 'shape');
  assert.deepEqual([sec.elements[0].x, sec.elements[0].y, sec.elements[0].w, sec.elements[0].h], [5, 20, 25, 40]);
  const q = { layout: 'quote' };
  const r2 = applyDeco(q, 'qmark', 'image', { x: 999, y: 'a', w: 0.1, h: 30 }, { ratio: 16 / 9 });
  assert.equal(q.elements[0].type, 'image');
  assert.deepEqual([q.elements[0].x, q.elements[0].y, q.elements[0].w], [100, 30, 2]);
  assert.equal(r2.media.path, `elements.${q.elements[0].id}`);
  const cover = { layout: 'cover' };
  const r3 = applyDeco(cover, 'art', 'image', { x: 50, y: 10, w: 40, h: 70 });
  assert.deepEqual(r3, { changed: false, media: { path: 'slot', kind: 'image', aspect: 1 } });
  assert.equal(cover.hide, undefined);
  assert.equal(applyDeco(cover, 'art', 'hide').changed, true);
  assert.deepEqual(cover.hide, ['art']);
  assert.equal(applyDeco(cover, 'glow', 'hide').changed, false, 'hoạ tiết nền không bấm chọn được');
  assert.equal(applyDeco(cover, 'art', 'run').changed, false);
  assert.equal(applyDeco({ layout: 'free' }, 'art', 'hide').changed, false);
  const full = { layout: 'section', elements: Array.from({ length: 30 }, (_, i) => ({ id: `e-${i}` })) };
  const r4 = applyDeco(full, 'secno', 'shape', {});
  assert.equal(r4.full, true);
  assert.equal(full.elements.length, 30);
  assert.deepEqual(full.hide, ['secno']);
  // Spec sau thao tác vẫn hợp lệ phía server.
  const { errors } = normalizeSpec({ title: 'T', slides: [sec, q] }, { strict: true });
  assert.deepEqual(errors, []);
  assert.equal(setDecorHidden(sec, 'secno', false), true);
  assert.equal(sec.hide, undefined);
});

test('convertElement: ảnh ↔ hình khối giữ id, vị trí, kích thước, hiện khi bấm; loại khác không đổi', () => {
  const s = { elements: [{ id: 'e-1', type: 'image', x: 1, y: 2, w: 3, h: 4, radius: 'circle', image: { asset: null }, step: true }, { id: 'e-2', type: 'text', text: 'a' }] };
  const sh = convertElement(s, 'e-1', 'shape');
  assert.deepEqual([sh.id, sh.type, sh.x, sh.y, sh.w, sh.h, sh.shape, sh.step], ['e-1', 'shape', 1, 2, 3, 4, 'circle', true]);
  assert.equal(s.elements[0], sh);
  const im = convertElement(s, 'e-1', 'image');
  assert.deepEqual([im.type, im.radius, im.image], ['image', 'circle', null]);
  assert.equal(convertElement(s, 'e-2', 'shape'), null);
  assert.equal(convertElement(s, 'e-9', 'shape'), null);
  assert.equal(convertElement(s, 'e-1', 'video'), null);
});

test('fixture mẫu: moves/hide đi suốt normalizeSpec → HTML (trang mục ẩn số, trang thẻ dời + phóng tiêu đề)', async () => {
  const { readFileSync } = await import('node:fs');
  const sample = JSON.parse(readFileSync(new URL('../fixtures/sample-spec.json', import.meta.url), 'utf8'));
  const { spec, errors } = normalizeSpec(sample, { mode: 'strict' });
  assert.deepEqual(errors, []);
  assert.deepEqual(spec.slides[2].hide, ['secno']);
  assert.equal(spec.slides[4].moves.title.s, 1.2);
  const html = renderDeckHtml(spec, {}); // khung 2560×1440: 4% = 102px, translate chia cho zoom 1,2 → 85px
  assert.match(html, /class="slide L-section[^"]*x-secno/);
  assert.match(html, /data-mv="102 0" data-fz="1\.2" style="translate:85px 0px;zoom:1\.2"/);
  assert.match(html, /data-mv="0 -43"/);
});
