# 02 — Công nghệ & Kiến trúc

## Kiến trúc tổng thể

```
Trình duyệt (Vue 3 SPA, MDS 2.0)
   │  /api/* (cookie phiên mp.sid + CSRF token)
   ▼
Node 24 + Express 5  ──► MySQL 8.4 (users, presentations, assets, sessions, audit_logs)
   │   ├─ ingestService  : đọc nhiều tệp pptx/docx/pdf/ảnh/ghi âm/text/URL (chống SSRF, zip bomb)
   │   ├─ mediaService   : PDF/ghi âm → Gemini (trực tiếp hoặc 2 bước; Files API; cắt PDF bằng pdf-lib)
   │   ├─ geminiService  : gọi Gemini generateContent (JSON schema) → spec bài trình bày
   │   ├─ specService    : chuẩn hoá spec (allowlist + giới hạn độ dài)
   │   ├─ renderService  : spec → HTML (shared/deck: render.js + theme.css + engine.js + font Inter)
   │   ├─ browserService : Chromium (puppeteer-core) → ảnh bìa webp, PDF
   │   └─ storageService : tệp private trên đĩa/volume (trừu tượng hoá để chuyển S3/MinIO sau)
   ▼
/api/presentations/:id/preview → iframe sandbox (CSP sandbox, origin null) chạy engine chuyển động
```

Một tiến trình Node duy nhất phục vụ cả API lẫn SPA tĩnh (`dist/`). Tác vụ AI chạy nền trong cùng tiến trình qua hàng đợi semaphore (không có worker/queue ngoài).

## Backend

| Công nghệ | Phiên bản | Vai trò | Ghi chú |
|---|---|---|---|
| Node.js | ≥ 24 | Runtime | ESM, `--env-file-if-exists` |
| Express | 5.2 | HTTP | Lỗi async tự chuyển về error handler |
| mysql2 | 3.24 | Kết nối MySQL | Pool, prepared statements |
| express-session | 1.19 | Phiên đăng nhập | Store tự viết `MySqlSessionStore` |
| express-rate-limit | 8.7 | Giới hạn tần suất | Dùng named import `{ rateLimit, ipKeyGenerator }` |
| helmet | 8.3 | Header bảo mật/CSP | CSP riêng cho trang xem trước |
| bcryptjs | 3.0 | Băm mật khẩu | 12 rounds mặc định |
| multer | 2.4 | Upload multipart | memoryStorage + giới hạn kích thước |
| jszip | 3.10 | Đọc pptx/docx | Có giới hạn số entry & dung lượng giải nén |
| sharp | 0.35 | Chuẩn hoá ảnh | → WebP, tối đa 1920px, giới hạn 60MP |
| puppeteer-core | 25.12 | Điều khiển Chromium | Chặn mọi request trừ `data:`/`about:blank` |
| zod | 4.6 | (dự phòng) | Validate chính dùng hàm tự viết trong `specService`/`lib/validate.js` |

### Modules nội bộ dùng chung

| Module | Vai trò |
|---|---|
| `src/config/index.js` | Đọc & kiểm tra biến môi trường (fail-fast), che secret khi log |
| `src/lib/httpError.js` | Lỗi HTTP chuẩn `{error:{code,message,details?}}` |
| `src/lib/validate.js` | `pick` (allowlist), `paging`, `uuidParam`, `ok()` trả `{data, meta}` |
| `src/lib/safeFetch.js` | Tải URL chống SSRF (kiểm IP lúc kết nối, chống DNS rebinding) |
| `src/lib/fileType.js` | Nhận diện tệp bằng magic bytes |
| `src/lib/signedUrl.js` | URL ảnh ký HMAC cho iframe sandbox |
| `src/lib/semaphore.js` | Giới hạn song song (AI, Chromium) |
| `src/repositories/tenantScope.js` | Helper **duy nhất** sinh điều kiện `tenant_id = ?` |
| `shared/deck/*` | Renderer dùng chung server + giao diện (`limits.js`, `icons.js` cũng được frontend import) |

### Vì sao chọn công nghệ này?

- **Spec JSON là nguồn sự thật**: AI chỉ sinh dữ liệu có cấu trúc, không sinh HTML → chống XSS, chỉnh sửa được bằng form, render lại nhất quán cho preview/HTML/PDF.
- **Chromium trong container** thay vì dịch vụ ngoài: PDF và ảnh bìa render đúng font/hiệu ứng như trình duyệt.
- **Một tiến trình** phù hợp yêu cầu "1 máy chủ Docker"; đánh đổi: hàng đợi nằm trong bộ nhớ (xem `09-technical-traps.md`).

## Frontend

| Công nghệ | Vai trò |
|---|---|
| Vue 3.5 + vue-router 5 | SPA, `<script setup>` |
| Vite 8 (rolldown) | Dev server (proxy `/api`, `/deck-assets` → 3000) + build ra `dist/` |
| Tailwind CSS v4 (`@tailwindcss/vite`) | Tiện ích CSS trên token MDS |
| MDS 2.0 (copy vào `frontend/src/components/mds/`) | Toàn bộ component giao diện, theme `blue` |

## Lưu trữ

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Cơ sở dữ liệu | MySQL 8.4, utf8mb4 | `startup/database/schema.sql` |
| Tệp upload/ảnh | Đĩa cục bộ (`STORAGE_DIR`), Docker volume `app-data` | Chỉ có vùng **private** (`tenants/<tenant>/presentations/<id>/<asset>.webp`) + **temp**; không có public — ảnh phục vụ qua API có kiểm quyền hoặc URL ký |
| Lược đồ dữ liệu | `schema.sql` baseline + changelog thủ công | App chỉ `verifyTables` lúc khởi động, không tự migrate |

## Hạ tầng

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Container | Docker, `docker-compose.yml` (mysql + app) | Image app: node:24-bookworm-slim + chromium + fonts-noto/dejavu + tini, chạy user `node` |
| AI | Google Gemini REST `generateContent` | Header `x-goog-api-key`, `responseMimeType: application/json` + `responseSchema` |
| Google Drive API (tuỳ chọn) | `GOOGLE_API_KEY` | Dự phòng khi link export Google Docs/Slides bị chặn |
