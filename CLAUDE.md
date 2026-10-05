# CLAUDE.md — MISA Presentation

Đọc [`memory-bank/README.md`](memory-bank/README.md) trước; **bắt buộc** đọc [`memory-bank/11-coding-rules.md`](memory-bank/11-coding-rules.md) trước khi sửa code.

## Tóm tắt
- AI (Gemini) tạo bài trình bày HTML có chuyển động từ tệp/link/văn bản; sửa → lưu → render lại; xuất HTML/PDF. Đa tenant (mỗi user là 1 tenant), chia sẻ private/public.
- Backend Node 24 + Express 5 + MySQL 8.4 (`src/`), renderer dùng chung `shared/deck/`, giao diện Vue 3 + MDS 2.0 (`frontend/src/`, có `desktop/` và `mobile/` riêng cho mọi route).

## Lệnh
- `npm run dev:api` (API :3000) + `npm run dev` (Vite :5173); MySQL dev: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql` (cổng 3307).
- `npm test` — unit; `BASE=http://localhost:8088 node test/smoke/smoke.mjs` — smoke trên Docker.
- `docker compose up -d --build` — triển khai; `docker compose exec app node scripts/create-admin.js <email> "<Tên>"`.

## Bắt buộc
- Chuẩn backend: `C:\MISA-project\xoan-backend-standard`. Chuẩn giao diện: MDS 2.0 `C:\MISA-project\misa-design-system-skill` (composition mobile cho mọi route × vai trò).
- Không đọc/in/commit secret (`.env`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SESSION_SECRET`).
- Mọi truy vấn theo tenant qua `tenantClause`; spec luôn qua `normalizeSpec` + `dropForeignAssets`; chuỗi vào HTML qua `esc()`.
- Sau mỗi thay đổi: cập nhật `memory-bank/` (tệp liên quan + `10-development-history.md`).
- Trên Windows: tiến trình node cũ có thể giữ cổng 3000 — xem `memory-bank/09-technical-traps.md`.
