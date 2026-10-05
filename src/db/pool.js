// Kết nối MySQL dùng chung. Thời gian lưu/đọc theo UTC; câu lệnh luôn tham số hoá.
import mysql from 'mysql2/promise';

const REQUIRED_TABLES = ['users', 'presentations', 'assets', 'sessions', 'audit_logs', 'schema_changelog'];

export function createPool(dbConfig) {
  return mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    connectionLimit: dbConfig.connectionLimit,
    waitForConnections: true,
    queueLimit: 200,
    timezone: 'Z',
    dateStrings: false,
    charset: 'utf8mb4',
    connectTimeout: 10000,
    enableKeepAlive: true,
  });
}

// Fail-fast: không tự chạy schema.sql, chỉ xác nhận các bảng bắt buộc đã tồn tại.
export async function verifyTables(pool) {
  const [rows] = await pool.query(
    'SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE()',
  );
  const existing = new Set(rows.map((r) => r.name));
  const missing = REQUIRED_TABLES.filter((t) => !existing.has(t));
  if (missing.length) {
    throw new Error(
      `Cơ sở dữ liệu thiếu bảng: ${missing.join(', ')}. Chạy startup/database/schema.sql trước (xem memory-bank/07-deployment-infrastructure.md).`,
    );
  }
}

export async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // bỏ qua lỗi rollback để giữ lỗi gốc
    }
    throw err;
  } finally {
    conn.release();
  }
}
