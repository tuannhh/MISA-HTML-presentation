// Hồi quy A03: hàng đợi tạo/dựng bài nhận tối đa generationConcurrency + 20 job, kể cả khi nhiều yêu cầu cùng lúc
// đi qua các bước await (ghi DB, audit) trước khi vào hàng; lỗi DB trả lại chỗ; tạo bài và dựng bài dùng chung hạn mức.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';
import { Semaphore } from '../../src/lib/semaphore.js';

process.env.NODE_ENV = 'test';
const config = loadConfig();
const CAP = config.limits.generationConcurrency + 20;
const tick = () => new Promise((r) => setTimeout(r, 0));

// AI giả: mọi lời gọi chờ tới khi test thả (finishAll) rồi lỗi → job kết thúc, giải phóng hàng.
function fakeAi() {
  const waiting = [];
  const hang = () => new Promise((_, reject) => waiting.push(() => reject(new Error('AI giả dừng'))));
  return { gemini: { designDeck: hang, outline: hang, createOutline: hang, generateOutline: hang }, finishAll: () => waiting.splice(0).forEach((f) => f()) };
}

function makeService({ startBuild, create } = {}) {
  const ai = fakeAi();
  const repos = {
    presentations: {
      async findOwned(tenantId, id) { return { id, tenant_id: tenantId, status: 'outline', outline_version: 1, outline: { title: 'T', slides: [] } }; },
      startBuildOwned: startBuild || (async () => 1),
      createForTenant: create || (async () => 1),
      async buildFailed() {},
      async setGenerationResult() {},
      async setOutlineResult() {},
    },
    assets: { async listOwnedForPresentation() { return []; } },
    versions: {},
  };
  const svc = createPresentationService({ config, repos, storage: {}, gemini: new Proxy(ai.gemini, { get: (t, k) => t[k] || t.designDeck }), browser: {}, signer: {}, audit: { async record() {} }, stock: {} });
  return { svc, ai };
}

// Số chỗ của hàng + job còn trong bộ theo dõi (giao diện hàng đợi) — lỗi/hoàn tất đều phải trả về 0.
const slots = (svc) => {
  const q = svc.queueStats();
  return { active: q.active, pending: q.pending, reserved: q.reserved, oldestWaitSec: q.oldestWaitSec, longestRunSec: q.longestRunSec };
};

test('Semaphore.reserve: giữ chỗ đồng bộ, không vượt max + maxPending; release trả chỗ; slot chuyển thẳng cho job chờ', async () => {
  const q = new Semaphore(2);
  const tickets = [];
  for (let i = 0; i < 10; i += 1) tickets.push(q.reserve(3));
  assert.equal(tickets.filter(Boolean).length, 5);
  tickets[0].release();
  assert.ok(q.reserve(3), 'chỗ được trả lại');
  assert.equal(q.reserve(3), null);
  let done;
  const gate = new Promise((r) => { done = r; });
  const live = tickets.slice(1, 5).map((t) => t.run(() => gate));
  assert.equal(q.pending, 2);
  assert.equal(q.reserve(3), null, 'vẫn đầy (2 chạy + 2 chờ + 1 vé chưa dùng)');
  assert.throws(() => tickets[1].run(() => 1), /đã dùng/);
  done();
  await Promise.all(live);
  assert.equal(q.active, 0);
  assert.equal(q.pending, 0);
});

test('A03: 50 yêu cầu dựng bài cùng lúc (rào chắn ở bước ghi DB) → nhận tối đa concurrency + 20, còn lại QUEUE_FULL', async () => {
  let entered = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const { svc, ai } = makeService({ startBuild: async () => { entered += 1; await gate; return 1; } });
  const settled = Promise.allSettled(Array.from({ length: 50 }, (_, i) => svc.build({ id: `u${i}` }, `d${i}`, { outlineVersion: 1 }, null)));
  while (entered < CAP) await tick();
  await tick();
  assert.equal(entered, CAP, 'chỉ yêu cầu đã giữ chỗ mới chạm DB');
  release();
  const res = await settled;
  const ok = res.filter((r) => r.status === 'fulfilled').length;
  const full = res.filter((r) => r.status === 'rejected' && r.reason.code === 'QUEUE_FULL').length;
  assert.equal(ok, CAP);
  assert.equal(full, 50 - CAP);
  assert.ok(svc.queueStats().pending <= 20, JSON.stringify(svc.queueStats()));
  ai.finishAll();
});

test('A03: lỗi ghi DB/không đúng trạng thái → trả chỗ; nhiều vòng không rò chỗ', async () => {
  let fail = true;
  const { svc, ai } = makeService({ startBuild: async () => { if (fail) throw new Error('DB lỗi'); return 1; } });
  for (let round = 0; round < 3; round += 1) {
    const res = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => svc.build({ id: `u${i}` }, `d${i}`, { outlineVersion: 1 }, null)));
    assert.ok(res.every((r) => r.status === 'rejected' && ['DB lỗi', 'Hệ thống đang xử lý nhiều yêu cầu, vui lòng thử lại sau ít phút'].includes(r.reason.message)), `vòng ${round}`);
    assert.deepEqual(slots(svc), { active: 0, pending: 0, reserved: 0, oldestWaitSec: 0, longestRunSec: 0 }, `vòng ${round}: lỗi đã trả hết chỗ`);
  }
  fail = false;
  const res = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => svc.build({ id: `u${i}` }, `d${i}`, { outlineVersion: 1 }, null)));
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, CAP, 'đủ chỗ sau các vòng lỗi');
  ai.finishAll();
  for (let i = 0; i < 20 && (svc.queueStats().pending || svc.queueStats().active); i += 1) { await tick(); ai.finishAll(); }
  assert.deepEqual(slots(svc), { active: 0, pending: 0, reserved: 0, oldestWaitSec: 0, longestRunSec: 0 });
  const again = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => svc.build({ id: `v${i}` }, `e${i}`, { outlineVersion: 1 }, null)));
  assert.equal(again.filter((r) => r.status === 'fulfilled').length, CAP, 'job xong trả chỗ');
  ai.finishAll();
});

test('A03: tạo bài và dựng bài dùng chung hạn mức', async () => {
  const { svc, ai } = makeService();
  const created = await Promise.allSettled(Array.from({ length: CAP }, (_, i) => svc.create({ id: `u${i}` }, { text: 'Nội dung bài trình bày thử nghiệm đủ dài để qua kiểm tra nguồn văn bản.' }, null)));
  assert.equal(created.filter((r) => r.status === 'fulfilled').length, CAP, JSON.stringify(created.find((r) => r.status === 'rejected')?.reason?.message));
  await assert.rejects(svc.build({ id: 'x' }, 'dx', { outlineVersion: 1 }, null), (e) => e.code === 'QUEUE_FULL');
  await assert.rejects(svc.create({ id: 'y' }, { text: 'Nội dung bài trình bày thử nghiệm đủ dài để qua kiểm tra nguồn văn bản.' }, null), (e) => e.code === 'QUEUE_FULL');
  ai.finishAll();
});
