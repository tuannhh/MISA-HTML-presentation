# 10 — Lịch sử phát triển

## 2026-10-05 — Phiên bản đầu tiên (0.1.0)

### Yêu cầu ban đầu
Ứng dụng "MISA Presentation": nhập tài liệu (tệp/link/nội dung) → AI (`gemini-3.8-flash`) tạo bài trình bày HTML có chuyển động kiểu Remotion/HyperFrames → người dùng sửa chữ/ảnh từng trang, bấm Lưu để render lại → xuất PDF (không chuyển động) hoặc HTML một tệp (media base64). Tỷ lệ 2:1, 4:3, 16:9, 3:1. Chạy trên Docker trước. Đa tenant, chia sẻ Riêng tư/Công khai.

### Quyết định đã chốt với người dùng
| Chủ đề | Lựa chọn |
|---|---|
| Đăng nhập | Cả hai: tự đăng ký **giới hạn domain** (mặc định `misa.com.vn`) + admin cấp tài khoản |
| Cơ sở dữ liệu | MySQL 8 trong docker-compose |
| Hạ tầng | 1 máy chủ, tệp trên Docker volume; storage trừu tượng để chuyển S3/MinIO sau |
| Chuẩn | `xoan-backend-standard` (backend + memory bank), MDS 2.0 (giao diện, composition mobile bắt buộc cho mọi route/vai trò) |

### Quyết định kỹ thuật
- **Spec JSON làm nguồn sự thật**, AI không sinh HTML (an toàn XSS, chỉnh sửa bằng form, render nhất quán preview/HTML/PDF).
- **13 layout + 4 theme** cố định trong `shared/deck`; AI chỉ chọn và điền.
- **Preview trong CSP sandbox** (origin null) + URL ảnh ký HMAC thay vì cookie.
- **Khoá lạc quan** `spec_version` cho lưu đồng thời nhiều tab/thiết bị.
- **Admin không xem bài private** của người khác (cách ly tenant tuyệt đối).
- Giao diện tách **desktop/** và **mobile/** composition, logic dùng chung qua composables; bề mặt chọn theo host/bề rộng, không theo UA.
- Cấu hình dùng `.env` (lệch template `config.json` — xem `07`).

### Đã kiểm chứng
- Unit test 13/13; smoke test Docker (`BASE=http://localhost:8088`) "TẤT CẢ ĐẠT" bao gồm Gemini thật và xuất PDF bằng Chromium trong container.
- Thủ công qua puppeteer: đăng ký/đăng nhập, tạo bài từ văn bản (Gemini sinh 7 trang nhiều layout), sửa trên mobile → Lưu → preview cập nhật, công khai từ ActionSheet, trang quản trị, không cuộn ngang ở 390px/1440px.

### Sự cố trong quá trình làm (xem chi tiết ở `09`)
- Cổng 8080 bị chiếm → `APP_PORT=8088`.
- Tiến trình node cũ giữ cổng 3000 trên Windows khiến sửa CSS không có hiệu lực.
- Vá MDS: MInput/MTextarea chuyển attr, MDataTable `hideTools`.
- HUD engine đè preview nhúng → ẩn khi `body.embed`.

### Việc còn lại / ý tưởng
- Kiểm chứng trong host MISA AMIS thật, safe-area và cử chỉ trên thiết bị thật.
- Adapter storage S3/MinIO; hàng đợi ngoài nếu cần scale nhiều instance.
- Sao lưu tự động DB + volume.
- Test integration (`npm run test:integration`) — thư mục `test/integration/` chưa có test.
