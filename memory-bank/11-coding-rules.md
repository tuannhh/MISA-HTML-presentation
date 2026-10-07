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
9. **Đường dẫn bài** luôn dựng bằng `deckPath(deck, feature)` (`lib/deckPath.js`), không tự ghép `/p/:id/...`.
10. **Khung sửa trực tiếp:** mọi dữ liệu từ khung (postMessage) là không tin cậy — thêm trường sửa được thì thêm cả đường dẫn vào allowlist `lib/editPaths.js` (+ test), renderer gắn `data-e` qua helper `E(ctx, path, max)` (chỉ khi `ctx.edit`).
11. **Layout `free`** không đưa vào prompt/schema AI (`AI_LAYOUTS`); thêm loại phần tử = cập nhật `shared/deck/free.js` + `cleanElement` + `freeEl` + `FreeElementsPanel` + test.
12. **Chữ định dạng `⟦…⟧`:** chỉ tạo/sửa qua `shared/deck/rich.js` (không tự ghép chuỗi thẻ); độ dài/so khớp/hiển thị tiêu đề dùng `plainText`; HTML chỉ qua `richHtml` (escape + style từ allowlist). Trường chỉ nhận chữ thường (ô số liệu, chân trang) đánh `plain` ở `editPaths` + `data-pl` ở renderer.
13. **Bộ nhận diện / mẫu:** ảnh trong `brand` luôn là asset kind `brand` của **chính bài** (qua `collectAssetIds`/`dropForeignAssets`/`remapAssetIds`); mẫu chỉ liên hệ ảnh bằng **sao chép** (không dùng chung tệp giữa bài và mẫu, không tham chiếu chéo tenant). Thêm ô ảnh nhận diện = sửa `BRAND_SLOTS` + `cleanBrand` + `brandFor` + `BrandSettings` + test.
14. **Trình chiếu / 3D:** `slide.build` và nền 3D là lựa chọn của người dùng — **không** đưa vào prompt/schema AI. Đơn vị "ý" và khối phóng được khai báo bằng bộ chọn `UNIT`/`ZOOM` trong `engine.js` — thêm bố cục/lớp khối mới phải cập nhật hai bộ chọn này (test `present-3d.test.js` đối chiếu). Server/renderer chỉ import `shared/deck/bg3d.js` (không import three); `FALLBACK_2D` có bản sao trong engine (test đối chiếu). Hiệu ứng 3D phải có đường lùi khi không có WebGL.

## Quy trình

- Viết code + comment tiếng Việt, ngắn gọn, giải thích **vì sao**.
- Trước khi commit: `npm test` đạt; nếu chạm luồng chính, chạy smoke test trên Docker.
- Sau khi thay đổi: cập nhật memory bank tương ứng + `10-development-history.md` (bắt buộc).
- Thêm/bớt lời gọi từ máy chủ ra Internet (tên miền mới) → cập nhật bảng chiều ra trong `docs/DEVOPS-NETWORK.md` để DevOps mở firewall.
- Commit message tiếng Việt hoặc tiếng Anh, mô tả thay đổi; không đẩy `.env`, `data/`, `tmp/`, `dist/`, `node_modules/`.
