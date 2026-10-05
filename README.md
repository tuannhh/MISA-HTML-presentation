# MISA Presentation

AI tạo **bài trình bày HTML có chuyển động** từ tài liệu (pptx/docx/pdf/txt/ảnh), link (Google Slides/Docs, trang web công khai) hoặc nội dung nhập tay. Sửa chữ/ảnh từng trang, lưu để render lại, trình chiếu, xuất **HTML một tệp** (giữ chuyển động, media nhúng base64) hoặc **PDF**. Tỷ lệ 16:9 · 4:3 · 2:1 · 3:1. Đa tenant, chia sẻ Riêng tư / Công khai.

- Backend: Node 24 · Express 5 · MySQL 8.4 · Gemini (`gemini-3.8-flash`) · Chromium (puppeteer-core)
- Giao diện: Vue 3 · Vite · Tailwind v4 · **MISA Design System 2.0** (desktop + mobile mini-app)

Tài liệu đầy đủ: [`memory-bank/`](memory-bank/README.md).

## Chạy bằng Docker (1 máy chủ)

```bash
cp .env.example .env
```

Điền trong `.env`: `SESSION_SECRET` (≥ 32 ký tự ngẫu nhiên), `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `GEMINI_API_KEY`, `APP_BASE_URL` (URL người dùng truy cập) và `APP_PORT` nếu cổng 8080 đã bận.

```bash
docker compose up -d --build
```

Tạo tài khoản quản trị đầu tiên (mật khẩu tạm in ra **một lần**, bắt buộc đổi khi đăng nhập):

```bash
docker compose exec app node scripts/create-admin.js admin@misa.com.vn "Quản trị viên"
```

Mở `http://localhost:${APP_PORT}`. Kiểm tra: `GET /api/health`, `GET /api/health/ready`.

Sau reverse proxy HTTPS: `TRUST_PROXY=1`, `SESSION_COOKIE_SECURE=true`, `APP_BASE_URL=https://…`.

## Phát triển

```bash
npm install
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql
```

Trong `.env` cho dev: `NODE_ENV=development`, `DB_HOST=127.0.0.1`, `DB_PORT=3307`, `STORAGE_DIR=./data/storage`, `CHROME_PATH` trỏ tới Chrome/Edge trên máy, `CHROME_NO_SANDBOX=false`.

```bash
npm run dev:api
```

```bash
npm run dev
```

API chạy ở `http://localhost:3000`, giao diện Vite ở `http://localhost:5173` (proxy `/api`). Thêm `?surface=mobile` để xem giao diện mobile trên màn hình rộng.

## Kiểm thử

```bash
npm test
```

Smoke end-to-end trên server đang chạy (dùng Gemini thật, tạo dữ liệu thử):

```bash
BASE=http://localhost:8088 node test/smoke/smoke.mjs
```

## Cấu trúc

```
src/            backend: config · routes · services · repositories · middleware · lib
shared/deck/    renderer bài trình bày dùng chung (render.js, engine.js, theme.css, icons, limits, font)
frontend/src/   Vue: desktop/ · mobile/ · shared/ · composables/ · components/mds (MDS 2.0)
startup/        schema.sql baseline + changelogs
memory-bank/    tài liệu dự án (bắt buộc cập nhật khi thay đổi)
```

## Bảo mật

Không commit `.env` hay khoá API. Xem [`memory-bank/08-security-model.md`](memory-bank/08-security-model.md).
