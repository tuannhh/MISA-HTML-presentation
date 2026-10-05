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
- MySQL 8.4: baseline `startup/database/schema.sql` được mount vào `docker-entrypoint-initdb.d` → **chỉ chạy ở lần tạo volume đầu tiên**. Thay đổi lược đồ sau đó: viết changelog trong `startup/database/changelogs/` và chạy thủ công.
- App lúc khởi động: kiểm tra đủ bảng (`verifyTables`), đánh `failed` các bài `generating` dở dang, dọn phiên hết hạn định kỳ.
- Volume: `mysql-data` (DB), `app-data` → `/data` (tệp ảnh, thumbnail, tạm).
- Health: `GET /api/health` (liveness), `GET /api/health/ready` (DB + hàng đợi).
- Cổng: máy dev hiện tại dùng `APP_PORT=8088` vì 8080 đã bị `misa-flipbook-proxy` chiếm.

### Sau reverse proxy HTTPS

Đặt `TRUST_PROXY=1`, `SESSION_COOKIE_SECURE=true`, `APP_BASE_URL=https://…`. Proxy cần cho phép body ≥ `MAX_UPLOAD_MB` + 4MB (Nginx: `client_max_body_size 310m`), timeout đủ cho tải 300MB và xuất PDF. Tệp nguồn nằm tạm ở `STORAGE_DIR/uploads` (volume) — khởi động xoá sạch, định kỳ xoá tệp > 12 giờ.

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
