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
