# Đo tải 500 người + diễn tập sao lưu/khôi phục (roadmap B, Gate DevOps)

Đo ngày 12/10/2026 trên máy dev Windows (Docker Desktop, 1 container app không giới hạn CPU/RAM, MySQL 8.4 cùng máy).
AI là **Gemini giả** (`test/helpers/fakeGemini.mjs`) trả lời sau 30–50 giây như Gemini thật đo được — số liệu phần AI
là thông lượng **hàng đợi**, không phải chất lượng/thời gian của Gemini thật.

## 1. Cách chạy lại

Stack riêng — không đụng stack đang có dữ liệu (`misa-presentation-*`), image tag riêng (`:loadtest`) để không ghi đè `:latest`.

```bash
docker build -t misa-presentation:loadtest .
APP_PORT=8093 docker compose -p mp-load -f docker-compose.yml -f deploy/loadtest/docker-compose.loadtest.yml up -d
node test/load/provision.mjs --base http://localhost:8093 --users 500 --out <ngoài-repo>/load-users.json   # ~9 phút
node test/load/load.mjs --users <ngoài-repo>/load-users.json --vus 500 --ramp 300 --steady 600 --think 10 --burst 100 --fault 120 --out <ngoài-repo>/ket-qua.json
docker compose -p mp-load -f docker-compose.yml -f deploy/loadtest/docker-compose.loadtest.yml down -v
```

Kịch bản mỗi người ảo: đăng nhập → lặp {nghĩ 5–15 giây → 1 thao tác}: danh sách 30% · mở bài 25% · xem trước 15% · lưu 18% ·
xuất HTML 1% · xuất PDF 0,2% · tạo bài AI 0,3% (dàn ý → dựng, hỏi trạng thái 3 giây/lần như giao diện) · còn lại mẫu/tài khoản.
Giữa pha ổn định: **burst** 100 người cùng đăng nhập + bấm "Tạo bài"; **20 client chậm** tải HTML xuất; **Gemini trả 429** trong 120 giây.

Giới hạn: pha ổn định 10 phút (roadmap đề xuất 1 giờ — chưa chạy soak dài; RAM sau sửa ổn định 0,5–0,7 GB suốt lượt đo, xem §3).

## 2. Kết quả — trước và sau khi sửa (500 người, ~34 request/giây)

| Thao tác | Trước: p50 / p95 / p99 (ms) | Trước: lỗi | **Sau: p50 / p95 / p99 (ms)** | **Sau: lỗi** |
|---|---|---|---|---|
| Mở bài | 9 / 153 / 9 978 | 0,27% (500) | 12 / 61 / 442 | 0 |
| Danh sách | 8 / 150 / 10 306 | 0,33% (500) | 11 / 58 / 622 | 0 |
| Lưu | 11 / 23 / 234 | 0,05% (500) | 14 / 60 / 424 | 0 |
| Xem trước | 9 / 139 / 7 992 | 0,31% (500) | 12 / 55 / 312 | 0 |
| Hỏi trạng thái job | 11 / 28 / 78 | 0,03% | 12 / 35 / 147 | 0 |
| Đăng nhập | 257 / 12 113 / 15 057 | 3,87% (500) | 245 / 7 736 / 10 378 | 0 |
| Xuất HTML | 15 / 149 / 11 043 | 0 | 23 / 117 / 322 | 0 |
| Xuất HTML, client chậm | 2 744 / 2 985 | 30% | 2 444 / 2 636 | 0 |
| **Xuất PDF** | **180 005** (hết giờ) | **87,7%** | **1 160 / 2 106 / 4 924** | **0** |
| Tạo bài khi hàng AI đầy | — | 503 `QUEUE_FULL` | 57 / 96 / 195 | 503 `QUEUE_FULL` (đúng thiết kế) |

| Tài nguyên app | Trước | Sau |
|---|---|---|
| RAM | 0,4 → **2,8 GB** (tăng liên tục) | 0,5 → **0,7 GB** tối đa, về 0,52 GB sau tải |
| CPU | TB 210%, max 350%; còn **200% suốt 20 phút sau khi hết tải** | TB 188%, max 384%; về 0% ngay sau khi xả hàng |
| MySQL | CPU max 21%, RAM 0,48 GB | như trước — **DB không phải nút cổ chai** |

### Ba lỗi đo tải phát hiện và đã sửa

1. **Hàng chụp ảnh bìa không trần** (gốc của PDF hết giờ + RAM phình): mỗi lần lưu tạo 1 lượt chụp ảnh bìa trong hàng
   trình duyệt, HTML nhúng phông (vài MB) dựng sẵn trước khi chờ. Lưu ~4 lần/giây > sức chụp ~2,4 ảnh/giây → hàng nghìn
   lượt chờ; xuất PDF (cùng hàng, FIFO) chờ > 180 giây. Sửa: ảnh bìa vào hàng **gộp theo bài, chạy lần lượt**
   (`src/lib/coalescingQueue.js`), HTML dựng khi tới lượt; PDF chờ tối đa 1 ảnh bìa; hàng xuất PDF có trần 10 → 503 `QUEUE_FULL`.
2. **bcrypt chặn luồng chính**: 210 ms CPU/lần đăng nhập trên luồng chính; burst 100 người đăng nhập = ~21 giây đứng hình
   cho mọi request. Sửa: băm/so trên worker_threads (`src/lib/passwordHasher.js`, `PASSWORD_HASH_THREADS=2`), định dạng hash giữ nguyên.
3. **Hàng chờ kết nối DB đầy → 500**: hệ quả của (2) — request dồn khi luồng chính đứng vượt 200 chỗ chờ của pool.
   Sau khi sửa (2) không còn xảy ra; phòng xa vẫn đổi thành 503 `SERVER_BUSY` + `Retry-After`.

Đăng nhập p95 7,7 giây (sau sửa) là do **burst 100 người đăng nhập cùng giây**: 2 worker × ~5 lần/giây ≈ 10 lần/giây → người
thứ 100 chờ ~10 giây; các thao tác khác không bị ảnh hưởng. Đăng nhập rải trong 5 phút (pha tăng dần) p50 245 ms.
Máy chủ ≥ 4 nhân có thể đặt `PASSWORD_HASH_THREADS=3–4`.

## 3. Hàng đợi AI và chọn `GENERATION_CONCURRENCY`

- Kịch bản sinh ~9 yêu cầu tạo bài/phút (0,3% thao tác × 500 người) = ~18 job/phút, gấp ~6 lần sức 2 luồng (~3 job/phút với
  job 30–50 giây) → hàng luôn đầy (22/22), burst 100 người nhận **100% `QUEUE_FULL` trong ≤ 61 ms** (không treo, không bài rác).
  Thời gian từ bấm tạo tới có dàn ý p50 ~400 giây (chờ hàng + chạy). Giao diện hiện vị trí + thời gian dự kiến (§`JobProgress`).
- Gemini trả 429 trong 120 giây: job thử lại rồi báo lỗi cho người dùng (2 job lỗi, bài về trạng thái cho thử lại); hồi phục tự động
  khi Gemini bình thường lại, không cần khởi động lại.
- Job AI chủ yếu **chờ mạng** — CPU/RAM app không tăng theo số job chờ. Thông lượng ≈ `GENERATION_CONCURRENCY` × 45 bài/giờ.
  **Khuyến nghị:** production bắt đầu với `GENERATION_CONCURRENCY=3` (~135 bài/giờ), tăng 4 khi hạn mức Gemini (RPM ≥ 3 × số luồng,
  §7 RUNBOOK) và RAM cho phép; theo dõi `avgWaitSec`/`QUEUE_FULL`. Lưu ý: AI giả không mô phỏng phần nặng thật của job
  (đọc PDF/PPTX qua LibreOffice, ghi âm lớn) — tăng luồng thì đặt `mem_limit` ≥ 4 GB và quan sát RAM tuần đầu.

## 4. Diễn tập sao lưu + khôi phục (stack đo tải, 501 người dùng, 577 bài, 3 288 asset)

| Bước | Kết quả |
|---|---|
| `scripts/ops/backup.sh` | DB 0,8 MB gzip (< 1 giây) + tệp 8,5 MB (1 giây), có `SHA256SUMS` + `MANIFEST` |
| Gây mất dữ liệu | xoá 10 bài trong DB + 20 tệp ảnh → `verify-storage.js`: **THIẾU 20 tệp** |
| `scripts/ops/restore.sh <bản> --yes` | checksum OK → dừng app → nạp DB → xoá phiên → thay tệp → bật app → `verify-storage.js`: **577 bài, 3 288 asset, thiếu 0** |
| RTO đo được | **11 giây** (dữ liệu nhỏ); sau khôi phục đăng nhập + xuất PDF bình thường |

Dữ liệu thật lớn hơn chủ yếu ở **tệp** (ảnh/video người dùng): ước tính tar + giải nén ~50–100 MB/giây trên đĩa SSD → 10 GB ≈ 2–4 phút,
vẫn trong RTO ≤ 60 phút. Lịch đề xuất (RPO ≤ 15 phút) và cách chép ra ngoài máy: RUNBOOK §5.

## 5. Còn lại cho DevOps / lần đo sau

- Soak 1 giờ+ trên máy chủ thật (cùng cấu hình CPU/RAM production, có `mem_limit`), đo lại bảng §2.
- Bộ vàng ~10 tư liệu MISA với **Gemini thật** để đo thời gian job thật + hạn mức, chốt `GENERATION_CONCURRENCY`.
- Ảnh bìa dưới tải cao trễ vài phút (chạy lần lượt — việc nền, không chặn người dùng); `thumbnailsPending` cao kéo dài → tăng `RENDER_CONCURRENCY`.
