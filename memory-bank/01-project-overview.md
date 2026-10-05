# 01 — Tổng quan dự án

## Dự án là gì?

**MISA Presentation** là ứng dụng web tạo **bài trình bày HTML có chuyển động** (phong cách Remotion/HyperFrames: chữ bay vào theo spring, đếm số, vẽ đường, nền mạng lưới động) từ tài liệu có sẵn bằng AI (Google Gemini, model mặc định `gemini-3.8-flash`).

Tính năng chính:
- Nhập nguồn theo 3 cách: **tải tệp** (.pptx, .docx, .pdf, .txt, .md, ảnh), **dán link** (Google Slides/Docs/Sheets/Drive công khai hoặc trang web công khai), **nhập nội dung** trực tiếp.
- **Hai bước**: AI lập **dàn ý** (nội dung sẽ hiển thị trên từng trang) → người dùng duyệt/sửa, gắn **ảnh, video tải lên, link YouTube** cho từng trang, chọn thiết kế → AI **dựng bài** theo đúng dàn ý.
- AI chọn bố cục cho từng trang trong 13 layout (bìa, mở đầu phần, mục lục, ý chính, thẻ, con số, ảnh/video lớn, bộ sưu tập ảnh, dòng thời gian, quy trình, trích dẫn, so sánh, trang kết). Ảnh trong tài liệu nguồn được giữ lại và gắn vào trang phù hợp.
- **Thiết kế**: tông màu Tự động / 14 mẫu theo nền sáng-tối / tự nhập 2 màu; 10 nền động chủ đề công nghệ; 5 phông đóng gói sẵn (Inter, Montserrat, Barlow, Roboto, Google Sans); logo (vị trí, kích thước, tách nền). Video trong slide: khung 16:9, bấm → tự phát toàn màn hình.
- 4 tỷ lệ khung: **16:9, 4:3, 2:1, 3:1** (3:1 cho màn LED/sân khấu).
- **Trình soạn thảo**: sửa chữ, đổi/tải ảnh, đổi bố cục, thêm/xoá/sắp xếp/nhân bản trang, đổi giao diện & chân trang → bấm **Lưu** → server chuẩn hoá và render lại, khung xem trước tải lại.
- **Xuất**: HTML một tệp (giữ chuyển động, ảnh + phông + video tải lên nhúng base64, mở offline được) và PDF (không chuyển động, mỗi trang 1 slide đúng tỷ lệ).
- **Đa tenant**: mỗi người dùng là 1 tenant độc lập; bài **Riêng tư** chỉ chủ sở hữu thấy (kể cả admin không xem được). Bài **Công khai**: mọi người dùng của hệ thống xem/trình chiếu/tải/nhân bản được, nhưng không sửa được.
- Đăng nhập: tự đăng ký **giới hạn theo tên miền email** (mặc định `misa.com.vn`) + admin cấp tài khoản (mật khẩu tạm, bắt buộc đổi ở lần đăng nhập đầu).
- Giao diện theo **MISA Design System 2.0**, có composition **desktop** và **mobile mini-app** riêng cho mọi route.

## Người phụ trách dự án

- **Người liên hệ chính:** Tuấn (tkmedia@misa.com.vn), GitHub `tuannhh`.
- **Đặc điểm cần lưu ý:** trao đổi bằng tiếng Việt; ưu tiên làm xong trọn vẹn (chạy được trên Docker, có tài liệu) rồi mới báo.

## Môi trường

| Môi trường | URL/địa chỉ | Cơ sở dữ liệu | Ghi chú |
|---|---|---|---|
| Phát triển (local) | Giao diện Vite `http://localhost:5173`, API `http://localhost:3000` | MySQL 8.4 trong Docker, cổng `127.0.0.1:3307` | Xem `07-deployment-infrastructure.md` |
| Docker (1 máy chủ) | `http://localhost:${APP_PORT}` (máy dev đang dùng 8088 vì 8080 bị dự án khác chiếm) | MySQL 8.4 container `mysql`, volume `mysql-data` | Cùng DB với môi trường dev local (cùng compose project) |
| Kiểm thử | Chưa xác định | — | — |
| Sản xuất | Chưa xác định | — | Dự kiến 1 máy chủ Docker; storage có thể chuyển sang S3/MinIO sau |

> **Quan trọng:** dev local (`npm run dev:api`) và container `app` dùng **chung** database MySQL của compose project `misa-presentation`. Dữ liệu tạo ở bên này sẽ thấy ở bên kia; nhưng **ảnh/tệp** thì khác nơi lưu (dev: `./data/storage`; container: volume `app-data`) → bài tạo ở dev mở trong container sẽ thiếu ảnh.

## Đối tượng sử dụng

| Vai trò | Phạm vi | Ghi chú |
|---|---|---|
| `user` | Bài của chính mình + bài công khai của người khác (chỉ đọc) | Mặc định khi tự đăng ký |
| `admin` | Như `user` + quản trị tài khoản (tạo, đổi vai trò, khoá/mở, đặt lại mật khẩu) | **Không** xem được bài riêng tư của người khác |

## Quy trình làm việc điển hình

1. Đăng nhập (hoặc đăng ký bằng email công ty).
2. **Tạo bài** → chọn nguồn (tệp/link/văn bản) → chọn tỷ lệ, tông màu, số trang mong muốn, yêu cầu thêm → **Lập dàn ý bằng AI** (30 giây – vài phút; có thể rời trang).
3. **Duyệt dàn ý**: sửa tiêu đề/từng dòng nội dung, thêm/bớt/sắp xếp trang, gắn ảnh/video/YouTube, chọn màu – nền – phông – logo → **Dựng bài** (1–3 phút).
4. Tự chuyển sang trình soạn thảo: xem trước có chuyển động, tinh chỉnh từng trang/thiết kế → **Lưu**.
5. Trình chiếu toàn màn hình, hoặc **Tải xuống** HTML/PDF.
6. Tuỳ chọn: bật **Công khai** để chia sẻ cho toàn hệ thống; người khác có thể **Nhân bản** về thành bản riêng tư để sửa.
