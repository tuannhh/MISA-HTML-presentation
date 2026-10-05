-- 2026-10-05: Quy trình "dàn ý trước" + media (video, YouTube) + logo.
--  * presentations.status thêm 'outlining' (AI đang lập dàn ý) và 'outline' (chờ người dùng duyệt dàn ý).
--  * presentations.outline: dàn ý đang duyệt (JSON) — giữ lại sau khi dựng để tham chiếu.
--  * presentations.outline_version: khoá lạc quan khi lưu dàn ý (tách khỏi spec_version).
--  * assets.kind thêm 'video' (video tải lên), 'logo' (logo gốc + bản tách nền), 'poster' (ảnh bìa video/YouTube).
-- Idempotent: MODIFY ENUM chạy lại không đổi dữ liệu; ADD COLUMN kiểm tra INFORMATION_SCHEMA trước.

ALTER TABLE presentations
  MODIFY status ENUM('outlining','outline','generating','ready','failed') NOT NULL DEFAULT 'generating';

SET @has_outline := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND COLUMN_NAME = 'outline');
SET @sql := IF(@has_outline = 0,
  'ALTER TABLE presentations ADD COLUMN outline JSON NULL AFTER spec, ADD COLUMN outline_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER outline',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE assets
  MODIFY kind ENUM('image','thumbnail','video','logo','poster') NOT NULL DEFAULT 'image';

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261005_170000.sql');
