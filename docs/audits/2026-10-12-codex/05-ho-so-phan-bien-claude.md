# Hồ sơ phản biện kỹ thuật với Claude

Mục tiêu: cải thiện độ đúng, khả năng chịu tải và chịu lỗi của ứng dụng; kiểm tra cả nhận định của Codex, không tìm người thắng/thua.

## Trạng thái thực tế

Chưa có phản biện trả về từ Claude trong lần audit này. Không gọi bản tự phản chứng dưới đây là “Claude đã đồng ý”.

1. Gọi Claude CLI trong sandbox, safe mode, không tool, không MCP, không lưu session: báo `Not logged in`. Kết quả này chỉ phản ánh môi trường gọi của audit.
2. Thử ngoài sandbox: bộ xét duyệt tự động từ chối vì payload chứa mã nguồn nội bộ gửi tới dịch vụ ngoài. Chủ dự án sau đó **đã cho phép rõ gửi đúng tệp** `05-noi-dung-gui-claude.txt`.
3. Gọi lại theo quyền đã cấp: Claude CLI 2.1.215 trả `Failed to authenticate: OAuth session expired and could not be refreshed`, usage input/output đều 0. Chưa nhận được review. Không kết luận rằng phiên Claude Code khác mà chủ dự án đang dùng chưa đăng nhập.

Không đọc/copy token, API key, `.env`, hoặc thay phiên đăng nhập để khắc phục. Người dùng có thể làm mới đăng nhập CLI bằng cơ chế chính thức, hoặc đưa [payload đã duyệt](05-noi-dung-gui-claude.txt) vào phiên Claude đang hoạt động. Quyền gửi tệp đã được ghi nhận; không cần xin lại quyền ấy khi phiên xác thực được khôi phục. Nếu mở rộng payload sang mã mới thì cần xét đúng phạm vi đã cho phép.

## Tự phản chứng đã làm

| Luận điểm | Bằng chứng phản chứng / giới hạn | Quyết định |
|---|---|---|
| IPv4-mapped IPv6 có thể vượt SSRF | Node BlockList chặn cả loopback, RFC1918 và metadata trong probe | Loại khỏi finding; giữ test regression |
| Viewer xuất hoặc nhân bản là sai quyền | Lịch sử nghiệp vụ cho phép; vẫn yêu cầu login và readable | Giữ hành vi, kiểm IDOR và copy asset đúng tenant |
| Handoff thiếu transaction | Repository đã lock presentation và tạo snapshot từ DB | Không đưa finding này; chỉ kiểm lại bằng concurrency MySQL thật |
| Mọi Promise.all phải đổi allSettled | Fail-fast có thể đúng cho nguồn bắt buộc, nhưng cleanup phải đợi task kết thúc | Chỉ sửa lifecycle/abort/settlement, không nuốt lỗi toàn batch |
| Bao storage/provider trong transaction là an toàn hơn | Làm transaction dài, giữ lock khi I/O ngoài lỗi | Transaction ngắn + manifest/compensation/durable cleanup |
| 500 người bắt buộc Redis/Kubernetes | Số user không suy ra số heavy jobs/quota provider | Benchmark rồi chọn, MySQL queue là phương án ban đầu có thể thay theo ADR |
| Có `innerHTML` là XSS | Renderer escape + message source cần xem cùng nhau | Không kết luận nếu chưa có đường input→sink khả dụng |
| Signed URL không revoke là breach đã chứng minh | Capability có TTL là thiết kế; chưa có SLA revoke được chốt | Đưa quyết định SLA và test; không thổi phồng thành breach |
| Mọi request vượt600/IP là tấn công | Mạng doanh nghiệp có NAT chung500user | Giữ chống abuse, bổ sung user/cost buckets và test NAT |
| Unit134pass đồng nghĩa đủ an toàn | Coverage ở service/repo thấp, routes/DB/browser chưa có bằng chứng | Test catalogue toàn chức năng trước nâng cấp |

## Những câu hỏi Claude cần trả lời

1. F01/F02/F07/F08/F11 đã tái hiện ở đúng tầng chưa; có assumption nào làm sai kết luận không?
2. Finding nào chỉ đúng nếu triển khai nhiều instance hoặc mở cổng trực tiếp? Hạ mức/đổi diễn đạt ở đâu để công bằng với MVP một máy?
3. MySQL jobs + lease + fencing có gọn và vận hành được hơn BullMQ trong hoàn cảnh DevOps thực tế không? Nếu đổi sang BullMQ, ai bảo đảm DB commit và enqueue nhất quán?
4. Budget queue/RAM/deadline đặt trước materialize đủ tránh OOM chưa? Các bước CPU/native nào còn ở API process?
5. Test catalogue có bỏ sót một tính năng hoặc invariant hiện hữu không, nhất là media trong snapshot/template, chữ rich/free, admin cuối cùng và draft version?
6. Có cách sửa phạm vi nhỏ hơn nhưng vẫn đúng gốc rễ không? Hạng mục nào nên bỏ vì không có bằng chứng cần thiết?
7. Phương án rollback có hoạt động khi job/version schema mới còn trong queue không? Restore drill có thực sự khôi phục được cả DB và tệp?
8. Với thay đổi `org`/redraw đang diễn ra song song, có đường mất nhãn, bỏ node, hoặc fallback sai ngữ nghĩa nào cần fixture trước khi merge?

## Quy tắc tiếp nhận phản hồi

Mỗi phản hồi cần ID finding/control, nguồn, lập luận, mức tin cậy và test có thể phủ định nó. Kết quả phân loại: nhận / nhận một phần / bác bỏ có bằng chứng / cần đo. Khi bất đồng, viết test nhỏ hoặc kiểm chứng tài liệu chính thức rồi cập nhật audit/ADR/test catalogue. Không tự gắn nhãn “đã phản biện độc lập” trước khi thực sự nhận được phản hồi.

Phần review này chưa ngăn việc chủ dự án duyệt hướng kế hoạch. Tuy nhiên gate review độc lập của các PR quan trọng vẫn phải được hoàn thành bằng người review hoặc Claude khi hoạt động trở lại trước khi chấp nhận thay đổi.
