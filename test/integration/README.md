# Test tích hợp (MySQL thật)

- `concurrency.test.js`: race ở mức SQL (F07: hạ quyền admin chéo nhau, trần số người được mời) và tính idempotent của changelog (F15).
- `smoke-cleanup.test.js`: script dọn tài khoản smoke chỉ xoá đúng tài khoản smoke của lần chạy (A01).
- Các test khác thêm theo từng lỗi (A04 phục hồi bản sao, A06 công khai + bản gốc, Publish…).
- **Luồng chính qua HTTP** (roadmap B): `flows-auth`, `flows-deck`, `flows-share`, `https-proxy`. Dựng app thật trên cổng ngẫu nhiên + AI giả
  (`test/helpers/fakeGemini.mjs`) bằng `helpers/httpApp.mjs` → `useHttpApp(config, { before, after }, opts)` — dựng DB **và** app trong 1 hook
  (node:test chạy song song các hook `before` gốc). `opts.ingress: true` thêm cổng vào giả kết thúc TLS (`X-Forwarded-Proto: https`).
  Xuất PDF cần Chrome/Edge trên máy (Docker có Chromium); `CHROME_PATH` không tồn tại → harness tự dò.

Mỗi tệp dựng **database tạm tên duy nhất** `<DB_NAME>_it_<ngẫu nhiên>` từ `startup/database/schema.sql`, xoá trong `finally` (kể cả khi dựng lỗi giữa chừng) —
hai runner chạy cùng lúc không xoá DB của nhau, không động vào dữ liệu thật. Helper: `helpers/testDb.mjs`.

**Không dựng được database → test FAIL (exit ≠ 0).** Chỉ khi đặt `IT_OPTIONAL=1` (máy dev) mới chuyển thành skip — không đặt cờ này trong CI/gate.
Gate cần thấy `# fail 0` **và** `# skipped 0`.

Kết nối bằng tài khoản test riêng có quyền tạo/xoá database (`IT_DB_*`), không cần cấp quyền này cho tài khoản runtime của ứng dụng.
Thiếu `IT_DB_*` thì lùi về `DB_*` trong `.env`.

Chuẩn bị nhanh bằng MySQL tạm riêng (khuyến nghị):

```bash
docker run -d --name mp-it-mysql -e MYSQL_ROOT_PASSWORD=<mat-khau-tam> -p 127.0.0.1:33099:3306 mysql:8.4
IT_DB_HOST=127.0.0.1 IT_DB_PORT=33099 IT_DB_USER=root IT_DB_PASSWORD=<mat-khau-tam> npm run test:integration
docker rm -f mp-it-mysql
```
