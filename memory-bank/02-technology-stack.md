# 02 — Công nghệ & Kiến trúc

## Kiến trúc tổng thể

```
Trình duyệt (Vue 3 SPA, MDS 2.0)
   │  /api/* (cookie phiên mp.sid + CSRF token)
   ▼
Node 24 + Express 5  ──► MySQL 8.4 (users, presentations, assets, sessions, audit_logs)
   │   ├─ ingestService  : đọc nhiều tệp pptx/docx/pdf/ảnh/ghi âm/text/URL (chống SSRF, zip bomb)
   │   ├─ mediaService   : PDF/ghi âm → Gemini (trực tiếp hoặc 2 bước; Files API; cắt PDF bằng pdf-lib)
   │   ├─ geminiService  : gọi Gemini generateContent (JSON schema) → dàn ý (bước 1) / bài trình bày theo dàn ý (bước 2)
   │   ├─ outlineService : chuẩn hoá dàn ý, ghép kết quả AI với dàn ý đã duyệt, gắn media (hàm thuần)
   │   ├─ specService    : chuẩn hoá spec + thiết kế (allowlist + giới hạn độ dài)
   │   ├─ youtubeService : link YouTube → id + ảnh bìa 16:9 + tiêu đề (oEmbed, safeFetch)
   │   ├─ cutoutService  : tách nền logo (theo màu / U²-Net-p qua onnxruntime-node trong worker thread)
   │   ├─ renderService  : spec → HTML (shared/deck: render.js + theme.css + palette.js + backgrounds.js + engine.js + fonts)
   │   ├─ browserService : Chromium (puppeteer-core) → ảnh bìa webp, PDF
   │   ├─ pdfShotService : poppler pdftoppm render trang PDF → Gemini khoanh vùng → cắt ảnh giao diện phần mềm
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
| multer | 2.4 | Upload multipart | memoryStorage cho ảnh; **diskStorage** cho tư liệu lớn và video |
| jszip | 3.10 | Đọc pptx/docx | Có giới hạn số entry & dung lượng giải nén |
| sharp | 0.35 | Chuẩn hoá ảnh | → WebP, tối đa 1920px, giới hạn 60MP |
| puppeteer-core | 25.12 | Điều khiển Chromium | Chặn mọi request trừ `data:`/`about:blank` |
| poppler-utils (`pdftoppm`) | Debian bookworm | Render trang PDF thành ảnh để cắt ảnh giao diện | Công cụ hệ thống (apt), gọi bằng `execFile`, không qua shell; thiếu → bỏ qua bước cắt ảnh |
| onnxruntime-node | 1.30 | Chạy mô hình U²-Net-p tách nền logo | Chỉ CPU; Dockerfile xoá binary nền tảng khác (~290 MB → ~30 MB); **phải** `ORT_DISABLE_TELEMETRY=1` |
| zod | 4.6 | (dự phòng) | Validate chính dùng hàm tự viết trong `specService`/`lib/validate.js` |

### Modules nội bộ dùng chung

| Module | Vai trò |
|---|---|
| `src/config/index.js` | Đọc & kiểm tra biến môi trường (fail-fast), che secret khi log |
| `src/lib/httpError.js` | Lỗi HTTP chuẩn `{error:{code,message,details?}}` |
| `src/lib/validate.js` | `pick` (allowlist), `paging`, `uuidParam`, `ok()` trả `{data, meta}` |
| `src/lib/safeFetch.js` | Tải URL chống SSRF (kiểm IP lúc kết nối, chống DNS rebinding) |
| `src/lib/fileType.js` | Nhận diện tệp bằng magic bytes (cả OLE/HEIC/AVIF/UTF-16), `decodeText` (UTF-8/UTF-16/Windows-1258 → NFC) |
| `src/lib/signedUrl.js` | URL ảnh ký HMAC cho iframe sandbox |
| `src/lib/semaphore.js` | Giới hạn song song (AI, Chromium) |
| `src/repositories/tenantScope.js` | Helper **duy nhất** sinh điều kiện `tenant_id = ?` |
| `shared/deck/*` | Renderer dùng chung server + giao diện (`limits.js`, `icons.js`, `palette.js`, `fonts.js`, `backgrounds.js` cũng được frontend import để xem trước) |
| `shared/deck/variants.js` | Biến thể bố cục + phong cách bài, `artDirect` chọn ngầm khi dựng (`05` §9) |
| `shared/deck/fonts/` | Phông woff2 đóng gói (Inter, Montserrat, Barlow, Roboto, Google Sans — tập con latin/latin-ext/vietnamese, nguồn @fontsource, giấy phép OFL kèm theo) |
| `models/u2netp.onnx` | Mô hình tách nền 4.6 MB (Apache-2.0, `models/README.md` có SHA-256) |

### Vì sao chọn công nghệ này?

- **Spec JSON là nguồn sự thật**: AI chỉ sinh dữ liệu có cấu trúc, không sinh HTML → chống XSS, chỉnh sửa được bằng form, render lại nhất quán cho preview/HTML/PDF.
- **Chromium trong container** thay vì dịch vụ ngoài: PDF và ảnh bìa render đúng font/hiệu ứng như trình duyệt.
- **Phông đóng gói trong app** (không Google Fonts CDN): hiển thị đúng tiếng Việt kể cả máy không cài phông / HTML mở offline; không lộ IP người xem cho bên thứ ba.
- **Tách nền logo chạy local** (U²-Net-p ONNX) thay vì API ngoài: logo doanh nghiệp không rời máy chủ; mô hình nhỏ đủ cho logo, ~2 giây/ảnh.
- **Một tiến trình** phù hợp yêu cầu "1 máy chủ Docker"; đánh đổi: hàng đợi nằm trong bộ nhớ (xem `09-technical-traps.md`).

## Frontend

| Công nghệ | Vai trò |
|---|---|
| Vue 3.5 + vue-router 5 | SPA, `<script setup>` |
| Vite 8 (rolldown) | Dev server (proxy `/api`, `/deck-assets` → 3000) + build ra `dist/` |
| Tailwind CSS v4 (`@tailwindcss/vite`) | Tiện ích CSS trên token MDS |
| MDS 2.0 (copy vào `frontend/src/components/mds/`) | Toàn bộ component giao diện, theme `blue` |
| three.js 0.186 (`three`, MIT, devDependency) | Nền 3D + logo nổi khối (`shared/deck/deck3d.js`). Đóng gói IIFE bằng `scripts/build-deck3d.mjs` (vite lib) → `dist/deck-runtime/deck3d.js` trong `npm run build`; giao diện import động cho ô xem trước nền. Server không import three (chỉ `bg3d.js`) |
| Cropper.js 1.6 (`cropperjs`, MIT) | Cắt/xoay/lật ảnh trong trình chỉnh sửa ảnh (`shared/ImageEditor.vue`) — không dùng AI; máy chủ áp lại bằng sharp |
| Gemini `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite, 1K) + Pixabay API | Ảnh minh hoạ AI (khi dựng bài + theo yêu cầu) và tìm ảnh Internet (`stockImageService`) |

## Lưu trữ

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Cơ sở dữ liệu | MySQL 8.4, utf8mb4 | `startup/database/schema.sql` |
| Tệp upload/ảnh/video | Đĩa cục bộ (`STORAGE_DIR`), Docker volume `app-data` | Chỉ có vùng **private** (`tenants/<tenant>/presentations/<id>/<asset>.webp|.mp4|.mov|.webm`) + **temp**; không có public — ảnh phục vụ qua API có kiểm quyền hoặc URL ký |
| Lược đồ dữ liệu | `schema.sql` baseline + changelog thủ công | App chỉ `verifyTables` lúc khởi động, không tự migrate |

## Hạ tầng

| Thành phần | Công nghệ | Ghi chú |
|---|---|---|
| Container | Docker, `docker-compose.yml` (mysql + app) | Image app: node:24-bookworm-slim + chromium + fonts-noto/dejavu + tini, chạy user `node` |
| AI | Google Gemini REST `generateContent` | Header `x-goog-api-key`, `responseMimeType: application/json` + `responseSchema` |
| Google Drive API (tuỳ chọn) | `GOOGLE_API_KEY` | Dự phòng khi link export Google Docs/Slides bị chặn |
