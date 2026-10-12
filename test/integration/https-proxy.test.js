// Gate DevOps (OPS-09, AUTH-12): chạy sau cổng vào kết thúc TLS — TRUST_PROXY=1, SESSION_COOKIE_SECURE=true.
// Qua cổng vào (X-Forwarded-Proto=https): cookie phiên có Secure + HttpOnly + SameSite, đăng nhập dùng được; IP ghi audit là IP
// cổng vào thấy (client tự gửi X-Forwarded-For giả không có tác dụng). Gọi thẳng app bằng http (bỏ qua cổng vào) → không nhận
// cookie phiên. Cấu hình production lệch https/cookie → không khởi động (fail-fast).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/index.js';
import { useHttpApp, makeClient, INGRESS_CLIENT_IP } from './helpers/httpApp.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const getApp = useHttpApp(config, { before, after }, {
  ingress: true,
  patch: (cfg) => ({ trustProxy: 1, appBaseUrl: 'https://present.example.test', session: { ...cfg.session, cookieSecure: true } }),
});

test('qua cổng vào HTTPS: cookie Secure/HttpOnly/SameSite=Lax, phiên dùng được; IP audit = IP thật do cổng vào gắn', async () => {
  const app = getApp();
  const u = await app.newUser('tls');
  const c = makeClient(app.base);
  const res = await c.req('GET', '/api/auth/csrf', undefined, { raw: true });
  const set = res.headers.getSetCookie().join('\n');
  assert.match(set, /mp\.sid=[^;]+;.*Secure/i);
  assert.match(set, /HttpOnly/i);
  assert.match(set, /SameSite=Lax/i);
  await c.init();
  // Client cố giả IP bằng X-Forwarded-For — app chỉ tin hop cuối (cổng vào).
  const r = await c.post('/api/auth/login', { email: u.email, password: u.password }, { headers: { 'x-forwarded-for': '1.2.3.4' } });
  assert.equal(r.status, 200);
  assert.equal((await c.get('/api/presentations')).status, 200);
  const [rows] = await app.pool.query("SELECT ip FROM audit_logs WHERE actor_id = ? AND action = 'auth.login' AND result = 'success'", [u.id]);
  const ips = rows.map((x) => x.ip);
  assert.ok(ips.length >= 2, 'có bản ghi đăng nhập');
  assert.ok(ips.every((ip) => ip === INGRESS_CLIENT_IP), `IP audit: ${ips.join(',')}`);
});

test('gọi thẳng app bằng http (không qua cổng vào) → không cấp cookie phiên (không đăng nhập được qua đường vòng)', async () => {
  const app = getApp();
  const u = await app.newUser('direct');
  const c = makeClient(app.directBase);
  const res = await c.req('GET', '/api/auth/csrf', undefined, { raw: true });
  assert.equal(res.headers.getSetCookie().filter((x) => x.startsWith('mp.sid=')).length, 0, 'không cấp cookie qua http thường');
  await c.init();
  const r = await c.post('/api/auth/login', { email: u.email, password: u.password });
  assert.notEqual((await c.get('/api/presentations')).status, 200, `đăng nhập: ${r.status}`);
});

test('production: APP_BASE_URL https mà cookie không Secure (hoặc ngược lại) → dừng khởi động', () => {
  const keep = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(40), DB_PASSWORD: 'p', GEMINI_API_KEY: 'k', APP_BASE_URL: 'https://present.example.test', SESSION_COOKIE_SECURE: 'false' });
    assert.throws(() => loadConfig(), /SESSION_COOKIE_SECURE/);
    Object.assign(process.env, { APP_BASE_URL: 'http://10.0.0.5:8080', SESSION_COOKIE_SECURE: 'true' });
    assert.throws(() => loadConfig(), /SESSION_COOKIE_SECURE/);
    Object.assign(process.env, { APP_BASE_URL: 'https://present.example.test', SESSION_COOKIE_SECURE: 'true' });
    assert.equal(loadConfig().session.cookieSecure, true);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

