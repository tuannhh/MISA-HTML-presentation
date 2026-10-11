// Truy cập bảng presentation_shares (chủ bài mời người khác: 'viewer' chỉ xem / 'editor' chỉnh sửa).
// Mọi hàm nhận presentationId ĐÃ được service kiểm tra quyền (chủ bài) trước — tầng này không tự quyết quyền.
import { withTransaction } from '../db/pool.js';

const COLS = 's.presentation_id, s.user_id, s.role, s.created_at, s.updated_at, u.email, u.display_name, u.status';

export function createShareRepository(pool) {
  return {
    async listForPresentation(presentationId) {
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM presentation_shares s JOIN users u ON u.id = s.user_id
          WHERE s.presentation_id = ? ORDER BY s.created_at`,
        [presentationId],
      );
      return rows;
    },

    async find(presentationId, userId) {
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM presentation_shares s JOIN users u ON u.id = s.user_id
          WHERE s.presentation_id = ? AND s.user_id = ? LIMIT 1`,
        [presentationId, userId],
      );
      return rows[0] || null;
    },

    async count(presentationId) {
      const [[{ n }]] = await pool.execute('SELECT COUNT(*) AS n FROM presentation_shares WHERE presentation_id = ?', [presentationId]);
      return Number(n);
    },

    // Mời mới (hoặc đổi quyền nếu đã được mời) KÈM trần số người: khoá dòng bài (cùng khoá với handoff) rồi đếm + ghi trong 1 giao dịch,
    // nên nhiều lượt mời song song không vượt `max`. Trả { created } hoặc { error: 'NOT_FOUND' | 'LIMIT' }.
    async add(presentationId, userId, role, createdBy, max) {
      return withTransaction(pool, async (conn) => {
        const [[deck]] = await conn.execute('SELECT id FROM presentations WHERE id = ? FOR UPDATE', [presentationId]);
        if (!deck) return { error: 'NOT_FOUND' };
        const [[have]] = await conn.execute('SELECT COUNT(*) AS n, COALESCE(SUM(user_id = ?), 0) AS mine FROM presentation_shares WHERE presentation_id = ?', [userId, presentationId]);
        const exists = Number(have.mine) > 0;
        if (!exists && Number(have.n) >= max) return { error: 'LIMIT' };
        await conn.execute(
          `INSERT INTO presentation_shares (presentation_id, user_id, role, created_by) VALUES (?, ?, ?, ?) AS n
           ON DUPLICATE KEY UPDATE role = n.role`,
          [presentationId, userId, role, createdBy],
        );
        return { created: !exists };
      });
    },

    // Mời mới hoặc đổi quyền nếu người đó đã được mời (giữ created_at/created_by lần mời đầu).
    async upsert(presentationId, userId, role, createdBy) {
      await pool.execute(
        `INSERT INTO presentation_shares (presentation_id, user_id, role, created_by) VALUES (?, ?, ?, ?) AS n
         ON DUPLICATE KEY UPDATE role = n.role`,
        [presentationId, userId, role, createdBy],
      );
    },

    async updateRole(presentationId, userId, role) {
      const [res] = await pool.execute('UPDATE presentation_shares SET role = ? WHERE presentation_id = ? AND user_id = ?', [role, presentationId, userId]);
      return res.affectedRows;
    },

    async remove(presentationId, userId) {
      const [res] = await pool.execute('DELETE FROM presentation_shares WHERE presentation_id = ? AND user_id = ?', [presentationId, userId]);
      return res.affectedRows;
    },
  };
}
