// Hoàn tác / làm lại trình soạn thảo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z): không giới hạn bước, thay đổi mới bỏ nhánh làm lại,
// trang không đổi giữ nguyên đối tượng, quay về bản gốc → hết "chưa lưu", lưu xong vẫn hoàn tác được, gõ liên tục gộp 1 bước.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../helpers/alias-loader.mjs', import.meta.url);
const { createEditHistory, historyKey, isTextField } = await import('../../frontend/src/lib/editHistory.js');
const { useEditor } = await import('../../frontend/src/composables/useEditor.js');
const { prepareSpecForSave } = await import('../../frontend/src/lib/slideModel.js');
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const clone = (x) => JSON.parse(JSON.stringify(x));
const deck = (n = 3) => ({ title: 'Bài', spec: { title: 'Bài', theme: 'aurora', slides: Array.from({ length: n }, (_, i) => ({ id: `s${i + 1}`, layout: 'bullets', title: `Trang ${i + 1}` })), brand: { logo: null } } });

test('hoàn tác / làm lại nhiều bước; thay đổi mới sau khi hoàn tác bỏ nhánh làm lại', () => {
  const h = createEditHistory();
  let cur = deck();
  h.reset(cur);
  assert.equal(h.canUndo(), false);
  for (const t of ['A', 'B', 'C']) {
    cur = clone(cur);
    cur.spec.slides[1].title = t;
    h.record(cur);
  }
  assert.equal(h.size(), 4);
  let r = h.undo(cur);
  assert.equal(r.state.spec.slides[1].title, 'B');
  assert.equal(r.index, 1, 'chuyển tới trang vừa hoàn tác');
  cur = r.state;
  cur = h.undo(cur).state;
  assert.equal(cur.spec.slides[1].title, 'A');
  assert.equal(h.canRedo(), true);
  cur = h.redo(cur).state;
  assert.equal(cur.spec.slides[1].title, 'B');
  // Sửa mới khi đang ở giữa → không làm lại được bước "C" nữa.
  cur = clone(cur);
  cur.spec.title = 'Tên mới';
  r = h.undo(cur); // ghi "Tên mới" thành 1 bước rồi lùi lại
  assert.equal(r.state.spec.title, 'Bài');
  assert.equal(r.index, -1, 'chỉ đổi thiết lập chung → giữ trang đang xem');
  cur = h.redo(r.state).state;
  assert.equal(cur.spec.title, 'Tên mới');
  assert.equal(h.redo(cur), null, 'nhánh "C" đã bị bỏ');
  assert.equal(h.undo(h.undo(h.undo(cur).state).state).state.spec.slides[1].title, 'Trang 2');
});

test('không giới hạn bước: 1000 lần sửa → hoàn tác về đúng bản đầu; JSON (thứ tự khoá) y hệt bản gốc', () => {
  const h = createEditHistory();
  const first = deck(20);
  let cur = clone(first);
  h.reset(cur);
  for (let i = 0; i < 1000; i++) {
    cur = clone(cur);
    cur.spec.slides[i % 20].title = `Sửa ${i}`;
    h.record(cur);
  }
  let steps = 0;
  for (let r = h.undo(cur); r; r = h.undo(cur)) {
    cur = r.state;
    steps += 1;
  }
  assert.equal(steps, 1000);
  assert.equal(JSON.stringify(cur), JSON.stringify(first));
  assert.equal(h.canUndo(), false);
});

test('trang không đổi giữ nguyên đối tượng; 2 trang giống hệt nhau không bị dùng chung 1 đối tượng; xoá trang → hoàn tác mở lại trang đó', () => {
  const h = createEditHistory();
  const twin = { id: 'x', layout: 'quote', title: 'Giống' };
  let cur = { title: 'Bài', spec: { slides: [{ id: 'a', title: 'A' }, clone(twin), clone(twin), { id: 'd', title: 'D' }] } };
  h.reset(cur);
  const keep = cur.spec.slides[0];
  cur = { ...cur, spec: { ...cur.spec, slides: cur.spec.slides.filter((_, i) => i !== 2) } };
  const r = h.undo(cur);
  assert.equal(r.index, 2, 'chuyển tới trang vừa được khôi phục');
  const s = r.state.spec.slides;
  assert.equal(s.length, 4);
  assert.equal(s[0], keep, 'trang A là cùng đối tượng');
  assert.notEqual(s[1], s[2], 'hai trang giống nhau là 2 đối tượng riêng');
  s[1].title = 'Đổi riêng';
  assert.equal(s[2].title, 'Giống');
});

test('rebase: bản máy chủ chuẩn hoá thay bước đang đứng, không thêm bước; matches dùng lại lịch sử khi dựng lại trang', () => {
  const h = createEditHistory();
  let cur = deck();
  h.reset(cur);
  cur = clone(cur);
  cur.spec.slides[0].title = 'Sửa';
  h.record(cur);
  const server = clone(cur);
  server.spec.slides[0].value = 62; // máy chủ thêm/chuẩn hoá trường
  h.rebase(server);
  assert.equal(h.size(), 2);
  assert.equal(h.record(server), false, 'trùng bước đang đứng → không ghi');
  assert.ok(h.matches(clone(server)));
  assert.equal(h.matches(cur), false);
  assert.equal(h.undo(server).state.spec.slides[0].title, 'Trang 1');
});

test('phím tắt: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y; bỏ qua Alt/IME; ô nhập chữ giữ hoàn tác của trình duyệt', () => {
  const k = (o) => historyKey({ key: 'z', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });
  assert.equal(k({ ctrlKey: true }), 'undo');
  assert.equal(k({ metaKey: true }), 'undo');
  assert.equal(k({ ctrlKey: true, shiftKey: true, key: 'Z' }), 'redo');
  assert.equal(k({ metaKey: true, shiftKey: true, key: 'Z' }), 'redo');
  assert.equal(k({ ctrlKey: true, key: 'y' }), 'redo');
  assert.equal(k({ metaKey: true, key: 'y' }), null, '⌘Y trên Mac là lịch sử trình duyệt');
  assert.equal(k({}), null);
  assert.equal(k({ ctrlKey: true, altKey: true }), null, 'AltGr = Ctrl+Alt');
  assert.equal(k({ ctrlKey: true, isComposing: true }), null);
  assert.equal(k({ ctrlKey: true, key: 's' }), null);
  const el = (tagName, extra = {}) => ({ nodeType: 1, tagName, isContentEditable: false, ...extra });
  assert.equal(isTextField(el('INPUT', { type: 'text' })), true);
  assert.equal(isTextField(el('INPUT', { type: 'search' })), true);
  assert.equal(isTextField(el('INPUT', { type: 'checkbox' })), false);
  assert.equal(isTextField(el('TEXTAREA')), true);
  assert.equal(isTextField(el('DIV', { isContentEditable: true })), true);
  assert.equal(isTextField(el('BUTTON')), false);
  assert.equal(isTextField(null), false);
});

function server() {
  const db = { title: 'Bài thử', ratio: '16:9', specVersion: 1, spec: { title: 'Bài thử', slides: [{ id: 's1', layout: 'bullets', title: 'Trang 1', subtitle: '', items: [] }, { id: 's2', layout: 'bullets', title: 'Trang 2', subtitle: '', items: [] }] } };
  // Bài mở ra luôn là bản đã lưu (đã chuẩn hoá) — như máy chủ thật.
  db.spec = prepareSpecForSave(db.spec);
  const dto = () => ({ id: 'D1', status: 'ready', isOwner: true, canEdit: true, title: db.title, ratio: db.ratio, specVersion: db.specVersion, spec: clone(db.spec), assets: [] });
  globalThis.__fakeApi = async (method, path, body) => {
    if (method === 'GET') return { data: dto() };
    if (method === 'PATCH') {
      db.spec = clone(body.spec);
      db.specVersion += 1;
      if (body.title) db.title = body.title;
      return { data: dto() };
    }
    throw new Error(`chưa giả lập ${method} ${path}`);
  };
  return db;
}
const idle = () => new Promise((r) => setTimeout(r, 450));

test('useEditor: gõ liên tục gộp 1 bước; hoàn tác về bản gốc → hết "chưa lưu"; làm lại; thao tác trang', async () => {
  server();
  const a = useEditor('D1');
  await a.load();
  assert.equal(a.canUndo.value, false);
  const s0 = () => a.draft.value.spec.slides[0];
  for (const t of ['T', 'Tr', 'Trang mới']) s0().title = t; // 1 cụm gõ
  await idle();
  assert.equal(a.canUndo.value, true);
  a.addSlide('bullets');
  assert.equal(a.draft.value.spec.slides.length, 3);
  assert.equal(a.undo(), true, 'hoàn tác thêm trang (chưa kịp ghi vẫn hoàn tác được)');
  assert.equal(a.draft.value.spec.slides.length, 2);
  assert.equal(a.undo(), true);
  assert.equal(s0().title, 'Trang 1', 'cả cụm gõ lùi 1 lần');
  assert.equal(a.dirty.value, false, 'về đúng bản đã lưu');
  assert.equal(a.undo(), false, 'hết bước');
  assert.equal(a.redo(), true);
  assert.equal(s0().title, 'Trang mới');
  assert.equal(a.redo(), true);
  assert.equal(a.draft.value.spec.slides.length, 3);
  assert.equal(a.selected.value, 1, 'chuyển tới trang vừa làm lại');
  assert.equal(a.redo(), false);
});

test('useEditor: lưu xong vẫn hoàn tác được (bản máy chủ không thành bước riêng)', async () => {
  const db = server();
  const a = useEditor('D1');
  await a.load();
  a.draft.value.spec.slides[1].title = 'Đã sửa';
  assert.equal(await a.save(), true);
  assert.equal(db.spec.slides[1].title, 'Đã sửa');
  await idle();
  assert.equal(a.dirty.value, false);
  assert.equal(a.undo(), true);
  assert.equal(a.draft.value.spec.slides[1].title, 'Trang 2');
  assert.equal(a.dirty.value, true, 'khác bản đã lưu → chưa lưu');
  assert.equal(a.selected.value, 1);
  assert.equal(a.redo(), true);
  assert.equal(a.dirty.value, false);
  assert.equal(a.redo(), false, 'không có bước thừa do bản máy chủ');
});
