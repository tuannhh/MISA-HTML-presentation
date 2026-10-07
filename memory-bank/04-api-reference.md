# 04 — Tài liệu API

Tiền tố chung `/api`. Mọi response thành công: `{ "data": ..., "meta": {...} | null }`. Lỗi: `{ "error": { "code", "message", "details?" } }` (message tiếng Việt, hiển thị được cho người dùng).

## Quy ước chung

- **Xác thực:** cookie phiên `mp.sid` (httpOnly, SameSite=Lax, `Secure` khi `SESSION_COOKIE_SECURE=true`), rolling, hết hạn theo `SESSION_MAX_AGE_HOURS`.
- **CSRF:** mọi request không phải GET/HEAD/OPTIONS phải gửi header `X-CSRF-Token` (lấy từ `GET /api/auth/me` hoặc `/api/auth/csrf`) **và** Origin (nếu có) phải trùng `APP_BASE_URL` hoặc host hiện tại. Lỗi: 403 `CSRF_INVALID` / `BAD_ORIGIN`.
- **Phân trang:** `?page=1&pageSize=24` → `meta: { page, pageSize, total, hasNext }`.
- **Input:** chỉ nhận các trường trong allowlist (`pick`) — trường lạ bị bỏ qua, không lỗi.
- **Mã lỗi thường gặp:** 400 `VALIDATION_ERROR` / `INVALID_*` (`INVALID_THEME`, `INVALID_COLOR`, `INVALID_YOUTUBE_URL`, `VERSION_REQUIRED`, `INVALID_ROLE`, `INVALID_EMAIL`, `SELF_SHARE`, `NOTE_TOO_LONG`, `BASELINE_LOCKED`), 401 `UNAUTHORIZED`, 403 `FORBIDDEN` / `MUST_CHANGE_PASSWORD` / `ADMIN_ONLY` / `VIEW_ONLY` (được xem nhưng không được sửa) / `OWNER_ONLY` (người được mời sửa đổi công khai) / `NOT_VERSION_OWNER`, 404 `NOT_FOUND` / `USER_NOT_FOUND` / `SHARE_NOT_FOUND`, 409 `VERSION_CONFLICT` / `NOT_READY` / `NOT_OUTLINE` / `EMAIL_TAKEN` / `HANDOFF_EXISTS` / `HANDOFF_LIMIT` / `NO_BASELINE`, 413 tệp quá lớn, 422 `SOURCE_EMPTY` / `AI_EMPTY` / `BAD_ARCHIVE` / `UNSUPPORTED_FILE` / `INVALID_VIDEO` / `INVALID_MEDIA` / `FOREIGN_ASSET` / `TOO_MANY_ASSETS` / `YOUTUBE_NOT_FOUND` / `YOUTUBE_NOT_EMBEDDABLE`, 429 `*_RATE_LIMITED`, 503 `QUEUE_FULL` / `NOT_READY`.
- **Giới hạn tần suất:** toàn API 600 req/phút/IP; đăng nhập 10 lần/15 phút theo IP+email; đăng ký 10/giờ/IP; tạo bài 30/giờ/người; dựng bài 60/giờ/người; thêm media (video, YouTube, tách nền) **và handoff** 120/10 phút/người; mời người chia sẻ 60/10 phút/người (`share` — chặn dò email hàng loạt); xuất PDF 20/10 phút/người.

## Hệ thống

Khi `IP_ALLOWLIST` có giá trị: mọi đường dẫn (trừ 2 route health) từ IP ngoài danh sách → **403** `IP_NOT_ALLOWED` (`/api/*` JSON, còn lại trang HTML).

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Liveness, không chạm DB → `{status:'ok'}` |
| GET | `/api/health/ready` | Readiness: `SELECT 1` + `queue.pending`; 503 nếu DB lỗi |
| GET | `/deck-assets/InterVariable.woff2` | Font Inter cho bài trình bày (công khai, cache 1 năm, CORS `*`) |
| GET | `/deck-assets/deck3d.js?v=<băm>` | Gói hiệu ứng 3D (three.js, IIFE `window.Deck3D`) cho khung xem trước sandbox — công khai, cache 1 năm (URL có băm nội dung), CORS `*`, CORP cross-origin. Chưa `npm run build` → 404 (bài tự lùi về nền 2D) |
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

`:id` nhận **UUID hoặc mã ngắn 8 ký tự** (`short_code`) — middleware đổi mã → UUID trước khi vào service. DTO có thêm `code`.

**Quyền trên bài** (`access` trong DTO, `05` §4): `owner` (chủ bài) · `editor` (được mời Chỉnh sửa) · `viewer` (được mời Chỉ xem **hoặc** bài công khai). Cột "Quyền" dưới đây: *chủ* = chỉ chủ bài (người khác → 404); *sửa* = chủ + người được mời sửa (người chỉ xem → 403 `VIEW_ONLY`, người không truy cập được → 404); *đọc* = mọi người truy cập được bài.

| Method | Path | Mô tả |
|---|---|---|
| GET | `/?scope=mine\|shared\|public&q=&page=&pageSize=` | `mine`: bài của tôi (mọi trạng thái). `shared`: bài **ready** người khác mời tôi (kèm `authorName`, `access`, `shareRole`), mới cập nhật trước. `public`: bài công khai **đã ready** của mọi người, kèm `authorName`. pageSize tối đa 48 |
| POST | `/` (multipart) | Tạo bằng AI. Nguồn (đúng 1 loại): `files` (nhiều tệp, ≤ `MAX_UPLOAD_FILES`, **tổng** ≤ `MAX_UPLOAD_MB` — không giới hạn riêng từng tệp; `file` 1 tệp vẫn nhận cho client cũ) **hoặc** `url` **hoặc** `text`. Tệp: pptx/docx/xlsx/pdf (cả bản scan)/odt·odp·ods/txt/md/csv·tsv (UTF-8, UTF-16, Windows-1258)/ảnh png·jpeg·webp·gif·avif/ghi âm mp3·m4a·mp4·wav·ogg·flac·aac·aiff·webm (nhận diện magic bytes). .doc/.xls/.ppt đời cũ, HEIC → 415 kèm hướng dẫn lưu lại/đổi JPEG. `ratio`, `tone` (`dark`\|`light`, mặc định `dark`), `theme` (`auto` — AI chọn mẫu hợp tông — \| id mẫu màu \| `custom` kèm `primary` + `secondary` dạng `#RRGGBB`), `slideCount` (`auto` = AI chọn ≤ 25 trang — mặc định; hoặc 3–40 = đúng số trang), `instructions` (≤ 2000), `title` (≤ 200), `aiImages` (`1`/`0`, mặc định bật — AI tạo ảnh minh hoạ khi dựng bài, `05` §12). **Media gửi kèm** (tuỳ chọn, mọi loại nguồn — giao diện chỉ mở ở tab Nhập nội dung): `media` (ảnh PNG/JPEG/WebP/GIF/AVIF ≤ `MAX_IMAGE_UPLOAD_MB`, video MP4/MOV/WebM ≤ `MAX_VIDEO_MB`; ≤ `MAX_CREATE_MEDIA` tệp, ≤ `MAX_VIDEOS_PER_DECK` video) + `posters` (ảnh bìa video do trình duyệt chụp, tên `poster-<vị trí trong media>.jpg`) — tổng dung lượng tệp + media ≤ `MAX_UPLOAD_MB`; luôn được đưa vào dàn ý (`05` §10). → **202** `{ id, status:'outlining' }` (AI **lập dàn ý**, chưa dựng slide). Lỗi: 413 `UPLOAD_TOO_LARGE` (chặn sớm theo Content-Length), 400 `TOO_MANY_FILES`/`EMPTY_FILE`/`SOURCE_REQUIRED`, 415 `UNSUPPORTED_FILE` (nêu tên tệp). |
| GET | `/:id` | *đọc*. Chi tiết + `spec` (NULL khi chưa dựng). Chủ + người được mời sửa có `assets[]` (`{id, kind, url, width, height, name, mime, bytes}`, URL ký; mọi kind trừ thumbnail — asset ở tenant chủ bài). Chỉ chủ có `outline`, `outlineVersion`, `instructions`. Người khác đọc được khi bài `ready` **và** (`public` **hoặc** được mời); nếu không → 404 |
| PATCH | `/:id` | *sửa*. Body: `title`, `ratio`, `visibility` (**chỉ chủ** — người được mời sửa → 403 `OWNER_ONLY`; bật `public` lần đầu → tạo bản gốc), `spec` + `specVersion` (bắt buộc đi kèm spec). Spec được chuẩn hoá **strict** → 400 với `details: string[]` nếu sai. Version lệch → 409 `VERSION_CONFLICT`. Không sửa được khi chưa `ready`. Người được mời sửa lưu → audit `presentation.shared_edit` |
| DELETE | `/:id` | Chủ sở hữu. Xoá DB (cascade asset) + thư mục tệp |
| POST | `/:id/duplicate` | *đọc* (chủ, người được mời, bài công khai). → 201 bản sao **private** của người gọi (sao chép cả ảnh), `source_kind='copy'` |
| PUT | `/:id/outline` | Chủ sở hữu, bài ở `outline`. Body `{ outline, outlineVersion }` — chuẩn hoá **strict** (400 `details[]`), media phải thuộc bài và đúng loại (422). Version lệch → 409. → `{ ...deck, outlineVersion }` |
| POST | `/:id/build` | Chủ sở hữu. Body `{ outlineVersion, outline? }` (gửi kèm dàn ý = lưu rồi dựng). Chuyển nguyên tử `outline → generating` (bấm 2 lần → 409) → **202** `{ id, status:'generating' }`; dựng lỗi → về `outline` + `errorMessage` |
| POST | `/:id/assets` (multipart `file`) | *sửa* (mọi endpoint media dưới đây cũng vậy — tệp/asset ghi vào **tenant chủ bài**), bài ở `outline`/`ready`. Tải ảnh (≤ `MAX_IMAGE_UPLOAD_MB`), chuẩn hoá WebP → 201 asset |
| POST | `/:id/logo` (multipart `file`) | Logo (giữ nền trong suốt, cạnh dài ≤ 1200, ≤ 30 logo/bài) → 201 asset kind `logo` |
| POST | `/:id/logo/:assetId/cutout` | Body `{ mode: auto\|color\|ai }`. Tách nền → 201 `{ asset, method: color\|ai\|none, note }` (asset logo mới; `none` = logo đã trong suốt → trả logo gốc). Hàng đợi 1 việc, quá 5 chờ → 503 |
| POST | `/:id/videos` (multipart `file` + `poster` tuỳ chọn) | Video MP4/MOV/WebM (magic bytes, ≤ `MAX_VIDEO_MB`, ≤ `MAX_VIDEOS_PER_DECK`/bài); `poster` = ảnh bìa chụp ở trình duyệt → 201 `{ video:{provider:'file', asset, poster, title}, assets[] }` |
| POST | `/:id/youtube` | Body `{ url }` (watch/youtu.be/shorts/embed/live/nocookie). Lấy ảnh bìa 16:9 + tiêu đề (oEmbed) → 201 `{ video:{provider:'youtube', id, poster, title}, assets[] }`; link lạ 400, video không tồn tại/không cho nhúng 422 |
| POST | `/:id/assets/:assetId/edit` | Chỉnh sửa ảnh (ảnh/ảnh bìa của bài). Body `{ crop?:{x,y,w,h} (0–1, theo khung bao ảnh sau xoay), rotate? (−360..360), flipH?, flipV?, brightness?/saturation?/contrast? (−100..100) }` — luôn áp lên **ảnh gốc** `:assetId`. → 201 `{ asset (ảnh mới), src (mã ảnh gốc), edit (thông số đã chuẩn hoá \| null) }`; `edit=null` = không thay đổi → trả ảnh gốc. Rate-limit `media` |
| POST | `/:id/images/generate` | Ảnh AI (Nano Banana 2 Lite `gemini-3.1-flash-lite-image`, 1K). Body `{ prompt (≤ 1000), aspect (1:1, 4:3, 3:4, 16:9, 9:16, 3:2, 2:3, 21:9) }` → 201 `{ asset, alt }`. Tắt bằng `AI_IMAGES=false` → 503 `AI_IMAGES_DISABLED`; hàng đợi đầy → 503 `QUEUE_FULL`; rate-limit `aiImage` 40/10 phút; ghi audit `presentation.ai_image` |
| POST | `/:id/images/import` | Body `{ provider:'pixabay', id }` — máy chủ hỏi lại Pixabay theo mã ảnh (không nhận URL từ client), chỉ tải từ `pixabay.com`/`cdn.pixabay.com`, ≤ 15 MB → 201 `{ asset, alt }` |
| POST | `/:id/brand` (multipart `file`) | Ảnh bộ nhận diện (PNG/JPEG/WebP/GIF/AVIF; giao diện tự đổi SVG → PNG 3200px trước khi gửi). Cạnh dài ≤ 3840, WebP giữ trong suốt, ≤ 120 ảnh/bài (422 `TOO_MANY_ASSETS`) → 201 asset kind `brand`. Gắn vào ô nào do client ghi `spec.brand`/`outline.design.brand` (`05` §13). Rate-limit `media` |
| POST | `/:id/templates/:templateId/apply` | *sửa*, bài ở `outline`/`ready`; mẫu của mình **hoặc** mẫu công khai (riêng tư người khác → 404). Sao chép ảnh mẫu thành asset mới của bài (đổi mã) → **201** `{ design, assets[], name }` — client gán `design` vào thiết kế đang sửa rồi tự lưu (API này **không** ghi spec). Quá 120 ảnh nhận diện/bài → 422 |
| GET | `/:id/preview` | *đọc*. HTML trình chiếu cho iframe. `?edit=1` (chủ + người được mời sửa; người chỉ xem bị bỏ qua cờ) = chế độ **sửa trực tiếp** (`data-e`/`data-m`, không HUD, không chuyển động chữ). Header CSP `sandbox allow-scripts allow-popups`, nonce, `connect-src 'none'`, `frame-ancestors 'self'`, `no-store` |
| GET | `/:id/export.html` | Tải HTML một tệp (ảnh + phông đã chọn base64, giữ chuyển động + nền động). Video tải lên nhúng base64 nếu tổng ≤ `EXPORT_VIDEO_MB`, vượt → khung ảnh bìa không phát; YouTube vẫn mở được khi có mạng. Ghi audit |
| GET | `/:id/export.pdf` | Tải PDF (mode print, không chuyển động) qua Chromium. Ghi audit, rate-limit |

Tên tệp tải về: `Content-Disposition` có `filename` ASCII + `filename*` UTF-8 (giữ tiếng Việt). Xuất HTML/PDF: *đọc* (người chỉ xem vẫn tải được — quyết định của chủ dự án 2026-10-07).

### Chia sẻ theo người + phiên bản handoff (`05` §4)

| Method | Path | Quyền | Mô tả |
|---|---|---|---|
| GET | `/:id/shares` | *chủ* | `{ shares:[{ userId, email, displayName, role, active, createdAt, updatedAt }], visibility, max:100 }` |
| POST | `/:id/shares` | *chủ*, bài `ready` | Body `{ email, role:'viewer'\|'editor' }`. Email chuẩn hoá chữ thường, phải là tài khoản **đang hoạt động** (404 `USER_NOT_FOUND`); mời chính mình 400 `SELF_SHARE`; > 100 người 422 `TOO_MANY_SHARES`. Mời lại = đổi quyền. Lần đầu chia sẻ → tạo bản gốc. → **201** (mới) / **200** (đổi quyền) `{ share, created }`. Rate-limit `share`. Audit `presentation.share_add`/`share_update` |
| PATCH | `/:id/shares/:userId` | *chủ* | Body `{ role }` → `{ share }`; chưa mời → 404 `SHARE_NOT_FOUND`. Audit |
| DELETE | `/:id/shares/:userId` | *chủ* | Gỡ quyền → `{ removed:true }`. Audit `presentation.share_remove` |
| GET | `/:id/versions` | *sửa* | `{ items:[{ id, kind:'baseline'\|'handoff', title, ratio, specVersion, slideCount, note, createdBy:{id,name}\|null, createdAt, isCurrent, canDelete }], handoffs, max:5, canRestore (chỉ chủ), specVersion }` — bản gốc đứng đầu, handoff mới trước; không trả `spec` |
| POST | `/:id/versions` | *sửa* | **Handoff**. Body `{ specVersion, note? (≤ 200) }` — chụp **bản đang lưu** phía máy chủ; `specVersion` lệch → 409 `VERSION_CONFLICT`, bản này đã handoff → 409 `HANDOFF_EXISTS`, đủ 5 → 409 `HANDOFF_LIMIT` (phải xoá bớt). → **201** danh sách phiên bản. Rate-limit `media`. Audit `presentation.handoff` |
| DELETE | `/:id/versions/:versionId` | *sửa* | Chủ xoá mọi handoff; người sửa chỉ xoá bản mình chụp (403 `NOT_VERSION_OWNER`); bản gốc → 400 `BASELINE_LOCKED`. → danh sách phiên bản. Audit `presentation.handoff_remove` |
| GET | `/:id/versions/:versionId/preview` | *sửa* | HTML trình chiếu của phiên bản (cùng CSP sandbox như `/preview`) |
| POST | `/:id/restore` | *chủ* | Body `{ versionId?, specVersion }`. Không gửi `versionId` → **bản gốc** (chưa có → 409 `NO_BASELINE`). Thay `spec` + `title` + `ratio` của bài (khoá lạc quan theo `specVersion` → 409 nếu có người vừa lưu); asset không còn thuộc bài bị gỡ khỏi spec. → DTO bài. Audit `presentation.restore` |

DTO bài trình bày: `{ id, code, title, ratio, visibility, status, sourceKind, sourceLabel, specVersion, outlineVersion, slideCount, thumbnailUrl, errorMessage, isOwner, access:'owner'|'editor'|'viewer', shareRole:'viewer'|'editor'|null, authorName, createdAt, updatedAt, publishedAt, spec?, assets? }` — `shareRole` = quyền được mời (null: bài của mình hoặc chỉ xem nhờ công khai).

## Mẫu thiết kế / thương hiệu — `/api/templates` (yêu cầu đăng nhập)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/` | Mẫu của tôi + mẫu công khai của người khác → `[{ id, name, visibility, isOwner, ownerName, design, assets: { <mã ảnh>: { url, width, height, kind } }, updatedAt }]` |
| POST | `/` | Body `{ name, presentationId, design }` — `design` chuẩn hoá **strict** (400 `details[]`); mọi ảnh trong `design` phải là ảnh (image/poster/logo/brand) **thuộc bài `presentationId` của người gọi** (khác → 422 `FOREIGN_ASSET`, không phải ảnh → 422 `INVALID_MEDIA`); ảnh được sao chép sang `template_assets`, mã mới. Tên rỗng/quá 120 → 400 `INVALID_NAME`; > 50 mẫu → 422 `TOO_MANY_TEMPLATES` → 201 DTO. Audit `template.create` |
| PATCH | `/:id` | Chỉ chủ (người khác → 404). Body `name`, `visibility` (`private`\|`public`, sai → 400 `INVALID_VISIBILITY`). Audit `template.visibility` |
| DELETE | `/:id` | Chỉ chủ. Xoá DB (cascade ảnh) + tệp. Audit `template.delete` |
| GET | `/assets/:id` | Ảnh của mẫu (xem trước thumbnail) — chỉ khi đọc được mẫu (của mình hoặc công khai), không thì 404. `Cache-Control: private` |

## Tìm ảnh Internet — `/api/images`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/search?q=&page=&orientation=horizontal\|vertical` | Đăng nhập. Tìm ảnh Pixabay (`safesearch`, có dấu tiếng Việt → `lang=vi`), 24 ảnh/trang, nhớ đệm 24 giờ. → `data: [{ id, preview, thumb, width, height, tags, author, pageUrl }]`, `meta: { page, total (≤ 500), hasNext, source:'pixabay' }`. Thiếu `PIXABAY_API_KEY` → 503 `STOCK_NOT_CONFIGURED`; Pixabay quá tải → 429 `STOCK_QUOTA`. Rate-limit `imageSearch` 40/phút. Khoá API không bao giờ trả về client |

## Ảnh / video — `/api/assets/:id`

Trả tệp nếu **(a)** query `exp` + `sig` là chữ ký HMAC hợp lệ (dùng trong iframe sandbox không có cookie) **hoặc (b)** người dùng có quyền đọc bài chứa ảnh (chủ sở hữu, bài public ready, hoặc bài ready được mời). Header `Cross-Origin-Resource-Policy: cross-origin`, `nosniff`; URL **có chữ ký** thêm `Access-Control-Allow-Origin: *` (logo 3D đọc điểm ảnh bằng WebGL trong khung origin null, ảnh tải `crossorigin="anonymous"`; không có Allow-Credentials). Video phát bằng `sendFile` hỗ trợ `Range` (206, tua được, không nạp cả tệp vào RAM).

## Quản trị — `/api/admin` (chỉ admin)

| Method | Path | Body | Kết quả |
|---|---|---|---|
| GET | `/users?q=&page=` | — | Danh sách người dùng + `presentationCount` |
| POST | `/users` | `email, displayName, role` | 201 `{ user, temporaryPassword }` — mật khẩu tạm chỉ trả **một lần**, `must_change_password=1`. **Không** áp giới hạn domain |
| PATCH | `/users/:id` | `role`, `status` | Không tự hạ quyền / tự khoá chính mình; không bỏ admin cuối cùng. Khoá → tăng `session_version` |
| POST | `/users/:id/reset-password` | — | `{ temporaryPassword }`, bắt buộc đổi ở lần đăng nhập tới, vô hiệu phiên cũ |

> Admin **không** có endpoint nào đọc bài private của tenant khác — đây là chủ đích thiết kế.
