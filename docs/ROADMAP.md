# Kế hoạch tiếp theo — MISA Presentation

Cập nhật: 12/10/2026. Phạm vi đã chốt: **1 máy chủ, 1 instance, cao điểm ~500 người dùng cùng lúc**; người dùng vào qua mạng/VPN MISA (không giới hạn theo IP); không có đăng ký (admin cấp tài khoản).
Nguồn: review chặng A của Codex ([09-review-chang-a-codex.md](audits/2026-10-12-codex/09-review-chang-a-codex.md) §5) + yêu cầu mới của chủ dự án.

Thứ tự: **A bổ sung → P (Publish) → B → Gate DevOps → C (khi có số đo)**. Mỗi sửa lỗi theo đỏ → xanh: test tái hiện trước, xác nhận đỏ, sửa, xác nhận xanh.

## A bổ sung — sửa 6 điểm Codex chỉ ra (A01–A06)

| # | Mức | Việc | Điều kiện đóng |
|---|---|---|---|
| A01 | P1 | Smoke: admin tạm dùng mật khẩu ngẫu nhiên từng lần chạy, dọn tài khoản trong `finally` (cả khi test lỗi); kiểm `BASE` đúng môi trường test trước khi ghi; admin truyền sẵn qua `SMOKE_ADMIN_*` thì không sửa/xoá | Smoke không để lại admin mật khẩu cố định; lỗi giữa chừng vẫn dọn |
| A02 | P1 | Không mất chữ đang gõ khi `updateMeta` (đổi tỷ lệ/chia sẻ) và khi lưu dàn ý (`useOutline.save`); phản hồi về ngược thứ tự | 3 probe của Codex thành regression test (giữ chữ); 2 người cùng sửa vẫn 409 đúng |
| A03 | P1 | Hàng đợi tạo/dựng bài: giữ chỗ đồng bộ (active + pending) **trước** các `await`; lỗi DB/audit trả chỗ; từ chối thì dọn upload | Burst 50 yêu cầu: nhận tối đa 2 + 20, còn lại `QUEUE_FULL`; không rò chỗ qua nhiều vòng |
| A04 | P2 | Khởi động lại giữa lúc nhân bản: bản copy dở → `failed` + thông báo sao chép lại, không đẩy sang nhánh dựng AI từ dàn ý | Không có bài `ready` thiếu media; bài gốc nguyên vẹn |
| A05 | P2 | Integration test: setup lỗi → exit ≠ 0 (không skip âm thầm); DB test tên duy nhất, teardown trong `finally` | Không xanh khi 0 test chạy |
| A06 | P2 | Bật công khai: khoá dòng bài, chụp bản gốc và đổi `public` trong cùng giao dịch | Lỗi bản gốc không để bài ở trạng thái public dở dang; không tạo bản gốc trùng |

Kèm: sửa `memory-bank/README.md` còn nhắc `xoan-backend-standard` như nguồn chuẩn (F21, tài liệu).
Sau vòng này: chạy toàn bộ unit, integration trên DB riêng, smoke trên môi trường test riêng.

## P — Publish bản HTML ra domain công khai (tính năng mới)

**Mục tiêu.** Giống chức năng "Xuất bản" của CMS: bài đã dựng xong, ngoài tải PDF/HTML, người dùng bấm **Xuất bản** để có ngay một đường link web công khai gửi cho bất kỳ ai (kể cả ngoài MISA, không cần đăng nhập), không phải tự đưa lên Vercel/Netlify.

**Đường dẫn:** `https://<domain-public>/<ten-bai-khong-dau>-<8 ký tự>`, ví dụ `/gioi-thieu-amis-tong-the-1234abcd`.

### Hành vi đề xuất
- **Bản chụp cố định (snapshot):** khi xuất bản, render HTML từ **bản đã lưu** của bài và lưu thành tệp tĩnh. Sửa bài sau đó **không** tự đổi bản công khai; người dùng bấm "Cập nhật bản xuất bản" để chụp lại (như CMS: nháp ≠ bản đã đăng).
- **Gỡ xuất bản:** link trả 404 (hoặc trang "Bài đã được gỡ"). Xuất bản lại thì giữ link cũ (mặc định), hoặc tạo mã mới nếu người dùng chọn "Đổi link".
- **Đổi tên bài:** link cũ vẫn mở được (định vị bằng mã 8 ký tự, phần tên chỉ để đọc, tên sai thì chuyển về tên hiện tại), giống đường dẫn thân thiện trong app.
- **Quyền:** chỉ chủ bài (và admin) được xuất bản, cập nhật, gỡ. Người được mời sửa không xuất bản được (giống quy tắc đổi chế độ công khai). Hộp xác nhận nói rõ "ai có link đều xem được, kể cả ngoài MISA".
- **Màn quản lý:** trong bài có trạng thái Đã xuất bản / Chưa, nút Sao chép link, Cập nhật, Gỡ. Admin có danh sách mọi bài đang xuất bản để gỡ khi cần.

### Kỹ thuật (phác thảo, chốt khi làm)
- **Dữ liệu:** bảng `publications` (id, presentation_id, tenant_id, `code` 8 ký tự unique, slug, storage key của HTML, version bài lúc chụp, published_by, published_at, unpublished_at). Changelog mới + cập nhật `schema.sql` + `03`.
- **Render:** dùng lại đường xuất HTML hiện có (`exportHtml`: tự chứa, nhúng ảnh). Video lớn nên phục vụ thành tệp riêng theo bản xuất bản thay vì base64 trong HTML để trang nhẹ.
- **Phục vụ:** route **không cần đăng nhập**, tách khỏi `/api` và không dùng session/cookie; chỉ đọc tệp tĩnh đã chụp (không render theo yêu cầu, không chạm DB nặng); `Cache-Control` + ETag; CSP chặt (không gọi ngược API nội bộ); `X-Robots-Tag: noindex` mặc định.
- **Tách domain:** app hiện ở trong mạng MISA (VPN, `IP_ALLOWLIST` tuỳ chọn). Domain public phải ra Internet nên **chỉ được lộ đúng đường dẫn bài đã xuất bản**, không lộ giao diện/API nội bộ. Hai cách, cần DevOps chọn:
  1. Cùng ứng dụng, phân luồng theo `Host`: Nginx đưa domain public vào app, app chỉ trả route xuất bản cho host đó; `IP_ALLOWLIST` miễn đúng host/route này.
  2. Xuất tệp tĩnh ra thư mục/kho riêng, một web server tĩnh (Nginx) ngoài DMZ phục vụ; app nội bộ không lộ ra Internet. An toàn hơn, cần đồng bộ tệp.
- **Hạn mức:** xuất bản/cập nhật theo người dùng (limiter `byUser`, sau `auth`). Đường xem công khai đến từ Internet → cần chống lụt ở Nginx/CDN (khác lý do "chung IP VPN" đã bỏ trong app).
- **Audit:** `presentation.publish` / `republish` / `unpublish`.
- **Test:** quyền (chủ/người sửa/người xem/admin), snapshot không đổi khi sửa bài, gỡ → 404, đổi tên vẫn mở, host nội bộ không lộ qua domain public, HTML công khai không chứa tham chiếu tới API/asset ký nội bộ.

### Cần chủ dự án / DevOps chốt trước khi làm
1. Tên domain public (vd. `slides.misa.vn`) và cách triển khai (1 hay 2 ở trên).
2. Snapshot thủ công (đề xuất) hay tự cập nhật mỗi lần lưu?
3. Có cần hết hạn link / mật khẩu xem / đếm lượt xem không? (đề xuất để sau)
4. Cho phép công cụ tìm kiếm index không? (đề xuất `noindex`)

## B — Lưới kiểm thử luồng chính + đo tải

- Integration HTTP + MySQL thật cho ~30 luồng giá trị cao (tạo bài có media, outline/build, hai người sửa, chia sẻ/public/handoff/restore, duplicate/restart, templates, HTML/PDF, **xuất bản**, admin/must-change). AI dùng stub có kiểm soát; AI thật dùng bộ vàng riêng (~10 tệp tư liệu MISA).
- Tải 500 người có think time: warm-up → steady 1 giờ; burst vào hàng đợi, client chậm khi export, Gemini timeout/429. Đo p50/p95/p99, thời gian chờ hàng đợi, tỷ lệ `QUEUE_FULL`, RAM/CPU/đĩa, DB pool wait, quota Gemini. Chọn `GENERATION_CONCURRENCY` theo RAM + quota.
- Giao diện hàng đợi: đã nhận / đang chờ / đang xử lý + thời gian chờ đo được.

## Gate bàn giao DevOps (trước production, không đợi C)

HTTPS/cookie Secure + proxy kiểm thực; backup + **thử restore DB và storage cùng nhau**; RPO/RTO; runbook (khởi động, nâng schema, rollback, sự cố hàng đợi/đĩa/DB); cảnh báo cơ bản (lỗi, RAM, đĩa, job treo); cấu hình domain public của tính năng P.

## C — Chỉ mở khi có số đo hoặc yêu cầu mới

Job bền vững/fencing (khi ≥ 2 instance), tách worker, budget bộ nhớ theo trọng số, cô lập mạng/tệp cho LibreOffice, cleanup ledger, stress 1000 người/soak dài.
