// A04: khởi động lại giữa chừng — bản sao dở (source_kind='copy') luôn về 'failed' với hướng dẫn sao chép lại,
// không bị đẩy sang nhánh "dựng AI từ dàn ý"; bài AI vẫn phục hồi như cũ; bài gốc nguyên vẹn. MySQL thật.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../src/config/index.js';
import { createPresentationRepository } from '../../src/repositories/presentationRepository.js';
import { useTestDb } from './helpers/testDb.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const it = useTestDb(config, { before, after });

test('A04: phục hồi sau restart phân biệt bản sao và bài AI', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const pool = it.db().pool;
  const repo = createPresentationRepository(pool);
  const owner = randomUUID();
  await pool.execute('INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)', [owner, 'a04@it.test', 'A04', 'x'.repeat(60)]);
  const outline = (assetIds) => ({ title: 'T', slides: [{ id: 's1', layout: 'image', title: 'Ảnh', points: [], images: assetIds.map((asset) => ({ asset })) }] });
  const spec = { title: 'T', slides: [{ id: 's1', layout: 'bullets', title: 'T', items: [] }] };
  let n = 0;
  const code = () => `a04c${String((n += 1)).padStart(4, '0')}`;
  const mkAsset = (deck, id) => pool.execute("INSERT INTO assets (id, tenant_id, presentation_id, kind, mime, bytes, storage_key) VALUES (?, ?, ?, 'image', 'image/webp', 1, ?)", [id, owner, deck, `tenants/${owner}/presentations/${deck}/${id}.webp`]);

  // Bài gốc đã xong.
  const source = randomUUID();
  await pool.execute("INSERT INTO presentations (id, tenant_id, short_code, title, source_kind, status, spec, outline, outline_version) VALUES (?, ?, ?, 'Gốc', 'text', 'ready', ?, ?, 1)", [source, owner, code(), JSON.stringify(spec), JSON.stringify(outline([]))]);
  // Bản sao dở: có dàn ý với 0 / 1 / n asset đã chép, và không có dàn ý.
  const copies = {};
  for (const [name, total, copied, withOutline] of [['co-dan-y-0', 3, 0, true], ['co-dan-y-1', 3, 1, true], ['co-dan-y-n', 3, 3, true], ['khong-dan-y', 2, 1, false]]) {
    const id = randomUUID();
    const ids = Array.from({ length: total }, () => randomUUID());
    await repo.createCopy(owner, { id, code: code(), title: name, ratio: '16:9', status: 'generating', sourceLabel: 'Gốc', spec, outline: withOutline ? outline(ids) : null });
    for (const a of ids.slice(0, copied)) await mkAsset(id, a);
    copies[name] = id;
  }
  // Bài AI đang dựng (có dàn ý) và đang lập dàn ý.
  const aiBuilding = randomUUID();
  const aiOutlining = randomUUID();
  await pool.execute("INSERT INTO presentations (id, tenant_id, short_code, title, source_kind, status, outline, outline_version) VALUES (?, ?, ?, 'AI dựng', 'text', 'generating', ?, 1)", [aiBuilding, owner, code(), JSON.stringify(outline([]))]);
  await pool.execute("INSERT INTO presentations (id, tenant_id, short_code, title, source_kind, status) VALUES (?, ?, ?, 'AI dàn ý', 'file', 'outlining')", [aiOutlining, owner, code()]);

  assert.equal(await repo.failStaleGenerating(), 6);
  const [rows] = await pool.query('SELECT id, status, source_kind, error_message FROM presentations');
  const by = Object.fromEntries(rows.map((r) => [r.id, r]));
  for (const [name, id] of Object.entries(copies)) {
    assert.equal(by[id].status, 'failed', `${name}: bản sao dở không được về 'outline'`);
    assert.match(by[id].error_message, /sao chép/i, name);
  }
  assert.equal(by[aiBuilding].status, 'outline', 'bài AI đang dựng vẫn quay về bước dàn ý');
  assert.equal(by[aiOutlining].status, 'failed');
  assert.equal(by[source].status, 'ready', 'bài gốc nguyên vẹn');
  assert.equal(by[source].error_message, null);
  assert.equal(rows.filter((r) => r.source_kind === 'copy' && r.status === 'ready').length, 0, 'không có bản sao ready thiếu media');
  assert.equal(await repo.failStaleGenerating(), 0, 'chạy lại không đổi gì');
});
