# 10 — Lịch sử phát triển

## 2026-10-05 — Tư liệu đa tệp 300MB, ghi âm + OCR, số trang tự động, tông nền Sáng/Tối

### Thay đổi
- **Nhiều tệp, tổng ≤ 300MB** (`MAX_UPLOAD_MB`, không giới hạn riêng từng tệp, ≤ `MAX_UPLOAD_FILES`=20): multer ghi đĩa `STORAGE_DIR/uploads` (UUID), chặn sớm theo Content-Length, xoá khi job xong / khởi động / quá 12 giờ. Link tải về cũng dùng trần 300MB (link Google Slides > 50MB trước đây báo lỗi).
- **Ghi âm làm tư liệu**: mp3/m4a/mp4/wav/ogg/flac/aac/aiff/webm (magic bytes). Gemini nghe trực tiếp (tư liệu nhỏ) hoặc chuyển thể thành văn bản trước (tư liệu lớn) — `mediaService`.
- **OCR**: PDF scan đọc bằng Gemini (prompt yêu cầu nhận dạng chữ), PDF lớn cắt cụm 100 trang/45MB (pdf-lib) qua Files API; ảnh gửi AI ở 1280px để đọc chữ trong ảnh.
- **Số trang**: "Tự động" (mặc định, AI chọn ≤ 25) hoặc "Tuỳ chỉnh" 3–40 = đúng N trang (sửa lỗi cũ: yêu cầu 7 ra 6 vì prompt cho phép ±2). `capSlides` lưới an toàn phía server.
- **Tông nền Sáng/Tối** (`tone`): AI chỉ chọn theme trong tông. Thêm theme sáng `ember` (cam – đen); viết lại `paper` (xanh dương – đen) — mọi màu chữ/hình ≥ 4.5:1, bỏ vàng/xám nhạt; bỏ glow trên nền sáng.
- **Sửa lỗi hiển thị**: icon tâm trang bìa trắng-trên-trắng ở theme `ocean`/`paper` (thêm `--core`/`--core-ink`); tăng `--dim` theme tối.
- **Giao diện**: ô tải tệp rộng hết khung (MUpload `block`), danh sách nhiều tệp + tổng dung lượng + % tải lên (XHR `uploadForm`), TonePicker, số trang dạng radio; mobile tương ứng.

### Đã kiểm chứng (Docker + Gemini thật)
- Unit 18/18; smoke "TẤT CẢ ĐẠT" (7 trang yêu cầu → đúng 7).
- E2E trực tiếp: PDF scan (chỉ ảnh) + ảnh chụp ghi chú + m4a, tông Sáng, tự động → 6 trang theme `paper`, đủ 7/7 dữ kiện từ OCR + ghi âm.
- E2E hai bước: PDF 47MB/6 trang (cắt 2 cụm, Files API) + mp3, 7 trang, tông Tối → đúng 7 trang, đọc được dữ kiện trang cuối; thư mục uploads trống sau job.
- Giới hạn: 301MB → 413 sau ~2,5s; .exe → 415; 2 loại nguồn → 400.

## 2026-10-05 — Dựng môi trường dev trên macOS

- Clone về macOS, chạy Docker (`APP_PORT=8088`, MySQL dev `127.0.0.1:3307`); smoke test Docker "TẤT CẢ ĐẠT" với Gemini thật.
- Sửa `npm test`: `node --test test/unit/` → `node --test "test/unit/**/*.test.js"` (Node 24 trên macOS/Linux không nhận thư mục làm đối số — xem `09`). Unit 13/13.

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
