# Changelogs cơ sở dữ liệu

Mỗi thay đổi lược đồ sau baseline `../schema.sql` là 1 file riêng:
`changelog_database_YYYYMMDD_HHMMSS.sql`, chạy theo thứ tự tên file.

Quy tắc:
1. File phải idempotent (kiểm tra `INFORMATION_SCHEMA` trước khi thêm cột/index).
2. Đồng thời cập nhật `../schema.sql` để baseline luôn là bản đầy đủ mới nhất.
3. Cuối file ghi `INSERT IGNORE INTO schema_changelog (name) VALUES ('<tên file>');`.
4. Cập nhật `memory-bank/03-database-schema.md` và `memory-bank/10-development-history.md`.

Áp dụng thủ công (ứng dụng không tự ALTER khi khởi động):

```bash
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" misa_presentation' < startup/database/changelogs/<file>.sql
```

Danh sách và nội dung từng changelog: `memory-bank/03-database-schema.md` (mục Lịch sử thay đổi lược đồ). Changelog bắt buộc phải có trong `REQUIRED_CHANGELOGS` (`src/db/pool.js`).
