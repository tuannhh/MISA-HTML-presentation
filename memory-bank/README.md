# 🧠 Memory Bank — MISA Presentation

Thư mục này chứa **toàn bộ tri thức về dự án MISA Presentation**, được tổ chức thành các tệp chuyên đề. Mục tiêu: bất kỳ ai (con người hoặc AI) đọc hết các tệp trong thư mục này đều hiểu tường tận dự án và có thể làm việc tiếp mà không cần hỏi lại.

## Cách sử dụng

- **Trước khi code bất kỳ thay đổi nào (thêm mới hoặc sửa):** đọc `11-coding-rules.md` trước — đây là nguyên tắc bắt buộc, không phải tham khảo.
- **Lần đầu tiếp cận dự án:** đọc theo thứ tự số, từ `01` đến `11`.
- **Cần tra cứu nhanh:** nhảy thẳng vào tệp tương ứng với chủ đề.
- **Sau khi thay đổi code/kiến trúc:** cập nhật tệp tương ứng + `10-development-history.md` (quy tắc bắt buộc của MISA Backend Standard — máy chưa cài bản MISA thì dùng `xoan-backend-standard`, nội dung giống hệt — mục `20-memory-bank-mandate.md`).

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

## Audit và bàn giao mới nhất

### Bàn giao 09/11/2026 — cải tiến 11 mục (đọc trước khi làm tiếp)
- **Nhánh `feature/cai-tien-11-muc`** (từ `main` 827da35; **đã push nhánh lên GitHub `origin` 08/11/2026** sau Đợt 4 — `main` vẫn chưa đổi trên GitHub). Đã xong + commit Đợt 1 (73eda47), Đợt 2 (704918a),
  Đợt 3 (commit ngay sau 704918a). Đợt 4 — video (mục 3) **đã xong + kiểm thật trên Docker, commit ngay sau 12b718c** (`05` §28; script
  `tmp/e2e-dot4.mjs`, `tmp/ui-dot4.mjs`). Đợt 5a — kiểu trình bày danh sách, ảnh nhấn, hộp chú thích, chuyển trang **đã xong + kiểm thật trên Docker 09/11/2026** (`05` §29; script
  `tmp/e2e-dot5.mjs`, `tmp/tr-dot5.mjs`, `tmp/ui-dot5.mjs`, `tmp/dot5-preview.mjs`). Đợt 5b — sơ đồ (2×2, Venn, chu trình, đồng tâm, bia, A vs B) + biểu đồ 8 kiểu có bảng dữ liệu **đã xong + kiểm thật trên Docker 09/11/2026** (`05` §30; script `tmp/e2e-dot5b.mjs`, `tmp/ui-dot5b.mjs`, `tmp/dot5b-preview.mjs`); 5a + 5b commit chung 09/11. **Đã xong cả 11 mục của CT.** Việc có thể làm tiếp (chờ chủ dự án chọn): tinh chỉnh giao diện mobile cho khối mới (ảnh nhấn, chú thích, bảng dữ liệu), biểu đồ Gantt, cho AI đề xuất biểu đồ từ bảng số trong tài liệu nguồn. Kế hoạch chi tiết +
  yêu cầu gốc: [`docs/ROADMAP.md` mục CT](../docs/ROADMAP.md).
- Môi trường: Docker local cổng 8088 (`docker compose up -d --build app` sau `npm run build`); Gemini qua Agent Platform (xem `07`). Chạy trên máy chủ MISA,
  **không Cloud Run**. Không đọc/in/commit secret (`.env`, khoá service account).
- Kiểm thử thật: tài khoản thử trong `tmp/e2e-user.json` (thư mục `tmp/` gitignore — **không in mật khẩu ra**; đăng nhập bằng script qua `/api/auth/csrf` +
  `/api/auth/login`). Script mẫu: `tmp/e2e-dot3.mjs` (tạo bài qua API), `tmp/dot3-shots.mjs` (puppeteer-core + Chrome local, chụp desktop/mobile),
  `tmp/verify-dot2*.mjs` (chỉ có trên máy đang làm — `tmp/` không vào Git; máy khác viết lại theo mẫu này). Khung soạn thảo là iframe sandbox → kiểm bằng puppeteer, không dùng browser pane của ứng dụng Claude (bị chặn).
- Tệp mẫu nhập HTML: `/Users/tuanbui/Downloads/MISA_Xu_huong_lua_dao_va_Phan_xa_an_toan-4.html` (137 MB, 38 trang, 5 video).
- Quy ước: mỗi thay đổi cập nhật `memory-bank/` (tệp liên quan + `10`); không chạy prettier lên tệp dự án (không có cấu hình → đổi định dạng cả tệp);
  commit kết thúc bằng dòng `Co-Authored-By` theo quy ước; **không ghi tên sản phẩm tham khảo** (trang trình bày AI bên ngoài) vào mã, tài liệu, commit,
  giao diện — chạy `git grep -i` tên đó trước khi commit, phải rỗng.

- [Kế hoạch tiếp theo (`docs/ROADMAP.md`)](../docs/ROADMAP.md): A bổ sung A01–A06 → Publish HTML ra domain công khai → B → gate DevOps → C.
- [Hồ sơ Codex 12/10/2026 — đọc trước khi tiếp tục trên máy khác](../docs/audits/2026-10-12-codex/README.md). Có audit gốc, phản hồi Claude, review commit `233d348`, log và probe tái hiện. Sáu finding A01–A06 còn mở; không hiểu việc lưu hồ sơ là đã sửa lỗi hoặc đã được duyệt sửa.
