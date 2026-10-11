// F06: tổng dung lượng upload được đếm theo byte THỰC NHẬN (kể cả request chunked không có Content-Length) và tệp tạm bị xoá khi vượt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import multer from 'multer';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cappedDiskStorage } from '../../src/lib/cappedDiskStorage.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const CAP = 100 * 1024; // 100 KB tổng
const PER_FILE = 80 * 1024; // mỗi tệp tối đa 80 KB

function app(dir) {
  const a = express();
  const up = multer({ storage: cappedDiskStorage({ destination: dir, maxBytes: CAP }), limits: { fileSize: PER_FILE, files: 5 } }).fields([{ name: 'files', maxCount: 5 }]);
  a.post('/up', up, (req, res) => res.json({ ok: true, n: (req.files?.files || []).length }));
  a.use(errorHandler({ isProd: false }));
  return a;
}

// Gửi multipart bằng chunked (không Content-Length) gồm các tệp có kích thước cho trước.
function send(port, sizes) {
  return new Promise((resolve, reject) => {
    const b = '----t' + Date.now();
    const req = http.request({ port, path: '/up', method: 'POST', headers: { 'content-type': `multipart/form-data; boundary=${b}`, 'transfer-encoding': 'chunked' } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    sizes.forEach((n, i) => {
      req.write(`--${b}\r\nContent-Disposition: form-data; name="files"; filename="f${i}.bin"\r\nContent-Type: application/octet-stream\r\n\r\n`);
      req.write(Buffer.alloc(n, 97));
      req.write('\r\n');
    });
    req.end(`--${b}--\r\n`);
  });
}

async function withServer(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cap-'));
  const server = await new Promise((r) => { const s = app(dir).listen(0, '127.0.0.1', () => r(s)); });
  try {
    await fn(server.address().port, dir);
  } finally {
    server.close();
  }
}

test('F06: nhiều tệp, mỗi tệp dưới giới hạn nhưng tổng vượt → 413, không còn tệp tạm', async () => {
  await withServer(async (port, dir) => {
    const r = await send(port, [60 * 1024, 60 * 1024]);
    assert.equal(r.status, 413, r.body);
    assert.match(r.body, /UPLOAD_TOO_LARGE/);
    await new Promise((x) => setTimeout(x, 100));
    assert.deepEqual(readdirSync(dir), [], 'tệp tạm phải được xoá');
  });
});

test('F06: tổng trong giới hạn → nhận đủ', async () => {
  await withServer(async (port, dir) => {
    const r = await send(port, [30 * 1024, 30 * 1024]);
    assert.equal(r.status, 200, r.body);
    assert.equal(JSON.parse(r.body).n, 2);
    assert.equal(readdirSync(dir).length, 2);
  });
});
