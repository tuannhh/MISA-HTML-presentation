-- 2026-10-06: Đường dẫn thân thiện /tên-bài/<mã 8 ký tự>/<tính năng> (vd. /gioi-thieu-amis-oneAI/1234abcd/edit).
--  * presentations.short_code: mã ngẫu nhiên 8 ký tự [a-z0-9], duy nhất toàn hệ thống (server sinh khi tạo/nhân bản bài).
--    Mã chỉ để định vị bài; quyền đọc/sửa vẫn kiểm tra như cũ (không đủ quyền → 404).
--  * Bài cũ: sinh mã từ MD5(id + ngẫu nhiên) — chỉ gồm 0-9a-f, vẫn thoả định dạng.
-- Idempotent: ADD COLUMN / ADD INDEX kiểm tra INFORMATION_SCHEMA trước; backfill chỉ chạm dòng còn NULL.

SET @has_code := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND COLUMN_NAME = 'short_code');
SET @sql := IF(@has_code = 0, 'ALTER TABLE presentations ADD COLUMN short_code CHAR(8) NULL AFTER tenant_id', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE presentations SET short_code = SUBSTRING(MD5(CONCAT(id, RAND())), 1, 8) WHERE short_code IS NULL;

SET @has_idx := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'presentations' AND INDEX_NAME = 'uq_presentations_code');
SET @sql := IF(@has_idx = 0, 'ALTER TABLE presentations ADD UNIQUE KEY uq_presentations_code (short_code)', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261006_090000.sql');
