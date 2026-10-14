# 10 — Lịch sử phát triển

## 2026-10-14 — Hoàn tác / Làm lại không giới hạn (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z); tải PDF/HTML chỉ ra 1 tệp (IDM)

- Yêu cầu: (1) Ctrl+Z hoàn tác không giới hạn, Ctrl+Shift+Z (⌘⇧Z trên Mac) làm lại bước liền kề; (2) máy có IDM bấm tải PDF → vừa IDM tải
  (15 MB, mở được) vừa hiện Save As ra tệp 0 KB — chỉ muốn 1 tệp: có IDM thì IDM tải, không thì lưu theo thiết lập trình duyệt.
- (2) Gốc: giao diện tải bằng `fetch` → blob; IDM bắt phản hồi fetch rồi tự tải lại → blob rỗng → tệp 0 KB. Sửa: `POST /:id/exports` dựng + giữ
  tệp (`src/services/exportStore.js`, mã gắn người + bài, 15 phút, Range) → `downloadExport` mở link `GET /:id/exports/:token` bằng tải thường.
  GET `/export.html|pdf` cũ giữ nguyên. Chi tiết `05` §23, API `04`, bảo mật `08`.
- (1) `lib/editHistory.js` (ảnh chụp theo trang, dùng chung chuỗi trang không đổi) + `useEditor` (`watch` gộp 400 ms, `reset` khi mở, `rebase`
  sau lưu, phím ở `window`) + engine `histKey`/`askHistory` → `deck:history` + nút ↶ ↷ desktop (tooltip phím tắt) / mobile (thanh đáy).
  Thêm icon Tabler `arrow-back-up`, `arrow-forward-up` vào `iconRegistry.generated.js`. Chi tiết `05` §24, bẫy `09`, quy tắc `11` (6, 16).
- Kiểm chứng: unit **250** (249 pass, 1 skip `pdftoppm` trong Git Bash) — mới `export-store.test.js` (5), `edit-history.test.js` (7: nhiều bước,
  1000 bước về đúng bản đầu + JSON y hệt, giữ đối tượng trang, rebase, phím tắt, `useEditor` gộp gõ + về bản đã lưu hết "Chưa lưu" + lưu xong
  vẫn hoàn tác); tích hợp HTTP (MySQL tạm `mp-it-mysql`, đã xoá) **44/44** — mới `EXPORT-05` (tải 2 lần, Range 206, người khác/mã sai 404,
  định dạng lạ 400, HTML có CSP sandbox); build OK. Sao lưu `../backups/20261014T074921Z`, `…T075904Z`; bài người dùng `e5updmsl` còn nguyên trước khi
  dựng lại Docker 8088; smoke (`SMOKE_BOOTSTRAP=1`) **TẤT CẢ ĐẠT** (bước mới "tải 2 bước: PDF 5005 KB qua link GET").
  Chrome thật (puppeteer, Docker 8088, bài cũ `da8a2ff3` của tài khoản thử — chỉ sửa bản nháp, chặn mọi lệnh ghi, kết thúc 0 lệnh ghi): nhân
  bản trang → Ctrl+Z / Ctrl+Shift+Z / ⌘Z / ⌘⇧Z / nút ↶ đúng, về bản đã lưu hết "Chưa lưu"; gõ trong ô chữ trên slide → Ctrl+Z trong khung về chữ
  cũ, Ctrl+Shift+Z trở lại; Ctrl+Z trong ô tên bài là hoàn tác chữ của trình duyệt; tải PDF từ menu "Tải xuống" → **đúng 1 lượt tải**, 1 tệp
  `Kế hoạch Chuyển đổi số Phòng Kinh doanh 2027.pdf` 2,43 MB, `%PDF-`, không tạo blob. Mobile 375×812 cảm ứng: 2 nút 48 px ở thanh đáy, không
  tràn ngang, chạm Hoàn tác/Làm lại đúng.
- Chưa kiểm chứng: máy có IDM thật (máy dev không cài IDM) — kiểm theo cơ chế: IDM nhận các lượt tải GET thường + Range, không còn phản hồi
  fetch nào chứa PDF; Safari/iPadOS với bàn phím ngoài (⌘Z) — mới kiểm bằng sự kiện Meta+Z trên Chrome.

## 2026-10-14 — Soạn thảo: chữ không bị cắt, cỡ chữ pt, giãn dòng, độ rộng khung, ngắt dòng; bỏ chữ phụ khi dựng bài; link thư mục Google Drive

- Yêu cầu (kèm ảnh bài "Diễn đàn quốc gia thường niên Văn hóa với doanh nghiệp 2026" trên Docker 8088): (1) bỏ phần chữ phụ khi dựng bài; (2) số
  trang tuỳ chỉnh tối đa 100 — **chủ dự án cho tạm hoãn**, làm sau; (3) thêm nội dung thì bị cắt chữ — cho chỉnh khung nội dung; (4) nhập cỡ chữ
  thay vì chỉ +/−; (5) chỉnh giãn dòng; (6) ngắt dòng tiêu đề còn trống bên phải mà chữ không lên được; (7) link thư mục Google Drive (Drive API).
  Giữ nguyên bài của người dùng (không xoá/sửa; sao lưu DB + tệp trước mỗi lần triển khai: `../backups/20261014T052607Z`, `…T054156Z`).
- (3) Gốc: `fitSlide` chỉ đo scroll, bỏ sót tràn lên trên (trang 5: `.im-glass` 761px trong `.body` 656px) → đo theo khung cắt 4 phía, `safe flex-end`,
  tự co ngay khi gõ (`fitSoon`), co hết mức vẫn tràn → viền + nhãn đỏ "Chữ tràn khung…" (chỉ khung sửa) + tay nắm độ rộng khung `#mvw` (`moves.w`).
  (4)(5) Thanh định dạng có ô "Cỡ … pt" (như PowerPoint) và "Giãn dòng" (`moves.l`), ở cả ô chữ thuần. (6) `text-wrap: balance` → `pretty` + giữ
  liền khoảng số (`span.nb`). (1) Bỏ đoạn mô tả ở `OutlinePage`/`EditorPage` desktop + mobile; `JobProgress` còn 1 thanh tiến trình + 1 dòng trạng thái.
  (7) `src/services/driveFolder.js` (liệt kê phân trang, thư mục con ≤ 2 cấp, lối tắt, xuất tệp Google, lọc loại/cỡ trước khi tải, hạn mức như tải
  tệp lên, lỗi rõ ràng) + `ingestService.readDriveFolder` + `precheckSource(…, { driveFolders })`. Chi tiết: `05` §21, §22; bẫy: `09`.
- Kiểm chứng: unit **238** (237 pass, 1 skip `pdftoppm` trong Git Bash — chạy riêng có Poppler: `visuals` 10/10) — mới: `drive-folder.test.js` (4),
  `layers.test.js` (giãn dòng + độ rộng), `brand-rich.test.js` (khoảng số); build frontend OK. Drive thật (khoá trong `.env`, đã bật Drive API):
  thư mục công khai 3 PPTX → 3 tư liệu + 56 ảnh trong 14 giây; thư mục ghi Zoom → 4 tệp ghi âm, bỏ `recording.conf`; mã giả → `SOURCE_FORBIDDEN`.
  Trình duyệt (bản sao cục bộ chế độ sửa của bài người dùng, dựng từ spec chỉ đọc — không đụng bài thật): 10 trang không còn ô chữ bị cắt; trang 8
  "Cam kết thực thi và hành động giai đoạn" / "2026–2035"; gõ 20 pt → hiện đúng 20 pt, 1 thông điệp lưu; giãn dòng 1,5 áp ngay; độ rộng khung
  27,8% → 12,8% bằng phím, bấm đúp về mặc định; nhãn tràn hiện khi co hết mức. Docker 8088 dựng lại (`up -d --build --no-deps app`); smoke
  (`SMOKE_BOOTSTRAP=1`) **TẤT CẢ ĐẠT**, tự dọn 4 tài khoản smoke.
- Ghi chú (2) cho lần sau: `gemini-4-argon` có `outputTokenLimit` **32 768** (nhỏ hơn `gemini-3.8-flash` 65 536 — số liệu từ API models) nên đổi
  model không giúp bài 100 trang (gọi thử argon xin dàn ý dài: quá 300 giây chưa trả header → hết giờ); hướng đề xuất: dựng bài theo **từng cụm trang** (ref `S{n}` toàn cục, ghép qua `composeDeckFromOutline`,
  `Promise.allSettled` + dựng dự phòng cụm lỗi), nới `AUTO_MAX_SLIDES`/`SPEC_LIMITS.slides`/`outlineSlides`/validate 3–40 ở `useCreate`.
- Chưa kiểm chứng trên trình duyệt: màn đang dựng bài / lập dàn ý (`JobProgress`) — chỉ hiện khi có job chạy (đã qua build, chưa tạo job thử để
  không thêm bài vào tài khoản người dùng).


## 2026-10-14 — Cài Poppler (pdftoppm) cho máy dev Windows; xác nhận image server có sẵn

- Yêu cầu: "xem có thư viện pdftoppm thì cài thêm nhé, để sau này triển khai trên server còn có".
- Server: `Dockerfile` đã cài `poppler-utils` — trong container 8088 có `pdftoppm`/`pdftotext` 22.12.0 + LibreOffice; chạy `test/unit/visuals.test.js` trong container dùng 1 lần từ image `misa-presentation:latest` (mount `test/` chỉ đọc): **10/10, 0 skip** (gồm `extractVisuals` render PDF thật). Không cần đổi image.
- Máy dev Windows: `winget install oschwartz10612.Poppler` 25.07.0 (zip ~16 MB, GitHub `oschwartz10612/poppler-windows`, SHA256 do winget kiểm; thư mục `bin` vào PATH người dùng). Unit **232/232, 0 skip** (trước: 1 skip vì thiếu `pdftoppm`).
- Tài liệu: `07` thêm mục công cụ ngoài cho dev local (Windows/macOS/Linux) + máy chủ không qua Docker; `09` ghi Git Bash có `pdftotext` nhưng không có `pdftoppm`.

## 2026-10-14 — Nguồn link: tối đa 5 link + tự lấy ảnh trong trang

- Yêu cầu: nguồn là đường link (báo, Facebook, Google Drive, website MISA, `*.misa.vn`…) thì tự phát hiện + trích ảnh trong bài để đưa vào slide — không cần lấy hết, chỉ ảnh hợp nội dung; cho nhập tối đa 5 link.
- Quyết định: 1 link lỗi → báo lỗi ngay, ghi rõ `Link n (host): …` (không âm thầm bỏ link); hạn mức ảnh chung `MAX_LINK_IMAGES` (24) chia đều giữa các link (`shareBudget`, link ít ảnh nhường phần dư), ảnh các link xen kẽ; Facebook chỉ đọc thẻ og (tiêu đề, mô tả, ảnh bài công khai), bài riêng tư → `SOURCE_FORBIDDEN`; link thư mục Drive → 400 `UNSUPPORTED_LINK`; chỉ HTML tĩnh (không chạy JavaScript, Chromium vẫn chặn mạng). AI chọn ảnh qua `imageKinds` có sẵn: ảnh web mang gợi ý `ảnh trên trang web "…" — chú thích/mô tả/thuộc mục`, prompt yêu cầu ảnh quảng cáo/tin khác/tác giả → `other`.
- **`src/services/webSource.js`** (mới): `pageMeta` (og/twitter/`image_src`), `mainRegion` (khối nội dung theo class → `<article>` → `<main>` → bỏ header/nav/footer/aside), `findPageImages` (`src`/`data-src`/`srcset`/`<picture>`/`<noscript>`, `figcaption`, tiêu đề mục gần nhất, loại logo/icon/avatar/quảng cáo/chia sẻ/svg/ảnh nhỏ, khử trùng `imageKey`), `fetchImages` (qua `safeFetch`, `Referer` = trang, ≤ 15 MB, 20 giây/ảnh, 4 luồng, cạnh ngắn ≥ 200 px, tỉ lệ ≤ 4, hạn chót chung 90 giây), `webImageHint`.
- **`ingestService`**: `readWebPage` (thêm `Mô tả trang:` khi thân trang chưa có), `precheckSource` nhận `urls` (mảng/chuỗi) + `url` cũ, kiểm từng link, bỏ `#…`, khử trùng, `TOO_MANY_LINKS`; `ingestLinks` tải tuần tự, chia hạn mức 2 vòng; `fetch` tiêm được (test). `decodeXml` chuyển sang `src/lib/html.js` (`decodeEntities`).
- `presentationService`: job lưu `urls`; QR chỉ nhận khi ảnh gần vuông (cạnh dài ≤ 1,6 × cạnh ngắn) — chạy thật thấy banner có chèn QR nhỏ bị AI xếp `qr` và gắn vào trang liên hệ; prompt `geminiService` thêm định nghĩa QR "chiếm gần hết ảnh". Route: `pick` thêm `urls`, multer `fields` = 20 + `MAX_SOURCE_LINKS`. Cấu hình `MAX_SOURCE_LINKS` (5), `MAX_LINK_IMAGES` (24).
- Giao diện (`useCreate` + desktop/mobile `CreatePage`): danh sách ô link (thêm/xoá, đếm n/5), dán nhiều link 1 lần tự tách hàng (thừa → báo bỏ N link), lỗi từng ô (sai địa chỉ, trùng ô khác) + `aria-invalid` + focus ô lỗi đầu tiên; mobile nút 48 px trong shell native.
- Test: `web-source.test.js` (7 — vùng nội dung, lazy-load/srcset/picture, loại ảnh rác, og, Facebook, gợi ý, tải ảnh + lọc + hạn chót, `shareBudget`, `precheckSource`, `ingestSource` nhiều link + lỗi link 2 + FB riêng tư + hạn mức 0). Unit 231 (230 pass, 1 skip `pdftoppm`); integration 43/43 trên MySQL tạm (đã gỡ).
- Chạy thật (Docker 8088, Gemini thật): blog AMIS + misa.vn + Facebook → 24 ảnh ứng viên, 14 trang, ảnh chụp màn hình/sơ đồ gắn đúng trang, trang liên hệ không còn ảnh banner (`qrImages` 0); bài VnExpress → 3 ảnh (2 ảnh thật, 1 sơ đồ) đều được gắn. Trình duyệt: desktop 1440 (dán 6 link → 5 hàng + báo thừa; lỗi từng ô, focus ô đầu) và mobile 375 (shell native, không tràn ngang). Smoke (`SMOKE_BOOTSTRAP=1`, Docker 8088 build mới, Gemini thật) **TẤT CẢ ĐẠT** 18 bước (nguồn văn bản — luồng chung không vỡ), tự dọn 4 tài khoản smoke.
- Lỗi cũ lộ ra khi chạy smoke (từ Roadmap B, ngoài tính năng link): `scripts/create-admin.js` tạo xong admin nhưng không thoát → smoke `SMOKE_BOOTSTRAP=1` kẹt vô hạn. Gốc: `passwordHasher.spawn` gọi `unref()` trước `on('message')` (gắn listener ref lại worker). Sửa: unref sau khi gắn listener, `ref()` khi giao việc / `unref()` khi xong; test tiến trình con không gọi `close()` (code cũ treo 15 giây → đỏ, code mới thoát ~90 ms). Unit sau sửa 232 (231 pass, 1 skip).
- Giới hạn: trang dựng ảnh bằng JavaScript (SPA) không lấy được ảnh; Facebook chỉ có ảnh og; chưa hỗ trợ thư mục Drive; chưa thử trên thiết bị thật.

## 2026-10-12 — Roadmap B (kiểm thử luồng chính + đo tải) + Gate bàn giao DevOps

- Yêu cầu: "làm tiếp theo roadmap phần kiểm thử và kiểm tra trước khi bàn giao cho devops".
- **Test tích hợp qua HTTP** (MySQL thật, AI giả `test/helpers/fakeGemini.mjs` qua `GEMINI_BASE_URL`): harness `test/integration/helpers/httpApp.mjs` (`useHttpApp`, client cookie + CSRF, cổng vào TLS giả); `flows-auth` (6), `flows-deck` (9), `flows-share` (6), `https-proxy` (3). Toàn bộ tích hợp **43/43, 0 skip, ~30 giây**.
- **Đo tải 500 người** (`deploy/loadtest`, `test/load/provision.mjs` + `load.mjs`, kết quả `docs/LOAD-TEST.md`) lộ 3 lỗi, đã sửa đúng gốc + test:
  1. Hàng ảnh bìa không trần → PDF hết giờ 180 giây (88% lỗi), RAM 0,4 → 2,8 GB: `src/lib/coalescingQueue.js` (gộp theo bài, lần lượt), trần hàng xuất PDF → 503 `QUEUE_FULL`.
  2. bcrypt chặn luồng chính (burst 100 đăng nhập ≈ 21 giây đứng): `src/lib/passwordHasher.js` + `passwordWorker.js` (worker_threads, `PASSWORD_HASH_THREADS`).
  3. Pool DB đầy → 500: errorHandler đổi "Queue limit reached." thành 503 `SERVER_BUSY`.
  Sau sửa: thao tác thường 0 lỗi, p99 ≤ 1,1 giây; PDF p95 2,1 giây; RAM ≤ 0,7 GB.
- **Hàng đợi**: `src/lib/jobTracker.js` → `GET /:id` có `queue` (vị trí, đã chờ, dự kiến); `JobProgress.vue` (desktop + mobile, đã soi trên trình duyệt 375 px và desktop); `/api/health/ready` thêm số đo hàng; `Retry-After` cho 503/429.
- **Chromium**: lỗi khởi động/render → 503 `RENDER_UNAVAILABLE`/`RENDER_FAILED` (trước: 500); sau `close()` không mở lại trình duyệt (việc nền sót lại từng làm test treo vô hạn).
- **Gate DevOps**: `scripts/ops/backup.sh`, `restore.sh`, `check.sh`, `scripts/verify-storage.js` (Dockerfile chép vào image); `docs/RUNBOOK.md`. Diễn tập trên stack đo tải: xoá 10 bài + 20 tệp → khôi phục đủ, RTO 11 giây.
- Unit 224 (223 pass, 1 skip — `extractVisuals` cần `pdftoppm`, máy dev Windows không có; Docker có). `npm run build` đạt.
- Chưa làm: soak 1 giờ trên máy chủ thật; bộ vàng Gemini thật; lỗi biết: `<title>` HTML xuất theo `spec.title`, đổi tên từ danh sách chưa cập nhật tới lần lưu kế tiếp. Ghi nhận ngoài phạm vi: header desktop còn nút 9 chấm (quy tắc dự án yêu cầu bỏ) — đã tách việc riêng.

## 2026-10-12 — Kiểu chữ tiêu đề trang: viết hoa đầu câu (mặc định) / VIẾT HOA TOÀN BỘ

- Người dùng báo: tiêu đề các trang đang viết hoa chữ cái đầu mọi từ. Yêu cầu 2 kiểu (viết hoa toàn bộ / chỉ viết hoa đầu câu), mặc định viết hoa đầu câu; luôn viết hoa MISA, AMIS, ASP, AI, JETPAY.
- `shared/deck/textCase.js` (mới): `isTitleCased`, `buildCaseIndex` (bằng chứng tên riêng từ tư liệu), `sentenceCasePlain`/`sentenceCase` (giữ thẻ định dạng), `sentenceCaseOutline`, `sentenceCaseSpec`, `deckTexts`, `TITLE_CASES`. `presentationService`: đổi dàn ý sau `verifyOutlineFacts` (corpus) và bài sau `applyOutlineLinks` (chữ dàn ý), log `recased`. Prompt Gemini thêm `CASE_RULE` (dàn ý, dựng bài, 1 bước).
- VIẾT HOA TOÀN BỘ: `design.font.titleCase = 'upper'` (`specService.cleanDesign`, strict báo lỗi giá trị lạ) → renderer `data-tcase` + engine cập nhật khi xem trước + CSS `text-transform`. Giao diện: radio trong `FontPicker`, xem trước `DesignPreview`, nút sửa bài cũ trong `DesignPanel` (trình soạn thảo).
- Lỗi gặp khi làm: `repaintRich` lệch định dạng khi chỉ đổi hoa/thường → chia lại theo đoạn `parseRich` (`09`).
- Test: `title-case.test.js` (5). Unit 215 (214 pass, 1 skip); `npm run build` đạt. Chưa thử với Gemini thật / trình duyệt cho tính năng này.

## 2026-10-12 — Liên kết (H) + trang "Thông tin liên hệ" / "Chương trình ưu đãi" (L)

- Yêu cầu: chèn được hyperlink (mở tab mới); nguồn có link thì chèn vào bài; trang liên hệ (số điện thoại + Zalo/Viber/Telegram/iMessage, email, địa chỉ, CTA, QR lớn) và trang ưu đãi (QR chiếm 1/2 màn hình) cho mọi nhóm nhân viên — người dùng nhập hoặc AI tự phát hiện từ nguồn. Chốt: không lưu thông tin liên hệ mặc định; QR = tải ảnh hoặc tạo từ link; làm H + L trước B.
- **Liên kết**: `href=` trong chữ định dạng (`rich.js`: `safeHref`, `linkPhrase`, `richLinks`, `hrefWeight`), renderer `<a class="rl" target="_blank" rel="noopener noreferrer">`, engine: nút Liên kết/Ctrl+K trên `#rtb`, trình chiếu bấm link không chuyển trang, khung sửa chặn mở link. Sandbox iframe + CSP xem trước thêm `allow-popups-to-escape-sandbox`.
- **Liên kết từ nguồn**: `ingestService` chèn `[nhãn](URL)` (DOCX/PPTX/HTML), `sourceFacts.js` (corpus + liên kết, `pdftotext`, `/URI` PDF; cấu hình `PDFTOTEXT_PATH`), prompt có danh sách liên kết, `verifyOutlineFacts` bỏ link/số/email/website không có trong nguồn, `applyOutlineLinks` gắn lại khi dựng.
- **Liên hệ / Ưu đãi**: `contact.js`, `brands.js`, `qr.js` (dep `qrcode`), `specService.cleanContact`, layout `contact`/`offer` trong renderer + CSS, `parseContactPoints`/`fillContact`, ảnh loại `qr` của AI chỉ vào trang liên hệ; giao diện `ContactFields.vue`, `slideModel`, `editPaths`, `useSlideMedia` (QR vuông), dàn ý (`OUTLINE_LAYOUTS`, `POINT_HINT`, gợi ý cú pháp liên kết). `mdLinks.js` chuyển sang `shared/deck/` để giao diện dùng chung.
- Test: `hyperlink.test.js` (7), `contact-offer.test.js` (13: kênh liên hệ, chuẩn hoá strict/lenient, asset QR, render + escape XSS, offer QR nửa trang, QR SVG, mdLinks, parseContactPoints, verifyOutlineFacts, dựng bài + gắn link, đọc link DOCX/PPTX/HTML/PDF, editPaths, schema). Unit 210 (209 pass, 1 skip thiếu `pdftoppm`); integration 19/19 trên MySQL tạm; `npm run build` đạt.
- Chạy thật (API cổng 3010 + MySQL tạm, Gemini thật): văn bản có ưu đãi + liên hệ + 2 link → AI lập trang `offer` + `contact`, 2 liên kết giữ đúng (0 bị loại), dựng bài gắn 2 link; trình chiếu: link `tel:`/`zalo.me`/`viber://`/`mailto:`/Maps/website đều `target=_blank`; sửa QR từ link trên form → lưu → QR lớn bên phải (contact) / nửa trang (offer); Ctrl+K chèn link trên khung sửa; mobile 375px không tràn ngang. Đã gỡ MySQL tạm.
- Ghi nhận chưa sửa: AI đôi khi tự thêm tên pháp nhân ở trang bìa ("Công ty Cổ phần MISA") dù nguồn không ghi — quy tắc 3 của prompt đã cấm, chưa có đối chiếu máy cho trường này.

## 2026-10-12 — Triển khai code mới lên Docker local (cổng 8088)

- Người dùng báo bài `li6b4q68` "AI chưa lập được dàn ý". Log `outline_failed`: `TypeError … "data" … Received undefined` tại `storeImage ← storeUserMedia` — đúng lỗi F01 (gọi `storeImage` sai chữ ký khi tạo bài kèm ảnh). Code đã sửa từ `233d348`, nhưng container 8088 vẫn chạy image build 07/10.
- Đã sao lưu DB (`mysqldump`, ngoài repo), chạy changelog `20261012_100000` (chỉ thêm bảng `publications`), `docker compose up -d --build --no-deps app` → healthy. 2 bài lỗi (`li6b4q68`, `lx1nn18f`) giữ trạng thái `failed`: người dùng tạo lại (nút "Tạo lại" → trang tạo bài).
- Phát hiện kèm: bài cũ 05/10 "Kế hoạch Chuyển đổi số Phòng Kinh doanh 2027" mất cả thư mục tệp trên volume (asset còn trong DB) → `GET /api/assets/:id` trả 500 ENOENT thay vì 404. Chưa sửa.

## 2026-10-12 — Chặng A bổ sung (A01–A06) + Xuất bản ra web (domain công khai)

**A01–A06** (review Codex `docs/audits/2026-10-12-codex/09-review-chang-a-codex.md` §5), mỗi mục đỏ → xanh:
- A01 smoke: `test/smoke/provision.mjs` — admin tạm `smoke-admin-<stamp>` mật khẩu ngẫu nhiên (`SMOKE_BOOTSTRAP=1`, chỉ khi `BASE` trùng cổng compose local) hoặc admin có sẵn (`SMOKE_ADMIN_*`, chỉ khoá tài khoản tạo ra); dọn trong `finally` bằng `scripts/smoke-cleanup.js <stamp>` (xoá user `smoke-*-<stamp>` + thư mục tenant, audit `admin.smoke_cleanup`). `scripts/lib/smokeAccounts.js`; Dockerfile chép 2 script. Test `smoke-provision` (unit) + `smoke-cleanup` (integration).
- A02 giao diện: `useEditor` chạy mọi ghi qua `serial()`; `updateMeta` xét bản nháp lúc phản hồi về và giữ `draftVersion`; `useOutline.save` giữ chữ gõ thêm. 4 test mới trong `editor-sync.test.js`.
- A03 hàng đợi: `Semaphore.reserve()` + vé; `presentationService.create/build` giữ chỗ trước mọi `await`, lỗi DB/audit trả chỗ; `queueStats` có `reserved`. `queue-admission.test.js` (burst 50 → đúng 2+20).
- A04 restart: `failStaleGenerating` đưa bản sao dở về `failed` trước luật dàn ý. `recovery.test.js`.
- A05 integration: `test/integration/helpers/testDb.mjs` — DB tạm tên duy nhất, teardown `finally`, không dựng được DB → FAIL (trừ `IT_OPTIONAL=1`); README viết lại.
- A06 công khai: `updateOwned` khoá dòng bài + chụp bản gốc cùng giao dịch (`insertBaseline` dùng chung); test lộ thêm deadlock bật công khai song song + mời người → đã hết. `public-baseline.test.js` (4 test).
- `memory-bank/README.md`: chuẩn backend ghi MISA Backend Standard (xoan là bản thay thế) — F21.

**Xuất bản ra web** (`05` §17, `08`, `docs/DEVOPS-NETWORK.md` §6): bảng `publications` (changelog `20261012_100000`, `REQUIRED_*`), `PUBLISH_BASE_URL` (trống = tắt; DevOps đặt sau), phân luồng theo Host trước `IP_ALLOWLIST`, noindex + robots, header CDN (HTML 60s trình duyệt/300s CDN + ETag; media immutable), ảnh chụp tĩnh + media chép theo revision, chỉ chủ bài, admin liệt kê/gỡ (API), `PublishSection` trong SharePanel (desktop + mobile). Theo phản hồi DevOps: (1) phân luồng theo domain, (2) chặn Google index, (3) mặc định có CDN.
- Test: `publish-site.test.js` (unit 5: slug, cấu hình, phân luồng qua `createApp` thật với IP_ALLOWLIST chặn 127.0.0.1, header, 301/304, media revision cũ 404) + `publish.test.js` (integration 8: vòng đời, không URL nội bộ trong HTML, chỉ chủ, tắt, khoá tài khoản/xoá bài, 6 lần song song, 6 lần xuất bản **đầu** song song — lộ lỗi HTML trỏ media theo mã sai (đỏ 3/3 → sửa `CODE_CHANGED` → xanh), STALE, admin). Windows: `rm` thư mục vừa ghi đôi khi EBUSY/ENOTEMPTY → `removePrefix` thử lại (`maxRetries`) và ghi log thay vì nuốt lỗi. Gài lỗi thử (bỏ kiểm `spec_version`, bỏ điều kiện chủ còn active, bỏ xoá revision cũ) → 4 test đỏ.
- Chạy thật trên trình duyệt (server local + MySQL tạm, `pub.localhost`): xuất bản → trang mở được, ảnh tải từ domain công khai, không lỗi CSP; gỡ → 404; mobile 375px hiển thị đúng; xuất bản lại giữ link.
- Kiểm chứng cuối: unit 190 (189 pass, 1 skip thiếu `pdftoppm`); integration 18/18 × 3 lần (sau đó `publish.test.js` 8/8 × 5 với test lần đầu song song); `npm run build` đạt; **smoke HTTP + Gemini thật trên compose project riêng** (`-p mpsmoke`, cổng 8099, image tag riêng để không ghi đè `misa-presentation:latest`) → "TẤT CẢ ĐẠT", tự dọn 4 tài khoản smoke, `--list` còn 0; phân luồng Host trong container: domain công khai chỉ `robots.txt` 200, `/`, `/api/*` 404 noindex. Đã gỡ stack/volume/image smoke và MySQL tạm.
- Chưa làm: màn admin cho danh sách xuất bản (đã có API); thử kill/restart Docker thật cho A04; đo tải trang công khai.

## 2026-10-12 — Bỏ mọi hạn mức tần suất theo IP

- Chủ dự án chốt: người dùng buộc phải ở trong mạng MISA hoặc VPN MISA nên chung 1 IP; lớp mạng/VPN MISA đã kiểm soát truy cập → bỏ giới hạn theo IP. Trả lời luôn điểm Codex nêu (09 §4: 500 người × 60 req/phút chạm trần IP 30000).
- `middleware/security.js`: bỏ `apiIp` (chốt chặn lụt 30000/phút/IP) và hạn mức chưa đăng nhập theo IP (1200/phút); `api` chỉ đếm người đã đăng nhập (`byUser`: khoá `u:<id>`, `skip` khi chưa đăng nhập); đăng nhập khoá theo email (trước: IP+email); hạn mức nghiệp vụ bỏ nhánh dự phòng `ipKeyGenerator`. `app.js` bỏ `limits.apiIp`; `config.rate` chỉ còn `userPerMin` (bỏ `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_ANON_PER_MIN`).
- **Giữ** `IP_ALLOWLIST` (tuỳ chọn kiểm soát truy cập, mặc định trống) — chủ dự án chọn giữ.
- Test `rate-limit.test.js` viết lại (đỏ 3/4 ở code cũ → xanh): chưa đăng nhập không bị đếm, không còn `apiIp`, đăng nhập sai đổi IP không né được và không chặn lây email khác. `npm test`: 169 pass, 1 skip (máy Windows thiếu `pdftoppm`).
- **Gỡ hẳn đăng ký** (chủ dự án đã chốt bỏ từ 11/10, trước đó mới gỡ giao diện): bỏ `POST /auth/register`, `GET /auth/config`, `authService.register/publicConfig/domainAllowed`, limiter `register`, cấu hình `SELF_REGISTRATION`/`ALLOWED_EMAIL_DOMAINS` (+ hàm `list` trong config), `session.config` và `domainProblem` (code chết) ở frontend. Smoke `provision.mjs` luôn cấp tài khoản qua admin. Biến cũ còn trong `.env` bị bỏ qua.
- Tạo bài/dựng bài vốn chỉ dành cho người đã đăng nhập (route đặt sau `auth`) — không đổi.
- Thêm `docs/ROADMAP.md`: kế hoạch tiếp theo (A bổ sung A01–A06 → tính năng Publish HTML ra domain công khai → B → gate DevOps → C).
- Máy Windows này dùng `~/.claude/skills/xoan-backend-standard` thay cho MISA Backend Standard (chủ dự án xác nhận 2 bộ giống nhau, chỉ khác tên MISA).

## 2026-10-12 — Lưu audit Codex và bằng chứng để chuyển máy

- Theo yêu cầu chủ dự án, đưa hồ sơ audit vào `docs/audits/2026-10-12-codex/`, gồm audit gốc, phản hồi Claude, review chặng A, log kiểm thử và probe tái hiện. Đọc README trong thư mục trước khi đóng gói hoặc tiếp tục ở máy mới.
- Review trên commit `233d348`: 169 unit pass, 5 integration MySQL pass, build đạt; còn A01–A06 trong `09-review-chang-a-codex.md`. Các probe tái hiện lỗi không đồng nghĩa tính năng đạt nghiệm thu.
- Script bằng chứng dùng đường dẫn tương đối; có manifest SHA-256 và hướng dẫn giữ tài liệu untracked/log khi đóng gói. MySQL review đã dọn, chưa chạy tải 500 người hay smoke HTTP/AI thật độc lập.
- Chỉ thêm tài liệu/bằng chứng và cập nhật chỉ mục tri thức; không sửa mã ứng dụng, schema, cấu hình runtime hoặc dữ liệu. Chưa commit/push hồ sơ. Giữ phạm vi một máy chủ/một instance đã chốt.

## 2026-10-11 — Chặng A sau audit Codex (sửa lỗi vận hành)

### Bối cảnh
Codex audit độc lập (hồ sơ `~/Documents/Codex/2026-10-11/y-l-d-n-misa-html/outputs/`, 21 finding F01–F21). Claude kiểm từng điểm trên code
(phản hồi: `08-phan-hoi-claude.md`), hai bên đồng thuận mức ưu tiên; chủ dự án chốt: **1 máy chủ**, cao điểm ước ~500 người dùng cùng lúc,
chuẩn = MISA Backend Standard. Mỗi lỗi sửa theo **đỏ → xanh** (viết test tái hiện trước, xác nhận đỏ, sửa, xác nhận xanh).

### Đã sửa
| Finding | Sửa | Test |
|---|---|---|
| **F01** (P0 thực tế) | `storeImage` gọi sai chữ ký từ commit chia sẻ 07/10 → tạo bài kèm ảnh/video luôn `failed`, ảnh minh hoạ AI thiếu lặng lẽ. Sửa 3 chỗ gọi (`presentationService`) | `service-media.test.js` (tạo bài kèm ảnh; dựng bài có ảnh AI) |
| **F02** | `useEditor`: theo dõi `draftVersion` (phiên bản bản nháp xuất phát) — `save()` gửi phiên bản này, `updateMeta` không "nhận" phiên bản mới cho nháp cũ (→ 409 thay vì ghi đè người khác); chữ gõ trong lúc lưu được giữ lại | `editor-sync.test.js` (chạy `useEditor` thật qua `test/helpers/alias-loader.mjs`) |
| **F04** | Giới hạn API theo người dùng (`rateLimits(config.rate)`: `apiIp` chốt chặn lụt + `api` sau `loadUser`), cấu hình `RATE_LIMIT_*` | `rate-limit.test.js` |
| F05 | `resolvers(…, {spec})` chỉ nạp asset spec tham chiếu; thumbnail chỉ trang 1; xuất HTML qua hàng đợi `renderConcurrency` + trần chờ 10 | `service-media.test.js` |
| F06 | `lib/cappedDiskStorage.js` đếm byte thực nhận cả request (kể cả chunked), xoá tệp tạm khi vượt | `upload-cap.test.js` |
| F07 | Admin cuối + trần số người mời nằm trong giao dịch có khoá (`updateAdminFieldsGuarded`, `shares.add`) | `test/integration/concurrency.test.js` (MySQL thật; bỏ khoá → đỏ) |
| F08 | `mediaService.pool` chờ mọi lượt đang chạy rồi mới ném lỗi; dọn tệp Gemini bằng `allSettled` | `media-pool.test.js` |
| F09 | Nhân bản: bản sao ở `generating` → chép media → `markReady`; lỗi → xoá bản dở | `service-media.test.js` |
| F10 | `toolEnv()`: LibreOffice/pdftoppm không kế thừa `process.env` (khoá/bí mật) | `visuals.test.js` |
| F11 / F12 | Mật khẩu mới ≤ 72 byte; `readAsset` từ chối tài khoản `must_change_password` | `security.test.js`, `service-media.test.js` |
| F13 | `addShare`: bản gốc TRƯỚC khi cấp quyền | `sharing.test.js` |
| F14 / F15 | `verifyTables` thêm 2 bảng mẫu; changelog `20261005` không hạ cấp ENUM khi chạy lại; ghi chú tên DB ở `schema.sql` | `db-verify.test.js`, integration (chạy lại từng changelog) |
| F17 / F18 | Production fail-fast khi `APP_BASE_URL` lệch `SESSION_COOKIE_SECURE`; chú thích `requestTimeout` đúng nghĩa; `stop_grace_period: 30s` | `ip-allowlist.test.js` |
| F20 | Smoke cấp tài khoản không cần bật đăng ký (`test/smoke/provision.mjs`: admin tạm qua `create-admin.js` hoặc `SMOKE_ADMIN_*`) | smoke |
| F21 | `CLAUDE.md`/`AGENTS.md`/`11`/`06` trỏ đúng chuẩn MISA (macOS), quy tắc lược đồ DB theo chuẩn MISA §05 | — |
| Redraw | `cleanRedraw` không cắt nhãn (quá dài → null, giữ ảnh gốc); ảnh gốc của sơ đồ vẽ lại lưu làm asset trong thư viện ảnh (không đặt vào trang) | `org-redraw.test.js`, `service-media.test.js` |

### Chưa làm (có chủ đích — chặng B/C)
F03 (job bền vững — chỉ 1 máy chủ), hàng đợi theo trọng số RAM, cô lập mạng LibreOffice, metrics/alert/restore drill. Nút thắt khi ~500 người
là **hàng đợi tạo bài** (`GENERATION_CONCURRENCY=2`, tối đa 20 chờ) + hạn mức Gemini — cần đo bằng load test trước khi chỉnh.

### Kiểm chứng
`npm test` 169 test xanh; `npm run test:integration` (DB tạm trên MySQL Docker, cổng 3307 qua `docker-compose.dev.yml`, cần cấp quyền `GRANT ALL ON \`%\_it\`.*`); Docker `up -d --build --no-deps app` + smoke **TẤT CẢ ĐẠT** (tài khoản cấp bởi admin, đăng ký tự do đóng; dựng bài có 2 ảnh minh hoạ AI thật — trước đây 0 do F01); tạo bài kèm ảnh trên Docker thật → ảnh nằm trong dàn ý; LibreOffice vẫn chuyển PPTX 6 trang với môi trường tối thiểu; header `RateLimit` 1200/phút cho yêu cầu chưa đăng nhập.

## 2026-10-11 — Vẽ lại sơ đồ tổ chức / lộ trình đơn giản (layout `org`)

### Yêu cầu (chủ dự án)
Sơ đồ tổ chức hoặc timeline dạng đơn giản (ảnh "SƠ ĐỒ CƠ CẤU TỔ CHỨC DN NHỎ") thì vẽ lại cũng được, cần ấn tượng như bộ slide tự làm trực tiếp bằng Claude Code
(tệp `Slide AMIS.zip` → bản sao tham khảo `tmp/ref-amis/`).

### Thay đổi (chi tiết `05` §16, `06`)
- Layout mới `org` (AI chọn được): `root` + nhánh (`columns` ≤ 6, `icon` từng nhánh), biến thể `tree` | `boxes`, CSS + chuyển động nối dây; `limits` `orgBranches`, `root`;
  `layers` (ô `root` dời được, hoạ tiết icons); engine `UNIT`/`ZOOM` thêm `.org-br`.
- `specService` (root, icon nhánh, giới hạn nhánh theo bố cục, fallback), `geminiService` (schema dựng bài root + icon nhánh; prompt dàn ý/dựng bài mô tả org;
  `locateVisuals` trả `redraw`; dàn ý nhận khối DRn + trường `diagram`), `visualService` (`cleanRedraw`, ảnh tải lên riêng lẻ thành trang, `item.source`),
  `outlineService` (`redrawPoints`, `parseOrgPoints`, `applyRedraws`, org trong `outlineSlideToSpec` + `composeDeckFromOutline`), `presentationService` (nối luồng), `ingestService` (`standalone`).
- Frontend: `slideModel` (LAYOUTS, LAYOUT_FIELDS, VARIANT_LABELS, ensureLayoutContent, BUILD_LAYOUTS), `SlideFields` (Ô đứng đầu, Nhánh + icon), `editPaths` (`root`), `useOutline` (bố cục + gợi ý).
- Fixture `sample-spec.json` thêm trang org (14 layout).

### Kiểm chứng
- `npm test` 143/143 (mới `org-redraw.test.js` 9 ca). `npm run build` OK. Docker 8088 + smoke **TẤT CẢ ĐẠT** (bật tạm `SELF_REGISTRATION` qua tệp override ngoài repo rồi trả về).
- AI thật: ảnh PNG sơ đồ + ảnh lộ trình + ghi chú → `visual_shots {kind:images, redraws:2}`, trang `org:boxes` + `timeline` đúng nguyên văn, không trang ảnh thừa;
  PDF 2 trang → `org` đúng. Ảnh chụp (Chrome 1600×900, tối + sáng) so với mẫu `g5-04.png`; hiệu ứng nối dây chạy đúng trình tự; trình chiếu từng ý → từng nhánh; 0 lỗi trang.
- Editor desktop 1600 + mobile 375: trang org hiện Ô đứng đầu, Nhánh (3/6), icon, mục con; 0 lỗi console.
- Chưa kiểm chứng: tư liệu thật của MISA có sơ đồ phức tạp vừa phải (ranh giới "đơn giản" do AI xét); PPTX có SmartArt tổ chức.

## 2026-10-11 — Bỏ đăng ký trên màn đăng nhập

Chủ dự án: bản chạy trên server MISA sẽ dùng đăng nhập bảo mật của MISA (DevOps cài) → bỏ tính năng đăng ký. Đã gỡ trang `/register` (desktop + mobile), liên kết "Đăng ký", câu phụ đề; logo "MISA Presentation" chuyển vào trong thẻ đăng nhập (desktop). `SELF_REGISTRATION` mặc định `false` (API `/register` chỉ để smoke test, phải bật tạm khi chạy smoke). Đã kiểm bằng Chrome desktop 1440px + mobile; chưa commit.

## 2026-10-11 — Dời chữ + cỡ chữ, xoá / thay hoạ tiết, nhận diện sơ đồ + ảnh giao diện

### Yêu cầu (chủ dự án)
1. Chữ trong trang di chuyển được vị trí; (bổ sung) chỉnh được **cỡ chữ**. 2. Xoá được hoạ tiết trang trí, thay bằng ảnh / hình khối khác.
3. Nhận diện hình cần đưa vào bài chưa tốt → nhận diện chính xác 2 loại MISA dùng nhiều nhất: **sơ đồ** và **ảnh giao diện màn hình**. Tinh thần: tự động là chính, chỉnh sửa là phụ.

### Thay đổi (chi tiết `05` §15, `06`, `08`, `09`, `11` quy tắc 15)
- `shared/deck/layers.js` (mới): `cleanMoves`/`moveAttr` (vị trí % + cỡ chữ 0,5–3), `DECORS`/`decorsFor`/`cleanHide`/`hideClasses`. `limits.moves = 40`.
- Renderer: `E()` gắn `data-mv`/`data-fz`/`translate`+`zoom` ở mọi chế độ; lớp `x-<hoạ tiết>` trên `<section>`; `data-dc` cho hoạ tiết bấm được (bìa/kết, số trang mục, ngoặc trích dẫn, VS). `theme.css`: ẩn + nắn bố cục khi tắt hoạ tiết, nhóm nút `#mvg`, menu `#dcm`, vùng chạm 44px trên màn cảm ứng.
- Engine: tay nắm dời ô chữ (hút chỗ cũ/đường giữa, Shift/Alt, bấm đúp, phím mũi tên) + A+/A−, `deck:move`; menu hoạ tiết `deck:deco`; `fit-m` khi đo tràn; hoãn dựng lại khi đang kéo; bám lại ô chữ sau khi dựng lại; nhóm nút xếp ngang + né `#rtb` trên khung thấp.
- `specService.cleanSlide` nhận `moves` (trừ `free`) + `hide`. App: `editPaths` (`applyFrameMove`, `applyDeco`, `convertElement`, `shiftMoves`, `setDecorHidden`), `useLiveDeck` (`deck:move`/`deck:deco`, `onNotice`), `useEditor` (`changeLayout` bỏ moves + lọc hide, `setDecorAll`), `DecorPanel.vue`, nút đổi ảnh ↔ hình khối ở `FreeElementsPanel`.
- Nhận diện hình: `visualService.js` thay `pdfShotService.js` — PDF + PPTX/DOCX/ODP/ODT (LibreOffice headless, `sanitizeOffice`, hàng đợi tuần tự), `gemini.locateVisuals` (screenshot | diagram + loại sơ đồ), cắt theo loại + gọt viền sơ đồ, bỏ trùng, `mergeEmbedded`. `ingestService` trả `docs`; `presentationService` gắn sơ đồ (`fit:contain`) + `outlineService.placeDiagrams`; prompt dàn ý có mục SƠ ĐỒ. Cấu hình `config.visuals` (`OFFICE_VISUALS`, `SOFFICE_PATH`, `OFFICE_RENDER_TIMEOUT_MS`, `PDF_UI_SHOTS_MAX` mặc định 24). Dockerfile cài LibreOffice impress/writer nogui + phông Carlito/Caladea/Liberation (image ~2,03 GB). `docs/DEVOPS-NETWORK.md`: không thêm tên miền ra ngoài.

### Kiểm chứng
- `npm test` 134/134 (mới `layers.test.js` 10 ca: moves/size/hide, renderer, applyFrameMove, shiftMoves, applyDeco, convertElement, fixture mẫu; `visuals.test.js` thay `ui-shots.test.js`: boxToRegion theo loại, extractVisuals với AI giả, sanitizeOffice, readBuffer docs, mergeEmbedded, placeDiagrams). `npm run build` OK.
- Docker 8088 + smoke **TẤT CẢ ĐẠT**.
- AI thật trên Docker: PPTX mẫu (python-pptx) → 2 sơ đồ (quy trình, kiến trúc) + 1 giao diện, trang thẻ chữ bị bỏ đúng, mỗi sơ đồ 1 trang image contain, `embeddedMerged 1`; PDF OneAI → 3 sơ đồ + 7 ảnh giao diện, khung cắt chính xác (ảnh ghép kiểm tay).
- Puppeteer + Chrome thật (`tmp/editor-layers-e2e.mjs`, 1600×1000): A+ ×3 → cỡ 1,3, nhóm nút vẫn hiện; kéo → `data-mv` + bảng "1 ô chữ đã chỉnh"; bấm hình bìa → menu 3 mục → thay bằng hình khối (lớp `x-art`, 1 phần tử, công tắc tự tắt); Lưu → spec có `moves`/`hide`/`elements`; HTML xuất có `data-mv`, `zoom:1.3`, `x-art`; menu "Thay bằng ảnh" mở bộ chọn "Ảnh — trang 1"; 0 lỗi trang. Mobile 390×844 (`tmp/editor-layers-mobile.mjs`): chạm chữ → nhóm nút 44px, A− đổi cỡ, bảng hoạ tiết hiển thị, 0 lỗi.
- Chưa kiểm chứng: máy thật iOS/Android (kéo tay nắm bằng ngón tay); tệp PPTX/DOCX thật lớn (> 50 trang) về thời gian LibreOffice trên máy chủ MISA; chọn ảnh thật trong bộ chọn sau "Thay bằng ảnh" (E2E mới kiểm tới bước mở bộ chọn "Ảnh — trang 1").

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
- Test integration (`npm run test:integration`) — nay đã có `test/integration/concurrency.test.js` (xem mục 2026-10-11 — Chặng A).
