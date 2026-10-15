# Rollback — từ Agent Platform về Gemini Developer API (API key)

Dùng khi Gemini qua Agent Platform gặp sự cố kéo dài và chưa xử lý được theo `DEVOPS-AGENT-PLATFORM.md` §7. Ví dụ: khoá service account bị
thu hồi, project hết quota, Google lỗi diện rộng, tường lửa chưa mở được `aiplatform.googleapis.com`.

Bản này **không có changelog DB**: chuyển qua lại hai chiều không đụng dữ liệu, không cần khôi phục bản sao lưu.

## 0. Chọn cách rollback

| Tình huống | Cách | Build lại? | Gián đoạn |
|---|---|---|---|
| Lỗi nằm ở phía Google/khoá/quota/mạng; code mới chạy bình thường | **A. Đổi cấu hình** — giữ image hiện tại, chuyển `GEMINI_PROVIDER=developer-api` | Không | ~10–20 giây (app khởi động lại) |
| Nghi lỗi do chính code mới (ví dụ chia tệp ghi âm/PDF sai, lỗi lúc khởi động) | **B. Về image cũ** — image gắn thẻ trước khi nâng cấp (RUNBOOK §3) | Không | ~10–20 giây |

Cả hai cách đều cần **Gemini API key** còn hiệu lực, lấy từ kho secret của MISA (không gửi qua email/chat).
Kiểm key trước khi đổi: mục 3, bước 1.

## 1. Chuẩn bị (cả A và B)

1. Xin `GEMINI_API_KEY` từ người giữ khoá. Key phải thuộc project có bật Generative Language API.
2. Mở HTTPS ra `generativelanguage.googleapis.com` (`DEVOPS-NETWORK.md` §2). Đường này đã dùng trước 15/10/2026, thường vẫn còn mở.
3. Xem job đang chạy: `curl -s localhost:<APP_PORT>/api/health/ready` → `active/pending`. Job đang chạy sẽ mất khi app khởi động lại
   (RUNBOOK §3 "Job đang chạy khi khởi động lại"), nên đợi về 0 hoặc làm ngoài giờ cao điểm.
4. Sao lưu `.env` hiện tại: `cp .env .env.bak-$(date +%Y%m%d%H%M)` rồi `chmod 600` bản sao.

## 2A. Rollback bằng cấu hình (giữ image hiện tại)

Sửa `.env` trên máy chủ:

```dotenv
GEMINI_PROVIDER=developer-api
GEMINI_API_KEY=<key lấy từ kho secret>
# Bỏ (xoá hoặc thêm # đầu dòng) dòng COMPOSE_FILE kèm tệp override agent-platform, nếu có:
# COMPOSE_FILE=docker-compose.yml:deploy/agent-platform/docker-compose.agent-platform.yml
```

Rồi chạy với **chỉ** tệp compose gốc:

```bash
docker compose -f docker-compose.yml up -d --no-deps app
```

> **Bắt buộc bỏ tệp override.** Tệp `deploy/agent-platform/docker-compose.agent-platform.yml` đặt `GEMINI_PROVIDER: agent-platform` trong
> `environment:`. Docker Compose ưu tiên `environment:` hơn `.env`, nên nếu còn tệp override thì app **vẫn** chạy agent-platform, dù `.env` đã
> ghi `developer-api`. Còn `COMPOSE_FILE` trong `.env` thì mọi lệnh `docker compose …` sau này (không có `-f`) sẽ tự kèm lại tệp override.

Các biến `GOOGLE_*` và `GCP_KEY_FILE` có thể giữ nguyên trong `.env`; app bỏ qua chúng khi `GEMINI_PROVIDER=developer-api`.
File khoá trên máy chủ cũng giữ nguyên, để chuyển lại sau.

## 2B. Rollback về image cũ

Dùng thẻ image đã gắn ở RUNBOOK §3 bước 3 trước khi nâng cấp:

```bash
docker tag misa-presentation:rollback-<ngày> misa-presentation:latest
# .env: đặt GEMINI_API_KEY và bỏ dòng COMPOSE_FILE (như 2A)
docker compose -f docker-compose.yml up -d --no-deps app
```

Image cũ (trước 15/10/2026) không biết các biến `GEMINI_PROVIDER` / `GOOGLE_*` và luôn dùng `GEMINI_API_KEY`.
Không có thẻ image cũ: build từ mã nguồn `main` trước khi gộp nhánh agent-platform (`git checkout 8d9ff70`), rồi chạy `docker compose -f docker-compose.yml up -d --build --no-deps app`.

## 3. Kiểm tra sau rollback

1. Key hợp lệ (gửi key trong header, không đặt trên URL):
   `curl -s -o /dev/null -w '%{http_code}\n' -H "x-goog-api-key: $GEMINI_API_KEY" https://generativelanguage.googleapis.com/v1beta/models`
   → `200`. `400`/`403` = key sai, hết hạn hoặc API chưa bật.
2. `docker compose ps` → app `healthy`. `docker compose logs app | grep config_loaded` → `"provider":"developer-api"`.
   App thoát với `Thiếu GEMINI_API_KEY` → `.env` chưa có key.
3. `docker compose exec app printenv GEMINI_PROVIDER` → `developer-api`. Vẫn thấy `agent-platform` → tệp override còn được nạp (xem lưu ý ở 2A).
4. `scripts/ops/check.sh` = 0.
5. Tạo 1 bài từ văn bản ngắn → dàn ý → dựng bài → xuất HTML. Log có `gemini_outline_done` / `gemini_design_done`.
   Thử thêm 1 bài có tệp PDF để kiểm luồng tư liệu.

## 4. Khác biệt khi chạy Developer API

- Tư liệu lớn lại đi qua **Files API** (tải tệp lên Google trước, xoá sau khi dùng). Ghi âm nén trên 48 MB lại dùng được (không còn `AUDIO_TOO_LARGE`).
- Mỗi request inline tối đa ~20 MB. App tự chọn đường đi, người dùng không phải làm gì.
- Hạn mức và chi phí tính theo project của API key, không theo `prapplication-479309`.
- Có log `gemini_retry` (tạm thời) và `gemini_http_error` (lỗi). `google_token_*` không còn xuất hiện.

## 5. Chuyển lại sang Agent Platform

Khi sự cố đã hết, làm theo `DEVOPS-AGENT-PLATFORM.md` §4:

1. Đặt `GEMINI_PROVIDER=agent-platform`. Có thể bật lại dòng `COMPOSE_FILE` nếu trước đó dùng.
2. Chạy `docker compose -f docker-compose.yml -f deploy/agent-platform/docker-compose.agent-platform.yml up -d --no-deps app`.
3. Kiểm theo `DEVOPS-AGENT-PLATFORM.md` §6.
4. Xoá `GEMINI_API_KEY` khỏi `.env` nếu không cần giữ để rollback nhanh. Nếu key đã bị chia sẻ rộng trong lúc xử lý sự cố, đề nghị người giữ
   khoá thu hồi nó.
