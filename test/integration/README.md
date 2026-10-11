# Test tích hợp (MySQL thật)

`concurrency.test.js` kiểm các race điều kiện ở mức SQL (F07: hạ quyền admin chéo nhau, trần số người được mời) và tính idempotent của
changelog (F15). Dùng **database tạm** `<DB_NAME>_it` dựng từ `startup/database/schema.sql`, xoá sau khi chạy — không động vào dữ liệu thật.
Không kết nối được / không đủ quyền → test tự bỏ qua (skip).

Chuẩn bị (Docker local):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql   # mở cổng 127.0.0.1:3307
docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "GRANT ALL ON \`%\\_it\`.* TO \"$MYSQL_USER\"@\"%\"; FLUSH PRIVILEGES;"'
DB_HOST=127.0.0.1 DB_PORT=3307 npm run test:integration
```
