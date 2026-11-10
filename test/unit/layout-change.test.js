// CT-006: đổi bố cục họ danh sách (items ↔ steps) không được cắt mất mục — vượt giới hạn thì chặn + nói rõ lý do; đổi qua lại giữ đủ từng mục.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../helpers/alias-loader.mjs', import.meta.url);
const { useEditor } = await import('../../frontend/src/composables/useEditor.js');
const { prepareSpecForSave, layoutBlockReason } = await import('../../frontend/src/lib/slideModel.js');
const { listBlock } = await import('../../shared/deck/variants.js');
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const clone = (x) => JSON.parse(JSON.stringify(x));
const item = (i) => ({ icon: 'sparkles', title: `Mục ${i}`, text: `Mô tả ${i}`, value: '' });
const idle = () => new Promise((r) => setTimeout(r, 450)); // lịch sử gộp thao tác trong 400 ms thành 1 bước
const titles = (list) => list.map((x) => x.title);

async function open(n, layout = 'bullets') {
  const db = { title: 'Bài thử', ratio: '16:9', specVersion: 1, spec: { title: 'Bài thử', slides: [{ id: 's1', layout, title: 'Trang 1', subtitle: '', items: Array.from({ length: n }, (_, i) => item(i + 1)) }] } };
  db.spec = prepareSpecForSave(db.spec);
  globalThis.__fakeApi = async (method) => {
    if (method === 'GET') return { data: { id: 'D1', status: 'ready', isOwner: true, canEdit: true, title: db.title, ratio: db.ratio, specVersion: db.specVersion, spec: clone(db.spec), assets: [] } };
    throw new Error(`chưa giả lập ${method}`);
  };
  const ed = useEditor('D1');
  await ed.load();
  return ed;
}

test('listBlock / layoutBlockReason: chỉ chặn khi số mục vượt giới hạn danh sách của bố cục đích', () => {
  const s = (n) => ({ layout: 'bullets', items: Array.from({ length: n }, (_, i) => item(i + 1)) });
  assert.equal(listBlock(s(10), 'process'), null);
  assert.deepEqual(listBlock(s(11), 'timeline'), { from: 'items', to: 'steps', count: 11, max: 10 });
  assert.equal(listBlock(s(12), 'cards'), null, 'cùng danh sách items → không chuyển, không cắt');
  assert.equal(listBlock(s(12), 'stats'), null, 'bố cục ngoài họ danh sách không thuộc phạm vi');
  assert.equal(listBlock({ ...s(12), steps: [item(1)] }, 'process'), null, 'danh sách đích đã có mục → không chuyển đè');
  assert.equal(layoutBlockReason(s(12), 'process'), 'Quy trình tối đa 10 bước — trang đang có 12 mục');
  assert.equal(layoutBlockReason(s(5), 'process'), '');
});

test('đổi Ý chính 12 mục → Quy trình/Dòng thời gian: chặn, bản nháp không đổi', async () => {
  const ed = await open(12);
  const before = clone(ed.draft.value.spec.slides[0]);
  assert.equal(ed.changeLayout('process'), false);
  assert.equal(ed.changeLayout('timeline'), false);
  assert.deepEqual(ed.draft.value.spec.slides[0], before, 'không đổi gì, không cắt, không xoá nguồn');
  assert.equal(ed.changeLayout('cards'), true, 'cùng họ items vẫn đổi được');
  assert.equal(ed.draft.value.spec.slides[0].items.length, 12);
});

test('đổi qua lại 10 mục: đủ từng mục theo nội dung, sửa sau khi đổi vẫn giữ; hoàn tác về bố cục cũ', async () => {
  const ed = await open(10);
  const s = () => ed.draft.value.spec.slides[0];
  const want = Array.from({ length: 10 }, (_, i) => `Mục ${i + 1}`);
  assert.equal(ed.changeLayout('process'), true);
  assert.deepEqual(titles(s().steps), want);
  assert.deepEqual(s().items, []);
  s().steps[9].title = 'Mục 10 đã sửa';
  assert.equal(ed.changeLayout('bullets'), true);
  assert.deepEqual(titles(s().items), [...want.slice(0, 9), 'Mục 10 đã sửa']);
  assert.deepEqual(s().steps, []);
  await idle();
  assert.equal(ed.changeLayout('timeline'), true);
  assert.equal(s().steps.length, 10);
  assert.equal(ed.undo(), true);
  assert.equal(s().layout, 'bullets', 'hoàn tác về bố cục trước');
  assert.deepEqual(titles(s().items), [...want.slice(0, 9), 'Mục 10 đã sửa'], 'mục còn đủ sau hoàn tác');
});

test('11 mục: Quy trình bị chặn; rút còn 10 thì đổi được', async () => {
  const ed = await open(11);
  const s = () => ed.draft.value.spec.slides[0];
  assert.equal(ed.changeLayout('process'), false);
  s().items.pop();
  assert.equal(ed.changeLayout('process'), true);
  assert.equal(s().steps.length, 10);
});
