-- 2026-11-08: Nén video tải lên chạy nền (ffmpeg).
--  * assets.process_state: trạng thái tối ưu tệp video — NULL = không có việc (ảnh, video cũ), pending = chờ nén, running = đang nén,
--    done = đã thay bằng bản nén, skipped = giữ bản gốc (đã gọn / không giảm được), failed = nén lỗi (vẫn dùng bản gốc).
--    Khởi động lại khi còn pending/running → ứng dụng đưa lại vào hàng nén (tệp gốc chỉ bị thay sau khi bản nén ghi xong).
-- Idempotent: chỉ thêm cột khi chưa có.

SET @has_col := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'process_state');
SET @sql := IF(@has_col = 0, "ALTER TABLE assets ADD COLUMN process_state ENUM('pending','running','done','skipped','failed') NULL AFTER original_name", 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

INSERT IGNORE INTO schema_changelog (name) VALUES ('changelog_database_20261108_200000.sql');
