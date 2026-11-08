// Truy cập bảng assets (ảnh trong slide + thumbnail). Đọc được = chủ sở hữu, hoặc asset thuộc
// bài trình bày đã sẵn sàng mà công khai / người đọc được mời. storage_key luôn do server sinh.
// Asset luôn thuộc tenant của CHỦ BÀI (kể cả khi người được mời sửa tải lên) — service truyền tenant của bài.
import { tenantClause } from './tenantScope.js';

const COLS = 'a.id, a.tenant_id, a.presentation_id, a.kind, a.mime, a.bytes, a.width, a.height, a.storage_key, a.original_name, a.process_state, a.created_at';

export function createAssetRepository(pool) {
  return {
    async create(tenantId, a, conn = pool) {
      const t = tenantClause(tenantId);
      await conn.execute(
        `INSERT INTO assets (id, tenant_id, presentation_id, kind, mime, bytes, width, height, storage_key, original_name, process_state)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, t.params[0], a.presentationId, a.kind || 'image', a.mime, a.bytes, a.width ?? null, a.height ?? null, a.storageKey, a.originalName ?? null, a.processState ?? null],
      );
    },

    async findReadable(tenantId, id) {
      const t = tenantClause(tenantId, 'a');
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM assets a JOIN presentations p ON p.id = a.presentation_id
          WHERE a.id = ? AND (${t.sql} OR (p.status = 'ready' AND (p.visibility = 'public'
            OR EXISTS (SELECT 1 FROM presentation_shares s WHERE s.presentation_id = p.id AND s.user_id = ?)))) LIMIT 1`,
        [id, ...t.params, t.params[0]],
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

    // Mọi tệp dùng trong nội dung bài (ảnh, video, logo, ảnh bìa video) — không gồm ảnh bìa danh sách (thumbnail).
    async listMediaForPresentation(presentationId) {
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM assets a WHERE a.presentation_id = ? AND a.kind <> 'thumbnail' ORDER BY a.created_at`,
        [presentationId],
      );
      return rows;
    },

    async listOwnedForPresentation(tenantId, presentationId) {
      const t = tenantClause(tenantId, 'a');
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM assets a WHERE a.presentation_id = ? AND a.kind <> 'thumbnail' AND ${t.sql} ORDER BY a.created_at`,
        [presentationId, ...t.params],
      );
      return rows;
    },

    async findOwnedInPresentation(tenantId, presentationId, id) {
      const t = tenantClause(tenantId, 'a');
      const [rows] = await pool.execute(`SELECT ${COLS} FROM assets a WHERE a.id = ? AND a.presentation_id = ? AND ${t.sql} LIMIT 1`, [id, presentationId, ...t.params]);
      return rows[0] || null;
    },

    async countForPresentation(presentationId, kind = 'image') {
      const [[row]] = await pool.execute('SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM assets WHERE presentation_id = ? AND kind = ?', [presentationId, kind]);
      return Number(row.n);
    },

    async bytesForPresentation(presentationId, kind) {
      const [[row]] = await pool.execute('SELECT COALESCE(SUM(bytes), 0) AS bytes FROM assets WHERE presentation_id = ? AND kind = ?', [presentationId, kind]);
      return Number(row.bytes);
    },

    async listStorageKeysForPresentation(tenantId, presentationId) {
      const t = tenantClause(tenantId);
      const [rows] = await pool.execute(`SELECT storage_key FROM assets WHERE presentation_id = ? AND ${t.sql}`, [presentationId, ...t.params]);
      return rows.map((r) => r.storage_key);
    },

    /* ---- nén video chạy nền (tác vụ nội bộ: mã asset do chính máy chủ đưa vào hàng, KHÔNG lọc tenant) ---- */
    async setProcessState(id, state) {
      await pool.execute("UPDATE assets SET process_state = ? WHERE id = ? AND kind = 'video'", [state, id]);
    },

    async setVideoSize(id, width, height) {
      await pool.execute("UPDATE assets SET width = ?, height = ? WHERE id = ? AND kind = 'video'", [width || null, height || null, id]);
    },

    // Thay tệp bằng bản nén — chỉ khi tệp hiện tại vẫn là tệp đã nén từ (không bị thay/xoá giữa chừng). Trả số dòng đổi (0 = bỏ bản nén).
    async replaceVideoFile(id, fromKey, f) {
      const [res] = await pool.execute(
        "UPDATE assets SET storage_key = ?, mime = ?, bytes = ?, width = ?, height = ?, process_state = 'done' WHERE id = ? AND kind = 'video' AND storage_key = ?",
        [f.storageKey, f.mime, f.bytes, f.width || null, f.height || null, id, fromKey],
      );
      return res.affectedRows;
    },

    // Video còn dở khi máy chủ dừng → nén lại sau khi khởi động.
    async listVideoJobs() {
      const [rows] = await pool.execute(`SELECT ${COLS} FROM assets a WHERE a.kind = 'video' AND a.process_state IN ('pending', 'running') ORDER BY a.created_at`);
      return rows;
    },

    async deleteOwned(tenantId, id) {
      const t = tenantClause(tenantId);
      const [res] = await pool.execute(`DELETE FROM assets WHERE id = ? AND ${t.sql}`, [id, ...t.params]);
      return res.affectedRows;
    },
  };
}
