// CT-007: ảnh đang tải lên không được chèn nhầm sang trang khác khi trang đích bị xoá/đổi thứ tự trong lúc chờ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { ref } from 'vue';

register('../helpers/alias-loader.mjs', import.meta.url);
const { useImageDrop } = await import('../../frontend/src/composables/useImageDrop.js');
globalThis.createImageBitmap = async () => ({ width: 400, height: 300, close() {} });
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const file = (n = 'a.png') => ({ name: n, type: 'image/png' });
function setup(n = 3) {
  const slides = Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, layout: 'bullets', title: `Trang ${i + 1}`, elements: [] }));
  const draft = ref({ spec: { slides } });
  const selected = ref(0);
  const toasts = [];
  const toast = { info: (m) => toasts.push(['info', m]), error: (m) => toasts.push(['error', m]), success: (m) => toasts.push(['success', m]) };
  let release;
  const gate = new Promise((r) => (release = r));
  let uploads = 0;
  const ed = { uploadImage: async () => { uploads += 1; await gate; return { id: `asset-${uploads}` }; } };
  const live = {
    addElement(el) {
      draft.value.spec.slides[selected.value].elements.push(el);
      return el;
    },
  };
  const drop = useImageDrop({ ed, live, draft, deck: ref({ ratio: '16:9' }), selected, toast });
  const inserted = () => draft.value.spec.slides.map((s) => [s.id, s.elements.length]);
  return { draft, selected, toasts, drop, release, inserted, uploads: () => uploads };
}

test('thả vào trang A, xoá A trong lúc tải → không trang nào nhận ảnh, báo rõ, không toast thành công', async () => {
  const t = setup();
  const p = t.drop.onDrop({ index: 0, files: [file()] });
  t.draft.value.spec.slides.splice(0, 1); // B lên chỉ số 0
  t.release();
  await p;
  assert.deepEqual(t.inserted(), [['s2', 0], ['s3', 0]]);
  assert.ok(t.toasts.some(([k, m]) => k === 'error' && /đã bị xoá/.test(m)));
  assert.ok(!t.toasts.some(([k]) => k === 'success'));
  assert.equal(t.drop.busy.value, false, 'nhả trạng thái bận');
});

test('đổi thứ tự trang trong lúc tải → ảnh vào đúng trang theo id, trang đang chọn nhảy theo', async () => {
  const t = setup();
  const p = t.drop.onDrop({ index: 0, files: [file()] });
  const [a] = t.draft.value.spec.slides.splice(0, 1);
  t.draft.value.spec.slides.push(a); // s1 xuống cuối
  t.release();
  await p;
  assert.deepEqual(t.inserted(), [['s2', 0], ['s3', 0], ['s1', 1]]);
  assert.equal(t.selected.value, 2);
  assert.ok(t.toasts.some(([k]) => k === 'success'));
});

test('thả nhiều ảnh, trang bị xoá giữa chừng → dừng, không tải thêm, báo số ảnh đã chèn', async () => {
  const t = setup();
  t.release(); // cho tải xong ngay
  const p = t.drop.onDrop({ index: 1, files: [file('1.png'), file('2.png'), file('3.png')] });
  await Promise.resolve();
  await p;
  assert.equal(t.inserted()[1][1], 3, 'trang còn nguyên → chèn đủ 3 ảnh');
  const t2 = setup();
  const p2 = t2.drop.onDrop({ index: 1, files: [file('1.png'), file('2.png')] });
  t2.draft.value.spec.slides.splice(1, 1);
  t2.release();
  await p2;
  assert.equal(t2.uploads(), 1, 'sau ảnh đầu thấy trang mất → không tải ảnh kế');
  assert.deepEqual(t2.inserted(), [['s1', 0], ['s3', 0]]);
});

test('thay ảnh trong ô: trang đích bị xoá, hoặc ô bị xoá trong lúc tải → không thay, không báo "Đã thay ảnh"', async () => {
  for (const mutate of ['xoá trang', 'xoá ô']) {
    const t = setup();
    t.draft.value.spec.slides[0].images = [{ asset: 'cu', caption: 'c' }];
    const p = t.drop.onDrop({ index: 0, files: [file()], path: 'images.0' });
    if (mutate === 'xoá trang') t.draft.value.spec.slides.splice(0, 1);
    else t.draft.value.spec.slides[0].images.splice(0, 1);
    t.release();
    await p;
    assert.ok(!t.toasts.some(([k, m]) => k === 'success' && /thay/.test(m)), mutate);
    assert.ok(t.toasts.some(([k]) => k === 'error'), mutate);
    if (mutate === 'xoá ô') assert.deepEqual(t.draft.value.spec.slides[0].images, [], 'không hồi sinh ô đã xoá');
  }
});

test('thay ảnh trong ô còn nguyên: đổi đúng ô, giữ chú thích', async () => {
  const t = setup();
  t.draft.value.spec.slides[0].images = [{ asset: 'cu', caption: 'Chú thích' }];
  const p = t.drop.onDrop({ index: 0, files: [file()], path: 'images.0' });
  t.release();
  await p;
  const img = t.draft.value.spec.slides[0].images[0];
  assert.equal(img.asset, 'asset-1');
  assert.equal(img.caption, 'Chú thích');
  assert.ok(t.toasts.some(([k, m]) => k === 'success' && /thay/.test(m)));
});
