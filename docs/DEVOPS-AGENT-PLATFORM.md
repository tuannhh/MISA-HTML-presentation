# DevOps — Gemini qua Gemini Enterprise Agent Platform (file khoá service account)

Áp dụng từ 15/10/2026. Tên cũ của nền tảng là **Vertex AI**. App gọi model Gemini bằng **token OAuth** xin từ file khoá
service account. Không còn dùng API key. Đường cũ (Gemini Developer API + `GEMINI_API_KEY`) giữ lại để rollback, không cần build lại.

## 1. App gọi Google thế nào

```
app (container, user node) ──HTTPS──► oauth2.googleapis.com          ký JWT bằng file khoá → access token (tự làm mới ~1 giờ/lần)
                           ──HTTPS──► aiplatform.googleapis.com       model Gemini khi GOOGLE_CLOUD_LOCATION=global
                           ──HTTPS──► <region>-aiplatform.googleapis.com   nếu chọn region cụ thể
```

| Thông tin | Giá trị |
|---|---|
| Google Cloud project | `prapplication-479309` |
| Service account | `misa-pr-workstation-598@prapplication-479309.iam.gserviceaccount.com` — role duy nhất `roles/aiplatform.user` |
| Model đã kiểm ở `global` | văn bản `gemini-3.8-flash` (dàn ý, dựng bài, JSON schema, đọc PDF, nghe ghi âm); ảnh `gemini-3.1-flash-lite-image` |

**Khác biệt so với Developer API:** Agent Platform **không có Files API**. Mọi tệp tư liệu (PDF, ghi âm) được gửi thẳng trong request (inline).
App tự chia nhỏ để mỗi request ≤ 48 MB:

- PDF: cắt theo cụm trang, như trước.
- Ghi âm WAV: cắt theo thời lượng.
- Ghi âm nén (MP3/M4A…) lớn hơn 48 MB: báo người dùng nén hoặc chia nhỏ (`AUDIO_TOO_LARGE`), tương đương khoảng 50 phút MP3 128 kbps.

Đo ngày 15/10/2026: Agent Platform nhận PDF inline 150 MB.

## 2. Biến môi trường

| Biến | Giá trị | Ghi chú |
|---|---|---|
| `GEMINI_PROVIDER` | `agent-platform` | `developer-api` = rollback (cần `GEMINI_API_KEY`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | `/run/secrets/gcp-agent-platform.json` | đường dẫn **trong container** — tệp compose override tự đặt |
| `GCP_KEY_FILE` | ví dụ `/opt/misa-presentation/secrets/gcp-agent-platform.json` | đường dẫn file khoá **trên máy chủ**, chỉ dùng cho compose |
| `GOOGLE_CLOUD_PROJECT` | `prapplication-479309` | phải trùng `project_id` trong file khoá |
| `GOOGLE_CLOUD_LOCATION` | `global` | đổi sang region cụ thể nếu cần giữ dữ liệu trong vùng (model phải có ở region đó) |
| `GEMINI_API_KEY` | để trống | chỉ cần khi rollback |

Khi `GEMINI_PROVIDER=agent-platform`, app **dừng ngay lúc khởi động**, có log rõ lý do, trong các trường hợp:

- thiếu một trong các biến trên;
- file khoá không đọc được, không phải JSON, hoặc không phải khoá service account;
- `project_id` trong file khoá khác `GOOGLE_CLOUD_PROJECT`.

Không có trạng thái "app chạy nhưng AI lỗi âm thầm".

## 3. Cất giữ file khoá

1. Nhận file qua kênh an toàn: ổ chia sẻ có phân quyền, hoặc kho secret của MISA. Không gửi qua email, chat, ticket, không chụp màn hình.
2. Đặt **ngoài thư mục mã nguồn**. Container chạy bằng user `node` (UID 1000), nên user này phải đọc được file:
   ```bash
   sudo mkdir -p /opt/misa-presentation/secrets
   sudo cp <file-khoa>.json /opt/misa-presentation/secrets/gcp-agent-platform.json
   sudo chown 1000:1000 /opt/misa-presentation/secrets/gcp-agent-platform.json
   sudo chmod 400 /opt/misa-presentation/secrets/gcp-agent-platform.json
   sudo chmod 700 /opt/misa-presentation/secrets
   ```
3. **Không** `COPY` vào image, không commit vào repo, không đưa nội dung JSON vào biến môi trường, không để trong volume `app-data`
   (volume này được sao lưu chung bằng `scripts/ops/backup.sh`).
4. Bản sao lưu của file khoá để trong kho secret của MISA, không để trong backup chung của máy chủ.

## 4. Chạy bằng Docker Compose

```bash
# .env trên máy chủ: GCP_KEY_FILE=/opt/misa-presentation/secrets/gcp-agent-platform.json, GOOGLE_CLOUD_PROJECT=prapplication-479309
docker compose -f docker-compose.yml -f deploy/agent-platform/docker-compose.agent-platform.yml up -d
```

Tệp override `deploy/agent-platform/docker-compose.agent-platform.yml` làm 2 việc: đặt `GEMINI_PROVIDER` + các biến Google, và mount file khoá **chỉ đọc**
vào `/run/secrets/gcp-agent-platform.json`. Có thể đặt `COMPOSE_FILE=docker-compose.yml:deploy/agent-platform/docker-compose.agent-platform.yml`
trong `.env` để lệnh `docker compose …` ngắn gọn như cũ (Windows: phân cách `;` và thêm `COMPOSE_PATH_SEPARATOR=;`).

Chạy Node trực tiếp trên máy dev: đặt `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới file khoá trên máy, ví dụ `C:/Users/<user>/.secrets/misa-presentation/gcp-agent-platform.json`.

## 5. Mạng chiều ra

Mở HTTPS (TCP 443) tới `oauth2.googleapis.com`, `aiplatform.googleapis.com`, và `<region>-aiplatform.googleapis.com` nếu dùng region cụ thể.

- Đi qua proxy công ty: đặt `HTTPS_PROXY` cho container.
- Đồng hồ máy chủ phải đồng bộ NTP. Lệch giờ làm Google từ chối token (`invalid_grant`).

## 6. Kiểm tra sau khi triển khai

1. `docker compose logs app | grep config_loaded` → `"provider":"agent-platform"`; app không thoát.
2. `docker compose exec app ls -l /run/secrets/` → thấy file khoá.
3. Tạo 1 bài từ văn bản ngắn → có dàn ý → dựng bài. Log có `gemini_outline_done` / `gemini_design_done`, không có `google_token_failed`.
4. Google Cloud Console → *Agent Platform API → Metrics*: thấy request mới, không có lỗi 403.

## 7. Lỗi thường gặp

| Log | Nguyên nhân | Xử lý |
|---|---|---|
| App thoát: `Không đọc được file khoá … (ENOENT)` | sai `GCP_KEY_FILE` hoặc thiếu tệp override | `docker compose exec app ls -l /run/secrets/` |
| `… (EACCES)` | file `chmod 400` của root, container chạy user `node` | `chown 1000:1000` (mục 3) |
| `google_token_failed` `invalid_grant` | khoá đã bị xoá/thu hồi, hoặc đồng hồ lệch | đồng bộ NTP; xin khoá mới (mục 8) |
| `google_token_network_error` | tường lửa chặn `oauth2.googleapis.com` | mở egress (mục 5) |
| `gemini_http_error` 403 `PERMISSION_DENIED` | service account thiếu `roles/aiplatform.user`, hoặc API chưa bật | owner kiểm IAM / bật `aiplatform.googleapis.com` |
| `gemini_http_error` 404 model | model không có ở region đã chọn | đổi `GOOGLE_CLOUD_LOCATION` (mặc định `global`) |
| `gemini_http_error` 429 `RESOURCE_EXHAUSTED` | hết quota | app tự thử lại 2 lần; kéo dài thì xin tăng quota cho project |

## 8. Thay khoá định kỳ / khi lộ khoá

- **Định kỳ** (khuyến nghị 90 ngày) hoặc khi người giữ khoá nghỉ việc:
  1. Owner tạo khoá mới cho cùng service account (IAM & Admin → Service accounts → Keys → Add key → JSON).
  2. DevOps thay file trên máy chủ, giữ nguyên tên và đường dẫn, rồi chạy `docker compose restart app`.
  3. Kiểm theo mục 6, rồi owner xoá khoá cũ.
- **Nghi lộ khoá:** xoá khoá ngay ở tab Keys (lời gọi dùng khoá đó bị từ chối trong vài phút), tạo khoá mới và thay như trên.

## 9. Rollback về Developer API

Tóm tắt: đặt `GEMINI_PROVIDER=developer-api` và `GEMINI_API_KEY=<khoá>` trong `.env`, bỏ dòng `COMPOSE_FILE` (nếu có), rồi chạy
`docker compose -f docker-compose.yml up -d --no-deps app` (không kèm tệp override). Không cần build lại.
Hướng dẫn đầy đủ (chọn cách, kiểm tra, chuyển lại): **[`ROLLBACK-GEMINI-API.md`](ROLLBACK-GEMINI-API.md)**.
