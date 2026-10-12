# Bằng chứng review chặng A — 12/10/2026

Commit được kiểm: `233d3483bf2d1d61febf2d9d59a2052d9a775567`. Node v24.16.0; MySQL 8.4 trong container tạm riêng. Source snapshot lấy bằng git show từng tracked file, không lấy .env; dùng node_modules đang cài của dự án. Không chạy npm ci mới. Manifest lưu danh sách snapshot.

## Kết quả

- `unit-after-build.log`: 169 pass, 0 fail, 0 skip. Lần trước build có 1 skip do thiếu bundle 3D; đã xử lý bằng build rồi chạy lại toàn bộ.
- `integration.log`: 5 pass, 0 fail, 0 skip, trên MySQL thật riêng biệt.
- `build.log`: Vite + deck3d build đạt; dùng `--configLoader native` khi chạy Vite trên snapshot dùng symlink dependencies.
- Các `*-probe.log` và `editor-probes.log`: đầu ra tái hiện lỗi, **không phải chứng nhận hành vi đạt yêu cầu**. `defectReproduced: true` nghĩa là quan sát thấy lỗi; script thoát 0 khi tái hiện thành công.
- `integration-unavailable.log`: DB không kết nối được nhưng runner trả exit 0, bỏ qua cả 5 test.

## Cách chạy lại probe

Các script đi kèm dùng import tương đối từ vị trí `docs/audits/2026-10-12-codex/evidence/review-chang-a/` đến gốc repo, dùng được khi chuyển nguyên project sang máy khác. Kiểm tra repo vẫn tại commit trên trước khi đối chiếu; nếu đang sửa code, hành vi có thể đã thay đổi. Chạy bằng `node` trên đường dẫn từng script. Các probe editor, publish, queue, smoke dùng code thật và phụ thuộc giả; không gọi AI thật, không gửi HTTP, không chạy Docker, không viết DB. Smoke probe thay hàm execFileSync trong đúng tiến trình probe bằng stub trước khi import provisioner.

Riêng `recovery-probe.mjs` dùng MySQL thật: **chỉ chạy với container DB kiểm thử mới, riêng biệt, không có dữ liệu người dùng**. Script tạo rồi xoá DB `codex_review_recovery`; không chạy vào DB dự án. Truyền REVIEW_DB_PORT và REVIEW_DB_PASSWORD của container kiểm thử ở loopback. Container Codex đã dùng (codex-misa-review-a-233d348, port 62379) đã xoá sau kiểm tra; port này không còn là cấu hình chạy lại hợp lệ.

Vue báo onBeforeUnmount ngoài component khi probe gọi composable trực tiếp; đây là giới hạn harness giống unit test composable hiện có. Probe kiểm tra logic trạng thái bằng barrier, không xác nhận rendering UI hoặc lifecycle trình duyệt. Mã Vue desktop/mobile được đọc riêng để xác nhận ô nhập vẫn cho phép gõ trong lúc save/updateMeta.

## Lệnh kiểm tra chính đã chạy trên snapshot

```text
NODE_ENV=test node --test --test-reporter=tap 'test/unit/**/*.test.js'
node node_modules/vite/bin/vite.js build --configLoader native
node scripts/build-deck3d.mjs
NODE_ENV=test DB_HOST=127.0.0.1 DB_PORT=<port-container-test> DB_USER=root DB_PASSWORD=<mat-khau-test-tam> DB_NAME=codex_review_a node --test --test-concurrency=1 'test/integration/**/*.test.js'
```

Không chạy smoke HTTP trên ứng dụng có sẵn vì bootstrap đang tạo admin mật khẩu cố định không có cleanup. Không khẳng định đã kiểm lại smoke/AI thật mà Claude báo đạt. Không chạy load 500 người, fault injection giết tiến trình hoặc kiểm tra exploit LibreOffice.
