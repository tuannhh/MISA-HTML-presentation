// A01: scripts/smoke-cleanup.js chỉ xoá đúng tài khoản smoke (đúng stamp) cùng bài + tệp của họ; không chạm tài khoản thật.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../../src/config/index.js';
import { useTestDb } from './helpers/testDb.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const it = useTestDb(config, { before, after });
const run = promisify(execFile);
const exists = (p) => access(p).then(() => true, () => false);

test('smoke-cleanup <stamp>: xoá tài khoản smoke đúng lần chạy + bài + tệp; giữ tài khoản thật và lần chạy khác', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const pool = it.db().pool;
  const storageDir = await mkdtemp(path.join(tmpdir(), 'mp-smoke-cleanup-'));
  try {
    const mk = async (email, role = 'user') => {
      const id = randomUUID();
      await pool.execute('INSERT INTO users (id, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)', [id, email, 'IT', 'x'.repeat(60), role]);
      await mkdir(path.join(storageDir, 'private', 'tenants', id), { recursive: true });
      await writeFile(path.join(storageDir, 'private', 'tenants', id, 'f.webp'), 'x');
      return id;
    };
    const admin = await mk('smoke-admin-run1abc@misa.com.vn', 'admin');
    const a = await mk('smoke-a-run1abc@misa.com.vn');
    const real = await mk('nguoi.that@misa.com.vn', 'admin');
    const lookalike = await mk('smoke-a-run1abc@misa.com.vn.vn');
    const other = await mk('smoke-a-run2xyz@misa.com.vn');
    await pool.execute("INSERT INTO presentations (id, tenant_id, title, source_kind, status) VALUES (?, ?, 'T', 'text', 'ready')", [randomUUID(), a]);

    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DB_HOST: it.db().conn.host,
      DB_PORT: String(it.db().conn.port),
      DB_USER: it.db().conn.user,
      DB_PASSWORD: it.db().conn.password,
      DB_NAME: it.db().name,
      STORAGE_DIR: storageDir,
    };
    const script = fileURLToPath(new URL('../../scripts/smoke-cleanup.js', import.meta.url));
    const { stdout } = await run(process.execPath, [script, 'run1abc'], { env });
    assert.match(stdout, /Đã dọn 2 tài khoản smoke/);

    const [rows] = await pool.query('SELECT id FROM users');
    const left = new Set(rows.map((r) => r.id));
    assert.ok(!left.has(admin) && !left.has(a), 'tài khoản smoke của lần chạy bị xoá');
    assert.ok(left.has(real) && left.has(lookalike) && left.has(other), 'tài khoản khác giữ nguyên');
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM presentations WHERE tenant_id = ?', [a]);
    assert.equal(Number(n), 0, 'bài của tài khoản smoke xoá theo khoá ngoại');
    assert.equal(await exists(path.join(storageDir, 'private', 'tenants', a)), false, 'tệp của tài khoản smoke bị xoá');
    assert.equal(await exists(path.join(storageDir, 'private', 'tenants', real)), true, 'tệp tài khoản thật giữ nguyên');

    const list = await run(process.execPath, [script, '--list'], { env });
    assert.match(list.stdout, /smoke-a-run2xyz@misa\.com\.vn/);
    assert.match(list.stdout, /Còn 1 tài khoản smoke/);
    await assert.rejects(run(process.execPath, [script, "x'; DROP TABLE users;--"], { env }), (err) => err.code === 2);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});
