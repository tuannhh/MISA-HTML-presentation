# 08 — Mô hình bảo mật

## Xác thực & phiên

- Mật khẩu băm **bcrypt** (`BCRYPT_ROUNDS`, mặc định 12). Chính sách: 10–128 ký tự, có chữ và số; mật khẩu mới phải khác mật khẩu cũ.
- Phiên express-session lưu MySQL (`sessions`), cookie `mp.sid` httpOnly + SameSite=Lax (+ Secure ở production). `regenerate()` khi đăng nhập/đổi mật khẩu (chống session fixation).
- **Thu hồi phiên:** phiên lưu `sv = users.session_version`; `loadUser` so sánh mỗi request. Đổi mật khẩu, đặt lại mật khẩu, khoá tài khoản → tăng version → mọi phiên cũ mất hiệu lực ngay.
- Mật khẩu mới ≤ 72 byte (bcrypt cắt lặng lẽ phần sau byte thứ 72; tiếng Việt có dấu 2–3 byte/ký tự).
- Tài khoản đang phải đổi mật khẩu tạm không đọc được asset qua đường đăng nhập (`readAsset`) — giống `requireAuth`.
- Công cụ ngoài xử lý tệp người dùng (LibreOffice, pdftoppm) chạy với **môi trường tối thiểu** (`toolEnv`), không kế thừa khoá/bí mật của tiến trình.
- Đăng nhập sai: thông điệp chung (không lộ email có tồn tại hay không); rate-limit 10 lần/15 phút theo email (không theo IP — đổi IP không né được).
- Mật khẩu tạm do admin cấp sinh bằng `crypto.randomBytes`, trả về **một lần**, không lưu dạng rõ, `must_change_password=1` → API chặn mọi thao tác khác (`MUST_CHANGE_PASSWORD`).

## CSRF & header

- Token đồng bộ trong phiên, header `X-CSRF-Token`, so sánh `timingSafeEqual`; kiểm tra thêm `Origin` cho mọi request ghi.
- Helmet: CSP chặt cho ứng dụng (`script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `media-src 'self' blob:`, `frame-src 'self' https://www.youtube-nocookie.com` — chỉ để phát video trong lớp phủ), `X-Frame-Options: DENY`, CORP same-origin, Referrer-Policy strict-origin-when-cross-origin, ẩn `x-powered-by`.

## Giới hạn IP (mạng MISA) — 2026-10-07
- Máy chủ backend đặt trong mạng MISA → chỉ IP trong `IP_ALLOWLIST` được truy cập. Middleware `middleware/ipAllowlist.js` (đặt ngay sau helmet, trước mọi route) áp cho **toàn bộ** ứng dụng: API, giao diện SPA, phông/gói 3D; chỉ miễn `/api/health` và `/api/health/ready` (healthcheck Docker/LB).
- So khớp bằng `net.BlockList` (`lib/ipAllowlist.js`): IP đơn, CIDR, khoảng `a-b`, IPv4 + IPv6; `::ffff:a.b.c.d` quy về IPv4. Mục sai → cấu hình báo lỗi, ứng dụng không khởi động (không lặng lẽ bỏ qua). Danh sách rỗng = không giới hạn (DevOps điền IP thật sau).
- Bị chặn → 403, `Cache-Control: no-store`: `/api/*` trả `{error:{code:'IP_NOT_ALLOWED'}}`, còn lại trả trang HTML ngắn "chỉ truy cập được từ mạng nội bộ MISA". Log `ip_blocked` (IP đã chuẩn hoá) tối đa 1 lần/phút mỗi IP.
- IP lấy từ `req.ip` → phụ thuộc `TRUST_PROXY`: 0 = IP kết nối (bỏ qua `X-Forwarded-For`); sau N proxy đặt **đúng** N (Express lấy IP thứ N từ phải của XFF, IP giả client chèn phía trước bị bỏ). Đặt dư → client giả được IP. Khi `TRUST_PROXY>0` không được mở cổng app trực tiếp ra ngoài (gọi thẳng app thì XFF do client tự viết).
- **Đã kiểm bằng test tự động (2026-10-12, `test/integration/https-proxy.test.js`)**: sau cổng vào giả kết thúc TLS (`X-Forwarded-Proto: https`, gắn IP thật vào XFF) với `TRUST_PROXY` đúng số lớp + `SESSION_COOKIE_SECURE=true` → cookie `mp.sid` có `Secure; HttpOnly; SameSite=Lax`, đăng nhập dùng được; client tự gửi `X-Forwarded-For: 1.2.3.4` → audit vẫn ghi IP do cổng vào gắn. Gọi thẳng app bằng http → **không** cấp cookie phiên. Production lệch https ↔ cookie Secure → `loadConfig` dừng khởi động.
- Đăng nhập: bcrypt chạy trên worker_threads (`PASSWORD_HASH_THREADS`) — nhiều người đăng nhập cùng lúc không làm treo các request khác; hash giả cho email không tồn tại vẫn giữ thời gian phản hồi như nhau.
- Tệp HTML xuất ra chạy offline nên không chịu giới hạn này (đúng ý: chỉ chặn truy cập máy chủ).

## Phân quyền & cách ly tenant

- Mỗi người dùng = 1 tenant. **Mọi** truy vấn dữ liệu theo tenant đi qua `repositories/tenantScope.js` (`tenantClause`, `assertTenantId`) — không ghép chuỗi `tenant_id` thủ công.
- Đọc bài của người khác chỉ khi `status='ready' AND (visibility='public' OR có dòng presentation_shares của chính người gọi)` (`findReadable`, `assets.findReadable`). Không truy cập được → **404** (không lộ tồn tại).
- **Quyền ghi theo vai trò trên bài** (2026-10-07, `05` §4) — service dùng đúng 3 cổng: `owned()` (chỉ chủ: xoá, công khai, mời/gỡ, khôi phục, dàn ý/dựng), `editable()` (chủ + người được mời sửa: lưu spec/tên/tỷ lệ, media, mẫu, handoff; người chỉ xem → 403 `VIEW_ONLY`), `readable()` (xem, tải, nhân bản). Vai trò tính **ở server** từ `tenant_id` + `presentation_shares.role` (`accessRole`) — không bao giờ nhận vai trò từ client.
- Người được mời sửa ghi vào **dòng + tenant của chủ bài** (`updateOwned(row.tenant_id, …)`, asset/tệp dưới `tenants/<chủ bài>/…`) — không tạo dữ liệu trong tenant của người sửa; `assertMedia`/`dropForeignAssets` vẫn chỉ nhận asset thuộc chính bài.
- Mời người theo email: chỉ tài khoản `active`; thông điệp `USER_NOT_FOUND` có thể cho biết email chưa có tài khoản — chấp nhận vì chỉ người đã đăng nhập + là chủ bài ready mới gọi được, kèm rate-limit `share` 60/10 phút/người để chặn dò email hàng loạt; audit mọi lần mời/đổi/gỡ.
- Phiên bản (bản gốc/handoff) chụp **phía máy chủ** từ dòng `presentations` (`INSERT … SELECT`), client chỉ gửi `specVersion` + ghi chú. Khôi phục chuẩn hoá lại spec (lenient) + `dropForeignAssets` trước khi ghi. Giới hạn 5 handoff kiểm trong transaction có `SELECT … FOR UPDATE` (smoke: 6 request song song → đúng 1 bản).
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
| Tệp Office để nhận diện hình (LibreOffice) | `visualService.sanitizeOffice` trước khi mở: bỏ quan hệ `TargetMode="External"` (ảnh/đối tượng liên kết ngoài), trường INCLUDEPICTURE/INCLUDETEXT/LINK/DDE/DDEAUTO, `vbaProject.bin`/activeX, href tuyệt đối / có scheme trong ODF; chạy `soffice --headless` bằng `execFile` (không shell), hồ sơ người dùng tạm riêng mỗi lần, `http(s)_proxy` trỏ `127.0.0.1:9`, timeout, hàng đợi tuần tự; thư mục tạm xoá sau khi xong |
| postMessage `deck:move` / `deck:deco` | Đường dẫn ô chữ qua allowlist `isMovePath`, khoá hoạ tiết qua `DECORS` + `decorsFor(layout)`, số kẹp hữu hạn (±100%, cỡ 0,5–3, hộp 0–100%), thay ảnh chỉ mở bộ chọn ảnh của app (khung không gửi được URL ảnh) |
| Tách nền logo | Chạy local (onnxruntime-node, worker thread, hàng đợi 1 việc, tối đa 5 chờ → 503); không gửi logo ra dịch vụ ngoài; telemetry onnxruntime tắt (`ORT_DISABLE_TELEMETRY=1`) |
| URL | `lib/safeFetch.js`: chỉ http/https, chặn IP private/loopback/link-local/metadata (IPv4 + IPv6, kể cả IPv4-mapped), kiểm IP **lúc kết nối** (chống DNS rebinding), giới hạn redirect + kích thước + thời gian |
| Ảnh trong trang web nguồn (2026-10-14) | URL ảnh lấy từ HTML trang người dùng dán → tải qua **cùng `safeFetch`** (kiểm lại từng URL + từng chuyển hướng, chặn mạng nội bộ); ≤ 5 link/lượt, ≤ `MAX_LINK_IMAGES` ảnh nhận + ứng viên dự phòng, mỗi ảnh ≤ 15 MB / 20 s, 4 song song, cả lượt ≤ 90 s (trong hàng đợi tạo bài + rate-limit `generate`); nhận ảnh khi magic bytes + sharp (`limitInputPixels`) đọc được, rồi chuẩn hoá WebP như ảnh tư liệu. Gửi `Referer` = trang nguồn (không chứa dữ liệu người dùng). **Không** dùng Chromium để mở trang ngoài (Chromium vẫn chặn mọi request mạng). Chữ/alt/chú thích lấy từ trang là **dữ liệu**: mô tả ảnh 1 dòng (bỏ xuống dòng, dấu nháy, ≈ 400 ký tự) — prompt ghi rõ tư liệu không phải chỉ thị |
| Thư mục Google Drive (2026-10-14) | `driveFolder.js` chỉ gọi host cố định `www.googleapis.com/drive/v3/files` qua `safeFetch`; mã thư mục/tệp từ link **và** từ phản hồi Drive kiểm `[\w-]{10,200}` trước khi ghép vào đường dẫn / truy vấn `q` (chặn chèn); `resourcekey` kiểm `[\w-]`. Khoá `GOOGLE_API_KEY` ở query `key=` (không đặt header — `safeFetch` mang header qua chuyển hướng), không có trong thông báo lỗi (test kiểm). Hạn mức như tải tệp lên (≤ 20 tệp, ≤ 300 MB, ảnh ≤ 15 MB, cả lượt ≤ 8 phút, tải tuần tự); lọc loại trước khi tải; mỗi tệp qua bộ đọc tệp tải lên (magic bytes, chống zip-bomb, gỡ liên kết ngoài Office) |
| Nội dung AI | Chỉ nhận JSON theo schema → chuẩn hoá lenient; renderer **escape mọi chuỗi** (`esc`) — có unit test XSS |
| Đường dẫn tệp | `storageService` kiểm regex key, cấm `..`, kiểm đường dẫn tuyệt đối nằm trong thư mục gốc |

## Sandbox xem trước

- `/api/presentations/:id/preview` trả CSP: `sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox` (origin `null` — script trong bài không đọc được cookie/DOM ứng dụng), script/style chỉ chạy với **nonce**, `connect-src 'none'` (không gọi mạng), `frame-ancestors 'self'`.
- iframe phía giao diện cũng đặt `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` — không cấp `allow-same-origin`/fullscreen; video phát ở lớp phủ của app (xem 05 §8). `allow-popups-to-escape-sandbox` (2026-10-12): trang mở từ liên kết trong bài (tab mới, `rel=noopener noreferrer`) chạy bình thường, không thừa hưởng sandbox; bản thân khung vẫn origin `null`.
- Vì iframe không có cookie, ảnh/video dùng **URL ký HMAC** (`lib/signedUrl.js`, khoá = `SESSION_SECRET`, có hạn `exp`) — so sánh chữ ký bằng `timingSafeEqual`.
- Chế độ sửa (`?edit=1`, chủ + người được mời sửa; người chỉ xem bị bỏ qua cờ): khung nhận `deck:render` (HTML slide do renderer dùng chung của **ứng dụng** sinh từ bản nháp — mọi chuỗi đã `esc()`) chỉ từ `window.parent`, chèn bằng `<template>.innerHTML` (script không chạy khi chèn kiểu này; CSP nonce chặn thuộc tính sự kiện). Chiều ngược lại ứng dụng coi khung là **không tin cậy**: đường dẫn trường qua allowlist (`lib/editPaths.js`, map không prototype), toạ độ kẹp số hữu hạn, id phần tử phải có trong bản nháp; máy chủ vẫn chuẩn hoá strict khi lưu.
- Chromium (PDF/thumbnail): chặn mọi request trừ `data:`/`about:blank`; nội dung đã inline sẵn (ảnh, phông, ảnh bìa video).
- Liên kết (`href=` trong `⟦…⟧`, `05` §18): `safeHref` chỉ nhận `http(s)` có tên miền, `mailto:`, `tel:` — chặn `javascript:`/`data:`/tài khoản trong URL/ký tự lạ; kiểm ở cả engine (`okHref`), `editPaths`/`specService` và renderer (`esc()` + `rel="noopener noreferrer"`). Liên hệ (`contact.js`): href chỉ ghép từ chữ số đã kiểm / email đã kiểm / `encodeURIComponent` (địa chỉ); mã QR SVG chỉ gồm toạ độ số. AI chỉ được dùng liên kết/số điện thoại/email/website **có trong tư liệu** — máy chủ đối chiếu (`verifyOutlineFacts`).
- Chữ định dạng từ khung (`⟦…⟧`): thuộc tính chỉ nhận token màu trong `RICH_COLORS`, `#RRGGBB`, `b`, `n`, `href=` (cuối) — sai bất kỳ → cả thẻ thành chữ thường; `richHtml` escape chữ, `style` chỉ ghép từ giá trị đã kiểm (không thể chèn `url(...)`/`;` vào CSS). Máy chủ chuẩn hoá lại khi lưu.

## Mẫu thương hiệu (cô lập tenant)

- `design_templates` riêng tư chỉ chủ đọc; công khai ai đăng nhập cũng đọc/áp được nhưng **chỉ chủ** sửa/xoá (người khác → 404, không 403).
- Lưu mẫu: mọi ảnh trong `design` phải là ảnh của bài nguồn **thuộc người gọi** (`FOREIGN_ASSET`) → chép sang `template_assets` (mã + key mới). Áp mẫu: chép tiếp sang `assets` của bài đích. Không bao giờ tham chiếu tệp của tenant khác; xoá bài/mẫu không ảnh hưởng bên kia.
- Ảnh mẫu đọc qua `/api/templates/assets/:id` có kiểm quyền đọc mẫu (cookie, `Cache-Control: private`), không ký URL.

## Bí mật

- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SESSION_SECRET`, mật khẩu DB chỉ nằm trong `.env` (gitignore). `.env.example` chỉ có placeholder.
- Gọi Gemini bằng header `x-goog-api-key` (không đặt khoá trên URL → không lọt vào log proxy).
- Log `config_loaded` che secret `***`; log HTTP không ghi query string (chứa chữ ký ảnh); audit không ghi mật khẩu/token.
- Lỗi 500 trả thông điệp chung; stack trace chỉ có trong log server.

## Domain công khai — xuất bản ra web (2026-10-12)
- Request có `Host` = `PUBLISH_BASE_URL` đi vào `publicSiteRoutes` (mount ngay sau helmet, **trước** `IP_ALLOWLIST`) và **kết thúc ở đó**: chỉ `/<slug>-<code>`, `/m/<code>/<revision>/<file>`, `/robots.txt`; còn lại 404 — không tới API/SPA/phông, không session/cookie. Domain nội bộ không bao giờ trả trang xuất bản. Cấu hình bắt buộc khác domain `APP_BASE_URL`.
- `Host` do client gửi → cổng Internet (CDN/Nginx vhost công khai) **phải ép Host** = domain công khai; nếu không, người ngoài gửi Host nội bộ sẽ vào luồng nội bộ (còn đăng nhập + `IP_ALLOWLIST`). Ghi rõ trong `docs/DEVOPS-NETWORK.md` §6.3.
- HTML công khai do renderer sinh (mọi dữ liệu qua `esc()`); CSP riêng: `default-src 'none'`, script/style chỉ nonce lưu cùng revision (trang tĩnh, CDN cache được nên nonce cố định), `img/media-src 'self'`, `frame-src` YouTube nocookie, `connect-src 'none'`, `frame-ancestors 'none'`. Không chứa URL ký/`/api/`/id tenant (test tích hợp kiểm). Media trả kèm `CSP: default-src 'none'; sandbox`; tên tệp chỉ khớp `<uuid>.(webp|png|jpg|gif|mp4|webm|mov)`, revision `[0-9a-f]{16}` và phải là revision **đang** công khai.
- Chặn lập chỉ mục (công cụ nội bộ): mọi phản hồi `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex` + `robots.txt` `Disallow: /`.
- Chỉ chủ bài xuất bản/gỡ; admin chỉ thấy bài **đang công khai** (dữ liệu vốn đã công khai) và gỡ được. Audit `presentation.publish|republish|unpublish`, `admin.unpublish`.
- Không giới hạn tần suất theo IP ở domain công khai (nhất quán quyết định chung) → chống lụt từ Internet đặt ở CDN/Nginx.

## Rate limit

**Hạn mức không dựa vào IP** (2026-10-11 F04; 2026-10-12 bỏ hẳn tầng IP theo chủ dự án): người dùng buộc phải ở trong mạng MISA hoặc VPN MISA nên chung 1 IP, và lớp mạng/VPN MISA đã kiểm soát truy cập → không giới hạn theo IP. `api` (sau `loadUser`) chỉ đếm người đã đăng nhập, khoá `u:<userId>` 600/phút (`RATE_LIMIT_USER_PER_MIN`); yêu cầu chưa đăng nhập không đếm. Đăng nhập: 10 lần/15 phút theo email. Các hạn mức nghiệp vụ (tạo bài, ảnh AI, PDF, chia sẻ…) theo `req.user.id`, đều đặt sau `auth`. `IP_ALLOWLIST` là tuỳ chọn kiểm soát truy cập riêng, không phải hạn mức — giữ, mặc định trống.

Xem `04-api-reference.md` — API chung, đăng nhập, tạo bài + dựng bài (bảo vệ hạn mức Gemini), thêm media (video/YouTube/tách nền — bảo vệ đĩa, CPU, gọi ra YouTube; handoff dùng chung bucket này), mời người chia sẻ (`share` — chống dò email), xuất PDF (bảo vệ CPU Chromium). Xuất bản ra web: `publish` 30 lượt/10 phút/người. Thêm giới hạn hàng đợi `MAX_PENDING_JOBS = 20` → 503 (giữ chỗ đồng bộ trước mọi `await` — A03, `09`). Ảnh AI: `aiImage` 40 lượt/10 phút/người + hàng đợi `AI_IMAGES_CONCURRENCY`, quá 12 chờ → 503; tìm ảnh: `imageSearch` 40/phút.

## Nguồn bên ngoài (ảnh Internet)

- Pixabay: khoá `PIXABAY_API_KEY` chỉ ở máy chủ (logger che, không trả client). Nhập ảnh = máy chủ **hỏi lại API theo mã ảnh** rồi tải đúng URL API trả về — không bao giờ tải URL do client gửi (chống SSRF); chỉ nhận `https` + host `pixabay.com`/`cdn.pixabay.com`, `redirect: 'error'`, ≤ 15 MB, rồi chuẩn hoá qua sharp như ảnh tải lên.
- CSP ứng dụng `img-src` thêm `https://pixabay.com https://cdn.pixabay.com` để hiện ảnh xem trước kết quả tìm (`referrerpolicy=no-referrer`).

## Kiểm toán

`audit_logs` ghi: đăng nhập (thành công/thất bại), đổi mật khẩu, tạo/dựng (`presentation.build`)/xoá/nhân bản bài, đổi chế độ chia sẻ, mời/đổi quyền/gỡ người (`presentation.share_*`), người được mời sửa lưu bài (`presentation.shared_edit`, meta `owner`), handoff/xoá handoff/khôi phục, xuất HTML/PDF, xuất bản/cập nhật/gỡ xuất bản ra web, mọi thao tác admin (kể cả `admin.unpublish`, `admin.smoke_cleanup`).

## Trình chiếu từng ý / 3D (2026-10-06)
- Tin `deck:step`/`deck:cmd` vào khung chỉ mang hướng (`±1`) hoặc lệnh trong allowlist (`black`, `esc`) — engine bỏ qua giá trị khác. `deck:slide` gửi ra thêm `step/steps` là số nguyên.
- `slide.build`, `elements[].step`, `logo3d.motion` chỉ nhận giá trị trong allowlist (`BUILDS`, `true`, `LOGO_MOTIONS`); `depth` kẹp 0,1–1; renderer chỉ in giá trị đã chuẩn hoá (qua `esc`).
- Ảnh ký trả `Access-Control-Allow-Origin: *` (không kèm cookie/credentials) để WebGL đọc điểm ảnh logo — quyền vẫn do chữ ký + hạn `exp` quyết định. Ảnh khác nguồn không đọc được (canvas "bẩn") → `createLogo3D` trả null, giữ ảnh phẳng.
- Gói `deck3d.js` nhúng inline có nonce như engine; chuỗi `</script` (nếu có) được thoát khi đọc gói.
