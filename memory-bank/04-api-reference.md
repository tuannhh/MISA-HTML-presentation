# 04 — Tài liệu API

Tiền tố chung `/api`. Mọi response thành công: `{ "data": ..., "meta": {...} | null }`. Lỗi: `{ "error": { "code", "message", "details?" } }` (message tiếng Việt, hiển thị được cho người dùng).

## Quy ước chung

- **Xác thực:** cookie phiên `mp.sid` (httpOnly, SameSite=Lax, `Secure` khi `SESSION_COOKIE_SECURE=true`), rolling, hết hạn theo `SESSION_MAX_AGE_HOURS`.
- **CSRF:** mọi request không phải GET/HEAD/OPTIONS phải gửi header `X-CSRF-Token` (lấy từ `GET /api/auth/me` hoặc `/api/auth/csrf`) **và** Origin (nếu có) phải trùng `APP_BASE_URL` hoặc host hiện tại. Lỗi: 403 `CSRF_INVALID` / `BAD_ORIGIN`.
- **Phân trang:** `?page=1&pageSize=24` → `meta: { page, pageSize, total, hasNext }`.
- **Input:** chỉ nhận các trường trong allowlist (`pick`) — trường lạ bị bỏ qua, không lỗi.
- **Mã lỗi thường gặp:** 400 `VALIDATION_ERROR` / `INVALID_*` (`INVALID_THEME`, `INVALID_COLOR`, `INVALID_YOUTUBE_URL`, `VERSION_REQUIRED`), 401 `UNAUTHORIZED`, 403 `FORBIDDEN` / `MUST_CHANGE_PASSWORD` / `ADMIN_ONLY`, 404 `NOT_FOUND`, 409 `VERSION_CONFLICT` / `NOT_READY` / `NOT_OUTLINE` / `EMAIL_TAKEN`, 413 tệp quá lớn, 422 `SOURCE_EMPTY` / `AI_EMPTY` / `BAD_ARCHIVE` / `UNSUPPORTED_FILE` / `INVALID_VIDEO` / `INVALID_MEDIA` / `FOREIGN_ASSET` / `TOO_MANY_ASSETS` / `YOUTUBE_NOT_FOUND` / `YOUTUBE_NOT_EMBEDDABLE`, 429 `*_RATE_LIMITED`, 503 `QUEUE_FULL` / `NOT_READY`.
- **Giới hạn tần suất:** toàn API 600 req/phút/IP; đăng nhập 10 lần/15 phút theo IP+email; đăng ký 10/giờ/IP; tạo bài 30/giờ/người; dựng bài 60/giờ/người; thêm media (video, YouTube, tách nền) 120/10 phút/người; xuất PDF 20/10 phút/người.

## Hệ thống

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Liveness, không chạm DB → `{status:'ok'}` |
| GET | `/api/health/ready` | Readiness: `SELECT 1` + `queue.pending`; 503 nếu DB lỗi |
| GET | `/deck-assets/InterVariable.woff2` | Font Inter cho bài trình bày (công khai, cache 1 năm, CORS `*`) |
| GET | `/deck-assets/fonts/<thư mục>/<tệp>.woff2` | Phông Montserrat/Barlow/Roboto/Google Sans (tập con unicode-range). Chỉ phục vụ tệp trong allowlist `FONT_FILES` — ngoài danh sách → 404 |

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
| POST | `/` (multipart) | Tạo bằng AI. Nguồn (đúng 1 loại): `files` (nhiều tệp, ≤ `MAX_UPLOAD_FILES`, **tổng** ≤ `MAX_UPLOAD_MB` — không giới hạn riêng từng tệp; `file` 1 tệp vẫn nhận cho client cũ) **hoặc** `url` **hoặc** `text`. Tệp: pptx/docx/xlsx/pdf (cả bản scan)/odt·odp·ods/txt/md/csv·tsv (UTF-8, UTF-16, Windows-1258)/ảnh png·jpeg·webp·gif·avif/ghi âm mp3·m4a·mp4·wav·ogg·flac·aac·aiff·webm (nhận diện magic bytes). .doc/.xls/.ppt đời cũ, HEIC → 415 kèm hướng dẫn lưu lại/đổi JPEG. `ratio`, `tone` (`dark`\|`light`, mặc định `dark`), `theme` (`auto` — AI chọn mẫu hợp tông — \| id mẫu màu \| `custom` kèm `primary` + `secondary` dạng `#RRGGBB`), `slideCount` (`auto` = AI chọn ≤ 25 trang — mặc định; hoặc 3–40 = đúng số trang), `instructions` (≤ 2000), `title` (≤ 200). **Media gửi kèm** (tuỳ chọn, mọi loại nguồn — giao diện chỉ mở ở tab Nhập nội dung): `media` (ảnh PNG/JPEG/WebP/GIF/AVIF ≤ `MAX_IMAGE_UPLOAD_MB`, video MP4/MOV/WebM ≤ `MAX_VIDEO_MB`; ≤ `MAX_CREATE_MEDIA` tệp, ≤ `MAX_VIDEOS_PER_DECK` video) + `posters` (ảnh bìa video do trình duyệt chụp, tên `poster-<vị trí trong media>.jpg`) — tổng dung lượng tệp + media ≤ `MAX_UPLOAD_MB`; luôn được đưa vào dàn ý (`05` §10). → **202** `{ id, status:'outlining' }` (AI **lập dàn ý**, chưa dựng slide). Lỗi: 413 `UPLOAD_TOO_LARGE` (chặn sớm theo Content-Length), 400 `TOO_MANY_FILES`/`EMPTY_FILE`/`SOURCE_REQUIRED`, 415 `UNSUPPORTED_FILE` (nêu tên tệp). |
| GET | `/:id` | Chi tiết + `spec` (NULL khi chưa dựng). Chủ sở hữu có thêm `outline`, `outlineVersion`, `assets[]` (`{id, kind, url, width, height, name, mime, bytes}`, URL ký; mọi kind trừ thumbnail). Người khác chỉ đọc được nếu bài `public` + `ready`; nếu không → 404 |
| PATCH | `/:id` | Chủ sở hữu. Body: `title`, `ratio`, `visibility`, `spec` + `specVersion` (bắt buộc đi kèm spec). Spec được chuẩn hoá **strict** → 400 với `details: string[]` nếu sai. Version lệch → 409 `VERSION_CONFLICT`. Không sửa được khi chưa `ready` |
| DELETE | `/:id` | Chủ sở hữu. Xoá DB (cascade asset) + thư mục tệp |
| POST | `/:id/duplicate` | Chủ sở hữu **hoặc** bài công khai. → 201 bản sao **private** của người gọi (sao chép cả ảnh), `source_kind='copy'` |
| PUT | `/:id/outline` | Chủ sở hữu, bài ở `outline`. Body `{ outline, outlineVersion }` — chuẩn hoá **strict** (400 `details[]`), media phải thuộc bài và đúng loại (422). Version lệch → 409. → `{ ...deck, outlineVersion }` |
| POST | `/:id/build` | Chủ sở hữu. Body `{ outlineVersion, outline? }` (gửi kèm dàn ý = lưu rồi dựng). Chuyển nguyên tử `outline → generating` (bấm 2 lần → 409) → **202** `{ id, status:'generating' }`; dựng lỗi → về `outline` + `errorMessage` |
| POST | `/:id/assets` (multipart `file`) | Chủ sở hữu, bài ở `outline`/`ready`. Tải ảnh (≤ `MAX_IMAGE_UPLOAD_MB`), chuẩn hoá WebP → 201 asset |
| POST | `/:id/logo` (multipart `file`) | Logo (giữ nền trong suốt, cạnh dài ≤ 1200, ≤ 30 logo/bài) → 201 asset kind `logo` |
| POST | `/:id/logo/:assetId/cutout` | Body `{ mode: auto\|color\|ai }`. Tách nền → 201 `{ asset, method: color\|ai\|none, note }` (asset logo mới; `none` = logo đã trong suốt → trả logo gốc). Hàng đợi 1 việc, quá 5 chờ → 503 |
| POST | `/:id/videos` (multipart `file` + `poster` tuỳ chọn) | Video MP4/MOV/WebM (magic bytes, ≤ `MAX_VIDEO_MB`, ≤ `MAX_VIDEOS_PER_DECK`/bài); `poster` = ảnh bìa chụp ở trình duyệt → 201 `{ video:{provider:'file', asset, poster, title}, assets[] }` |
| POST | `/:id/youtube` | Body `{ url }` (watch/youtu.be/shorts/embed/live/nocookie). Lấy ảnh bìa 16:9 + tiêu đề (oEmbed) → 201 `{ video:{provider:'youtube', id, poster, title}, assets[] }`; link lạ 400, video không tồn tại/không cho nhúng 422 |
| GET | `/:id/preview` | HTML trình chiếu cho iframe. Header CSP `sandbox allow-scripts allow-popups`, nonce, `connect-src 'none'`, `frame-ancestors 'self'`, `no-store` |
| GET | `/:id/export.html` | Tải HTML một tệp (ảnh + phông đã chọn base64, giữ chuyển động + nền động). Video tải lên nhúng base64 nếu tổng ≤ `EXPORT_VIDEO_MB`, vượt → khung ảnh bìa không phát; YouTube vẫn mở được khi có mạng. Ghi audit |
| GET | `/:id/export.pdf` | Tải PDF (mode print, không chuyển động) qua Chromium. Ghi audit, rate-limit |

Tên tệp tải về: `Content-Disposition` có `filename` ASCII + `filename*` UTF-8 (giữ tiếng Việt).

DTO bài trình bày: `{ id, title, ratio, visibility, status, sourceKind, sourceLabel, specVersion, outlineVersion, slideCount, thumbnailUrl, errorMessage, isOwner, authorName, createdAt, updatedAt, publishedAt, spec?, assets? }`.

## Ảnh / video — `/api/assets/:id`

Trả tệp nếu **(a)** query `exp` + `sig` là chữ ký HMAC hợp lệ (dùng trong iframe sandbox không có cookie) **hoặc (b)** người dùng có quyền đọc bài chứa ảnh (chủ sở hữu hoặc bài public ready). Header `Cross-Origin-Resource-Policy: cross-origin`, `nosniff`. Video phát bằng `sendFile` hỗ trợ `Range` (206, tua được, không nạp cả tệp vào RAM).

## Quản trị — `/api/admin` (chỉ admin)

| Method | Path | Body | Kết quả |
|---|---|---|---|
| GET | `/users?q=&page=` | — | Danh sách người dùng + `presentationCount` |
| POST | `/users` | `email, displayName, role` | 201 `{ user, temporaryPassword }` — mật khẩu tạm chỉ trả **một lần**, `must_change_password=1`. **Không** áp giới hạn domain |
| PATCH | `/users/:id` | `role`, `status` | Không tự hạ quyền / tự khoá chính mình; không bỏ admin cuối cùng. Khoá → tăng `session_version` |
| POST | `/users/:id/reset-password` | — | `{ temporaryPassword }`, bắt buộc đổi ở lần đăng nhập tới, vô hiệu phiên cũ |

> Admin **không** có endpoint nào đọc bài private của tenant khác — đây là chủ đích thiết kế.
