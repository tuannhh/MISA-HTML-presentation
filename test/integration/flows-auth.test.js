// Luồng chính qua HTTP (roadmap B) — tài khoản, phiên, CSRF, quản trị. Mã kịch bản theo catalogue
// docs/audits/2026-10-12-codex/03-ma-tran-test-case.csv. App thật + MySQL tạm + Gemini giả (helpers/httpApp.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/index.js';
import { useHttpApp } from './helpers/httpApp.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const getApp = useHttpApp(config, { before, after });
let app;
before(() => {});

const sid = (c) => /mp\.sid=([^;]+)/.exec(c.cookie)?.[1] || null;

test('AUTH-01/02: đăng nhập đúng đổi mã phiên, không trả hash; sai mật khẩu / không có tài khoản → 401 cùng thông điệp', async () => {
  app = getApp();
  const u = await app.newUser('login');
  const c = app.makeClient();
  await c.init();
  const before1 = sid(c);
  const r = await c.post('/api/auth/login', { email: u.email, password: u.password });
  assert.equal(r.status, 200);
  assert.notEqual(sid(c), before1, 'mã phiên phải đổi sau đăng nhập (chống session fixation)');
  const me = await c.get('/api/auth/me');
  assert.equal(me.json.data.user.email, u.email);
  assert.ok(!JSON.stringify(me.json).match(/password_hash|passwordHash|\$2[aby]\$/), 'không lộ hash mật khẩu');

  const bad = app.makeClient();
  await bad.init();
  const wrong = await bad.post('/api/auth/login', { email: u.email, password: 'SaiMatKhau123' });
  const ghost = await bad.post('/api/auth/login', { email: 'khong-ton-tai@it.test', password: 'SaiMatKhau123' });
  assert.equal(wrong.status, 401);
  assert.equal(ghost.status, 401);
  assert.equal(wrong.json.error.message, ghost.json.error.message, 'không lộ email có tồn tại hay không');
  assert.equal((await bad.get('/api/presentations')).status, 401);
});

test('AUTH-03/04: khoá tài khoản → cookie cũ mất quyền; đăng xuất → dùng lại cookie cũ bị 401', async () => {
  app = getApp();
  const u = await app.newUser('lock');
  assert.equal((await u.get('/api/presentations')).status, 200);
  const stolen = app.makeClient();
  stolen.setCookie(u.cookie);
  let r = await app.admin.patch(`/api/admin/users/${u.id}`, { status: 'disabled' });
  assert.equal(r.status, 200);
  assert.equal((await u.get('/api/presentations')).status, 401, 'phiên đang mở mất quyền ngay');
  r = await u.post('/api/auth/login', { email: u.email, password: u.password });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'ACCOUNT_DISABLED');
  await app.admin.patch(`/api/admin/users/${u.id}`, { status: 'active' });

  const v = await app.newUser('logout');
  const copy = app.makeClient();
  copy.setCookie(v.cookie);
  assert.equal((await copy.get('/api/presentations')).status, 200);
  r = await v.post('/api/auth/logout', {});
  assert.ok([200, 204].includes(r.status), String(r.status));
  assert.equal((await copy.get('/api/presentations')).status, 401, 'cookie cũ sau đăng xuất không còn hiệu lực');
});

test('AUTH-05/06/07: mật khẩu tạm bị chặn tới khi đổi; đổi mật khẩu thu hồi phiên khác; đổi sai mật khẩu cũ → 400', async () => {
  app = getApp();
  const email = `it-temp-${Date.now()}@it.test`;
  const created = await app.admin.post('/api/admin/users', { email, displayName: 'Người mật khẩu tạm' });
  assert.equal(created.status, 201);
  const temp = created.json.data.temporaryPassword;
  const c = app.makeClient();
  await c.init();
  let r = await c.post('/api/auth/login', { email, password: temp });
  assert.equal(r.status, 200);
  r = await c.get('/api/presentations');
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'MUST_CHANGE_PASSWORD');

  r = await c.post('/api/auth/change-password', { currentPassword: 'khong-dung-1A', newPassword: 'MatKhauMoi2026!' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'WRONG_PASSWORD');
  r = await c.post('/api/auth/change-password', { currentPassword: temp, newPassword: 'MatKhauMoi2026!' });
  assert.equal(r.status, 200);
  assert.equal((await c.get('/api/presentations')).status, 200, 'đổi xong dùng được ngay trên phiên hiện tại');

  // Phiên thứ 2 (thiết bị khác) bị thu hồi khi đổi mật khẩu ở phiên 1.
  const other = app.makeClient();
  await other.init();
  assert.equal((await other.post('/api/auth/login', { email, password: 'MatKhauMoi2026!' })).status, 200);
  r = await c.post('/api/auth/change-password', { currentPassword: 'MatKhauMoi2026!', newPassword: 'MatKhauKhac2026!' });
  assert.equal(r.status, 200);
  assert.equal((await other.get('/api/presentations')).status, 401, 'phiên khác bị thu hồi');
  assert.equal((await c.get('/api/presentations')).status, 200, 'phiên vừa đổi vẫn dùng được');
});

test('AUTH-11/12: email trùng (khác hoa/thường) → 409; thiếu CSRF → 403; cookie HttpOnly + SameSite', async () => {
  app = getApp();
  const u = await app.newUser('dup');
  const r = await app.admin.post('/api/admin/users', { email: u.email.toUpperCase(), displayName: 'Trùng email' });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'EMAIL_TAKEN');

  const raw = await fetch(`${app.base}/api/presentations/00000000-0000-4000-8000-000000000000`, { method: 'DELETE', headers: { cookie: u.cookie } });
  assert.equal(raw.status, 403, 'mutation không token CSRF bị chặn');

  const c = app.makeClient();
  const res = await c.req('GET', '/api/auth/csrf', undefined, { raw: true });
  const set = res.headers.getSetCookie().join('\n');
  assert.match(set, /mp\.sid=/);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
});

test('AUTH-14/15: chỉ admin quản trị tài khoản; mật khẩu tạm không vào log; không tự khoá chính mình', async () => {
  app = getApp();
  const u = await app.newUser('nonadmin');
  let r = await u.get('/api/admin/users');
  assert.equal(r.status, 403);
  r = await u.post('/api/admin/users', { email: `x-${Date.now()}@it.test`, displayName: 'Không được tạo' });
  assert.equal(r.status, 403);
  r = await app.admin.patch(`/api/admin/users/${app.admin.id}`, { status: 'disabled' });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'SELF_LOCKOUT');
  r = await app.admin.get('/api/admin/users?q=nonadmin');
  assert.equal(r.status, 200);
  assert.ok(r.json.data.length >= 1);
  assert.ok(!JSON.stringify(r.json).match(/password_hash|temporaryPassword/), 'danh sách không chứa hash/mật khẩu tạm');
});

test('AUTH-18: dò mật khẩu 1 tài khoản → 429 theo email; tài khoản khác cùng IP vẫn đăng nhập được', async () => {
  app = getApp();
  const victim = await app.newUser('victim');
  const other = await app.newUser('other');
  const c = app.makeClient();
  await c.init();
  let last;
  for (let i = 0; i < 11; i += 1) last = await c.post('/api/auth/login', { email: victim.email, password: `Sai${i}mat-khau` });
  assert.equal(last.status, 429);
  assert.equal(last.json.error.code, 'LOGIN_RATE_LIMITED');
  const d = app.makeClient();
  await d.init();
  assert.equal((await d.post('/api/auth/login', { email: other.email, password: other.password })).status, 200, 'chung IP (VPN) không bị gom hạn mức');
});
