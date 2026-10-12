// Đo tải 500 người (roadmap B) lộ 2 lỗi: (1) mỗi lần lưu thêm 1 lượt chụp ảnh bìa vào hàng trình duyệt không trần → RAM phình,
// xuất PDF chờ quá 180 giây; (2) hàng chờ kết nối DB đầy → 500 chung. Test khoá lại hành vi đã sửa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoalescingQueue } from '../../src/lib/coalescingQueue.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

test('hàng ảnh bìa: gộp theo bài, chạy lần lượt, lỗi 1 bài không dừng hàng', async () => {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const gates = [];
  const errors = [];
  const q = createCoalescingQueue(async (id, tenant) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    calls.push(`${id}:${tenant}`);
    await new Promise((r) => gates.push(r));
    active -= 1;
    if (id === 'loi') throw new Error('hỏng');
  }, { onError: (id, err) => errors.push(`${id}:${err.message}`) });

  q.push('a', 't1');
  // Trong lúc 'a' đang chụp: lưu b 50 lần, a thêm 1 lần, bài lỗi 1 lần → hàng chỉ còn 3 mã.
  for (let i = 0; i < 50; i += 1) q.push('b', 't1');
  q.push('loi', 't2');
  q.push('a', 't1-moi');
  assert.equal(q.pending, 3);
  while (q.running) {
    gates.shift()?.();
    await tick();
  }
  assert.deepEqual(calls, ['a:t1', 'b:t1', 'loi:t2', 'a:t1-moi']);
  assert.equal(maxActive, 1);
  assert.deepEqual(errors, ['loi:hỏng']);
  assert.equal(q.pending, 0);
});

function run(err) {
  const res = {
    headers: {},
    statusCode: 0,
    body: null,
    headersSent: false,
    get(k) { return this.headers[k]; },
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  errorHandler({ isProd: true })(err, { id: 'r1', method: 'GET', path: '/api/x' }, res, () => {});
  return res;
}

test('hàng chờ kết nối DB đầy (mysql2 queueLimit) → 503 SERVER_BUSY + Retry-After, không phải 500', () => {
  const res = run(new Error('Queue limit reached.'));
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.code, 'SERVER_BUSY');
  assert.equal(res.headers['Retry-After'], '30');
  assert.equal(run(new Error('lỗi khác')).statusCode, 500);
});
