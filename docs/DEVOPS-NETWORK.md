# MISA Presentation — Hướng dẫn mạng cho DevOps

Tài liệu dành cho DevOps khi đưa ứng dụng lên **máy chủ trong mạng MISA** (không dùng Cloud Run). Gồm:

1. [Chiều vào: chỉ cho IP MISA truy cập (`IP_ALLOWLIST`)](#1-chiều-vào--chỉ-cho-ip-misa-truy-cập)
2. [Chiều ra: máy chủ cần gọi tới đâu](#2-chiều-ra--máy-chủ-cần-gọi-ra-ngoài-tới-đâu) ← danh sách tên miền cần mở firewall
3. [Trình duyệt người dùng cần tới đâu](#3-trình-duyệt-người-dùng-cần-tới-đâu)
4. [Khi build image trên máy chủ](#4-khi-build-image-trên-máy-chủ)
5. [Checklist bàn giao](#5-checklist-bàn-giao)

Cấu hình triển khai chung (Docker, biến môi trường, Nginx): xem [`README.md`](../README.md) và [`memory-bank/07-deployment-infrastructure.md`](../memory-bank/07-deployment-infrastructure.md).

```
 Người dùng (mạng MISA) ──HTTPS──▶ [Nginx / LB] ──▶ app :3000 ──▶ MySQL (mạng nội bộ Docker, không mở ra ngoài)
                                                     │
                                                     └──HTTPS 443──▶ Gemini, Pixabay, Google Docs/Drive, YouTube (mục 2)
```

---

## 1. Chiều vào — chỉ cho IP MISA truy cập

Ứng dụng tự chặn theo IP nguồn (không phụ thuộc Nginx). Hiện để **trống = chưa chặn ai**; DevOps điền IP thật trong `.env`.

### 1.1. Điền danh sách IP

```env
# IP đơn, dải CIDR, khoảng a-b; IPv4 + IPv6; phân tách bằng dấu phẩy hoặc khoảng trắng
IP_ALLOWLIST=203.0.113.0/24,198.51.100.7,192.0.2.10-192.0.2.20
```

| Dạng | Ví dụ |
|---|---|
| IP đơn | `198.51.100.7`, `2001:db8::7` |
| Dải CIDR | `203.0.113.0/24`, `10.0.0.0/8`, `2001:db8::/32` |
| Khoảng | `192.0.2.10-192.0.2.20` (đầu ≤ cuối, cùng IPv4 hoặc cùng IPv6) |

- Có **mục sai** (vd. `10.0.0.300`, `1.2.3.4/33`, tên miền) → ứng dụng **không khởi động**, log ghi rõ mục sai. Không có chuyện bỏ qua lặng lẽ.
- Đổi danh sách: sửa `.env` rồi `docker compose up -d app` (tạo lại container; không cần build lại).
- Để trống ở production → ứng dụng vẫn chạy, log cảnh báo `ip_allowlist_empty` lúc khởi động.
- Nhớ thêm cả **dải VPN** của MISA nếu nhân viên làm việc từ xa qua VPN.

### 1.2. `TRUST_PROXY` — bắt buộc đặt đúng

Ứng dụng xác định IP người dùng theo `TRUST_PROXY` = **số lớp proxy đứng trước app**:

| Mô hình | `TRUST_PROXY` | Ứng dụng lấy IP từ |
|---|---|---|
| Người dùng → app (không proxy) | `0` | IP kết nối TCP (bỏ qua `X-Forwarded-For`) |
| Người dùng → Nginx → app | `1` | IP do Nginx ghi vào `X-Forwarded-For` |
| Người dùng → LB/TLS → Nginx → app | `2` | IP do LB ghi (Nginx nối thêm phía sau) |

- **Đặt thiếu** (vd. sau Nginx mà để `0`): ứng dụng thấy IP của Nginx → **chặn tất cả** mọi người.
- **Đặt dư**: người ngoài tự gửi header `X-Forwarded-For: <IP MISA>` → **giả mạo được IP, lọt qua**.
- Khi `TRUST_PROXY ≥ 1`: **không mở cổng app (`APP_PORT`) ra ngoài**, chỉ mở cổng của Nginx/LB. Gọi thẳng vào app thì header `X-Forwarded-For` là do client tự viết.
- Các proxy phía trước phải **nối thêm** IP vào `X-Forwarded-For` (Nginx của repo dùng `$proxy_add_x_forwarded_for` — đã đúng), không được để client ghi đè.

### 1.3. Hành vi khi bị chặn

| Đường dẫn | Phản hồi |
|---|---|
| `/api/*` | `403` JSON `{"error":{"code":"IP_NOT_ALLOWED","message":"Ứng dụng chỉ truy cập được từ mạng nội bộ MISA"}}` |
| Còn lại (giao diện, phông, gói 3D…) | `403` trang HTML ngắn "Không có quyền truy cập" |
| `/api/health`, `/api/health/ready` | **Luôn mở** (healthcheck Docker/LB/giám sát) |

Log (stderr, JSON 1 dòng) mỗi IP bị chặn tối đa 1 lần/phút:

```json
{"level":"warn","msg":"ip_blocked","ip":"203.0.113.50","m":"GET","p":"/"}
```

### 1.4. Kiểm tra sau khi cài

```bash
# Từ 1 máy NGOÀI danh sách → 403
curl -i https://<tên-miền>/api/auth/me
# Giả header không được → vẫn 403
curl -i -H "X-Forwarded-For: <1 IP trong danh sách>" https://<tên-miền>/api/auth/me
# Healthcheck luôn 200
curl -i https://<tên-miền>/api/health
# Từ máy TRONG mạng MISA → 200/401 (401 = chưa đăng nhập, tức là đã qua lớp IP)
curl -i https://<tên-miền>/api/auth/me
# Xem IP ứng dụng nhận được khi bị chặn (để biết TRUST_PROXY đã đúng chưa)
docker compose logs app | grep ip_blocked
```

Nếu log `ip_blocked` hiện IP của Nginx/LB (dải `172.x` Docker, IP máy LB) thay vì IP người dùng → `TRUST_PROXY` đang thiếu.

### 1.5. (Tuỳ chọn) chặn thêm ở Nginx

[`deploy/nginx/default.conf`](../deploy/nginx/default.conf) có sẵn khối `allow … ; deny all;` (đang comment). Nếu bật thì **giữ khớp** với `IP_ALLOWLIST`. Nginx đứng sau LB khác cần thêm `set_real_ip_from <IP LB>; real_ip_header X-Forwarded-For;` để `allow/deny` xét IP người dùng thay vì IP LB. Lớp chặn chính vẫn là ứng dụng.

---

## 2. Chiều ra — máy chủ cần gọi ra ngoài tới đâu

Chỉ container **`app`** gọi ra Internet. MySQL và Nginx **không** cần ra ngoài. Tất cả qua **HTTPS cổng 443** (riêng link tư liệu bất kỳ có thể là HTTP 80). Máy chủ cần **phân giải được DNS công cộng**.

### 2.1. Bắt buộc

| Tên miền | Cổng | Dùng cho | Biến cấu hình |
|---|---|---|---|
| `generativelanguage.googleapis.com` | 443 | Gemini AI: lập dàn ý, dựng bài, đọc PDF/ghi âm (Files API `/upload/v1beta/files`), tạo ảnh minh hoạ AI, khoanh vùng ảnh giao diện. **Không mở thì ứng dụng không tạo được bài.** | `GEMINI_API_KEY`, `GEMINI_BASE_URL` (mặc định `https://generativelanguage.googleapis.com/v1beta` — đổi được nếu MISA có cổng AI trung gian) |

### 2.2. Theo tính năng (không mở → riêng tính năng đó báo lỗi, phần còn lại vẫn chạy)

| Tên miền | Cổng | Tính năng | Ghi chú |
|---|---|---|---|
| `pixabay.com`, `cdn.pixabay.com` | 443 | Tìm ảnh Internet trong trình soạn thảo (tìm + tải ảnh về máy chủ) | Chỉ khi có `PIXABAY_API_KEY`. Ảnh chỉ được tải từ đúng 2 tên miền này |
| `docs.google.com` | 443 | Nhập link Google Slides / Docs / Sheets (xuất PPTX/DOCX/XLSX) | Tài liệu phải chia sẻ "Bất kỳ ai có đường liên kết" |
| `drive.google.com`, `drive.usercontent.google.com` | 443 | Nhập link tệp Google Drive | Drive chuyển hướng tải tệp sang `drive.usercontent.google.com` |
| `*.googleusercontent.com` | 443 | Google Docs/Drive chuyển hướng tới đây khi trả tệp xuất | Dùng wildcard nếu firewall hỗ trợ |
| `www.googleapis.com` | 443 | Phương án dự phòng tải Google Docs/Drive qua Drive API | Chỉ khi có `GOOGLE_API_KEY` |
| *(không cần)* `accounts.google.com` | — | Tài liệu Google **không** công khai bị chuyển hướng tới trang đăng nhập; không mở thì người dùng nhận lỗi "Không tải được tài liệu từ đường link" — đúng mong muốn | Không cần mở |
| `www.youtube.com`, `i.ytimg.com` | 443 | Gắn video YouTube vào trang: lấy tiêu đề (oEmbed) + ảnh bìa | Video **không** đi qua máy chủ (phát trên trình duyệt, mục 3) |
| **Link tư liệu bất kỳ** người dùng dán | 80/443 | Tab "Nhập từ link": tải trang/tệp công khai làm tư liệu | Không cố định tên miền. Firewall chỉ cho danh sách trắng thì chỉ các tên miền đã mở dùng được; còn lại người dùng nhận lỗi tải link. Ứng dụng **tự chặn** link tới IP nội bộ/loopback/metadata (chống SSRF) → link intranet MISA cũng không tải được, đây là chủ ý |

### 2.3. Ứng dụng KHÔNG gọi ra ngoài

- Không gửi email/SMTP, không OAuth/SSO bên ngoài, không webhook.
- Không gửi telemetry: onnxruntime (tách nền logo) đã tắt telemetry Microsoft; mô hình AI tách nền nằm sẵn trong image (`models/`), không tải lúc chạy.
- Chromium (xuất PDF, ảnh đại diện) chạy trong container và **chặn mọi request mạng**, chỉ render HTML nội bộ.
- Phông chữ, gói 3D three.js đóng gói sẵn, không tải từ CDN.

### 2.4. Lưu ý về proxy ra ngoài

Ứng dụng **gọi ra trực tiếp** (NAT/firewall theo tên miền), **chưa kiểm chứng chạy qua HTTP proxy bắt buộc** (`HTTPS_PROXY`). Phần tải link/YouTube kiểm IP đích lúc kết nối để chống SSRF, nên đi qua proxy sẽ cần sửa code. Nếu mạng MISA bắt buộc proxy ra Internet → báo đội phát triển trước khi triển khai.

---

## 3. Trình duyệt người dùng cần tới đâu

Máy người dùng trong mạng MISA cần tới:

| Tên miền | Dùng cho |
|---|---|
| Tên miền của ứng dụng (qua Nginx/LB) | Toàn bộ giao diện + API |
| `www.youtube-nocookie.com` (và các tên miền YouTube nó tải kèm: `www.youtube.com`, `*.googlevideo.com`, `i.ytimg.com`, `*.ggpht.com`) | Phát video YouTube trong bài trình bày |
| `pixabay.com`, `cdn.pixabay.com` | Ảnh xem trước trong ô "Tìm ảnh Internet" |

Tệp HTML xuất ra chạy **offline** (nhúng sẵn phông, ảnh, hiệu ứng, video tải lên), không cần mạng; chỉ video YouTube cần Internet khi phát.

---

## 4. Khi build image trên máy chủ

Chỉ cần lúc `docker compose build` (không cần lúc chạy):

| Tên miền | Dùng cho |
|---|---|
| `registry-1.docker.io`, `auth.docker.io`, `production.cloudflare.docker.com` | Kéo image `node:24-bookworm-slim`, `mysql:8.4`, `nginx:1.28-alpine` |
| `registry.npmjs.org` | `npm ci` (gồm binary `sharp` cho Linux) |
| `deb.debian.org` | `apt-get install chromium poppler-utils fonts-… tini` |

Không muốn mở các tên miền này trên máy chủ: build image ở máy CI/build rồi đẩy lên registry nội bộ MISA; khi đó máy chủ chỉ cần kéo image từ registry nội bộ.

---

## 5. Checklist bàn giao

- [ ] `.env`: `IP_ALLOWLIST` = dải IP văn phòng + VPN MISA.
- [ ] `.env`: `TRUST_PROXY` đúng số lớp proxy (mục 1.2); `APP_BASE_URL` = địa chỉ người dùng truy cập; HTTPS thì `SESSION_COOKIE_SECURE=true`.
- [ ] Chỉ mở cổng Nginx/LB ra mạng người dùng; cổng app và MySQL không mở.
- [ ] Firewall chiều ra cho container `app`: `generativelanguage.googleapis.com:443` (bắt buộc) + các tên miền mục 2.2 theo tính năng muốn dùng.
- [ ] DNS công cộng phân giải được từ máy chủ.
- [ ] Chạy các lệnh kiểm tra mục 1.4 từ 1 máy ngoài danh sách và 1 máy trong mạng MISA.
- [ ] Giám sát: `/api/health` (sống), `/api/health/ready` (DB sẵn sàng); theo dõi log `ip_blocked`, `ip_allowlist_empty`.
