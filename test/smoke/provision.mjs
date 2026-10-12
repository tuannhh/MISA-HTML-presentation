// Cấp và dọn tài khoản cho smoke test (hệ thống không có đăng ký — tài khoản do quản trị viên cấp).
// Hai chế độ, chọn TRƯỚC khi ghi bất kỳ dữ liệu nào:
//  1. SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD: dùng admin có sẵn (đã đổi mật khẩu). Không sửa/xoá admin này;
//     khi dọn chỉ khoá (disabled) các tài khoản thử đã tạo — API không có xoá người dùng.
//  2. SMOKE_BOOTSTRAP=1: chỉ cho Docker local dùng làm môi trường test. Kiểm BASE trỏ đúng cổng của `docker compose port app 3000`,
//     tạo admin tạm qua scripts/create-admin.js, đổi sang mật khẩu ngẫu nhiên của lần chạy; khi dọn gọi scripts/smoke-cleanup.js
//     xoá hẳn mọi tài khoản smoke-*-<stamp> (kể cả admin tạm) cùng bài/tệp của họ.
// Thiếu cả hai → dừng, không tự tạo admin. Mật khẩu mọi tài khoản đều ngẫu nhiên từng lần chạy, không nằm trong mã nguồn.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { smokeEmail } from '../../scripts/lib/smokeAccounts.js';

// Đủ chính sách mật khẩu (10–128 ký tự, có chữ và số).
export const randomPassword = () => `${randomBytes(18).toString('base64url')}a1`;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function composePort(exec) {
  let out;
  try {
    out = exec('docker', ['compose', 'port', 'app', '3000'], { encoding: 'utf8' });
  } catch (err) {
    throw new Error(`SMOKE_BOOTSTRAP: không đọc được cổng app từ docker compose (${err.message})`);
  }
  const port = /:(\d+)\s*$/.exec(String(out).trim())?.[1];
  if (!port) throw new Error(`SMOKE_BOOTSTRAP: không hiểu đầu ra "docker compose port app 3000": ${out}`);
  return port;
}

// BASE phải là chính app trong compose hiện tại → không lỡ tạo admin trên compose này rồi chạy thử vào máy chủ khác (hoặc ngược lại).
function assertBaseIsCompose(base, exec) {
  const url = new URL(base);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const expected = composePort(exec);
  if (!LOCAL_HOSTS.has(url.hostname) || port !== expected) {
    throw new Error(`SMOKE_BOOTSTRAP: BASE=${base} không phải app của docker compose hiện tại (localhost:${expected}) — dừng trước khi ghi dữ liệu`);
  }
}

/**
 * makeClient() → client { init, req }. Trả { password, signUp(c, role, displayName), cleanup() }.
 * signUp tạo tài khoản smoke-<role>-<stamp>, đăng nhập và đổi sang `password` → { status: 201, json, email }.
 */
export function createProvisioner(makeClient, stamp, { base, env = process.env, exec = execFileSync } = {}) {
  const provided = Boolean(env.SMOKE_ADMIN_EMAIL && env.SMOKE_ADMIN_PASSWORD);
  if (!provided) {
    if (env.SMOKE_BOOTSTRAP !== '1') {
      throw new Error('Smoke cần SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD, hoặc SMOKE_BOOTSTRAP=1 khi chạy trên Docker local dành cho test');
    }
    assertBaseIsCompose(base, exec);
  }
  const password = randomPassword();
  const created = []; // id tài khoản thử đã tạo (chế độ admin có sẵn: khoá khi dọn)
  let admin = null;
  let cleaned = false;

  async function adminClient() {
    const c = makeClient();
    await c.init();
    if (provided) {
      const r = await c.req('POST', '/api/auth/login', { email: env.SMOKE_ADMIN_EMAIL, password: env.SMOKE_ADMIN_PASSWORD });
      assert.equal(r.status, 200, `đăng nhập admin smoke thất bại: ${JSON.stringify(r.json)}`);
      return c;
    }
    const email = smokeEmail('admin', stamp);
    const out = exec('docker', ['compose', 'exec', '-T', 'app', 'node', 'scripts/create-admin.js', email, 'Smoke Admin'], { encoding: 'utf8' });
    const temp = /Mật khẩu tạm[^:]*:\s*(\S+)/.exec(out)?.[1];
    assert.ok(temp, 'không đọc được mật khẩu tạm của admin từ create-admin.js');
    let r = await c.req('POST', '/api/auth/login', { email, password: temp });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await c.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: randomPassword() });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return c;
  }

  async function signUp(c, role, displayName) {
    const email = smokeEmail(role, stamp);
    admin ||= await adminClient();
    const made = await admin.req('POST', '/api/admin/users', { email, displayName, role: 'user' });
    assert.equal(made.status, 201, JSON.stringify(made.json));
    created.push(made.json.data.user.id);
    const temp = made.json.data.temporaryPassword;
    let r = await c.req('POST', '/api/auth/login', { email, password: temp });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    r = await c.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: password });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return { status: 201, json: r.json, email };
  }

  // Gọi trong finally — chạy cả khi test lỗi giữa chừng. Lỗi khi dọn không che lỗi test: in ra + đặt exitCode.
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    try {
      if (!provided) {
        const out = exec('docker', ['compose', 'exec', '-T', 'app', 'node', 'scripts/smoke-cleanup.js', stamp], { encoding: 'utf8' });
        console.log(String(out).trim());
        return;
      }
      for (const id of created) {
        const r = await admin.req('PATCH', `/api/admin/users/${id}`, { status: 'disabled' });
        if (r.status !== 200) throw new Error(`không khoá được tài khoản thử ${id}: ${JSON.stringify(r.json)}`);
      }
      if (created.length) console.log(`Đã khoá ${created.length} tài khoản thử (admin có sẵn: không xoá được qua API).`);
    } catch (err) {
      console.error(`DỌN TÀI KHOẢN SMOKE THẤT BẠI (stamp ${stamp}): ${err.message}`);
      process.exitCode = 1;
    }
  }

  return { password, signUp, cleanup };
}
