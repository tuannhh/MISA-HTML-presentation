// Thư mục sắp xếp bài trình bày (folders) — luôn theo tenant (tenantClause), mỗi người chỉ thấy/sửa thư mục của mình.
// Thao tác đổi cây (chuyển thư mục, xoá thư mục, chuyển bài) chạy trong transaction + khoá các dòng thư mục của người dùng
// (FOR UPDATE) để 2 yêu cầu đồng thời không tạo vòng lặp cha–con hoặc vượt giới hạn độ sâu.
import { tenantClause } from './tenantScope.js';
import { withTransaction } from '../db/pool.js';

const COLS = 'f.id, f.tenant_id, f.parent_id, f.name, f.created_at, f.updated_at';

export function createFolderRepository(pool) {
  // Toàn bộ thư mục của người dùng (cây nhỏ — giới hạn số lượng ở service) để kiểm tra vòng lặp/độ sâu.
  async function allOwned(tenantId, conn = pool, lock = false) {
    const tc = tenantClause(tenantId, 'f');
    const [rows] = await conn.execute(`SELECT ${COLS} FROM folders f WHERE ${tc.sql} ORDER BY f.name${lock ? ' FOR UPDATE' : ''}`, tc.params);
    return rows;
  }

  return {
    allOwned: (tenantId) => allOwned(tenantId),

    // Số bài trực tiếp trong từng thư mục (không tính thư mục con) — hiện trên thẻ thư mục.
    async deckCounts(tenantId) {
      const tc = tenantClause(tenantId, 'p');
      const [rows] = await pool.execute(`SELECT p.folder_id, COUNT(*) AS n FROM presentations p WHERE ${tc.sql} AND p.folder_id IS NOT NULL GROUP BY p.folder_id`, tc.params);
      return new Map(rows.map((r) => [r.folder_id, Number(r.n)]));
    },

    async findOwned(tenantId, id) {
      const tc = tenantClause(tenantId, 'f');
      const [rows] = await pool.execute(`SELECT ${COLS} FROM folders f WHERE f.id = ? AND ${tc.sql} LIMIT 1`, [id, ...tc.params]);
      return rows[0] || null;
    },

    // check(rows) chạy trên cây đã khoá — ném lỗi nghiệp vụ nếu vi phạm (vòng lặp, độ sâu, số lượng, cha không tồn tại).
    async create(tenantId, folder, check) {
      return withTransaction(pool, async (conn) => {
        check(await allOwned(tenantId, conn, true));
        const tc = tenantClause(tenantId);
        await conn.execute('INSERT INTO folders (id, tenant_id, parent_id, name) VALUES (?, ?, ?, ?)', [folder.id, tc.params[0], folder.parentId, folder.name]);
      });
    },

    async update(tenantId, id, fields, check) {
      return withTransaction(pool, async (conn) => {
        const rows = await allOwned(tenantId, conn, true);
        if (!rows.some((r) => r.id === id)) return 0;
        check(rows);
        const sets = [];
        const params = [];
        if (fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
        if (fields.parentId !== undefined) { sets.push('parent_id = ?'); params.push(fields.parentId); }
        if (!sets.length) return 1;
        const tc = tenantClause(tenantId);
        const [res] = await conn.execute(`UPDATE folders SET ${sets.join(', ')} WHERE id = ? AND ${tc.sql}`, [...params, id, ...tc.params]);
        return res.affectedRows;
      });
    },

    // Xoá thư mục: thư mục con + bài bên trong chuyển lên thư mục cha (không mất bài), rồi xoá. Trả số bài đã chuyển.
    async remove(tenantId, id) {
      return withTransaction(pool, async (conn) => {
        const rows = await allOwned(tenantId, conn, true);
        const me = rows.find((r) => r.id === id);
        if (!me) return null;
        const tc = tenantClause(tenantId);
        await conn.execute(`UPDATE folders SET parent_id = ? WHERE parent_id = ? AND ${tc.sql}`, [me.parent_id, id, ...tc.params]);
        const [moved] = await conn.execute(`UPDATE presentations SET folder_id = ? WHERE folder_id = ? AND ${tc.sql}`, [me.parent_id, id, ...tc.params]);
        await conn.execute(`DELETE FROM folders WHERE id = ? AND ${tc.sql}`, [id, ...tc.params]);
        return { moved: moved.affectedRows, parentId: me.parent_id };
      });
    },

    // Chuyển nhiều bài (của chính người dùng) vào thư mục (null = gốc). Không đổi updated_at của bài (chỉ là sắp xếp).
    async moveDecks(tenantId, ids, folderId) {
      return withTransaction(pool, async (conn) => {
        if (folderId) {
          const rows = await allOwned(tenantId, conn, true);
          if (!rows.some((r) => r.id === folderId)) return -1;
        }
        const tc = tenantClause(tenantId);
        const [res] = await conn.query(`UPDATE presentations SET folder_id = ?, updated_at = updated_at WHERE id IN (?) AND ${tc.sql}`, [folderId, ids, ...tc.params]);
        return res.affectedRows;
      });
    },
  };
}
