# 08 — Mô hình bảo mật

## Xác thực & phiên

- Mật khẩu băm **bcrypt** (`BCRYPT_ROUNDS`, mặc định 12). Chính sách: 10–128 ký tự, có chữ và số; mật khẩu mới phải khác mật khẩu cũ.
- Phiên express-session lưu MySQL (`sessions`), cookie `mp.sid` httpOnly + SameSite=Lax (+ Secure ở production). `regenerate()` khi đăng nhập/đăng ký/đổi mật khẩu (chống session fixation).
- **Thu hồi phiên:** phiên lưu `sv = users.session_version`; `loadUser` so sánh mỗi request. Đổi mật khẩu, đặt lại mật khẩu, khoá tài khoản → tăng version → mọi phiên cũ mất hiệu lực ngay.
- Đăng nhập sai: thông điệp chung (không lộ email có tồn tại hay không); rate-limit 10 lần/15 phút theo IP+email.
- Mật khẩu tạm do admin cấp sinh bằng `crypto.randomBytes`, trả về **một lần**, không lưu dạng rõ, `must_change_password=1` → API chặn mọi thao tác khác (`MUST_CHANGE_PASSWORD`).

## CSRF & header

- Token đồng bộ trong phiên, header `X-CSRF-Token`, so sánh `timingSafeEqual`; kiểm tra thêm `Origin` cho mọi request ghi.
- Helmet: CSP chặt cho ứng dụng (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), `X-Frame-Options: DENY`, CORP same-origin, Referrer-Policy strict-origin-when-cross-origin, ẩn `x-powered-by`.

## Phân quyền & cách ly tenant

- Mỗi người dùng = 1 tenant. **Mọi** truy vấn dữ liệu theo tenant đi qua `repositories/tenantScope.js` (`tenantClause`, `assertTenantId`) — không ghép chuỗi `tenant_id` thủ công.
- Đọc bài của người khác chỉ khi `visibility='public' AND status='ready'`; ghi chỉ chủ sở hữu. Không đủ quyền → **404** (không lộ tồn tại).
- Admin chỉ có quyền quản trị tài khoản; **không** có đường đọc bài private của tenant khác.
- ID từ URL được kiểm định UUID (`uuidParam`) trước khi chạm DB.
- Spec lưu vào DB luôn qua `normalizeSpec` (allowlist trường) + `dropForeignAssets` (chỉ giữ asset thuộc chính bài) → không thể tham chiếu ảnh của tenant khác.

## Đầu vào không tin cậy

| Nguồn | Biện pháp |
|---|---|
| Tệp upload | Giới hạn kích thước (multer), nhận diện bằng **magic bytes** (`lib/fileType.js`), không tin phần mở rộng/MIME client; zip: ≤ 5000 entry, ≤ 400MB giải nén (chống zip bomb) |
| Ảnh | sharp chuẩn hoá lại thành WebP (loại metadata, giới hạn 60MP), lưu bằng key do server sinh |
| URL | `lib/safeFetch.js`: chỉ http/https, chặn IP private/loopback/link-local/metadata (IPv4 + IPv6, kể cả IPv4-mapped), kiểm IP **lúc kết nối** (chống DNS rebinding), giới hạn redirect + kích thước + thời gian |
| Nội dung AI | Chỉ nhận JSON theo schema → chuẩn hoá lenient; renderer **escape mọi chuỗi** (`esc`) — có unit test XSS |
| Đường dẫn tệp | `storageService` kiểm regex key, cấm `..`, kiểm đường dẫn tuyệt đối nằm trong thư mục gốc |

## Sandbox xem trước

- `/api/presentations/:id/preview` trả CSP: `sandbox allow-scripts allow-popups` (origin `null` — script trong bài không đọc được cookie/DOM ứng dụng), script/style chỉ chạy với **nonce**, `connect-src 'none'` (không gọi mạng), `frame-ancestors 'self'`.
- iframe phía giao diện cũng đặt `sandbox="allow-scripts allow-popups"`.
- Vì iframe không có cookie, ảnh dùng **URL ký HMAC** (`lib/signedUrl.js`, khoá = `SESSION_SECRET`, có hạn `exp`) — so sánh chữ ký bằng `timingSafeEqual`.
- Chromium (PDF/thumbnail): chặn mọi request trừ `data:`/`about:blank`; nội dung đã inline sẵn.

## Bí mật

- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SESSION_SECRET`, mật khẩu DB chỉ nằm trong `.env` (gitignore). `.env.example` chỉ có placeholder.
- Gọi Gemini bằng header `x-goog-api-key` (không đặt khoá trên URL → không lọt vào log proxy).
- Log `config_loaded` che secret `***`; log HTTP không ghi query string (chứa chữ ký ảnh); audit không ghi mật khẩu/token.
- Lỗi 500 trả thông điệp chung; stack trace chỉ có trong log server.

## Rate limit

Xem `04-api-reference.md` — API chung, đăng nhập, đăng ký, tạo bài (bảo vệ hạn mức Gemini), xuất PDF (bảo vệ CPU Chromium). Thêm giới hạn hàng đợi `MAX_PENDING_JOBS = 20` → 503.

## Kiểm toán

`audit_logs` ghi: đăng ký, đăng nhập (thành công/thất bại), đổi mật khẩu, tạo/xoá/nhân bản bài, đổi chế độ chia sẻ, xuất HTML/PDF, mọi thao tác admin.
