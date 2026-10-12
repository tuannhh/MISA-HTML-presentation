// Hồi quy F02: đồng bộ bản nháp ↔ máy chủ ở trình soạn thảo (useEditor chạy thật, máy chủ giả có khoá phiên bản).
//  (1) Đổi tỷ lệ/chia sẻ (updateMeta) không được "nhận" phiên bản mới của máy chủ cho bản nháp cũ → lần lưu sau phải bị 409,
//      không ghi đè bản của người sửa khác.
//  (2) Gõ thêm trong lúc yêu cầu lưu đang chạy không bị phản hồi lưu xoá mất.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../helpers/alias-loader.mjs', import.meta.url);
const { useEditor } = await import('../../frontend/src/composables/useEditor.js');
const { ApiError } = await import('../helpers/fake-api.mjs');
// Đặt SAU khi nạp module (một số module shared rẽ nhánh theo sự có mặt của window); useEditor chỉ cần 2 hàm sự kiện.
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const clone = (x) => JSON.parse(JSON.stringify(x));

function server({ delayPatch = 0 } = {}) {
  const db = { title: 'Bài thử', ratio: '16:9', specVersion: 1, spec: { title: 'Bài thử', slides: [{ id: 's1', layout: 'bullets', title: 'Trang 1', subtitle: '', items: [] }] } };
  const dto = () => ({ id: 'D1', status: 'ready', isOwner: true, canEdit: true, title: db.title, ratio: db.ratio, specVersion: db.specVersion, spec: clone(db.spec), assets: [] });
  globalThis.__fakeApi = async (method, path, body) => {
    if (method === 'GET') return { data: dto() };
    if (method === 'PATCH') {
      if (delayPatch) await new Promise((r) => setTimeout(r, delayPatch));
      if (body.spec) {
        if (body.specVersion !== db.specVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'Bài đã được sửa ở nơi khác');
        db.spec = clone(body.spec);
        db.specVersion += 1;
      }
      if (body.ratio) db.ratio = body.ratio;
      if (body.title) db.title = body.title;
      return { data: dto() };
    }
    throw new Error(`chưa giả lập ${method} ${path}`);
  };
  return db;
}

test('F02: updateMeta khi nháp đang sửa và người khác đã lưu → lần lưu sau 409, không ghi đè bản của họ', async () => {
  const db = server();
  const a = useEditor('D1');
  await a.load();
  a.draft.value.spec.slides[0].title = 'A sửa tiêu đề';
  assert.equal(a.dirty.value, true);
  // Người sửa khác (B) lưu → máy chủ lên v2.
  db.spec.slides[0].subtitle = 'B vừa thêm phụ đề';
  db.specVersion = 2;
  // A đổi tỷ lệ (không gửi nội dung) — phản hồi mang bản v2 của B.
  await a.updateMeta({ ratio: '4:3' });
  assert.equal(a.draft.value.spec.slides[0].title, 'A sửa tiêu đề', 'nháp của A vẫn còn');
  const ok = await a.save();
  assert.equal(ok, false, 'A phải bị từ chối vì nháp xuất phát từ v1');
  assert.equal(a.saveError.value?.code, 'VERSION_CONFLICT');
  assert.equal(db.spec.slides[0].subtitle, 'B vừa thêm phụ đề', 'bản của B còn nguyên');
  assert.equal(db.specVersion, 2);
});

test('F02: updateMeta khi nháp sạch → nhận bản mới nhất, lưu sau đó thành công', async () => {
  const db = server();
  const a = useEditor('D1');
  await a.load();
  db.spec.slides[0].subtitle = 'B';
  db.specVersion = 2;
  await a.updateMeta({ ratio: '4:3' });
  assert.equal(a.draft.value.spec.slides[0].subtitle, 'B');
  a.draft.value.spec.slides[0].title = 'A';
  assert.equal(await a.save(), true);
  assert.equal(db.specVersion, 3);
  assert.equal(db.spec.slides[0].subtitle, 'B');
});

test('F02: gõ thêm trong lúc đang lưu → không mất chữ; lưu tiếp theo mang đúng nội dung', async () => {
  const db = server({ delayPatch: 40 });
  const a = useEditor('D1');
  await a.load();
  a.draft.value.spec.slides[0].title = 'Bản 1';
  const saving = a.save();
  await new Promise((r) => setTimeout(r, 10)); // yêu cầu đang bay
  a.draft.value.spec.slides[0].title = 'Bản 1 + gõ thêm';
  assert.equal(await saving, true);
  assert.equal(db.spec.slides[0].title, 'Bản 1');
  assert.equal(a.draft.value.spec.slides[0].title, 'Bản 1 + gõ thêm', 'chữ gõ trong lúc lưu còn nguyên');
  assert.equal(a.dirty.value, true, 'vẫn còn thay đổi chưa lưu');
  assert.equal(await a.save(), true, 'lưu tiếp không bị 409');
  assert.equal(db.spec.slides[0].title, 'Bản 1 + gõ thêm');
  assert.equal(a.dirty.value, false);
});

test('F02: không gõ gì trong lúc lưu → nhận bản máy chủ như cũ', async () => {
  server();
  const a = useEditor('D1');
  await a.load();
  a.draft.value.spec.slides[0].title = 'Bản 1';
  assert.equal(await a.save(), true);
  assert.equal(a.dirty.value, false);
  assert.equal(a.deck.value.specVersion, 2);
});

/* ---------------- A02: không mất chữ đang gõ khi đổi tỷ lệ/chia sẻ, khi lưu dàn ý, khi phản hồi về ngược thứ tự ---------------- */
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// Máy chủ giữ phản hồi PATCH tới khi test gọi release() — mô phỏng mạng chậm.
function gatedServer() {
  const db = server();
  const inner = globalThis.__fakeApi;
  const gates = [];
  globalThis.__fakeApi = async (method, path, body) => {
    if (method !== 'PATCH') return inner(method, path, body);
    const res = await inner(method, path, body); // máy chủ đã ghi
    await new Promise((r) => gates.push(r)); // phản hồi còn trên đường về
    return res;
  };
  return { db, release: () => gates.shift()?.(), releaseLast: () => gates.pop()?.(), pending: () => gates.length };
}

for (const dirtyAtStart of [false, true]) {
  test(`A02: đổi tỷ lệ khi nháp ${dirtyAtStart ? 'đang sửa' : 'sạch'}, gõ thêm lúc chờ phản hồi → chữ vừa gõ còn nguyên, lưu sau thành công`, async () => {
    const { db, release } = gatedServer();
    const a = useEditor('D1');
    await a.load();
    if (dirtyAtStart) a.draft.value.spec.slides[0].title = 'Trước khi đổi tỷ lệ';
    const meta = a.updateMeta({ ratio: '4:3' });
    await tick();
    a.draft.value.spec.slides[0].title = 'Gõ trong lúc đổi tỷ lệ';
    release();
    await meta;
    assert.equal(a.deck.value.ratio, '4:3');
    assert.equal(a.draft.value.spec.slides[0].title, 'Gõ trong lúc đổi tỷ lệ');
    assert.equal(a.dirty.value, true);
    const saving = a.save();
    await tick();
    release();
    assert.equal(await saving, true, 'không ai sửa khác → không 409');
    assert.equal(db.spec.slides[0].title, 'Gõ trong lúc đổi tỷ lệ');
  });
}

test('A02: lưu và đổi tỷ lệ chạy xen kẽ, gõ thêm ở giữa → không mất chữ, phiên bản lưu tiếp đúng', async () => {
  const { db, release, releaseLast, pending } = gatedServer();
  const a = useEditor('D1');
  await a.load();
  a.draft.value.spec.slides[0].title = 'Bản lưu';
  const saving = a.save();
  await tick();
  const meta = a.updateMeta({ ratio: '1:1' });
  await tick();
  a.draft.value.spec.slides[0].title = 'Bản lưu + gõ thêm';
  // Thả phản hồi theo thứ tự ngược (cái gửi sau về trước) nếu cả hai đang bay.
  while (pending() === 0) await tick();
  if (pending() === 2) {
    releaseLast();
    await tick();
    release();
  } else {
    release();
    while (pending() === 0) await tick();
    release();
  }
  assert.equal(await saving, true);
  await meta;
  assert.equal(db.spec.slides[0].title, 'Bản lưu');
  assert.equal(db.ratio, '1:1');
  assert.equal(a.draft.value.spec.slides[0].title, 'Bản lưu + gõ thêm');
  const again = a.save();
  await tick();
  release();
  assert.equal(await again, true, 'lần lưu tiếp mang đúng phiên bản (không 409)');
  assert.equal(db.spec.slides[0].title, 'Bản lưu + gõ thêm');
  assert.equal(db.specVersion, 3);
});

test('A02: lưu dàn ý, gõ thêm lúc chờ phản hồi → chữ còn nguyên, vẫn "chưa lưu", lưu tiếp thành công', async () => {
  const { useOutline } = await import('../../frontend/src/composables/useOutline.js');
  const db = { id: 'O1', title: 'T', status: 'outline', isOwner: true, assets: [], outlineVersion: 1, outline: { title: 'T', footer: '', design: {}, slides: [{ id: 's1', layout: 'bullets', title: 'Gốc', subtitle: '', notes: '', points: ['P'], images: [], video: null }] } };
  const gates = [];
  globalThis.__fakeApi = async (method, path, body) => {
    if (method === 'PUT') {
      if (body.outlineVersion !== db.outlineVersion) throw new ApiError(409, 'VERSION_CONFLICT', 'xung đột');
      db.outline = clone(body.outline);
      db.outlineVersion += 1;
      await new Promise((r) => gates.push(r));
    }
    return { data: clone(db) };
  };
  const o = useOutline('O1');
  await o.load();
  o.draft.value.slides[0].title = 'Trước khi lưu';
  const saving = o.save();
  await tick();
  o.draft.value.slides[0].title = 'Gõ trong lúc lưu dàn ý';
  gates.shift()();
  assert.equal(await saving, true);
  assert.equal(db.outline.slides[0].title, 'Trước khi lưu');
  assert.equal(o.draft.value.slides[0].title, 'Gõ trong lúc lưu dàn ý');
  assert.equal(o.dirty.value, true);
  const again = o.save();
  await tick();
  gates.shift()();
  assert.equal(await again, true);
  assert.equal(db.outline.slides[0].title, 'Gõ trong lúc lưu dàn ý');
  assert.equal(o.dirty.value, false);
});
