// Hồi quy A01: smoke không tự tạo admin khi thiếu xác nhận môi trường test, kiểm BASE đúng compose trước khi ghi,
// mật khẩu ngẫu nhiên từng lần chạy, dọn tài khoản kể cả khi test lỗi; admin có sẵn thì không sửa/xoá.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvisioner } from '../smoke/provision.mjs';
import { smokeEmail, isSmokeEmail } from '../../scripts/lib/smokeAccounts.js';

const STAMP = 'abc123';

function harness({ composeOut = '0.0.0.0:8088\n' } = {}) {
  const calls = [];
  const exec = (file, args) => {
    calls.push({ kind: 'exec', args: args.join(' ') });
    if (args.includes('port')) return composeOut;
    if (args.includes('scripts/create-admin.js')) return 'Mật khẩu tạm (chỉ hiển thị 1 lần): TempAdmin12345';
    if (args.includes('scripts/smoke-cleanup.js')) return 'Đã dọn 3 tài khoản smoke.';
    throw new Error(`lệnh lạ: ${file} ${args.join(' ')}`);
  };
  let n = 0;
  const makeClient = (role = 'admin') => ({
    async init() {},
    async req(method, path, body) {
      calls.push({ kind: 'http', role, method, path, body });
      if (path === '/api/admin/users') return { status: 201, json: { data: { user: { id: `id-${(n += 1)}` }, temporaryPassword: 'TempUser12345' } } };
      return { status: 200, json: { data: { user: {} } } };
    },
  });
  return { calls, exec, makeClient };
}

test('A01: thiếu SMOKE_ADMIN_* và SMOKE_BOOTSTRAP → dừng, không chạy lệnh/HTTP nào', () => {
  const h = harness();
  assert.throws(() => createProvisioner(h.makeClient, STAMP, { base: 'http://localhost:8088', env: {}, exec: h.exec }), /SMOKE_BOOTSTRAP/);
  assert.equal(h.calls.length, 0);
});

test('A01: SMOKE_BOOTSTRAP nhưng BASE không phải app của compose → dừng trước khi tạo admin', () => {
  for (const base of ['http://localhost:3000', 'https://slides.misa.vn', 'http://10.1.2.3:8088']) {
    const h = harness();
    assert.throws(() => createProvisioner(h.makeClient, STAMP, { base, env: { SMOKE_BOOTSTRAP: '1' }, exec: h.exec }), /không phải app/);
    assert.ok(!h.calls.some((c) => c.args?.includes('create-admin')), base);
  }
});

test('A01: bootstrap — mật khẩu ngẫu nhiên mỗi lần chạy, email theo quy ước smoke, dọn bằng smoke-cleanup theo stamp', async () => {
  const h = harness();
  const p = createProvisioner(h.makeClient, STAMP, { base: 'http://localhost:8088', env: { SMOKE_BOOTSTRAP: '1' }, exec: h.exec });
  const other = createProvisioner(h.makeClient, STAMP, { base: 'http://127.0.0.1:8088', env: { SMOKE_BOOTSTRAP: '1' }, exec: h.exec });
  assert.notEqual(p.password, other.password);
  const r = await p.signUp(h.makeClient('user'), 'a', 'Người A');
  assert.equal(r.status, 201);
  assert.equal(r.email, smokeEmail('a', STAMP));
  const adminChange = h.calls.find((c) => c.role === 'admin' && c.path === '/api/auth/change-password');
  assert.ok(adminChange.body.newPassword.length >= 10);
  assert.notEqual(adminChange.body.newPassword, p.password, 'admin tạm không dùng chung mật khẩu với tài khoản thử');
  assert.ok(h.calls.some((c) => c.args?.includes(`create-admin.js ${smokeEmail('admin', STAMP)}`)));
  await p.cleanup();
  await p.cleanup(); // gọi lại không chạy 2 lần
  assert.equal(h.calls.filter((c) => c.args?.includes(`smoke-cleanup.js ${STAMP}`)).length, 1);
});

test('A01: test lỗi giữa chừng vẫn dọn (finally)', async () => {
  const h = harness();
  const p = createProvisioner(h.makeClient, STAMP, { base: 'http://localhost:8088', env: { SMOKE_BOOTSTRAP: '1' }, exec: h.exec });
  await assert.rejects(async () => {
    try {
      await p.signUp(h.makeClient('user'), 'a', 'Người A');
      throw new Error('assertion của smoke thất bại');
    } finally {
      await p.cleanup();
    }
  }, /assertion của smoke/);
  assert.ok(h.calls.some((c) => c.args?.includes(`smoke-cleanup.js ${STAMP}`)));
});

test('A01: admin có sẵn — không đổi mật khẩu/không tạo admin; dọn = khoá tài khoản thử đã tạo', async () => {
  const h = harness();
  const env = { SMOKE_ADMIN_EMAIL: 'qtv@misa.com.vn', SMOKE_ADMIN_PASSWORD: 'MatKhauAdmin123' };
  const p = createProvisioner(h.makeClient, STAMP, { base: 'https://test.misa.vn', env, exec: h.exec });
  await p.signUp(h.makeClient('user'), 'a', 'Người A');
  await p.signUp(h.makeClient('user'), 'b', 'Người B');
  await p.cleanup();
  assert.equal(h.calls.filter((c) => c.kind === 'exec').length, 0, 'không chạy docker');
  assert.ok(!h.calls.some((c) => c.role === 'admin' && c.path === '/api/auth/change-password'));
  const disabled = h.calls.filter((c) => c.method === 'PATCH').map((c) => [c.path, c.body.status]);
  assert.deepEqual(disabled, [['/api/admin/users/id-1', 'disabled'], ['/api/admin/users/id-2', 'disabled']]);
});

test('quy ước email smoke: script dọn chỉ nhận đúng mẫu, đúng stamp', () => {
  assert.ok(isSmokeEmail(smokeEmail('admin', STAMP), STAMP));
  assert.ok(isSmokeEmail('smoke-c-zz99@misa.com.vn'));
  assert.ok(!isSmokeEmail(smokeEmail('a', STAMP), 'khac1234'));
  for (const e of ['admin@misa.com.vn', 'smoke-a-abc123@misa.com.vn.evil.com', 'xsmoke-a-abc123@misa.com.vn', 'smoke-a-abc123@gmail.com', 'smoke--abc123@misa.com.vn']) {
    assert.ok(!isSmokeEmail(e), e);
  }
  assert.throws(() => smokeEmail('a', '../x'));
});
