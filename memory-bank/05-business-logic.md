# 05 — Logic nghiệp vụ cốt lõi

## 1. Spec — mô hình dữ liệu của bài trình bày

Bài trình bày được lưu dưới dạng **spec JSON** (`presentations.spec`) — là nguồn sự thật duy nhất. Preview, HTML xuất ra, PDF và ảnh bìa đều được render từ spec qua `shared/deck/render.js`. AI **không bao giờ** sinh HTML.

```jsonc
{
  "title": "…", "footer": "…",
  "theme": "<id mẫu màu — xem §7>|custom", "palette": { "tone", "primary", "secondary" } /* chỉ khi custom */,
  "background": "network|circuit|grid|matrix|waves|hex|dots|orbits|particles|radar|none",
  "font": { "heading": "inter|montserrat|barlow|roboto|google-sans", "body": "…" },
  "logo": { "asset", "cutout" /* bản tách nền */, "removeBg", "position": "tl|tc|tr|bl|bc|br", "size": 40–360, "showOn": "all|cover|inner" } | null,
  "style": "neon|editorial|solid|outline|soft" /* phong cách toàn bài — hệ thống tự chọn khi dựng, §9 */,
  "slides": [
    { "layout": "cover|section|agenda|bullets|cards|stats|image|gallery|timeline|process|quote|comparison|closing",
      "kicker", "title", "highlight" /* phải là chuỗi con của title */, "subtitle", "caption", "tags": [],
      "icon" /* tên trong shared/deck/icons.js */,
      "items": [{ "title", "text", "value", "icon" }], "stats": [{ "value", "prefix", "suffix", "label" }],
      "steps": [...], "columns": [{ "title", "subtitle", "points": [] }],
      "quote": { "text", "author", "role" },
      "image": { "asset": "<uuid>", "fit": "cover|contain", "alt" }, "images": [{ "asset", "alt" }],
      "video": { "provider": "file|youtube", "asset" /* file */, "id" /* YouTube 11 ký tự */, "poster", "title", "caption" }
               /* chỉ ở MEDIA_LAYOUTS: cover, section, bullets, image, quote — thay chỗ ô ảnh, khung 16:9 */,
      "variant": "<biến thể trình bày của layout — §9; '' = mặc định>",
      "notes": "ghi chú người trình bày" }
  ]
}
```

Giới hạn độ dài/số lượng: `shared/deck/limits.js` (`SPEC_LIMITS`) — dùng chung server và `maxlength` trên form.

### Chuẩn hoá (`specService.normalizeSpec`)

| Chế độ | Dùng khi | Hành vi |
|---|---|---|
| **lenient** (mặc định) | Kết quả AI | Bỏ trường lạ, **cắt ngắn** chuỗi quá dài, layout thiếu dữ liệu (vd. `stats` rỗng, `image` không có ảnh thật) được **hạ về** bố cục an toàn (`bullets`/`section`…) |
| **strict** | Người dùng bấm Lưu (PATCH) | Bỏ trường lạ nhưng **trả lỗi** (`errors: string[]` tiếng Việt) khi vượt giới hạn/thiếu dữ liệu, không âm thầm sửa nội dung của người dùng |

Luôn: theme lạ → `midnight`; `custom` thiếu màu hợp lệ → `midnight`; nền/phông lạ → mặc định (`network`, `inter`); logo kẹp kích thước; 0 trang → lỗi "cần ít nhất 1 trang"; tối đa 60 trang; `dropForeignAssets` bỏ tham chiếu ảnh/video/ảnh bìa/logo không thuộc bài (chống đọc chéo asset tenant khác); logo mất `cutout` → `removeBg=false`.

## 2. Luồng tạo bằng AI — HAI BƯỚC: dàn ý → duyệt → dựng bài

Người dùng **duyệt nội dung từng trang trước** khi AI dựng slide (thay cho kiểu "AI làm xong rồi mới sửa từng trang").

### Dàn ý (`presentations.outline`, `src/services/outlineService.js`)

```jsonc
{ "version": 1, "title", "footer",
  "options": { "tone": "dark|light", "autoSlides": true, "slideCount": null } /* server giữ — người dùng không sửa được */,
  "design": { theme, palette, background, font, logo } /* như spec */,
  "slides": [{ "id": "s-xxxx", "layout": "auto|<LAYOUTS>", "title", "subtitle",
               "points": ["Tiêu đề ngắn: diễn giải", "62% — Giảm thời gian báo cáo", …] /* ≤ outlinePoints */,
               "notes", "images": [{ "asset", "caption" }], "video": {…} | null }] }
```

- 1 trang: **nhiều ảnh HOẶC 1 video** (có video → bỏ ảnh). `layout:'auto'` = AI tự chọn bố cục.
- `normalizeOutline` lenient (kết quả AI) / strict (người dùng lưu — trang trống, quá dài, media sai → lỗi). `assertMedia`: mã asset phải thuộc bài (422 `FOREIGN_ASSET`) và đúng loại (ảnh ở `images`, video `kind=video`, ảnh bìa `poster|image`, logo `kind=logo` — 422 `INVALID_MEDIA`).

### Trạng thái

```
POST / → outlining ──AI lập dàn ý──▶ outline ──PUT /outline (lưu nháp, khoá outline_version)──┐
                     lỗi → failed      │  ◀──────────────────────────────────────────────────┘
                                       └─POST /build (outline→generating nguyên tử)──▶ generating ──▶ ready
                                                                               lỗi → outline + error_message
```

### Bước 1 — lập dàn ý (`generateOutline` trong job)

```
POST /api/presentations (multipart)
  → precheckSource: đúng 1 nguồn, kiểm kích thước/loại tệp (magic bytes)
  → hàng đợi đầy (pending ≥ MAX_PENDING_JOBS) → 503 QUEUE_FULL
  → parseThemeChoice: auto (AI chọn mẫu hợp tông) | mẫu (tông theo mẫu) | custom (primary bắt buộc, #RRGGBB)
  → INSERT presentations(status='outlining') + audit → trả 202 {id}
  → genQueue (Semaphore GENERATION_CONCURRENCY) chạy nền:
      ingestSource → { pieces (văn bản), media (PDF/ghi âm), images }:
        tệp tải lên nằm trên đĩa (STORAGE_DIR/uploads, tên UUID) tới khi job xong — xoá trong finally của hàng đợi
        .pptx/.docx → jszip đọc XML (giới hạn 5000 entry, 400MB giải nén) + rút ảnh nhúng; DOCX giữ bảng dạng "| a | b |"
        .xlsx/.ods → bảng markdown theo từng trang tính (≤400 dòng × 40 cột, % / ngày theo định dạng ô, trang ẩn ghi "(ẩn)")
        .odt/.odp → chữ + ảnh ; .csv/.tsv/.txt → giải mã UTF-8 / UTF-16 BOM / Windows-1258 (decodeText), CSV ghi chú "bảng dữ liệu"
        .doc/.xls/.ppt (OLE), HEIC, Keynote… → 415 kèm hướng dẫn "Lưu thành .docx/.xlsx/.pptx" / đổi JPEG (KHÔNG đọc định dạng cũ)
        .pdf / ghi âm → media (giữ trên đĩa) ; .txt/.md → text ; ảnh → ảnh
        URL → safeFetch (chống SSRF, trần = MAX_UPLOAD_MB); Google Docs/Slides/Sheets → link export (hoặc Drive API)
        text → cắt theo MAX_TEXT_CHARS
      normalizeExtractedImages → sharp → WebP ≤1920px, tối đa MAX_IMAGES_PER_DECK → lưu storage + bảng assets
      mediaService.prepareMedia (PDF + ghi âm):
        ước lượng token (PDF ~560/trang, ghi âm ~32/giây) ≤ 120k và không PDF quá lớn → TRỰC TIẾP: đính kèm vào lượt dựng bài
        ngược lại → HAI BƯỚC: mỗi ghi âm / mỗi cụm PDF (≤100 trang, ≤45MB, cắt bằng pdf-lib) được Gemini chuyển thành
          văn bản trước (ghi âm: bản chuyển thể có người nói/số liệu/trích dẫn; PDF: chép markdown + OCR bản scan), song song 3
        vận chuyển: inline base64 khi nhỏ (tổng ≤ 8MB/lượt trực tiếp, ≤ 14MB/lượt chuyển văn bản), lớn hơn → Gemini Files API
          (resumable upload, chờ ACTIVE, luôn DELETE sau khi dùng)
      fitPieces: ghép tư liệu văn bản ≤ MAX_SOURCE_CHARS, chia công bằng giữa các tệp (tệp dài không "nuốt" tệp ngắn)
      geminiService.generateOutline: prompt tiếng Việt + responseSchema + ảnh xem trước 1280px (≤30 ảnh, ≤6MB) để AI đọc chữ
                                  trong ảnh và gắn ảnh đúng trang (tham chiếu IMGn → asset id)
        mỗi trang: tiêu đề + các DÒNG NỘI DUNG SẼ HIỂN THỊ (số liệu dạng "62% — nhãn", mốc "Q1/2026: …") + bố cục gợi ý + ghi chú
        + sourceType (designed_deck|document|raw_notes|data_table|transcript|mixed) + imageKinds [{ref, kind}] — §9
      lọc ảnh: chỉ giữ ảnh "photo" (keepPhotoImages) — §9; media người dùng gửi kèm luôn giữ + placeUserMedia — §10
      design mặc định: theme (auto → themeForTone theo gợi ý AI), nền `network`, phông Inter, chưa có logo
      → normalizeOutline (lenient) → capOutline (tự động ≤ 25 / tuỳ chỉnh = N, giữ trang kết) → setOutlineResult
      → status='outline', outline_version+1
  lỗi → status='failed', error_message tiếng Việt (lỗi không phải HttpError → thông điệp chung, chi tiết chỉ ở log)
```

### Bước 2 — người dùng duyệt (`/p/:id/outline`)

Sửa tiêu đề/mô tả/từng dòng (Enter = dòng mới), đổi bố cục, thêm/xoá/chuyển/nhân bản trang, gắn ảnh/video/YouTube cho từng trang, chọn thiết kế (màu, nền động, phông, logo). Lưu = `PUT /outline` (409 khi lệch version). Nháp giữ trong `pendingDrafts` khi đổi bề mặt desktop↔mobile.

### Bước 3 — dựng bài (`buildDeck`)

```
POST /build {outlineVersion, outline?} → (lưu nếu có outline) → startBuildOwned (outline→generating, khớp version) → 202
  genQueue: geminiService.designDeck(dàn ý + chỉ dẫn) → mapModelDeck(raw, []).slides (mỗi trang có ref Sn)
    → composeDeckFromOutline: ghép theo ref; chữ người dùng (title/subtitle/notes) THẮNG chữ AI; bố cục người dùng chọn
      được tôn trọng (trừ khi media buộc: 1 ảnh/video → bố cục có ô media, ≥2 ảnh → gallery); trang AI thiếu → outlineSlideToSpec
      (dựng xác định: stats từ "62% — nhãn" kể cả số kiểu VN "1.250 tỷ đồng", timeline/process từ "Mốc: nội dung"…)
    → applyOutlineMedia → normalizeSpec (lenient) → dropForeignAssets(mọi asset media của bài)
    → artDirect(spec, {seed: UUID ngẫu nhiên, ratio}) — chọn phong cách + biến thể từng trang (§9)
  → status='ready', spec (slide_count = số trang dàn ý) → hẹn ảnh bìa;  lỗi → buildFailed: về 'outline' + error_message
```

- **Số trang:** `auto` → AI tự chọn theo lượng nội dung, tối đa 25; số cụ thể → "ĐÚNG N trang" (prompt + mô tả schema) và server cắt về N nếu thừa.
- **Tông màu:** xem §7.
- Giao diện poll `GET /:id` mỗi ~3 giây khi `outlining`/`generating`; danh sách poll khi còn bài đang xử lý hoặc chưa có ảnh bìa. Bấm vào bài đang `outlining`/`outline`/`generating` → `/p/:id/outline`.
- Khởi động lại server: `recoverStale()` → `generating` còn dàn ý → về `outline` (dựng lại được); `outlining`/`generating` không có dàn ý → `failed` (hàng đợi nằm trong RAM).

## 3. Chỉnh sửa & lưu

- Trình soạn thảo làm việc trên **bản nháp** (`draft`) clone từ spec; mọi thay đổi chỉ cục bộ cho tới khi bấm **Lưu**.
- **Lưu** = `PATCH /:id { spec, specVersion, title }` → strict normalize → `UPDATE … WHERE spec_version = ?` → version +1. Lệch version → 409, giao diện hiện link "Tải lại bản mới nhất".
- Thành công → khung xem trước reload, giữ trang đang xem; ảnh bìa render lại sau 4 giây (gộp nhiều lần lưu liên tiếp — `scheduleThumbnail`).
- **Tỷ lệ** và **Công khai/Riêng tư** áp dụng ngay (PATCH riêng, không cần spec) và **giữ nguyên bản nháp** chưa lưu.
- Rời trang khi nháp chưa lưu → hộp thoại xác nhận. Nếu component bị unmount do đổi bề mặt desktop↔mobile, nháp được giữ trong `pendingDrafts` (RAM) và khôi phục nếu `specVersion` vẫn khớp.
- Ảnh mới: `POST /:id/assets` → trả asset id + URL ký → gắn vào `image.asset` của slide trong nháp. Trang có ô media (`MEDIA_LAYOUTS`) chọn được tab Ảnh / Video; Lưu bỏ video ở bố cục không có ô media, bỏ `palette` khi theme không phải `custom`.
- Bảng **Thiết kế** (màu, nền, phông, logo) dùng chung giữa bước dàn ý và trình soạn thảo (`DesignPanel.vue`).

## 4. Chia sẻ & đa tenant

| Thao tác | Chủ sở hữu | Người khác (bài public + ready) | Người khác (bài private) |
|---|---|---|---|
| Xem / trình chiếu / xem trước | ✅ | ✅ | ❌ 404 |
| Tải HTML / PDF | ✅ | ✅ | ❌ 404 |
| Nhân bản | ✅ | ✅ (thành bản private của mình) | ❌ 404 |
| Sửa / đổi tỷ lệ / chia sẻ / xoá / thêm ảnh | ✅ | ❌ | ❌ |

- Công khai chỉ khi `status='ready'`. `published_at` giữ mốc lần công khai đầu tiên; chuyển về private → NULL.
- Mọi truy vấn theo tenant đi qua `tenantClause()`; truy vấn "public" là ngoại lệ có chủ đích, luôn kèm `visibility='public' AND status='ready'`.
- Trả 404 (không phải 403) khi không có quyền để không lộ sự tồn tại của bài.

## 5. Xuất bản

| Định dạng | Cách làm | Ghi chú |
|---|---|---|
| Xem trước (iframe) | `render(mode='present')`, ảnh/video qua URL ký HMAC, phông qua `/deck-assets/fonts` | Chạy engine chuyển động + nền động; nhận `deck:goto` qua postMessage, báo `deck:slide`; bấm video → báo `deck:video` cho app (§8) |
| HTML một tệp | `render(mode='present', embedFont)` + ảnh/phông inline base64; video tải lên nhúng `<script type=application/octet-stream>` khi tổng ≤ `EXPORT_VIDEO_MB` | Mở offline, giữ chuyển động; bấm video → phát toàn màn hình ngay trong tệp (blob); YouTube mở iframe nocookie (cần mạng) |
| PDF | `render(mode='print')` → Chromium `page.pdf` khổ đúng tỷ lệ (canvas cao 1440px) | Không chuyển động (nền vẽ tĩnh 1 khung); video hiện ảnh bìa; Chromium chặn mọi request mạng |
| Ảnh bìa | Slide đầu, `mode='present'`, chụp sau khi hiệu ứng ổn định → WebP | Asset kind `thumbnail`, ảnh cũ bị xoá |

Kích thước canvas (`RATIO_SIZES`): 16:9 = 2560×1440, 4:3 = 1920×1440, 2:1 = 2880×1440, 3:1 = 4320×1440 — engine scale vừa khung nhìn.

## 6. Tài khoản

- Tự đăng ký: bật/tắt bằng `SELF_REGISTRATION`, chỉ domain trong `ALLOWED_EMAIL_DOMAINS` (để trống = mọi domain).
- Admin tạo tài khoản / đặt lại mật khẩu → mật khẩu tạm hiển thị **một lần** → người dùng bắt buộc đổi (router chặn mọi trang khác, API trả `MUST_CHANGE_PASSWORD`).
- Admin đầu tiên: `npm run create-admin -- email "Họ tên"` (xem `07`).
- Không thể tự khoá/tự hạ quyền; luôn còn ít nhất 1 admin active (`LAST_ADMIN`).

## 7. Thiết kế: tông màu, nền động, phông chữ, logo

- **Tông màu** (`shared/deck/palette.js`): chọn khi tạo bài và đổi được ở bảng Thiết kế.
  - `auto` — AI chọn mẫu hợp tông (sáng/tối) theo nội dung.
  - Mẫu tối: midnight (xanh đêm–cyan), ocean (navy–trắng), aurora (tím–hồng), carbon (đen–cam), emerald (đen–xanh lá), crimson (đen–đỏ), gold (đen–vàng kim).
  - Mẫu sáng: paper (xanh dương–đen), ember (cam–đen), sky (xanh–trắng), sunset (cam–trắng), forest (xanh lá–đen), royal (tím–đen), ruby (đỏ–đen).
  - `custom` — người dùng nhập màu chính + màu phụ (#RRGGBB) + tông nền; giao diện gợi ý cặp màu theo tông (`CUSTOM_SUGGESTIONS`).
  - 5 mẫu gốc (`CSS_THEMES`) viết tay trong `theme.css`; mẫu còn lại + custom sinh biến CSS bằng `paletteVars` — **luôn chỉnh độ sáng HSL để màu nhấn ≥ 4.5:1 trên nền** (màu người dùng nhập khó đọc vẫn được sửa cho đọc được).
- **Nền động** (`shared/deck/backgrounds.js`, `window.DeckBg`): 10 mẫu canvas chủ đề công nghệ — network, circuit, grid, matrix, waves, hex, dots, orbits, particles, radar — hoặc `none`. Màu lấy từ biến theme; hình vẽ chỉ phụ thuộc thời điểm t (PRNG có seed) → `prefers-reduced-motion` đứng yên, PDF/ảnh bìa vẽ khung t = 0 (mọi mẫu đầy đủ ngay khung đầu). Giao diện dùng chính module này để xem trước (chỉ chạy hoạt ảnh ô đang chọn/hover).
- **Phông chữ** (`shared/deck/fonts.js`): Inter (mặc định), Montserrat, Barlow, Roboto, Google Sans — đóng gói woff2 tập con latin + latin-ext + vietnamese (unicode-range) nên **máy không cài phông vẫn hiển thị đúng tiếng Việt**. Chọn riêng phông tiêu đề và phông nội dung. HTML xuất / PDF / ảnh bìa nhúng base64.
- **Logo**: tải lên (`kind=logo`, giữ trong suốt) → tuỳ chọn **tách nền** (`cutoutService.removeBackground`):
  - `color` — loang từ viền theo màu nền (logo nền trơn, nhanh, sắc nét);
  - `ai` — mô hình U²-Net-p (onnxruntime-node, `models/u2netp.onnx`, Apache-2.0) chạy trong worker thread (~2 giây trên Docker linux-arm64);
  - `auto` — viền ảnh đồng màu → `color`, nền phức tạp/chuyển màu → `ai` (thiếu tệp mô hình → lùi về `color` kèm ghi chú); không nhận ra nền (ảnh đã trong suốt) → `none` (dùng logo gốc).
  - Vị trí 6 góc/cạnh (tl, tc, tr, bl, bc, br), kích thước 40–360 (px trên canvas 1440 cao), hiển thị: mọi trang / trang bìa & trang kết / trang nội dung.

## 8. Media trong trang: ảnh, video, YouTube

- **Video tải lên**: MP4/MOV/WebM (nhận diện magic bytes, từ chối M4A chỉ có tiếng), ≤ `MAX_VIDEO_MB`, ≤ `MAX_VIDEOS_PER_DECK`/bài. Trình duyệt chụp khung hình làm ảnh bìa (`poster`) trước khi tải. Multer ghi thẳng ra đĩa; server phát theo `Range`.
- **YouTube**: dán link (watch, youtu.be, shorts, embed, live, nocookie) → `youtubeService.resolveYouTube`: ảnh bìa (maxres → sd → hq, cắt **16:9**, WebP 1280×720) + tiêu đề qua oEmbed (video không tồn tại/không cho nhúng → 422). Chỉ lưu id 11 ký tự — không lưu URL người dùng nhập.
- **Hiển thị**: khung 16:9 có ảnh bìa + nút ▶. **Bấm → phát tự động + toàn màn hình**:
  - Trong app (iframe sandbox không có quyền fullscreen/YouTube): iframe gửi `postMessage({type:'deck:video', provider, id|src, title})` → `VideoOverlay.vue` (gắn ở `App.vue`) chỉ nhận từ iframe có thuộc tính `data-deck-frame`, kiểm tra lại id YouTube / src `/api/assets/<uuid>?exp&sig` → phát `youtube-nocookie.com/embed/<id>?autoplay=1` hoặc `<video autoplay>` rồi `requestFullscreen`; Esc/nút đóng để thoát, có link "Mở trên YouTube".
  - Trong HTML xuất: engine tự mở lớp phủ toàn màn hình ngay trong tệp.

## 9. Trí tuệ thiết kế chạy ngầm (2026-10-06)

Người dùng không chọn gì thêm — mọi thứ dưới đây tự động để bài không na ná nhau và không chép bố cục tư liệu.

### Tư liệu chỉ là nguồn thông tin
- Prompt dàn ý (`geminiService.outlinePrompt`, mục "TƯ LIỆU CHỈ LÀ NGUỒN THÔNG TIN"): AI phân loại `sourceType` rồi **tái cấu trúc thành mạch kể** — không chép bố cục/thứ tự trang của tư liệu.
  - `raw_notes` (ghi chú họp, gạch đầu dòng thô, gõ không dấu): sửa chính tả, **khôi phục dấu tiếng Việt**, gom ý theo chủ đề.
  - `data_table` (XLSX/CSV): phân tích — tổng, tỷ trọng, tăng trưởng, xếp hạng; số tự tính phải **chính xác**, ghi cách tính vào ghi chú.
  - `designed_deck`: lấy thông tin, KHÔNG giữ thiết kế cũ; `transcript`: rút ý chính + trích dẫn đáng giá.
- Tiêu đề dạng "thông điệp" (insight), xen kẽ trang chữ/trang hình, có `section` khi ≥ 10 trang.

### Chỉ chèn ảnh chụp thật (không chèn infographic)
- AI gán `imageKinds` cho mọi ảnh IMGn: `photo | infographic | chart | diagram | table | screenshot | document | slide | logo | icon | illustration | background | other`. Ảnh chụp màn hình/slide **có người** vẫn không phải photo.
- Kiểm tra chéo bằng số đo điểm ảnh (`imageService.imageTraits`: thu 192px, `sharp` = tỷ lệ cặp điểm ảnh liền kề lệch màu > 80 (cạnh sắc của chữ/đồ hoạ), `top8` = tỷ trọng 8 màu nhiều nhất (mảng màu phẳng)):
  - ảnh có xem trước: giữ khi AI nói `photo` **và** không `looksLikeGraphic` (sharp ≥ 0.05 & top8 ≥ 0.45 — AI nhầm vẫn bị chặn);
  - ảnh vượt quá 30 ảnh xem trước: chỉ giữ khi `looksLikePhoto` (sharp < 0.012 & top8 < 0.4) — nghiêm ngặt.
  - Đo thực tế: ảnh chụp 0–0,001; slide/infographic 0,026–0,066.
- `outlineService.keepPhotoImages`: bỏ ảnh không phải photo; trang `image`/`gallery` hết ảnh (không video) → `auto`; gallery còn 1 ảnh → `image`. Log `outline_ready` ghi `kinds`, `photos`, `droppedImages`, `sourceType`.

### Biến thể bố cục + phong cách bài (`shared/deck/variants.js`)
- `VARIANTS`: 13 layout × 2–5 biến thể (57 kiểu), phần tử đầu = giao diện gốc. Ví dụ stats: `cards|hero|bars|rings|plain`; timeline: `line|vertical|zigzag|cards`; process: `cards|chevrons|stairs|vertical`; gallery: `grid|mosaic|polaroid`; image: `side|right|full`.
- `STYLES`: `neon` (gốc) · `editorial` (đường kẻ, số lớn) · `solid` (khối màu đặc) · `outline` (viền, không nền) · `soft` (bo tròn, đổ bóng mềm) — CSS `[data-style]` trên `<html>`, kết hợp với mẫu màu/nền/phông người dùng chọn.
- `FITS` — biến thể chỉ được chọn khi hợp nội dung: `rings` chỉ khi mọi số là % 0–100 (1–4 số); `bars` khi cùng đơn vị, số ≥ 0, 2–8 số; `hero` cho 1–4 số (1 số → ưu tiên ×6); `mosaic` 3 hoặc 5 ảnh; `polaroid` 2–4 ảnh; `chevrons` tên bước ngắn, ≤ 5 bước (khung hẹp ≤ 3); `zigzag` 4–7 bước (hẹp 4–5); `image:full` có ảnh, không video, ≤ 3 ý…
- `artDirect(spec, {seed, ratio, style})`: chọn phong cách ngẫu nhiên đều; mỗi trang bốc thăm có trọng số = hợp dữ liệu × hợp phong cách (`AFFINITY`) × `0.2^(số lần đã dùng trong bài)`; trang liền kề trùng `layout:variant` ×0.05. Hạt giống = UUID mới mỗi lần dựng → dựng lại = bài khác; cùng hạt giống → cùng kết quả (test).
- `resolveVariant` (renderer): người dùng sửa nội dung làm biến thể hết hợp (vd. đổi % thành "tỷ") → tự về mặc định, không vỡ trang. `normalizeSpec` bỏ variant/style lạ (style lạ → `neon`); bài cũ không có trường → giao diện như trước.
- Soát giao diện: `tmp/variants-gallery.mjs <out> [theme] [style] [ratio] [only]` (tmp/ không commit) render mọi layout×biến thể ra ảnh tổng hợp, báo trang bị co chữ; `LONG=1` thử nội dung dài.

## 10. Media gửi kèm khi tạo bài (2026-10-06)

Tab **Nhập nội dung**: chữ người dùng nhập là **cơ sở nội dung**; ảnh/video gửi kèm là media **bắt buộc đưa vào bài** (khác ảnh nằm trong tư liệu — chỉ ảnh chụp thật mới được gắn, §9).
- Trình duyệt (`useCreate.addMedia`, `CreateMediaPicker.vue`): kiểm loại/dung lượng ngay, HEIC → JPEG, chụp ảnh bìa video (`capturePoster`); gửi `media` + `posters` cùng yêu cầu tạo bài.
- Server: `ingestService.precheckMedia` (magic bytes, kích thước từng tệp, số lượng, ghép ảnh bìa theo vị trí) → job `storeUserMedia`: ảnh → asset `image` (WebP), video → asset `video` + `poster` — lưu TRƯỚC khi gọi AI.
- AI (`outlinePrompt` mục "MEDIA NGƯỜI DÙNG GỬI KÈM"): ảnh = `UIMGn` (kèm hình xem trước, được ưu tiên trong hạn mức 30 ảnh/6MB), video = `VIDn` (kèm ảnh bìa); mỗi mã đúng 1 lần ở trang hợp nội dung; ảnh có chữ → trang image + tóm tắt ý của ảnh; trang có video không kèm ảnh. Schema có trường `video` ở mỗi trang **chỉ khi** có video gửi kèm.
- Ảnh gửi kèm luôn được giữ (bỏ qua bộ lọc photo); ảnh đồ hoạ (AI xếp loại khác `photo` hoặc `looksLikeGraphic`) → `fit: 'contain'` (dàn ý → spec) để hiển thị trọn khung; `variants.js` không chọn kiểu cắt ảnh (cover center, image full, mosaic, polaroid) cho ảnh contain.
- `outlineService.placeUserMedia` (sau `capOutline`, chốt chặn xác định): bỏ trùng, trang có video thì bỏ ảnh, ≤ 6 ảnh/trang; media AI bỏ sót → video vào trang chữ chưa có media (ưu tiên image/gallery → bullets/auto → section/quote → cards → agenda → cover; trang số liệu/quy trình sau cùng); 1–2 ảnh → mỗi ảnh 1 trang chữ; nhiều hơn → gom bộ sưu tập (vào bộ sưu tập ảnh người dùng còn chỗ → thêm trang "Hình ảnh" trước trang kết nếu còn hạn mức trang → dồn vào trang trống). Không còn chỗ nào thì vẫn thêm trang — **không bao giờ bỏ media người dùng** (có thể vượt số trang tuỳ chỉnh trong trường hợp hiếm). Log `outline_ready`: `userImages`, `userVideos`, `mediaAddedSlides`, `mediaMoved`.
