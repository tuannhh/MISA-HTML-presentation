# 07 — Triển khai & hạ tầng

## Cấu hình

Dự án dùng **`.env` + `.env.example`** (không dùng `startup/config.json` như ví dụ trong template). Lý do: docker-compose đọc trực tiếp `.env` cho cả MySQL lẫn app; một nguồn duy nhất cho cả dev (`node --env-file-if-exists=.env`) và Docker (`env_file: .env`). `.env` đã gitignore; `.env.example` chỉ có placeholder.

`src/config/index.js` kiểm tra lúc khởi động (fail-fast) và log `config_loaded` với secret được che `***`.

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `NODE_ENV` | | `development` | `production` trong Docker |
| `PORT` | | 3000 | Cổng Node trong container |
| `APP_PORT` | | 8080 | (compose) cổng mở ra máy chủ → `3000` |
| `APP_BASE_URL` | ✅ (production) | `http://localhost:3000` | URL người dùng truy cập — dùng kiểm Origin (CSRF) |
| `TRUST_PROXY` | | 0 | Số proxy tin cậy (1 khi sau Nginx/Traefik) |
| `SESSION_SECRET` | ✅ | | ≥ 32 ký tự ngẫu nhiên; cũng là khoá HMAC ký URL ảnh |
| `SESSION_COOKIE_SECURE` | | true khi production | `true` khi chạy HTTPS |
| `SESSION_MAX_AGE_HOURS` | | 12 | |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | ✅ | | MySQL |
| `MYSQL_ROOT_PASSWORD` | ✅ (compose) | | Root MySQL container |
| `DB_POOL_SIZE` | | 10 | |
| `GEMINI_API_KEY` | ✅ | | Khoá Gemini — **không bao giờ commit/log** |
| `GEMINI_MODEL` | | `gemini-3.8-flash` | |
| `GEMINI_TIMEOUT_MS` / `GEMINI_BASE_URL` | | 240000 / `https://generativelanguage.googleapis.com/v1beta` | |
| `GEMINI_MEDIA_TIMEOUT_MS` | | 900000 | Lượt chuyển thể ghi âm dài / đọc PDF lớn, tải tệp lên Files API |
| `GOOGLE_API_KEY` | | | Tuỳ chọn, Drive API cho link Google |
| `SELF_REGISTRATION` | | true | |
| `ALLOWED_EMAIL_DOMAINS` | | `misa.com.vn` | Phân tách dấu phẩy; trống = mọi domain |
| `BCRYPT_ROUNDS` | | 12 | |
| `STORAGE_DIR` | | `./data/storage` (dev) / `/data/storage` (Docker) | |
| `TEMP_TTL_MINUTES` | | 60 | Dọn tệp tạm quá hạn |
| `MAX_UPLOAD_MB` / `MAX_IMAGE_UPLOAD_MB` | | 300 / 15 | `MAX_UPLOAD_MB` = **tổng** tệp nguồn 1 lần tạo (và trần tải từ link) |
| `MAX_UPLOAD_FILES` | | 20 | Số tệp nguồn tối đa 1 lần tạo |
| `MAX_SOURCE_CHARS` | | 400000 | Tổng ký tự tư liệu (văn bản + bản chuyển thể) gửi bước dựng bài |
| `MAX_TEXT_CHARS` | | 200000 | |
| `MAX_IMAGES_PER_DECK` | | 60 | Ảnh rút từ tài liệu nguồn |
| `MAX_VIDEO_MB` / `MAX_VIDEOS_PER_DECK` | | 150 / 10 | Video tải lên chèn vào slide (MP4/MOV/WebM) — dung lượng 1 tệp / số video mỗi bài |
| `EXPORT_VIDEO_MB` | | 200 | HTML xuất nhúng video tải lên (base64) khi **tổng** ≤ ngưỡng; vượt → khung ảnh bìa không phát. 0 = không nhúng |
| `ORT_DISABLE_TELEMETRY` | | `1` (Dockerfile) | onnxruntime-node (tách nền logo) bản Linux gửi telemetry về Microsoft → luôn tắt. `cutoutService` cũng tự đặt nếu thiếu |
| `GENERATION_CONCURRENCY` / `RENDER_CONCURRENCY` | | 2 / 2 | Song song AI / Chromium |
| `CHROME_PATH` | | (trống; Docker: `/usr/bin/chromium`) | Dev: trỏ tới Chrome/Edge trên máy |
| `CHROME_NO_SANDBOX` | | false (`.env.example` Docker đặt true) | Xem `09` |

## Môi trường phát triển (Windows/macOS/Linux)

```bash
cp .env.example .env            # điền SESSION_SECRET, DB_PASSWORD, MYSQL_ROOT_PASSWORD, GEMINI_API_KEY
# Với dev local: DB_HOST=127.0.0.1, DB_PORT=3307, NODE_ENV=development, STORAGE_DIR=./data/storage,
# CHROME_PATH trỏ tới Chrome/Edge trên máy, APP_BASE_URL=http://localhost:5173
npm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql
npm run dev:api                  # API http://localhost:3000 (node --watch)
npm run dev                      # Vite http://localhost:5173 (proxy /api, /deck-assets → 3000)
```

> Trên máy phát triển hiện tại `.env` đang trỏ `APP_BASE_URL=http://localhost:8088` cho bản Docker; Origin của Vite (5173) vẫn được chấp nhận vì kiểm tra cả `host` hiện tại qua proxy. Nếu gặp `BAD_ORIGIN` khi dev, đặt `APP_BASE_URL` đúng địa chỉ đang mở.

## Triển khai Docker (1 máy chủ)

```bash
cp .env.example .env            # điền giá trị thật; APP_BASE_URL = URL người dùng truy cập
docker compose up -d --build
docker compose exec app node scripts/create-admin.js admin@misa.com.vn "Quản trị viên"   # in mật khẩu tạm 1 lần
```

- Image `Dockerfile`: `node:24-bookworm-slim` + `chromium` + font Noto/DejaVu + `tini`; build giao diện trong stage build; chạy user `node`; `shm_size: 512mb` cho Chromium.
- onnxruntime-node đóng gói binary mọi nền tảng (~290 MB): Dockerfile xoá hết trừ `linux/<kiến trúc build>` (còn ~25 MB). Build image cho kiến trúc khác (vd. máy Mac arm64 → server amd64) phải `docker buildx build --platform linux/amd64` để `node -p process.arch` ra đúng kiến trúc đích.
- `models/u2netp.onnx` (4.6 MB) được COPY vào image; thiếu tệp → tách nền tự lùi về theo màu nền.
- MySQL 8.4: baseline `startup/database/schema.sql` được mount vào `docker-entrypoint-initdb.d` → **chỉ chạy ở lần tạo volume đầu tiên**. Thay đổi lược đồ sau đó: viết changelog trong `startup/database/changelogs/` và chạy thủ công.
- App lúc khởi động: kiểm tra đủ bảng (`verifyTables`), xử lý bài dở dang (`generating` còn dàn ý → về `outline`; `outlining`/`generating` không dàn ý → `failed`), dọn phiên hết hạn định kỳ.
- **Nâng cấp từ bản trước 2026-10-05 (volume MySQL đã có):** chạy changelog `startup/database/changelogs/changelog_database_20261005_170000.sql` (idempotent) **trước** khi khởi động app mới — `docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < startup/database/changelogs/changelog_database_20261005_170000.sql`.
- Volume: `mysql-data` (DB), `app-data` → `/data` (tệp ảnh, thumbnail, tạm).
- Health: `GET /api/health` (liveness), `GET /api/health/ready` (DB + hàng đợi).
- Cổng: máy dev hiện tại dùng `APP_PORT=8088` vì 8080 đã bị project khác chiếm.

### Reverse proxy Nginx (có sẵn trong repo)

Cấu hình đã kiểm chứng: [`deploy/nginx/default.conf`](../deploy/nginx/default.conf). Chạy kèm compose bằng profile (mặc định **không** bật):

```bash
PROXY_PORT=80 docker compose --profile proxy up -d      # Nginx :PROXY_PORT → app:3000
```

| Thiết lập | Giá trị | Vì sao |
|---|---|---|
| `client_max_body_size` | `310m` (= `MAX_UPLOAD_MB` + 10) | Mặc định Nginx 1 MB → tệp tư liệu bị chặn 413 trước khi tới app. Đổi `MAX_UPLOAD_MB` (hoặc `MAX_VIDEO_MB` lớn hơn) phải đổi số này |
| `proxy_request_buffering off` | | Chuyển luồng upload thẳng tới app: app chặn sớm theo Content-Length, % tải lên trên giao diện đúng thực tế, Nginx không ghi tạm 300 MB ra đĩa |
| `client_body_timeout` / `proxy_read_timeout` / `proxy_send_timeout` | 300s / 600s / 600s | Mạng chậm khi tải 300 MB; xuất PDF bài dài |
| `proxy_set_header Host $http_host` | giữ cả cổng | App so Origin với `protocol://host` (CSRF) và dựng CSP trang xem trước |
| `X-Forwarded-Proto` | giữ của lớp TLS phía trước nếu có (`map`) | `req.protocol` đúng khi TLS kết thúc ở LB |
| `resolver 127.0.0.11` + `server app:3000 resolve` (cần `zone`) | DNS nội bộ Docker, 10s | Build lại app → container đổi IP; không phân giải lại thì proxy 502 tới khi restart Nginx |
| `server_tokens off`, `gzip` (gồm `text/javascript`) | | Ẩn phiên bản; JS 51 KB → 20 KB |

Phía app khi đặt sau proxy: `TRUST_PROXY=1` (2 nếu còn 1 lớp LB/TLS trước Nginx), `APP_BASE_URL` = địa chỉ người dùng truy cập; HTTPS thì `SESSION_COOKIE_SECURE=true`. Production nên chỉ mở cổng proxy ra ngoài (cổng app để nội bộ/firewall).
Nginx cài trên máy chủ (không dùng compose): chép khối `upstream` + `server`, bỏ `resolver`/`zone`/`resolve`, đổi máy chủ upstream thành `127.0.0.1:<APP_PORT>`, thêm `listen 443 ssl` + chứng chỉ.

Đã kiểm chứng qua proxy (2026-10-05): 297 MB (WAV 250 MB + PDF 47 MB) tạo bài thành công trong 75s; 301 MB → app trả 413 JSON sau ~2,5s (luồng không bị Nginx gom lại); 330 MB → Nginx 413 tức thì (giao diện hiện "Tổng dung lượng tệp vượt giới hạn máy chủ cho phép"); đăng nhập/CSRF hoạt động qua proxy; tạo lại container app với IP khác (192.168.112.3 → .5) → proxy vẫn 200 không cần restart.

Tệp nguồn nằm tạm ở `STORAGE_DIR/uploads` (volume) — khởi động xoá sạch, định kỳ xoá tệp > 12 giờ.

## Kiểm thử

| Lệnh | Nội dung |
|---|---|
| `npm test` | Unit (node:test): SSRF, magic bytes, tenantScope, URL ký, chuẩn hoá spec, chống XSS renderer (13 test) |
| `BASE=http://localhost:8088 node test/smoke/smoke.mjs` | Smoke end-to-end trên server đang chạy: đăng ký, CSRF, tạo bài (Gemini thật), cách ly tenant, public/duplicate, lưu + 409, xuất HTML/PDF, admin. In "TẤT CẢ ĐẠT" |
| `npm run render:sample` | Render `test/fixtures/sample-spec.json` (13 layout) ra ảnh để soát giao diện |

## Sao lưu (khuyến nghị — chưa tự động hoá)

- DB: `docker compose exec mysql sh -c 'mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' > backup.sql`
- Tệp: sao lưu volume `app-data`. DB và tệp phải sao lưu **cùng thời điểm** (asset trong DB trỏ tới tệp).

## Chuyển storage sang S3/MinIO (dự kiến)

`storageService` chỉ có các hàm `put/get/remove/removePrefix` theo `storage_key` tương đối → viết adapter S3 cùng giao diện, đổi trong `container.js`. Chưa làm.
