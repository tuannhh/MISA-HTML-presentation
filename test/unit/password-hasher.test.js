// Băm/so bcrypt trên worker_threads: cùng định dạng hash với bcryptjs (tài khoản cũ đăng nhập được), không chặn luồng chính,
// đóng xong thì từ chối việc mới.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { createPasswordHasher } from '../../src/lib/passwordHasher.js';

test('hash/compare tương thích bcryptjs hai chiều (hash cũ trong DB vẫn dùng được)', async () => {
  const h = createPasswordHasher({ threads: 2 });
  try {
    const mine = await h.hash('MatKhau123', 4);
    assert.match(mine, /^\$2[ab]\$04\$/);
    assert.equal(bcrypt.compareSync('MatKhau123', mine), true);
    const old = bcrypt.hashSync('Cũ có dấu 99', 4);
    assert.equal(await h.compare('Cũ có dấu 99', old), true);
    assert.equal(await h.compare('sai', old), false);
    // Hash hỏng → false hoặc lỗi, không treo.
    await h.compare('x', 'khong-phai-hash').then((v) => assert.equal(v, false), () => {});
  } finally {
    await h.close();
  }
});

test('8 lần so mật khẩu đồng thời không làm luồng chính đứng (khác bcrypt chạy trên luồng chính)', async () => {
  const h = createPasswordHasher({ threads: 2 });
  const hash = bcrypt.hashSync('MatKhau123', 10);
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  try {
    const all = await Promise.all(Array.from({ length: 8 }, () => h.compare('MatKhau123', hash)));
    assert.deepEqual(all, Array(8).fill(true));
  } finally {
    lag.disable();
    await h.close();
  }
  assert.ok(lag.max / 1e6 < 150, `luồng chính đứng tối đa ${Math.round(lag.max / 1e6)} ms`);
});

test('close(): việc đang chờ và việc mới bị từ chối, không treo', async () => {
  const h = createPasswordHasher({ threads: 1 });
  await h.close();
  await assert.rejects(h.hash('MatKhau123', 4), /đã đóng/);
});
