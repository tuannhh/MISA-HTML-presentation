-- 2026-11-08: Thư mục sắp xếp bài trình bày (lồng nhau nhiều cấp).
--  * folders: thư mục riêng của từng người (tenant). parent_id NULL = thư mục gốc. Độ sâu / số lượng do ứng dụng giới hạn.
--    Xoá thư mục KHÔNG xoá bài: ứng dụng chuyển thư mục con + bài lên thư mục cha trước khi xoá (FK chỉ là lưới an toàn).
--  * presentations.folder_id: thư mục chứa bài (NULL = chưa xếp). Thư mục bị xoá → bài về gốc (ON DELETE SET NULL).
-- Idempotent: CREATE TABLE IF NOT EXISTS; thêm cột/khoá/index chỉ khi chưa có.

CREATE TABLE IF NOT EXISTS folders (
  id          CHAR(36)      NOT NULL,
  tenant_id   CHAR(36)      NOT NULL,
  parent_id   CHAR(36)      NULL,
  name        VARCHAR(120)  NOT NULL,
  created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_folders_tenant_parent (tenant_id, parent_id),
  CONSTRAINT fk_folders_tenant FOREIGN KEY (tenant_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND COLUMN_NAME = 'folder_id');
SET @sql := IF(@has_col = 0, 'ALTER TABLE presentations ADD COLUMN folder_id CHAR(36) NULL AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ix := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND INDEX_NAME = 'ix_presentations_folder');
SET @sql := IF(@has_ix = 0, 'ALTER TABLE presentations ADD KEY ix_presentations_folder (tenant_id, folder_id, updated_at)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_fk := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND CONSTRAINT_NAME = 'fk_presentations_folder');
SET @sql := IF(@has_fk = 0, 'ALTER TABLE presentations ADD CONSTRAINT fk_presentations_folder FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE SET NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261108_100000.sql');
