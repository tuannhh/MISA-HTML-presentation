// Kiểm thử kiểu khung ảnh (bo góc, đổ bóng, viền) + lớp phủ màu (shared/deck/imgstyle.js): làm sạch dữ liệu không tin cậy,
// CSS sinh ra, chuẩn hoá server, renderer; ô ảnh chèn khi kéo-thả (frontend/src/lib/dropRect.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';
import { cleanImgLook, cleanColor, lookCss, overlayCss, overlayHtml, pickLook } from '../../shared/deck/imgstyle.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const html = (spec) => renderDeckHtml(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}`, css: '', engineJs: '' });

test('cleanColor: chỉ nhận token bảng màu hoặc #rrggbb', () => {
  assert.equal(cleanColor('accent'), 'accent');
  assert.equal(cleanColor('#AABBCC'), '#aabbcc');
  for (const bad of ['red', '#abc', 'var(--x)', '#aabbcc;x:1', '__proto__', 'toString', null, 5]) assert.equal(cleanColor(bad), null, String(bad));
});

test('cleanImgLook: giữ khoá hợp lệ, kẹp số, bỏ rác', () => {
  assert.deepEqual(cleanImgLook({ radius: 'lg', shadow: 'md', border: { color: 'accent-2', w: 99 }, overlay: { kind: 'fade', color: '#112233', opacity: 200 } }), {
    radius: 'lg', shadow: 'md', border: { color: 'accent-2', w: 16 }, overlay: { kind: 'fade', color: '#112233', opacity: 95 },
  });
  assert.deepEqual(cleanImgLook({ radius: 'huge', shadow: '0 0 9px red', border: { color: 'url(x)', w: 3 }, overlay: { kind: 'blur' } }), {});
  assert.deepEqual(cleanImgLook({ border: 'none', overlay: { kind: 'flat', color: 'evil', opacity: 'x' } }), { border: 'none', overlay: { kind: 'flat', color: 'dark', opacity: 45 } });
  assert.deepEqual(cleanImgLook(null), {});
});

test('lookCss / overlayCss: CSS đúng, không có giá trị lạ lọt vào', () => {
  assert.equal(lookCss({}), '');
  assert.equal(lookCss({ radius: 'circle', shadow: 'none', border: 'none' }), 'border-radius:50%;box-shadow:none;border:0;');
  assert.equal(lookCss({ border: { color: 'accent', w: 4 } }), 'border:4px solid var(--accent);');
  assert.match(overlayCss({ kind: 'flat', color: 'white', opacity: 30 }), /^background:color-mix\(in srgb, #FFFFFF 30%, transparent\);$/);
  assert.match(overlayCss({ kind: 'fade', color: 'accent', opacity: 60 }), /linear-gradient\(to top, color-mix\(in srgb, var\(--accent\) 60%/);
  assert.match(overlayCss({ kind: 'frosted', color: 'dark', opacity: 50 }), /backdrop-filter:blur\(14px\)/);
  assert.equal(overlayCss({ kind: 'nope' }), '');
  assert.equal(overlayHtml({}), '');
  assert.match(overlayHtml({ overlay: { kind: 'flat', color: 'dark', opacity: 40 } }), /^<i class="ovl" aria-hidden="true" style="background:/);
});

test('pickLook: chép đủ 4 trường kiểu khi thay ảnh khác vào cùng khung', () => {
  const ref = { asset: A, caption: 'c', radius: 'sm', shadow: 'lg', border: 'none', overlay: { kind: 'flat', color: 'dark', opacity: 40 }, pos: { x: 1, y: 2 } };
  assert.deepEqual(pickLook(ref), { radius: 'sm', shadow: 'lg', border: 'none', overlay: { kind: 'flat', color: 'dark', opacity: 40 } });
  assert.deepEqual(pickLook(null), {});
});

test('normalizeSpec + renderer: kiểu ảnh lưu trên ô ảnh, ảnh bộ sưu tập, ảnh tự do; dữ liệu độc bị bỏ', () => {
  const look = { radius: 'lg', shadow: 'sm', border: { color: '#ff0000', w: 6 }, overlay: { kind: 'fade', color: 'accent', opacity: 70 } };
  const { spec } = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'image', title: 'Ảnh', image: { asset: A, ...look, evil: '"><script>' } },
      { layout: 'gallery', title: 'Bộ', images: [{ asset: A, radius: 'circle' }, { asset: B, overlay: { kind: 'flat', color: 'dark', opacity: 20 } }, { asset: A }] },
      { layout: 'free', title: 'Tự do', elements: [{ id: 'e-abc12', type: 'image', x: 10, y: 10, w: 30, h: 30, radius: 'md', image: { asset: B, radius: 'none', border: { color: 'x;}', w: 2 }, overlay: { kind: 'frosted', color: 'white', opacity: 50 } } }] },
    ],
  });
  const img0 = spec.slides[0].image;
  assert.equal(img0.radius, 'lg');
  assert.deepEqual(img0.border, { color: '#ff0000', w: 6 });
  assert.deepEqual(img0.overlay, { kind: 'fade', color: 'accent', opacity: 70 });
  assert.equal(img0.evil, undefined);
  const fimg = spec.slides[2].elements[0].image;
  assert.equal(fimg.radius, 'none');
  assert.equal(fimg.border, undefined, 'màu viền rác → bỏ viền');

  const out = html(spec);
  assert.match(out, /border-radius:64px;box-shadow:0 6px 18px[^;]*;border:6px solid #ff0000;/);
  assert.match(out, /class="ovl"[^>]*linear-gradient\(to top, color-mix\(in srgb, var\(--accent\) 70%/);
  assert.match(out, /border-radius:50%/, 'ảnh bộ sưu tập tròn');
  assert.match(out, /class="ovl"[^>]*backdrop-filter/, 'lớp phủ kính mờ ảnh tự do');
  assert.equal((out.match(/class="ovl"/g) || []).length, 3);
  assert.doesNotMatch(out, /"><script>|x;\}/);
});

test('dropRect: ô ảnh chèn giữ tỷ lệ ảnh, tâm tại điểm thả, nằm trọn trong trang', async () => {
  const { dropRect } = await import('../../frontend/src/lib/dropRect.js');
  const r = dropRect(50, 50, 4 / 3, 16 / 9);
  assert.equal(r.w, 30);
  assert.equal(r.h, 40);
  assert.deepEqual([r.x, r.y], [35, 30]);
  const tall = dropRect(98, 2, 9 / 16, 16 / 9); // ảnh dọc ở góc trên phải → kẹp chiều cao 70%, đẩy vào trong trang
  assert.equal(tall.h, 70);
  assert.ok(tall.x + tall.w <= 100 && tall.y === 0);
});
