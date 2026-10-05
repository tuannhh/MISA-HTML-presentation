# 09 — Bẫy kỹ thuật & lỗi đã gặp

## Kiến trúc / vận hành

### Hàng đợi AI nằm trong RAM, một tiến trình
- **Hiện tượng:** khởi động lại container giữa lúc AI đang tạo → bài kẹt `generating`.
- **Xử lý hiện tại:** `recoverStale()` lúc khởi động đánh các bài đó `failed` (người dùng tạo lại).
- **Hệ quả:** **không** chạy nhiều bản sao `app` sau load balancer — semaphore, giới hạn song song, rate-limit (memory store) và hẹn giờ thumbnail đều chỉ tính trong một tiến trình. Muốn scale ngang phải chuyển sang hàng đợi ngoài (Redis/BullMQ…) và rate-limit store dùng chung.

### Storage cục bộ (Docker volume)
- Ảnh/thumbnail nằm trong volume `app-data`. Dev local dùng `./data/storage` — **chung DB nhưng khác thư mục tệp** → bài tạo bên dev mở bên container sẽ thiếu ảnh (và ngược lại). Không phải lỗi app.
- Sao lưu phải gồm cả DB và volume cùng thời điểm.

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

## Giao diện

### Bản sao MDS có vá cục bộ (phải giữ khi cập nhật MDS)
| Component | Vá | Lý do |
|---|---|---|
| `MInput.vue`, `MTextarea.vue` | `defineOptions({ inheritAttrs: false })` + `useAttrs()`: `class`/`style` ở wrapper, mọi attr khác (`id`, `name`, `autocomplete`, `aria-*`, `maxlength`, `inputmode`…) chuyển xuống thẻ input/textarea thật | Bản gốc gắn attr lên `div` bọc ngoài → mất autocomplete, label `for` không liên kết, trình đọc màn hình không đọc nhãn |
| `MDataTable.vue` | Prop `hideTools: ('refresh'\|'export'\|'columns'\|'filter')[]`; hàng hiện nút thao tác cả khi `group-focus-within` | Ẩn nút không có chức năng; dùng được bằng bàn phím |
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
- Trong khung trình duyệt tích hợp của Claude desktop, iframe preview báo `ERR_BLOCKED_BY_CLIENT` — là giới hạn của khung đó, **không phải lỗi app**. Kiểm chứng preview bằng Chrome thật hoặc puppeteer (`tmp/iframe-check.mjs`).

### Thuộc tính rơi xuống `MSidebar`
- Gắn class/attr trực tiếp lên MSidebar gây cảnh báo extraneous attrs (component nhiều root) → bọc trong `<div>`.

### `class` trên `MInput` không giới hạn được bề rộng
- MInput gắn `class` vào wrapper nhưng ô input bên trong vẫn `w-full` theo cha → muốn ô hẹp (vd. số trang 96px) phải bọc `<div class="w-[96px]">`.

## Kiểm thử

### `node --test <thư mục>` lỗi trên macOS/Linux
- Node 22+ coi đối số là tệp/glob: `node --test test/unit/` báo `Cannot find module '.../test/unit'`. Dùng glob trong ngoặc kép (`"test/unit/**/*.test.js"`) — Node tự mở rộng glob, chạy được cả Windows lẫn macOS.

## Dữ liệu

### Chữ tiếng Việt lỗi mã hoá khi test bằng curl trên Windows
- Gửi JSON tiếng Việt bằng `curl` trong cmd/PowerShell cũ tạo tên kiểu `Ngu?i D�ng` — do code page của console, không phải server. Dùng script Node (`test/smoke/smoke.mjs`) hoặc tệp JSON UTF-8 với `--data-binary @file`.
