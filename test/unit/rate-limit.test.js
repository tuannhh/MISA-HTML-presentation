// Hồi quy F04: giới hạn tần suất API tính THEO NGƯỜI DÙNG (sau đăng nhập), không dồn cả văn phòng vào 1 IP (NAT/proxy MISA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { rateLimits } from '../../src/middleware/security.js';

const RATE = { ipPerMin: 1000, userPerMin: 5, anonPerMin: 3 };

async function start() {
  const limits = rateLimits(RATE);
  const app = express();
  app.set('trust proxy', 0);
  app.use(limits.apiIp);
  // Giả lập loadUser: header x-user quyết định người dùng (tất cả cùng 1 IP 127.0.0.1).
  app.use((req, _res, next) => {
    if (req.get('x-user')) req.user = { id: req.get('x-user') };
    next();
  });
  app.use(limits.api);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const hit = async (user) => (await fetch(`http://127.0.0.1:${server.address().port}/ping`, { headers: user ? { 'x-user': user } : {} })).status;
  return { hit, close: () => server.close() };
}

test('F04: nhiều người dùng chung 1 IP — mỗi người có hạn mức riêng, người này vượt không chặn người kia', async () => {
  const { hit, close } = await start();
  try {
    for (const u of ['u1', 'u2', 'u3']) for (let i = 0; i < RATE.userPerMin; i += 1) assert.equal(await hit(u), 200, `${u} lần ${i + 1}`);
    assert.equal(await hit('u1'), 429, 'u1 vượt hạn mức của chính mình');
    assert.equal(await hit('u4'), 200, 'người khác cùng IP không bị ảnh hưởng');
  } finally { close(); }
});

test('F04: chưa đăng nhập tính theo IP với hạn mức chặt hơn; không ảnh hưởng người đã đăng nhập', async () => {
  const { hit, close } = await start();
  try {
    for (let i = 0; i < RATE.anonPerMin; i += 1) assert.equal(await hit(null), 200);
    assert.equal(await hit(null), 429);
    assert.equal(await hit('u1'), 200);
  } finally { close(); }
});

test('F04: tầng IP chỉ là chốt chặn lụt (trần cao, cấu hình được)', async () => {
  const limits = rateLimits({ ipPerMin: 2, userPerMin: 100, anonPerMin: 100 });
  const app = express();
  app.use(limits.apiIp);
  app.get('/ping', (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.status || 500).json({ code: err.code }));
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const url = `http://127.0.0.1:${server.address().port}/ping`;
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 429);
  } finally { server.close(); }
});
