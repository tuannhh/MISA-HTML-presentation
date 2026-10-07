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

### `IP_ALLOWLIST` phụ thuộc `TRUST_PROXY`
- Sau Nginx mà để `TRUST_PROXY=0` → `req.ip` là IP container/máy Nginx → mọi người bị chặn (hoặc nếu lỡ thêm IP Nginx vào danh sách thì ai qua proxy cũng lọt). Đặt `TRUST_PROXY` = đúng số lớp proxy.
- Docker Desktop (macOS) mọi request từ máy host hiện IP `192.168.65.1` (cổng publish qua userland proxy); Linux server iptables DNAT giữ IP thật. Kiểm thử chặn/cho phép trên Docker local dùng override compose ở thư mục tạm, không sửa `.env`.

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

### Ảnh giao diện từ PDF: render trang, không trích ảnh nhúng
- `pdfimages` trả cả mảng nền gradient, ảnh lặp, smask tách rời; ảnh UI trên slide thường chồng lớp (điện thoại đè máy tính, logo đè ảnh) →
  render trang (`pdftoppm -scale-to 2000`) rồi cắt theo `box_2d` của Gemini mới ra đúng thứ người xem thấy. PDF 20 trang/50 MB: render ~7 giây,
  AI khoanh vùng ~20 giây. Hộp AI đôi khi lẹm vài chữ tiêu đề slide sát mép ảnh (vd. "ất") — chấp nhận, nới mép chỉ 0,5%.

### Gemini bước dựng bài chậm hơn bước dàn ý
- `designDeck` trả JSON lớn (đủ mọi trường slide) → 1–3 phút với ~8 trang; dàn ý chỉ ~30–60 giây. Nếu AI bỏ trang/sai `ref`, `composeDeckFromOutline` tự dựng trang từ dàn ý — bài **luôn** đủ số trang người dùng đã duyệt.

## Giao diện

### Deck: hình trang trí tràn làm bộ tự co chữ thu nhỏ tiêu đề
- `engine.fitSlide` co `--k` khi `.body` có `scrollHeight/scrollWidth` lớn hơn khung — kể cả do phần tử `absolute` (svg `overflow: visible`).
  Bìa kiểu `center` có hình minh hoạ mờ phía sau → tiêu đề bị co tới k = 0,48. Lớp trang trí trong `.body` phải `overflow: hidden`.
- `.im.has-side .media { align-self: stretch }` kéo giãn cả tấm nền ảnh / video nằm trong `.vbox` → ghi đè `.im.has-side .vbox > .media { align-self: center }`.
- Chụp deck bằng puppeteer: đợi `domcontentloaded` (+ chờ animation) thay vì `networkidle0` — có lúc treo vô hạn với deck nhúng ảnh base64 lớn.

### Docker: npm bỏ qua lặng lẽ gói tuỳ chọn tải lỗi
- `@img/sharp-libvips-linux-arm64` (optionalDependency) tải lỗi → `npm ci` vẫn thành công, container sập lúc chạy ("Could not load the sharp
  module"). Dockerfile chạy `node -e "require('sharp')"` ngay sau `npm ci` để build thất bại sớm; gặp thì build lại `--no-cache`.

### Bản sao MDS có vá cục bộ (phải giữ khi cập nhật MDS)
| Component | Vá | Lý do |
|---|---|---|
| `MInput.vue`, `MTextarea.vue` | `defineOptions({ inheritAttrs: false })` + `useAttrs()`: `class`/`style` ở wrapper, mọi attr khác (`id`, `name`, `autocomplete`, `aria-*`, `maxlength`, `inputmode`…) chuyển xuống thẻ input/textarea thật | Bản gốc gắn attr lên `div` bọc ngoài → mất autocomplete, label `for` không liên kết, trình đọc màn hình không đọc nhãn |
| `MDataTable.vue` | Prop `hideTools: ('refresh'\|'export'\|'columns'\|'filter')[]`; hàng hiện nút thao tác cả khi `group-focus-within` | Ẩn nút không có chức năng; dùng được bằng bàn phím |
| `iconRegistry.generated.js` | Thêm icon `video`, `player-play`, `brand-youtube`, `scissors`, `palette`, `typography`; đợt 2026-10-06 thêm `layout-board`, `table`, `square-rounded`, `sparkles`, `crop`, `rotate`, `rotate-clockwise`, `flip-horizontal`, `flip-vertical`, `sun`, `droplet`, `contrast`, `zoom-in`, `arrows-move`, `adjustments`, `stack`, `align-left/center/right`, `world-search`, `row-insert-bottom`, `column-insert-right`, `cube`; đợt 2026-10-07 (chia sẻ) thêm `history`, `restore`, `user-plus`, `user-share`, `flag` (Tabler, nối CUỐI object `ICON_REGISTRY` trước `})`) | MDS chưa có icon cho video/tách nền/thiết kế; sinh lại registry sẽ mất |
| `MUpload.vue` | Prop `block` (dropzone rộng hết khung, có icon + dòng `hint`), `sizeHint` (thay chú thích "Dung lượng tối đa…") | Form tạo bài 1 cột rộng; giới hạn theo **tổng** dung lượng nhiều tệp, không theo từng tệp |
| `MUpload.vue` | Dropzone là `div role=button` (tabindex, Enter/Space), `<input type=file>` đặt NGOÀI dropzone, bỏ `@click.prevent` | Bản gốc: `<label @click.prevent>` bọc input → `input.click()` nổi bọt lên label bị `preventDefault` → trình duyệt huỷ hộp chọn tệp, bấm không mở cửa sổ (lỗi "không tải được tệp" ở tab Tải tệp lên) |

Khi chép MDS mới đè lên: áp lại các vá này (tìm chú thích `[MISA Presentation]`).

### Khoảng trống lớn dưới footer = cả trang bị cuộn
- Vùng `overflow-y-auto` thiếu `relative` → phần tử `absolute` bên trong (`sr-only`, bộ đếm ký tự `MTextarea`) neo vào `<body>`, không bị cắt, kéo tài liệu dài ra → `<body>` cuộn, lộ nền xám dưới footer. `overflow-hidden` trên shell không chặn nếu shell không `relative`.
- Quy tắc: shell `relative … overflow-hidden`; mọi vùng cuộn `relative min-h-0 flex-1 overflow-y-auto`; footer là anh em `shrink-0` của vùng cuộn. Kiểm: `document.documentElement.scrollHeight === innerHeight` (theo MDS `layout-patterns.md` "Khóa chiều cao khung app").

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

### Khung sửa trực tiếp: hoãn dựng lại phải xét `document.hasFocus()`
- Engine hoãn `deck:render` khi người dùng đang gõ trong khung. Bấm sang ô bên ngoài (ứng dụng) thì `document.activeElement` của khung **vẫn trỏ vào ô cũ** → nếu chỉ xét activeElement, mọi lần dựng lại sau đó bị hoãn mãi (sửa ở bảng bên phải không thấy trên khung). Điều kiện đúng: `isContentEditable && deck.contains(a) && document.hasFocus()`.

### Kéo phần tử: `setPointerCapture` đổi đích của `dblclick`
- Khối `.fe` gọi `setPointerCapture` khi nhấn → `click`/`dblclick` sau đó có `e.target` là **chính khối**, không phải chữ/ảnh bên trong → `closest('[data-m]')` rỗng, bấm đúp không mở gì. Lấy phần tử thật bằng `document.elementFromPoint` (nằm trong khối), không thấy thì lấy `[data-m]`/`[data-e]` đầu tiên của khối.
- Puppeteer: `mouse.click(x, y, { clickCount: 2 })` chỉ phát **1** lần nhấn (đặt `detail`); bấm đúp thật dùng `{ count: 2 }`.

### sharp: thứ tự phép biến đổi cố định, không theo thứ tự gọi
- Xoay góc 90° luôn chạy **trước** `flip/flop` dù gọi sau; trình duyệt (Cropper/CSS) lật theo trục ảnh gốc rồi mới xoay → lật ở lượt riêng trước khi xoay.
- `modulate({ brightness })` nhân độ sáng trong không gian LCh (xanh dương đậm gần như không tối đi) ≠ CSS `brightness()` nhân RGB → dùng `linear`/`recomb` theo công thức bộ lọc CSS, mỗi bước 1 lượt (sharp chỉ giữ 1 phép `linear`/lượt).

### Biến CSS trỏ biến khác được "chốt" tại nơi khai báo (`--accent: var(--blue)`)
- Biến tuỳ chỉnh tính giá trị **tại phần tử khai báo** rồi mới kế thừa xuống. Theme khai báo `--accent: var(--blue)` ở gốc → trang `.slide.ink-light` đổi `--blue` nhưng `--accent` vẫn là xanh đậm của gốc (chip/kicker chìm trên ảnh tối). Khi ghi đè bộ biến theo trang (`inkVarsCss`) phải khai báo lại **cả biến bí danh** (`--accent`, `--accent-2`), không chỉ biến gốc.

### Ảnh nhận diện khác tông bài → chữ không đọc được
- Tông bài sáng + ảnh trang kết tối (hoặc ngược lại) → chữ tối trên nền tối. Renderer không đọc được điểm ảnh → **giao diện** đo độ sáng khi đặt ảnh (`BrandSettings.imageTone`, canvas 24×14) và ghi `brand.tones`; renderer chỉ so `tones` với tông bài. Bài đặt ảnh qua API/bản cũ (chưa có `tones`) giữ màu chữ theo tông bài — người dùng chỉnh bằng "Chữ sáng/Chữ tối".

### Tên lớp trùng giữa các bố cục (`.im`)
- Ô ảnh thay biểu tượng từng dùng lớp `.ib.im` → trùng quy tắc `.im` của layout `image` (flex:1, grid) → ô cao 420px. Lớp mới phải tra trùng trong `theme.css` trước khi đặt tên (`ib-img`, `is-cover`).

### Bìa thương hiệu: cột ảnh bị ép mất
- `.bspec .cv` đặt 1 cột cho mọi bìa → bìa có ảnh/video bên phải bị đẩy xuống, tiêu đề tràn trên. Chỉ áp khi bìa **không** có cột ảnh: `.bspec .cv:has(> .cv-art)`… (giữ lưới 2 cột khi có ảnh).

### Engine: chèn khối mã bằng thay chuỗi làm rơi hàm
- Từng thay đoạn engine bằng script → mất `editable()`/`bindEditables()` → `ReferenceError` chỉ hiện ở `pageerror` của khung, sửa chữ không chạy. Sau khi sửa `engine.js` luôn chạy E2E có `page.on('pageerror')` (`tmp/ui-brand.mjs`).

### Kiểm "không còn ⟦" trong HTML xem trước
- Mã engine (nhúng trong `<script>`) chứa ký tự ⟦ để xử lý định dạng → kiểm rò thẻ định dạng phải bỏ `<script>…</script>` trước khi tìm.

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

### Slide vừa rời đi vẫn chặn cú bấm ~1,2 giây
- `.slide` ẩn bằng `visibility` có trễ chuyển tiếp (`visibility 0s linear .55s` sau khi bỏ `.off` lúc 700 ms) → trong ~1,25 giây slide cũ (trong suốt, nằm sau trong DOM) vẫn nhận `elementFromPoint`/click — bấm phóng to rơi vào slide cũ. Sửa: `.slide:not(.on) { pointer-events: none }`.

### Thumbnail chạy ở chế độ present (không phải still)
- `browserService.screenshotSlides` dựng HTML mode `present` rồi gọi `__deck.goto` → engine đã gắn `data-wait` cho các ý "hiện khi bấm" và logo 3D chưa vẽ. `__deck.goto` phải hiện đủ ý (bỏ `data-wait`/`data-past`, thu phóng) và vẽ logo 1 khung tĩnh (`frozen !== null`).

### WebGL: canvas đã `forceContextLoss` không dùng lại được
- Tạo `WebGLRenderer` mới trên cùng canvas sau khi giải phóng → nhận lại ngữ cảnh đã mất (đen). Luôn tạo **canvas mới** (engine `#bg3d`, `.l3d-cv`; `DeckBgCanvas`).

### Chromium chụp thumbnail/PDF có `--disable-gpu`
- WebGL có thể không có (Chrome máy dev headless) → nền 3D tự về mẫu 2D, logo giữ ảnh phẳng; Chromium trong Docker vẫn có WebGL phần mềm (đã thấy logo nghiêng trong PDF). Puppeteer kiểm 3D trên Chrome máy dev: thêm `--enable-unsafe-swiftshader --use-angle=swiftshader`.

### Vite build gói 3D đọc `.env` của dự án
- `vite build` lập trình tự nạp `.env` ở root (cảnh báo `NODE_ENV=production`) → `scripts/build-deck3d.mjs` đặt `envDir: 'scripts'` để không đọc `.env`.

## Kiểm thử

### `uploadFile` của puppeteer không phát hiện lỗi mở hộp chọn tệp
- `elementHandle.uploadFile()` gán tệp thẳng vào input, bỏ qua bước bấm → test vẫn đạt dù người dùng bấm không mở được cửa sổ chọn tệp. Kiểm tra vùng chọn tệp bằng `page.waitForFileChooser()` + bấm thật (`tmp/ui-filechooser.mjs`).

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

## Chia sẻ theo người + handoff (2026-10-07)

### Dữ liệu bài luôn ở tenant của chủ bài
- **Bẫy:** service cũ ghi theo `user.id` (vd. `updateOwned(user.id, …)`, `assetKey(user.id, …)`, `assets.create(user.id, …)`). Khi người được mời sửa gọi, `user.id` là **người sửa** → `updateOwned` không khớp dòng nào (409 giả) hoặc asset/tệp rơi vào tenant người sửa (chủ bài không thấy, xoá bài không dọn).
- **Quy tắc:** sau `editable()`/`mediaTarget()` dùng `row.tenant_id` / `deck.tenant_id` cho mọi thao tác dữ liệu của bài (cả `templateService.apply`: khoá `tenants/${deck.tenant_id}/…`). `user.id` chỉ dùng cho `actorId` audit, `created_by`, và đường chỉ-chủ-bài (outline, build, delete) hoặc bản sao thuộc người gọi (duplicate). Test `brand-rich.test.js` kiểm áp mẫu bởi người sửa ghi vào tenant chủ bài.

### Bản gốc duy nhất: `INSERT … SELECT … WHERE NOT EXISTS` + unique `baseline_lock`
- `ensureBaseline` gọi ở mỗi lần mời/bật công khai. `WHERE NOT EXISTS` không chống được 2 request song song (cả hai cùng thấy "chưa có") → unique `(presentation_id, baseline_lock)` với cột sinh `IF(kind='baseline',1,NULL)` chặn bản thứ 2; repository bắt `ER_DUP_ENTRY` → coi như đã có. Không dùng `INSERT IGNORE` (nuốt cả lỗi khác, vd. dữ liệu sai kiểu).
- **Không** dựa vào `affectedRows` của `INSERT … ON DUPLICATE KEY UPDATE` để biết "mời mới hay đổi quyền" (MySQL trả 1 = thêm, 2 = cập nhật, 0 hoặc 1 khi giá trị không đổi tuỳ cờ `CLIENT_FOUND_ROWS` của driver); `addShare` đọc `shares.find` **trước** khi upsert để quyết định 201/200 và tên audit.

### Handoff cần khoá dòng, không chỉ đếm
- Đếm `COUNT(*) < 5` rồi `INSERT` ngoài transaction → 2 request song song đều thấy 4 → 6 bản. `createHandoff` chạy trong `withTransaction`: `SELECT … FROM presentations … FOR UPDATE` (khoá dòng bài, tuần tự hoá mọi handoff của bài) → kiểm `spec_version` → trùng → đếm → `INSERT … SELECT`. Smoke bắn 6 request song song cùng phiên bản → đúng 1 bản 201.

### Khôi phục: chuẩn hoá lenient, không strict
- Ảnh chụp cũ có thể vượt giới hạn mới của `SPEC_LIMITS`/thiếu asset đã bị xoá → `normalizeSpec(snap.spec)` (lenient) + `dropForeignAssets` theo asset **hiện còn** của bài. Strict sẽ làm bản handoff hợp lệ lúc chụp không khôi phục được.

### Giao diện
- `MDrawer` z-index 1001 > `MDialog` 1000 → dialog xác nhận mở từ drawer bị che. `VersionsPanel` xác nhận khôi phục/xoá **ngay trong panel** (không mở dialog chồng), dùng chung được cho drawer (desktop) và `FullScreenSheet` (mobile).
- Browser pane chặn iframe sandbox (`ERR_BLOCKED_BY_CLIENT`) → khung xem lại phiên bản trông trống khi kiểm bằng pane; kiểm nội dung bằng `fetch` URL `/versions/:id/preview` (200, CSP sandbox, `data-mode="present"`).
- Nhãn bottom nav mobile 5 mục ở 375px chỉ ~70px → "Được chia sẻ" bị cắt; giữ nhãn ngắn, đặt nghĩa đầy đủ ở `ariaLabel`.
