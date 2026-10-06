# 08 — Mô hình bảo mật

## Xác thực & phiên

- Mật khẩu băm **bcrypt** (`BCRYPT_ROUNDS`, mặc định 12). Chính sách: 10–128 ký tự, có chữ và số; mật khẩu mới phải khác mật khẩu cũ.
- Phiên express-session lưu MySQL (`sessions`), cookie `mp.sid` httpOnly + SameSite=Lax (+ Secure ở production). `regenerate()` khi đăng nhập/đăng ký/đổi mật khẩu (chống session fixation).
- **Thu hồi phiên:** phiên lưu `sv = users.session_version`; `loadUser` so sánh mỗi request. Đổi mật khẩu, đặt lại mật khẩu, khoá tài khoản → tăng version → mọi phiên cũ mất hiệu lực ngay.
- Đăng nhập sai: thông điệp chung (không lộ email có tồn tại hay không); rate-limit 10 lần/15 phút theo IP+email.
- Mật khẩu tạm do admin cấp sinh bằng `crypto.randomBytes`, trả về **một lần**, không lưu dạng rõ, `must_change_password=1` → API chặn mọi thao tác khác (`MUST_CHANGE_PASSWORD`).

## CSRF & header

- Token đồng bộ trong phiên, header `X-CSRF-Token`, so sánh `timingSafeEqual`; kiểm tra thêm `Origin` cho mọi request ghi.
- Helmet: CSP chặt cho ứng dụng (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `media-src 'self' blob:`, `frame-src 'self' https://www.youtube-nocookie.com` — chỉ để phát video trong lớp phủ), `X-Frame-Options: DENY`, CORP same-origin, Referrer-Policy strict-origin-when-cross-origin, ẩn `x-powered-by`.

## Phân quyền & cách ly tenant

- Mỗi người dùng = 1 tenant. **Mọi** truy vấn dữ liệu theo tenant đi qua `repositories/tenantScope.js` (`tenantClause`, `assertTenantId`) — không ghép chuỗi `tenant_id` thủ công.
- Đọc bài của người khác chỉ khi `visibility='public' AND status='ready'`; ghi chỉ chủ sở hữu. Không đủ quyền → **404** (không lộ tồn tại).
- Admin chỉ có quyền quản trị tài khoản; **không** có đường đọc bài private của tenant khác.
- ID từ URL được kiểm định UUID (`uuidParam`) trước khi chạm DB.
- Spec lưu vào DB luôn qua `normalizeSpec` (allowlist trường) + `dropForeignAssets` (chỉ giữ asset thuộc chính bài) → không thể tham chiếu ảnh/video/logo của tenant khác.
- Dàn ý lưu qua `normalizeOutline` strict + `assertMedia` (asset phải thuộc bài → 422 `FOREIGN_ASSET`; đúng loại → 422 `INVALID_MEDIA`). Tuỳ chọn tạo bài (`options`) do server giữ, client gửi lên bị ghi đè.
- Media chỉ thêm được khi bài ở `outline`/`ready` (không chen vào lúc AI đang xử lý); `PUT /outline`, `POST /build` dùng khoá lạc quan `outline_version` + chuyển trạng thái nguyên tử (bấm Dựng 2 lần → 409, không chạy 2 job).

## Đầu vào không tin cậy

| Nguồn | Biện pháp |
|---|---|
| Tệp upload | Giới hạn kích thước (multer), nhận diện bằng **magic bytes** (`lib/fileType.js`: pdf/zip/ảnh/OLE/HEIC/AVIF/âm thanh/UTF-16/văn bản), không tin phần mở rộng/MIME client; zip: ≤ 5000 entry, ≤ 400MB giải nén (chống zip bomb); XLSX ≤ 400 dòng × 40 cột/trang tính; tên tệp giải mã UTF-8 (`defParamCharset`) + NFC, chỉ dùng làm nhãn (không làm đường dẫn) |
| Ảnh | sharp chuẩn hoá lại thành WebP (loại metadata, giới hạn 60MP), lưu bằng key do server sinh. Logo SVG được trình duyệt rasterize thành PNG trước khi tải (server không nhận SVG → không có script trong SVG) |
| Video tải lên | multer diskStorage + chặn sớm theo Content-Length; nhận diện **magic bytes** (ftyp MP4/MOV, EBML WebM; từ chối M4A/M4B/M4P); lưu nguyên tệp (không giải mã/chuyển mã trên server); phát qua `sendFile` có kiểm quyền/URL ký, `dotfiles:'deny'` |
| Link YouTube | Chỉ rút **id 11 ký tự** theo danh sách host YouTube cố định (không lưu URL người dùng); ảnh bìa/oEmbed lấy qua `safeFetch` tới host cố định; khi phát: id kiểm lại regex ở cả engine lẫn app, chỉ nhúng `youtube-nocookie.com` |
| postMessage `deck:video` | App chỉ nhận từ iframe có `data-deck-frame` (so `event.source`), kiểm lại id YouTube / src phải là `/api/assets/<uuid>?exp&sig` cùng origin — iframe bị chèn nội dung cũng không mở được URL tuỳ ý |
| Tách nền logo | Chạy local (onnxruntime-node, worker thread, hàng đợi 1 việc, tối đa 5 chờ → 503); không gửi logo ra dịch vụ ngoài; telemetry onnxruntime tắt (`ORT_DISABLE_TELEMETRY=1`) |
| URL | `lib/safeFetch.js`: chỉ http/https, chặn IP private/loopback/link-local/metadata (IPv4 + IPv6, kể cả IPv4-mapped), kiểm IP **lúc kết nối** (chống DNS rebinding), giới hạn redirect + kích thước + thời gian |
| Nội dung AI | Chỉ nhận JSON theo schema → chuẩn hoá lenient; renderer **escape mọi chuỗi** (`esc`) — có unit test XSS |
| Đường dẫn tệp | `storageService` kiểm regex key, cấm `..`, kiểm đường dẫn tuyệt đối nằm trong thư mục gốc |

## Sandbox xem trước

- `/api/presentations/:id/preview` trả CSP: `sandbox allow-scripts allow-popups` (origin `null` — script trong bài không đọc được cookie/DOM ứng dụng), script/style chỉ chạy với **nonce**, `connect-src 'none'` (không gọi mạng), `frame-ancestors 'self'`.
- iframe phía giao diện cũng đặt `sandbox="allow-scripts allow-popups"` — không cấp `allow-same-origin`/fullscreen; video phát ở lớp phủ của app (xem 05 §8).
- Vì iframe không có cookie, ảnh/video dùng **URL ký HMAC** (`lib/signedUrl.js`, khoá = `SESSION_SECRET`, có hạn `exp`) — so sánh chữ ký bằng `timingSafeEqual`.
- Chế độ sửa (`?edit=1`, chỉ chủ sở hữu): khung nhận `deck:render` (HTML slide do renderer dùng chung của **ứng dụng** sinh từ bản nháp — mọi chuỗi đã `esc()`) chỉ từ `window.parent`, chèn bằng `<template>.innerHTML` (script không chạy khi chèn kiểu này; CSP nonce chặn thuộc tính sự kiện). Chiều ngược lại ứng dụng coi khung là **không tin cậy**: đường dẫn trường qua allowlist (`lib/editPaths.js`, map không prototype), toạ độ kẹp số hữu hạn, id phần tử phải có trong bản nháp; máy chủ vẫn chuẩn hoá strict khi lưu.
- Chromium (PDF/thumbnail): chặn mọi request trừ `data:`/`about:blank`; nội dung đã inline sẵn (ảnh, phông, ảnh bìa video).

## Bí mật

- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SESSION_SECRET`, mật khẩu DB chỉ nằm trong `.env` (gitignore). `.env.example` chỉ có placeholder.
- Gọi Gemini bằng header `x-goog-api-key` (không đặt khoá trên URL → không lọt vào log proxy).
- Log `config_loaded` che secret `***`; log HTTP không ghi query string (chứa chữ ký ảnh); audit không ghi mật khẩu/token.
- Lỗi 500 trả thông điệp chung; stack trace chỉ có trong log server.

## Rate limit

Xem `04-api-reference.md` — API chung, đăng nhập, đăng ký, tạo bài + dựng bài (bảo vệ hạn mức Gemini), thêm media (video/YouTube/tách nền — bảo vệ đĩa, CPU, gọi ra YouTube), xuất PDF (bảo vệ CPU Chromium). Thêm giới hạn hàng đợi `MAX_PENDING_JOBS = 20` → 503. Ảnh AI: `aiImage` 40 lượt/10 phút/người + hàng đợi `AI_IMAGES_CONCURRENCY`, quá 12 chờ → 503; tìm ảnh: `imageSearch` 40/phút.

## Nguồn bên ngoài (ảnh Internet)

- Pixabay: khoá `PIXABAY_API_KEY` chỉ ở máy chủ (logger che, không trả client). Nhập ảnh = máy chủ **hỏi lại API theo mã ảnh** rồi tải đúng URL API trả về — không bao giờ tải URL do client gửi (chống SSRF); chỉ nhận `https` + host `pixabay.com`/`cdn.pixabay.com`, `redirect: 'error'`, ≤ 15 MB, rồi chuẩn hoá qua sharp như ảnh tải lên.
- CSP ứng dụng `img-src` thêm `https://pixabay.com https://cdn.pixabay.com` để hiện ảnh xem trước kết quả tìm (`referrerpolicy=no-referrer`).

## Kiểm toán

`audit_logs` ghi: đăng ký, đăng nhập (thành công/thất bại), đổi mật khẩu, tạo/dựng (`presentation.build`)/xoá/nhân bản bài, đổi chế độ chia sẻ, xuất HTML/PDF, mọi thao tác admin.
