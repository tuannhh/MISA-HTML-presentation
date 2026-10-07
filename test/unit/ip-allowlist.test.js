// Giới hạn truy cập theo IP (IP_ALLOWLIST): so khớp IP/CIDR/khoảng, cấu hình fail-fast, middleware + trust proxy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createIpMatcher, parseIpAllowlist } from '../../src/lib/ipAllowlist.js';
import { ipAllowlist } from '../../src/middleware/ipAllowlist.js';
import { loadConfig } from '../../src/config/index.js';

test('so khớp: IP đơn, CIDR, khoảng, IPv6, IPv4-mapped; rỗng = không giới hạn', () => {
  const allowed = createIpMatcher(['203.0.113.0/24', '10.1.2.3', '2001:db8::/32', '198.51.100.10-198.51.100.20']);
  for (const ip of ['203.0.113.9', '::ffff:203.0.113.9', '10.1.2.3', '2001:db8::1', '198.51.100.15']) assert.equal(allowed(ip), true, ip);
  for (const ip of ['10.1.2.4', '203.0.114.1', '2001:db9::1', '198.51.100.21', '127.0.0.1', '', 'abc', undefined]) assert.equal(allowed(ip), false, String(ip));
  assert.equal(createIpMatcher([]), null);
  assert.equal(createIpMatcher(['', ' ']), null);
});

test('mục sai bị báo lỗi (không lặng lẽ bỏ qua)', () => {
  assert.deepEqual(
    parseIpAllowlist(['1.2.3.4/33', 'misa.vn', '1.2.3.9-1.2.3.1', '1.2.3.4/', '1.2.3.4-::1', '1.2.3.4/8/1', '::/0', '0.0.0.0/0']).errors,
    ['1.2.3.4/33', 'misa.vn', '1.2.3.9-1.2.3.1', '1.2.3.4/', '1.2.3.4-::1', '1.2.3.4/8/1'],
  );
  assert.throws(() => createIpMatcher(['1.2.3.4', 'x']), /IP_ALLOWLIST/);
});

test('cấu hình: IP_ALLOWLIST tách theo phẩy/khoảng trắng, mục sai → không khởi động', () => {
  const keep = { IP_ALLOWLIST: process.env.IP_ALLOWLIST, NODE_ENV: process.env.NODE_ENV };
  process.env.NODE_ENV = 'test'; // không đòi GEMINI_API_KEY
  try {
    process.env.IP_ALLOWLIST = ' 10.0.0.0/8, 192.0.2.1\n2001:db8::/32 ';
    assert.deepEqual([...loadConfig().ipAllowlist], ['10.0.0.0/8', '192.0.2.1', '2001:db8::/32']);
    process.env.IP_ALLOWLIST = '10.0.0.0/8,10.0.0.300';
    assert.throws(() => loadConfig(), /IP_ALLOWLIST có mục không hợp lệ: 10\.0\.0\.300/);
    process.env.IP_ALLOWLIST = '';
    assert.deepEqual([...loadConfig().ipAllowlist], []);
  } finally {
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

async function serve(entries, trustProxy) {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.use(ipAllowlist(entries));
  app.get('/api/health', (_req, res) => res.json({ ok: 1 }));
  app.get('/api/x', (_req, res) => res.json({ ok: 1 }));
  app.get('/', (_req, res) => res.send('app'));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (p, headers = {}) => fetch(base + p, { headers });
  return { get, close: () => new Promise((r) => server.close(r)) };
}

test('middleware: chặn IP ngoài danh sách (API → JSON, giao diện → trang 403), healthcheck luôn qua', async () => {
  const s = await serve(['192.0.2.0/24'], 0);
  try {
    const api = await s.get('/api/x');
    assert.equal(api.status, 403);
    assert.equal((await api.json()).error.code, 'IP_NOT_ALLOWED');
    const page = await s.get('/');
    assert.equal(page.status, 403);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /mạng nội bộ MISA/);
    assert.equal((await s.get('/api/health')).status, 200);
    // Không tin X-Forwarded-For khi TRUST_PROXY=0 → không giả IP được.
    assert.equal((await s.get('/api/x', { 'X-Forwarded-For': '192.0.2.5' })).status, 403);
  } finally {
    await s.close();
  }
});

test('middleware: sau 1 proxy (TRUST_PROXY=1) dùng IP do proxy ghi, chèn thêm IP giả phía trước vô hiệu', async () => {
  const s = await serve(['192.0.2.0/24'], 1);
  try {
    assert.equal((await s.get('/api/x', { 'X-Forwarded-For': '192.0.2.5' })).status, 200);
    assert.equal((await s.get('/api/x', { 'X-Forwarded-For': '203.0.113.1' })).status, 403);
    // Client tự gửi "192.0.2.5", proxy nối IP thật 203.0.113.1 vào cuối → vẫn chặn.
    assert.equal((await s.get('/api/x', { 'X-Forwarded-For': '192.0.2.5, 203.0.113.1' })).status, 403);
  } finally {
    await s.close();
  }
  const open = await serve([], 0);
  try {
    assert.equal((await open.get('/api/x')).status, 200, 'danh sách rỗng → không giới hạn');
  } finally {
    await open.close();
  }
});
