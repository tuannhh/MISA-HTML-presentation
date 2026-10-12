# Kế hoạch tiếp theo — MISA Presentation

Cập nhật: 12/10/2026. Phạm vi đã chốt: **1 máy chủ, 1 instance, cao điểm ~500 người dùng cùng lúc**; người dùng vào qua mạng/VPN MISA (không giới hạn theo IP); không có đăng ký (admin cấp tài khoản).
Nguồn: review chặng A của Codex ([09-review-chang-a-codex.md](audits/2026-10-12-codex/09-review-chang-a-codex.md) §5) + yêu cầu mới của chủ dự án.

Thứ tự: **A bổ sung ✅ → P (Publish) ✅ → H + L (hyperlink, trang Liên hệ / Ưu đãi — đề xuất 12/10) → B → Gate DevOps → C (khi có số đo)**. Mỗi sửa lỗi theo đỏ → xanh: test tái hiện trước, xác nhận đỏ, sửa, xác nhận xanh.

## A bổ sung — sửa 6 điểm Codex chỉ ra (A01–A06) — ✅ xong 12/10/2026

Đã sửa cả 6 mục theo đỏ → xanh (chi tiết `memory-bank/10-development-history.md`). Còn: smoke HTTP chạy trên compose project riêng; thử kill/restart Docker thật cho A04.

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

### Đã chốt và đã làm (12/10/2026) — ✅
- DevOps: **phân luồng theo domain** (cách 1), **chặn Google index**, **mặc định có CDN**. Tên domain để DevOps đặt sau qua `PUBLISH_BASE_URL` (trống = tính năng tắt).
- Snapshot thủ công ("Cập nhật bản xuất bản"); gỡ rồi xuất bản lại giữ link. Hết hạn link / mật khẩu xem / đếm lượt xem / "Đổi link": để sau.
- Hướng dẫn DevOps: `docs/DEVOPS-NETWORK.md` §6 (bắt buộc **ép Host** ở cổng Internet, header CDN, purge khi gỡ gấp).
- Còn: màn admin cho danh sách xuất bản (API `GET/DELETE /api/admin/publications` đã có); đo tải trang công khai qua CDN.

## H — Hyperlink trong bài — ✅ xong 12/10/2026 (chi tiết `memory-bank/05` §18)

- **Chèn liên kết**: bôi chữ trên khung sửa → nút "Liên kết" (Ctrl/Cmd+K) trên thanh định dạng nổi: nhập URL, sửa, gỡ. Lưu như định dạng chữ hiện có (thuộc tính `href` trong `⟦…⟧`), nên đi theo nội dung khi sao chép/đổi bố cục/xuất bản.
- **An toàn**: chỉ nhận `http(s)://`, `mailto:`, `tel:`; chuẩn hoá + kiểm ở `specService` (strict báo lỗi, lenient bỏ link); renderer `<a target="_blank" rel="noopener noreferrer">`, URL qua `esc()`.
- **Hành vi**: trình chiếu / HTML xuất / trang xuất bản → bấm mở **tab mới**, không chuyển trang slide; PDF giữ link bấm được; khung sửa → bấm để sửa chữ (không mở link). Khung xem trước cần thêm `allow-popups-to-escape-sandbox` để trang mở ra không bị sandbox.
- **Lấy từ nguồn**: bước đọc tư liệu giữ lại liên kết (DOCX/PPTX hyperlink, link trong PDF, thẻ `<a>` của trang web/Google Docs, URL trong văn bản) → đưa AI danh sách "nhãn → URL"; AI gắn link vào chữ tương ứng; **máy chủ chỉ giữ URL có thật trong nguồn** (chống AI bịa link).

## T — Kiểu chữ tiêu đề trang — ✅ xong 12/10/2026 (chi tiết `memory-bank/05` §19)

- Mặc định **viết hoa đầu câu** (sửa lỗi AI "Viết Hoa Từng Chữ"; giữ tên riêng có trong tư liệu); tuỳ chọn **VIẾT HOA TOÀN BỘ** ở tab Phông chữ. Luôn viết hoa MISA, AMIS, ASP, AI, JETPAY. Bài cũ: nút "Sửa tiêu đề đang Viết Hoa Từng Chữ".

## L — Trang "Liên hệ" và "Ưu đãi" — ✅ xong 12/10/2026 (chi tiết `memory-bank/05` §18)

Hai bố cục mới dùng chung bộ trường liên hệ, dành cho mọi nhóm (kinh doanh, CSKH, tuyển dụng, đào tạo…):

| Trường | Chi tiết |
|---|---|
| Số điện thoại (tối đa 3) | Ô nhập số + chọn kênh: Gọi, Zalo, Viber, Telegram, iMessage (icon tương ứng). Bấm → `tel:`, `zalo.me/<số>`, `viber://chat?number=`, `t.me/+<số>`, `sms:` |
| Email (tối đa 2) | Icon thư + ô nhập → `mailto:` |
| Địa chỉ (tối đa 2) | Icon vị trí/nhà + ô nhập → mở Google Maps |
| CTA | "Liên hệ để tư vấn miễn phí", "Liên hệ để tư vấn ngay"… (gợi ý sẵn, sửa tự do) |
| Mã QR | Tải ảnh QR (lưu không nén mất chi tiết, giữ nét để quét). **Liên hệ**: QR lớn (~40% chiều cao trang). **Ưu đãi**: QR chiếm **1/2 trang** |

- **Ưu đãi** thêm: tên chương trình, mức ưu đãi nổi bật (vd. "Giảm 30%"), các ý chi tiết, thời hạn.
- **Thêm trang**: mẫu "Liên hệ" / "Ưu đãi" trong hộp Thêm trang (cả bước dàn ý và trình soạn thảo, desktop + mobile).
- **AI tự phát hiện**: tư liệu có số điện thoại / email / địa chỉ / chương trình ưu đãi → AI dùng bố cục tương ứng, chỉ điền dữ liệu **có trong nguồn** (máy chủ đối chiếu), không bịa.
- **Chốt 12/10**: không lưu thông tin liên hệ mặc định — nhập theo từng trang (AI tự điền từ nguồn hoặc người dùng nhập). QR: **tải ảnh lên hoặc nhập link để hệ thống tự tạo QR**. Làm H + L trước B.
- Icon Zalo/Viber/Telegram/iMessage: logo màu riêng `shared/deck/brands.js` (không trộn vào bộ icon nét của slide).
- Đã làm khác đề xuất: không thêm trường "mức ưu đãi nổi bật" riêng — tiêu đề + quyền lợi (`items`) + thời hạn (`caption`) đủ diễn đạt; mẫu trang nằm trong danh sách bố cục của "Thêm trang" (tự liệt kê). Còn mở: trang công khai/PDF chưa kiểm tay trên điện thoại thật (quét QR in ra).

## B — Lưới kiểm thử luồng chính + đo tải — ✅ xong 12/10/2026 (trừ soak 1 giờ và bộ vàng Gemini thật)

Đã làm: 43 test tích hợp qua HTTP + MySQL thật + AI giả (`flows-auth`, `flows-deck`, `flows-share`, `https-proxy` + các test cũ) — `memory-bank/07` §Kiểm thử;
đo tải 500 người trước/sau (`docs/LOAD-TEST.md`) → sửa 3 lỗi chỉ lộ dưới tải (hàng ảnh bìa không trần làm PDF hết giờ + RAM 2,8 GB; bcrypt chặn
luồng chính; pool DB đầy → 500); giao diện tiến độ hàng đợi `JobProgress` (desktop + mobile). Còn: soak ≥ 1 giờ trên máy chủ thật, bộ vàng ~10 tư liệu với Gemini thật.
Lỗi biết, chưa sửa: đổi tên bài từ danh sách chỉ đổi tên tệp xuất — `<title>` trong HTML xuất theo `spec.title` tới lần lưu kế tiếp trong trình soạn thảo.


- Integration HTTP + MySQL thật cho ~30 luồng giá trị cao (tạo bài có media, outline/build, hai người sửa, chia sẻ/public/handoff/restore, duplicate/restart, templates, HTML/PDF, **xuất bản**, admin/must-change). AI dùng stub có kiểm soát; AI thật dùng bộ vàng riêng (~10 tệp tư liệu MISA).
- Tải 500 người có think time: warm-up → steady 1 giờ; burst vào hàng đợi, client chậm khi export, Gemini timeout/429. Đo p50/p95/p99, thời gian chờ hàng đợi, tỷ lệ `QUEUE_FULL`, RAM/CPU/đĩa, DB pool wait, quota Gemini. Chọn `GENERATION_CONCURRENCY` theo RAM + quota.
- Giao diện hàng đợi: đã nhận / đang chờ / đang xử lý + thời gian chờ đo được.

## Gate bàn giao DevOps (trước production, không đợi C) — ✅ phần ứng dụng xong 12/10/2026, xem `docs/RUNBOOK.md`

| Hạng mục | Trạng thái |
|---|---|
| HTTPS/cookie Secure + proxy | ✅ test tự động `https-proxy.test.js` (Secure/HttpOnly/SameSite, IP thật qua `TRUST_PROXY`, gọi thẳng http không có phiên, cấu hình lệch → không khởi động) — DevOps xác nhận lại trên cổng vào thật |
| Backup + thử restore DB và tệp cùng nhau | ✅ `scripts/ops/backup.sh` / `restore.sh` / `verify-storage.js`; diễn tập: RTO 11 giây, mất dữ liệu giả lập phục hồi đủ (`LOAD-TEST.md` §4) |
| RPO/RTO | ✅ đề xuất RPO ≤ 15 phút (backup 15 phút/lần), RTO ≤ 60 phút — DevOps đặt lịch + chép ra ngoài máy |
| Runbook | ✅ khởi động, nâng schema, rollback, sự cố hàng đợi/đĩa/DB/PDF/quá tải |
| Cảnh báo cơ bản | ✅ `scripts/ops/check.sh` (ready, hàng AI, job chờ/treo, hàng trình duyệt, ảnh bìa, đĩa, RAM) + log `level:error` — DevOps gắn vào hệ giám sát |
| Domain public của P | ✅ tài liệu `docs/DEVOPS-NETWORK.md` §6 — DevOps cấu hình `PUBLISH_BASE_URL` + vhost ép Host + CDN |


HTTPS/cookie Secure + proxy kiểm thực; backup + **thử restore DB và storage cùng nhau**; RPO/RTO; runbook (khởi động, nâng schema, rollback, sự cố hàng đợi/đĩa/DB); cảnh báo cơ bản (lỗi, RAM, đĩa, job treo); cấu hình domain public của tính năng P (`PUBLISH_BASE_URL` + vhost ép Host + CDN — `docs/DEVOPS-NETWORK.md` §6).

## C — Chỉ mở khi có số đo hoặc yêu cầu mới

Job bền vững/fencing (khi ≥ 2 instance), tách worker, budget bộ nhớ theo trọng số, cô lập mạng/tệp cho LibreOffice, cleanup ledger, stress 1000 người/soak dài.
