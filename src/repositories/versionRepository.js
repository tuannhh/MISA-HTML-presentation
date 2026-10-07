// Truy cập bảng presentation_versions: bản gốc (lần đầu chia sẻ) + bản handoff (chủ bài/người sửa chốt bản ổn).
// Ảnh chụp luôn lấy từ chính dòng presentations (INSERT … SELECT) → đúng nội dung ĐÃ LƯU, không nhận spec từ client.
// Mọi hàm nhận presentationId ĐÃ được service kiểm tra quyền trước — tầng này không tự quyết quyền.
import { withTransaction } from '../db/pool.js';

const LIST_COLS = `v.id, v.presentation_id, v.kind, v.title, v.ratio, v.spec_version, v.slide_count, v.note, v.created_by, v.created_at,
  u.display_name AS creator_name`;

function parseSpec(row) {
  if (row && typeof row.spec === 'string') row.spec = JSON.parse(row.spec);
  return row || null;
}

export function createVersionRepository(pool) {
  return {
    // Bản gốc: chỉ tạo 1 lần cho mỗi bài (khoá duy nhất uq_presentation_versions_baseline) — gọi lại không ghi đè.
    // Trả true khi vừa tạo mới.
    async ensureBaseline(presentationId, createdBy) {
      try {
        const [res] = await pool.execute(
          `INSERT INTO presentation_versions (id, presentation_id, kind, title, ratio, spec, spec_version, slide_count, created_by)
           SELECT UUID(), p.id, 'baseline', p.title, p.ratio, p.spec, p.spec_version, p.slide_count, ?
             FROM presentations p
            WHERE p.id = ? AND p.status = 'ready' AND p.spec IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM presentation_versions v WHERE v.presentation_id = p.id AND v.kind = 'baseline')`,
          [createdBy, presentationId],
        );
        return res.affectedRows === 1;
      } catch (err) {
        // Hai lượt chia sẻ đầu tiên chạy cùng lúc: lượt sau vấp khoá duy nhất → bản gốc đã có, không phải lỗi.
        if (err.code === 'ER_DUP_ENTRY') return false;
        throw err;
      }
    },

    // Danh sách (không kèm spec): bản gốc trước, rồi handoff mới nhất trước.
    async list(presentationId) {
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLS} FROM presentation_versions v LEFT JOIN users u ON u.id = v.created_by
          WHERE v.presentation_id = ? ORDER BY v.kind = 'baseline' DESC, v.created_at DESC`,
        [presentationId],
      );
      return rows;
    },

    async find(presentationId, id) {
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLS}, v.spec FROM presentation_versions v LEFT JOIN users u ON u.id = v.created_by
          WHERE v.presentation_id = ? AND v.id = ? LIMIT 1`,
        [presentationId, id],
      );
      return parseSpec(rows[0]);
    },

    async findBaseline(presentationId) {
      const [rows] = await pool.execute(
        `SELECT ${LIST_COLS}, v.spec FROM presentation_versions v LEFT JOIN users u ON u.id = v.created_by
          WHERE v.presentation_id = ? AND v.kind = 'baseline' LIMIT 1`,
        [presentationId],
      );
      return parseSpec(rows[0]);
    },

    // Chốt bản handoff từ nội dung đang lưu. Khoá dòng presentations (FOR UPDATE) để:
    //  - người dùng chốt đúng phiên bản họ đang thấy (spec_version khớp),
    //  - giới hạn số bản không bị vượt khi nhiều người bấm cùng lúc.
    // Trả { id } hoặc { error: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'DUPLICATE' | 'LIMIT' }.
    async createHandoff({ id, presentationId, expectedVersion, note, createdBy, max }) {
      return withTransaction(pool, async (conn) => {
        const [[deck]] = await conn.execute("SELECT spec_version FROM presentations WHERE id = ? AND status = 'ready' AND spec IS NOT NULL FOR UPDATE", [presentationId]);
        if (!deck) return { error: 'NOT_FOUND' };
        if (deck.spec_version !== expectedVersion) return { error: 'VERSION_CONFLICT' };
        const [[stat]] = await conn.execute(
          "SELECT COUNT(*) AS n, COALESCE(SUM(spec_version = ?), 0) AS dup FROM presentation_versions WHERE presentation_id = ? AND kind = 'handoff'",
          [expectedVersion, presentationId],
        );
        if (Number(stat.dup) > 0) return { error: 'DUPLICATE' };
        if (Number(stat.n) >= max) return { error: 'LIMIT' };
        await conn.execute(
          `INSERT INTO presentation_versions (id, presentation_id, kind, title, ratio, spec, spec_version, slide_count, note, created_by)
           SELECT ?, p.id, 'handoff', p.title, p.ratio, p.spec, p.spec_version, p.slide_count, ?, ? FROM presentations p WHERE p.id = ?`,
          [id, note || null, createdBy, presentationId],
        );
        return { id };
      });
    },

    async countHandoffs(presentationId) {
      const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM presentation_versions WHERE presentation_id = ? AND kind = 'handoff'", [presentationId]);
      return Number(n);
    },

    // Chỉ xoá được bản handoff (bản gốc là mốc cố định).
    async removeHandoff(presentationId, id) {
      const [res] = await pool.execute("DELETE FROM presentation_versions WHERE presentation_id = ? AND id = ? AND kind = 'handoff'", [presentationId, id]);
      return res.affectedRows;
    },
  };
}
