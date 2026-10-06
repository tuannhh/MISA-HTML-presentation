// Mẫu thiết kế / bộ nhận diện thương hiệu (design_templates) + ảnh của mẫu (template_assets).
// Ghi/sửa/xoá luôn theo tenant (tenantClause). Đọc được = của tôi HOẶC mẫu công khai (cố ý không lọc tenant — xem listReadable).
import { tenantClause } from './tenantScope.js';

const COLS = 't.id, t.tenant_id, t.name, t.visibility, t.design, t.created_at, t.updated_at';
const ACOLS = 'a.id, a.tenant_id, a.template_id, a.kind, a.mime, a.bytes, a.width, a.height, a.storage_key, a.original_name';

function parse(row) {
  if (row && typeof row.design === 'string') row.design = JSON.parse(row.design);
  return row || null;
}

export function createTemplateRepository(pool) {
  return {
    async create(tenantId, t, conn = pool) {
      const tc = tenantClause(tenantId);
      await conn.execute('INSERT INTO design_templates (id, tenant_id, name, visibility, design) VALUES (?, ?, ?, ?, ?)', [t.id, tc.params[0], t.name, t.visibility || 'private', JSON.stringify(t.design)]);
    },

    async countOwned(tenantId) {
      const tc = tenantClause(tenantId);
      const [[row]] = await pool.execute(`SELECT COUNT(*) AS n FROM design_templates WHERE ${tc.sql}`, tc.params);
      return Number(row.n);
    },

    async findOwned(tenantId, id) {
      const tc = tenantClause(tenantId, 't');
      const [rows] = await pool.execute(`SELECT ${COLS} FROM design_templates t WHERE t.id = ? AND ${tc.sql} LIMIT 1`, [id, ...tc.params]);
      return parse(rows[0]);
    },

    // Của tôi hoặc công khai (mẫu công khai: mọi người dùng áp được — ngoại lệ có chủ đích với lọc tenant).
    async findReadable(tenantId, id) {
      const tc = tenantClause(tenantId, 't');
      const [rows] = await pool.execute(`SELECT ${COLS} FROM design_templates t WHERE t.id = ? AND (${tc.sql} OR t.visibility = 'public') LIMIT 1`, [id, ...tc.params]);
      return parse(rows[0]);
    },

    // Danh sách: mẫu của tôi + mẫu công khai của người khác (kèm tên người tạo).
    async listReadable(tenantId, limit = 100) {
      const tc = tenantClause(tenantId, 't');
      const [rows] = await pool.query(
        `SELECT ${COLS}, u.display_name AS owner_name FROM design_templates t JOIN users u ON u.id = t.tenant_id
          WHERE ${tc.sql} OR t.visibility = 'public' ORDER BY (${tc.sql}) DESC, t.updated_at DESC LIMIT ?`,
        [...tc.params, ...tc.params, limit],
      );
      return rows.map(parse);
    },

    async updateOwned(tenantId, id, fields) {
      const sets = [];
      const params = [];
      if (fields.name !== undefined) {
        sets.push('name = ?');
        params.push(fields.name);
      }
      if (fields.visibility !== undefined) {
        sets.push('visibility = ?');
        params.push(fields.visibility);
      }
      if (!sets.length) return 1;
      const tc = tenantClause(tenantId);
      const [res] = await pool.execute(`UPDATE design_templates SET ${sets.join(', ')} WHERE id = ? AND ${tc.sql}`, [...params, id, ...tc.params]);
      return res.affectedRows;
    },

    async deleteOwned(tenantId, id) {
      const tc = tenantClause(tenantId);
      const [res] = await pool.execute(`DELETE FROM design_templates WHERE id = ? AND ${tc.sql}`, [id, ...tc.params]);
      return res.affectedRows;
    },

    async createAsset(tenantId, a, conn = pool) {
      const tc = tenantClause(tenantId);
      await conn.execute(
        `INSERT INTO template_assets (id, tenant_id, template_id, kind, mime, bytes, width, height, storage_key, original_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, tc.params[0], a.templateId, a.kind, a.mime, a.bytes, a.width ?? null, a.height ?? null, a.storageKey, a.originalName ?? null],
      );
    },

    // Chỉ gọi sau khi đã kiểm tra quyền đọc mẫu (findReadable/findOwned).
    async listAssets(templateId) {
      const [rows] = await pool.execute(`SELECT ${ACOLS} FROM template_assets a WHERE a.template_id = ? ORDER BY a.created_at`, [templateId]);
      return rows;
    },

    // Ảnh của nhiều mẫu (danh sách) — chỉ gọi với mã mẫu lấy từ listReadable.
    async listAssetsFor(templateIds) {
      if (!templateIds.length) return [];
      const [rows] = await pool.query(`SELECT ${ACOLS} FROM template_assets a WHERE a.template_id IN (?)`, [templateIds]);
      return rows;
    },

    // Ảnh của mẫu mà người dùng đọc được (của mình hoặc mẫu công khai).
    async findReadableAsset(tenantId, id) {
      const tc = tenantClause(tenantId, 't');
      const [rows] = await pool.execute(
        `SELECT ${ACOLS} FROM template_assets a JOIN design_templates t ON t.id = a.template_id
          WHERE a.id = ? AND (${tc.sql} OR t.visibility = 'public') LIMIT 1`,
        [id, ...tc.params],
      );
      return rows[0] || null;
    },
  };
}
