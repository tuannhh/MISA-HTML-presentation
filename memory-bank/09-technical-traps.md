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
- (Developer API) Request `generateContent` có giới hạn tổng ~20 MB, base64 phình ~33%. **Agent Platform** (từ 15/10/2026) không có Files API nhưng nhận inline lớn hơn nhiều — đo được PDF inline 150 MB; 300 MB thì tiến trình Node hết bộ nhớ khi dựng chuỗi JSON (base64 ~400 MB) trước khi tới Google → app giới hạn 48 MB/request và chia nhỏ. Tệp lớn đi qua **Files API** (`mediaService`): upload resumable (`x-goog-upload-url`), chờ `state=ACTIVE`, dùng `fileData.fileUri`, **luôn DELETE** sau khi dùng (tệp tự hết hạn 48 giờ nếu sót). PDF tối đa ~50 MB/1000 trang mỗi tệp → cắt cụm bằng pdf-lib.
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

### Nhận diện hình: LibreOffice + gọt viền sơ đồ (2026-10-11)
- `soffice` chạy song song với cùng hồ sơ người dùng → khoá/treo. Luôn: hàng đợi tuần tự trong `visualService`, `-env:UserInstallation=file://<thư mục tạm riêng>`, timeout + kill.
- Trang PPTX dùng Calibri/Cambria: thiếu phông → LibreOffice thay phông khác cỡ, chữ tràn khung, hộp AI lệch. Image cài `fonts-crosextra-carlito/caladea` + `fonts-liberation2` (cùng số đo).
- Gọt viền sơ đồ (`sharp().trim`) có thể ăn mất cả hình khi nền sơ đồ cùng màu nền trang → chỉ nhận bản gọt khi còn ≥ 35% mỗi chiều (50% từng loại bỏ nhầm sơ đồ hợp lệ).
- Ảnh nhúng PPTX thường trùng đúng hình đã cắt → phải `mergeEmbedded` (dHash ≤ 10) nếu không AI thấy 2 bản và đặt 2 lần.

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

### Dời ô chữ: `zoom` nhân cả `translate` (2026-10-11)
- Ô chữ đổi cỡ bằng CSS `zoom: s` + dời bằng `translate` → độ dời thực tế = translate × s (đã đo trong Chrome). Renderer/engine ghi `translate: (x/s)px (y/s)px` để vị trí lưu (`data-mv`, % trang) không đổi khi đổi cỡ.
- Không dùng `transform` cho vị trí ô chữ: engine ghi đè `transform` khi chạy hiệu ứng vào → chữ nhảy về chỗ cũ. Thuộc tính `translate` cộng dồn độc lập.
- `fitSlide` (tự co chữ khi tràn) phải đo **không có** translate (lớp `.fit-m`), nếu không ô chữ dời ra mép bị tính là tràn → thu nhỏ cả trang.
- Sau A+/A− trang được dựng lại (node mới) → engine bám lại ô chữ cùng `data-e` và **giữ chỗ nhóm nút** khi chuột còn trên đó; nếu đặt lại theo ô chữ (cao lên) thì cú bấm kế tiếp trượt sang nút khác.
- Khung thấp (điện thoại) thanh định dạng `#rtb` (z-index 1000) đè nhóm nút → chạm A− trúng `#rtb`. `placeGrip` xếp ngang dưới ô chữ khi khung < 420px và né hộp `#rtb`.
- Puppeteer: `touchscreen.tap(x, y)` theo toạ độ trang không tới được iframe sandbox (khác tiến trình) → dùng `elementHandle.tap()` trong frame.

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

## Sau audit Codex (2026-10-11)

### Đổi chữ ký hàm nội bộ → test đơn vị thuần không bắt được
- `storeImage(deck, kind, img, name)` đổi chữ ký ở commit chia sẻ nhưng 3 chỗ gọi trong `storeUserMedia`/`illustrate` không đổi theo; unit test hàm thuần xanh trong khi **luồng tạo bài có media hỏng 4 ngày**. Luôn có ít nhất 1 test chạy service thật với repository/storage/AI giả (`test/unit/service-media.test.js`) cho mỗi luồng chính.

### Bản nháp sửa vs phiên bản máy chủ (frontend)
- `deck.specVersion` (mới nhất máy chủ trả) **không** phải phiên bản mà bản nháp xuất phát. `useEditor` giữ `draftVersion` riêng; mọi chỗ lưu/giữ nháp tạm dùng `draftVersion`. Đừng gửi `deck.value.specVersion` khi lưu.
- Sau khi lưu mà người dùng đã gõ thêm: giữ bản nháp mới (nền = bản vừa lưu) — đừng `adopt()` ghi đè.

### Test composable giao diện trong Node
- `test/helpers/alias-loader.mjs` (`module.register`) ánh xạ `@/`, `@shared/`, và thay `@/lib/api.js` bằng `fake-api.mjs`. Đặt `globalThis.window` **sau** khi nạp module (một số module shared rẽ nhánh theo `window`).

### Test race trên MySQL thật
- `test/integration/concurrency.test.js` tự dựng DB tạm `<DB_NAME>_it` từ `schema.sql` (cần quyền; xem README test/integration) và bỏ qua khi không kết nối được. Khi sửa chỗ khoá, **bỏ khoá thử** để chắc test thật sự đỏ.
- Cổng MySQL 3307 chỉ có khi chạy kèm `docker-compose.dev.yml`; `docker compose up -d --build app` KHÔNG kèm override có thể tạo lại mysql mất cổng → dùng `--no-deps app`.

### Công cụ ngoài (LibreOffice/pdftoppm)
- Chạy với `toolEnv()` (PATH, LANG, fontconfig, TMPDIR + HOME riêng + proxy chết). Thiếu biến cần cho phông chữ → render sai chữ; thêm tên biến vào `TOOL_ENV_KEYS` thay vì kế thừa toàn bộ.

### Giới hạn API khi dùng chung IP
- **Không dùng IP làm khoá hạn mức** (mạng/VPN MISA → mọi người chung 1 IP; chủ dự án chốt bỏ hẳn 12/10/2026). `api` đặt SAU `loadUser`, chỉ đếm người đã đăng nhập. Thêm route ghi tốn tài nguyên → đặt sau `auth` và dùng limiter `byUser` (khoá `req.user.id`) như `share`/`media`; không thêm `ipKeyGenerator`.

## Chặng A bổ sung + xuất bản (2026-10-12)

### Hàng đợi: giữ chỗ trước `await`
- Kiểm `pending < trần` rồi mới `await` ghi DB → nhiều request cùng thấy "còn chỗ" (A03). Dùng `Semaphore.reserve(maxPending)` **đồng bộ** trước mọi `await`; vé phải `run()` hoặc `release()` đúng 1 lần (lỗi trước khi vào hàng → `release`). `run()` chuyển thẳng chỗ cho job chờ (không hở khoảng đếm). Tạo bài và dựng bài dùng chung 1 hàng.

### Bản nháp khi `updateMeta` / lưu dàn ý (frontend)
- Mọi yêu cầu ghi của trình soạn thảo đi qua `serial()` (tuần tự). Xét "đang sửa dở" **lúc phản hồi về**, không phải lúc gửi; giữ `draftVersion` cũ cho bản nháp giữ lại để lần lưu sau vẫn 409 nếu người khác đã lưu. `useOutline.save` giữ chữ gõ thêm trong lúc chờ (A02).

### Bật công khai + bản gốc: 1 giao dịch, khoá dòng bài
- `presentations.updateOwned(..., { baselineBy })` khoá dòng bài `FOR UPDATE`, cập nhật, rồi `insertBaseline` cùng giao dịch (A06). Tách 2 bước như cũ gây deadlock khi bật công khai song song + mời người lần đầu. Chụp bản gốc / handoff / mời / xuất bản đều khoá **cùng dòng bài** trước.

### Phục hồi sau restart: bản sao dở
- `failStaleGenerating`: `source_kind='copy'` luôn → `failed` ("Sao chép bị gián đoạn…") — chạy TRƯỚC luật đưa bài AI có dàn ý về `outline` (luật này loại trừ `copy`), không thì bản sao thiếu media bị đẩy sang dựng AI (A04).

### Xuất bản ra web
- `req.hostname` quyết định luồng → cổng Internet phải ép Host (xem `08`). Thêm route vào domain công khai = thêm vào `publicSiteRoutes` **và** regex `location` mẫu trong `docs/DEVOPS-NETWORK.md` §6.3.
- Engine trình chiếu ở trang công khai chạy top-level (`EMBED=false`) → video/YouTube mở lớp phủ riêng, cần `media-src 'self'` và `frame-src` YouTube; YouTube cần Referer (`Referrer-Policy: strict-origin-when-cross-origin`).
- `fetch` (undici) bỏ header `Host` tự đặt → test phân luồng dùng `node:http` (`test/unit/publish-site.test.js`).
- Test tích hợp/smoke **không** chạy vào stack Docker đang có dữ liệu (`misa-presentation-*`); dùng MySQL tạm (`mp-it-mysql`) hoặc compose project riêng.

### Liên kết + trang Liên hệ / Ưu đãi (2026-10-12)
- Quy tắc chung `svg * { transform-box: fill-box; transform-origin: center }` (theme.css) làm lệch hình có thuộc tính `transform` vẽ theo toạ độ SVG gốc (logo Gọi/Viber) → `.bico *` đặt lại `view-box` + `0 0`. SVG nhúng ngoài deck (form `ContactFields`) cũng phải đặt lại.
- `href=` phải đứng CUỐI thuộc tính `⟦…⟧` (URL có dấu phẩy). Regex thẻ cho thuộc tính dài tới 600 ký tự; trần chuỗi thô trừ phần `href=` (`hrefWeight`) — sửa ở `specService.str` thì sửa cả `editPaths.cutR`.
- Dàn ý chứa `[nhãn](URL)` → mọi chỗ đưa chữ dàn ý cho AI dựng bài / so độ dài phải `stripLinks` (đã làm ở `outlineForModel`, `composeDeckFromOutline`, `OutlineSlideCard`).
- `pdftotext` thiếu (máy dev chưa cài Poppler) → `collectSourceFacts` chỉ log cảnh báo; đối chiếu số điện thoại trong PDF chỉ đủ khi có poppler (Docker có; Windows cài bằng winget — `07`). Git Bash có sẵn `/mingw64/bin/pdftotext` nhưng **không có `pdftoppm`** — `which pdftotext` thấy có chưa chắc đủ bộ.
- Công cụ chụp màn hình của khung trình duyệt trong app không vẽ nội dung iframe sandbox (cả cấu hình cũ) — kiểm tra khung sửa bằng cách mở thẳng `/api/presentations/<mã>/preview?edit=1`.

### Kiểu chữ tiêu đề (2026-10-12)
- Đổi hoa/thường trên chữ có thẻ `⟦…⟧`: KHÔNG dùng `repaintRich` (khớp theo nội dung → lệch định dạng khi chữ chỉ đổi hoa/thường, vd. `⟦accent⟧Chương trình ưu đ⟦/⟧ãi`). Dùng `parseRich` → cắt chuỗi mới theo độ dài từng đoạn → `serializeRich`.
- "ai" là đại từ tiếng Việt → không tự ép thành "AI"; chỉ ép MISA/AMIS/ASP/JETPAY.
- Dòng tư liệu đang Viết Hoa Từng Chữ (tiêu đề, banner) không được dùng làm bằng chứng tên riêng, nếu không "Ngân Hàng", "Kế Toán" sẽ bị giữ hoa.
- `toLocaleLowerCase('vi')` cho chữ có dấu tiếng Việt; tách từ bằng `\p{L}[\p{L}\p{M}\p{N}]*` (chữ tổ hợp dấu rời).

### Kiểm thử luồng chính + đo tải + gate DevOps (2026-10-12)
- **node:test chạy song song các hook `before` gốc** trong 1 tệp → tách "dựng DB" và "dựng app" thành 2 hook thì app có thể lên trước DB. Dùng `useHttpApp` (`test/integration/helpers/httpApp.mjs`): 1 hook duy nhất.
- **Chromium mồ côi giữ tiến trình**: việc nền (thumbnail sau khi dựng) gọi `browser.getBrowser()` SAU `close()` → mở Chromium mới không ai đóng, test treo vô hạn (DB đã xoá, tiến trình không thoát). `browserService` có cờ `closed`: sau close → 503 `RENDER_UNAVAILABLE`, không mở lại.
- **Hàng chụp ảnh bìa không trần (lộ khi đo tải)**: mỗi lần lưu → 1 lượt `browser.screenshotSlides` với HTML nhúng phông dựng SẴN trước khi chờ. 500 người lưu ~4 lần/giây > sức chụp ~2,4 ảnh/giây → hàng nghìn lượt chờ, RAM 0,4 → 2,8 GB, xuất PDF (cùng semaphore trình duyệt, FIFO) chờ > 180 giây, app vẫn 200% CPU 20 phút sau khi hết tải. Việc nền phải gộp theo khoá + chạy lần lượt + dựng dữ liệu nặng khi tới lượt (`coalescingQueue`); việc người dùng chờ phải có trần hàng.
- **bcryptjs (JS thuần) chặn luồng chính**: 12 vòng ≈ 210 ms/lần trong container; 8 lần đăng nhập cùng lúc → luồng chính đứng ~0,8 s, mọi request khác chờ. Băm/so chạy trên worker_threads (`src/lib/passwordHasher.js`, `PASSWORD_HASH_THREADS`); định dạng hash không đổi. Test hoặc script dựng `createAuthService` không truyền `hasher` → tự tạo pool. **Bẫy `unref`** (2026-10-14): gọi `worker.unref()` rồi mới `worker.on('message')` → gắn listener tự ref lại worker, tiến trình không bao giờ thoát (`create-admin.js` treo → smoke `SMOKE_BOOTSTRAP=1` kẹt vô hạn); unref sau khi gắn listener mà không ref lúc làm việc → tiến trình thoát trước khi nhận kết quả. Đúng: gắn listener → `unref()`; `ref()` khi giao việc, `unref()` khi xong (test `password-hasher.test.js` chạy tiến trình con không gọi `close()`).
- **`.env` của Docker có `CHROME_PATH=/usr/bin/chromium`** — chạy test trên Windows mà dùng nguyên cấu hình → PDF lỗi. Harness tích hợp tự lùi về dò Chrome/Edge khi đường dẫn không tồn tại; server trả 503 `RENDER_UNAVAILABLE` (không còn 500).
- **Git Bash đổi đường dẫn** dạng `/data/...` trong tham số `docker exec` thành `C:/Program Files/Git/data/...` → script `scripts/ops/*.sh` đặt `MSYS_NO_PATHCONV=1`.
- **Compose gốc cứng `image: misa-presentation:latest`**: dựng stack đo tải/thử nghiệm bằng `docker compose build` sẽ GHI ĐÈ image đang chạy production local. Stack đo tải dùng override `image: misa-presentation:loadtest` + `-p mp-load` + cổng riêng (8093; 8091 đã bị chiếm trên máy dev).
- `express-session` với `cookie.secure=true` **không gửi cookie** khi request đến bằng http thường (kể cả sau proxy mà thiếu `X-Forwarded-Proto` / `TRUST_PROXY` sai) → đăng nhập "thành công" nhưng không có phiên. `TRUST_PROXY` = đúng số lớp proxy (cổng vào TLS → nginx → app = 2).

## Nguồn link + ảnh trong trang web (2026-10-14)

- **Ảnh lazy-load:** `src` của ảnh trong bài thường là GIF 1×1 base64 (vnexpress, WordPress lazy) — ảnh thật ở `data-src` / `data-srcset` /
  `data-lazy-src` hoặc trong `<noscript>`. `bestSrc` ưu tiên ảnh lớn nhất của các thuộc tính srcset, rồi `data-*`, `src` cuối; bỏ `data:`.
  Đừng bỏ `<noscript>` khi tìm ảnh (khác `htmlToText`).
- **`<picture>`:** `<source data-srcset>` đứng TRƯỚC `<img alt>` của cùng ảnh → chống trùng giữ mục đầu nên phải **bổ sung** alt/chú thích từ
  mục sau (`findPageImages.add`), nếu không ảnh mất mô tả.
- **Cùng ảnh nhiều cỡ:** `?w=1200&h=0` (CDN báo) và hậu tố WordPress `-300x200.jpg` → `imageKey` bỏ query khi đường dẫn có đuôi ảnh + bỏ hậu tố
  cỡ; ảnh sinh theo tham số (`/img.php?id=1`) giữ query.
- **`width="100%"`:** `parseInt` = 100 → bị coi là ảnh nhỏ < 120px. Chỉ tính `width/height` khi là số thuần.
- **Alt dạng mã tệp** ("wm1-wm1-1791946565839-…") không mang nghĩa → bỏ (giữ alt có khoảng trắng / chữ tiếng Việt).
- **Facebook:** không đăng nhập thì thân trang là khung đăng nhập — `htmlToText` cho chữ rác; chỉ dùng thẻ `og:` (UA mặc định của safeFetch vẫn
  nhận được og). `og:image` của **trang** là ảnh đại diện (logo) → AI xếp `logo`, không gắn; của **bài đăng** là ảnh bài.
- **Băng rôn có mã QR** (ảnh trang web hay gặp): AI từng xếp `qr` → gắn làm QR của trang Liên hệ. Đã siết prompt (`qr` = mã QR chiếm gần hết
  ảnh) + chốt chặn tỷ lệ cạnh ≤ 1,6 trong `generateOutline`.
- **Đường dẫn tương đối** sau chuyển hướng (http→https, rút gọn link, `facebook.com/share/…`) phải tính theo `res.finalUrl`, không theo URL gốc.
- **AI chỉ xem trước ~30 ảnh đầu** (`MODEL_IMAGE_PREVIEWS`): ghép ảnh nhiều link nối đuôi thì link sau (nhất là sau 1 Google Slides nhiều ảnh)
  không được xem → `ingestLinks` xen kẽ ảnh giữa các link.
- **multer + trường lặp:** `fd.append('urls', …)` nhiều lần → `req.body.urls` là mảng, **1 lần → chuỗi**; precheck nhận cả hai. Trần
  `limits.fields` của multer = 20 + `MAX_SOURCE_LINKS` (đếm cả các trường chữ khác).
- **Thử bằng trang thật** (`tmp/try-links.mjs` gọi `ingestSource` không qua AI) trước khi tốn lượt Gemini: thấy ngay ảnh nào được chọn, mô tả gửi
  AI và thời gian tải.

## Soạn thảo: tràn chữ, cỡ chữ, ngắt dòng + thư mục Drive (2026-10-14)

- **Tràn lên trên không tạo scroll**: khối căn đáy (`justify-content: flex-end`) hoặc căn giữa trong hàng grid cố định mà cao hơn khung → phần
  thừa nằm ở **phía trên / bên trái** gốc toạ độ, `scrollHeight` vẫn bằng `clientHeight` → `fitSlide` cũ (chỉ so scroll) tưởng vừa, `overflow:hidden`
  cắt mất dòng đầu (bài "Diễn đàn quốc gia…" trang 5). Phải so **khung chữ với khung cắt ở 4 phía** (`fitTargets` + `clipped`) và dùng
  `safe flex-end` / `safe center` cho khối có thể cao hơn khung.
- **`text-wrap: balance`** chia đều độ dài mọi dòng → tiêu đề 2 dòng có dòng 1 ngắn, bên phải trống mà chữ không lên được ("…và hành / động…").
  Dùng `pretty` (chỉ tránh dòng cuối mồ côi). `pretty` coi dấu gạch nối/gạch ngang là chỗ ngắt → khoảng năm bị tách "2026–" / "2035": bọc
  khoảng số trong `span.nb` (`rich.js keepRanges`). Span thêm vào chữ có định dạng phải **không có lớp `.rt`** (engine `domChars` chỉ đọc định
  dạng từ `.rt`, span khác đi xuyên qua) — nếu không, sửa chữ trên khung sẽ ghi rác vào spec.
- **Cỡ chữ theo pt bị trang tự co "ăn bớt"**: `zoom` nhân lên cỡ đã gồm `--k` của trang; chữ to lên → `fitSlide` giảm `--k` → cỡ thật nhỏ hơn số
  vừa gõ (gõ 20 → hiện 18,5). `setPt` thử cỡ + co lại trang vài lượt (chưa lưu) rồi mới `commitMove` 1 lần — gửi `deck:move` nhiều lần = nhiều
  bước hoàn tác.
- **Đo chữ trong khung xem trước bị ẩn**: `innerText` của phần tử ở trang không hiện (visibility hidden) = `''`; rAF không chạy khi tab nền
  không vẽ (tự co khi gõ chậm lại) — kiểm tra bằng `textContent` / đợi trang hiện, đừng kết luận "không chạy".
- **Drive API với API key**: chỉ đọc được thư mục/tệp chia sẻ "Bất kỳ ai có đường liên kết"; 404 = chưa chia sẻ **hoặc** không tồn tại (Drive
  không phân biệt — báo chung "chưa chia sẻ công khai"). Thư mục chia sẻ trước 2021 cần `resourcekey` (header `X-Goog-Drive-Resource-Keys`).
  Tệp Google gốc không có `size`, chỉ xuất được ≤ 10 MB (`exportSizeLimitExceeded` → bỏ tệp). Drive gắn `text/plain` cho cả tệp cấu hình
  (`recording.conf` của Zoom) → lọc theo đuôi tệp. Kiểm khoá có bật Drive API: gọi `files/<mã giả>` → 404 `notFound` = đã bật, 403
  `accessNotConfigured`/`SERVICE_DISABLED` = chưa bật (không in khoá ra log).
- **`safeFetch` mang nguyên header qua chuyển hướng** (kể cả sang tên miền khác) → khoá Google để ở query `key=` (không đặt header
  `x-goog-api-key`), header chỉ chứa thứ không bí mật (resourcekey vốn nằm trên link chia sẻ).

## Tải tệp + hoàn tác (2026-10-14)

- **Trình quản lý tải (IDM…) + `fetch` → blob = tệp 0 KB**: tiện ích IDM bắt phản hồi tải được (`application/pdf`…) kể cả của `fetch`/XHR, huỷ luồng
  trình duyệt rồi tự tải lại URL → `blob()` rỗng nhưng `<a download href=blob:>` vẫn chạy → 2 lượt tải, 1 tệp 0 KB. Tải tệp cho người dùng luôn
  bằng **GET thường** (`Content-Disposition: attachment`) tới URL tải lại được nhiều lần (IDM gửi lại request + Range nhiều luồng) — xem `05` §23.
  Lỗi cần hiện tiếng Việt → tách bước dựng (POST, JSON) khỏi bước tải.
- **Kiểm tải bằng puppeteer**: `setRequestInterception(true)` làm Chrome **huỷ** lượt tải (`downloadProgress: canceled`) → tắt chặn request trước
  khi tải; `Browser.setDownloadBehavior.downloadPath` phải là đường dẫn Windows (`cygpath -w`), đường `/tmp/...` của Git Bash cũng làm huỷ.
  Kịch bản kiểm thật: `tmp/undo-download-check.mjs <mã bài> <thư mục Windows>` (chỉ sửa bản nháp, chặn mọi PATCH/PUT/DELETE).
- **Hoàn tác theo ảnh chụp JSON**: dựng lại spec phải giữ **thứ tự khoá** (`{...spec, slides: null}` rồi gán lại `slides`) — lệch thứ tự là
  "Chưa lưu" mãi dù nội dung trùng bản gốc (`dirty` so JSON). Component nào tự "chuẩn hoá" bản nháp khi dựng lại (gán giá trị mặc định lúc mount)
  sẽ tạo bước mới ngay sau hoàn tác và **xoá nhánh làm lại** — chuẩn hoá phải làm ở `adopt`/`withDesignDefaults`, không ở component.
- **Ctrl+Z trong ô chữ của khung slide**: engine hoãn `deck:render` khi ô chữ đang focus (để không giật con trỏ) → hoàn tác lúc đang gõ phải rời ô
  trước (engine `askHistory` gửi nốt nội dung + `blur`) thì slide mới hiện bước vừa hoàn tác; không thì chữ cũ trên DOM ghi đè lại bản nháp.
- Test `useEditor` với máy chủ giả: dữ liệu mở bài phải là bản **đã chuẩn hoá** (`prepareSpecForSave`) như máy chủ thật — bản thô làm bước sau lưu
  khác ở mọi trang (chuẩn hoá) → chuyển nhầm về trang 1 khi hoàn tác.

## Gemini qua Agent Platform (2026-10-15)

- **Không có Files API** (`supportsFiles: false`): mọi tư liệu gửi inline, tối đa `AGENT_INLINE_MAX` = 48 MB/request (`mediaService`). WAV lớn
  cắt theo thời lượng (`wavSegments`, đọc lười từng đoạn); ghi âm nén (MP3/M4A…) > 48 MB → 422 `AUDIO_TOO_LARGE`; 1 cụm PDF > 48 MB → `PDF_TOO_LARGE`.
  Đừng nâng trần lên ~300 MB: Node hết bộ nhớ khi dựng chuỗi JSON base64 trước khi request rời máy.
- **Thử lại im lặng làm "treo" 8 phút**: lần smoke đầu dựng bài mất 507 s = 2 lần timeout 240 s + 1 lần thành công 27 s, log không có gì. Nay mỗi
  lần thử lại ghi `gemini_retry` (`provider`, `attempt`, `reason`, `ms`) — thấy bài chậm thì grep log này trước.
- **Token**: 401 từ `aiplatform` → `invalidate()` rồi thử lại 1 lần; `invalid_grant` khi xin token = khoá bị thu hồi hoặc đồng hồ máy lệch.
  Logger che mọi trường có chữ "token" → số token sử dụng hiện `***` (cố ý, không phải lỗi).
- **File khoá trên ổ mạng (UNC `\storage\…`)**: Docker Desktop không bind-mount được, Git Bash còn đổi hỏng đường dẫn → chép về máy
  (`C:/Users/<user>/.secrets/misa-presentation/`, ACL chỉ user hiện tại) rồi trỏ `GCP_KEY_FILE` vào đó. Container chạy user `node` (UID 1000) phải đọc được.
- **`COMPOSE_FILE` trên Windows**: phân cách bằng `;` + `COMPOSE_PATH_SEPARATOR=;` (`.env` dev đã đặt). Trong Git Bash, MSYS tự đổi biến môi trường
  có `;`/`:` thành đường dẫn POSIX → chạy `docker compose` trong `MSYS2_ENV_CONV_EXCL='*' MSYS_NO_PATHCONV=1 bash -c '…'` hoặc dùng PowerShell.
- `GEMINI_PROVIDER=agent-platform` mà thiếu tệp override compose → container nhận đường dẫn Windows của `GOOGLE_APPLICATION_CREDENTIALS` trong `.env`
  → fail-fast `ENOENT` (đúng thiết kế). Test tích hợp/đo tải ép `provider: 'developer-api'` để không cần file khoá.
