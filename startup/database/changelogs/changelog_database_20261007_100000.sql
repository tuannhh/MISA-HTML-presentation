-- 2026-10-07: Chia sẻ theo người + phiên bản handoff.
--  * presentation_shares: chủ bài mời người dùng khác vào bài với quyền 'viewer' (chỉ xem) hoặc 'editor' (chỉnh sửa).
--    Công khai (presentations.visibility) vẫn giữ nguyên ý nghĩa: mọi người dùng chỉ XEM bài.
--  * presentation_versions: ảnh chụp spec của bài.
--      kind='baseline' — bản gốc, chụp lần ĐẦU chủ bài chia sẻ (mời người hoặc bật công khai); mỗi bài tối đa 1 bản
--                        (khoá duy nhất qua cột sinh baseline_lock). Khôi phục không chọn bản handoff → về bản này.
--      kind='handoff'  — bản chủ bài/người sửa chốt là "ổn" (tối đa 5 bản/bài, kiểm tra trong giao dịch ở service).
-- Bài đang công khai trước bản cập nhật này: tạo bản gốc từ nội dung hiện tại (mốc gần nhất với lúc chia sẻ còn lại).
-- Idempotent: CREATE TABLE IF NOT EXISTS; seed bản gốc chỉ cho bài chưa có.

CREATE TABLE IF NOT EXISTS presentation_shares (
  presentation_id CHAR(36)     NOT NULL,
  user_id         CHAR(36)     NOT NULL,
  role            ENUM('viewer','editor') NOT NULL,
  created_by      CHAR(36)     NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (presentation_id, user_id),
  KEY ix_presentation_shares_user (user_id, updated_at),
  CONSTRAINT fk_presentation_shares_presentation FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE CASCADE,
  CONSTRAINT fk_presentation_shares_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_presentation_shares_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS presentation_versions (
  id              CHAR(36)     NOT NULL,
  presentation_id CHAR(36)     NOT NULL,
  kind            ENUM('baseline','handoff') NOT NULL,
  title           VARCHAR(200) NOT NULL,
  ratio           ENUM('16:9','4:3','2:1','3:1') NOT NULL,
  spec            JSON         NOT NULL,
  spec_version    INT UNSIGNED NOT NULL,
  slide_count     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  note            VARCHAR(200) NULL,
  created_by      CHAR(36)     NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- 1 khi là bản gốc, NULL khi là handoff → khoá duy nhất chỉ chặn bản gốc thứ 2 của cùng bài.
  baseline_lock   TINYINT AS (IF(kind = 'baseline', 1, NULL)) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_presentation_versions_baseline (presentation_id, baseline_lock),
  KEY ix_presentation_versions_presentation (presentation_id, kind, created_at),
  CONSTRAINT fk_presentation_versions_presentation FOREIGN KEY (presentation_id) REFERENCES presentations (id) ON DELETE CASCADE,
  CONSTRAINT fk_presentation_versions_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO presentation_versions (id, presentation_id, kind, title, ratio, spec, spec_version, slide_count, created_by)
SELECT UUID(), p.id, 'baseline', p.title, p.ratio, p.spec, p.spec_version, p.slide_count, p.tenant_id
  FROM presentations p
 WHERE p.visibility = 'public' AND p.status = 'ready' AND p.spec IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM presentation_versions v WHERE v.presentation_id = p.id AND v.kind = 'baseline');

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261007_100000.sql');
