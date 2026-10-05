// Truy cập bảng presentations. Mọi truy vấn "của tôi" đi qua tenantClause; truy vấn "đọc được"
// = của tôi HOẶC (public + ready). Không hàm nào cho phép đọc bản private của tenant khác.
import { tenantClause } from './tenantScope.js';

const LIST_COLS = `p.id, p.tenant_id, p.title, p.ratio, p.visibility, p.status, p.source_kind, p.source_label,
  p.spec_version, p.slide_count, p.thumbnail_asset_id, p.error_message, p.created_at, p.updated_at, p.published_at`;

function parseSpec(row) {
  if (!row) return null;
  if (typeof row.spec === 'string') row.spec = JSON.parse(row.spec);
  return row;
}

function escapeLike(q) {
  return q.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function createPresentationRepository(pool) {
  return {
    async createForTenant(tenantId, p) {
      const t = tenantClause(tenantId);
      await pool.execute(
        `INSERT INTO presentations (id, tenant_id, title, ratio, visibility, status, source_kind, source_label, instructions, spec, spec_version, slide_count)
         VALUES (?, ?, ?, ?, 'private', ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          t.params[0],
          p.title,
          p.ratio,
          p.status || 'generating',
          p.sourceKind,
          p.sourceLabel || null,
          p.instructions || null,
          p.spec ? JSON.stringify(p.spec) : null,
          p.spec ? 1 : 0,
          p.spec ? p.spec.slides.length : 0,
        ],
      );
    },

    async findOwned(tenantId, id) {
      const t = tenantClause(tenantId, 'p');
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLS}, p.instructions, p.spec FROM presentations p WHERE p.id = ? AND ${t.sql} LIMIT 1`,
        [id, ...t.params],
      );
      return parseSpec(rows[0]);
    },

    // Đọc được: chủ sở hữu hoặc bản công khai đã sẵn sàng (mọi tenant đã đăng nhập).
    async findReadable(tenantId, id) {
      const t = tenantClause(tenantId, 'p');
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLS}, p.spec, u.display_name AS author_name
           FROM presentations p JOIN users u ON u.id = p.tenant_id
          WHERE p.id = ? AND (${t.sql} OR (p.visibility = 'public' AND p.status = 'ready'))
          LIMIT 1`,
        [id, ...t.params],
      );
      return parseSpec(rows[0]);
    },

    async listOwned(tenantId, { q, limit, offset }) {
      const t = tenantClause(tenantId, 'p');
      const where = [t.sql];
      const params = [...t.params];
      if (q) {
        where.push("p.title LIKE ? ESCAPE '\\\\'");
        params.push(`%${escapeLike(q)}%`);
      }
      const w = where.join(' AND ');
      const [rows] = await pool.query(
        `SELECT ${LIST_COLS} FROM presentations p WHERE ${w} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM presentations p WHERE ${w}`, params);
      return { rows, total: Number(total) };
    },

    async listPublic({ q, limit, offset }) {
      const where = ["p.visibility = 'public'", "p.status = 'ready'"];
      const params = [];
      if (q) {
        where.push("p.title LIKE ? ESCAPE '\\\\'");
        params.push(`%${escapeLike(q)}%`);
      }
      const w = where.join(' AND ');
      const [rows] = await pool.query(
        `SELECT ${LIST_COLS}, u.display_name AS author_name
           FROM presentations p JOIN users u ON u.id = p.tenant_id
          WHERE ${w} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM presentations p WHERE ${w}`, params);
      return { rows, total: Number(total) };
    },

    // Cập nhật có khoá lạc quan khi đổi spec. Trả số dòng bị ảnh hưởng (0 = không thấy / xung đột).
    async updateOwned(tenantId, id, fields, expectedVersion) {
      const t = tenantClause(tenantId);
      const sets = [];
      const params = [];
      if (fields.title !== undefined) {
        sets.push('title = ?');
        params.push(fields.title);
      }
      if (fields.ratio !== undefined) {
        sets.push('ratio = ?');
        params.push(fields.ratio);
      }
      if (fields.visibility !== undefined) {
        sets.push('visibility = ?');
        params.push(fields.visibility);
        sets.push(fields.visibility === 'public' ? 'published_at = COALESCE(published_at, CURRENT_TIMESTAMP(3))' : 'published_at = NULL');
      }
      if (fields.spec !== undefined) {
        sets.push('spec = ?', 'slide_count = ?', 'spec_version = spec_version + 1');
        params.push(JSON.stringify(fields.spec), fields.spec.slides.length);
      }
      if (!sets.length) return 1;
      let where = `id = ? AND ${t.sql}`;
      const whereParams = [id, ...t.params];
      if (expectedVersion !== undefined) {
        where += ' AND spec_version = ?';
        whereParams.push(expectedVersion);
      }
      const [res] = await pool.execute(`UPDATE presentations SET ${sets.join(', ')} WHERE ${where}`, [...params, ...whereParams]);
      return res.affectedRows;
    },

    async setGenerationResult(tenantId, id, { status, spec, title, errorMessage }) {
      const t = tenantClause(tenantId);
      if (status === 'ready') {
        await pool.execute(
          `UPDATE presentations SET status = 'ready', spec = ?, title = COALESCE(?, title), slide_count = ?,
             spec_version = spec_version + 1, error_message = NULL WHERE id = ? AND ${t.sql}`,
          [JSON.stringify(spec), title || null, spec.slides.length, id, ...t.params],
        );
      } else {
        await pool.execute(
          `UPDATE presentations SET status = 'failed', error_message = ? WHERE id = ? AND ${t.sql}`,
          [String(errorMessage || 'Không tạo được bài trình bày').slice(0, 500), id, ...t.params],
        );
      }
    },

    async setThumbnail(tenantId, id, assetId) {
      const t = tenantClause(tenantId);
      await pool.execute(`UPDATE presentations SET thumbnail_asset_id = ? WHERE id = ? AND ${t.sql}`, [assetId, id, ...t.params]);
    },

    async deleteOwned(tenantId, id) {
      const t = tenantClause(tenantId);
      const [res] = await pool.execute(`DELETE FROM presentations WHERE id = ? AND ${t.sql}`, [id, ...t.params]);
      return res.affectedRows;
    },

    // Tiến trình chết giữa chừng (mất điện, redeploy) để lại bản "generating" mồ côi → đánh dấu lỗi.
    async failStaleGenerating() {
      const [res] = await pool.execute(
        "UPDATE presentations SET status = 'failed', error_message = 'Quá trình tạo bị gián đoạn do máy chủ khởi động lại. Vui lòng tạo lại.' WHERE status = 'generating'",
      );
      return res.affectedRows;
    },
  };
}
