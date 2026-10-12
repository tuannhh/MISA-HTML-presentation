// Database tạm cho test tích hợp (A05): tên duy nhất mỗi lần chạy (2 runner song song không xoá DB của nhau), dựng từ schema.sql,
// xoá trong finally kể cả khi dựng lỗi giữa chừng.
// Kết nối: IT_DB_HOST / IT_DB_PORT / IT_DB_USER / IT_DB_PASSWORD — tài khoản test có quyền tạo/xoá database, KHÔNG phải tài khoản
// runtime của ứng dụng; thiếu thì lùi về DB_* của .env.
// Dựng lỗi → test FAIL (đã gọi test:integration thì phải chạy thật). Chỉ IT_OPTIONAL=1 (máy dev) mới chuyển thành skip — không dùng trong CI/gate.
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
import { createPool } from '../../../src/db/pool.js';

export const optional = () => process.env.IT_OPTIONAL === '1';

export function itConnection(config, env = process.env) {
  return {
    host: env.IT_DB_HOST || config.db.host,
    port: Number(env.IT_DB_PORT || config.db.port),
    user: env.IT_DB_USER || config.db.user,
    password: env.IT_DB_PASSWORD ?? config.db.password,
  };
}

async function dropDb(conn, name) {
  const admin = await mysql.createConnection({ ...conn, connectTimeout: 4000 });
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${name}\``);
  } finally {
    await admin.end().catch(() => {});
  }
}

/** Trả { pool, name, conn, teardown() }. Ném lỗi nếu không dựng được (đã dọn phần dở). */
export async function setupTestDb(config, { connectionLimit = 20 } = {}) {
  const conn = itConnection(config);
  const name = `${config.db.database}_it_${randomBytes(4).toString('hex')}`;
  let admin;
  let created = false;
  try {
    admin = await mysql.createConnection({ ...conn, multipleStatements: true, connectTimeout: 4000 });
    await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    created = true;
    const sql = readFileSync(new URL('../../../startup/database/schema.sql', import.meta.url), 'utf8').replace(/misa_presentation/g, name);
    await admin.query(sql);
  } catch (err) {
    if (created) await dropDb(conn, name).catch(() => {});
    throw err;
  } finally {
    await admin?.end().catch(() => {});
  }
  const pool = createPool({ ...config.db, ...conn, database: name, connectionLimit });
  return {
    pool,
    name,
    conn,
    async teardown() {
      try {
        await pool.end();
      } finally {
        await dropDb(conn, name);
      }
    },
  };
}

/**
 * Gắn before/after cho 1 tệp test: trả getter `db()` (null nếu bỏ qua). Dựng lỗi: mặc định ném (test fail);
 * IT_OPTIONAL=1 → mọi test gọi `skipIfNoDb(t)` sẽ skip kèm lý do.
 */
export function useTestDb(config, { before, after }, opts) {
  let db = null;
  let reason = '';
  before(async () => {
    try {
      db = await setupTestDb(config, opts);
    } catch (err) {
      if (!optional()) throw new Error(`Không dựng được database test (${err.code || err.message}). Cấu hình IT_DB_* — xem test/integration/README.md`);
      reason = `không dựng được database tạm (${err.code || err.message})`;
    }
  });
  after(async () => {
    await db?.teardown();
  });
  return {
    db: () => db,
    skipIfNoDb: (t) => {
      if (db) return false;
      t.skip(reason || 'database test chưa sẵn sàng');
      return true;
    },
  };
}
