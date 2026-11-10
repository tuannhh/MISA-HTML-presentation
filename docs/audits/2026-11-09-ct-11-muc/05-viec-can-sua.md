# 05 — Việc cần sửa sau audit CT (cổng merge)

Ngày 09/11/2026. Tổng hợp từ [01-audit.md](01-audit.md) (Codex) và [04-phan-bien-claude.md](04-phan-bien-claude.md) (Claude). Gồm các việc **hai bên cùng
đồng ý là lỗi thật**. Cách sửa theo đề xuất ở `04`; nếu Codex phản hồi khác ở vòng 2 thì cập nhật lại tệp này trước khi làm.

**Nhánh:** `feature/cai-tien-11-muc` (đã push). **Chưa merge `main`** cho tới khi xong mọi dòng P0/P1 và có audit xác nhận.

## Quy trình cho mỗi việc
1. Viết test tái hiện, chạy thấy **đỏ đúng nguyên nhân**. Có thể lấy probe trong `evidence/` làm mẫu (đường dẫn tuyệt đối trong probe là của máy audit → sửa lại).
2. Sửa mã. Chạy `npm test` + test mới, thấy xanh.
3. Có đổi giao diện: `npm run build` → `docker compose up -d --build app` → kiểm desktop + mobile 390px.
4. Cập nhật `memory-bank/` (tệp liên quan + `10`), đánh dấu ✅ trong bảng dưới, ghi commit.
5. Không đọc/in secret; không ghi tên sản phẩm tham khảo; commit kết thúc bằng dòng `Co-Authored-By`.

## Bảng việc (làm theo thứ tự)

| # | ID | Mức | Việc | Tệp chính | Công | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | CT-001 | P0 | Chặn mạng cấp tiến trình Chromium cho HTML lạ | `src/services/browserService.js` | 0,5–1 ngày | ✅ |
| 2 | CT-008 | P1 | Ô số biểu đồ đọc sai số có 3 chữ số thập phân | `frontend/src/shared/ChartFields.vue`, `shared/deck/chart.js` | 0,25 ngày | ✅ |
| 3 | CT-006 | P1 | Đổi bố cục không được cắt mất mục | `frontend/src/composables/useEditor.js`, `frontend/src/shared/StylePicker.vue` | 0,25 ngày | ✅ |
| 4 | CT-002 | P1 | Giữ nguyên nội dung: kiểm số trang, không cắt chữ im lặng | `src/services/presentationService.js`, `outlineService.js`, 2 `OutlinePage.vue` | 1 ngày | ✅ |
| 5 | CT-003 | P2 | 3 đường lưu video dùng chung kiểm tệp hỏng | `src/services/presentationService.js`, `videoOptimizer.js` | 0,25 ngày | ✅ |
| 6 | CT-004 | P2 | Không để tệp nén mồ côi khi DB lỗi | `src/services/videoOptimizer.js` | 0,1 ngày | ✅ |
| 7 | CT-005 | P2 | Trần tải video cùng lúc + semaphore kiểm video | `src/routes/presentationRoutes.js`, `videoOptimizer.js`, `src/config/index.js` | 0,5 ngày | ✅ |
| 8 | CT-007 | P2 | Ảnh đang tải không chèn nhầm trang | `frontend/src/composables/useImageDrop.js` | 0,25 ngày | ✅ |
| 9 | CT-009 | P2 | Vùng chạm 44px cho nút chữ trên mobile | `frontend/src/shared/StylePicker.vue` (+ rà khối mới) | 0,1 ngày | ✅ |
| 10 | — | — | Audit xác nhận (Codex chạy lại probe trên bản sửa) | `docs/audits/2026-11-09-ct-11-muc/` | — | ⏳ |

Tổng khoảng **3–4 ngày công**. Sau khi xong 1–9 và có xác nhận ở dòng 10 → mới merge `main`.

## Chi tiết từng việc

### 1. CT-001 (P0) — HTML nhập vào gọi được mạng qua popup/WebSocket
**Hiện trạng:** `browserService.withPage` chỉ chặn request của tab chính. Tab do `window.open` mở và kết nối WebSocket không bị chặn
(bằng chứng: `evidence/browser-probe.log`, `evidence/claude-ct001-proxy-probe.log`).
**Sửa:**
- `getBrowser()`: thêm cờ `--proxy-server=http://127.0.0.1:9`, `--proxy-bypass-list=<-loopback>`, `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`.
  Cờ áp cho cả trình duyệt (thumbnail, PDF, nhập HTML) — cả ba chỉ dùng `data:`/`blob:` nên không ảnh hưởng.
- `inspectHtmlDeck`: chạy trong `browser.createBrowserContext()` riêng; nghe `targetcreated` → đóng tab có `opener` thuộc context đó; hết giờ thì đóng cả context.
- Chèn `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:">`
  vào đầu `<head>` của HTML lạ trước `setContent` (kiểm lại tệp mẫu 137 MB vẫn chạy JS của bài).
- Sửa chú thích đầu tệp `browserService.js` cho đúng cơ chế mới; cập nhật `memory-bank/08-security-model.md` + `09`.
**Test (`test/integration/`, Chromium Linux trong Docker):** máy chủ thử nghe loopback; HTML thử fetch / img / iframe / popup / WebSocket / EventSource /
sendBeacon / Worker / chuyển trang / WebRTC / `file://` → **0 request** tới máy chủ thử. Không còn tab con sau job. Tệp mẫu
`/Users/tuanbui/Downloads/MISA_Xu_huong_lua_dao_va_Phan_xa_an_toan-4.html` vẫn ra 38 trang, 5 video. Thumbnail + PDF của bài thường vẫn đúng.
**Để sau (cổng G, cùng DevOps):** worker nhập HTML riêng, không egress, không mount secret.

### 2. CT-008 (P1) — sửa ô số "0,123" thành 123
**Hiện trạng:** `ChartFields.show()` hiển thị `0.123` thành `"0,123"`, rồi `parseNum` coi `,123` là nhóm nghìn. Bị ảnh hưởng: mọi số có đúng 3 chữ số thập
phân (0,123 → 123; 1,234 → 1234; −0,125 → −125).
**Sửa:**
- `shared/deck/chart.js`: thêm `parseCell(text)` — dấu phẩy luôn là thập phân, dấu chấm là nhóm nghìn (bỏ đi). Ô chỉ có dấu chấm dạng `1.5` (không đúng nhóm 3
  chữ số) vẫn hiểu là thập phân cho người quen gõ kiểu Anh. Thêm `showCell(n)` (định dạng cho ô, không nhóm nghìn, dấu phẩy thập phân).
- `ChartFields.vue`: `onCell` dùng `parseCell`; `show` dùng `showCell`; `bad()` dùng `parseCell`. Dán bảng giữ `parseTable` (đoán định dạng).
**Test (`test/unit/layouts-dot5b.test.js`):** `parseCell(showCell(n)) === n` với 0,001 / 0,123 / 1,234 / −0,125 / 12,5 / 1234,5678 / 1e12; gõ "1.234,5" → 1234,5;
gõ "1,5" → 1,5. Chạy lại `tmp/ui-dot5b.mjs` (sửa ô 0,123 → 0,124 phải lưu 0.124).

### 3. CT-006 (P1) — đổi Ý chính 12 mục sang Quy trình mất 2 mục
**Hiện trạng:** `useEditor.changeLayout`: `s[to] = s[from].slice(0, SPEC_LIMITS[to]); s[from] = []` (items 12 → steps 10).
**Sửa:**
- `StylePicker.vue` (`asLayout`/kiểm hợp): bố cục đích có giới hạn nhỏ hơn số mục hiện có → ô mờ + lý do "Quy trình tối đa 10 bước — trang đang có 12 mục".
- `changeLayout`: nếu `s[from].length > SPEC_LIMITS[to]` → không đổi, trả `false` để giao diện báo; bỏ hẳn `slice` cắt.
- Ô chọn "Bố cục trang" (dropdown) cũng phải qua cùng kiểm tra.
**Test:** composable với 10/11/12 mục; đổi qua lại; kiểm nội dung từng mục (không chỉ đếm); hoàn tác.

### 4. CT-002 (P1) — "giữ nguyên nội dung" có thể thiếu trang/cắt chữ mà không báo
**Sửa:**
- `generateOutline` (chế độ `keep` + biết `pageCount`): số trang dàn ý ≠ `pageCount` → gọi AI lại 1 lần, nêu số trang cần có và trang thiếu. Vẫn lệch →
  hoàn tất nhưng lưu `outline.warnings: [{ code: 'PAGE_COUNT', expected, actual }]`.
- `outlineService` (chế độ `keep`): dòng thứ 13 trở đi dồn vào dòng 12 (nối bằng xuống dòng); dòng > 400 ký tự không cắt — tăng giới hạn riêng chế độ keep,
  kèm cảnh báo `{ code: 'PAGE_TOO_LONG', page }`. Kiểm `normalizeSpec`/renderer khi dựng bài vẫn chịu được (hoặc dựng bài cũng cảnh báo, không cắt im lặng).
- `OutlinePage.vue` desktop + mobile: hiện cảnh báo nổi bật đầu trang (MDS alert), có danh sách trang liên quan.
- Không chèn trang trống để đủ số.
**Test:** AI giả trả 2/3 trang, 4/3 trang, đảo trang, 13 dòng, dòng 500 ký tự → có cảnh báo đúng, chữ không mất, tối đa 2 lời gọi AI. > 40 trang vẫn 422,
0 lời gọi AI.

### 5. CT-003 (P2) — video hỏng lọt qua đường tạo bài / nhập HTML
**Sửa:** hàm chung (ví dụ `ingestVideo`) gồm kiểm `broken` → poster → lưu → enqueue, dùng cho `addVideo`, tạo bài (`storeUserMedia` ~dòng 361) và
`storeVideoBuffer` (~dòng 259). Tạo bài: video hỏng → 422 `INVALID_VIDEO`. Nhập HTML: bỏ video hỏng, cộng vào `skipped`, bài vẫn nhập được. Lỗi giữa chừng
thì xoá tệp vừa ghi. Thiếu ffmpeg: log cảnh báo 1 lần + báo trong `/api/health`.
**Test:** MP4 giả `ftyp` + rác qua cả 3 đường; video hợp lệ (`test/fixtures/tiny.mp4`) vẫn qua; không còn tệp rác.

### 6. CT-004 (P2) — tệp nén mồ côi khi `replaceVideoFile` lỗi
**Sửa (`videoOptimizer.optimize`):** nhớ `key` mới đã `putFile`. Trong `catch`: đọc lại `assets.findById(assetId)`; `storage_key !== key` → `storage.remove(key)`;
bằng nhau (DB đã ghi) → coi là thành công, xoá bản gốc như nhánh thường.
**Test:** repository giả ném lỗi sau `putFile` → không còn tệp mới; ném lỗi nhưng thực ra đã ghi → giữ tệp mới, state `done`.
**Để sau (cổng G):** bộ dọn tệp không còn tham chiếu (dry-run, grace period).

### 7. CT-005 (P2) — không có trần tải video cùng lúc
**Sửa:**
- `config.video.maxConcurrentUploads` (mặc định 4, env `VIDEO_MAX_CONCURRENT_UPLOADS`): middleware giữ chỗ **trước** `videoUpload` (multer) ở
  `POST /:id/videos` và đường tạo bài có video; vượt → 503 `UPLOAD_BUSY` "Máy chủ đang xử lý nhiều video, vui lòng thử lại sau ít phút". Trả chỗ khi xong,
  lỗi, hoặc `req` `close`.
- `videoOptimizer.inspect` chạy trong `Semaphore(3)` riêng; `stats()` thêm `inspecting`.
**Test:** 5 lượt đồng thời với trần 4 → lượt thứ 5 nhận 503, không để tệp tạm; client ngắt giữa chừng → trả chỗ. 30 `inspect` → tối đa 3 chạy cùng lúc.

### 8. CT-007 (P2) — ảnh đang tải chèn nhầm trang
**Sửa (`useImageDrop.onDrop`):** lấy `slideId = slide.id` trước `await`. Sau `await`, tìm lại chỉ số theo id; không thấy → toast "Ảnh đã tải vào thư viện của
bài nhưng trang đích đã bị xoá", không chèn. Thay ảnh trong ô: kiểm lại `mediaTarget(slide, path)` sau `await`.
**Test:** composable với upload treo; xoá trang đích rồi trả kết quả → không trang nào nhận ảnh; đổi thứ tự trang → ảnh vào đúng trang theo id.

### 9. CT-009 (P2) — nút chữ cao 18px trên mobile
**Sửa:** nút "Đổi sang bố cục khác" thêm `min-h-11` (44px) khi màn cảm ứng (`pointer: coarse`), chữ giữ 13px. Rà luôn các nút chữ/biểu tượng nhỏ trong khối
CT: ô điểm lấy nét, nút "+ Chuỗi", nút xoá hàng/chuỗi của `ChartFields`, chip vị trí ảnh nhấn.
**Test:** `tmp/ui-dot5b.mjs mobile` đo mọi nút trong khu "Kiểu trình bày" + "Dữ liệu biểu đồ" ≥ 44px.

## Cổng G — trước khi giao production (không chặn merge)
Worker nhập HTML không egress (CT-001 lớp 2) · manifest trang có ID xuyên suốt (CT-002 dài hạn) · bộ dọn tệp mồ côi (CT-004) · lease/claim job, metrics
theo công đoạn (CT-005) · tải 500 người + sự cố + sao lưu/khôi phục (`03` mục G, `docs/LOAD-TEST.md`, `docs/RUNBOOK.md`) · ma trận thiết bị thật (cảm ứng,
trình đọc màn hình, Android/iOS).
