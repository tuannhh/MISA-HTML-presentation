# 10 — Lịch sử phát triển

## 2026-10-07 — Chia sẻ theo người + handoff phiên bản

### Yêu cầu (chủ dự án)
Mỗi người là 1 tenant. Bật **công khai** chỉ cho người khác **xem bản trình chiếu**. Chủ bài thiết lập quyền từng người **Chỉ xem / Chỉnh sửa**. Người sửa được **handoff** bản họ thấy ổn, tối đa **5 bản**; khôi phục không chọn handoff → về **bản đầu tiên chủ bài chia sẻ**.
Chốt qua câu hỏi: mời từng người theo email · chủ bài + người sửa đều handoff, chỉ chủ bài khôi phục · đủ 5 bản phải xoá bớt (không tự đẩy bản cũ) · người chỉ xem/công khai **vẫn** tải HTML/PDF và nhân bản.

### Thay đổi (chi tiết `03` bảng mới, `04` §Chia sẻ theo người, `05` §4, `08`, `09` §Chia sẻ)
- CSDL: changelog `20261007_100000` — `presentation_shares` (PK bài+người, role viewer/editor), `presentation_versions` (kind baseline/handoff, ảnh chụp spec/title/ratio, `baseline_lock` sinh + unique → 1 bản gốc/bài), tạo bản gốc cho bài đang công khai.
- Backend: `shareRepository`, `versionRepository` (`ensureBaseline` chịu song song, `createHandoff` transaction + `FOR UPDATE`), `sharingService` (mời/đổi/gỡ, liệt kê/handoff/xoá/xem lại phiên bản); `presentationRepository.accessRole`/`findReadable` + `scope=shared`; `presentationService` 3 cổng `owned`/`editable`/`readable`, người sửa ghi vào tenant chủ bài, `restore`, `toDto` thêm `access`/`shareRole`; `templateService.apply` theo tenant chủ bài; preview `edit=1` cho người sửa; rate-limit `share`; 9 endpoint mới.
- Frontend: `useSharing`, `useVersions`, `SharePanel`, `VersionsPanel` (xác nhận ngay trong panel); `deckActions` theo vai trò (`deckAccess`/`deckTarget`/`deckMenuItems`/`deckNav`); route `/shared` + mục sidebar "Được chia sẻ với tôi" + bottom nav mobile 5 mục; trình soạn thảo: nút "Chia sẻ" (chủ) thay công tắc Công khai, "Phiên bản" (MDrawer 520px desktop / FullScreenSheet mobile); trang xem: "Chỉnh sửa" cho người sửa, Back theo `deckNav`. Icon mới `history`, `restore`, `user-plus`, `user-share`, `flag`.
- Hành vi đổi: người khác PATCH bài công khai trả **403 `VIEW_ONLY`** thay vì 404 (đã xem được bài, thiếu quyền sửa).

### Kiểm chứng
- `npm test`: 120 test / 119 đạt / 0 lỗi (1 skip sẵn có); `test/unit/sharing.test.js` 5/5 (accessRole, mời, handoff, xoá bản, khôi phục); `brand-rich.test.js` thêm ca người sửa áp mẫu → tệp/asset thuộc tenant chủ bài.
- `npm run build` OK; Docker `docker compose up -d --build app` (8088) + migration; smoke **TẤT CẢ ĐẠT**: người chỉ xem (403 sửa/công khai/phiên bản, preview `edit=1` vẫn `present`, tải + nhân bản OK, người lạ 404), người sửa (lưu, tải ảnh vào tenant chủ, `OWNER_ONLY`), handoff ×5 → `HANDOFF_LIMIT`, `HANDOFF_EXISTS`, `NOT_VERSION_OWNER`, `BASELINE_LOCKED`, **6 handoff song song → đúng 1 bản 201**, khôi phục (người sửa 404, `specVersion` cũ 409, mặc định về bản gốc, về 1 handoff), gỡ quyền → 404.
- Browser pane desktop 1440 + mobile 375 (chủ + người sửa) — xem `06` §Đã kiểm chứng 2026-10-07. Không cuộn ngang.
- Chưa kiểm chứng: máy thật/host MISA AMIS; khung xem lại phiên bản trong browser pane (pane chặn iframe sandbox — đã kiểm nội dung bằng `fetch`).

## 2026-10-07 — Giới hạn truy cập theo IP mạng MISA (`IP_ALLOWLIST`)

### Yêu cầu
Backend chạy trên máy chủ MISA, chỉ cho truy cập từ IP MISA. Thiết lập cơ chế trước; IP cụ thể DevOps cài sau. (Không deploy Cloud Run.)

### Thay đổi (chi tiết `08` §Giới hạn IP)
- `src/lib/ipAllowlist.js` (`parseIpAllowlist`, `createIpMatcher`, `normalizeIp` — `net.BlockList`, IP/CIDR/khoảng, IPv4/IPv6), `src/middleware/ipAllowlist.js` (403 JSON/HTML, miễn `/api/health*`, log `ip_blocked` có giới hạn tần suất).
- `config.ipAllowlist` ← `IP_ALLOWLIST` (phẩy/khoảng trắng), mục sai → fail-fast; `server.js` cảnh báo khi production để trống; `app.js` gắn middleware ngay sau helmet.
- `.env.example` (`IP_ALLOWLIST=` + hướng dẫn), `deploy/nginx/default.conf` (khối `allow/deny` tuỳ chọn, ghi chú `real_ip`).
- Tài liệu DevOps `docs/DEVOPS-NETWORK.md` (liên kết từ README): chiều vào (IP_ALLOWLIST, TRUST_PROXY theo mô hình, lệnh kiểm tra), chiều ra (Gemini bắt buộc; Pixabay, Google Docs/Drive, YouTube, link bất kỳ theo tính năng; những gì KHÔNG gọi ra), trình duyệt người dùng, build image, checklist. Lưu ý: chưa hỗ trợ proxy ra ngoài bắt buộc (safeFetch kiểm IP lúc kết nối).

### Đã kiểm chứng
- Unit 114/114 (mới `ip-allowlist.test.js` 5 test: so khớp, mục sai, cấu hình, middleware 403 JSON/HTML + health mở + không tin XFF khi `TRUST_PROXY=0`, sau 1 proxy IP giả chèn trước bị bỏ).
- Docker 8088 (override compose tạm): danh sách không chứa IP host → `/`, `/api/auth/me`, `/deck-assets/deck3d.js` = 403, health 200, XFF giả vẫn 403, container healthy; danh sách chứa IP host + `TRUST_PROXY=1` → trực tiếp 8088 và qua Nginx 8090 đều 200, XFF giả qua proxy bị bỏ. Trả lại cấu hình thường (danh sách rỗng) → smoke **TẤT CẢ ĐẠT**.

## 2026-10-06 — Trình chiếu từng ý (bút trình chiếu), phóng to khi bấm, nền 3D + logo nổi khối (three.js)

### Yêu cầu
Người dùng hỏi xuất PowerPoint có giữ hiệu ứng không, bấm Next trên bút trình chiếu có hiện từng phần không, rê chuột/bấm để phóng to,
tích hợp 3D three.js — rồi chốt: làm (1) hiện từng ý theo bấm, (2) bấm phóng to/thu về, (3) 3D; **giữ xuất HTML + PDF, không xuất PowerPoint**.

### Thay đổi (chi tiết `05` §14)
- Engine: `buildSteps` (ý = `UNIT`, phần tử `.fe[data-step]`), `stepBy`/`applySteps`, hiệu ứng ý chạy từ lúc bấm (`SF`), `data-wait`/`data-past`;
  phóng to `zoomTo`/`zoomOut` (`translate`/`scale` độc lập, `data-z` qua `ZOOM` + ngưỡng 1,15×), chế độ `tour`; màn đen `.`/B, F5; `deck:step`, `deck:cmd`, `deck:slide` thêm `step/steps`.
- Spec: `slide.build` (`BUILDS` step/dim/tour), `elements[].step`, phần tử `logo3d` (`image`, `motion`, `depth`), nền `globe3d/terrain3d/galaxy3d/city3d` (`BACKGROUNDS`).
- 3D: `shared/deck/bg3d.js` (tên, `FALLBACK_2D`, `uses3d`), `shared/deck/deck3d.js` (three.js: 4 cảnh + `createLogo3D`), `deck3d-entry.js`, `scripts/build-deck3d.mjs` → `dist/deck-runtime/deck3d.js`;
  `renderService` nhúng inline (bản tự chứa) / `<script src>` (khung xem trước) qua `preJs`/`preSrc` của `renderDeckHtml`; route `/deck-assets/deck3d.js`; ảnh ký thêm ACAO `*`; Dockerfile COPY script build.
- Giao diện: `SlideFields` (mục Trình chiếu + Áp cho mọi trang), `FreeElementsPanel` (Hiện khi bấm, Logo 3D), `BackgroundPicker`/`DeckBgCanvas` (4 ô 3D), `useDeckFrame` + 2 `ViewerPage` (Trước/Sau theo ý, bộ đếm ý, phím bút trình chiếu), icon MDS `cube`.
- Sửa phát hiện khi kiểm thử (`09`): slide cũ chặn cú bấm ~1,2 s; thumbnail (present + goto) ẩn ý chờ / logo chưa vẽ; canvas WebGL không dùng lại sau `forceContextLoss`; vite build gói 3D đọc `.env`.

### Đã kiểm chứng
- Unit 109/109 (mới `present-3d.test.js` 6 test: build/step normalize + an toàn thuộc tính, `UNIT` phủ mọi bố cục có ý, `FALLBACK_2D` engine ↔ `bg3d.js`, logo3d normalize/kẹp/asset/drop, gói 3D inline chỉ khi dùng 3D, khung soạn thảo tải qua URL có băm).
- `npm run build` OK (chunk `deck3d` 539 KB / gzip 135 KB, tải động); Docker build + smoke **TẤT CẢ ĐẠT**.
- `tmp/steps-test.mjs` (Chrome cục bộ): step 6 thẻ (bấm/lùi), dim làm mờ, tour phóng 2,7× lần lượt rồi thu về, trang tự do 2 phần tử chờ, quay lại trang trước hiện đủ, bấm phóng 2,4× + Esc, màn đen.
- `tmp/d3-test.mjs`: 4 nền 3D tông tối + globe tông sáng + logo 3D (WebGL) + chế độ sửa ảnh phẳng, không lỗi console.
- `tmp/present-e2e.mjs` trên Docker: lưu spec nền `globe3d` + logo3d + build step/dim/tour; preview có `<script src=/deck-assets/deck3d.js?v=…>`, ảnh ký có ACAO; trang xem: nền 3D trong khung sandbox, logo 3D WebGL, PageDown từ trang cha hiện ý, nút Sau theo ý (bộ đếm "3 / 6 · 1/5"), bấm khối phóng + Esc thu; mobile 390px nút ≥44px không cuộn ngang; xuất HTML chạy offline (file://, chặn mạng) có nền + logo 3D + ý chờ; PDF 6 trang hiện đủ ý, logo nghiêng tĩnh (pdftoppm).
- `tmp/ui-present.mjs`: mục Trình chiếu + "Áp cho mọi trang" (toast 4 trang), bảng Logo 3D, 4 ô nền 3D có canvas WebGL; mobile mục Trình chiếu không cuộn ngang. `tmp/thumb-local.mjs`: thumbnail trang build=step hiện đủ 6 thẻ, không WebGL → nền 2D dự phòng.

### Còn để ngỏ
- Chưa thử bút trình chiếu vật lý (Logitech…) — đã phủ phím PageDown/PageUp/F5/Esc/"." theo chuẩn phổ biến.
- Bài xuất HTML có 3D nặng thêm ~540 KB; máy yếu có thể giật khi vừa nền 3D vừa nhiều logo 3D (mỗi logo 1 ngữ cảnh WebGL, chỉ trang đang chiếu).
- Dữ liệu thử trên MySQL Docker: bài `t8dlsk8w` (tài khoản `brand-a-*`) nay có trang "Logo 3D", nền `globe3d`, build trên 3 trang.

## 2026-10-06 — Màu chữ / xuống dòng / VIẾT HOA trên khung, chọn bố cục + ảnh-logo, tông be-trắng, bộ nhận diện thương hiệu + mẫu

### Yêu cầu
(1) Sửa được màu chữ, Enter xuống dòng, ngắt chữ hợp lý, nút VIẾT HOA khi bôi chữ; (2) chọn bố cục, chèn thêm ảnh hoặc logo
(ảnh chụp: thẻ OpenAI/Gemini/Grok/Claude/DeepSeek chỉ có tên biểu tượng); (3) thêm tông nền sáng be/trắng vẫn "công nghệ";
(4) template theo nhận diện công ty/chiến dịch: tải lên trang bìa, nền, header, footer, trang sub, trang cảm ơn.

### Thay đổi (chi tiết `05` §13)
- `shared/deck/rich.js` (mới): chữ định dạng `⟦màu,b,n⟧…⟦/⟧` + `\n` lưu trong chuỗi; normalize đếm theo chữ hiển thị; renderer `span.rt`, `data-ml`/`data-pl`.
  Engine: thanh định dạng nổi `#rtb` (màu theme + chọn màu, đậm, HOA/thường/Hoa Đầu Từ, giữ liền, xoá), Enter xuống dòng ở trường nhiều dòng.
- Chọn bố cục: chip "Kiểu trình bày" + "Phong cách trình bày"; `IconPicker` (lưới biểu tượng + ảnh/logo thay biểu tượng `items[].image`, `.ib-img`);
  lớp chèn đè `elements[]` trên mọi trang (`.free.over`, thêm Logo/chữ/ảnh/hình).
- 6 tông sáng mới sand, latte, linen, pearl, frost, blossom (`palette.js`); chữ trên màu nhấn tự chọn trắng/đậm theo tương phản.
- Bộ nhận diện `spec.brand` (6 ô ảnh + `footerText` + `tones`), asset kind `brand`, `POST /:id/brand`; renderer `brandFor` (bìa/sub/kết riêng; trang nội dung = nền + dải đầu/chân, chiều cao theo ảnh, có trần).
  Màu chữ theo độ sáng ảnh: giao diện đo khi đặt ảnh → `tones` → `ink-light`/`ink-dark` + `inkVarsCss`.
- Mẫu thương hiệu: bảng `design_templates` + `template_assets` (changelog `20261006_200000`, `REQUIRED_CHANGELOGS`, baseline), `/api/templates` (list/create/patch/delete/assets) + `POST /:id/templates/:templateId/apply` (201); ảnh sao chép khi lưu/áp.
- Giao diện: `BrandSettings` (tab Thương hiệu ở `DesignPanel`, dùng cả bước dàn ý), `DesignPreview` vẽ bộ nhận diện; `useMedia` thêm API thương hiệu/mẫu; desktop + mobile.
- Sửa phát hiện khi kiểm thử (`09`): engine mất `editable/bindEditables` sau khi chèn khối định dạng; lớp `.ib.im` trùng `.im` (ô ảnh cao 420px) → `ib-img`;
  bìa thương hiệu ép mất cột ảnh → `:has(> .cv-art)`; trang kết ảnh tối trên bài sáng không đọc được → `tones`; `--accent` chốt giá trị gốc → khai báo lại trong `inkVarsCss`.

### Đã kiểm chứng
- Unit 103/103 (mới `brand-rich.test.js` 15 test: rich parse/an toàn/cắt/repaint/formatRange, normalize theo chữ hiển thị, renderer `span.rt`/`data-ml`/`data-pl`, ảnh mục `.ib-img`,
  chèn đè `.free.over`, brand normalize/collect/drop/remap, dải đầu/chân `--bt`/`--bb`, `tones` + `ink-light/ink-dark` + tương phản `inkVarsCss` mọi tông, tông sáng mới,
  `editPaths`, variants theo chữ thuần, `templateService` với repo giả: sao chép ảnh, `FOREIGN_ASSET`, `INVALID_MEDIA`, 404, `INVALID_NAME`, áp riêng tư/công khai, không phải chủ sửa/xoá → 404).
- `npm run build` OK; Docker: changelog chạy 2 lần (idempotent), smoke **TẤT CẢ ĐẠT**.
- `tmp/brand-api.mjs` (2 tenant, Gemini thật): dựng bài, tải ảnh nhận diện ở bước dàn ý + sau dựng, lưu spec, ảnh tenant khác → 422, xem trước/xuất HTML có dải + chữ màu, mẫu riêng tư/công khai/áp/nhân bản, thu hồi → 404 — **TẤT CẢ ĐẠT**.
- Puppeteer trên Docker: `tmp/ui-brand.mjs` (bôi chữ → màu vàng + VIẾT HOA + Enter → Ctrl+S lưu đúng `⟦amber⟧DOANH NGHIỆP⟦/⟧\nHà Nội 2026`; chip Bento; IconPicker; chèn đè; tab Thương hiệu 6 ô + mẫu; tông sáng; mobile 390px tab Thương hiệu — nút Chữ tối/sáng cao 44px, không cuộn ngang `tmp/mobile-ink.mjs`),
  `tmp/ui-tones.mjs` (tải ảnh trang kết tối qua hộp chọn tệp thật → tự chọn "Chữ sáng" → lưu `tones.closing='dark'` → khung có `ink-light`; chọn "Chữ tối" → bỏ lớp), `tmp/brand-export-shots.mjs` (5 trang bản xuất HTML: bìa, dải đầu/chân, bento có logo, trang kết đọc rõ).

### Còn để ngỏ
- Bài đặt ảnh nhận diện trước khi có `tones` (hoặc qua API) giữ màu chữ theo tông bài cho tới khi người dùng chọn "Chữ sáng/Chữ tối" hoặc đặt lại ảnh.
- Dữ liệu thử trên MySQL Docker (người dùng `brand-a-*`/`brand-b-*`, vài mẫu công khai thử) chưa dọn.

## 2026-10-06 — Bản cập nhật lớn: sửa trực tiếp trên khung xem trước, trang tự do, ảnh AI / Internet, chỉnh sửa ảnh, đường dẫn thân thiện

### Yêu cầu
(1) Sửa chữ ngay trên bản xem trước thay vì form từng trang, lưu từng trang rồi làm tiếp; (2) chèn trang trắng — gợi ý/chọn bố cục,
thêm bảng, ảnh, video, chỉnh cỡ/vị trí; (3) ảnh: AI tự sinh ảnh hợp nội dung bằng Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`, 1K),
bấm ảnh để đổi — tải lên / tìm Internet theo từ khoá (chốt dùng **Pixabay**) / tạo bằng AI theo mô tả; AI tự tạo ảnh khi dựng bài là
**tuỳ chọn ở màn Tạo, mặc định bật**; (4) công cụ sửa ảnh đơn giản kiểu Gamma (cắt, xoay, sáng/tối, độ rực, giữ khung nhưng dịch/zoom ảnh),
không dùng AI; (5) đường dẫn `/ten-bai/<8 ký tự ngẫu nhiên>/tinh-nang`.

### Thay đổi (chi tiết `05` §12)
- DB: `presentations.short_code` (changelog `20261006_090000`, `REQUIRED_CHANGELOGS`), route `:id` nhận UUID hoặc mã; router giao diện
  `/:slug/:code/(outline|edit|view)` + chuyển hướng `/p/:id/...`; `useDeckUrl` tự sửa tên bài trên URL.
- Renderer dùng được cả trên trình duyệt (`deckParts`), chế độ `edit` (`data-e`/`data-m`), layout `free` (`shared/deck/free.js`, ngoài `AI_LAYOUTS`),
  ảnh có `src`/`edit`/`pos`/`zoom`. Engine: chế độ sửa (contenteditable, chọn/kéo/đổi cỡ/hít lề, phím tắt, `deck:render` thay slide tại chỗ,
  Ctrl/Cmd+S). Giao diện: `useLiveDeck`, `useSlideMedia`, `ImageStudio(Panel)`, `ImageEditor` (Cropper.js), `InsertSlidePanel`,
  `FreeElementsPanel`, `RangeField`, `mobile/FullScreenSheet`; màn Tạo có ô "Ảnh minh hoạ AI".
- Máy chủ: `geminiService.generateImage` + `imagePrompt` trong `designDeck`; `illustrate()` khi dựng bài; `stockImageService` (Pixabay);
  `applyImageEdit` (sharp); API `assets/:id/edit`, `images/generate`, `images/import`, `GET /api/images/search`; rate-limit `aiImage`,
  `imageSearch`; CSP ứng dụng cho ảnh xem trước Pixabay. 22 icon Tabler mới (`09`).
- Sửa phát hiện khi kiểm thử (`09`): sharp luôn xoay 90° trước khi lật → lật ở lượt riêng; `modulate` lệch màu so với CSS → công thức bộ lọc CSS;
  `applyFrameEdit` nhận nhầm khoá `__proto__` (map thường có prototype — không gây ô nhiễm nhưng trả "đã sửa") → map không prototype;
  khung hoãn dựng lại mãi sau khi người dùng bấm ra ngoài → thêm `document.hasFocus()`; bấm đúp phần tử trang tự do không ăn do
  `setPointerCapture` → lấy phần tử dưới con trỏ.

### Đã kiểm chứng
- Unit 88/88 (mới `live-edit.test.js` 13 test: mẫu trang tự do, chuẩn hoá phần tử, ảnh `src/edit/pos/zoom`, asset trong phần tử, renderer
  edit vs trình chiếu + escape, `applyFrameEdit` allowlist, `mediaTarget/setMedia`, `slugify/deckPath/newShortCode`, Pixabay giả lập fetch
  (lang=vi, nhớ đệm, chặn host lạ/ảnh quá lớn/thiếu khoá), `applyImageEdit` lật+xoay/cắt/sáng/rực/alpha).
- Docker: changelog chạy trên MySQL Docker (51 bài được cấp mã, không trùng); log khởi động che `PIXABAY_API_KEY`.
- Gemini thật: tạo bài từ văn bản với ảnh AI bật → dàn ý 7 trang → dựng 35 giây, 1 ảnh AI (bìa, 4:3, 4,9 giây).
- Puppeteer trên Docker (`tmp/ui-live-edit.mjs`, `tmp/ui-export.mjs`): `/p/<mã>/edit` → `/Ke-hoach-…/<mã>/edit`; gõ tiêu đề trên khung → bản nháp
  + "chưa lưu"; Ctrl+S trong khung → PATCH 200; sửa nhãn ở bảng → khung cập nhật trước khi lưu; Thêm trang "Ảnh trái – chữ phải" → 3 phần tử;
  kéo → toạ độ đổi; bấm đúp chữ → đang sửa; bấm đúp ô ảnh → hộp ảnh; Pixabay 24 kết quả → nhập 201; chỉnh sửa (vừa khung, xoay 90°, sáng −30,
  phóng 140%) → 201, spec lưu `src/edit/zoom`; tạo ảnh AI 201; lưu + tải lại giữ nguyên; mobile 390px: khung + màn con Thêm trang; trình chiếu
  trang tự do không còn chữ hướng dẫn sửa; xuất HTML (có phần tử tự do) + PDF 200; URL tên sai tự sửa.
- Smoke Docker: TẤT CẢ ĐẠT (lần này bước dựng bài xong trong ngưỡng chờ).

## 2026-10-06 — Ảnh giao diện phần mềm từ PDF, tấm nền ảnh, màu nhấn rực hơn

### Yêu cầu
(1) Bài tạo ra chưa đẹp bằng bản giới thiệu AMIS cho DN hoá chất Gia Anh làm tay trước đây; (2) PDF slide có nhiều ảnh giao diện ứng dụng
nhưng không được nhận diện — bài toàn chữ; ưu tiên đưa ảnh UI vào slide: nền trắng dùng ảnh như gốc, nền tối/PNG trong suốt thì đặt trên nền
trắng, cân đối, căn giữa, không mất thông tin; (3) màu chữ có sẵn hơi đậm → cam/xanh rực hơn.

### Thay đổi (`05` §11)
- `pdfShotService` (render trang bằng poppler + `gemini.locateUiShots` khoanh vùng + cắt + bỏ trùng); Dockerfile cài `poppler-utils`; cấu hình
  `PDF_UI_SHOTS*` (`07`). `screenshot` được gắn vào trang, ưu tiên cao trong prompt dàn ý; ảnh UI bỏ sót được chèn không bắt buộc.
- Renderer: tấm nền trắng đúng tỷ lệ ảnh (`.plate`), khung trình duyệt (`frame: 'browser'` trong spec), cột ảnh rộng cho ảnh rất ngang.
- Bảng màu: ngưỡng màu nhấn nền sáng 3:1; ember/paper/sunset/sky/forest/royal/ruby đổi sang tông rực (cam `#F05A22`, xanh `#2563EB`/`#1677FF`).
- Sửa phát hiện khi kiểm thử: bìa kiểu `center` chữ bị co còn 48% do hình trang trí tràn (`09`); tấm nền bị kéo giãn ở trang ảnh + ý (`09`);
  Dockerfile kiểm tra `sharp` nạp được ngay khi build (`09`).
- Số liệu dài ở thẻ thống kê ("270.000+" lưới 4 cột) bị cắt mép (thẻ `overflow: hidden` nên bộ tự co chữ không thấy) → `.stat` là container,
  cỡ `.sv` = min(140px·k, 172cqi / độ dài hiển thị `--sl`).

### Đã kiểm chứng
- Unit 75/75 (mới `ui-shots.test.js`: `boxToRegion`, cắt thật bằng pdftoppm + AI giả lập — trùng/chất lượng thấp/trang lạ/AI lỗi/thiếu công cụ,
  `placeUserMedia force=false`, `frame` qua dàn ý → spec, renderer tấm nền + `--ar` + `.wide`; bảng màu nền sáng ≥ 3:1).
- Gemini thật với PDF mẫu "MISA AMIS OneAI" (20 trang, 50,5 MB, đi đường 2 bước): cắt 10 ảnh UI (~21 giây), AI dùng đủ 10/10
  (`kinds {screenshot:10}`); bản nền sáng (ember, 22 trang) và nền tối (midnight, 20 trang, bìa có ảnh tổng quan, gallery màn hình điện thoại
  không khung trình duyệt) — ảnh căn giữa, ôm sát nền trắng, không tràn chữ.
- Smoke Docker (chạy 2 lần): mọi bước tới "lưu dàn ý" đạt; bước dựng bài vượt ngưỡng chờ 300 giây của smoke vì Gemini `designDeck` mất
  421–533 giây cho riêng đầu vào smoke (bài vẫn `build_ready`), trong khi bài OneAI 19 trang chỉ 46 giây. Code bước dựng bài không đổi
  trong đợt này → độ trễ phía Gemini. Bù lại: xuất HTML + PDF (19 trang, Chromium trong container) của bài OneAI kiểm tay đạt, tấm nền ảnh hiển thị đúng trong PDF.

## 2026-10-06 — Sửa: tab "Tải tệp lên" bấm không mở cửa sổ chọn tệp

- Nguyên nhân: `MUpload.vue` (bản sao MDS) dùng `<label @click.prevent>` bọc `<input type=file>`; `openBrowse()` gọi `input.click()`, sự kiện nổi bọt lên label và bị `preventDefault` → trình duyệt huỷ hộp chọn tệp. Kéo-thả vẫn chạy nên lỗi chỉ lộ khi bấm. Đây là gốc của lỗi "không upload được file" người dùng báo trước đó.
- Sửa: dropzone thành `div role="button"` (Tab + Enter/Space, viền focus), input ra ngoài dropzone (`09` — vá MDS).
- Kiểm chứng: `tmp/ui-filechooser.mjs` (bấm thật + `waitForFileChooser`) — bản cũ ✗ desktop/mobile, bản sửa ✓ bấm chuột, ✓ phím Enter, ✓ mobile; chọn 2 tệp hiện đúng danh sách.

## 2026-10-06 — Ảnh/video gửi kèm khi nhập nội dung (bắt buộc đưa vào bài)

### Yêu cầu
Ở tab Nhập nội dung, cho tải thêm ảnh/video: chữ là cơ sở gợi ý nội dung, media tải lên là thứ cần đưa vào bài; các quy tắc trước giữ nguyên.

### Thay đổi
- API tạo bài nhận thêm `media` + `posters` (`04`); `MAX_CREATE_MEDIA`=20 (`.env.example`). `precheckMedia`, `storeUserMedia`, prompt + schema `UIMGn`/`VIDn`, `placeUserMedia`, ảnh đồ hoạ `fit: contain` (`05` §10).
- Prompt: cấm bịa thông tin liên hệ / tên pháp nhân / tên vùng (trang bìa, trang kết chỉ ghi khi nguồn có) — lần thử đầu AI tự tạo hotline + email.
- Giao diện: `CreateMediaPicker` desktop + mobile (`06`).

### Đã kiểm chứng
- Unit 70/70 (mới `user-media.test.js`: đặt media đủ/trùng/thiếu chỗ/số trang cố định/buộc thêm trang, fit contain, precheckMedia, schema video).
- Gemini thật (nội dung nhập tay + 2 ảnh chụp + 1 infographic + 1 video, 8 trang): mọi media xuất hiện đúng 1 lần — video ở trang khai mạc, 2 ảnh chụp thành bộ sưu tập, infographic ở trang image `contain` kèm số liệu AI đọc từ ảnh; đúng 8 trang; không còn bịa liên hệ; dựng bài `gallery:polaroid`, `image:right` (ảnh contain không bị chọn kiểu tràn trang).
- Chrome headless trên Docker: desktop 1440 + mobile 390 — thêm ảnh/video (ảnh bìa video hiện đúng), HEIC trên Chrome + CSV báo lỗi rõ, nút bỏ 44px mobile, không tràn ngang; gửi thật → dàn ý có đủ 3 media. Smoke TẤT CẢ ĐẠT.

## 2026-10-06 — Sửa khoảng trống lớn dưới footer (cả trang bị cuộn)

### Yêu cầu
Màn Dàn ý (và các màn dài khác) cuộn xuống thấy footer "Hủy thay đổi / Lưu nháp / Dựng bài" trôi lên, bên dưới là mảng nền xám trống lớn.

### Thay đổi
- Nguyên nhân (`09` §Giao diện): vùng cuộn `overflow-y-auto` không `relative` → `sr-only` "Bố cục: …" và bộ đếm ký tự textarea (`absolute`) neo vào `<body>`, kéo tài liệu cao 2065px trong khi shell 900px.
- Thêm `relative` cho mọi vùng cuộn: `DesktopShell` (gốc thêm `overflow-hidden`), `OutlinePage`/`EditorPage` desktop, `MobileShell` (gốc thêm `overflow-hidden`), `ActionSheet`, khung lỗi lưu ở `OutlinePage`/`EditorPage` mobile, `ImagePicker`, `MediaLibrary`.
- Bản sao MDS (`MDataTable`, `MSidebar`, `MDialog`, `MDrawer`; popover `MSelect`/`MCombobox`/`MDropdownMenu` thêm class `fixed`) — **đồng bộ đúng bản vá ở skill MDS gốc** (2026-10-05), không phải vá cục bộ.

### Đã kiểm chứng
- Unit 62/62; Docker build lại. Desktop 1440×900: `/decks /public /account /create /p/:id/outline /p/:id/edit /p/:id/view /admin/users` đều `scrollHeight = 900`, 0 phần tử `absolute` thoát ra `<body>` (trước: màn Dàn ý 2065px). Mobile 390×844: outline/decks/create/edit/account đều 844/844. Dàn ý dài (3306px) cuộn trong vùng nội dung, footer sát đáy.
- Chưa sửa `AuthLayout`/`NotFoundPage` (`min-h-screen`, trang đứng riêng ngoài shell, nội dung ngắn — không gây lỗi này).

## 2026-10-06 — Đa dạng bố cục chạy ngầm, chỉ chèn ảnh thật, tư liệu thô, sửa lỗi tải tệp

### Yêu cầu
(1) Tự phát hiện ảnh infographic vs ảnh chụp thật — chỉ chèn ảnh thật; (2) bố cục gần như một kiểu, làm nhiều bài thấy na ná → tạo nhiều dạng bố cục/phong cách, chạy ngầm; (3) lỗi không tải được tệp; (4) tư liệu thô chưa thiết kế → AI coi là nguồn thông tin và thiết kế lại.

### Thay đổi
- **Ảnh** (`05` §9): Gemini phân loại `imageKinds` + kiểm chéo điểm ảnh `imageTraits` → `keepPhotoImages`. Ảnh slide/infographic trong PPTX không còn bị chèn cạnh số liệu.
- **Nguồn thô** (`05` §9): schema dàn ý thêm `sourceType`; prompt viết lại: tái cấu trúc, khôi phục dấu, phân tích bảng số liệu (số tự tính phải đúng), tiêu đề thông điệp, nhịp chữ/hình.
- **Bố cục**: `shared/deck/variants.js` (57 biến thể / 13 layout + 5 phong cách bài), `artDirect` khi dựng (hạt giống ngẫu nhiên), renderer + `theme.css` (~250 dòng mới: bleed ảnh tràn trang, vòng %, biểu đồ thanh, mũi tên, bậc thang, zigzag, polaroid, mosaic, bento…), engine thêm hiệu ứng `ring`/`grow`. `normalizeSpec` giữ `style`/`variant` hợp lệ.
- **Tải tệp**: thêm đọc XLSX (thay CSV khi xuất Google Sheets), ODS/ODT/ODP, bảng trong DOCX, CSV/TXT UTF-16 & Windows-1258, AVIF; nhận diện OLE (.doc/.xls/.ppt) và HEIC → thông báo cách lưu lại thay vì "định dạng lạ"; HEIC → JPEG trên trình duyệt; tên tệp tiếng Việt (multer `defParamCharset:'utf8'` + NFC); kiểm tra loại tệp phía giao diện trước khi gửi; kéo-thả ảnh vào trang dàn ý; log HTTP dùng `req.originalUrl` (trước đây không ghi được request `/api/*` nào — `09`).
- Sửa phát hiện trong lúc kiểm thử: CSV UTF-16 LE bị nhận là MP3 (BOM `FF FE`) → `looksLikeUtf16` xét trước âm thanh; mốc "T12/2026" bị ngắt dòng ở 4:3; mũi tên quy trình chật ở khung hẹp/tên dài.

### Đã kiểm chứng
- Unit 62/62 (mới: `variety.test.js` — fits/resolveVariant/artDirect xác định & ít lặp, normalizeSpec style/variant, mọi biến thể không lọt XSS, keepPhotoImages, imageTraits, sniff OLE/HEIC/AVIF/UTF-16, decodeText, đọc XLSX/DOCX bảng/ODS); `vite build` sạch.
- Ảnh tổng hợp 57 biến thể × 5 phong cách × mẫu sáng/tối × 16:9/4:3/3:1 + nội dung dài: 0 lỗi trang, không tràn chữ.
- Docker: smoke "TẤT CẢ ĐẠT". Gemini thật: `bao-cao.pptx` → `designed_deck`, ảnh slide bị loại (`kinds {slide:1, photo:1}`), chỉ ảnh hội nghị được gắn; `ghi-chu-tho.docx` (gõ không dấu) → `raw_notes`, dàn ý có dấu, tách việc/người phụ trách/mốc; `so-lieu.xlsx` → `data_table`, tổng 1.947 + tăng trưởng 59,2% (605/380) đúng; dựng ra `stats:plain, timeline:zigzag, cards:rows, closing:minimal`.

### Còn lại / ghi chú
- Không đọc nội dung .doc/.xls/.ppt đời cũ (chỉ hướng dẫn lưu lại) — chưa có tệp mẫu để kiểm chứng parser nhị phân.
- HEIC chỉ tự đổi trên Safari; Chrome/Edge cần người dùng đổi sang JPEG.
- Người dùng chưa chọn được biến thể/phong cách trên giao diện (cố ý — "chạy ngầm"); muốn đổi kiểu → dựng lại bài.

## 2026-10-05 — Quy trình "dàn ý trước", media trong trang, thiết kế (màu/nền/phông/logo)

### Yêu cầu
Người dùng muốn **xem trước nội dung từng trang** thay vì để AI làm xong rồi mới sửa; mỗi trang chèn được ảnh, video tải lên, link YouTube (ảnh bìa 16:9, bấm → tự phát toàn màn hình); 8–10 mẫu nền động chủ đề công nghệ; chèn logo (vị trí, kích thước, tách nền bằng thư viện); chọn phông (Montserrat, Barlow, Inter, Roboto, Google Sans — hiển thị đúng cả khi máy không cài); chọn tông màu tự động / theo gợi ý nền sáng-tối (xanh–đen, xanh–trắng, cam–trắng…) / tự nhập.

### Thay đổi
- **Pipeline 2 bước** (`05` §2): `outlining → outline → generating → ready`. AI lập dàn ý (tiêu đề + các dòng nội dung sẽ hiển thị + bố cục gợi ý); người dùng duyệt/sửa/gắn media/chọn thiết kế; "Dựng bài" → AI trình bày theo đúng dàn ý (`composeDeckFromOutline`: chữ người dùng thắng chữ AI, trang thiếu dựng xác định). DB: changelog `20261005_170000` (status mới, `outline`, `outline_version`, asset kind `video`/`logo`/`poster`). API: `PUT /outline`, `POST /build`, `POST /logo`, `/logo/:id/cutout`, `/videos`, `/youtube` (`04`).
- **Media**: video MP4/MOV/WebM ≤ 150MB (magic bytes, multer ghi đĩa, phát theo Range); YouTube → id + ảnh bìa 16:9 + tiêu đề (oEmbed); khung video 16:9 trong slide; bấm → `deck:video` → `VideoOverlay` (app) phát + fullscreen. HTML xuất nhúng video (≤ `EXPORT_VIDEO_MB`) và tự phát trong tệp.
- **Thiết kế**: 14 mẫu màu (7 tối, 7 sáng) + Tự động + Tuỳ chỉnh 2 màu có gợi ý theo tông; `paletteVars` luôn đảm bảo tương phản ≥ 4.5:1. 10 nền động (`shared/deck/backgrounds.js`). 5 phông đóng gói woff2 tập con tiếng Việt. Logo: 6 vị trí, 40–360px, hiển thị mọi trang/bìa & kết/trang nội dung; tách nền theo màu hoặc AI U²-Net-p (onnxruntime-node, chạy local).
- **Giao diện**: `/p/:id/outline` desktop + mobile (tab Nội dung/Thiết kế, ActionSheet thao tác trang 44px); `ThemePicker` thay `TonePicker` (đã xoá); `DesignPanel` dùng chung bước dàn ý + editor; tab Ảnh/Video trong `SlideFields`.
- **Vận hành**: `verifyTables` kiểm thêm changelog bắt buộc (DB cũ chưa nâng cấp → dừng với hướng dẫn); Dockerfile tắt telemetry onnxruntime + bỏ binary nền tảng khác; `.env.example` thêm `MAX_VIDEO_MB`, `MAX_VIDEOS_PER_DECK`, `EXPORT_VIDEO_MB`.

### Đã kiểm chứng (Docker + Gemini thật)
- Unit 49/49 (mới: `outline`, `backgrounds`, `cutout`); `vite build` sạch.
- Smoke "TẤT CẢ ĐẠT" theo luồng mới: dàn ý 7 trang → cách ly tenant cho dàn ý/media → logo + tách nền, video thật/giả mạo (201/422), YouTube (201) / link lạ (400) → lưu dàn ý (409 khi lệch version, 422 khi sai loại media) → dựng 8 trang giữ đúng tiêu đề đã sửa + media → Range 206 → HTML xuất nhúng phông + video, PDF.
- Browser pane: tạo bài tông tuỳ chỉnh → dàn ý → phông/logo/tách nền/YouTube (lớp phủ tự phát) → dựng (~2,5 phút) → editor; mobile 375px. Chrome headless trên HTML xuất: phông/màu/nền/logo đúng, bấm video → phủ toàn màn hình (YouTube nocookie / blob), Esc đóng, 0 lỗi console.

### Còn lại / ghi chú
- Preview iframe trong browser pane không hiển thị (giới hạn pane — `09`); đã kiểm bằng Chrome headless.
- MDialog (bản MDS) nút đóng 24px / nút chân 32px — dưới chuẩn chạm mobile; chưa vá vì là component MDS.
- Tách nền: tuỳ chọn xoá mọi lỗ trong lòng chữ (`inner`) chưa mở ra giao diện.

## 2026-10-05 — Reverse proxy Nginx cho upload 300MB

- Thêm `deploy/nginx/default.conf` + service `proxy` (profile `proxy`, `nginx:1.28-alpine`) trong `docker-compose.yml`: `client_max_body_size 310m`, `proxy_request_buffering off`, timeout 300/600s, giữ Host + X-Forwarded-Proto, `server_tokens off`, gzip, phân giải lại tên `app` qua DNS Docker (`resolve`) để build lại app không gây 502. Chi tiết + lý do: `07`.
- Giao diện: 413 không kèm JSON (proxy chặn) → thông báo "Tổng dung lượng tệp vượt giới hạn máy chủ cho phép".
- Kiểm chứng qua proxy: 297 MB thành công (75s, Files API, uploads dọn sạch); 301 MB → 413 JSON của app; 330 MB → 413 của Nginx; CSRF/đăng nhập qua proxy OK; app đổi IP → proxy vẫn 200. Unit 18/18, smoke TẤT CẢ ĐẠT.

## 2026-10-05 — Tư liệu đa tệp 300MB, ghi âm + OCR, số trang tự động, tông nền Sáng/Tối

### Thay đổi
- **Nhiều tệp, tổng ≤ 300MB** (`MAX_UPLOAD_MB`, không giới hạn riêng từng tệp, ≤ `MAX_UPLOAD_FILES`=20): multer ghi đĩa `STORAGE_DIR/uploads` (UUID), chặn sớm theo Content-Length, xoá khi job xong / khởi động / quá 12 giờ. Link tải về cũng dùng trần 300MB (link Google Slides > 50MB trước đây báo lỗi).
- **Ghi âm làm tư liệu**: mp3/m4a/mp4/wav/ogg/flac/aac/aiff/webm (magic bytes). Gemini nghe trực tiếp (tư liệu nhỏ) hoặc chuyển thể thành văn bản trước (tư liệu lớn) — `mediaService`.
- **OCR**: PDF scan đọc bằng Gemini (prompt yêu cầu nhận dạng chữ), PDF lớn cắt cụm 100 trang/45MB (pdf-lib) qua Files API; ảnh gửi AI ở 1280px để đọc chữ trong ảnh.
- **Số trang**: "Tự động" (mặc định, AI chọn ≤ 25) hoặc "Tuỳ chỉnh" 3–40 = đúng N trang (sửa lỗi cũ: yêu cầu 7 ra 6 vì prompt cho phép ±2). `capSlides` lưới an toàn phía server.
- **Tông nền Sáng/Tối** (`tone`): AI chỉ chọn theme trong tông. Thêm theme sáng `ember` (cam – đen); viết lại `paper` (xanh dương – đen) — mọi màu chữ/hình ≥ 4.5:1, bỏ vàng/xám nhạt; bỏ glow trên nền sáng.
- **Sửa lỗi hiển thị**: icon tâm trang bìa trắng-trên-trắng ở theme `ocean`/`paper` (thêm `--core`/`--core-ink`); tăng `--dim` theme tối.
- **Giao diện**: ô tải tệp rộng hết khung (MUpload `block`), danh sách nhiều tệp + tổng dung lượng + % tải lên (XHR `uploadForm`), TonePicker, số trang dạng radio; mobile tương ứng.

### Đã kiểm chứng (Docker + Gemini thật)
- Unit 18/18; smoke "TẤT CẢ ĐẠT" (7 trang yêu cầu → đúng 7).
- E2E trực tiếp: PDF scan (chỉ ảnh) + ảnh chụp ghi chú + m4a, tông Sáng, tự động → 6 trang theme `paper`, đủ 7/7 dữ kiện từ OCR + ghi âm.
- E2E hai bước: PDF 47MB/6 trang (cắt 2 cụm, Files API) + mp3, 7 trang, tông Tối → đúng 7 trang, đọc được dữ kiện trang cuối; thư mục uploads trống sau job.
- Giới hạn: 301MB → 413 sau ~2,5s; .exe → 415; 2 loại nguồn → 400.

## 2026-10-05 — Dựng môi trường dev trên macOS

- Clone về macOS, chạy Docker (`APP_PORT=8088`, MySQL dev `127.0.0.1:3307`); smoke test Docker "TẤT CẢ ĐẠT" với Gemini thật.
- Sửa `npm test`: `node --test test/unit/` → `node --test "test/unit/**/*.test.js"` (Node 24 trên macOS/Linux không nhận thư mục làm đối số — xem `09`). Unit 13/13.

## 2026-10-05 — Phiên bản đầu tiên (0.1.0)

### Yêu cầu ban đầu
Ứng dụng "MISA Presentation": nhập tài liệu (tệp/link/nội dung) → AI (`gemini-3.8-flash`) tạo bài trình bày HTML có chuyển động kiểu Remotion/HyperFrames → người dùng sửa chữ/ảnh từng trang, bấm Lưu để render lại → xuất PDF (không chuyển động) hoặc HTML một tệp (media base64). Tỷ lệ 2:1, 4:3, 16:9, 3:1. Chạy trên Docker trước. Đa tenant, chia sẻ Riêng tư/Công khai.

### Quyết định đã chốt với người dùng
| Chủ đề | Lựa chọn |
|---|---|
| Đăng nhập | Cả hai: tự đăng ký **giới hạn domain** (mặc định `misa.com.vn`) + admin cấp tài khoản |
| Cơ sở dữ liệu | MySQL 8 trong docker-compose |
| Hạ tầng | 1 máy chủ, tệp trên Docker volume; storage trừu tượng để chuyển S3/MinIO sau |
| Chuẩn | `xoan-backend-standard` (backend + memory bank), MDS 2.0 (giao diện, composition mobile bắt buộc cho mọi route/vai trò) |

### Quyết định kỹ thuật
- **Spec JSON làm nguồn sự thật**, AI không sinh HTML (an toàn XSS, chỉnh sửa bằng form, render nhất quán preview/HTML/PDF).
- **13 layout + 4 theme** cố định trong `shared/deck`; AI chỉ chọn và điền.
- **Preview trong CSP sandbox** (origin null) + URL ảnh ký HMAC thay vì cookie.
- **Khoá lạc quan** `spec_version` cho lưu đồng thời nhiều tab/thiết bị.
- **Admin không xem bài private** của người khác (cách ly tenant tuyệt đối).
- Giao diện tách **desktop/** và **mobile/** composition, logic dùng chung qua composables; bề mặt chọn theo host/bề rộng, không theo UA.
- Cấu hình dùng `.env` (lệch template `config.json` — xem `07`).

### Đã kiểm chứng
- Unit test 13/13; smoke test Docker (`BASE=http://localhost:8088`) "TẤT CẢ ĐẠT" bao gồm Gemini thật và xuất PDF bằng Chromium trong container.
- Thủ công qua puppeteer: đăng ký/đăng nhập, tạo bài từ văn bản (Gemini sinh 7 trang nhiều layout), sửa trên mobile → Lưu → preview cập nhật, công khai từ ActionSheet, trang quản trị, không cuộn ngang ở 390px/1440px.

### Sự cố trong quá trình làm (xem chi tiết ở `09`)
- Cổng 8080 bị chiếm → `APP_PORT=8088`.
- Tiến trình node cũ giữ cổng 3000 trên Windows khiến sửa CSS không có hiệu lực.
- Vá MDS: MInput/MTextarea chuyển attr, MDataTable `hideTools`.
- HUD engine đè preview nhúng → ẩn khi `body.embed`.

### Việc còn lại / ý tưởng
- Kiểm chứng trong host MISA AMIS thật, safe-area và cử chỉ trên thiết bị thật.
- Adapter storage S3/MinIO; hàng đợi ngoài nếu cần scale nhiều instance.
- Sao lưu tự động DB + volume.
- Test integration (`npm run test:integration`) — thư mục `test/integration/` chưa có test.
