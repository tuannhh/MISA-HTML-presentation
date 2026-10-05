# 10 — Lịch sử phát triển

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
