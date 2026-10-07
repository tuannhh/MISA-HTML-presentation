// Truy cập bảng presentations. Mọi truy vấn "của tôi" đi qua tenantClause; truy vấn "đọc được"
// = của tôi HOẶC (ready + (public HOẶC được chủ bài mời qua presentation_shares)).
// Không hàm nào cho phép đọc bản private của tenant khác khi chưa được mời.
import { tenantClause, assertTenantId } from './tenantScope.js';

// Quyền của người xem trên 1 dòng đọc được: chủ bài | được mời sửa | chỉ xem (được mời xem hoặc bài công khai).
export function accessRole(row, userId) {
  if (row.tenant_id === userId) return 'owner';
  return row.share_role === 'editor' ? 'editor' : 'viewer';
}

const LIST_COLS = `p.id, p.tenant_id, p.short_code, p.title, p.ratio, p.visibility, p.status, p.source_kind, p.source_label,
  p.spec_version, p.outline_version, p.slide_count, p.thumbnail_asset_id, p.error_message, p.created_at, p.updated_at, p.published_at`;

function parseSpec(row) {
  if (!row) return null;
  if (typeof row.spec === 'string') row.spec = JSON.parse(row.spec);
  if (typeof row.outline === 'string') row.outline = JSON.parse(row.outline);
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
        `INSERT INTO presentations (id, tenant_id, short_code, title, ratio, visibility, status, source_kind, source_label, instructions, spec, spec_version, slide_count)
         VALUES (?, ?, ?, ?, ?, 'private', ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          t.params[0],
          p.code,
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
        `SELECT ${LIST_COLS}, p.instructions, p.spec, p.outline FROM presentations p WHERE p.id = ? AND ${t.sql} LIMIT 1`,
        [id, ...t.params],
      );
      return parseSpec(rows[0]);
    },

    // Mã ngắn → id. KHÔNG lọc theo tenant (cố ý): chỉ đổi định danh trên đường dẫn, mọi thao tác sau đó vẫn kiểm tra quyền
    // bằng findOwned/findReadable (bài không đọc được → 404 giống mã không tồn tại, không lộ thông tin).
    async findIdByCode(code) {
      const [rows] = await pool.execute('SELECT id FROM presentations WHERE short_code = ? LIMIT 1', [code]);
      return rows[0]?.id || null;
    },

    // Đọc được: chủ sở hữu, hoặc bài đã sẵn sàng mà công khai / người này được mời. Kèm access_role
    // ('owner' | 'editor' | 'viewer') để service quyết thao tác — người được mời sửa vẫn không phải chủ bài.
    async findReadable(tenantId, id) {
      const t = tenantClause(tenantId, 'p');
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLS}, p.spec, u.display_name AS author_name, s.role AS share_role
           FROM presentations p JOIN users u ON u.id = p.tenant_id
           LEFT JOIN presentation_shares s ON s.presentation_id = p.id AND s.user_id = ?
          WHERE p.id = ? AND (${t.sql} OR (p.status = 'ready' AND (p.visibility = 'public' OR s.user_id IS NOT NULL)))
          LIMIT 1`,
        [t.params[0], id, ...t.params],
      );
      const row = parseSpec(rows[0]);
      if (row) row.access_role = accessRole(row, tenantId);
      return row;
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

    // "Được chia sẻ với tôi": bài người khác mời mình (đã sẵn sàng), kèm quyền được cấp.
    async listSharedWith(userId, { q, limit, offset }) {
      const where = ['s.user_id = ?', "p.status = 'ready'"];
      const params = [assertTenantId(userId)];
      if (q) {
        where.push("p.title LIKE ? ESCAPE '\\\\'");
        params.push(`%${escapeLike(q)}%`);
      }
      const w = where.join(' AND ');
      const [rows] = await pool.query(
        `SELECT ${LIST_COLS}, u.display_name AS author_name, s.role AS share_role
           FROM presentation_shares s JOIN presentations p ON p.id = s.presentation_id JOIN users u ON u.id = p.tenant_id
          WHERE ${w} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset],
      );
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM presentation_shares s JOIN presentations p ON p.id = s.presentation_id WHERE ${w}`,
        params,
      );
      return { rows: rows.map((r) => ({ ...r, access_role: accessRole(r, userId) })), total: Number(total) };
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

    async createCopy(tenantId, p) {
      const t = tenantClause(tenantId);
      await pool.execute(
        `INSERT INTO presentations (id, tenant_id, short_code, title, ratio, visibility, status, source_kind, source_label, spec, spec_version, slide_count, outline, outline_version)
         VALUES (?, ?, ?, ?, ?, 'private', 'ready', 'copy', ?, ?, 1, ?, ?, ?)`,
        [p.id, t.params[0], p.code, p.title, p.ratio, p.sourceLabel || null, JSON.stringify(p.spec), p.spec.slides.length, p.outline ? JSON.stringify(p.outline) : null, p.outline ? 1 : 0],
      );
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

    // Bước 1 xong: lưu dàn ý, chờ người dùng duyệt.
    async setOutlineResult(tenantId, id, { outline, title }) {
      const t = tenantClause(tenantId);
      await pool.execute(
        `UPDATE presentations SET status = 'outline', outline = ?, outline_version = outline_version + 1, title = COALESCE(?, title),
           slide_count = ?, error_message = NULL WHERE id = ? AND ${t.sql}`,
        [JSON.stringify(outline), title || null, outline.slides.length, id, ...t.params],
      );
    },

    // Người dùng lưu dàn ý (khoá lạc quan theo outline_version; chỉ khi đang chờ duyệt).
    async saveOutlineOwned(tenantId, id, { outline, title }, expectedVersion) {
      const t = tenantClause(tenantId);
      const [res] = await pool.execute(
        `UPDATE presentations SET outline = ?, outline_version = outline_version + 1, title = COALESCE(?, title), slide_count = ?
          WHERE id = ? AND ${t.sql} AND status = 'outline' AND outline_version = ?`,
        [JSON.stringify(outline), title || null, outline.slides.length, id, ...t.params, expectedVersion],
      );
      return res.affectedRows;
    },

    // Chuyển nguyên tử outline → generating (chống bấm "Dựng bài" 2 lần / dựng trên dàn ý cũ).
    async startBuildOwned(tenantId, id, expectedVersion) {
      const t = tenantClause(tenantId);
      const [res] = await pool.execute(
        `UPDATE presentations SET status = 'generating', error_message = NULL
          WHERE id = ? AND ${t.sql} AND status = 'outline' AND outline_version = ?`,
        [id, ...t.params, expectedVersion],
      );
      return res.affectedRows;
    },

    // Dựng bài lỗi → quay lại bước duyệt dàn ý (giữ nguyên công sức của người dùng), kèm thông báo lỗi.
    async buildFailed(tenantId, id, errorMessage) {
      const t = tenantClause(tenantId);
      await pool.execute(
        `UPDATE presentations SET status = 'outline', error_message = ? WHERE id = ? AND ${t.sql} AND outline IS NOT NULL`,
        [String(errorMessage || 'Không dựng được bài trình bày').slice(0, 500), id, ...t.params],
      );
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

    // Tiến trình chết giữa chừng (mất điện, redeploy): đang lập dàn ý → lỗi (tệp nguồn đã mất);
    // đang dựng bài mà đã có dàn ý → quay về bước duyệt dàn ý để bấm dựng lại.
    async failStaleGenerating() {
      const [a] = await pool.execute(
        `UPDATE presentations SET status = 'outline', error_message = 'Quá trình dựng bị gián đoạn do máy chủ khởi động lại. Bấm "Dựng bài" để thử lại.'
          WHERE status = 'generating' AND outline IS NOT NULL`,
      );
      const [b] = await pool.execute(
        "UPDATE presentations SET status = 'failed', error_message = 'Quá trình tạo bị gián đoạn do máy chủ khởi động lại. Vui lòng tạo lại.' WHERE status IN ('generating', 'outlining')",
      );
      return a.affectedRows + b.affectedRows;
    },
  };
}
