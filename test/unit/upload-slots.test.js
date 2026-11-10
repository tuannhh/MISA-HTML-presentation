// CT-005: trần số lượt tải video cùng lúc — lượt vượt trần nhận 503 UPLOAD_BUSY (không để tệp tạm); client ngắt giữa chừng thì trả chỗ;
// đường tạo bài chỉ giữ chỗ khi request có tệp video; kiểm video (inspect) tối đa N tiến trình con cùng lúc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import multer from 'multer';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cappedDiskStorage } from '../../src/lib/cappedDiskStorage.js';
import { createUploadSlots } from '../../src/lib/uploadSlots.js';
import { createVideoOptimizer } from '../../src/services/videoOptimizer.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const MAX = 4;
const isVideoFile = (f) => /^video\//i.test(f.mimetype || '') || /\.(mp4|m4v|mov|webm)$/i.test(f.originalname || '');

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'slots-'));
  const slots = createUploadSlots(MAX);
  const a = express();
  const storage = cappedDiskStorage({ destination: dir, maxBytes: 1024 * 1024 });
  const videoUp = multer({ storage }).fields([{ name: 'file', maxCount: 1 }]);
  const createUp = multer({ storage, fileFilter: (req, file, cb) => cb(isVideoFile(file) ? slots.holdFor(req, req.res) : null, true) }).fields([{ name: 'media', maxCount: 3 }]);
  // Như service thật: dùng xong thì xoá tệp tạm → thư mục trống nghĩa là lượt bị từ chối / bị ngắt không để lại gì.
  const cleanup = (req) => Object.values(req.files || {}).flat().forEach((f) => rmSync(f.path, { force: true }));
  a.post('/videos', slots.hold, videoUp, (req, res) => (cleanup(req), res.json({ ok: true })));
  a.post('/create', createUp, (req, res) => (cleanup(req), res.json({ ok: true })));
  a.use(errorHandler({ isProd: false }));
  const server = await new Promise((r) => { const s = a.listen(0, '127.0.0.1', () => r(s)); });
  try {
    await fn({ port: server.address().port, dir, slots });
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
}

// Mở 1 lượt tải dở: gửi đầu multipart + ít byte rồi giữ nguyên (chưa kết thúc) — lượt này đang chiếm chỗ.
function openUpload(port, path, { field, filename, type }) {
  const b = `----t${Math.random().toString(36).slice(2)}`;
  const req = http.request({ port, path, method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'transfer-encoding': 'chunked' } });
  req.on('error', () => {});
  const done = new Promise((resolve) => req.on('response', (res) => { let body = ''; res.on('data', (c) => (body += c)); res.on('end', () => resolve({ status: res.statusCode, body, retryAfter: res.headers['retry-after'] })); }));
  req.write(`--${b}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`);
  req.write(Buffer.alloc(1024, 97));
  return { req, done, finish: () => { req.write('\r\n'); req.end(`--${b}--\r\n`); return done; } };
}
const wait = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const vid = (path, field) => openUpload(path === '/videos' ? PORT.v : PORT.v, path, { field, filename: 'a.mp4', type: 'video/mp4' });
const PORT = { v: 0 };

test('POST /videos: 4 lượt đang tải, lượt thứ 5 → 503 UPLOAD_BUSY + Retry-After, không tệp tạm; có chỗ trống lại thì nhận', async () => {
  await withServer(async ({ port, dir, slots }) => {
    PORT.v = port;
    const open = Array.from({ length: MAX }, () => vid('/videos', 'file'));
    await wait();
    assert.equal(slots.stats().used, MAX);
    const fifth = openUpload(port, '/videos', { field: 'file', filename: 'a.mp4', type: 'video/mp4' });
    const r5 = await fifth.finish();
    assert.equal(r5.status, 503, r5.body);
    assert.match(r5.body, /UPLOAD_BUSY/);
    assert.equal(r5.retryAfter, '60');
    assert.equal(slots.stats().used, MAX, 'lượt bị từ chối không giữ chỗ');
    // Client ngắt giữa chừng → trả chỗ.
    open[0].req.destroy();
    await wait(150);
    assert.equal(slots.stats().used, MAX - 1);
    const sixth = await vid('/videos', 'file').finish();
    assert.equal(sixth.status, 200, sixth.body);
    // 3 lượt còn lại hoàn tất → trả hết chỗ, không còn tệp tạm.
    await Promise.all(open.slice(1).map((o) => o.finish()));
    await wait(100);
    assert.equal(slots.stats().used, 0);
    assert.deepEqual(readdirSync(dir), [], 'không còn tệp tạm');
  });
});

test('đường tạo bài: chỉ request có tệp video mới giữ chỗ; tệp thường không bị trần video chặn', async () => {
  await withServer(async ({ port, slots }) => {
    PORT.v = port;
    const open = Array.from({ length: MAX }, () => openUpload(port, '/create', { field: 'media', filename: 'v.mov', type: 'application/octet-stream' }));
    await wait();
    assert.equal(slots.stats().used, MAX, 'đuôi .mov cũng nhận ra là video');
    const img = await openUpload(port, '/create', { field: 'media', filename: 'a.png', type: 'image/png' }).finish();
    assert.equal(img.status, 200, 'ảnh không giữ chỗ video');
    const v5 = await openUpload(port, '/create', { field: 'media', filename: 'v.mp4', type: 'video/mp4' }).finish();
    assert.equal(v5.status, 503, v5.body);
    assert.match(v5.body, /UPLOAD_BUSY/);
    await Promise.all(open.map((o) => o.finish()));
    await wait(100);
    assert.equal(slots.stats().used, 0);
  });
});

test('createUploadSlots: nhiều tệp video trong 1 request chỉ tốn 1 chỗ', () => {
  const slots = createUploadSlots(1);
  const res = { once() {}, set() {} };
  const req = {};
  assert.equal(slots.take(req, res), true);
  assert.equal(slots.take(req, res), true);
  assert.equal(slots.stats().used, 1);
  assert.equal(slots.take({}, res), false);
});

test('videoOptimizer.inspect: 30 lượt đồng thời → tối đa 3 ffprobe cùng lúc; stats phản ánh công đoạn kiểm', async () => {
  let running = 0;
  let peak = 0;
  const video = {
    available: async () => true,
    probe: async () => {
      running += 1;
      peak = Math.max(peak, running);
      await wait(15);
      running -= 1;
      return { duration: 1, width: 10, height: 10, vcodec: 'h264' };
    },
    poster: async () => null,
  };
  const opt = createVideoOptimizer({ assets: {}, storage: {}, video, logger: { warn() {}, info() {} }, tmpDir: '/x' });
  const all = Promise.all(Array.from({ length: 30 }, () => opt.inspect('/x.mp4')));
  await wait(5);
  const st = opt.stats();
  assert.equal(st.inspecting, 3);
  assert.equal(st.inspectPending, 27);
  const out = await all;
  assert.equal(out.length, 30);
  assert.equal(peak, 3);
  assert.equal(opt.stats().inspecting, 0);
});
