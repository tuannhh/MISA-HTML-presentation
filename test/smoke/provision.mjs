// Cấp tài khoản cho smoke test KHÔNG cần bật đăng ký tự do (mặc định production đóng đăng ký):
//  1. Thử đăng ký tự do (nếu máy chủ đang mở) → xong.
//  2. Đóng → cần quản trị viên: dùng SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD (tài khoản admin ĐÃ đổi mật khẩu), hoặc tự tạo admin tạm
//     qua `docker compose exec app node scripts/create-admin.js` (chỉ khi chạy trên Docker local; mật khẩu tạm đọc từ đầu ra, không ghi ra đâu).
//  3. Admin tạo người dùng → đăng nhập bằng mật khẩu tạm → đổi sang mật khẩu thử (bắt buộc đổi).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

export const TEST_PASSWORD = 'Matkhau12345';

async function adminClient(makeClient, stamp) {
  const admin = makeClient();
  await admin.init();
  let email = process.env.SMOKE_ADMIN_EMAIL;
  let password = process.env.SMOKE_ADMIN_PASSWORD;
  if (!email || !password) {
    email = `smoke-admin-${stamp}@misa.com.vn`;
    const out = execFileSync('docker', ['compose', 'exec', '-T', 'app', 'node', 'scripts/create-admin.js', email, 'Smoke Admin'], { encoding: 'utf8' });
    const temp = /Mật khẩu tạm[^:]*:\s*(\S+)/.exec(out)?.[1];
    assert.ok(temp, 'không đọc được mật khẩu tạm của admin từ create-admin.js');
    let r = await admin.req('POST', '/api/auth/login', { email, password: temp });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await admin.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: TEST_PASSWORD });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return admin;
  }
  const r = await admin.req('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200, `đăng nhập admin smoke thất bại: ${JSON.stringify(r.json)}`);
  return admin;
}

/** Trả hàm signUp(client, email, displayName) → response như /auth/register (status 201 khi thành công). */
export function createProvisioner(makeClient, stamp) {
  let admin = null;
  return async function signUp(c, email, displayName) {
    const reg = await c.req('POST', '/api/auth/register', { email, password: TEST_PASSWORD, displayName });
    if (reg.status !== 403 || reg.json?.error?.code !== 'REGISTRATION_CLOSED') return reg;
    admin ||= await adminClient(makeClient, stamp);
    const made = await admin.req('POST', '/api/admin/users', { email, displayName, role: 'user' });
    assert.equal(made.status, 201, JSON.stringify(made.json));
    const temp = made.json.data.temporaryPassword;
    let r = await c.req('POST', '/api/auth/login', { email, password: temp });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await c.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: TEST_PASSWORD });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return { status: 201, json: r.json };
  };
}
