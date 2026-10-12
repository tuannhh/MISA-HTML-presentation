# MISA Presentation — Runbook vận hành (bàn giao DevOps)

Cập nhật: 12/10/2026. Phạm vi: **1 máy chủ, 1 instance app**, Docker Compose (MySQL 8.4 + app Node 24 có Chromium/LibreOffice), cao điểm ~500 người dùng cùng lúc.
Tài liệu liên quan: mạng/IP/domain công khai — [`DEVOPS-NETWORK.md`](DEVOPS-NETWORK.md); số đo tải — [`LOAD-TEST.md`](LOAD-TEST.md); cấu hình chi tiết — `memory-bank/07-deployment-infrastructure.md`.

## 1. Kiến trúc tối thiểu

```
Người dùng (mạng/VPN MISA) ─HTTPS─▶ Cổng vào MISA (TLS) ─▶ Nginx (deploy/nginx, profile proxy) ─▶ app:3000 ─▶ mysql:3306
Internet ─HTTPS─▶ CDN ─▶ vhost công khai (ép Host)  ───────────────────────────────┘   (chỉ trang đã xuất bản — DEVOPS-NETWORK §6)
app ─▶ Gemini API (generativelanguage.googleapis.com), Pixabay/Google (tuỳ tính năng) — DEVOPS-NETWORK §2
```

- Volume: `mysql-data` (DB), `app-data` → `/data/storage` (`private/` = asset, mẫu, bản xuất bản; `temp/`, `uploads/` = tạm).
- Job AI (lập dàn ý, dựng bài) chạy **trong tiến trình app**, hàng đợi trong bộ nhớ: `GENERATION_CONCURRENCY` chạy song song (mặc định 2) + 20 chờ; đầy → `503 QUEUE_FULL` + `Retry-After: 30`. Chỉ đúng với **1 instance** — không scale ngang app khi chưa làm hạng mục C (job bền vững).

## 2. Cấu hình bắt buộc trước production

| Mục | Giá trị | Kiểm chứng |
|---|---|---|
| `NODE_ENV` | `production` (image đặt sẵn) | |
| `SESSION_SECRET` | ≥ 32 ký tự ngẫu nhiên | Thiếu/ngắn → app không khởi động |
| `APP_BASE_URL` | `https://<domain nội bộ>` | Lệch với `SESSION_COOKIE_SECURE` → app không khởi động (test `https-proxy.test.js`) |
| `SESSION_COOKIE_SECURE` | `true` | Cookie `mp.sid`: Secure + HttpOnly + SameSite=Lax |
| `TRUST_PROXY` | số lớp proxy (cổng vào TLS → Nginx → app = **2**) | IP trong audit = IP người dùng; client giả `X-Forwarded-For` không có tác dụng |
| Cổng app | **không** mở ra ngoài; chỉ Nginx | Gọi thẳng app bằng http → không cấp cookie phiên |
| `GEMINI_API_KEY` | khoá dự án Gemini có hạn mức đủ (§7) | |
| `PUBLISH_BASE_URL` | domain công khai (trống = tắt Xuất bản) | DEVOPS-NETWORK §6.5 |
| `PASSWORD_HASH_THREADS` | 2 (mặc định; ≤ số nhân CPU − 1) | Đăng nhập đồng loạt không làm chậm thao tác khác (LOAD-TEST §bcrypt) |
| Giới hạn tài nguyên | đặt `mem_limit` cho app (khuyến nghị ≥ 4 GB, xem LOAD-TEST) và `shm_size: 512mb` (có sẵn) | `scripts/ops/check.sh` báo % RAM theo giới hạn |

## 3. Khởi động / dừng / nâng cấp

```bash
docker compose up -d                                   # khởi động (MySQL healthy rồi mới tới app)
docker compose --profile proxy up -d                   # kèm Nginx
docker compose exec app node scripts/create-admin.js <email> "<Họ tên>"   # admin đầu tiên (in mật khẩu tạm 1 lần)
docker compose stop app                                # dừng app: tự tắt êm ≤ 20 giây (stop_grace_period 30s)
```

**Nâng cấp phiên bản** (thời gian gián đoạn ≈ thời gian app khởi động, ~10–20 giây):

1. Sao lưu (§5) — bắt buộc trước mọi lần nâng cấp.
2. `git pull` → đọc `memory-bank/10-development-history.md` mục mới nhất xem có changelog DB không.
3. Gắn thẻ image đang chạy để rollback: `docker tag misa-presentation:latest misa-presentation:rollback-$(date +%Y%m%d)`.
4. Có changelog mới: chạy **trước** khi bật app mới (idempotent, chỉ thêm — không xoá cột/bảng):
   `docker compose exec -T mysql sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < startup/database/changelogs/<tệp>.sql`
5. `docker compose up -d --build --no-deps app` → chờ `healthy` (`docker compose ps`).
6. Kiểm: `scripts/ops/check.sh` = 0; đăng nhập, mở 1 bài, xuất HTML.

**Rollback**: `docker tag misa-presentation:rollback-<ngày> misa-presentation:latest && docker compose up -d --no-deps app`. Changelog chỉ thêm (cột/bảng mới) nên bản cũ vẫn chạy được trên DB mới; nếu bản mới đã ghi dữ liệu kiểu mới mà bản cũ không đọc được → khôi phục bản sao lưu bước 1 (§5).

**Job đang chạy khi khởi động lại**: mất (hàng đợi trong bộ nhớ). Lúc khởi động app tự xử lý (`recoverStale`): bài đang dựng còn dàn ý → về bước dàn ý (người dùng bấm "Dựng bài" lại); đang lập dàn ý → `failed` (người dùng "Tạo lại"). Nên nâng cấp ngoài giờ cao điểm; xem số job đang chạy: `curl -s localhost:<APP_PORT>/api/health/ready`.

## 4. Giám sát và cảnh báo

| Nguồn | Cách lấy | Ngưỡng cảnh báo (mặc định `scripts/ops/check.sh`) |
|---|---|---|
| Sống / DB | `GET /api/health` (không chạm DB), `GET /api/health/ready` (DB + hàng đợi) | ready ≠ 200 → **CRIT** |
| Hàng đợi AI | `/api/health/ready` → `queue.{active,pending,reserved,avgOutlineSec,avgBuildSec,avgWaitSec,oldestWaitSec,longestRunSec}` | `active+pending` ≥ 15 WARN, = 22 CRIT (đang từ chối); `oldestWaitSec` ≥ 600 WARN; `longestRunSec` ≥ 1200 CRIT (AI treo) |
| Đĩa | `df` trong container app (`/data`) và mysql | ≥ 80% WARN, ≥ 90% CRIT |
| RAM app | `docker stats` | ≥ 85% giới hạn WARN |
| Log (JSON 1 dòng/sự kiện, stdout) | `docker compose logs app` → đẩy về hệ thống log | đếm theo `msg`/`s` bên dưới |

Sự kiện log nên đếm/cảnh báo (trường `msg`):

| `msg` | Ý nghĩa | Gợi ý cảnh báo |
|---|---|---|
| `http` với `s` ≥ 500 | lỗi máy chủ (kèm `id` = `X-Request-Id`) | > 1%/5 phút |
| `http` với `s` = 503 và `p` = `/api/presentations` | hàng đợi AI đầy (`QUEUE_FULL`) | > 0 liên tục 10 phút |
| `unhandled_error` | lỗi không lường trước (có stack) | mọi lần |
| `gemini_http_error` (`status` 429) / `gemini_network_error` | hết hạn mức / mất kết nối Gemini | ≥ 5/5 phút |
| `outline_failed`, `build_failed` | job AI thất bại | tỷ lệ > 10%/giờ |
| `chromium_launch_failed`, `render_failed` | xuất PDF/thumbnail lỗi (trả `503 RENDER_*`) | mọi lần / > 3 lần/10 phút |
| `stale_generations_recovered` | khởi động lại khi đang có job | thông tin |
| `audit_write_failed` | không ghi được nhật ký kiểm toán | mọi lần |

Gắn vào cron/giám sát: `*/5 * * * * APP_URL=http://127.0.0.1:<APP_PORT> /opt/misa-presentation/scripts/ops/check.sh || <gửi cảnh báo>` (mã thoát 0 OK / 1 WARN / 2 CRIT, mỗi dòng 1 kết luận).

## 5. Sao lưu, khôi phục, RPO/RTO

```bash
scripts/ops/backup.sh /srv/backup/misa-presentation        # DB (mysqldump --single-transaction) + tệp private + SHA256SUMS + MANIFEST
scripts/ops/restore.sh /srv/backup/misa-presentation/<stamp> --yes   # GHI ĐÈ: checksum → dừng app → DB → xoá phiên → tệp → bật app → verify
docker compose exec -T app node scripts/verify-storage.js  # kiểm DB ↔ tệp bất kỳ lúc nào (chỉ đọc; thoát 1 nếu thiếu tệp)
```

- DB và tệp **luôn sao lưu cùng một lần** (asset trong DB trỏ tới tệp). Thứ tự DB → tệp: tệp mới ghi trong lúc sao lưu chỉ thừa; tệp bị xoá trong khoảng đó sẽ được `verify-storage.js` báo.
- Khôi phục xoá bảng `sessions` → mọi người đăng nhập lại (không hồi sinh phiên đã đăng xuất sau thời điểm sao lưu).
- **Đề xuất lịch** (đạt RPO ≤ 15 phút, RTO ≤ 60 phút của catalogue OPS-07): `backup.sh` mỗi 15 phút, giữ 96 bản gần nhất (24 giờ) + 1 bản/ngày × 30 ngày; chép bản sao ra máy/kho khác máy chủ (rsync/S3). Dung lượng và thời gian thực tế: diễn tập 12/10/2026 (`LOAD-TEST.md` §4: 577 bài, 3 288 asset — sao lưu ~1 giây, khôi phục + kiểm toàn vẹn **RTO 11 giây**, mất dữ liệu giả lập được phục hồi đủ) — tệp lớn dần theo ảnh/video người dùng → khi `storage.tgz` vượt vài GB nên chuyển phần tệp sang rsync gia tăng (`rsync -a --delete` thư mục volume) và chỉ dump DB 15 phút/lần.
- Diễn tập khôi phục **mỗi quý** trên stack riêng (`-p <tên>`), ghi lại RTO đo được.

## 6. Xử lý sự cố

| Triệu chứng | Kiểm tra | Xử lý |
|---|---|---|
| Người dùng báo "Hệ thống đang xử lý nhiều yêu cầu" (503 `QUEUE_FULL`) | `/api/health/ready` → `active/pending` | Tự hết khi job xong (giao diện báo vị trí + thời gian chờ). Kéo dài: tăng `GENERATION_CONCURRENCY` (3–4) nếu RAM/CPU và hạn mức Gemini cho phép (§7), restart app ngoài giờ |
| Job AI chạy rất lâu (`longestRunSec` lớn), log `gemini_*` lỗi | log `gemini_http_error` (429 = hết hạn mức), `gemini_network_error` | 429: chờ/tăng hạn mức dự án Gemini; mạng: kiểm firewall chiều ra (DEVOPS-NETWORK §2). Job tự thử lại 2 lần rồi báo lỗi cho người dùng — không cần can thiệp |
| Xuất PDF báo "Máy chủ chưa xuất được bài" (503 `RENDER_UNAVAILABLE`/`RENDER_FAILED`) | log `chromium_launch_failed` / `render_failed` | Thường do thiếu RAM/`shm_size` → kiểm `docker stats`; restart app. Trình duyệt tự khởi động lại ở lần sau |
| Thao tác thường lỗi "Hệ thống đang quá tải" (503 `SERVER_BUSY`) | log `server_error` code `SERVER_BUSY`; `docker stats` mysql; số kết nối | Hàng chờ kết nối DB (200) đầy: thường do đột biến ngắn → tự hết. Kéo dài: tăng `DB_POOL_SIZE` (10 → 20, MySQL `max_connections` đủ), kiểm truy vấn chậm |
| Xuất PDF báo "Hệ thống đang xuất nhiều bài" (503 `QUEUE_FULL` ở export.pdf) / `renderPending` cao | `/api/health/ready` → `renderPending`, `thumbnailsPending` | Trình duyệt bận; tự hết. Kéo dài: tăng `RENDER_CONCURRENCY` (mỗi lượt ~200–300 MB RAM Chromium) |
| Đĩa đầy | `check.sh`, `du -sh` trong `/data/storage/private/tenants` | Tăng dung lượng volume; `temp/` tự dọn sau `TEMP_TTL_MINUTES` (60 phút), `uploads/` sau 12 giờ. Không xoá tay trong `private/` (mất ảnh bài) |
| App không lên (`startup_failed`) | `docker compose logs app` | Lỗi cấu hình in rõ tên biến (fail-fast); thiếu bảng → chạy changelog (§3 bước 4) |
| DB không sẵn sàng | `docker compose ps mysql`, log mysql | Khởi động lại mysql; hỏng dữ liệu → khôi phục (§5) |
| Mất ảnh trong bài (ảnh vỡ, `GET /api/assets/:id` lỗi) | `verify-storage.js` | Khôi phục tệp từ bản sao lưu gần nhất (chỉ phần `private/`) |
| Nghi lộ phiên / cần đăng xuất mọi người | | `DELETE FROM sessions` trong MySQL (người dùng đăng nhập lại); đổi `SESSION_SECRET` + restart nếu nghi lộ secret |

## 7. Năng lực và hạn mức (theo đo tải)

Xem số liệu và cách chạy lại trong [`LOAD-TEST.md`](LOAD-TEST.md). Tóm tắt dùng để định cỡ:

- Thao tác thường (danh sách, mở bài, lưu, xem trước, xuất HTML/PDF) ở **500 người ~34 request/giây: 0 lỗi, p95 ≤ 120 ms (PDF p95 2,1 giây), p99 ≤ 1,1 giây; RAM app ≤ 0,7 GB; MySQL CPU ≤ 21%** (LOAD-TEST §2). Đăng nhập đồng loạt: ~5 lần/giây/worker (`PASSWORD_HASH_THREADS`).
- Thông lượng AI ≈ `GENERATION_CONCURRENCY` ÷ (thời gian 1 job). Mỗi bài = 2 job (dàn ý + dựng). Với 2 luồng và Gemini ~40 giây/job → ~3 job/phút ≈ **90 bài/giờ** (khuyến nghị khởi đầu `GENERATION_CONCURRENCY=3` ≈ 135 bài/giờ — LOAD-TEST §3); cao điểm vượt mức này thì người dùng chờ (hiện vị trí) hoặc nhận `QUEUE_FULL`.
- Hạn mức Gemini cần: mỗi bài ≈ 2 lượt gọi model văn bản (+ tối đa `AI_IMAGES_PER_DECK` ảnh nếu bật ảnh AI; + 1 lượt đọc ảnh tư liệu nếu có PDF/PPTX). Đặt hạn mức RPM ≥ `GENERATION_CONCURRENCY` × 3 và theo dõi log 429.
