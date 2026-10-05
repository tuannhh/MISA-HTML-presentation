# 11 — Quy tắc code (bắt buộc)

Áp dụng cùng bộ chuẩn `C:\MISA-project\xoan-backend-standard` và MDS 2.0 (`C:\MISA-project\misa-design-system-skill`). Phần dưới là quy tắc **riêng** của dự án — đọc trước khi sửa bất cứ thứ gì.

## Backend

1. **Phân lớp:** `routes` (HTTP: parse, allowlist bằng `pick`, gọi service, `ok()`) → `services` (nghiệp vụ, quyền) → `repositories` (SQL). Route không viết SQL; repository không biết `req`.
2. **Response:** luôn `ok(res, data, meta, status)` → `{data, meta}`; lỗi luôn `throw` `HttpError` (`badRequest`, `notFound`, `conflict`…) với `code` dạng `UPPER_SNAKE` và message tiếng Việt cho người dùng.
3. **Tenant:** mọi truy vấn theo người dùng dùng `tenantClause()` / hàm `*Owned` / `*ForTenant` của repository. Truy vấn không theo tenant (public, admin) phải đặt tên rõ (`listPublic`, `adminList`) và có chú thích lý do.
4. **Không đủ quyền đọc bài → 404**, không phải 403.
5. **Spec:** mọi spec trước khi ghi DB đi qua `normalizeSpec` (strict cho người dùng, lenient cho AI) + `dropForeignAssets`. Thêm trường mới vào spec = sửa đồng thời `SPEC_LIMITS`, `specService`, `render.js`, `geminiService` (schema), `SlideFields.vue`, `slideModel.js`, fixture `sample-spec.json`.
6. **Renderer:** mọi chuỗi người dùng/AI chèn vào HTML phải qua `esc()`; không dùng `innerHTML` với dữ liệu trong engine.
7. **Cấu hình:** chỉ đọc `process.env` trong `src/config/index.js`; nơi khác nhận `config` qua `container.js`.
8. **Bí mật:** không log/không trả về API key, mật khẩu, token, chữ ký URL. Không commit `.env`.
9. **Tệp:** chỉ ghi qua `storageService` với key từ `assetKey()`; không dùng tên tệp client làm đường dẫn.
10. **Lược đồ DB:** không sửa `schema.sql` baseline đã áp; thêm changelog mới trong `startup/database/changelogs/` + cập nhật `03`.
11. **Gọi mạng ra ngoài** theo URL người dùng: bắt buộc qua `safeFetch`.

## Frontend

1. **Mỗi route có cả `meta.desktop` và `meta.mobile`.** Thêm route mới = thêm 2 trang trong `desktop/` và `mobile/` + cập nhật ma trận ở `06`.
2. **Logic dùng chung** đặt trong `composables/`; trang desktop/mobile chỉ bố trí. Không nhân đôi logic gọi API giữa 2 bề mặt.
3. **Dùng component MDS** có sẵn (`components/mds/`), token màu `--mds-*`; không hard-code màu/hex. Thiếu component (vd. bottom sheet) → viết trong `mobile/` hoặc `shared/` theo token MDS.
4. **Mobile:** gốc `.mds-mobile-app`, MobileShell (TopBar + BottomNav khi là màn gốc), footer sticky (Hủy trái – chính phải), vùng chạm ≥ 44px, Back ở màn gốc gọi `exitToHost()`. 403/404 hiển thị trong shell mobile.
5. **Form:** dùng `FormField` (label thật, liên kết input), `maxlength` lấy từ `SPEC_LIMITS`, lỗi hiển thị cạnh trường; nút submit ngoài form dùng `form="id"`.
6. **Gọi API** chỉ qua `lib/api.js`; xử lý `ApiError.code` cụ thể (409 `VERSION_CONFLICT`, `MUST_CHANGE_PASSWORD`…), không nuốt lỗi.
7. **Clone dữ liệu** reactive bằng `clone()` của `lib/slideModel.js`, không dùng `structuredClone`.
8. **Sửa bản sao MDS** phải đánh dấu `// [MISA Presentation] …` và ghi vào bảng vá ở `09`.

## Quy trình

- Viết code + comment tiếng Việt, ngắn gọn, giải thích **vì sao**.
- Trước khi commit: `npm test` đạt; nếu chạm luồng chính, chạy smoke test trên Docker.
- Sau khi thay đổi: cập nhật memory bank tương ứng + `10-development-history.md` (bắt buộc).
- Commit message tiếng Việt hoặc tiếng Anh, mô tả thay đổi; không đẩy `.env`, `data/`, `tmp/`, `dist/`, `node_modules/`.
