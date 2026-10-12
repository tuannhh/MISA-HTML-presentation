# Đọc trước — Bàn giao audit Codex để tiếp tục trên máy khác

Ngày: 12/10/2026. Đây là bộ tài liệu audit và bằng chứng nằm trong project, không phải bản sửa ứng dụng hay gói triển khai production.

## Điểm bắt đầu cho Claude/Codex ở máy mới

1. Đọc `AGENTS.md`, `memory-bank/README.md`, `memory-bank/11-coding-rules.md` ở gốc project.
2. Đọc [09-review-chang-a-codex.md](09-review-chang-a-codex.md): kết luận mới nhất, sáu finding A01–A06, bằng chứng và tiêu chí nghiệm thu.
3. Đọc [08-phan-hoi-claude.md](08-phan-hoi-claude.md), đặc biệt mục 5–8: lộ trình đã điều chỉnh và các sửa chặng A.
4. Đọc [bằng chứng review A](evidence/review-chang-a/README.md); các probe ở cùng thư mục.
5. Các file 00–07 và evidence ngoài review-chang-a là lịch sử audit trước đó. Catalogue 198 case và kế hoạch cũ là tài liệu tham khảo; KHÔNG tự áp lại kế hoạch 46–69 ngày công hoặc bắt hoàn tất toàn bộ case trước khi sửa lỗi đã tái hiện.

## Trạng thái bàn giao

- Mã ứng dụng được review: `233d3483bf2d1d61febf2d9d59a2052d9a775567`, main. Nền chặng A: `09cbc5a`; audit ban đầu: `ec7bdf7`.
- Chưa biết HEAD của máy nhận. Kiểm tra `git rev-parse HEAD` và diff ở máy nhận trước khi áp dụng kết luận; số dòng là của commit được review.
- Chủ dự án chốt một máy chủ, một instance, 500 người dùng ở cao điểm dự kiến. Ưu tiên lỗi có bằng chứng và cải thiện ứng dụng; phản biện xây dựng, không đặt mục tiêu thắng thua giữa AI.
- Chặng A có 169/169 unit và 5/5 integration MySQL pass; build đạt. Tuy nhiên còn A01 smoke admin, A02 mất nháp, A03 queue vượt trần, A04 copy recovery, A05 integration false-green, A06 public/baseline không nhất quán.
- Review chưa sửa mã ứng dụng, chưa chạy tải 500 người, chưa kiểm lại smoke HTTP/AI thật. MySQL riêng dùng review đã dọn; không có database test sống để tiếp tục dùng.
- Lượt bàn giao này chỉ thêm docs/evidence và chỉ mục memory-bank. Chưa commit/push tài liệu. Việc ghi hồ sơ không phải phê duyệt tự động sửa sáu finding; máy nhận thực hiện theo chỉ đạo tiếp theo của chủ dự án.

## Nội dung phải mang sang máy mới

Mang nguyên thư mục project cùng `docs/audits/2026-10-12-codex/` và hai cập nhật memory-bank. **Không chỉ dùng `git archive HEAD` lúc tài liệu còn untracked**, vì sẽ mất bộ audit mới. Có thể để công cụ đóng gói lấy đúng working tree, hoặc commit tài liệu theo yêu cầu riêng trước khi xuất gói.

Loại khỏi gói chia sẻ thông thường: `.env`, secret/key/token, `node_modules`, `dist`, `data`, `tmp`, volume/database thật. Dữ liệu vận hành và secret cần quy trình chuyển riêng nếu chủ dự án yêu cầu; chúng không thuộc hồ sơ audit này. `.env.example` trong source là mẫu cấu hình, không thay thế cấu hình thật.

Giữ log bằng chứng trong thư mục này: có `.gitignore` cục bộ để chúng không bị rule `*.log` toàn repo loại mất. `TRANSFER-MANIFEST.json` chứa SHA-256 của từng tệp hồ sơ (không tự hash chính manifest). Khi nén/giải nén cần giữ nguyên byte, không tự đổi line ending của log.

## Chạy lại probe ở máy mới

Cần Node phù hợp package.json và dependencies dự án đã cài. Giữ đúng cấu trúc thư mục bên trong repo. Ví dụ từ gốc repo:

```sh
node docs/audits/2026-10-12-codex/evidence/review-chang-a/editor-probes.mjs
node docs/audits/2026-10-12-codex/evidence/review-chang-a/queue-probe.mjs
node docs/audits/2026-10-12-codex/evidence/review-chang-a/publish-probe.mjs
node docs/audits/2026-10-12-codex/evidence/review-chang-a/smoke-probe.mjs
```

Các probe trên không gọi AI/HTTP/Docker thật. Exit 0 ở probe nghĩa là tái hiện được lỗi, KHÔNG phải code đã đúng. Khi sửa ứng dụng, chuyển sang regression test assert hành vi mong muốn; probe cũ có thể fail vì lỗi đã được sửa.

`recovery-probe.mjs` khác các probe trên: tạo/xoá database `codex_review_recovery`. Chỉ chạy trên MySQL disposable riêng; đọc README evidence và cấp REVIEW_DB_PORT/REVIEW_DB_PASSWORD của container test mới. Không dùng DB runtime hoặc cổng test cũ 62379 đã được dọn.

Các đường dẫn tuyệt đối còn trong báo cáo/log/manifest snapshot là thông tin lịch sử trên máy audit. Dùng đường dẫn tương đối trong repo cho mã ứng dụng; không cần có thư mục Documents/Codex của máy cũ. Các script đã chuyển sang import tương đối; log cũ được giữ nguyên byte.

Chuẩn MISA được dẫn từ `/Users/tuanbui/BackEnd.SKILL` là nguồn trên máy audit. Ở máy mới tìm/cài nguồn skill MISA tương ứng trước khi sửa code; bộ hồ sơ không chép toàn bộ kho skill cá nhân.

## Prompt gợi ý cho công cụ đóng gói

> Hãy đọc docs/audits/2026-10-12-codex/README.md rồi đóng gói working tree project để chuyển sang máy khác. Bảo đảm có toàn bộ docs/audits/2026-10-12-codex và cập nhật memory-bank, kể cả file chưa commit và log bằng chứng. Loại secret, .env thật, dependencies/build output, tmp và dữ liệu vận hành; không sửa mã ứng dụng. Kiểm checksum trong TRANSFER-MANIFEST.json sau khi xuất gói và ghi rõ commit nguồn cùng thay đổi chưa commit.
