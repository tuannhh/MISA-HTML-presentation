# Hồ sơ audit và kế hoạch để duyệt

**Đọc trước:** [02 — Kế hoạch triển khai chi tiết](02-ke-hoach-trien-khai.md).

| Tài liệu | Dùng để |
|---|---|
| [01 — Audit](01-audit-misa-backend.md) | Hiểu kiến trúc, điểm tốt, 21 finding, bằng chứng và giới hạn |
| [02 — Kế hoạch](02-ke-hoach-trien-khai.md) | Duyệt 21 work item, kiến trúc, test gates, tải 500, rollback và DevOps |
| [03 — Catalogue test CSV](03-ma-tran-test-case.csv) | 198 đặc tả case / 17 nhóm; chưa phải 198 test đã chạy |
| [Hướng dẫn catalogue](03-huong-dan-test-catalogue.md) | Fixtures, expected behaviour, các phép tổ hợp quyền/trạng thái và cách triển khai |
| [04 — Ma trận tuân thủ CSV](04-ma-tran-tuan-thu.csv) | 76 checklist nguyên văn từ 12 chương, hiện trạng, finding, work item, test family |
| [05 — Phản biện Claude](05-ho-so-phan-bien-claude.md) | Những giả thuyết đã loại bỏ, câu hỏi phản biện và giới hạn xác thực CLI |
| [06 — Bằng chứng](06-bang-chung-kiem-chung.md) | Unit 134/134, build, syntax, probe và manifest |
| [07 — Thay đổi đồng thời](07-thay-doi-dong-thoi.md) | Org/redraw xuất hiện sau snapshot, phạm vi cần nghiệm thu lại |

Ma trận76 mục là checklist cuối các chương liên quan, không thay thế toàn bộ nội dung quy định trong nguồn chuẩn. Gate tuân thủ phải kiểm cả các điều kiện chi tiết trong chương, như bcrypt/session/SSRF, transaction, dữ liệu tạm, backup và ngoại lệ theo công nghệ. Không quy đổi “đạt ở audit” thành “production đã đạt”; mỗi claim có phạm vi riêng.

Những quyết định cần duyệt cùng plan: nguồn chuẩn/schema, MySQL durable jobs, domain allowlist cho URL import, SLA thu hồi asset, profile tải500 và mục tiêu RPO/RTO. Chưa sửa source hay triển khai production. Sau duyệt bắt đầu test harness và regression, rồi mới sửa logic.

Claude CLI chưa trả review vì OAuth session của lần gọi không refresh được. Quyền gửi payload phản biện đã được anh xác nhận. Hồ sơ này không giả định Claude đã xem hay đồng ý.
