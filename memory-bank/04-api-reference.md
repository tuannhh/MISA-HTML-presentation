# 04 — Tài liệu API

Tiền tố chung `/api`. Mọi response thành công: `{ "data": ..., "meta": {...} | null }`. Lỗi: `{ "error": { "code", "message", "details?" } }` (message tiếng Việt, hiển thị được cho người dùng).

## Quy ước chung

- **Xác thực:** cookie phiên `mp.sid` (httpOnly, SameSite=Lax, `Secure` khi `SESSION_COOKIE_SECURE=true`), rolling, hết hạn theo `SESSION_MAX_AGE_HOURS`.
- **CSRF:** mọi request không phải GET/HEAD/OPTIONS phải gửi header `X-CSRF-Token` (lấy từ `GET /api/auth/me` hoặc `/api/auth/csrf`) **và** Origin (nếu có) phải trùng `APP_BASE_URL` hoặc host hiện tại. Lỗi: 403 `CSRF_INVALID` / `BAD_ORIGIN`.
- **Phân trang:** `?page=1&pageSize=24` → `meta: { page, pageSize, total, hasNext }`.
- **Input:** chỉ nhận các trường trong allowlist (`pick`) — trường lạ bị bỏ qua, không lỗi.
- **Mã lỗi thường gặp:** 400 `VALIDATION_ERROR` / `INVALID_*`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN` / `MUST_CHANGE_PASSWORD` / `ADMIN_ONLY`, 404 `NOT_FOUND`, 409 `VERSION_CONFLICT` / `NOT_READY` / `EMAIL_TAKEN`, 413 tệp quá lớn, 422 `SOURCE_EMPTY` / `AI_EMPTY` / `BAD_ARCHIVE` / `UNSUPPORTED_FILE`, 429 `*_RATE_LIMITED`, 503 `QUEUE_FULL` / `NOT_READY`.
- **Giới hạn tần suất:** toàn API 600 req/phút/IP; đăng nhập 10 lần/15 phút theo IP+email; đăng ký 10/giờ/IP; tạo bài 30/giờ/người; xuất PDF 20/10 phút/người.

## Hệ thống

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Liveness, không chạm DB → `{status:'ok'}` |
| GET | `/api/health/ready` | Readiness: `SELECT 1` + `queue.pending`; 503 nếu DB lỗi |
| GET | `/deck-assets/InterVariable.woff2` | Font Inter cho bài trình bày (công khai, cache 1 năm, CORS `*`) |

## Xác thực — `/api/auth`

| Method | Path | Quyền | Body | Kết quả |
|---|---|---|---|---|
| GET | `/config` | Công khai | — | `{ selfRegistration, allowedEmailDomains[] }` |
| GET | `/csrf` | Công khai | — | `{ token }` |
| GET | `/me` | Công khai | — | `{ user \| null, csrfToken }` |
| POST | `/register` | Khách | `email, password, displayName` | 201 `{ user, csrfToken }` — tạo phiên luôn. 403 nếu tắt đăng ký hoặc domain không cho phép |
| POST | `/login` | Khách | `email, password` | `{ user, csrfToken }`. Sai → 401 chung "Email hoặc mật khẩu không đúng" |
| POST | `/logout` | — | — | Huỷ phiên, xoá cookie |
| POST | `/change-password` | Đăng nhập (cho phép cả khi `mustChangePassword`) | `currentPassword, newPassword` | Tăng `session_version` → mọi phiên khác bị đăng xuất; phiên hiện tại được cấp lại |

Mật khẩu: 10–128 ký tự, có cả chữ và số. `user` trả về: `{ id, email, displayName, role, status, mustChangePassword, createdAt, lastLoginAt }`.

## Bài trình bày — `/api/presentations` (yêu cầu đăng nhập)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/?scope=mine\|public&q=&page=&pageSize=` | `mine`: bài của tôi (mọi trạng thái). `public`: bài công khai **đã ready** của mọi người, kèm `authorName`. pageSize tối đa 48 |
| POST | `/` (multipart) | Tạo bằng AI. Trường: `file` **hoặc** `url` **hoặc** `text` (đúng 1 nguồn), `ratio`, `slideCount` (3–40, mặc định 12), `instructions` (≤ 2000), `title` (≤ 200). → **202** `{ id, status:'generating' }` |
| GET | `/:id` | Chi tiết + `spec`. Chủ sở hữu có thêm `assets[]` (URL ký). Người khác chỉ đọc được nếu bài `public` + `ready`; nếu không → 404 |
| PATCH | `/:id` | Chủ sở hữu. Body: `title`, `ratio`, `visibility`, `spec` + `specVersion` (bắt buộc đi kèm spec). Spec được chuẩn hoá **strict** → 400 với `details: string[]` nếu sai. Version lệch → 409 `VERSION_CONFLICT`. Không sửa được khi chưa `ready` |
| DELETE | `/:id` | Chủ sở hữu. Xoá DB (cascade asset) + thư mục tệp |
| POST | `/:id/duplicate` | Chủ sở hữu **hoặc** bài công khai. → 201 bản sao **private** của người gọi (sao chép cả ảnh), `source_kind='copy'` |
| POST | `/:id/assets` (multipart `file`) | Chủ sở hữu. Tải ảnh (≤ `MAX_IMAGE_UPLOAD_MB`), chuẩn hoá WebP → 201 `{ id, url, width, height, name }` |
| GET | `/:id/preview` | HTML trình chiếu cho iframe. Header CSP `sandbox allow-scripts allow-popups`, nonce, `connect-src 'none'`, `frame-ancestors 'self'`, `no-store` |
| GET | `/:id/export.html` | Tải HTML một tệp (ảnh + font base64, giữ chuyển động). Ghi audit |
| GET | `/:id/export.pdf` | Tải PDF (mode print, không chuyển động) qua Chromium. Ghi audit, rate-limit |

Tên tệp tải về: `Content-Disposition` có `filename` ASCII + `filename*` UTF-8 (giữ tiếng Việt).

DTO bài trình bày: `{ id, title, ratio, visibility, status, sourceKind, sourceLabel, specVersion, slideCount, thumbnailUrl, errorMessage, isOwner, authorName, createdAt, updatedAt, publishedAt, spec?, assets? }`.

## Ảnh — `/api/assets/:id`

Trả ảnh nếu **(a)** query `exp` + `sig` là chữ ký HMAC hợp lệ (dùng trong iframe sandbox không có cookie) **hoặc (b)** người dùng có quyền đọc bài chứa ảnh (chủ sở hữu hoặc bài public ready). Header `Cross-Origin-Resource-Policy: cross-origin`, `nosniff`.

## Quản trị — `/api/admin` (chỉ admin)

| Method | Path | Body | Kết quả |
|---|---|---|---|
| GET | `/users?q=&page=` | — | Danh sách người dùng + `presentationCount` |
| POST | `/users` | `email, displayName, role` | 201 `{ user, temporaryPassword }` — mật khẩu tạm chỉ trả **một lần**, `must_change_password=1`. **Không** áp giới hạn domain |
| PATCH | `/users/:id` | `role`, `status` | Không tự hạ quyền / tự khoá chính mình; không bỏ admin cuối cùng. Khoá → tăng `session_version` |
| POST | `/users/:id/reset-password` | — | `{ temporaryPassword }`, bắt buộc đổi ở lần đăng nhập tới, vô hiệu phiên cũ |

> Admin **không** có endpoint nào đọc bài private của tenant khác — đây là chủ đích thiết kế.
