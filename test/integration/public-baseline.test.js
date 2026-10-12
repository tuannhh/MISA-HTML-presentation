// A06: bật công khai và chụp bản gốc nằm trong CÙNG 1 giao dịch (khoá dòng bài) — chụp lỗi thì bài không bị công khai dở dang;
// bật công khai đồng thời chỉ tạo 1 bản gốc; sửa nội dung + bật công khai cùng yêu cầu → bản gốc là nội dung SAU yêu cầu đó.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createContainer } from '../../src/container.js';
import { useTestDb } from './helpers/testDb.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const it = useTestDb(config, { before, after });

const spec = (title) => ({ title, slides: [{ id: 's1', layout: 'bullets', title, subtitle: '', items: [] }] });

async function setup() {
  const pool = it.db().pool;
  const dir = await mkdtemp(path.join(tmpdir(), 'mp-a06-'));
  const cfg = { ...config, storage: { ...config.storage, root: dir, privateDir: path.join(dir, 'private'), tempDir: path.join(dir, 'temp'), uploadDir: path.join(dir, 'uploads') } };
  const { services } = await createContainer(cfg, pool, { gemini: {}, browser: { async close() {} }, stock: {} });
  const user = { id: randomUUID(), email: `a06-${Date.now()}@it.test`, role: 'user' };
  await pool.execute('INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)', [user.id, user.email, 'A06', 'x'.repeat(60)]);
  let n = 0;
  const mkDeck = async () => {
    const id = randomUUID();
    await pool.execute("INSERT INTO presentations (id, tenant_id, short_code, title, source_kind, status, spec, slide_count) VALUES (?, ?, ?, 'Bài', 'text', 'ready', ?, 1)", [id, user.id, `a06${Date.now().toString(36).slice(-3)}${(n += 1)}`.slice(0, 8).padEnd(8, '0'), JSON.stringify(spec('Gốc'))]);
    return id;
  };
  const row = async (id) => (await pool.execute('SELECT visibility, published_at, spec_version FROM presentations WHERE id = ?', [id]))[0][0];
  const baselines = async (id) => (await pool.execute("SELECT spec, spec_version FROM presentation_versions WHERE presentation_id = ? AND kind = 'baseline'", [id]))[0];
  return { pool, svc: services.presentations, sharing: services.sharing, user, mkDeck, row, baselines, cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test('A06: chụp bản gốc lỗi → bài vẫn riêng tư, không có bản gốc', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const id = await s.mkDeck();
    await s.pool.query('RENAME TABLE presentation_versions TO presentation_versions_off');
    try {
      await assert.rejects(s.svc.update(s.user, id, { visibility: 'public' }, null));
    } finally {
      await s.pool.query('RENAME TABLE presentation_versions_off TO presentation_versions');
    }
    const r = await s.row(id);
    assert.equal(r.visibility, 'private', 'không công khai dở dang khi chưa có bản gốc');
    assert.equal(r.published_at, null);
    assert.equal((await s.baselines(id)).length, 0);
  } finally {
    await s.cleanup();
  }
});

test('A06: bật công khai đồng thời → đúng 1 bản gốc; tắt/bật lại không chụp lại', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const id = await s.mkDeck();
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => s.svc.update(s.user, id, { visibility: 'public' }, null)));
    assert.ok(res.every((r) => r.status === 'fulfilled'), JSON.stringify(res.find((r) => r.status === 'rejected')?.reason?.message));
    assert.equal((await s.row(id)).visibility, 'public');
    assert.equal((await s.baselines(id)).length, 1);
    await s.svc.update(s.user, id, { visibility: 'private' }, null);
    await s.svc.update(s.user, id, { visibility: 'public' }, null);
    assert.equal((await s.baselines(id)).length, 1);
  } finally {
    await s.cleanup();
  }
});

test('A06: sửa nội dung + bật công khai cùng 1 yêu cầu → bản gốc là nội dung sau yêu cầu; sai phiên bản → không đổi gì', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const id = await s.mkDeck();
    await assert.rejects(s.svc.update(s.user, id, { visibility: 'public', spec: spec('Mới'), specVersion: 99 }, null), (e) => e.code === 'VERSION_CONFLICT');
    assert.equal((await s.row(id)).visibility, 'private');
    assert.equal((await s.baselines(id)).length, 0);
    await s.svc.update(s.user, id, { visibility: 'public', spec: spec('Mới'), specVersion: (await s.row(id)).spec_version }, null);
    const [b] = await s.baselines(id);
    const saved = typeof b.spec === 'string' ? JSON.parse(b.spec) : b.spec;
    assert.equal(saved.slides[0].title, 'Mới');
    assert.equal(b.spec_version, (await s.row(id)).spec_version);
  } finally {
    await s.cleanup();
  }
});

test('A06: mời người lần đầu + bật công khai cùng lúc → đúng 1 bản gốc, không deadlock', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const id = await s.mkDeck();
    const guests = [];
    for (let i = 0; i < 3; i += 1) {
      const g = { id: randomUUID(), email: `a06-g${i}-${Date.now()}@it.test` };
      await s.pool.execute('INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)', [g.id, g.email, 'Khách', 'x'.repeat(60)]);
      guests.push(g);
    }
    const res = await Promise.allSettled([
      ...guests.map((g) => s.sharing.addShare(s.user, id, { email: g.email, role: 'viewer' }, null)),
      s.svc.update(s.user, id, { visibility: 'public' }, null),
    ]);
    assert.ok(res.every((r) => r.status === 'fulfilled'), JSON.stringify(res.find((r) => r.status === 'rejected')?.reason?.message));
    assert.equal((await s.baselines(id)).length, 1);
    const [[{ n }]] = await s.pool.execute('SELECT COUNT(*) AS n FROM presentation_shares WHERE presentation_id = ?', [id]);
    assert.equal(Number(n), 3);
  } finally {
    await s.cleanup();
  }
});
