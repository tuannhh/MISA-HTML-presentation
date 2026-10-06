// Trình chiếu từng ý (slide.build, phần tử step), phóng to khi bấm, nền 3D + logo 3D (three.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { normalizeSpec, collectAssetIds, dropForeignAssets } from '../../src/services/specService.js';
import { renderDeck } from '../../src/services/renderService.js';
import { renderDeckHtml, BACKGROUNDS, BUILDS } from '../../shared/deck/render.js';
import { NAMES_3D, FALLBACK_2D, LOGO_MOTIONS, uses3d } from '../../shared/deck/bg3d.js';
import { FREE_TYPES, newElement } from '../../shared/deck/free.js';
import * as Deck3D from '../../shared/deck/deck3d.js';
import '../../shared/deck/backgrounds.js';

const sample = JSON.parse(readFileSync(new URL('../fixtures/sample-spec.json', import.meta.url), 'utf8'));
const engineSrc = readFileSync(new URL('../../shared/deck/engine.js', import.meta.url), 'utf8');
const render = (spec, mode = 'present') => renderDeckHtml(spec, { ratio: '16:9', mode, assetUrl: (id) => `/a/${id}` });

test('build: chỉ nhận step/dim/tour (auto = không lưu), giữ qua lưu nghiêm ngặt', () => {
  const raw = { ...sample, slides: sample.slides.slice(0, 5).map((s, i) => ({ ...s, build: ['step', 'dim', 'tour', 'auto', '<x>'][i] })) };
  const { spec, errors } = normalizeSpec(raw, { strict: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(spec.slides.map((s) => s.build), ['step', 'dim', 'tour', undefined, undefined]);
  assert.deepEqual(BUILDS, ['step', 'dim', 'tour']);
});

test('renderer: data-build trên slide, data-step trên phần tử bật "Hiện khi bấm"', () => {
  const { spec } = normalizeSpec({
    ...sample,
    slides: [
      { ...sample.slides[4], build: 'dim' },
      { layout: 'free', title: 'Tự do', elements: [{ type: 'text', text: 'A', step: true }, { type: 'text', text: 'B', step: 'yes' }, { type: 'shape' }] },
    ],
  });
  assert.equal(spec.slides[1].elements[0].step, true);
  assert.equal('step' in spec.slides[1].elements[1], false, 'chỉ true mới bật');
  const html = render(spec);
  assert.match(html, /<section class="slide L-cards[^"]*"[^>]* data-build="dim"/);
  assert.equal((html.match(/ data-step(?=[ >])/g) || []).length, 1);
  // Giá trị lạ (kể cả chèn HTML) không bao giờ ra thuộc tính.
  assert.doesNotMatch(render({ ...spec, slides: [{ ...spec.slides[0], build: '"><b>x' }] }), /data-build|<b>x/);
});

test('engine: bộ chọn "ý" phủ đơn vị nội dung của mọi bố cục có danh sách', () => {
  const sel = /var UNIT = '([^']+)'/.exec(engineSrc)[1].split(',');
  const cls = sel.map((x) => /\.([a-z0-9-]+)$/i.exec(x.split('>').pop())[1]);
  const { spec } = normalizeSpec(sample, { strict: true });
  const byLayout = {};
  for (const s of spec.slides) byLayout[s.layout] = render({ ...spec, slides: [s] });
  for (const layout of ['agenda', 'bullets', 'cards', 'stats', 'timeline', 'process', 'comparison', 'image']) {
    assert.ok(byLayout[layout], `mẫu có bố cục ${layout}`);
    assert.ok(cls.some((c) => new RegExp(`class="[^"]*\\b${c}\\b`).test(byLayout[layout])), `${layout}: có đơn vị khớp UNIT`);
  }
  // Phóng to: không áp video (bấm video để phát).
  assert.match(/var ZOOM = '([^']+)'/.exec(engineSrc)[1], /figure\.media:not\(\.vid\)/);
});

test('nền 3D: tên hợp lệ, dự phòng 2D tồn tại, engine giữ bản sao FALLBACK_2D khớp', () => {
  for (const n of NAMES_3D) {
    assert.ok(BACKGROUNDS.includes(n));
    assert.ok(globalThis.DeckBg.NAMES.includes(FALLBACK_2D[n]), `${n} → ${FALLBACK_2D[n]}`);
  }
  const copy = /var FALLBACK_2D = (\{[^}]+\})/.exec(engineSrc)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"');
  assert.deepEqual(JSON.parse(copy), { ...FALLBACK_2D });
  assert.deepEqual(Deck3D.NAMES_3D, NAMES_3D);
  assert.equal(typeof Deck3D.createBg3D, 'function');
  assert.equal(typeof Deck3D.createLogo3D, 'function');
  // Không có DOM/WebGL → trả null (engine lùi về 2D), không ném lỗi.
  assert.equal(Deck3D.createBg3D({}, { name: 'khong-co', width: 10, height: 10 }), null);
  const { spec } = normalizeSpec({ ...sample, background: 'galaxy3d' }, { strict: true });
  assert.equal(spec.background, 'galaxy3d');
  assert.match(render(spec), /data-bg="galaxy3d"/);
});

test('logo3d: chuẩn hoá chuyển động/độ dày/ảnh, dựng ảnh dự phòng có crossorigin, asset được kiểm', () => {
  assert.ok(FREE_TYPES.includes('logo3d'));
  const n = newElement('logo3d');
  assert.equal(n.motion, 'swing');
  assert.equal(n.depth, 0.5);
  const asset = randomUUID();
  const { spec, errors } = normalizeSpec({
    ...sample,
    slides: [
      { layout: 'free', title: 'L', elements: [
        { type: 'logo3d', image: { asset, alt: 'Logo "A"' }, motion: 'turn', depth: 3, x: 10, y: 10, w: 30, h: 40 },
        { type: 'logo3d', image: null, motion: '<bad>', depth: 'x' },
      ] },
    ],
  }, { strict: true });
  assert.deepEqual(errors, []);
  const [a, b] = spec.slides[0].elements;
  assert.equal(a.motion, 'turn');
  assert.equal(a.depth, 1, 'kẹp 0,1–1');
  assert.equal(b.motion, 'swing');
  assert.equal(b.depth, 0.5);
  assert.deepEqual(Object.keys(LOGO_MOTIONS), ['swing', 'float', 'turn']);
  assert.ok(collectAssetIds(spec).has(asset));
  const html = render(spec);
  assert.match(html, /class="fe fe-logo3d mv-turn" data-el="[^"]+" style="[^"]+" data-a="up"[^>]* data-motion="turn" data-depth="1"/);
  assert.match(html, new RegExp(`<img src="/a/${asset}" alt="Logo &quot;A&quot;" crossorigin="anonymous">`));
  // Asset không thuộc bài → bị gỡ như ảnh thường.
  const dropped = JSON.parse(JSON.stringify(spec));
  dropForeignAssets(dropped, new Set());
  assert.equal(dropped.slides[0].elements[0].image.asset, null);
  assert.equal(uses3d(spec), true);
  assert.equal(uses3d(normalizeSpec(sample).spec), false);
});

test('renderService: gói 3D chỉ nhúng inline khi bài dùng 3D; khung soạn thảo tải qua URL', { skip: !existsSync(new URL('../../dist/deck-runtime/deck3d.js', import.meta.url)) && 'chưa build gói 3D (npm run build)' }, () => {
  const { spec } = normalizeSpec(sample);
  const plain = renderDeck(spec, { ratio: '16:9', mode: 'present', embedFont: true, assetUrl: () => null });
  assert.doesNotMatch(plain, /globalThis\.Deck3D=/);
  const d3 = renderDeck({ ...spec, background: 'city3d' }, { ratio: '16:9', mode: 'present', embedFont: true, assetUrl: () => null });
  assert.match(d3, /globalThis\.Deck3D=/);
  assert.doesNotMatch(d3, /<script[^>]* src=/);
  const edit = renderDeck(spec, { ratio: '16:9', mode: 'edit', nonce: 'abc', assetUrl: () => null });
  assert.match(edit, /<script nonce="abc" src="\/deck-assets\/deck3d\.js\?v=[0-9a-f]{12}"><\/script>/);
  const view = renderDeck(spec, { ratio: '16:9', mode: 'present', nonce: 'abc', assetUrl: () => null });
  assert.doesNotMatch(view, /deck3d\.js/);
  // Gói nằm TRƯỚC engine (engine đọc window.Deck3D lúc khởi động).
  assert.ok(d3.indexOf('globalThis.Deck3D=') < d3.indexOf('MISA Presentation — engine'));
});
