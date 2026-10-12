// Giới hạn tần suất KHÔNG dựa vào IP: người dùng vào qua mạng/VPN MISA nên chung 1 IP, lớp mạng MISA đã kiểm soát truy cập.
// Hạn mức chung tính theo người dùng đã đăng nhập; đăng nhập sai tính theo email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { rateLimits } from '../../src/middleware/security.js';

// ipPerMin/anonPerMin là cấu hình theo IP đã bỏ — truyền vào để chắc chắn chúng không còn tác dụng.
const RATE = { userPerMin: 5, ipPerMin: 10, anonPerMin: 3 };

async function listen(app) {
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

async function startApi(limits = rateLimits(RATE)) {
  const app = express();
  app.set('trust proxy', 0);
  // Giả lập loadUser: header x-user quyết định người dùng (tất cả cùng 1 IP 127.0.0.1).
  app.use((req, _res, next) => {
    if (req.get('x-user')) req.user = { id: req.get('x-user') };
    next();
  });
  app.use(limits.api);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  const { url, close } = await listen(app);
  const hit = async (user) => (await fetch(`${url}/ping`, { headers: user ? { 'x-user': user } : {} })).status;
  return { hit, close };
}

test('nhiều người dùng chung 1 IP — mỗi người có hạn mức riêng, người này vượt không chặn người kia', async () => {
  const { hit, close } = await startApi();
  try {
    for (const u of ['u1', 'u2', 'u3']) for (let i = 0; i < RATE.userPerMin; i += 1) assert.equal(await hit(u), 200, `${u} lần ${i + 1}`);
    assert.equal(await hit('u1'), 429, 'u1 vượt hạn mức của chính mình');
    assert.equal(await hit('u4'), 200, 'người khác cùng IP không bị ảnh hưởng');
  } finally { close(); }
});

test('yêu cầu chưa đăng nhập không bị đếm theo IP (cả văn phòng/VPN chung 1 IP)', async () => {
  const { hit, close } = await startApi();
  try {
    for (let i = 0; i < 50; i += 1) assert.equal(await hit(null), 200, `lần ${i + 1}`);
    assert.equal(await hit('u1'), 200, 'người đã đăng nhập không bị ảnh hưởng');
  } finally { close(); }
});

test('không còn tầng chặn lụt theo IP', () => {
  assert.equal(rateLimits(RATE).apiIp, undefined);
});

test('đăng nhập sai tính theo email: đổi IP không né được, email khác không bị chặn lây', async () => {
  const limits = rateLimits(RATE);
  const app = express();
  // Cho phép giả IP qua X-Forwarded-For để kiểm khoá không phụ thuộc IP.
  app.set('trust proxy', true);
  app.use(express.json());
  app.post('/login', limits.login, (_req, res) => res.json({ ok: true }));
  const { url, close } = await listen(app);
  const login = async (email, ip) => (await fetch(`${url}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  })).status;
  try {
    for (let i = 0; i < 10; i += 1) assert.equal(await login('a@misa.com.vn', `10.0.0.${i + 1}`), 200, `lần ${i + 1}`);
    assert.equal(await login('A@misa.com.vn', '10.0.0.99'), 429, 'cùng email (khác hoa/thường), IP mới vẫn bị chặn');
    assert.equal(await login('b@misa.com.vn', '10.0.0.1'), 200, 'email khác cùng IP không bị chặn');
  } finally { close(); }
});
