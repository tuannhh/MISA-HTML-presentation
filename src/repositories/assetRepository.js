// Truy cập bảng assets (ảnh trong slide + thumbnail). Đọc được = chủ sở hữu, hoặc asset thuộc
// bài trình bày công khai đã sẵn sàng. storage_key luôn do server sinh.
import { tenantClause } from './tenantScope.js';

const COLS = 'a.id, a.tenant_id, a.presentation_id, a.kind, a.mime, a.bytes, a.width, a.height, a.storage_key, a.original_name, a.created_at';

export function createAssetRepository(pool) {
  return {
    async create(tenantId, a, conn = pool) {
      const t = tenantClause(tenantId);
      await conn.execute(
        `INSERT INTO assets (id, tenant_id, presentation_id, kind, mime, bytes, width, height, storage_key, original_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, t.params[0], a.presentationId, a.kind || 'image', a.mime, a.bytes, a.width ?? null, a.height ?? null, a.storageKey, a.originalName ?? null],
      );
    },

    async findReadable(tenantId, id) {
      const t = tenantClause(tenantId, 'a');
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM assets a JOIN presentations p ON p.id = a.presentation_id
          WHERE a.id = ? AND (${t.sql} OR (p.visibility = 'public' AND p.status = 'ready')) LIMIT 1`,
        [id, ...t.params],
      );
      return rows[0] || null;
    },

    // KHÔNG lọc tenant — chỉ gọi sau khi đã xác thực chữ ký URL hoặc trong tác vụ nội bộ của chính tenant.
    async findById(id) {
      const [rows] = await pool.execute(`SELECT ${COLS} FROM assets a WHERE a.id = ? LIMIT 1`, [id]);
      return rows[0] || null;
    },

    // Dùng khi render/xuất: chỉ lấy asset của đúng bài trình bày (đã được kiểm tra quyền đọc trước đó).
    async listForPresentation(presentationId, kind = 'image') {
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM assets a WHERE a.presentation_id = ? AND a.kind = ? ORDER BY a.created_at`,
        [presentationId, kind],
      );
      return rows;
    },

    async listOwnedForPresentation(tenantId, presentationId) {
      const t = tenantClause(tenantId, 'a');
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM assets a WHERE a.presentation_id = ? AND a.kind = 'image' AND ${t.sql} ORDER BY a.created_at`,
        [presentationId, ...t.params],
      );
      return rows;
    },

    async countForPresentation(presentationId) {
      const [[row]] = await pool.execute("SELECT COUNT(*) AS n FROM assets WHERE presentation_id = ? AND kind = 'image'", [presentationId]);
      return Number(row.n);
    },

    async listStorageKeysForPresentation(tenantId, presentationId) {
      const t = tenantClause(tenantId);
      const [rows] = await pool.execute(`SELECT storage_key FROM assets WHERE presentation_id = ? AND ${t.sql}`, [presentationId, ...t.params]);
      return rows.map((r) => r.storage_key);
    },

    async deleteOwned(tenantId, id) {
      const t = tenantClause(tenantId);
      const [res] = await pool.execute(`DELETE FROM assets WHERE id = ? AND ${t.sql}`, [id, ...t.params]);
      return res.affectedRows;
    },
  };
}
