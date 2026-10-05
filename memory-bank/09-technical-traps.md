# 09 — Bẫy kỹ thuật & lỗi đã gặp

## Kiến trúc / vận hành

### Hàng đợi AI nằm trong RAM, một tiến trình
- **Hiện tượng:** khởi động lại container giữa lúc AI đang tạo → bài kẹt `generating`.
- **Xử lý hiện tại:** `recoverStale()` lúc khởi động: `generating` còn dàn ý → về `outline` (người dùng bấm Dựng lại, không mất dàn ý); `outlining`/`generating` không có dàn ý → `failed` (tạo lại).
- **Hệ quả:** **không** chạy nhiều bản sao `app` sau load balancer — semaphore, giới hạn song song, rate-limit (memory store) và hẹn giờ thumbnail đều chỉ tính trong một tiến trình. Muốn scale ngang phải chuyển sang hàng đợi ngoài (Redis/BullMQ…) và rate-limit store dùng chung.

### Storage cục bộ (Docker volume)
- Ảnh/thumbnail nằm trong volume `app-data`. Dev local dùng `./data/storage` — **chung DB nhưng khác thư mục tệp** → bài tạo bên dev mở bên container sẽ thiếu ảnh (và ngược lại). Không phải lỗi app.
- Sao lưu phải gồm cả DB và volume cùng thời điểm.

### Nginx proxy trong compose
- Bind-mount 1 tệp: mount `./deploy/nginx/default.conf` → trình soạn thảo/`sed -i` ghi tệp mới (inode mới), container vẫn trỏ inode cũ → `nginx -s reload` báo "No such file". Compose mount **cả thư mục** `./deploy/nginx:/etc/nginx/conf.d`.
- `upstream { server app:3000; }` chỉ phân giải DNS 1 lần lúc Nginx khởi động → `docker compose up -d --build app` có thể đổi IP container → 502. Dùng `resolver 127.0.0.11` + `zone` + `server app:3000 resolve` (Nginx ≥ 1.27.3).
- Express trả JS với `text/javascript` → phải có trong `gzip_types` (không chỉ `application/javascript`).

### `CHROME_NO_SANDBOX=true`
- Chromium trong container chạy với `--no-sandbox` vì container không có user namespace cho sandbox của Chrome. Bù lại: Chromium chỉ render HTML do chính server sinh (đã escape), chặn mọi request mạng, chạy dưới user `node`. Không bật trên máy dev nếu không cần.

### Cổng 8080 bị chiếm
- Trên máy dev, `misa-flipbook-proxy` đã dùng 8080 → `docker compose up` báo "port is already allocated". Đặt `APP_PORT=8088` trong `.env` **và** sửa `APP_BASE_URL` tương ứng (nếu không sẽ bị `BAD_ORIGIN`).

### Tiến trình node "ma" giữ cổng 3000 trên Windows
- Dừng task nền của công cụ/terminal không giết tiến trình con `node src/server.js` (do `--watch`/shell trung gian). Server mới không lên được hoặc request vẫn vào **code cũ** (ví dụ CSS engine sửa rồi mà không thấy đổi).
- Kiểm tra: `Get-NetTCPConnection -LocalPort 3000 | Select OwningProcess` → `Stop-Process -Id <pid>`.

## AI (Gemini)

### Model bỏ qua trường tuỳ chọn
- Với `responseSchema`, Gemini hay bỏ hẳn các mảng tuỳ chọn (`items`, `stats`, `images`…) → layout thiếu dữ liệu. Đã đánh dấu các mảng là **required** (cho phép rỗng) trong schema, và chuẩn hoá lenient hạ bố cục khi dữ liệu không đủ.

### Lenient vs strict
- Kết quả AI dùng **lenient** (cắt ngắn, hạ layout). Lưu của người dùng dùng **strict** (báo lỗi, không tự sửa). Đừng đổi lưu sang lenient — người dùng sẽ mất chữ mà không biết. Unit test đã có cho cả hai.
- Lenient hạ `image`/`gallery` không có ảnh thật → khi viết test với fixture có layout ảnh, dùng strict hoặc gắn asset id.

### `minItems`/`maxItems` trên mảng slides → 400 INVALID_ARGUMENT
- Với item phức tạp như slide, Gemini từ chối schema có `maxItems` ≥ ~5 ("Request contains an invalid argument", không nói rõ lý do). Đã kiểm chứng: 3 qua, 5 trở lên lỗi. Số trang khống chế bằng prompt + `description` của mảng + `capSlides()` phía server. Unit test chặn việc thêm lại.

### Dữ liệu inline ~20 MB / request
- Request `generateContent` có giới hạn tổng ~20 MB, base64 phình ~33%. Tệp lớn đi qua **Files API** (`mediaService`): upload resumable (`x-goog-upload-url`), chờ `state=ACTIVE`, dùng `fileData.fileUri`, **luôn DELETE** sau khi dùng (tệp tự hết hạn 48 giờ nếu sót). PDF tối đa ~50 MB/1000 trang mỗi tệp → cắt cụm bằng pdf-lib.
- Định dạng ghi âm đã thử với API thật (inline + Files API): mp3, m4a (`audio/mp4`), wav, ogg, webm, flac, aac, aiff.

### Logger che trường có chữ "key/token"
- `redactConfig`/logger che mọi trường tên khớp `/secret|password|key|token/i` → field log như `estTokens` thành `***`. Đặt tên khác (`estimate`).

### onnxruntime-node (tách nền logo)
- **Telemetry:** bản Linux gửi telemetry về Microsoft → Dockerfile đặt `ORT_DISABLE_TELEMETRY=1`; `cutoutService` cũng tự đặt nếu thiếu (ngoại lệ có chủ đích với quy tắc "config chỉ đọc trong src/config" — phải đặt trước khi nạp thư viện).
- **Chặn event loop:** suy luận chạy đồng bộ ~2 giây trên Docker linux-arm64 (Mac) → chạy trong **worker thread**, hàng đợi `Semaphore(1)`, quá 5 chờ → 503.
- **Kích thước gói:** `npm ci` kéo binary mọi nền tảng (~290 MB) → Dockerfile xoá trừ `linux/<arch>`. Build chéo kiến trúc phải dùng `--platform` (xem `07`).
- **Giới hạn chất lượng đã biết:** mặt nạ AI ở 320px (U²-Net-p) → biên logo nhỏ hơi mềm; chế độ màu chỉ xoá lỗ nhỏ trong nét mảnh (lòng chữ O, A, 0) — lỗ lớn > ~6% được giữ nền (tuỳ chọn `inner:'remove'` có trong `cutoutService` nhưng **chưa mở qua API/giao diện**); logo nền gradient/ảnh chụp nên chọn AI.

### Gemini bước dựng bài chậm hơn bước dàn ý
- `designDeck` trả JSON lớn (đủ mọi trường slide) → 1–3 phút với ~8 trang; dàn ý chỉ ~30–60 giây. Nếu AI bỏ trang/sai `ref`, `composeDeckFromOutline` tự dựng trang từ dàn ý — bài **luôn** đủ số trang người dùng đã duyệt.

## Giao diện

### Bản sao MDS có vá cục bộ (phải giữ khi cập nhật MDS)
| Component | Vá | Lý do |
|---|---|---|
| `MInput.vue`, `MTextarea.vue` | `defineOptions({ inheritAttrs: false })` + `useAttrs()`: `class`/`style` ở wrapper, mọi attr khác (`id`, `name`, `autocomplete`, `aria-*`, `maxlength`, `inputmode`…) chuyển xuống thẻ input/textarea thật | Bản gốc gắn attr lên `div` bọc ngoài → mất autocomplete, label `for` không liên kết, trình đọc màn hình không đọc nhãn |
| `MDataTable.vue` | Prop `hideTools: ('refresh'\|'export'\|'columns'\|'filter')[]`; hàng hiện nút thao tác cả khi `group-focus-within` | Ẩn nút không có chức năng; dùng được bằng bàn phím |
| `iconRegistry.generated.js` | Thêm icon `video`, `player-play`, `brand-youtube`, `scissors`, `palette`, `typography` (Tabler, nối trước `export const ICON_NAMES`) | MDS chưa có icon cho video/tách nền/thiết kế; sinh lại registry sẽ mất |
| `MUpload.vue` | Prop `block` (dropzone rộng hết khung, có icon + dòng `hint`), `sizeHint` (thay chú thích "Dung lượng tối đa…") | Form tạo bài 1 cột rộng; giới hạn theo **tổng** dung lượng nhiều tệp, không theo từng tệp |

Khi chép MDS mới đè lên: áp lại các vá này (tìm chú thích `[MISA Presentation]`).

### `MButton` cứng `type="button"`
- Truyền `type="submit"` qua fallthrough vẫn đè được, nhưng nút submit nằm ở footer sticky ngoài `<form>` → dùng thuộc tính `form="<id form>"`.

### `structuredClone` với Vue reactive proxy
- `structuredClone(reactiveObj)` ném `DataCloneError`. Dùng `clone()` (JSON) trong `lib/slideModel.js` — spec là JSON thuần nên an toàn.

### ActionSheet đóng trước khi phát sự kiện
- Nếu đóng sheet trước, cha đã reset `sheet = null` → handler không biết đang thao tác bài nào. `ActionSheet` phát `select` **trước** rồi mới đóng.

### HUD của engine đè lên preview nhúng
- Engine tự thêm `body.embed` khi `window.parent !== window`; `theme.css` ẩn `#hud` trong chế độ này. Ứng dụng tự có nút Prev/Next (`useDeckFrame`).

### Browser pane của Claude desktop chặn iframe
- Trong khung trình duyệt tích hợp của Claude desktop, iframe preview báo `ERR_BLOCKED_BY_CLIENT` — là giới hạn của khung đó, **không phải lỗi app**. Mở thẳng URL preview cũng vậy: trang sandbox (origin `null`) bị pane chặn mọi request ảnh/video. Kiểm chứng slide bằng Chrome thật hoặc puppeteer trên HTML xuất (`tmp/check-export.mjs`).

### Video/YouTube không phát được trong iframe sandbox
- iframe preview không có `allow-same-origin`/fullscreen → không `requestFullscreen` được, YouTube cũng từ chối nhúng trong origin `null`. **Cách làm:** engine chỉ gửi `postMessage({type:'deck:video'})`, app (`VideoOverlay`) phát. Đừng "sửa" bằng cách thêm `allow-same-origin` vào sandbox — script trong bài sẽ đọc được cookie/DOM app.
- `requestFullscreen` phải gọi **ngay trong sự kiện bấm**; gọi sau `await`/`setTimeout` → trình duyệt từ chối (lớp phủ vẫn phủ kín cửa sổ).

### Lớp phủ font-display:block khi chọn phông
- `ensureDeckFonts()` nạp @font-face cùng cấu hình với deck (`font-display:block`) → lần đầu mở tab Phông chữ, mẫu chữ có thể **trống ~1 giây** tới khi tải xong. Không phải lỗi.

### Ô xem trước nền động quá mờ
- Nền thiết kế cho cả slide (nét mảnh, alpha ≤ .18); thu nhỏ khung 1280×720 vào ô ~150px thì gần như vô hình (nhất là nền sáng). `DeckBgCanvas` có prop `boost` (vẽ ra canvas phụ rồi chồng N lớp, alpha ≈ 1 − (1 − a)^N): `BackgroundPicker` khung logic 640×360 + boost 3; `DesignPreview` nửa kích thước canvas + boost 2. Deck thật không dùng boost.

### Component không được tự sửa props thiết kế
- Từng có `DesignPanel` gán mặc định vào `props.design` trong `computed` → cảnh báo Vue + bản nháp "bẩn" ngay khi mở. Mặc định thiết kế áp ở composable khi nhận dữ liệu (`withDesignDefaults`).

### Thuộc tính rơi xuống `MSidebar`
- Gắn class/attr trực tiếp lên MSidebar gây cảnh báo extraneous attrs (component nhiều root) → bọc trong `<div>`.

### `class` trên `MInput` không giới hạn được bề rộng
- MInput gắn `class` vào wrapper nhưng ô input bên trong vẫn `w-full` theo cha → muốn ô hẹp (vd. số trang 96px) phải bọc `<div class="w-[96px]">`.

### Engine ghi đè `transform` khi chạy hiệu ứng
- `engine.js` gán `el.style.transform` cho phần tử có `data-a` → biến thể cần xoay/dịch tĩnh (polaroid, ô mosaic) phải dùng thuộc tính độc lập `rotate:` / `translate:` thay vì `transform`, nếu không sẽ mất khi hiệu ứng chạy.

### Chữ viền (`-webkit-text-stroke`) với phông variable
- Số lớn dạng chữ viền hiện đường nét chồng nhau bên trong glyph (contour của variable font) → dùng màu đặc nhạt (`color-mix(... 12%)`) thay cho chữ viền.

### Hàng thẳng cột giữa các thẻ
- Mỗi `.crow` là 1 grid riêng → cột lệch nhau theo độ dài chữ. Dùng `grid-template-columns: subgrid` trên hàng, cột định nghĩa ở `.crows`.

### Chữ mốc thời gian bị ngắt giữa từ trong thẻ hẹp
- `overflow-wrap:anywhere` cắt "T12/2026" thành "T12/202 / 6" ở tỷ lệ 4:3. Đã đổi: thẻ là container (`container-type: inline-size`), cỡ chữ `min(64px·k, 150cqi / --vl)` với `--vl` = độ dài từ dài nhất (renderer tính).

## Kiểm thử

### `node --test <thư mục>` lỗi trên macOS/Linux
- Node 22+ coi đối số là tệp/glob: `node --test test/unit/` báo `Cannot find module '.../test/unit'`. Dùng glob trong ngoặc kép (`"test/unit/**/*.test.js"`) — Node tự mở rộng glob, chạy được cả Windows lẫn macOS.

## Dữ liệu

### Express 5: `req.path` trong router con đã bị cắt mount path
- Log HTTP trong middleware `res.on('finish')` đọc `req.path` sau khi router con xử lý → ra `/` thay vì `/api/...` → lọc `startsWith('/api/')` loại hết, tưởng request chưa tới server. Lấy `req.originalUrl` ngay đầu request.

### multer: tên tệp tiếng Việt thành mojibake
- busboy mặc định giải mã tên tệp bằng latin1 → `Báo cáo.pptx` thành `BÃ¡o cÃ¡o.pptx`. Truyền `defParamCharset: 'utf8'` cho mọi instance multer; macOS gửi tên dạng NFD → `.normalize('NFC')`.

### Nhận diện tệp: thứ tự kiểm tra magic bytes
- HEIC/AVIF là hộp `ftyp` giống MP4 → kiểm `sniffIsoImage` TRƯỚC âm thanh/video. Tệp UTF-16 LE có BOM `FF FE` trùng 11 bit đồng bộ khung MP3 → kiểm `looksLikeUtf16` (BOM + giải mã ra chữ) TRƯỚC `sniffAudio` (CSV "Unicode Text" của Excel từng bị nhận là mp3).
- sharp bản dựng sẵn KHÔNG giải mã HEIC (thiếu HEVC) nhưng đọc được AVIF. HEIC chỉ đổi được trên trình duyệt hỗ trợ (Safari) — `frontend/src/lib/fileKinds.js heicToJpeg`; Chrome/Edge báo hướng dẫn đổi sang JPEG.
- CSV/TXT xuất từ Excel Windows tiếng Việt thường là Windows-1258 (dấu thanh tổ hợp) → `decodeText` giải mã rồi `normalize('NFC')`.

### Chữ tiếng Việt lỗi mã hoá khi test bằng curl trên Windows
- Gửi JSON tiếng Việt bằng `curl` trong cmd/PowerShell cũ tạo tên kiểu `Ngu?i D�ng` — do code page của console, không phải server. Dùng script Node (`test/smoke/smoke.mjs`) hoặc tệp JSON UTF-8 với `--data-binary @file`.
