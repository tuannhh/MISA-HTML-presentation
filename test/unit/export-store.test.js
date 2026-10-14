// Bản xuất chờ tải (tải GET thường để IDM/trình duyệt chỉ nhận 1 tệp): mã gắn người + bài, tải lại nhiều lần trong hạn,
// hết hạn/sai người → null, trần số bản theo người, dọn tệp khi hết hạn và khi khởi động.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createExportStore, EXPORT_TOKEN_RE } from '../../src/services/exportStore.js';

async function setup(opts = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mp-export-'));
  let t = 1_000_000;
  const store = createExportStore({ dir, ttlMs: 60_000, now: () => t, ...opts });
  await store.init();
  return { dir, store, tick: (ms) => (t += ms), done: () => rm(dir, { recursive: true, force: true }) };
}
const settle = () => new Promise((r) => setTimeout(r, 50));

test('put → get đúng người + bài: tệp đủ nội dung, tải lại được nhiều lần (IDM tải lại cùng URL)', async () => {
  const { store, done } = await setup();
  const pdf = new Uint8Array(Buffer.from('%PDF-1.7 nội dung'));
  const out = await store.put({ userId: 'u1', presentationId: 'p1', data: pdf, title: 'Báo cáo', ext: 'pdf' });
  assert.match(out.token, EXPORT_TOKEN_RE);
  assert.equal(out.bytes, pdf.byteLength);
  for (let i = 0; i < 3; i++) {
    const f = store.get(out.token, { userId: 'u1', presentationId: 'p1' });
    assert.ok(f, `lần tải ${i + 1}`);
    assert.equal(f.type, 'application/pdf');
    assert.equal(f.title, 'Báo cáo');
    assert.deepEqual(await readFile(f.file), Buffer.from(pdf));
  }
  const html = await store.put({ userId: 'u1', presentationId: 'p1', data: '<p>Xin chào</p>', title: 'T', ext: 'html' });
  const h = store.get(html.token, { userId: 'u1', presentationId: 'p1' });
  assert.equal(h.type, 'text/html; charset=utf-8');
  assert.equal(await readFile(h.file, 'utf8'), '<p>Xin chào</p>');
  await done();
});

test('sai người / sai bài / mã sai dạng → null (không lộ mã có tồn tại); định dạng lạ → lỗi', async () => {
  const { store, done } = await setup();
  const { token } = await store.put({ userId: 'u1', presentationId: 'p1', data: 'x', title: 'T', ext: 'html' });
  assert.equal(store.get(token, { userId: 'u2', presentationId: 'p1' }), null);
  assert.equal(store.get(token, { userId: 'u1', presentationId: 'p2' }), null);
  assert.equal(store.get('../../etc/passwd', { userId: 'u1', presentationId: 'p1' }), null);
  assert.equal(store.get('x'.repeat(32), { userId: 'u1', presentationId: 'p1' }), null, 'mã đúng dạng nhưng không tồn tại');
  assert.ok(store.get(token, { userId: 'u1', presentationId: 'p1' }), 'chủ mã vẫn tải được sau các lần dò sai');
  await assert.rejects(store.put({ userId: 'u1', presentationId: 'p1', data: 'x', title: 'T', ext: 'exe' }));
  await done();
});

test('hết hạn tính từ lần dùng gần nhất; quá hạn → null + xoá tệp; sweep dọn bản hết hạn', async () => {
  const { dir, store, tick, done } = await setup();
  const a = await store.put({ userId: 'u1', presentationId: 'p1', data: 'a', title: 'A', ext: 'html' });
  const b = await store.put({ userId: 'u1', presentationId: 'p1', data: 'b', title: 'B', ext: 'html' });
  tick(50_000);
  assert.ok(store.get(a.token, { userId: 'u1', presentationId: 'p1' }), 'còn hạn → gia hạn thêm 60 giây');
  tick(50_000);
  assert.ok(store.get(a.token, { userId: 'u1', presentationId: 'p1' }), 'đã gia hạn ở lần tải trước');
  assert.equal(store.get(b.token, { userId: 'u1', presentationId: 'p1' }), null, 'b quá 60 giây không dùng');
  tick(61_000);
  store.sweep();
  await settle();
  assert.equal(store.size(), 0);
  assert.deepEqual(await readdir(dir), []);
  await done();
});

test('trần theo người: bản cũ nhất bị bỏ (và xoá tệp) khi vượt maxPerUser; người khác không ảnh hưởng', async () => {
  const { dir, store, done } = await setup({ maxPerUser: 2 });
  const other = await store.put({ userId: 'u2', presentationId: 'p9', data: 'z', title: 'Z', ext: 'pdf' });
  const t1 = await store.put({ userId: 'u1', presentationId: 'p1', data: '1', title: '1', ext: 'pdf' });
  const t2 = await store.put({ userId: 'u1', presentationId: 'p1', data: '2', title: '2', ext: 'pdf' });
  const t3 = await store.put({ userId: 'u1', presentationId: 'p1', data: '3', title: '3', ext: 'pdf' });
  await settle();
  assert.equal(store.get(t1.token, { userId: 'u1', presentationId: 'p1' }), null);
  assert.ok(store.get(t2.token, { userId: 'u1', presentationId: 'p1' }));
  assert.ok(store.get(t3.token, { userId: 'u1', presentationId: 'p1' }));
  assert.ok(store.get(other.token, { userId: 'u2', presentationId: 'p9' }));
  assert.equal((await readdir(dir)).length, 3);
  await done();
});

test('khởi động: xoá bản xuất sót lần chạy trước, giữ tệp tạm khác', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mp-export-'));
  await writeFile(path.join(dir, `export-${'a'.repeat(32)}.pdf`), 'cũ');
  await writeFile(path.join(dir, 'facts-123.pdf'), 'tệp tạm của việc khác');
  const store = createExportStore({ dir });
  await store.init();
  assert.equal((await readdir(dir)).length, 2, 'init chỉ tạo thư mục, không xoá (script phụ dùng chung container)');
  await store.purgeLeftovers();
  assert.deepEqual(await readdir(dir), ['facts-123.pdf']);
  await rm(dir, { recursive: true, force: true });
});
