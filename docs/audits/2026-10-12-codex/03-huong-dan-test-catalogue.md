# Cách dùng catalogue kiểm thử

Catalogue có **198 kịch bản** thuộc 17 nhóm. Đây là **đặc tả để duyệt**, không phải 198 test đã chạy. Một hàng có thể triển khai thành nhiều test tham số hoá. Những unit hiện có được tái sử dụng sau đối chiếu assertion; không viết lại chỉ để tăng số lượng.

Fixture chung, cách test red/green và gates nằm ở mục4 kế hoạch. Mọi test phải có commit, seed, environment, result và artifact. Khi triển khai, bổ sung cột test file/test name, requirement ID, expected đã duyệt và CI run; không đổi “chưa triển khai” thành pass dựa trên đọc code.

Chạy ma trận role/state/boundary có hệ thống: owner/editor/viewer/stranger/admin/disabled/must-change; trạng thái outlining/outline/generating/ready/failed; dữ liệu private/public/shared. Trên mỗi API tối thiểu có hợp lệ, anonymous, sai quyền, malformed input, not-found và lỗi phụ thuộc thích hợp. CSV nêu kịch bản nổi bật; các phép tổ hợp này là phần bắt buộc của harness, không chỉ chọn happy path.

Các test mới về job/lease/export workflow là tiêu chí tương lai: viết test trước implementation ở ticket tương ứng. Regression của tính năng hiện tại phải hoàn tất GateT1 trước sửa logic. Với lỗi đã xác nhận, lưu bằng chứng test red trên baseline, sửa rồi green; không đóng băng bug thành expected behaviour hoặc che bằng skip.

Manual device/visual chỉ dùng ở phần thật sự cần thiết và phải lưu kết quả; không thay HTTP integration/MySQL race/load bằng thao tác thủ công. Browser E2E ít nhất desktop Chromium và mobile viewport; WebKit/Safari thật cho HEIC/video/touch nếu DevOps công bố hỗ trợ. Catalogue UI tập trung chức năng; khi sửa UI phải đọc misa-design-system trước, không tự tuyên bố chứng nhận MDS từ audit backend này.

Nhóm và số kịch bản:

- AUTH: 18 — Tài khoản và phiên
- ACL: 12 — Phân quyền tenant
- SRC: 18 — Tạo bài và tư liệu
- OUT: 10 — Dàn ý và dựng bài
- EDIT: 12 — Soạn thảo và cộng tác
- MEDIA: 14 — Ảnh video logo và provider
- DESIGN: 10 — Thiết kế và renderer
- PRES: 10 — Trình chiếu và giao diện
- SHARE: 10 — Chia sẻ và phiên bản
- TPL: 8 — Mẫu thiết kế
- EXPORT: 12 — Xuất HTML PDF và thumbnail
- JOB: 12 — Job bền vững và chịu lỗi
- DATA: 12 — Cơ sở dữ liệu và toàn vẹn
- SEC: 12 — Bảo mật và input đối kháng
- OPS: 10 — Vận hành và bàn giao
- LOAD: 10 — Tải 500 và hồi phục

- DELTA: 8 — Org/redraw đang thay đổi đồng thời; cần chốt diff trước nghiệm thu.
