// Kiểm thử đồng thời trên MySQL THẬT (F07): 2 quản trị viên hạ quyền nhau cùng lúc; mời song song không vượt trần người.
// Database tạm tên duy nhất mỗi lần chạy, dựng từ startup/database/schema.sql, xoá sau khi chạy — xem helpers/testDb.mjs.
// Chạy: IT_DB_HOST=127.0.0.1 IT_DB_PORT=… IT_DB_USER=… IT_DB_PASSWORD=… npm run test:integration   (xem test/integration/README.md)
// Không dựng được database → FAIL (chỉ IT_OPTIONAL=1 mới skip).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { loadConfig } from '../../src/config/index.js';
import { createUserRepository } from '../../src/repositories/userRepository.js';
import { createShareRepository } from '../../src/repositories/shareRepository.js';
import { useTestDb } from './helpers/testDb.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const it = useTestDb(config, { before, after });
const pool = () => it.db().pool;

const mkUser = async (role = 'user') => {
  const id = randomUUID();
  await pool().execute('INSERT INTO users (id, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, `${id}@it.test`, 'IT', 'x'.repeat(60), role]);
  return id;
};

test('F07: 2 quản trị viên hạ quyền nhau cùng lúc → đúng 1 thành công, luôn còn ≥ 1 admin hoạt động', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const users = createUserRepository(pool());
  for (let round = 0; round < 15; round += 1) {
    await pool().execute("DELETE FROM users WHERE email LIKE '%@it.test'");
    const a = await mkUser('admin');
    const b = await mkUser('admin');
    const [r1, r2] = await Promise.all([users.updateAdminFieldsGuarded(a, { role: 'user' }), users.updateAdminFieldsGuarded(b, { role: 'user' })]);
    const ok = [r1, r2].filter((r) => r.ok).length;
    const last = [r1, r2].filter((r) => r.error === 'LAST_ADMIN').length;
    assert.equal(ok, 1, `vòng ${round}: ${JSON.stringify([r1, r2])}`);
    assert.equal(last, 1);
    const [[{ n }]] = await pool().execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'");
    assert.equal(Number(n), 1);
  }
});

test('F07: khoá tài khoản (disabled) cũng được bảo vệ như hạ quyền; admin khác vẫn hạ được khi còn người', async (t) => {
  if (it.skipIfNoDb(t)) return;
  const users = createUserRepository(pool());
  await pool().execute("DELETE FROM users WHERE email LIKE '%@it.test'");
  const a = await mkUser('admin');
  assert.deepEqual(await users.updateAdminFieldsGuarded(a, { status: 'disabled' }), { error: 'LAST_ADMIN' });
  const b = await mkUser('admin');
  assert.deepEqual(await users.updateAdminFieldsGuarded(a, { status: 'disabled' }), { ok: true });
  assert.deepEqual(await users.updateAdminFieldsGuarded(randomUUID(), { role: 'user' }), { error: 'NOT_FOUND' });
  assert.equal((await users.updateAdminFieldsGuarded(b, { role: 'user' })).error, 'LAST_ADMIN');
});

test('F07: mời song song khi còn 1 chỗ → đúng 1 người được mời, tổng không vượt trần', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const shares = createShareRepository(pool());
  const owner = await mkUser();
  const deck = randomUUID();
  await pool().execute("INSERT INTO presentations (id, tenant_id, title, source_kind, status) VALUES (?, ?, 'T', 'text', 'ready')", [deck, owner]);
  const MAX = 10;
  for (let i = 0; i < MAX - 1; i += 1) assert.equal((await shares.add(deck, await mkUser(), 'viewer', owner, MAX)).created, true);
  const late = await Promise.all([mkUser(), mkUser(), mkUser(), mkUser()]);
  const res = await Promise.all(late.map((u) => shares.add(deck, u, 'viewer', owner, MAX)));
  assert.equal(res.filter((r) => r.created).length, 1, JSON.stringify(res));
  assert.equal(res.filter((r) => r.error === 'LIMIT').length, 3);
  assert.equal(await shares.count(deck), MAX);
  // Người đã được mời đổi quyền khi đầy → không bị chặn.
  const [[{ user_id }]] = [(await pool().execute('SELECT user_id FROM presentation_shares WHERE presentation_id = ? LIMIT 1', [deck]))[0]];
  assert.deepEqual(await shares.add(deck, user_id, 'editor', owner, MAX), { created: false });
  assert.deepEqual(await shares.add(randomUUID(), late[0], 'viewer', owner, MAX), { error: 'NOT_FOUND' });
});

test('F15: chạy lại TOÀN BỘ changelog lên database đã ở baseline mới nhất → lược đồ không đổi (không "hạ cấp" ENUM)', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../../startup/database/changelogs/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /^changelog_database_\d{8}_\d{6}\.sql$/.test(f)).sort();
  assert.ok(files.length >= 4);
  const shape = async () => {
    const [cols] = await pool().query("SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION");
    return JSON.stringify(cols);
  };
  const before = await shape();
  const conn = await mysql.createConnection({ ...it.db().conn, database: it.db().name, multipleStatements: true });
  try {
    // Mỗi changelog chạy RIÊNG LẺ (người vận hành chạy lại 1 tệp cũ) rồi cả dãy theo thứ tự — lược đồ phải y nguyên.
    for (const f of files) {
      await conn.query(readFileSync(new URL(f, dir), 'utf8'));
      assert.equal(await shape(), before, `${f} chạy lại một mình đã làm thay đổi lược đồ mới nhất`);
    }
    for (let pass = 0; pass < 2; pass += 1) for (const f of files) await conn.query(readFileSync(new URL(f, dir), 'utf8'));
  } finally {
    await conn.end();
  }
  assert.equal(await shape(), before, 'changelog cũ đã làm thay đổi lược đồ mới nhất');
});

test('F15: changelog 20261005 vẫn NÂNG CẤP được DB cũ (ENUM chưa có giá trị mới)', async (t) => {
  if (it.skipIfNoDb(t)) return;
  const conn = await mysql.createConnection({ ...it.db().conn, database: it.db().name, multipleStatements: true });
  try {
    await conn.query("ALTER TABLE assets MODIFY kind ENUM('image','thumbnail') NOT NULL DEFAULT 'image'");
    await conn.query("ALTER TABLE presentations MODIFY status ENUM('generating','ready','failed') NOT NULL DEFAULT 'generating'");
    await conn.query(readFileSync(new URL('../../startup/database/changelogs/changelog_database_20261005_170000.sql', import.meta.url), 'utf8'));
    const [[k]] = await conn.query("SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'kind'");
    const [[s]] = await conn.query("SELECT COLUMN_TYPE AS t FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND COLUMN_NAME = 'status'");
    assert.match(k.t, /'poster'/);
    assert.match(s.t, /'outlining'/);
  } finally {
    await conn.end();
  }
});
