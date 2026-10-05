# 🧠 Memory Bank — MISA Presentation

Thư mục này chứa **toàn bộ tri thức về dự án MISA Presentation**, được tổ chức thành các tệp chuyên đề. Mục tiêu: bất kỳ ai (con người hoặc AI) đọc hết các tệp trong thư mục này đều hiểu tường tận dự án và có thể làm việc tiếp mà không cần hỏi lại.

## Cách sử dụng

- **Trước khi code bất kỳ thay đổi nào (thêm mới hoặc sửa):** đọc `11-coding-rules.md` trước — đây là nguyên tắc bắt buộc, không phải tham khảo.
- **Lần đầu tiếp cận dự án:** đọc theo thứ tự số, từ `01` đến `11`.
- **Cần tra cứu nhanh:** nhảy thẳng vào tệp tương ứng với chủ đề.
- **Sau khi thay đổi code/kiến trúc:** cập nhật tệp tương ứng + `10-development-history.md` (quy tắc bắt buộc của bộ chuẩn `xoan-backend-standard`, mục `20-memory-bank-mandate.md`).

## Danh sách tệp

| Tệp | Chủ đề | Khi nào đọc |
|---|---|---|
| [01-project-overview.md](01-project-overview.md) | Tổng quan, mục tiêu, đối tượng sử dụng | Luôn đọc đầu tiên |
| [02-technology-stack.md](02-technology-stack.md) | Công nghệ & lý do chọn | Hiểu kiến trúc kỹ thuật |
| [03-database-schema.md](03-database-schema.md) | Lược đồ dữ liệu, changelog | Làm việc với cơ sở dữ liệu |
| [04-api-reference.md](04-api-reference.md) | Toàn bộ endpoint, request/response, phân quyền | Làm việc với backend |
| [05-business-logic.md](05-business-logic.md) | Luồng nghiệp vụ cốt lõi (tạo bằng AI, sửa, chia sẻ, xuất) | Hiểu logic quan trọng nhất |
| [06-frontend-architecture.md](06-frontend-architecture.md) | Giao diện MDS 2.0, routing desktop/mobile, ma trận route × bề mặt × vai trò | Làm việc với giao diện |
| [07-deployment-infrastructure.md](07-deployment-infrastructure.md) | Docker, biến môi trường, quy trình chạy | Triển khai & vận hành |
| [08-security-model.md](08-security-model.md) | Xác thực, phân quyền, cách ly tenant, sandbox xem trước | Đảm bảo an toàn |
| [09-technical-traps.md](09-technical-traps.md) | Bẫy kỹ thuật, lỗi đã gặp | Tránh lặp sai lầm |
| [10-development-history.md](10-development-history.md) | Lịch sử phát triển, quyết định | Hiểu bối cảnh |
| [11-coding-rules.md](11-coding-rules.md) | Quy tắc code riêng của dự án | **Trước khi code bất kỳ thay đổi nào** |

## Ghi chú

- Viết bằng tiếng Việt, giữ nhất quán xuyên suốt.
- Tất cả nội dung dựa trên mã nguồn thật tại thời điểm viết (2026-10-05). Mục nào chưa kiểm chứng được ghi rõ **"chưa kiểm chứng"**.
