# Bằng chứng kiểm chứng và khả năng tái lập

Mốc chuẩn: HEAD `ec7bdf78d1928c7c66477109761fcc57451873c7`. Múi giờ Asia/Ho_Chi_Minh.

## Đã thực hiện

- Unit baseline hoàn tất 10:24:01 ngày11/10/2026: **134 pass,0 fail,0 skip**, khoảng5,92giây. [TAP và coverage](evidence/unit-baseline.tap).
- Snapshot/manifest lúc10:24:43:305tệp tracked, bỏ `.env.example`. [Manifest SHA256](evidence/source-manifest.json). Không copy `.env`, node_modules hay dữ liệu vận hành; dependency có sẵn được tham chiếu khi build.
- Build snapshot hoàn tất10:30:15: Vite production và bundle deck3d thành công. [Build log](evidence/build.log). Không đọc project `.env`; không chạy install/network/lifecycle mới; chưa kiểm clean Docker build.
- `node --check`:115tệp `.js/.mjs` trên snapshot,0lỗi cú pháp. Vue được compile trong bước Vite. Node dùng cho kiểm tra cú pháp cuối làv24.15.0.
- [Probe backend](evidence/probe-results.json): media signature, share quota, last-admin, provider cleanup, bcrypt byte limit; SSRF mapped IPv6 là phép phủ định giả thuyết.
- [Probe editor](evidence/editor-probe-results.json): stale draft nâng nhầm baseVersion sau meta response và mất phần sửa trong lúc save đang chờ.

Probe backend gọi services thật nhưng dùng repository/provider/storage stub để điều khiển thứ tự, không MySQL/Gemini thật. Probe editor dùng thân composable thật với API/reactivity stub, không Vue browser runtime đầy đủ. Các probe chứng minh lỗi điều phối ở tầng đó; vẫn cần MySQL concurrency/E2E như kế hoạch.

Lần unit đầu có2lỗi do môi trường không được mở socket loopback. Chạy lại với quyền phù hợp cho toàn bộ suite đạt134/134; không sửa ứng dụng để làm test pass. Không nhầm lỗi môi trường với defect sản phẩm.

## Chưa thực hiện

- Không integration MySQL thật, E2E UI/browser toàn luồng, load500, stress/soak, fault Docker, clean container build hoặc restore drill.
- Không real-provider smoke, dependency advisory scan hiện hành, pentest đầy đủ hoặc kiểm tra secret toàn bộ Git history/image.
- Không kiểm trực tiếp hạ tầng production, TLS, IAM, DB role và backup bên DevOps.
- Không có phản biện Claude hoàn tất; xem hồ sơ05.

## Thay đổi đồng thời của workspace

Repository ban đầu clean, sau đó xuất hiện thay đổi trong renderer/spec/AI/visual khi audit đang chạy. Các thao tác của audit không sửa source repository. [Kết quả đối chiếu tại một mốc](evidence/final-verification.json) ghi các tệp khác manifest; danh sách này không phải ảnh chụp cuối cùng của một workspace vẫn đang được chỉnh sửa.

Không dùng134unit/build/syntax của snapshot để tuyên bố working tree mới nhất đã pass. Xem [phụ lục thay đổi đồng thời](07-thay-doi-dong-thoi.md). W00/W02 bắt buộc chốt lại commit/diff rồi chạy toàn suite trước khi triển khai. Đây là ranh giới bằng chứng, không phải lỗi của người đang phát triển tính năng.

## Tái lập an toàn khi triển khai

1. Tạo checkout test riêng đúng commit, áp riêng diff được chốt nếu có; dependency từ lockfile trong môi trường được duyệt.
2. DB/storage/test keys riêng; tuyệt đối không tự dùng `.env` của ứng dụng đang vận hành. CI refuse DSN/path ngoài allowlist test.
3. Chạy unit và báo coverage có denominator first-party đầy đủ; chạy build, integration, browser/load/fault theo gate.
4. Chuyển các tình huống probe thành regression maintained trước fix. Không để script probe tạm trở thành substitute cho suite integration.
5. Lưu commit/diff hash, phiên bản runtime/image, seed, cấu hình đã redact, thời điểm, raw log, expected/actual và người review.
