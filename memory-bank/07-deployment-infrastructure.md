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
| `PUBLISH_BASE_URL` | (DevOps đặt khi bật xuất bản) | rỗng = tắt tính năng | Domain **công khai riêng** cho "Xuất bản ra web" (`https://slides.misa.vn`): chỉ `http(s)://domain`, khác domain `APP_BASE_URL`, sai → không khởi động. Phân luồng theo Host, noindex, header CDN — `docs/DEVOPS-NETWORK.md` §6 (bắt buộc ép Host ở cổng Internet) |
| `IP_ALLOWLIST` | (DevOps điền khi lên server MISA) | rỗng = không giới hạn | IP/dải IP được truy cập (mạng MISA): IP đơn, CIDR, khoảng `a-b`, IPv4/IPv6; phân tách phẩy/khoảng trắng. Mục sai → không khởi động. Rỗng ở production → log cảnh báo `ip_allowlist_empty`. Xem 08 §Giới hạn IP |
| `SESSION_SECRET` | ✅ | | ≥ 32 ký tự ngẫu nhiên; cũng là khoá HMAC ký URL ảnh |
| `SESSION_COOKIE_SECURE` | | true khi production | `true` khi chạy HTTPS. Production **không khởi động** nếu lệch `APP_BASE_URL`: https mà `false`, hoặc http mà `true` |
| `SESSION_MAX_AGE_HOURS` | | 12 | |
| `RATE_LIMIT_USER_PER_MIN` | | 600 | Hạn mức API/phút **theo người dùng** đã đăng nhập. Không có hạn mức theo IP (đã bỏ `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_ANON_PER_MIN` ngày 12/10/2026 — còn trong `.env` cũ thì bị bỏ qua) |
| `DB_HOST/PORT/NAME/USER/PASSWORD` | ✅ | | MySQL |
| `MYSQL_ROOT_PASSWORD` | ✅ (compose) | | Root MySQL container |
| `DB_POOL_SIZE` | | 10 | |
| `GEMINI_PROVIDER` | | `developer-api` | `agent-platform` (khuyến nghị từ 15/10/2026 — Gemini Enterprise Agent Platform, file khoá service account) hoặc `developer-api` (khoá API, rollback). Chi tiết `docs/DEVOPS-AGENT-PLATFORM.md`, rollback `docs/ROLLBACK-GEMINI-API.md` |
| `GOOGLE_APPLICATION_CREDENTIALS` | ✅ khi agent-platform | | Đường dẫn file khoá service account (Docker: tệp override tự đặt `/run/secrets/gcp-agent-platform.json`). File khoá **không bao giờ commit/log/bake vào image** |
| `GCP_KEY_FILE` | ✅ khi Docker + agent-platform | | Đường dẫn file khoá trên máy chủ, chỉ để compose mount (`deploy/agent-platform/docker-compose.agent-platform.yml`) |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | ✅ / | — / `global` | Project phải trùng `project_id` trong file khoá (lệch → không khởi động) |
| `GEMINI_API_KEY` | ✅ khi developer-api | | Khoá Gemini Developer API — **không bao giờ commit/log** |
| `GEMINI_MODEL` | | `gemini-3.8-flash` | |
| `GEMINI_TIMEOUT_MS` / `GEMINI_BASE_URL` | | 240000 / `https://generativelanguage.googleapis.com/v1beta` | `GEMINI_BASE_URL` chỉ dùng cho developer-api (test trỏ AI giả) |
| `GEMINI_MEDIA_TIMEOUT_MS` | | 900000 | Lượt chuyển thể ghi âm dài / đọc PDF lớn, tải tệp lên Files API |
| `GOOGLE_API_KEY` | | | Tuỳ chọn. Drive API v3: **link thư mục Google Drive** (bắt buộc — không có thì link thư mục báo 400) + dự phòng tải Google Docs/Drive. Dự án Google Cloud của khoá phải bật Google Drive API; mạng ra `www.googleapis.com:443` |
| `GEMINI_IMAGE_MODEL` / `GEMINI_IMAGE_SIZE` / `GEMINI_IMAGE_TIMEOUT_MS` | | `gemini-3.1-flash-lite-image` / `1K` / 90000 | Model tạo ảnh (Nano Banana 2 Lite) |
| `AI_IMAGES` | | true | Bật/tắt toàn bộ tính năng ảnh AI (tự tạo khi dựng bài + nút Tạo bằng AI) |
| `AI_IMAGES_PER_DECK` / `AI_IMAGES_CONCURRENCY` | | 6 / 3 | Số ảnh AI tự tạo tối đa khi dựng 1 bài / số ảnh tạo song song |
| `PIXABAY_API_KEY` | (để tìm ảnh) | | Khoá Pixabay — **không commit/log**; thiếu → tìm ảnh trả 503 |
| `PIXABAY_BASE_URL` | | `https://pixabay.com/api/` | |
| `BCRYPT_ROUNDS` | | 12 | |
| `PASSWORD_HASH_THREADS` | | 2 | Số worker_threads băm/so bcrypt (1–8) — luồng chính không bị chặn khi nhiều người đăng nhập cùng lúc |
| `STORAGE_DIR` | | `./data/storage` (dev) / `/data/storage` (Docker) | |
| `TEMP_TTL_MINUTES` | | 60 | Dọn tệp tạm quá hạn (cũng là trần sống của bản xuất chờ tải `export-*` trong `STORAGE_DIR/temp`; kho bản xuất tự hết hạn sau 15 phút không dùng — `05` §23) |
| `MAX_UPLOAD_MB` / `MAX_IMAGE_UPLOAD_MB` | | 300 / 15 | `MAX_UPLOAD_MB` = **tổng** tệp nguồn 1 lần tạo (và trần tải từ link) |
| `MAX_UPLOAD_FILES` | | 20 | Số tệp nguồn tối đa 1 lần tạo |
| `MAX_SOURCE_CHARS` | | 400000 | Tổng ký tự tư liệu (văn bản + bản chuyển thể) gửi bước dựng bài |
| `MAX_TEXT_CHARS` | | 200000 | |
| `MAX_IMAGES_PER_DECK` | | 60 | Ảnh rút từ tài liệu nguồn |
| `MAX_SOURCE_LINKS` | | 5 | Số đường link tối đa mỗi lần tạo bài (1–10) |
| `MAX_LINK_IMAGES` | | 24 | Tổng ảnh lấy từ các trang web nguồn (chia đều giữa các link, ≤ `MAX_IMAGES_PER_DECK`); `0` = chỉ lấy chữ (`05` §20) |
| `MAX_VIDEO_MB` / `MAX_VIDEOS_PER_DECK` | | 150 / 10 | Video tải lên chèn vào slide (MP4/MOV/WebM) — dung lượng 1 tệp / số video mỗi bài |
| `MAX_CREATE_MEDIA` | | 20 | Số ảnh/video gửi kèm tối đa khi tạo bài (luôn được đưa vào bài) |
| `PDF_UI_SHOTS` | | true | Nhận diện + cắt **sơ đồ** và **ảnh giao diện phần mềm** từ tư liệu nguồn để đưa vào bài (tên biến giữ từ bản cũ) |
| `PDF_UI_SHOT_PAGES` | | 40 | Tổng số trang tư liệu (PDF + PPTX/DOCX đã render) được xem để tìm hình |
| `PDF_UI_SHOTS_MAX` | | 24 | Số hình (sơ đồ + giao diện) tối đa cắt mỗi lần tạo |
| `PDFTOPPM_PATH` | | pdftoppm | Đường dẫn poppler `pdftoppm` (Docker cài `poppler-utils`; thiếu → bỏ qua bước cắt ảnh) |
| `PDFTOTEXT_PATH` | | pdftotext | Poppler `pdftotext` (cùng gói `poppler-utils`): chữ PDF để đối chiếu liên kết/thông tin liên hệ AI đưa vào bài với nguồn. Thiếu → chỉ đối chiếu với chữ không phải PDF + liên kết `/URI` trong PDF (log `source_pdf_text_failed`) |
| `OFFICE_VISUALS` | | true | Render PPTX/DOCX/ODP/ODT bằng LibreOffice để nhận diện hình như PDF; false → chỉ PDF |
| `SOFFICE_PATH` | | soffice | Đường dẫn LibreOffice (Docker cài `libreoffice-*-nogui`; thiếu → bỏ qua tệp Office, log `soffice_missing`) |
| `OFFICE_RENDER_TIMEOUT_MS` | | 120000 | Thời gian tối đa chuyển 1 tệp Office → PDF (10 000–600 000) |
| `EXPORT_VIDEO_MB` | | 200 | HTML xuất nhúng video tải lên (base64) khi **tổng** ≤ ngưỡng; vượt → khung ảnh bìa không phát. 0 = không nhúng |
| `ORT_DISABLE_TELEMETRY` | | `1` (Dockerfile) | onnxruntime-node (tách nền logo) bản Linux gửi telemetry về Microsoft → luôn tắt. `cutoutService` cũng tự đặt nếu thiếu |
| `GENERATION_CONCURRENCY` / `RENDER_CONCURRENCY` | | 2 / 2 | Song song AI / Chromium |
| `CHROME_PATH` | | (trống; Docker: `/usr/bin/chromium`) | Dev: trỏ tới Chrome/Edge trên máy |
| `CHROME_NO_SANDBOX` | | false (`.env.example` Docker đặt true) | Xem `09` |

## Môi trường phát triển (Windows/macOS/Linux)

```bash
cp .env.example .env            # điền SESSION_SECRET, DB_PASSWORD, MYSQL_ROOT_PASSWORD + Gemini (GOOGLE_APPLICATION_CREDENTIALS/GOOGLE_CLOUD_PROJECT hoặc GEMINI_API_KEY)
# Với dev local: DB_HOST=127.0.0.1, DB_PORT=3307, NODE_ENV=development, STORAGE_DIR=./data/storage,
# CHROME_PATH trỏ tới Chrome/Edge trên máy, APP_BASE_URL=http://localhost:5173
npm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql
npm run dev:api                  # API http://localhost:3000 (node --watch)
npm run dev                      # Vite http://localhost:5173 (proxy /api, /deck-assets → 3000)
```

**Công cụ ngoài cho dev local** (Docker image đã có sẵn — chỉ cần khi chạy API/test ngoài Docker; thiếu thì app tự bỏ qua bước tương ứng):
- Poppler (`pdftoppm` render trang PDF để cắt sơ đồ/ảnh giao diện; `pdftotext` đối chiếu liên kết/liên hệ trong PDF):
  Windows `winget install --id oschwartz10612.Poppler --exact` (bản zip portable, thêm `…\WinGet\Packages\oschwartz10612.Poppler_…\poppler-<ver>\Library\bin` vào PATH người dùng — mở shell mới mới nhận);
  macOS `brew install poppler`; Debian/Ubuntu `apt-get install poppler-utils`. Kiểm: `pdftoppm -v`.
- LibreOffice (`soffice`, render PPTX/DOCX/ODP/ODT) — tuỳ chọn; thiếu → log `soffice_missing`, chỉ PDF được nhận diện hình.
- Máy chủ cài không qua Docker: cài `chromium poppler-utils` + LibreOffice headless + phông như `Dockerfile` (dòng `apt-get install`).

> Trên máy phát triển hiện tại `.env` đang trỏ `APP_BASE_URL=http://localhost:8088` cho bản Docker; Origin của Vite (5173) vẫn được chấp nhận vì kiểm tra cả `host` hiện tại qua proxy. Nếu gặp `BAD_ORIGIN` khi dev, đặt `APP_BASE_URL` đúng địa chỉ đang mở.

## Triển khai Docker (1 máy chủ)

```bash
cp .env.example .env            # điền giá trị thật; APP_BASE_URL = URL người dùng truy cập
docker compose up -d --build
docker compose exec app node scripts/create-admin.js admin@misa.com.vn "Quản trị viên"   # in mật khẩu tạm 1 lần
```

- Image `Dockerfile`: `node:24-bookworm-slim` + `chromium` + `poppler-utils` + LibreOffice headless (impress/writer nogui, phông Carlito/Caladea/Liberation — image ~2,03 GB) + font Noto/DejaVu + `tini`; build giao diện trong stage build (`npm run build` = vite + `scripts/build-deck3d.mjs` → `dist/deck-runtime/deck3d.js`, stage build phải COPY script này); chạy user `node`; `shm_size: 512mb` cho Chromium.
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
Hướng dẫn mạng cho DevOps (giới hạn IP, `TRUST_PROXY`, danh sách tên miền chiều ra, checklist): [`docs/DEVOPS-NETWORK.md`](../docs/DEVOPS-NETWORK.md) — thêm/bớt lời gọi ra ngoài thì cập nhật tệp này.
Giới hạn IP mạng MISA (`IP_ALLOWLIST`) làm ở **ứng dụng**; `default.conf` có sẵn khối `allow/deny` (comment) nếu DevOps muốn chặn thêm ở Nginx — khi đó giữ 2 danh sách khớp nhau.
Nginx cài trên máy chủ (không dùng compose): chép khối `upstream` + `server`, bỏ `resolver`/`zone`/`resolve`, đổi máy chủ upstream thành `127.0.0.1:<APP_PORT>`, thêm `listen 443 ssl` + chứng chỉ.

Đã kiểm chứng qua proxy (2026-10-05): 297 MB (WAV 250 MB + PDF 47 MB) tạo bài thành công trong 75s; 301 MB → app trả 413 JSON sau ~2,5s (luồng không bị Nginx gom lại); 330 MB → Nginx 413 tức thì (giao diện hiện "Tổng dung lượng tệp vượt giới hạn máy chủ cho phép"); đăng nhập/CSRF hoạt động qua proxy; tạo lại container app với IP khác (192.168.112.3 → .5) → proxy vẫn 200 không cần restart.

Tệp nguồn nằm tạm ở `STORAGE_DIR/uploads` (volume) — khởi động xoá sạch, định kỳ xoá tệp > 12 giờ.

## Kiểm thử

| Lệnh | Nội dung |
|---|---|
| `npm test` | Unit (node:test): SSRF, magic bytes, tenantScope, URL ký, chuẩn hoá spec, chống XSS renderer, hàng đợi, jobTracker, passwordHasher, lỗi trình duyệt… (232 test; test `extractVisuals` tự skip khi máy thiếu `pdftoppm`) |
| `BASE=http://localhost:8088 node test/smoke/smoke.mjs` | Smoke end-to-end trên server đang chạy: admin cấp tài khoản, CSRF, tạo bài (Gemini thật), cách ly tenant, public/duplicate, lưu + 409, xuất HTML/PDF, admin. In "TẤT CẢ ĐẠT" |
| `npm run test:integration` | MySQL thật, DB tạm tên duy nhất/tệp (`IT_DB_*`, xem `test/integration/README.md`): race SQL, changelog idempotent, phục hồi bản sao (A04), công khai + bản gốc (A06), dọn smoke (A01), **xuất bản** (publish/cập nhật/gỡ/đồng thời/STALE/admin). Không dựng được DB → FAIL (trừ `IT_OPTIONAL=1`) |
| `SMOKE_BOOTSTRAP=1 BASE=http://localhost:<APP_PORT> node test/smoke/smoke.mjs` | Smoke trên **compose project riêng** (không chạy vào stack có dữ liệu): tự tạo admin `smoke-admin-<stamp>` mật khẩu ngẫu nhiên, dọn tài khoản `smoke-*-<stamp>` trong `finally` (`scripts/smoke-cleanup.js`). Có sẵn admin → `SMOKE_ADMIN_EMAIL/PASSWORD` (tài khoản tạo ra chỉ bị khoá) |
| `npm run test:integration` — `flows-auth` / `flows-deck` / `flows-share` / `https-proxy` | (2026-10-12, roadmap B) Luồng chính qua **HTTP thật** + MySQL thật, AI giả (`test/helpers/fakeGemini.mjs`, server HTTP qua `GEMINI_BASE_URL`, điều khiển độ trễ/lỗi). Harness `helpers/httpApp.mjs` (`useHttpApp`): đăng nhập/khoá/đổi mật khẩu/CSRF/rate-limit theo email; dàn ý → dựng, 409 phiên bản, lỗi AI → về dàn ý; cách ly tenant (404 trên 9 endpoint); chia sẻ/handoff/restore; media ký URL; mẫu thiết kế; xuất HTML/PDF (Chrome thật); publish theo Host; hàng đợi đầy 503 + `Retry-After`; cổng vào HTTPS → cookie `Secure`, IP audit đúng. 43 test, ~30 giây |
| `test/load/provision.mjs` + `test/load/load.mjs` | Đo tải 500 người trên stack riêng `deploy/loadtest` (project `mp-load`, image `:loadtest`, AI giả). Cách chạy + kết quả: `docs/LOAD-TEST.md` |
| `npm run render:sample` | Render `test/fixtures/sample-spec.json` (14 layout) ra ảnh để soát giao diện |

## Sao lưu / khôi phục / giám sát (2026-10-12 — `scripts/ops/`, chi tiết `docs/RUNBOOK.md`)

- `scripts/ops/backup.sh <thư-mục>`: `mysqldump --single-transaction` (chạy trong container mysql, mật khẩu lấy từ env container — không in ra) nén gzip + tar thư mục `private` của volume, `SHA256SUMS` + `MANIFEST` (thời gian, kích thước). DB và tệp lấy **cùng lượt**.
- `scripts/ops/restore.sh <thư-mục> --yes`: kiểm checksum → dừng app → nạp DB → xoá `sessions` (buộc đăng nhập lại) → thay `private` → bật app, chờ healthy → `node scripts/verify-storage.js` (DB ↔ tệp khớp) → in thời gian từng bước (RTO).
- `scripts/ops/check.sh`: kiểu Nagios (0 OK/1 WARN/2 CRIT) — ready, hàng đợi (≥15 WARN, ≥22 CRIT), job chờ ≥ 600 s, job chạy ≥ 1200 s, đĩa 80/90%, RAM 85%.
- Biến: `PROJECT` (compose project), `COMPOSE_FILES`. Trên Git Bash script tự đặt `MSYS_NO_PATHCONV=1`.

## Chuyển storage sang S3/MinIO (dự kiến)

`storageService` chỉ có các hàm `put/get/remove/removePrefix` theo `storage_key` tương đối → viết adapter S3 cùng giao diện, đổi trong `container.js`. Chưa làm.
