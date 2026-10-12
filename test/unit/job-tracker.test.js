// Giao diện hàng đợi (roadmap B): vị trí chờ FIFO, thời gian chờ/xử lý đo được, ước lượng theo trung bình trượt; job xong → null.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJobTracker } from '../../src/lib/jobTracker.js';
import { Semaphore } from '../../src/lib/semaphore.js';

test('đã nhận → đang chờ (vị trí, ước lượng) → đang xử lý (đã chạy, còn lại) → xong', async () => {
  let t = 0;
  const tracker = createJobTracker({ concurrency: 1, now: () => t });
  const sem = new Semaphore(1);
  const gates = {};
  const job = (id, kind) => {
    let open;
    gates[id] = new Promise((r) => {
      open = r;
    });
    gates[id].open = open;
    return sem.run(tracker.wrap(id, kind, () => gates[id]));
  };

  // Chưa có số đo: vị trí đúng, ước lượng null (giao diện ghi "đang ước tính").
  const p1 = job('a', 'outline');
  t = 1000;
  const p2 = job('b', 'outline');
  t = 2000;
  const p3 = job('c', 'build');
  await Promise.resolve();
  assert.equal(tracker.info('a').state, 'running');
  assert.deepEqual([tracker.info('b').position, tracker.info('c').position], [1, 2]);
  assert.equal(tracker.info('b').etaSec, null);

  t = 61000; // a chạy 61 giây
  gates.a.open();
  await p1;
  await new Promise((r) => setImmediate(r));
  assert.equal(tracker.info('a'), null, 'job xong không còn trong hàng');
  assert.equal(tracker.info('b').state, 'running');
  assert.equal(tracker.info('b').waitedSec, 60);
  const c = tracker.info('c');
  assert.equal(c.state, 'waiting');
  assert.equal(c.position, 1);
  assert.equal(c.startInSec, 61, 'bắt đầu sau ≈ 1 lượt × 61 giây (trung bình đo được của job dàn ý)');

  t = 91000;
  assert.equal(tracker.info('b').elapsedSec, 30);
  assert.equal(tracker.info('b').etaSec, 31, 'còn ≈ trung bình − đã chạy');
  const st = tracker.stats();
  assert.equal(st.avgOutlineSec, 61);
  assert.equal(st.oldestWaitSec, 89);
  gates.b.open();
  await p2;
  await new Promise((r) => setImmediate(r));
  gates.c.open();
  await p3;
  assert.equal(tracker.stats().longestRunSec, 0);
});

test('job lỗi vẫn rời hàng và vẫn được tính thời gian', async () => {
  let t = 0;
  const tracker = createJobTracker({ concurrency: 2, now: () => t });
  const run = tracker.wrap('x', 'build', async () => {
    t = 5000;
    throw new Error('AI lỗi');
  });
  await assert.rejects(run(), /AI lỗi/);
  assert.equal(tracker.info('x'), null);
  assert.equal(tracker.stats().avgBuildSec, 5);
});
