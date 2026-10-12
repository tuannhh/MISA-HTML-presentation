// Truy cập bảng publications (xuất bản bài ra domain công khai). Tối đa 1 bản xuất bản/bài.
// Hàm "của tôi" lọc theo tenant qua tenantClause; hàm của trang công khai chỉ đọc bản đang 'published'
// của chủ bài còn hoạt động (khoá tài khoản → trang công khai của họ ngừng hiện ngay).
import { withTransaction } from '../db/pool.js';
import { tenantClause } from './tenantScope.js';

const COLS = 'p.id, p.presentation_id, p.tenant_id, p.code, p.slug, p.title, p.status, p.revision, p.csp_nonce, p.spec_version, p.published_by, p.published_at, p.unpublished_at';

export function createPublicationRepository(pool) {
  return {
    async findForPresentation(tenantId, presentationId) {
      const t = tenantClause(tenantId, 'p');
      const [rows] = await pool.execute(`SELECT ${COLS} FROM publications p WHERE p.presentation_id = ? AND ${t.sql} LIMIT 1`, [presentationId, ...t.params]);
      return rows[0] || null;
    },

    async findPublishedByCode(code) {
      const [rows] = await pool.execute(
        `SELECT ${COLS} FROM publications p JOIN users u ON u.id = p.tenant_id
          WHERE p.code = ? AND p.status = 'published' AND u.status = 'active' LIMIT 1`,
        [code],
      );
      return rows[0] || null;
    },

    // Ghi bản xuất bản mới trong 1 giao dịch, khoá dòng bài (cùng khoá với lưu nội dung/bật công khai):
    //  - bài đã bị xoá → { error: 'NOT_FOUND' }
    //  - bài đã được sửa sau lúc dựng HTML (spec_version khác) → { error: 'STALE' } (ảnh chụp không khớp nội dung hiện tại)
    //  - mã mới trùng (rất hiếm) → { error: 'DUP_CODE' } để service sinh mã khác
    //  - bài đã có mã KHÁC mã dùng lúc dựng (2 lần xuất bản đầu chạy song song) → { error: 'CODE_CHANGED' }: HTML vừa dựng trỏ media
    //    theo mã sai → service dựng lại với mã đã có
    // Xuất bản lại giữ nguyên mã cũ (link đã gửi vẫn dùng được). Trả { code, previousRevision }.
    async save(tenantId, presentationId, { id, code, slug, title, revision, nonce, specVersion, publishedBy }) {
      const t = tenantClause(tenantId);
      return withTransaction(pool, async (conn) => {
        const [[deck]] = await conn.execute(`SELECT spec_version FROM presentations WHERE id = ? AND ${t.sql} FOR UPDATE`, [presentationId, ...t.params]);
        if (!deck) return { error: 'NOT_FOUND' };
        if (Number(deck.spec_version) !== Number(specVersion)) return { error: 'STALE' };
        const [[old]] = await conn.execute('SELECT code, status, revision FROM publications WHERE presentation_id = ? FOR UPDATE', [presentationId]);
        if (old && old.code !== code) return { error: 'CODE_CHANGED' };
        if (old) {
          await conn.execute(
            `UPDATE publications SET slug = ?, title = ?, status = 'published', revision = ?, csp_nonce = ?, spec_version = ?,
                    published_by = ?, published_at = CURRENT_TIMESTAMP(3), unpublished_at = NULL
              WHERE presentation_id = ?`,
            [slug, title, revision, nonce, specVersion, publishedBy, presentationId],
          );
          return { code: old.code, previousRevision: old.status === 'published' ? old.revision : null, created: false };
        }
        try {
          await conn.execute(
            `INSERT INTO publications (id, presentation_id, tenant_id, code, slug, title, status, revision, csp_nonce, spec_version, published_by, published_at)
             VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
            [id, presentationId, tenantId, code, slug, title, revision, nonce, specVersion, publishedBy],
          );
        } catch (err) {
          if (err.code === 'ER_DUP_ENTRY' && /uq_publications_code/.test(err.message)) return { error: 'DUP_CODE' };
          throw err;
        }
        return { code, previousRevision: null, created: true };
      });
    },

    // Gỡ xuất bản (giữ dòng + mã để xuất bản lại dùng cùng link). Trả revision vừa gỡ (để xoá tệp) hoặc null nếu không có gì để gỡ.
    async unpublish(presentationId) {
      return withTransaction(pool, async (conn) => {
        const [[row]] = await conn.execute("SELECT revision FROM publications WHERE presentation_id = ? AND status = 'published' FOR UPDATE", [presentationId]);
        if (!row) return null;
        await conn.execute("UPDATE publications SET status = 'unpublished', unpublished_at = CURRENT_TIMESTAMP(3) WHERE presentation_id = ?", [presentationId]);
        return row.revision;
      });
    },

    // Danh sách cho admin: chỉ bản ĐANG công khai (đã là dữ liệu ai cũng xem được) — admin không thấy bài riêng tư.
    async adminList({ q, page, pageSize }) {
      const like = q ? `%${String(q).slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
      const where = `p.status = 'published'${like ? ' AND (p.title LIKE ? OR u.email LIKE ?)' : ''}`;
      const params = like ? [like, like] : [];
      const [[{ total }]] = await pool.execute(`SELECT COUNT(*) AS total FROM publications p JOIN users u ON u.id = p.tenant_id WHERE ${where}`, params);
      const [rows] = await pool.query(
        `SELECT ${COLS}, u.email AS owner_email, u.display_name AS owner_name, u.status AS owner_status
           FROM publications p JOIN users u ON u.id = p.tenant_id
          WHERE ${where} ORDER BY p.published_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      );
      return { rows, total: Number(total) };
    },

    async findByPresentation(presentationId) {
      const [rows] = await pool.execute(`SELECT ${COLS} FROM publications p WHERE p.presentation_id = ? LIMIT 1`, [presentationId]);
      return rows[0] || null;
    },
  };
}
