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
  "style": "neon|editorial|solid|outline|soft" /* phong cách toàn bài — hệ thống tự chọn khi dựng, §9; người dùng đổi ở tab Màu sắc */,
  "brand": { "cover", "page", "section", "closing", "header", "footer" /* mã asset kind brand | null */,
             "footerText": true, "tones": { "cover|page|section|closing": "light|dark" } } | null /* §13 */,
  "slides": [
    { "layout": "cover|section|agenda|bullets|cards|stats|image|gallery|timeline|process|quote|comparison|closing",
      "kicker", "title", "highlight" /* phải là chuỗi con của title */, "subtitle", "caption", "tags": [],
      "icon" /* tên trong shared/deck/icons.js */,
      "items": [{ "title", "text", "value", "icon", "image": { "asset", "alt", "fit" } /* ảnh/logo thay biểu tượng — §13 */ }],
      "stats": [{ "value", "prefix", "suffix", "label" }],
      "steps": [...], "columns": [{ "title", "subtitle", "points": [] }],
      "quote": { "text", "author", "role" },
      "image": { "asset": "<uuid>", "fit": "cover|contain", "alt" }, "images": [{ "asset", "alt" }],
      "video": { "provider": "file|youtube", "asset" /* file */, "id" /* YouTube 11 ký tự */, "poster", "title", "caption" }
               /* chỉ ở MEDIA_LAYOUTS: cover, section, bullets, image, quote — thay chỗ ô ảnh, khung 16:9 */,
      "variant": "<biến thể trình bày của layout — §9; '' = mặc định>",
      "elements": [ /* phần tử tự do; ở layout khác free = lớp CHÈN ĐÈ lên trang (logo, chữ, ảnh, hình) — §13 */ ],
      "moves": { "<đường dẫn ô chữ>": { "x", "y" /* % rộng/cao trang, ±100, so với chỗ bố cục đặt */, "s" /* cỡ chữ ×0,5–3, mặc định 1 */,
                 "l" /* giãn dòng 0,8–3, không có = theo bố cục */, "w" /* độ rộng khung chữ, % bề rộng trang 5–100, không có = theo bố cục */ } }
               /* chỉnh tay vị trí + cỡ chữ + giãn dòng + độ rộng khung từng ô (không ở layout free; ≤ 40 mục) — §15, §22 */,
      "hide": [ "glow|grid|bg|art|secno|qmark|vs|icons|nums|arrows" ] /* hoạ tiết trang trí đã tắt — §15 */,
      "notes": "ghi chú người trình bày" }
  ]
}
```

Giới hạn độ dài/số lượng: `shared/deck/limits.js` (`SPEC_LIMITS`) — dùng chung server và `maxlength` trên form.

**Chữ có định dạng** (2026-10-06, `shared/deck/rich.js`, §13): mọi trường văn bản (trừ ô số liệu `stats.value/prefix/suffix` và chân trang) có thể chứa
`⟦thuộc tính⟧đoạn chữ⟦/⟧` — thuộc tính = token màu theo theme (`RICH_COLORS`: text, accent, accent-2, amber, mint, coral, violet, muted, white, dark) | `#RRGGBB` | `b` (đậm) | `n` (giữ liền, không ngắt dòng) — và `\n` = xuống dòng.
Giới hạn độ dài tính theo **chữ hiển thị** (`plainText`); chuỗi thô dài quá `max*4+400` thì bỏ định dạng. Thẻ sai cú pháp → chữ thường (bỏ dấu ⟦ ⟧).
Thuộc tính **`href=<URL>`** (liên kết, 2026-10-12, §18) luôn đứng **cuối** danh sách thuộc tính (URL có thể chứa dấu phẩy); phần `href=…` không tính vào trần chuỗi thô (`hrefWeight`; tối đa ~8 liên kết dài mỗi ô).

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
        URL (≤ 5 link, đọc lần lượt; 1 link lỗi → dừng, thông điệp "Link n (host): …") → safeFetch (chống SSRF, trần = MAX_UPLOAD_MB);
          Google Docs/Slides/Sheets → link export (hoặc Drive API); trang web → chữ + mô tả og + ẢNH của nội dung chính (§20)
        text → cắt theo MAX_TEXT_CHARS
      normalizeExtractedImages → sharp → WebP ≤1920px, tối đa MAX_IMAGES_PER_DECK → lưu storage + bảng assets
      mediaService.prepareMedia (PDF + ghi âm):
        ước lượng token (PDF ~560/trang, ghi âm ~32/giây) ≤ 120k và không PDF quá lớn → TRỰC TIẾP: đính kèm vào lượt dựng bài
        ngược lại → HAI BƯỚC: mỗi ghi âm / mỗi cụm PDF (≤100 trang, ≤45MB, cắt bằng pdf-lib) được Gemini chuyển thành
          văn bản trước (ghi âm: bản chuyển thể có người nói/số liệu/trích dẫn; PDF: chép markdown + OCR bản scan), song song 3
        vận chuyển: inline base64 khi nhỏ (tổng ≤ 8MB/lượt trực tiếp, ≤ 14MB/lượt chuyển văn bản), lớn hơn → Gemini Files API (developer-api) | Agent Platform không có Files API: luôn inline, mỗi request ≤ `AGENT_INLINE_MAX` 48 MB — tổng tư liệu vượt → 2 bước; WAV lớn cắt đoạn (`wavSegments`), ghi âm nén > 48 MB → 422 `AUDIO_TOO_LARGE`, cụm PDF không tách được > 48 MB → 422 `PDF_TOO_LARGE`
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
- **Tiến độ hàng đợi (2026-10-12, roadmap B):** `jobTracker` (`src/lib/jobTracker.js`) ghi thời điểm nhận/bắt đầu từng job. `GET /:id` khi `outlining`/`generating` có `queue`:
  `{state:'waiting', kind, position, waitedSec, startInSec, etaSec, sampleSize}` hoặc `{state:'running', kind, waitedSec, elapsedSec, etaSec, sampleSize}` (null khi tiến trình vừa khởi động lại — job không còn trong RAM).
  Ước tính dựa trên trung bình 20 job gần nhất cùng loại (`outline`/`build`); chưa có mẫu đo → `etaSec`/`startInSec` = null, giao diện ghi "đang ước tính" thay vì con số. `/api/health/ready` thêm `avgOutlineSec`, `avgBuildSec`, `avgWaitSec`, `oldestWaitSec`, `longestRunSec` (dùng cho cảnh báo job treo — `scripts/ops/check.sh`).
- **Mã lỗi cho thử lại:** 503 (`QUEUE_FULL`, `RENDER_*`) luôn có `Retry-After: 30`, 429 có `Retry-After: 60` (errorHandler đặt nếu nơi ném lỗi chưa đặt). Chromium không khởi động được → 503 `RENDER_UNAVAILABLE`; lỗi khi render (timeout, tab đóng) → 503 `RENDER_FAILED` (trước đây 500 chung); chi tiết chỉ ghi log `chromium_launch_failed` / `render_failed`.
- **Ảnh bìa nền + hàng trình duyệt (sửa sau đo tải 2026-10-12):** `scheduleThumbnail` (gộp 4 giây/bài) đẩy mã bài vào `createCoalescingQueue` (`src/lib/coalescingQueue.js`) — chụp **lần lượt 1 bài/lúc**, bài đang chờ được lưu tiếp không thêm lượt, HTML chỉ dựng khi tới lượt. Xuất PDF kiểm `browser.pending ≥ MAX_EXPORT_PENDING (10)` → 503 `QUEUE_FULL`. `/api/health/ready` có `thumbnailsPending`, `renderPending`.
- **DB quá tải:** lỗi mysql2 "Queue limit reached." (pool `queueLimit` 200) → 503 `SERVER_BUSY` + `Retry-After` thay vì 500.
- **Đăng nhập không chặn luồng chính:** bcrypt chạy trên worker_threads (`passwordHasher`, `PASSWORD_HASH_THREADS`, mặc định 2) — xem `09`.

## 3. Chỉnh sửa & lưu

- Trình soạn thảo làm việc trên **bản nháp** (`draft`) clone từ spec; mọi thay đổi chỉ cục bộ cho tới khi bấm **Lưu**.
- **Lưu** = `PATCH /:id { spec, specVersion, title }` → strict normalize → `UPDATE … WHERE spec_version = ?` → version +1. Lệch version → 409, giao diện hiện link "Tải lại bản mới nhất".
- **Sửa trực tiếp trên khung xem trước** (2026-10-06, §12): khung không còn tải lại sau khi lưu — ứng dụng dựng lại slide từ bản nháp và gửi vào khung; lưu xong chỉ cập nhật version. Ctrl/Cmd+S lưu (cả khi đang gõ trong khung).
- Thành công → ảnh bìa render lại sau 4 giây (gộp nhiều lần lưu liên tiếp — `scheduleThumbnail`).
- **Tỷ lệ** và **Công khai/Riêng tư** áp dụng ngay (PATCH riêng, không cần spec) và **giữ nguyên bản nháp** chưa lưu.
- Rời trang khi nháp chưa lưu → hộp thoại xác nhận. Nếu component bị unmount do đổi bề mặt desktop↔mobile, nháp được giữ trong `pendingDrafts` (RAM) và khôi phục nếu `specVersion` vẫn khớp.
- Ảnh mới: `POST /:id/assets` → trả asset id + URL ký → gắn vào `image.asset` của slide trong nháp. Trang có ô media (`MEDIA_LAYOUTS`) chọn được tab Ảnh / Video; Lưu bỏ video ở bố cục không có ô media, bỏ `palette` khi theme không phải `custom`.
- Bảng **Thiết kế** (màu, nền, phông, logo) dùng chung giữa bước dàn ý và trình soạn thảo (`DesignPanel.vue`).
- **Dời chữ, đổi cỡ chữ, xoá / thay hoạ tiết** ngay trên khung (2026-10-11) — §15.

## 4. Chia sẻ & đa tenant (cập nhật 2026-10-07: chia sẻ theo người + handoff)

Mỗi người dùng là 1 tenant; **dữ liệu bài (dòng `presentations`, asset, tệp) luôn thuộc tenant của chủ bài**. Chia sẻ chỉ cấp quyền truy cập, không chuyển dữ liệu. Quyền tính theo từng người (`presentationRepository.accessRole`): `owner` (chủ) · `editor` (được mời Chỉnh sửa) · `viewer` (được mời Chỉ xem **hoặc** bài công khai — công khai chỉ cho **xem bản trình chiếu**).

| Thao tác | Chủ bài | Được mời "Chỉnh sửa" | Được mời "Chỉ xem" / bài công khai | Không có quyền |
|---|---|---|---|---|
| Xem / trình chiếu | ✅ | ✅ | ✅ | ❌ 404 |
| Tải HTML / PDF, nhân bản về bài của mình | ✅ | ✅ | ✅ (chủ dự án chốt: vẫn cho tải + nhân bản) | ❌ 404 |
| Sửa nội dung, tên, tỷ lệ; thêm ảnh/video/logo; áp/lưu mẫu thương hiệu; khung sửa trực tiếp | ✅ | ✅ (ghi vào bài + tenant của chủ) | ❌ 403 `VIEW_ONLY` | ❌ 404 |
| Handoff phiên bản, xem lại phiên bản | ✅ | ✅ | ❌ 403 | ❌ 404 |
| Xoá bản handoff | ✅ mọi bản | ✅ chỉ bản mình chụp (403 `NOT_VERSION_OWNER`) | ❌ | ❌ |
| Khôi phục phiên bản | ✅ | ❌ 404 | ❌ | ❌ |
| Công khai / mời người / đổi quyền / gỡ quyền | ✅ | ❌ (`OWNER_ONLY` cho công khai, 404 cho mời) | ❌ | ❌ |
| Xoá bài, duyệt dàn ý, dựng bài | ✅ | ❌ 404 | ❌ | ❌ |

- **Mời theo email** (người dùng đang hoạt động, không mời được chính mình), ≤ 100 người/bài. Mời lại = đổi quyền. Bài phải `ready` (người được mời chỉ thấy bài `ready`).
- **Bản gốc (`baseline`)**: chụp tự động **lần đầu chia sẻ** — lần mời đầu tiên hoặc lần bật công khai đầu tiên (gọi lại không ghi đè; 1 bản/bài nhờ unique `baseline_lock`). Changelog 2026-10-07 tạo bản gốc cho bài đang công khai. Không xoá được.
- **Handoff**: chủ bài và người được mời sửa "chốt" **bản đang lưu** mà họ thấy ổn (kèm ghi chú ≤ 200 ký tự). Máy chủ chụp từ dòng `presentations` trong transaction có khoá dòng: `specVersion` client gửi phải bằng bản đang lưu (lệch → `VERSION_CONFLICT`), mỗi `spec_version` chỉ handoff 1 lần (`HANDOFF_EXISTS`), **tối đa 5 bản** — đủ thì phải xoá bớt (`HANDOFF_LIMIT`, không tự đẩy bản cũ ra). Giao diện chặn handoff khi còn thay đổi chưa lưu.
- **Khôi phục** (chỉ chủ bài): chọn 1 bản handoff; **không chọn → mặc định về bản gốc** (chưa từng chia sẻ → `NO_BASELINE`, phải chọn handoff). Thay `spec` + `title` + `ratio`, khoá lạc quan theo `specVersion` chủ đang thấy (có người vừa lưu → 409). Ảnh chụp chuẩn hoá lại kiểu **lenient** + gỡ asset không còn thuộc bài (`dropForeignAssets`). Khôi phục không tạo phiên bản mới — muốn giữ bản hiện tại thì handoff trước (giao diện nhắc).
- Công khai chỉ khi `status='ready'`. `published_at` giữ mốc lần công khai đầu tiên; chuyển về private → NULL. Tắt công khai không gỡ người được mời.
- Mọi truy vấn theo tenant đi qua `tenantClause()`; truy vấn "public"/"được mời" là ngoại lệ có chủ đích, luôn kèm `status='ready' AND (visibility='public' OR có dòng presentation_shares của người gọi)`.
- Trả 404 khi không truy cập được bài (không lộ sự tồn tại); trả **403** khi đã xem được bài nhưng thiếu quyền thao tác (`VIEW_ONLY`, `OWNER_ONLY`, `NOT_VERSION_OWNER`) để giao diện báo rõ lý do.
- Audit: `presentation.share_add` / `share_update` / `share_remove`, `presentation.handoff` / `handoff_remove`, `presentation.restore`, `presentation.shared_edit` (người được mời sửa lưu bài).

## 5. Xuất bản

| Định dạng | Cách làm | Ghi chú |
|---|---|---|
| Xem trước (iframe) | `render(mode='present')`, ảnh/video qua URL ký HMAC, phông qua `/deck-assets/fonts` | Chạy engine chuyển động + nền động; nhận `deck:goto` qua postMessage, báo `deck:slide`; bấm video → báo `deck:video` cho app (§8) |
| HTML một tệp | `render(mode='present', embedFont)` + ảnh/phông inline base64; video tải lên nhúng `<script type=application/octet-stream>` khi tổng ≤ `EXPORT_VIDEO_MB` | Mở offline, giữ chuyển động; bấm video → phát toàn màn hình ngay trong tệp (blob); YouTube mở iframe nocookie (cần mạng) |
| PDF | `render(mode='print')` → Chromium `page.pdf` khổ đúng tỷ lệ (canvas cao 1440px) | Không chuyển động (nền vẽ tĩnh 1 khung); video hiện ảnh bìa; Chromium chặn mọi request mạng |
| Ảnh bìa | Slide đầu, `mode='present'`, chụp sau khi hiệu ứng ổn định → WebP | Asset kind `thumbnail`, ảnh cũ bị xoá |

Kích thước canvas (`RATIO_SIZES`): 16:9 = 2560×1440, 4:3 = 1920×1440, 2:1 = 2880×1440, 3:1 = 4320×1440 — engine scale vừa khung nhìn.

## 6. Tài khoản

- **Không có đăng ký** (giao diện gỡ 2026-10-11; API `/register`, `/auth/config`, `SELF_REGISTRATION`, `ALLOWED_EMAIL_DOMAINS` gỡ 2026-10-12). Tài khoản chỉ do admin cấp; bản MISA dùng đăng nhập bảo mật do DevOps cài. Smoke test cấp tài khoản qua admin (`test/smoke/provision.mjs`).
- Admin tạo tài khoản / đặt lại mật khẩu → mật khẩu tạm hiển thị **một lần** → người dùng bắt buộc đổi (router chặn mọi trang khác, API trả `MUST_CHANGE_PASSWORD`).
- Admin đầu tiên: `npm run create-admin -- email "Họ tên"` (xem `07`).
- Không thể tự khoá/tự hạ quyền; luôn còn ít nhất 1 admin active (`LAST_ADMIN`).

## 7. Thiết kế: tông màu, nền động, phông chữ, logo

- **Tông màu** (`shared/deck/palette.js`): chọn khi tạo bài và đổi được ở bảng Thiết kế.
  - `auto` — AI chọn mẫu hợp tông (sáng/tối) theo nội dung.
  - Mẫu tối: midnight (xanh đêm–cyan), ocean (navy–trắng), aurora (tím–hồng), carbon (đen–cam), emerald (đen–xanh lá), crimson (đen–đỏ), gold (đen–vàng kim).
  - Mẫu sáng: paper (xanh dương–đen), ember (cam–đen), sky (xanh–trắng), sunset (cam–trắng), forest (xanh lá–đen), royal (tím–đen), ruby (đỏ–đen);
    **be/trắng công nghệ** (2026-10-06): sand (be–xanh điện), latte (be–xanh ngọc), linen (be–đen–cam), pearl (trắng–chàm–cyan), frost (trắng băng–xanh–tím), blossom (trắng–hồng–chàm).
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
- `VARIANTS`: 14 layout × 2–9 biến thể (64 kiểu từ Đợt 5a — §29; org: `tree|boxes`), phần tử đầu = giao diện gốc. Ví dụ stats: `cards|hero|bars|rings|plain`; timeline: `line|vertical|zigzag|cards`; process: `cards|chevrons|stairs|vertical`; gallery: `grid|mosaic|polaroid`; image: `side|right|full`.
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

## 11. Ảnh giao diện phần mềm từ PDF + tấm nền ảnh + màu nhấn rực (2026-10-06)

Slide sản phẩm (PDF) thường dán nhiều ảnh chụp giao diện; trước đây PDF chỉ cho chữ → bài toàn chữ. Nay **ưu tiên đưa ảnh UI vào bài**.
- **Cắt ảnh**: từ 2026-10-11 thay bằng `visualService` — nhận diện cả **sơ đồ** lẫn ảnh giao diện, cả PDF lẫn PPTX/DOCX/ODP/ODT (§15).
  Nguyên tắc giữ nguyên: render trang rồi cắt theo `box_2d` (không trích ảnh nhúng), lỗi bất kỳ → `[]`, bài vẫn tạo được.
- Ảnh cắt đứng **đầu** danh sách IMGn (luôn có hình xem trước), mô tả "ẢNH GIAO DIỆN PHẦN MỀM (device) cắt từ trang N…" hoặc "SƠ ĐỒ <loại> cắt từ trang N…".
- **Phân loại**: `screenshot` nay được gắn vào trang như `photo` (ảnh từ PDF luôn là screenshot; ảnh trong PPTX/DOCX được AI xếp `screenshot`
  cũng được gắn). Prompt: dùng MỖI screenshot đúng 1 lần ở trang đúng tính năng (image + 2–4 ý; 2–3 màn hình cùng nhóm → gallery);
  bài giới thiệu sản phẩm → ảnh tổng quan đẹp nhất lên trang bìa.
- **Kiểu hiển thị** (`look`): screenshot → `fit: 'contain'` + `frame: 'browser'` nếu máy tính (device web, hoặc rộng/cao ≥ 1,2 với ảnh không từ PDF).
  `frame` đi suốt dàn ý (`normalizeOutline`) → `applyOutlineMedia` → spec (`cleanImage`, chỉ khi contain).
- Screenshot AI bỏ sót → `placeUserMedia(..., { force: false, chunk: 4, title: 'Giao diện sản phẩm' })`: chỉ vào trang chữ ngắn
  (image/gallery/auto/bullets/section/quote, ≤ 4 dòng) hoặc thêm trang khi còn hạn mức; hết chỗ thì bỏ (khác media người dùng: bắt buộc).
  Log `outline_ready`: `uiShots`, `uiImages`, `uiAdded`, `uiLeft`.
- **Tấm nền ảnh** (renderer `plate()` + CSS `.plate`): mọi ảnh `contain` (UI, infographic, PNG trong suốt) đặt trên **tấm nền trắng ôm đúng tỷ lệ
  ảnh** (`--ar` từ `assetMeta`), căn giữa ô (`.vbox` container query), lề trong 18px, chú thích 1 dòng dưới ảnh; `frame: browser` thêm thanh
  trình duyệt 3 chấm. Nền tối → ảnh nổi rõ trên nền trắng; nền sáng → như ảnh gốc có viền/bóng nhẹ. Trang `image` có ảnh contain rất ngang
  (≥ 1,9) → lớp `.wide`, cột ảnh 2,1fr.
- **Màu nhấn nền sáng rực hơn** (`palette.js`, `theme.css`): ngưỡng tương phản màu nhấn nền sáng 3:1 (chữ lớn/đồ hoạ; chữ nội dung vẫn đậm) thay vì
  4,5:1. ember cam `#F05A22` trên nền `#FFFCF9`, paper xanh `#2563EB`, sunset `#F05A22`, sky `#1677FF`, forest/royal/ruby sáng hơn.

## 12. Bản cập nhật lớn 2026-10-06: sửa trực tiếp, trang tự do, ảnh AI / Internet, chỉnh sửa ảnh, đường dẫn thân thiện

### Sửa chữ trực tiếp trên khung xem trước
- Khung trình soạn thảo tải `GET /:id/preview?edit=1` (chỉ chủ sở hữu). Renderer ở chế độ `edit` gắn `data-e="<đường dẫn trường>"` (vd. `title`, `items.2.text`, `stats.0.value`, `columns.1.points.3`, `elements.e-ab12.rows.1.2`, `@footer` = chân trang chung) và `data-m="<ô media>"` (`slot` = ô ảnh/video chính, `images.<i>`, `elements.<id>`).
- Engine (`startEdit`) bật `contenteditable` (plaintext-only), gửi `deck:edit {index, path, value}` mỗi lần gõ; Enter (trường 1 dòng)/Esc kết thúc. Ứng dụng áp vào bản nháp qua `lib/editPaths.js` **allowlist** (đường dẫn lạ, `__proto__`, chỉ số vượt mảng bị bỏ; cắt theo `SPEC_LIMITS`, bỏ ký tự điều khiển).
- Chiều ngược lại: `useLiveDeck` dựng slide từ bản nháp bằng **chính renderer dùng chung** (`deckParts`, debounce 160 ms) → `deck:render {slides[], css, attrs}`; engine chỉ thay slide có HTML đổi (so cache), hoãn khi người dùng đang gõ **trong khung** (`document.hasFocus()`), dựng lại nền động khi đổi theme/nền. Sửa ở bảng bên phải → khung cập nhật ngay; Lưu mới gửi lên máy chủ.
- Bấm ảnh/video trên khung → `deck:media {index, path, kind, w, h}` → mở hộp "Đổi / chỉnh sửa ảnh" (hoặc hộp video) với đúng tỷ lệ ô.
- Kéo-thả / dán tệp ảnh trên khung → `deck:drop {index, files: File[], skipped, path|null, x, y (% trang)}` → `useImageDrop` (§26); ứng dụng lọc lại chỉ nhận `File`.

### Trang tự do (layout `free`) + chèn trang
- Không có trong danh sách layout cho AI (`AI_LAYOUTS`); chỉ người dùng tạo. `slide.elements[]` (≤ 30): `text` (kiểu chữ title/heading/body/caption/label × hệ số cỡ 0.4–4, căn ngang/dọc, màu theo token theme, nền), `image` (tham chiếu ảnh + bo góc), `video`, `table` (≤ 12×8, hàng tiêu đề, kiểu sọc/kẻ ô/kẻ ngang), `shape` (chữ nhật/bo góc/tròn/đường kẻ, màu token, độ đậm). Toạ độ **% khung** (x, y, w, h) → giữ đúng bố cục khi đổi tỷ lệ.
- "Thêm trang" mở hộp chọn: 10 mẫu trang tự do (`FREE_TEMPLATES` trong `shared/deck/free.js`: trang trắng, tiêu đề + nội dung, 2 cột, ảnh trái/phải, ảnh lớn + tiêu đề, bảng, video, 3 ảnh, con số lớn) + 13 bố cục có cấu trúc.
- Trên khung: bấm chọn, kéo di chuyển, 8 tay nắm đổi cỡ (Shift giữ tỷ lệ), hít lề/tâm/phần tử khác trong 0,8% (Alt tắt), phím mũi tên dịch (Shift ×8), Delete xoá, Ctrl/Cmd+D nhân bản, bấm đúp sửa chữ / đổi ảnh. Bảng thuộc tính (`FreeElementsPanel`): thêm phần tử, danh sách lớp, ô số %, thuộc tính theo loại, thứ tự lớp.
- Máy chủ chuẩn hoá phần tử (`cleanElement`): loại lạ bị bỏ, toạ độ kẹp (−50..100 / 2..150), id `e-…` trùng được cấp lại, bảng luôn chữ nhật.

### Ảnh: AI, tìm Internet, chỉnh sửa
- **Ảnh AI khi dựng bài** (tuỳ chọn ở màn Tạo, mặc định bật, lưu ở `outline.options.aiImages`): `designDeck` được yêu cầu thêm `imagePrompt` (tiếng Anh) cho trang **cần** minh hoạ mà chưa có ảnh thật/ảnh giao diện; `illustrate()` tạo tối đa `AI_IMAGES_PER_DECK` (6) ảnh 4:3 — ưu tiên bìa → mở đầu phần → còn lại — chạy song song `AI_IMAGES_CONCURRENCY`; ảnh lỗi bỏ qua, không làm hỏng bài.
- **Hộp "Đổi / chỉnh sửa ảnh"** (`ImageStudioPanel`; desktop = dialog, mobile = màn toàn màn hình): Tải lên · Ảnh trong bài · Tìm ảnh (Pixabay, từ khoá Việt/Anh, lọc hướng) · Tạo bằng AI (mô tả + tỷ lệ, gợi ý sẵn từ tiêu đề trang) · Chỉnh sửa. Chọn ảnh mới giữ chú thích/kiểu hiển thị + khung/lớp phủ (§26), bỏ thông số chỉnh sửa của ảnh cũ.
- **Chỉnh sửa ảnh** (`ImageEditor`, Cropper.js v1, không AI): cắt theo tỷ lệ (tự do/vừa khung/16:9/4:3/1:1/3:4), xoay 90° + xoay tinh ±45°, lật ngang/dọc, sáng/tối – độ rực – tương phản (xem trước bằng CSS filter), **vị trí trong khung** (lấp đầy/hiện trọn, phóng 100–300%, kéo để chọn phần hiển thị).
  - Cắt/xoay/lật/màu → `POST /assets/:src/edit` tạo ảnh mới từ **ảnh gốc** (`src`) — tham chiếu lưu `{asset: ảnh mới, src: ảnh gốc, edit: thông số}` → mở lại tiếp tục từ trạng thái cũ, không giảm chất lượng qua nhiều lần sửa.
  - Vị trí/phóng chỉ là CSS (`pos {x,y}` → `object-position`, `zoom` → thuộc tính `scale` + `transform-origin`), không tạo ảnh mới; khi `zoom > 1` tắt hiệu ứng Ken Burns.
  - Máy chủ (`applyImageEdit`, sharp): lật (lượt riêng) → xoay (nền trong suốt) → cắt theo tỷ lệ khung bao sau xoay → brightness → saturate → contrast **đúng công thức bộ lọc CSS** (kẹp sau mỗi bước) → WebP ≤ 1920 px.

### Đường dẫn thân thiện
- `/<ten-bai>/<ma 8 ký tự>/<outline|edit|view>` (vd. `/Gioi-thieu-AMIS-oneAI/s1l3sxo7/edit`): tên bài bỏ dấu, giữ hoa/thường, chỉ để dễ đọc — **định vị bằng mã**; tên sai/cũ vẫn mở đúng bài và tự sửa về tên hiện tại (`useDeckUrl`, thay tại chỗ không tải lại trang). Đường dẫn cũ `/p/:id|:code/:feature` tự chuyển hướng.

## 13. Chữ định dạng, chọn bố cục / ảnh-logo, tông be-trắng, bộ nhận diện thương hiệu (2026-10-06)

### Định dạng chữ trên khung xem trước
- Bôi chữ trên khung → thanh công cụ nổi (`#rtb` trong engine): 10 màu theo theme + ô chọn màu bất kỳ, **Đậm**, **VIẾT HOA / thường / Viết Hoa Đầu Từ**, **Giữ liền** (không ngắt dòng giữa cụm), Xoá định dạng. Kết quả ghi thành thẻ `⟦…⟧` (§1) vào chuỗi.
- **Enter = xuống dòng** ở trường nhiều dòng (`data-ml`: tiêu đề, mô tả, nội dung thẻ, trích dẫn…); trường 1 dòng Enter = xong. Ô số liệu (`data-pl`) chỉ nhận chữ thường.
- Bảng nội dung bên phải hiện **chữ thuần** (`plainText`); sửa ở đó giữ định dạng cũ theo vị trí (`repaintRich`). Renderer: `span.rt[data-rc|data-rb|data-rn]` + `style` chỉ ghép từ giá trị đã kiểm; `\n` → `<br>`; cụm `highlight` so trên chữ thuần.
- Ngắt dòng hợp lý: `text-wrap: pretty` cho tiêu đề/nhãn/đoạn văn (từ 2026-10-14 — `balance` cũ chia đều độ dài dòng nên tiêu đề 2 dòng chừa trống
  bên phải mà chữ không lên được, §22), `n` để giữ liền cụm từ; khoảng số (`2026–2035`, `8:30–11:00`) tự giữ liền (`span.nb`).

### Chọn bố cục & ảnh/logo
- **Kiểu trình bày** (`variant`, §9): chip trên bảng nội dung (`VARIANT_LABELS`), chip mờ khi nội dung không hợp kiểu (`fits`). **Phong cách** toàn bài (`STYLE_OPTIONS`) ở tab Màu sắc.
- **Ảnh/logo thay biểu tượng** của mục ở bullets/cards/stats/image (`ITEM_IMAGE_LAYOUTS`): `IconPicker` (lưới biểu tượng có tìm kiếm + nút "Ảnh/logo"); `items[i].image` (lần đầu `fit: contain` — logo trọn khung trên nền trắng; `cover` = lấp đầy). Renderer `span.ib.ib-img[.is-cover]`. Bấm ô trên khung → `items.N.image` (allowlist `editPaths`) → hộp ảnh tỷ lệ 1:1, gợi ý tìm theo tên mục.
- **Lớp chèn đè** trên mọi trang (không chỉ trang tự do): `elements[]` ở layout có cấu trúc dựng `.free.over` phía trên nội dung; bảng "Chèn lên trang" thêm Logo (ảnh `contain`, góc trên phải) / chữ / ảnh / hình.

### Bộ nhận diện thương hiệu (`spec.brand`)
- Tab **Thương hiệu** (`BrandSettings`, ở cả bước dàn ý lẫn trình soạn thảo): 6 ô ảnh — **Trang bìa**, **Trang mở đầu phần** ("trang sub"), **Trang cảm ơn / kết**, **Nền trang nội dung**, **Dải đầu trang**, **Dải chân trang** — tải lên (`POST /:id/brand`; SVG đổi PNG 3200px ở trình duyệt) hoặc chọn lại ảnh đã tải; công tắc "Hiện tên bài & số trang trên dải chân trang" (`footerText`).
- Renderer (`brandFor`): bìa/mở đầu phần/kết có ảnh riêng → chỉ ảnh đó (trang thiết kế sẵn, lớp `bspec`, không dải, nền động ẩn); thiếu ảnh riêng → như trang nội dung = nền trang + dải đầu/chân. Chiều cao dải theo tỷ lệ ảnh trải hết bề ngang (`--bt` ≤ 26%, `--bb` ≤ 22% chiều cao trang); nội dung tự lùi vào giữa hai dải.
- **Màu chữ theo độ sáng ảnh** (`brand.tones`): khi đặt ảnh nền toàn trang, giao diện đo độ sáng (thu nhỏ 24×14, bỏ điểm trong suốt, ngưỡng 128) → `tones[ô] = dark|light`; người dùng chỉnh tay bằng "Chữ tối / Chữ sáng" dưới mỗi ảnh. Ảnh khác tông bài → slide thêm `ink-light` (ảnh tối) / `ink-dark` (ảnh sáng) — `inkVarsCss` khai báo lại bộ biến chữ/viền/màu nhấn (kể cả `--accent` — §09) trên trang đó; kicker/chip nhấn được nâng sáng như ảnh tràn trang. Đổi/bỏ ảnh xoá tông cũ của ô đó.
- `normalizeDesign`/`cleanBrand`: chỉ nhận UUID (strict báo lỗi), không ô nào có ảnh → `null`; `tones` chỉ giữ cho ô nền toàn trang có ảnh. `collectAssetIds`/`dropForeignAssets`/`remapAssetIds` gồm cả ảnh nhận diện + ảnh mục (sao chép bài/mẫu đổi mã đúng).

### Mẫu thương hiệu (`design_templates`)
- Lưu toàn bộ thiết kế bài (tông màu, nền, phông, logo, bộ nhận diện, phong cách) thành mẫu có tên; **ảnh được sao chép** sang kho mẫu. Mẫu **riêng tư** (chỉ mình) hoặc **công khai** (mọi người dùng áp được — vd. bộ nhận diện công ty; chỉ chủ đổi tên/chia sẻ/xoá).
- Áp mẫu: sao chép ảnh mẫu thành asset mới của bài đích → trả `design` → giao diện gán vào thiết kế đang sửa (người dùng bấm Lưu). Bước dàn ý không có `style` → bỏ qua trường này.
- Cô lập: mẫu riêng tư người khác → 404; ảnh khi lưu mẫu phải thuộc bài của người lưu (`FOREIGN_ASSET`); ảnh mẫu chỉ đọc qua `/api/templates/assets/:id` khi đọc được mẫu.
- **Chọn mẫu ngay khi tạo bài** (2026-11): ô "Mẫu thiết kế" ở CreatePage (desktop + mobile, chỉ hiện khi có mẫu; chọn mẫu thì ẩn Tông màu) gửi `templateId`.
  `create()` kiểm tra mã + quyền xem ngay (`templateService.assertReadable` → 400 `INVALID_TEMPLATE` / 404 `TEMPLATE_NOT_FOUND`, chưa tạo bài);
  dàn ý xong → `designFromTemplate` gọi `applyOnCreate` (sao chép ảnh mẫu thành asset của bài vừa tạo) và ghép theme/palette/background/font/logo/brand
  vào `outline.design`. Mẫu bị xoá/thôi chia sẻ giữa chừng → log `create_template_skipped`, giữ thiết kế mặc định. Giao diện gọi "công khai" là
  **"chia sẻ cho mọi người trong MISA"** (mọi tài khoản đang hoạt động).

## 14. Trình chiếu từng ý, phóng to khi bấm, hiệu ứng 3D (2026-10-06)

Chỉ xuất **HTML + PDF** (không PowerPoint — PPTX không giữ được chuyển động/3D).

### Bấm ảnh xem toàn màn hình (2026-11)
- Trình chiếu: ảnh (`figure.media:not(.vid)`, `.pola`, `.fe-image` — bộ chọn `LBX` trong `engine.js`) không còn phóng kiểu "máy quay" mà mở lớp phủ
  `#lbx` (ảnh `object-fit: contain` trên nền đen, chú thích nếu có). Bấm/Esc/phím bất kỳ chỉ đóng ảnh (không chuyển trang). Chưa toàn màn hình thì
  xin `requestFullscreen` trên lớp phủ. Ảnh nền tràn trang (`.bleed`) không mở — bấm nền vẫn chuyển trang. Khối nội dung (thẻ, số liệu…) giữ phóng to.

### Trình chiếu từng ý (`slide.build`)
- Người dùng chọn ở mục **"Trình chiếu khi bấm Sau"** (`SlideFields`, desktop + mobile; nút "Áp cho mọi trang" → `useEditor.setBuildAll`): `auto` (mặc định, **không lưu** trường) · `step` từng ý mỗi lần bấm · `dim` từng ý + làm mờ ý trước · `tour` phóng to lần lượt từng ý rồi thu về. **Không qua AI** (không có trong schema Gemini).
- "Ý" = khối nội dung ngoài cùng của bố cục (engine `UNIT`: `.ag-i .tile .path-i .bi .card .crow .stat .st-* .pola .gal>.media .tl-step .tz-i .ps .tlv-i .chev-i .stair .col`), không tính tiêu đề/lớp chèn. Bố cục có ý: `BUILD_LAYOUTS` (`slideModel.js`).
- Trang tự do / lớp chèn: phần tử bật **"Hiện khi bấm"** (`elements[].step = true`, chỉ lưu khi bật) → hiện theo thứ tự lớp; trang không đặt `build` mà có phần tử `step` → chạy kiểu `step`.
- Chỉ áp ở chế độ **present**. Bản in PDF, thumbnail (`__deck.goto`), khung soạn thảo luôn hiện **đủ** mọi ý.
- Điều hướng: Sau (→, PageDown, Space, Enter, ↓, bấm nửa phải, vuốt) = hiện ý tiếp; hết ý → sang trang. Trước = ẩn ý vừa hiện; về trang trước → trang đó hiện đủ ý. Hiệu ứng của ý chạy từ lúc bấm (giữ khoảng trễ tương đối giữa các phần trong ý).
- Bút trình chiếu: PageDown/PageUp, **F5/Shift+F5** = toàn màn hình, **"." / B** = màn đen (phím bất kỳ để quay lại), Esc = thu phóng.
- Trang xem (`/view`, desktop + mobile): nút Trước/Sau gửi `deck:step`, hiện "trang · ý/tổng"; phím bút trình chiếu bấm khi focus ở trang cha được chuyển vào khung (`useDeckFrame({ keys: true })`).

### Phóng to khi bấm
- Present: rê chuột vào khối phóng được (thẻ, số liệu, cột so sánh, bước, ảnh, polaroid, ảnh/bảng trang tự do — **không** video, không logo 3D) → con trỏ kính lúp + viền nhấn; bấm → "máy quay" phóng tới khối (≤3×, căn giữa, không lộ mép trang), các khối khác mờ; bấm chỗ khác / Esc / Trước / Sau → thu về; bấm khối khác khi đang phóng → lia sang. Chỉ đánh dấu khối khi phóng được ≥1,15×.
- Kỹ thuật: thuộc tính CSS độc lập `translate`/`scale` trên `.slide` (không đụng `transform` của hiệu ứng), tính theo giá trị **đang hiển thị** (`getComputedStyle`) để bấm liên tiếp giữa chuyển tiếp vẫn đúng.

### Nền 3D + logo nổi khối (three.js)
- 4 nền 3D (`shared/deck/bg3d.js` `NAMES_3D`): **Địa cầu 3D** (`globe3d`), **Địa hình 3D** (`terrain3d`), **Thiên hà 3D** (`galaxy3d`), **Thành phố 3D** (`city3d`) — chọn ở tab Nền như mẫu 2D; màu theo tông bài; thị sai theo con trỏ; xác định theo thời gian (seed). Máy không có WebGL / bản không kèm gói 3D → mẫu 2D tương ứng `FALLBACK_2D` (quỹ đạo, sóng dữ liệu, dòng hạt, lưới phối cảnh).
- Phần tử **Logo 3D** (`type: 'logo3d'`, `image`, `motion: swing|float|turn`, `depth 0,1–1`): nút "Logo 3D" ở bảng phần tử (trang tự do + lớp chèn), mặc định lấy logo của bài (bản tách nền nếu có). Xếp chồng 40 lớp ảnh thành khối, vệt sáng quét qua, xoay trong ±50° (không lật mặt sau). Logo PNG nền trong suốt đẹp nhất.
- Trình chiếu: WebGL riêng cho từng logo của **trang đang chiếu**, giải phóng khi rời trang. PDF: chụp 1 khung nghiêng thay ảnh phẳng. Soạn thảo / không WebGL: ảnh phẳng có bóng đổ.
- Gói 3D (`dist/deck-runtime/deck3d.js`, ~540 KB) chỉ nhúng vào bản tự chứa (xuất HTML/PDF/thumbnail) khi bài **có dùng 3D** (`uses3d`); khung xem trước tải qua `/deck-assets/deck3d.js?v=<băm>` (trình soạn thảo luôn tải để đổi nền 3D thấy ngay).

## 15. Dời chữ, cỡ chữ, hoạ tiết + nhận diện sơ đồ / ảnh giao diện (2026-10-11)

Tinh thần: **tự động là chính** (AI nhận diện và đặt hình đúng chỗ), chỉnh tay là phụ (kéo/đổi cỡ/xoá hoạ tiết ngay trên khung).

### Dời ô chữ + đổi cỡ chữ (`slide.moves`, `shared/deck/layers.js`)
- Mỗi ô chữ có `data-e` (đường dẫn, vd. `title`, `items.2.text`, `stats.0.value`) dời được bằng **tay nắm** `#mvg` của engine (rê chuột lên chữ;
  điện thoại: chạm vào chữ). Nhóm nút: tay nắm (kéo; hút về chỗ cũ / đường giữa trang trong ±14px khung, Shift = giữ thẳng hàng, Alt = không hút, bấm đúp = về chỗ cũ,
  phím mũi tên nhích 6px / Shift 40px) + **A+ / A−** (±10%, Shift ±25%, 50–300%). Khung thấp (< 420px, điện thoại) → nhóm nút nằm ngang dưới ô chữ, né thanh định dạng `#rtb`; màn cảm ứng nút 44px.
- Engine gửi `deck:move {index, path, x%, y%, s, l, w}` → `editPaths.applyFrameMove` (allowlist `isMovePath`, kẹp ±100% và 0,5–3, mục về gốc bị xoá) → dựng lại.
  Cỡ chữ (pt), giãn dòng, độ rộng khung: §22.
- Lưu: `specService.cleanSlide` → `cleanMoves` (≤ 40 mục, đường dẫn hợp lệ; layout `free` bỏ). Đổi layout (`useEditor.changeLayout`) xoá `moves`; đổi chỗ / xoá mục
  trong danh sách (`SlideFields.move/removeAt`) gọi `shiftMoves` để vị trí đi theo mục.
- Renderer (`moveAttr`, mọi chế độ — trình chiếu, xuất HTML/PDF): `data-mv="xpx ypx"` + `data-fz` + `style="translate:(x/s)px (y/s)px;zoom:s"`.
  Dùng thuộc tính **`translate`** (không `transform`) để không đụng hiệu ứng của engine; chia cho `s` vì `zoom` nhân cả translate (`09`).
  `fitSlide` thêm lớp `fit-m` (tắt translate) khi đo tràn để tự co chữ không bị lệch.

### Hoạ tiết trang trí (`slide.hide`)
- Khoá (`DECORS`): `glow` quầng sáng, `grid` lưới kẻ, `bg` nền động riêng trang, `art` hình trang trí bìa/kết, `secno` số lớn trang mục, `qmark` dấu ngoặc trích dẫn,
  `vs` biểu tượng giữa 2 cột so sánh, `icons` biểu tượng thẻ/ý, `nums` số thứ tự, `arrows` mũi tên quy trình/dòng thời gian. `decorsFor(layout)` chỉ trả khoá có ở bố cục đó.
- Renderer thêm lớp `x-<khoá>` vào `<section>`; CSS ẩn hoạ tiết và **nắn lại bố cục** (vd. `x-secno` bỏ cột số, `x-art` bìa bỏ cột hình).
- **Bấm hoạ tiết trên khung** (hoạ tiết `pick`: art, secno, qmark, vs — gắn `data-dc` ở chế độ sửa) → menu `#dcm`: *Thay bằng ảnh* (bìa: ô media của trang; nơi khác: phần tử ảnh
  đè đúng hộp hoạ tiết + mở chọn ảnh) · *Thay bằng hình khối* (phần tử hình tròn/bo góc đè đúng hộp) · *Xoá hoạ tiết*. Engine gửi `deck:deco {index, key, action, box%}` → `editPaths.applyDeco`
  (đầy 30 phần tử → báo "đầy"). Phần tử thay thế là phần tử chèn đè thường: kéo/đổi cỡ/xoá được; `FreeElementsPanel` có nút **Đổi thành hình khối ↔ Đổi thành ảnh** (`convertElement`, giữ id/vị trí/cỡ).
- Bảng **"Hoạ tiết, vị trí & cỡ chữ"** (`DecorPanel.vue`, trong `SlideFields`, desktop + mobile): công tắc từng hoạ tiết, *Hiện lại tất cả*, *Áp cho mọi trang*
  (`useEditor.setDecorAll` — mỗi trang chỉ nhận khoá hợp bố cục), số ô chữ đã chỉnh + *Đặt lại vị trí & cỡ chữ*.

### Nhận diện sơ đồ + ảnh giao diện (`src/services/visualService.js`)
- **Nguồn trang**: PDF → `pdftoppm`; PPTX/DOCX/ODP/ODT (`ingestService.readBuffer` trả `docs`) → **LibreOffice headless** chuyển PDF rồi render như PDF.
  Chuyển đổi chạy **tuần tự** (hàng đợi 1 tiến trình), hồ sơ `-env:UserInstallation` riêng mỗi lần, proxy giả, timeout `OFFICE_RENDER_TIMEOUT_MS`;
  tệp được `sanitizeOffice` trước: bỏ quan hệ `TargetMode="External"`, trường INCLUDEPICTURE/INCLUDETEXT/LINK/DDE, `vbaProject`/activeX, href tuyệt đối/có scheme trong ODF.
- **AI** `gemini.locateVisuals` (1 lượt/≤ 40 trang, prompt `VISUALS_PROMPT`): mỗi hình → `kind` `screenshot` | `diagram`, `device` (web/mobile/tablet), `diagramType`
  (process, architecture, model, org, mindmap, ecosystem, other), `title`, `quality` 1–3, `box_2d`. KHÔNG lấy: logo, icon lẻ, QR, ảnh chụp thật,
  ảnh trang trí/nền, biểu đồ số liệu (chart), bảng chữ/bảng giá, khối gạch đầu dòng, hàng thẻ chữ rời nhau không mũi tên/quan hệ, cả trang slide.
- **Cắt**: `boxToRegion` theo loại — giao diện nới 0,5%, tối thiểu 12% cạnh; sơ đồ nới 2%, tối thiểu 10%, rồi `trimEdges` gọt viền nền đồng màu (sharp trim, chỉ nhận khi
  còn ≥ 35% mỗi chiều). Bỏ `quality` 1, bỏ trùng dHash ≤ 6, tối đa `PDF_UI_SHOTS_MAX` (24).
- **Gộp ảnh nhúng** (`mergeEmbedded`): ảnh nhúng trong PPTX/DOCX trùng hình đã cắt (Hamming ≤ 10) bị bỏ khỏi danh sách; nếu ảnh gốc nét hơn (rộng ≥ 1,3×, không trong suốt) thì dùng ảnh gốc thay bản cắt.
- **Dàn ý**: sơ đồ được gắn vào trang (như screenshot), `look = {fit:'contain'}` không khung trình duyệt; ảnh nhúng AI xếp `diagram` (cạnh dài ≥ 480px) cũng là sơ đồ.
  Prompt: mỗi sơ đồ 1 trang `image` (2–3 ý giải thích ngắn), không đưa vào gallery/bìa/kết, không lặp lại bằng trang `process`. Chốt chặn `outlineService.placeDiagrams`
  (sau `placeUserMedia`, trước khi chèn ảnh giao diện bỏ sót): trang AI gắn sơ đồ mà không hợp (có ảnh khác/video, bìa/kết, > 4 ý) → gỡ sơ đồ khỏi trang đó; trang hợp → `image` chỉ 1 sơ đồ.
  Sơ đồ còn lại: còn hạn mức trang → chèn trang `image` mới ngay sau trang trùng từ nhiều nhất (≥ 2 từ) hoặc trước trang kết; hết hạn mức → vào trang `auto`/`bullets`
  chưa có media (≤ 4 ý), không có chỗ thì bỏ.
- Log `outline_ready`: `visualShots`, `embeddedMerged`, `diagrams`, `diagramsPlaced`, `diagramsAdded`; lỗi `visual_shots_failed {step}` (`soffice_missing`, `pdftoppm_missing`…).
- Đã kiểm với AI thật (Docker): PPTX mẫu → 2 sơ đồ (quy trình, kiến trúc) + 1 giao diện, trang thẻ bị bỏ đúng; PDF OneAI → 3 sơ đồ + 7 giao diện cắt chính xác.

## 16. Sơ đồ tổ chức (layout `org`) + VẼ LẠI sơ đồ đơn giản từ tư liệu (2026-10-11)

Chủ dự án: sơ đồ tổ chức / lộ trình dạng đơn giản thì **vẽ lại** cho ấn tượng (như bộ slide tự làm bằng Claude Code — tham khảo
`tmp/ref-amis/g5-04.png`), không dán ảnh chụp.

### Layout `org` (AI chọn được, `AI_LAYOUTS`)
- Dữ liệu: `slide.root` (ô đứng đầu, ≤ `SPEC_LIMITS.root` 120, rỗng = chỉ có các nhánh), `slide.icon` = icon ô đứng đầu,
  `slide.columns` = **nhánh** (≤ `orgBranches` 6 khi layout org; cột so sánh vẫn ≤ 3), mỗi nhánh `title`, `icon` (tuỳ chọn, theo `ICON_NAMES`), `points` = mục con (≤ 8).
  `root` được giữ cả khi đổi bố cục (đổi qua lại không mất chữ). `fallbackLayout`: org cần ≥ 2 nhánh (hoặc 1 nhánh + root).
- Renderer `L.org` + CSS `.org*` (theme.css): ô gốc dạng viên thuốc có vòng icon gradient → thân dọc (`grow`) → thanh ngang lan từ giữa ra 2 bên (2 nửa `bar`)
  → nhánh (đầu nhánh gradient `--c` theo `accent(i)`, `pop`) → mục con trượt vào lần lượt (`left`). Biến thể `tree` (chấm + đường chữ L) | `boxes` (ô khối, hợp khi
  chữ con ≤ 48 ký tự với ≤ 3 nhánh, ≤ 34 với 4, ≤ 22 với 5–6). Co chữ theo số nhánh (`ORG_SCALE`). Phong cách editorial/outline/soft có bản riêng; hoạ tiết `icons` tắt được.
- Trình chiếu từng ý: đơn vị = `.org-br` (mỗi nhánh), phóng to khi bấm cũng theo nhánh.
- Dàn ý: dòng đầu `Đứng đầu: X` (tuỳ chọn) + mỗi nhánh 1 dòng `Tên nhánh: mục; mục`. Bước dựng bài **không tin AI** cho cấu trúc: `composeDeckFromOutline`
  dựng lại `root` + nhánh + mục con đúng từ dàn ý (`parseOrgPoints`), AI chỉ góp icon nhánh theo thứ tự.

### Vẽ lại sơ đồ đơn giản (`redraw`)
- `gemini.locateVisuals` trả thêm `redraw {type: org|timeline|process|none, root, nodes[{value,title,items}]}` cho mỗi hình — chỉ khi sơ đồ ĐƠN GIẢN và chữ đọc rõ:
  org đúng 2 tầng dưới ô gốc (2–6 nhánh, ≤ 8 ô con), timeline 3–8 mốc, process 3–6 bước một chiều. Kiến trúc, mô hình vòng/ma trận, mindmap, rẽ nhánh, > 2 tầng → `none`
  (giữ ảnh cắt như §15). Nhãn chép nguyên văn, IN HOA → kiểu câu.
- `visualService.cleanRedraw` kiểm lại ngưỡng (timeline thiếu mốc → process; vượt ngưỡng → null) và cắt chữ theo `SPEC_LIMITS`.
- **Ảnh tải lên riêng lẻ** (`ingestService` gắn `standalone: true`) cũng được xem như trang (doc `kind:'images'`, 1 lượt AI cho mọi ảnh, cho phép vùng phủ cả ảnh);
  hình chiếm ≥ 60% phần có nội dung của ảnh → ảnh gốc bị thay (`item.source`, presentationService bỏ khỏi danh sách ảnh tư liệu).
- `presentationService.generateOutline`: hình có `redraw` **không** lưu thành asset ảnh; thành khối `DRn` (chữ theo `redrawPoints`) gửi AI dàn ý; schema dàn ý có trường
  `diagram` (mã DRn) khi có sơ đồ vẽ lại. Sau `placeUserMedia`: `outlineService.applyRedraws` — trang AI ghi mã → đổi bố cục + points chép đúng (giữ tiêu đề AI);
  sơ đồ bị bỏ sót → còn hạn mức thì thêm trang ngay sau trang cùng chủ đề (≥ 2 từ chung), hết thì đổi trang chữ chưa có media cùng chủ đề (≥ 3 từ chung), không có thì bỏ.
  Không đổi bìa/kết và trang có media. Log `outline_ready`: `redraws`, `redrawApplied`, `redrawAdded`, `redrawConverted`; `visual_shots` có `redraws`.
- Prompt dựng bài: dòng chỉ có tiêu đề thì `text` rỗng (không tự viết mô tả — tránh AI "bịa" chi tiết cho mốc lộ trình vẽ lại).
- Đã kiểm AI thật (Docker): ảnh PNG sơ đồ tổ chức + ảnh lộ trình + ghi chú → trang `org` (3 nhánh, 10 mục đúng nguyên văn) + trang `timeline` (5 mốc), không trang ảnh thừa;
  PDF có sơ đồ tổ chức ở trang 2 → trang `org` đúng nguyên văn.

## 17. Xuất bản ra web — domain công khai (2026-10-12)

Giống "Xuất bản" của CMS: chủ bài bấm **Xuất bản** → link `<PUBLISH_BASE_URL>/<slug>-<mã 8 ký tự>` ai cũng xem được (kể cả ngoài MISA, không đăng nhập). Code: `services/publicationService.js`, `repositories/publicationRepository.js`, `routes/publicSiteRoutes.js`, `lib/slug.js`; giao diện `shared/PublishSection.vue` trong `SharePanel` (desktop + mobile).

- **Chỉ chủ bài** xuất bản/cập nhật/gỡ (người được mời sửa/xem → 404 như các thao tác chủ khác). Admin xem danh sách trang đang công khai và gỡ khi vi phạm.
- **Ảnh chụp tĩnh**: `presentations.renderForPublish` dựng HTML `mode:'present'` từ **bản đang lưu** (phông + 3D nhúng; ảnh/video trỏ `/m/<code>/<revision>/<asset>.<ext>` thay vì base64) trong hàng xuất (`exportQueue`, cùng trần `QUEUE_FULL`). Chỉ media spec đang dùng và có loại trình duyệt phát được (`PUBLISH_MEDIA_EXT`) được **chép** sang `tenants/<t>/presentations/<id>/published/<revision>/` cùng `index.html`. Sửa/xoá ảnh trong thư viện bài sau đó không ảnh hưởng trang công khai.
- **Thứ tự ghi**: chép tệp vào revision mới → `publications.save` (giao dịch, `FOR UPDATE` dòng bài; `spec_version` lệch với lúc dựng → 409 `PUBLISH_STALE`; bài đã xoá → 404) → xoá revision cũ. Lỗi trước khi ghi DB → xoá thư mục mới, trang cũ nguyên vẹn. Xuất bản song song: bản commit sau thắng, mỗi bản xoá revision trước nó → còn đúng 1 revision.
- **Mã**: sinh lần đầu (`newShortCode`, trùng → dựng lại với mã khác, tối đa 5 lần; 2 lần xuất bản đầu song song → bản sau nhận `CODE_CHANGED` và dựng lại với mã đã chốt, vì URL media trong HTML chứa mã); **giữ nguyên** qua cập nhật/gỡ/xuất bản lại. Slug = `publicSlug(title)` (bỏ dấu, `đ→d`, `[a-z0-9-]`, ≤ 80, rỗng → `bai-trinh-bay`) cập nhật mỗi lần xuất bản; slug sai/cũ → 301.
- **Gỡ**: `status='unpublished'`, xoá tệp revision; link 404 (CDN có thể còn ≤ ~5 phút nếu không purge). Xoá bài → FK cascade + `removePrefix` thư mục bài. Khoá tài khoản chủ bài → trang ngừng hiện (truy vấn công khai đòi `users.status='active'`).
- **"Có thay đổi chưa cập nhật"**: `publications.spec_version` ≠ `presentations.spec_version`.
- **Tắt** khi `PUBLISH_BASE_URL` trống: `GET` trả `enabled:false`, `POST` → 503 `PUBLISH_DISABLED`; giao diện hiện "Chưa cấu hình domain công khai".
- Phân luồng domain, CSP, CDN, noindex: `08` §Domain công khai, `04` cuối tệp, `docs/DEVOPS-NETWORK.md` §6.

## 18. Liên kết (hyperlink) + trang "Thông tin liên hệ" / "Chương trình ưu đãi" (2026-10-12)

### Liên kết trong chữ
- Lưu trong chữ có định dạng: `⟦href=https://…⟧nhãn⟦/⟧` (kết hợp được màu/đậm: `⟦accent,b,href=…⟧`). URL qua `safeHref` (`shared/deck/rich.js`): chỉ `http(s)://` có tên miền có dấu chấm (không tài khoản `u:p@`, không localhost, ≤ 500 ký tự, không ký tự lạ), `mailto:` email hợp lệ, `tel:` số. URL xấu → thẻ bỏ, giữ chữ.
- Renderer: `<a class="rl" href target="_blank" rel="noopener noreferrer">`. Trình chiếu/HTML xuất/trang công khai: bấm mở **tab mới**, engine không chuyển trang; Enter/Space trên link không bị chặn. Khung sửa: bấm = sửa chữ (engine chặn mở link).
- Chèn trên khung sửa: bôi chữ → nút **Liên kết** (hoặc Ctrl/Cmd+K) trên `#rtb` → ô nhập URL (gõ tắt `amis.misa.vn` → `https://`, email → `mailto:`, số → `tel:`), *Gỡ liên kết*. Con trỏ trong 1 liên kết (không bôi) → mở để sửa/gỡ cả liên kết. Chữ gõ thêm chỉ thừa hưởng liên kết khi nằm GIỮA liên kết.
- **Từ tư liệu nguồn**: bộ đọc chèn `[nhãn](URL)` vào chữ (DOCX `w:hyperlink`, PPTX `a:hlinkClick`, HTML `<a>` → URL tuyệt đối theo trang, bỏ `#…`/`javascript:`; Office tách 1 link nhiều run → `mergeLinks`). `sourceFacts.collectSourceFacts` gom **corpus** (chữ mọi tư liệu + chữ PDF qua poppler `pdftotext`, + bản chuyển thể) và **links** (`[nhãn](URL)`, URL trần, `/URI` trong PDF; ≤ 60) → gửi AI danh sách "LIÊN KẾT TRONG TƯ LIỆU". Dàn ý dùng cú pháp `[nhãn](URL)` ngay trong dòng (người dùng đọc/sửa được; `shared/deck/mdLinks.js`); độ dài dòng tính theo nhãn.
- **Chống bịa** (`outlineService.verifyOutlineFacts`, chạy sau `normalizeOutline` ở bước 1): liên kết có URL không có trong nguồn → bỏ (giữ nhãn). Bước dựng bài: AI chỉ thấy nhãn (`outlineForModel` bỏ URL); sau `normalizeSpec`, `applyOutlineLinks` gắn lại URL vào ô chữ đầu tiên của trang có nguyên văn nhãn (`linkPhrase`, ≤ 8 liên kết/ô). Log: `outline_ready.sourceLinks/linksDropped`, `build_ready.links`.

### Bố cục `contact` (Thông tin liên hệ) và `offer` (Chương trình ưu đãi)
- Dữ liệu `slide.contact` (`shared/deck/contact.js`, chuẩn hoá `specService.cleanContact`): `phones` ≤ 3 `{number, label, channels ⊂ call|zalo|viber|telegram|imessage}` (mặc định `['call']`), `emails` ≤ 2, `addresses` ≤ 2, `website`, `cta` (chữ có định dạng ≤ 120), `qr {asset | link, caption}`. Lưu (strict) báo lỗi số/email/website/link QR sai; kết quả AI (lenient) bỏ mục sai. Không còn gì → không lưu trường. **Giữ khi đổi bố cục** (chỉ hiển thị ở contact/offer). Không lưu sẵn thông tin liên hệ mặc định — nhập theo từng trang (chốt 12/10).
- Liên kết dựng từ dữ liệu đã kiểm: Gọi `tel:<số>`, Zalo `https://zalo.me/<0…>`, Viber `viber://chat?number=%2B84…`, Telegram `https://t.me/+84…`, iMessage `sms:+84…`, email `mailto:`, địa chỉ → Google Maps search, website `https://`. Logo kênh: SVG màu `shared/deck/brands.js`.
- Mã QR: ảnh tải lên (`contact.qr.asset`, hiển thị trọn khung trên nền trắng) **hoặc** link → hệ thống tự vẽ SVG vector (`shared/deck/qr.js`, lõi `qrcode`, mức sửa lỗi M, vùng trắng 4 ô) — nét ở mọi cỡ, PDF quét được. Có cả hai → dùng ảnh. `collectAssetIds`/`dropForeignAssets`/`remapAssetIds`/`assertMedia` gồm `contact.qr.asset` (phải là ảnh).
- Hiển thị: **contact** — tiêu đề + danh sách liên hệ (icon tròn) + CTA nổi bật + ghi chú (`caption`), mã QR lớn bên phải (~600px ở khung 1920). **offer** — nửa trái: tiêu đề, quyền lợi (`items` ≤ 6, icon check/…), thời hạn (`caption`, icon đồng hồ), CTA, liên hệ; nửa phải: mã QR **chiếm 1/2 trang** (container query). Trang contact không có thông tin nào → hạ về `closing`; offer không có quyền lợi/liên hệ → hạ bố cục.
- **AI tự phát hiện**: prompt dàn ý có 2 bố cục, cách viết dòng ("Hotline: …", "Điện thoại: 0912 345 678 (Zalo, Viber)", "Email:", "Website:", "Địa chỉ:"/"Văn phòng …:", "Kêu gọi:", "QR:", "Chú thích QR:"); chỉ dùng khi nguồn có nguyên văn. Ảnh loại **`qr`** (AI phân loại) chỉ gắn vào trang contact/offer (ảnh đầu = mã QR); QR thừa → trang liên hệ chưa có ảnh. `verifyOutlineFacts` bỏ dòng có số điện thoại (so theo chữ số, `0…` ≡ `+84…`)/email/website/link QR **không có trong nguồn**; trang contact không còn gì → `auto`. Bước dựng: `parseContactPoints` (dòng → contact, phần còn lại → quyền lợi/ghi chú) — AI chỉ góp kicker/tiêu đề/icon. Prompt cũ 1 bước không dùng 2 bố cục này.

## 19. Kiểu chữ tiêu đề trang: viết hoa đầu câu (mặc định) / VIẾT HOA TOÀN BỘ (2026-10-12)

- Yêu cầu: tiêu đề AI hay "Viết Hoa Từng Chữ" (kiểu tiếng Anh) là sai. Hai kiểu: **viết hoa đầu câu** (mặc định) và **viết hoa toàn bộ**. Luôn viết hoa MISA, AMIS, ASP, AI (trí tuệ nhân tạo), JETPAY.
- **Viết hoa đầu câu = chữ lưu trong bài** (`shared/deck/textCase.js`, hàm thuần dùng chung server + giao diện):
  - Chỉ đổi chuỗi ĐANG Viết Hoa Từng Chữ (`isTitleCased`: sau chữ đầu có ≥ 1 chữ viết hoa đầu và 0 chữ thường, hoặc ≥ 2 và chữ thường ≤ 20%). Chuỗi đã viết kiểu câu giữ nguyên, chỉ ép MISA/AMIS/ASP/JETPAY.
  - Tên riêng không đoán bừa: chữ viết hoa giữa câu chỉ được giữ khi có **bằng chứng** trong tư liệu (`buildCaseIndex`): xuất hiện viết hoa giữa câu ở dòng không Viết Hoa Từng Chữ, và (không bao giờ viết thường, hoặc đúng cặp "chữ trước + chữ này" — vd. "AMIS Kế toán"). Từ viết tắt (≥ 2 chữ cái hoa) giữ nguyên.
  - "AI" chỉ giữ khi đã viết hoa — "ai" tiếng Việt là đại từ nên không tự ép.
  - Giữ thẻ định dạng `⟦…⟧` (đổi hoa/thường không đổi độ dài → chia lại theo đúng đoạn); cụm nhấn mạnh (`highlight`) lấy lại theo tiêu đề mới; dàn ý không đụng URL `[nhãn](URL)`, dòng "Nhãn: diễn giải" chỉ đổi phần nhãn.
  - Áp dụng: (1) bước dàn ý — sau `verifyOutlineFacts`, bằng chứng = corpus tư liệu (log `outline_ready.recased`); (2) bước dựng — sau `applyOutlineLinks`, bằng chứng = chữ dàn ý (log `build_ready.recased`): tiêu đề, mô tả, kicker, ô gốc, tiêu đề mục/bước/cột, nhãn, CTA. Prompt (dàn ý, dựng bài, 1 bước) có `CASE_RULE`.
  - Bài cũ: nút "Sửa tiêu đề đang Viết Hoa Từng Chữ" ở tab Phông chữ (trình soạn thảo) chạy `sentenceCaseSpec` trên bản nháp, toast số chỗ đã sửa, người dùng Lưu như mọi thay đổi.
- **Viết hoa toàn bộ = tuỳ chọn hiển thị** `design.font.titleCase = 'upper'` (không lưu khi mặc định; strict báo lỗi giá trị lạ). Renderer gắn `data-tcase` lên `<html>` (engine cập nhật khi xem trước), CSS `text-transform: uppercase` cho `.title, .cv-title, .sec-t, .cl-t`. Chữ gốc không đổi → chuyển qua lại không mất dữ liệu; HTML/PDF xuất cùng kiểu.

## 20. Nguồn = đường link: tối đa 5 link + tự lấy ảnh trong trang (2026-10-14)

Yêu cầu chủ dự án: dán link (bài báo, Facebook, Google Drive, misa.vn, *.misa.vn…) → hệ thống tự phát hiện + trích ảnh trong bài, AI chỉ đưa
ảnh **hợp nội dung** lên slide (không cần lấy hết); tối đa **5 link** mỗi lần tạo.

- **Đầu vào** (`ingestService.precheckSource`): trường `urls` lặp lại (multer → mảng; 1 giá trị → chuỗi) và/hoặc `url` (client cũ). Bỏ ô trống,
  bỏ link trùng (so sau khi bỏ `#…`); > `MAX_SOURCE_LINKS` → 400 `TOO_MANY_LINKS`; link sai/nội bộ → `INVALID_URL`/`SSRF_BLOCKED` kèm
  "Link n:"; link **thư mục** Google Drive → đọc qua Drive API (§21; máy chủ không có `GOOGLE_API_KEY` → 400 `UNSUPPORTED_LINK`). `sourceLabel`: 1 link = URL, nhiều
  link = "3 link: amis.misa.vn, misa.vn, facebook.com". Vẫn đúng 1 loại nguồn (link không trộn với tệp/văn bản).
- **Đọc từng link** (`ingestLinks`, tuần tự): Google Slides/Docs/Sheets/tệp Drive như cũ (ảnh nhúng PPTX/DOCX, PDF → cắt hình). Trang HTML
  (`readWebPage`): chữ = `htmlToText` (đường dẫn tương đối tính theo **địa chỉ sau chuyển hướng**) + "Mô tả trang: <og:description>" khi
  thân trang chưa có; **Facebook** (không đăng nhập, thân trang là khung đăng nhập) → chỉ tiêu đề + mô tả + ảnh og; không có mô tả lẫn ảnh →
  422 `SOURCE_FORBIDDEN` ("chưa công khai"). Trang < 40 ký tự chữ **và** không có ảnh → `SOURCE_EMPTY`. 1 link lỗi → cả lượt `failed`, thông
  điệp mở đầu "Link n (host):" (không âm thầm bỏ tư liệu người dùng đã chọn).
- **Tìm ảnh** (`src/services/webSource.js`, HTML tĩnh — không chạy JavaScript): bỏ `<script|style|svg|template>` (giữ `<noscript>` vì hay chứa
  ảnh thật của trang lazy-load) → **khối nội dung chính** `mainRegion`: ưu tiên khối có lớp nội dung bài (`entry-content`, `fck_detail`,
  `articleBody`…, đếm thẻ để lấy đủ khối lồng nhau) → `<article>` → `<main>`, trong cùng mức chọn khối nhiều chữ nhất (≥ 300 ký tự); không có
  → cả trang trừ `header/nav/footer/aside`. Mỗi `<img>`/`<source srcset>`: URL = ảnh lớn nhất trong `data-srcset|data-lazy-srcset|srcset` →
  `data-src|data-lazy-src|data-original|…` → `src` (bỏ `data:`). Bỏ ảnh rác: `.svg`, tên tệp/lớp CSS kiểu logo/icon/avatar/emoji/ads/share/
  spacer/1x1…, alt có "logo", `width`/`height` số < 120. Chống trùng `imageKey` (bỏ query khi có đuôi ảnh, bỏ hậu tố WordPress `-300x200`),
  gặp lại thì bổ sung alt/chú thích còn thiếu (`<source>` đứng trước `<img>` của `<picture>`). Kèm mỗi ảnh: `<figcaption>` của `<figure>`
  chứa ảnh, alt có nghĩa (bỏ alt dạng mã tệp), tiêu đề mục `<h1–4>` gần nhất phía trước. Ảnh `og:image`/`twitter:image` xếp **cuối**.
- **Tải ảnh** (`fetchImages`, qua cùng `safeFetch`): tổng ≤ `MAX_LINK_IMAGES` (24, ≤ `MAX_IMAGES_PER_DECK`), **chia công bằng** giữa các trang
  (`shareBudget` water-filling theo số ứng viên; lượt 2 dồn phần dư của trang thiếu ảnh đạt chuẩn cho trang còn ứng viên); mỗi ảnh ≤ 15 MB /
  20 giây, 4 ảnh song song, `Referer` = trang nguồn (CDN chặn hotlink), cả lượt ≤ 90 giây. Nhận khi đúng ảnh (magic bytes) + sharp đọc
  được + cạnh ngắn ≥ 200px + tỷ lệ cạnh ≤ 4 (bỏ dải băng mảnh); ảnh lỗi → thử ứng viên kế. Ảnh các link **xen kẽ** (link1 ảnh1, link2 ảnh1…)
  vì AI chỉ xem trước ~30 ảnh đầu.
- **AI chọn ảnh**: ảnh vào danh sách IMGn như ảnh tư liệu (mô tả 1 dòng `webImageHint`: "ảnh trên trang web "<tiêu đề>" — chú thích: … —
  thuộc mục "…"" / "ảnh tiêu biểu của trang (og:image)"). Prompt: ảnh trên trang web chỉ phân loại theo hình thật khi minh hoạ đúng nội dung
  chính; ảnh quảng cáo, ảnh tin/bài khác, ảnh đại diện tác giả, trang trí → `other` (không gắn). Gắn vào trang theo §9 (photo / screenshot /
  diagram); ảnh còn lại vẫn nằm trong "Ảnh trong bài" để người dùng tự chọn ở bước duyệt dàn ý / trình soạn thảo.
- **Mã QR** (chặt hơn, áp cho mọi nguồn): prompt `qr` = mã QR chiếm gần hết ảnh (băng rôn/poster có chèn QR nhỏ là slide/infographic) + chốt
  chặn code: ảnh `qr` phải gần vuông (tỷ lệ cạnh ≤ 1,6) mới vào trang Liên hệ/Ưu đãi — trước đó băng rôn quảng cáo "MISA đồng hành cùng hộ
  kinh doanh" (có QR) trên misa.vn bị gắn làm QR trang Liên hệ của bài AMIS Kho Hàng.
- **Giới hạn đã biết**: chỉ HTML tĩnh — trang dựng hoàn toàn bằng JavaScript (SPA) không lấy được chữ/ảnh; Facebook chỉ 1 ảnh og + mô tả
  (thường bị cắt ngắn), bài trong nhóm/riêng tư → `SOURCE_FORBIDDEN`; trang mã hoá khác UTF-8 có thể lỗi dấu
  (như trước). Bản quyền ảnh thuộc trang nguồn — người dùng tự chịu trách nhiệm khi trình chiếu/xuất bản.
- `MAX_LINK_IMAGES=0` → chỉ lấy chữ từ link (như trước bản này).

## 21. Link thư mục Google Drive (2026-10-14)

Yêu cầu chủ dự án: "Làm tiếp phần hỗ trợ link thư mục Google Drive nhé. Sử dụng Google Drive API nếu cần". Thư mục = **như tải tệp lên**
(cùng hạn mức, cùng bộ đọc), chỉ khác nguồn tệp.

- **Nhận link** (`src/services/driveFolder.js`): `drive.google.com/drive/[u/N/]folders/<id>`, `folderview?id=`, `embeddedfolderview?id=`;
  `resourcekey` trên link (thư mục chia sẻ trước 2021) gửi kèm header `X-Goog-Drive-Resource-Keys: <id>/<key>`. Mã chỉ `[\w-]{10,200}` (chặn chèn
  vào truy vấn `q`). `precheckSource(…, { driveFolders })`: `presentationService` truyền `Boolean(config.google.apiKey)` — không có khoá → 400
  `UNSUPPORTED_LINK` "Máy chủ chưa bật đọc thư mục Google Drive — hãy dán link của từng tệp"; link thư mục không đọc được mã → `INVALID_URL`.
- **Liệt kê** (Drive API v3, khoá `GOOGLE_API_KEY` ở query `key=`, `supportsAllDrives` + `includeItemsFromAllDrives` cho Drive dùng chung):
  `files/<id>` (tên thư mục; link "thư mục" trỏ tới 1 tệp → đọc tệp đó) → `files?q='<id>' in parents and trashed = false` phân trang 200,
  `orderBy=folder,name_natural`; thư mục con **≤ 2 cấp**, ≤ 30 thư mục, ≤ 1 000 mục; lối tắt → tệp/thư mục đích (+ khoá đích). Thư mục con
  không mở được (chia sẻ riêng) → bỏ qua thư mục con đó; thư mục gốc lỗi → báo lỗi.
- **Lọc trước khi tải** (không tải tệp vô ích): Google Slides/Docs/Sheets → xuất PPTX/DOCX/XLSX (`/export`, Drive chỉ xuất ≤ 10 MB); PDF, PPTX,
  DOCX, XLSX, ODP/ODT, TXT/MD/CSV/TSV (tệp `text/*` phải có đuôi đó hoặc không đuôi — Drive gắn `text/plain` cho cả `recording.conf` của Zoom),
  ảnh PNG/JPEG/GIF/WebP/AVIF, ghi âm/ghi hình MP3/M4A/WAV/OGG/FLAC/AAC/MP4/WebM (`alt=media`); Biểu mẫu, Bản vẽ, zip, video khác → bỏ.
  Thứ tự ưu tiên khi vượt hạn mức: **tài liệu → ảnh → ghi âm/ghi hình**, trong nhóm giữ thứ tự Drive.
- **Hạn mức** = tải tệp lên: ≤ `MAX_UPLOAD_FILES` tệp, tổng ≤ `MAX_UPLOAD_MB` (dung lượng Drive báo trước → bỏ tệp quá cỡ không cần tải;
  `maxBytes` = phần còn lại), ảnh ≤ `MAX_IMAGE_UPLOAD_MB`; cả lượt tải ≤ 8 phút, mỗi tệp ≤ 5 phút. Tệp tải tuần tự (giữ RAM thấp).
- **Đọc** (`ingestService.readDriveFolder`): mỗi tệp qua `readBuffer` như tệp tải lên — nhãn tư liệu = đường dẫn trong thư mục ("Ảnh/san-khau.jpg",
  tệp Google: "Kế hoạch (Google Slides)"); slide/văn bản giữ tệp gốc (`docs`) để render trang cắt sơ đồ; ảnh lẻ `standalone` (AI xem cả ảnh như
  ảnh tải lên) với gợi ý `ảnh trong thư mục Google Drive "<thư mục>" — tệp "<đường dẫn>"`. Tệp hỏng/không đọc được → bỏ qua tệp đó.
- **Lỗi** (không bao giờ chứa khoá): thư mục không công khai / không tồn tại → 422 `SOURCE_FORBIDDEN` ("Bất kỳ ai có đường liên kết – Người xem");
  khoá chưa bật Drive API / sai khoá (`SERVICE_DISABLED`, `accessNotConfigured`, `API_KEY_INVALID`…) → 503 `DRIVE_UNAVAILABLE` (báo quản trị viên);
  429 / `*RateLimitExceeded` → 503 `DRIVE_BUSY`; hai lỗi này dừng cả thư mục (tệp sau cũng sẽ lỗi). Thư mục trống → `SOURCE_EMPTY` "trống";
  không có tệp hợp loại → `SOURCE_EMPTY` + danh sách loại hỗ trợ; mọi tệp đều bị chặn → `SOURCE_FORBIDDEN` "Các tệp trong thư mục…". Nhiều link →
  "Link n (drive.google.com): …" như §20.
- Mạng: cần `www.googleapis.com:443` (`docs/DEVOPS-NETWORK.md` §2.2). Đã chạy thật với thư mục công khai (3 PPTX → chữ + 56 ảnh, 14 giây; thư mục
  ghi Zoom → 4 tệp ghi âm, bỏ `recording.conf`).

## 22. Soạn thảo: chữ không bị cắt, cỡ chữ (pt), giãn dòng, độ rộng khung, ngắt dòng (2026-10-14)

Yêu cầu chủ dự án (ảnh chụp bài "Diễn đàn quốc gia… 2026"): thêm chữ thì bị cắt/thiếu; chỉnh được khung nội dung; nhập cỡ chữ thay vì chỉ
A+/A−; chỉnh giãn dòng; tiêu đề "Cam kết thực thi và hành động…" còn trống bên phải mà chữ "động" không lên được dòng trên.

- **Gốc cắt chữ**: `fitSlide` chỉ đo `scrollHeight > clientHeight` — tràn **lên trên / sang trái** (khối căn `flex-end`, hoặc căn giữa trong hàng
  grid cố định — bài người dùng: `.im-glass` cao 761px trong `.body` 656px, tràn 105px lên trên) không tạo scroll nên không co, phần đầu bị
  `overflow:hidden` cắt. Sửa: `fitTargets` (phần tử có chữ trực tiếp, leo lên khối; tổ tiên có `overflow≠visible` tới `.body`) + `clipped` (khung
  chữ vượt khung cắt ±tol ở **4 phía**); `.im-full` dùng `justify-content: safe flex-end` (tràn thì bám mép trên thay vì đẩy lên).
- **Tự co khi gõ**: sự kiện input gọi `fitSoon` (rAF, 1 lần/khung hình) → co cả trang ngay khi gõ, không đợi lưu. Co hết mức (`--k` ≤ 0,5) vẫn tràn →
  chế độ sửa thêm `.slide.ovf`: viền đỏ đứt quanh `.body` + nhãn "Chữ tràn khung — bớt chữ, giảm cỡ chữ / giãn dòng, hoặc dời ô chữ" (chỉ khung sửa).
- **Cỡ chữ (pt) + Giãn dòng** ở đầu thanh `#rtb` (`buildBoxCtl`): ô số "Cỡ … pt" (gõ + Enter, chọn trong danh sách 10–96, ↑/↓ ±1 pt, Shift ±4) và
  danh sách "Giãn dòng" (Mặc định (x) / 0,9 … 3). pt như PowerPoint: `pt = px khung × 540 / H` (`PT`). Lưu vẫn là hệ số `s` so với cỡ bố cục
  (`setPt`: s = pt / (cỡ nền đã gồm `--k` × PT)); trang co lại sau khi chữ to lên → `setPt` thử + co lại trang ≤ 4 lượt rồi mới lưu **1 lần**
  (1 bước hoàn tác) để cỡ hiển thị đúng số đã gõ. Ô chữ thuần (`data-pl`, số liệu) chỉ có 2 điều khiển này (`#rtb.plain`); phần tử trang tự do
  không có (`.nobox`). Tooltip A+/A− ghi "Cỡ chữ N pt (X% cỡ bố cục)".
- **Độ rộng khung chữ**: tay nắm `#mvw` ở mép phải ô chữ (kéo ngang; ←/→ ±1%, Shift ±5%; bấm đúp = theo bố cục) → `moves.w` (% bề rộng trang 5–100).
  Renderer: `width:(w×W/100/s)px;max-width:none;flex-shrink:0` (chia `s` vì `zoom`; bỏ trần max-width của tiêu đề/phụ đề; không co theo hàng flex).
- **Lưu**: engine luôn gửi `deck:move {x, y, s, l, w}` đủ giá trị (0 = theo bố cục) → `applyFrameMove(spec, i, path, x, y, s, l, w)` (undefined =
  giữ giá trị cũ; mọi thứ về mặc định → xoá mục) → `cleanMoves` (`cleanLh` 0,8–3, `cleanBox` 5–100, 0/sai kiểu = không lưu) → `moveAttr`
  (`data-lh`, `data-bw`, `line-height`, `width`). `shiftMoves` mang cả `l`/`w` theo mục khi đổi chỗ / xoá. Bảng "Hoạ tiết & vị trí" (`DecorPanel`):
  nút "Đặt lại vị trí, cỡ chữ & khung".
- **Ngắt dòng**: mọi `text-wrap: balance` → `pretty` (`balance` chia đều độ dài các dòng → dòng 1 ngắn, chừa trống bên phải). `pretty` lại hay ngắt sau
  dấu gạch của khoảng năm ("…giai đoạn 2026–" / "2035") → `rich.js keepRanges` bọc khoảng số `\d+([.:,/]\d+)*([–-]\d+…)+` trong `span.nb`
  (`white-space:nowrap`); engine đọc chữ xuyên span không có lớp `.rt` nên spec không đổi; chữ/mã có gạch (COVID-19, Wi-Fi) không bị bọc.
- **Màn dựng bài / lập dàn ý** (`JobProgress`, desktop + mobile `OutlinePage`/`EditorPage`): bỏ đoạn chữ phụ ("Đọc tư liệu (kể cả PDF scan…",
  "Chọn bố cục, biểu tượng…", "Màn hình tự cập nhật…"); thanh tiến trình theo thời gian đã chạy / dự kiến (3–95%, chưa có dự kiến → thanh chạy
  vô định, tôn trọng giảm chuyển động) + 1 dòng trạng thái `aria-live` ("Đang chờ đến lượt — vị trí thứ N…" / "Đã chạy X · dự kiến còn …").

## 23. Tải PDF/HTML 2 bước — chỉ 1 tệp, có IDM hay không (2026-10-14)

Yêu cầu chủ dự án: máy có Internet Download Manager, bấm tải PDF thì vừa IDM tải (15 MB, mở được) vừa hiện Save As của Windows ra tệp
**0 KB** hỏng. Muốn chỉ 1 tệp chuẩn: có IDM → IDM tải; không có → trình duyệt lưu theo thiết lập (hỏi nơi lưu / thư mục mặc định).

- **Gốc**: giao diện cũ tải bằng `fetch` → `blob` → `<a download href=blob:>`. Tiện ích IDM bắt **phản hồi của fetch** (`application/pdf`), huỷ
  luồng của trình duyệt rồi tự tải lại URL (kèm cookie) → `res.blob()` rỗng → trình duyệt vẫn "tải" blob 0 KB (2 lượt, 1 hỏng). Không sửa được
  ở phía blob (không biết trước có IDM) → bỏ cách tải bằng fetch.
- **Luồng mới** (`lib/api.js downloadExport(id, format)`, dùng ở trình soạn thảo, danh sách bài, trang xem — desktop + mobile):
  1. `POST /api/presentations/:id/exports {format:'pdf'|'html'}` — máy chủ dựng (như GET cũ: quyền *đọc*, hàng đợi, rate-limit PDF, audit) rồi
     ghi ra thư mục tạm, trả JSON `{ url, name, bytes, expiresAt }`. Lỗi là JSON như mọi API → toast tiếng Việt; nút giữ trạng thái chờ khi dựng.
  2. Giao diện bấm `<a href=url download>` → **GET thường** `.../exports/<mã>` trả tệp với `Content-Disposition: attachment` (tên UTF-8),
     `Content-Length`, `Accept-Ranges` → có IDM thì IDM nhận (trình duyệt tự huỷ lượt của nó), không có thì trình duyệt lưu. Chỉ 1 tệp.
- **Kho bản xuất** `src/services/exportStore.js` (`container.services.exportFiles`): mã 32 ký tự ngẫu nhiên (`randomBytes(24)` base64url) gắn
  `userId` + `presentationId`; tệp `export-<mã>.<đuôi>` trong `STORAGE_DIR/temp`; hạn **15 phút tính từ lần dùng gần nhất** (IDM tạm dừng/tiếp
  tục); tải lại nhiều lần + theo Range (IDM chia luồng) mà không dựng lại; ≤ 4 bản/người (bỏ bản cũ nhất), ≤ 200 bản tổng; `sweep` mỗi lần ghi + theo
  hẹn giờ dọn tạm 15 phút; khởi động xoá `export-*` sót (`purgeLeftovers`, **chỉ `server.js` gọi** — script phụ dùng chung container
  không được xoá tệp server đang phục vụ; sổ mã ở RAM — 1 instance, `07`). Sai người / sai bài / hết hạn / mã sai dạng → cùng 404
  `EXPORT_EXPIRED` ("Liên kết tải đã hết hạn — vui lòng bấm tải lại").
- `GET /:id/export.html|pdf` giữ nguyên (API, smoke, đo tải dùng).

## 24. Hoàn tác / Làm lại trong trình soạn thảo (2026-10-14)

Yêu cầu: Ctrl+Z hoàn tác về bước trước, **không giới hạn số lần**; Ctrl+Shift+Z (⌘⇧Z trên Mac) làm lại bước liền kề vừa hoàn tác.

- **Lõi** `frontend/src/lib/editHistory.js` (`createEditHistory`, thuần JS): mỗi bước = `{ t: tiêu đề, m: JSON spec bỏ slides (giữ vị trí khoá),
  s: [JSON từng trang] }`; trang không đổi dùng lại **đúng chuỗi** của bước trước → 1 lần sửa chỉ tốn thêm trang bị sửa (1000 bước × bài 20 trang
  vẫn nhẹ). `record` bỏ qua khi trùng bước đang đứng; thay đổi mới sau khi hoàn tác **bỏ nhánh làm lại**. `undo/redo` ghi nốt thay đổi chưa kịp
  ghi trước khi lùi; dựng lại trạng thái dùng lại đối tượng trang có JSON trùng (mỗi đối tượng 1 lần — 2 trang giống hệt không bị dùng chung) và
  trả `index` = trang đầu tiên khác → trình soạn thảo chuyển tới trang vừa hoàn tác/làm lại (-1: chỉ đổi tiêu đề/thiết lập chung → giữ trang).
- **Gắn vào bản nháp** (`useEditor`): `watch(draft, deep)` → gộp thay đổi liên tục trong **400 ms** thành 1 bước (gõ chữ hoàn tác theo cụm, không
  từng ký tự; kéo/thả, thêm/xoá trang, đổi thiết kế… đều tự vào lịch sử — không cần sửa từng chỗ thao tác). Mở bài → `reset`; lưu → ghi cụm đang
  gõ trước, bản máy chủ chuẩn hoá **thay** bước đang đứng (`rebase`, không thành bước thừa) → lưu xong vẫn hoàn tác được; "Hủy thay đổi" / khôi
  phục phiên bản / đổi tỷ lệ là 1 bước như mọi thay đổi (hoàn tác được). Quay về đúng bản đã lưu → hết "Chưa lưu" (JSON trùng `baseline`).
  Đổi bề mặt desktop ↔ mobile: lịch sử bài vừa rời được giữ (1 bài) và dùng lại nếu bản nháp mở lại khớp bước đang đứng.
- **Phím**: `historyKey` — Ctrl/⌘+Z hoàn tác; Ctrl/⌘+Shift+Z, Ctrl+Y làm lại (⌘Y trên Mac là lịch sử trình duyệt — bỏ); bỏ qua khi có Alt (AltGr)
  hoặc đang gõ IME. Ngoài khung: listener `window` trong `useEditor`; con trỏ đang ở **ô nhập chữ của ứng dụng** (tên bài, ô ở bảng bên, hộp thoại)
  → để trình duyệt hoàn tác chữ trong ô; trong `[role=dialog]` → bỏ qua. Trong khung slide: engine (`histKey`) chặn phím + lệnh "Hoàn tác" của
  menu chuột phải (`beforeinput historyUndo/Redo`), đang gõ ô chữ thì gửi nốt nội dung + rời ô (để slide dựng lại ngay), gửi
  `deck:history {action}` → `useLiveDeck({ onHistory })` → `ed.undo()/redo()`. Ô nhập của thanh định dạng trong khung (cỡ chữ, liên kết) giữ
  hoàn tác của trình duyệt.
- **Nút**: desktop — ↶ ↷ (`arrow-back-up` / `arrow-forward-up`) ngay sau ô tên bài, tooltip "Hoàn tác · Ctrl+Z" / "Làm lại · Ctrl+Shift+Z"
  (Mac: ⌘Z / ⌘⇧Z — `HISTORY_SHORTCUTS`), `aria-keyshortcuts`; mobile — 2 nút 48 px đầu thanh đáy, trước "Hủy thay đổi" / "Lưu". Khoá khi hết bước.

## 25. Thư mục lồng nhau cho "Bài của tôi" (2026-11-08)

Yêu cầu chủ dự án: người dùng tạo thư mục, kể cả thư mục trong thư mục.

- **Phạm vi**: mỗi người 1 cây riêng; chỉ xếp **bài của chính mình** (bài được chia sẻ / công khai không vào thư mục). Lồng tối đa **5 cấp**, ≤ 300 thư mục/người,
  trùng tên được. Kiểm tra vòng lặp/độ sâu/số lượng chạy trên cây đã khoá `FOR UPDATE` trong transaction (`folderRepository` nhận hàm `check(rows)`) → 2 yêu cầu
  đồng thời không tạo vòng lặp.
- **Xoá thư mục không xoá bài**: thư mục con + bài chuyển lên thư mục cha. Xoá bài → `folder_id` tự mất theo bài; xoá người dùng → cascade.
- **Danh sách**: "Bài của tôi" mặc định mở gốc (`folder=root`: bài ngoài thư mục + thẻ thư mục cấp 1); `?folder=<id>` mở thư mục (URL chia sẻ/quay lại được;
  thư mục không còn → về gốc). Gõ tìm kiếm → tìm mọi bài, ẩn thẻ thư mục. Chuyển bài không đổi `updated_at` (không đẩy bài lên đầu).
- **Giao diện** (`useFolders` + `useFolderView` + `shared/FolderDialogs.vue`): desktop — đường dẫn (Bài của tôi › A › B), nút "Thư mục mới", menu ⋯ của thư mục
  đang mở, lưới thẻ thư mục (tên, "n thư mục · m bài", menu Đổi tên / Chuyển đến… / Xóa thư mục), menu bài thêm "Chuyển vào thư mục…" (hộp cây `MTree`, chỗ không
  hợp lệ bị khoá mờ), **kéo thẻ bài thả** lên thẻ thư mục hoặc mục đường dẫn. Mobile — tiêu đề = tên thư mục, ← về thư mục cha, nút thư mục (tạo) + ⋯ (thao tác
  thư mục) trên thanh đầu, dòng thư mục 64 px đầu danh sách, ActionSheet; chuyển bài qua ⋮ → "Chuyển vào thư mục…".
- Bài đang lập dàn ý/đang dựng không có mục "Chuyển vào thư mục…" (vẫn chuyển được sau).

## 26. Ảnh: kéo-thả / dán, khung ảnh (bo góc, bóng, viền), lớp phủ màu (2026-11-08, Đợt 2 — mục 6, 7)

- **Kiểu ảnh lưu trên tham chiếu ảnh** (đi theo ảnh khi đổi bố cục, nhân bản trang, thay ảnh khác vào cùng khung) — áp cho MỌI ảnh: ô ảnh của bố cục (`slot`),
  ảnh bộ sưu tập (`images.N`), ảnh mục, ảnh tự do (`elements.<id>`). Định nghĩa + làm sạch + CSS dùng chung ở `shared/deck/imgstyle.js`:
  - `radius`: none · sm 12px · md 28px · lg 64px · circle; `shadow`: none · sm · md · lg; `border`: `'none'` | `{ color, w 1–16 px }`.
    Bỏ trống = **"Theo mẫu"** (giữ kiểu ảnh của phong cách bài). Ảnh tự do: `image.radius` ghi đè `el.radius`.
  - `overlay`: `{ kind: flat (phủ đều) | fade (mờ dần, đậm ở đáy) | frosted (kính mờ, backdrop blur), color, opacity 5–95 (mặc định 45) }` —
    vẽ bằng `<i class="ovl">` trên ảnh, dưới chú thích (`color-mix`, không đụng tệp ảnh).
  - `color` = token bảng màu (`accent`, `accent-2`, `text`, `bg`, `white`, `dark` → biến CSS của chủ đề, **tự đổi khi đổi chủ đề**) hoặc `#rrggbb`.
  - Máy chủ `cleanImage` → `cleanImgLook`: chỉ nhận giá trị trong danh sách / hex hợp lệ, kẹp số; màu viền rác → bỏ viền; chuỗi lạ không bao giờ vào CSS.
- **Trình sửa ảnh** thêm 2 tab: **Khung** (bo góc, đổ bóng, viền: Theo mẫu / Không viền / Có viền + màu + độ dày) và **Lớp phủ** (kiểu, màu, độ đậm).
  Xem trước dùng màu thật của chủ đề (`imageColors(theme, palette)` → biến CSS của khung xem trước; số đo px thu nhỏ ×0,5). Bộ chọn màu `ColorSwatches`
  = 6 token + "Màu khác…" (`<input type=color>`). Áp dụng không tạo ảnh mới (chỉ CSS) — chỉ cắt/xoay/màu mới gọi máy chủ.
- **Kéo-thả ảnh từ máy vào trang đang sửa** (khung `deck:drop` → `useLiveDeck.onDrop` → `useImageDrop`):
  - Rê tệp trên ô ảnh → viền nét đứt + "Thả để thay ảnh"; thả **1 ảnh trúng ô ảnh** → tải lên, thay ảnh của ô (giữ chú thích, khung, lớp phủ).
  - Thả ra chỗ trống / nhiều ảnh → chèn **ảnh tự do** tại điểm thả: rộng 30% trang, cao theo tỷ lệ thật của ảnh (`createImageBitmap`; không đọc được → 4:3),
    cao tối đa 70%, luôn nằm trọn trang (`lib/dropRect.js`); nhiều ảnh lệch nhau 3%. Tối đa **5 ảnh**/lần; tệp không phải ảnh bị bỏ + báo.
  - **Dán ảnh** (Ctrl/Cmd+V, trong khung hoặc ở ứng dụng khi không gõ trong ô nhập): luôn chèn ảnh mới giữa trang (thay ảnh có sẵn = thả trúng ô / bấm ảnh).
  - Thả tệp ra ngoài khung bị chặn mở ảnh sang tab (tránh mất bài đang sửa). Di chuyển/đổi cỡ ảnh chèn dùng thao tác phần tử tự do sẵn có.

## 27. Giữ nguyên nội dung + số trang; nhập bài trình bày HTML làm ở công cụ khác (2026-11-08, Đợt 3 — mục 1, 2)

### Giữ nguyên nội dung và số trang (`keepOriginal`)
- Trang Tạo bài → "Cách dùng nội dung": **AI biên tập lại** (mặc định, như cũ) | **Giữ nguyên nội dung và số trang**. Chọn giữ nguyên → ẩn "Số trang mong muốn".
- Chia trang theo nguồn gốc (`src/services/pageSource.js` `paginateSource`, chạy trong `generateOutline` sau khi đọc tư liệu), đánh dấu "--- Trang N ---":
  - **PPTX**: bộ đọc đã đánh dấu từng slide (số trang = số slide).
  - **PDF**: `pdftotext` (ngăn trang `\f`); ≥ 70% số trang có chữ → gửi AI chữ đánh dấu trang và **không đính kèm tệp** (`media.asText`, vẫn dùng để cắt ảnh/sơ đồ);
    bản scan → vẫn đính kèm tệp cho AI đọc, số trang lấy từ `pdfPageCount`.
  - **DOCX/ODT/ODP**: LibreOffice → PDF → như PDF; PDF tạm gắn `doc.pdfPath` để `extractVisuals` dùng lại (không chạy LibreOffice 2 lần). Lỗi/tắt Office → không cố định số trang.
  - **Bài HTML** (chế độ sửa được): mỗi trang của bài = 1 trang.
  - **Văn bản** (nhập tay, TXT/MD, trang web): ngăn trang bằng **1 dòng chỉ có `---`**; không có → không cố định số trang (AI chia theo đề mục, vẫn chép nguyên văn, ≤ 40 trang).
  - Bảng tính/CSV/ghi âm: không có khái niệm trang → không cố định số trang.
- **Vượt 40 trang (`SPEC_LIMITS.outlineSlides`) → từ chối** 422 `TOO_MANY_PAGES` "Tài liệu có N trang — vượt giới hạn 40 trang khi giữ nguyên nội dung…".
  Báo ngay lúc gửi (trước hàng chờ) với PDF ≤ 100 MB, PPTX (đếm `ppt/slides/slideN.xml`) và văn bản nhập tay (`quickPageCount`, `splitTextPages`); loại khác báo khi xử lý (bài `failed`).
- AI: `outlinePrompt(tone, keep)` thêm khối GIỮ NGUYÊN NỘI DUNG (ưu tiên hơn mọi quy tắc biên tập): 1 trang nguồn → đúng 1 trang, cùng thứ tự, chép nguyên văn
  (không viết lại/tóm tắt/sửa chính tả/thêm/bỏ), giữ cách viết hoa, quá 12 dòng ngắn thì nối bằng " · ", bỏ ký hiệu gạch đầu dòng; brief + schema "ĐÚNG N trang";
  nhiệt độ 0,2. Dựng bài: `DESIGN_KEEP_RULE` (không rút gọn/đổi chữ, kicker rỗng), nhiệt độ 0,2.
- Hậu xử lý khi giữ nguyên: **không** viết hoa đầu câu lại (`sentenceCaseOutline/Spec`), không vẽ lại sơ đồ (giữ ảnh sơ đồ gốc), không tự thêm trang sơ đồ/ảnh giao diện
  (room 0), cắt dàn ý ở đúng số trang nguồn, bỏ "- "/"• " đầu dòng. Vẫn bỏ liên kết/thông tin liên hệ không có trong nguồn (chống bịa).
- Tuỳ chọn lưu ở `outline.options.keepOriginal = true` (`normalizeOutline` chỉ nhận `true`) → bước dựng bài đọc lại.

### Bài trình bày HTML (`htmlMode`)
- Tệp tư liệu nhận diện là HTML theo **nội dung** (`looksLikeHtml`: bỏ BOM/khoảng trắng/chú thích đầu tệp). Có tệp HTML → hỏi "Bài trình bày HTML":
  **Giữ nguyên thiết kế** (`design`, mặc định) | **Chuyển thành bài sửa được** (`edit`; chọn thì "Giữ nguyên nội dung" bật sẵn, đổi được).
- Đọc bài (`htmlDeckService` + `htmlDeckPage` + `browserService.inspectHtmlDeck`):
  1. **Tách video nhúng** trên Buffer (duyệt tuyến tính, không regex trên chuỗi trăm MB): khối `<script>` không phải JS chứa base64 thuần > 64 KB nhận diện là video
     (mã = id khối, ruột khối xoá) và URI `data:video/…;base64` (thay bằng `data:,impvid-K`). Trần `MAX_VIDEOS_PER_DECK` video, mỗi video ≤ `MAX_VIDEO_MB` (thừa → bỏ).
     Phần HTML còn lại > 80 MB → từ chối `HTML_TOO_LARGE`.
  2. Chromium headless, **chặn mạng** (chỉ `data:`/`blob:`/`about:blank`), khung 1920 theo tỷ lệ bài (`importViewport`). Tìm trang: reveal.js, `section.slide`, `.slide`,
     `[data-slide]`, `.swiper-slide`, `.page`, `section`; ẩn thanh điều khiển/tiến độ/gợi ý của công cụ cũ.
  3. **Bấm → như người trình chiếu**: mỗi lần bấm, cùng trang = 1 bước (chụp lại), sang trang kế = trang mới; mỗi trang lấy trạng thái SAU bước cuối
     (đủ nội dung bấm-mới-hiện), chờ hiệu ứng xong (`getAnimations().finish()`) và chờ chữ ổn định (số đếm chạy, tối đa ~2,5 giây). Bài không điều khiển được
     bằng phím → **ép hiện** từng trang còn thiếu (bật lớp "đang hiện", hiện phần tử opacity 0).
  4. Mỗi trang: tiêu đề (`data-title`/tiêu đề đầu, bỏ IN HOA của CSS), chữ (bỏ chữ trong khung video), ghi chú, ảnh nhúng ≥ 2% diện tích (bỏ SVG, gộp trùng),
     khung video (% của trang), ảnh chụp JPEG. Gán video về trang: tham chiếu trong trang → số cuối mã khối (`dv-5` → trang 5 có khung video) → trang có khung video kế tiếp.
- **Giữ nguyên thiết kế** — job `importHtmlDesign` (không qua dàn ý/AI; bài tạo ở trạng thái `generating`, xong `ready` → mở thẳng trình soạn thảo):
  mỗi trang → `layout:'free'` gồm ảnh chụp trang phủ kín (`still:true` — không hiệu ứng xuất hiện, bo góc none, `fit` contain khi bài gốc lệch tỷ lệ) + phần tử video
  (`provider:'file'`) đúng khung video gốc; `hide: glow, grid, bg, ft` (không quầng sáng, lưới, nền, **chân trang** — `DECORS.ft` mới, `.x-ft > .ft` ẩn).
  Chữ của trang → ghi chú (nếu bài gốc không có ghi chú). Tên bài: người dùng nhập > `<title>` của tệp > tên tệp. Tối đa **40 trang** (vượt → `TOO_MANY_PAGES`).
  Chỉ 1 tệp HTML, không kèm ảnh/video (`HTML_REQUIRED`, `MEDIA_NOT_ALLOWED`). Audit `presentation.import`. Sau đó thêm chữ/ảnh/video lên trang bằng phần tử tự do.
- **Chuyển thành bài sửa được** — trong `generateOutline` (`ingestWithHtml`): chữ từng trang ("--- Trang N ---" + ghi chú) là tư liệu, ảnh nhúng → ảnh tư liệu
  (gợi ý "ảnh trên trang N…"), video → tệp tạm thêm vào **video gửi kèm** (bắt buộc có trong bài, tên "Video trang N"), tệp khác đọc như thường.
  Giữ nguyên nội dung → ≤ 40 trang (vượt → từ chối); AI biên tập lại → đọc ≤ 60 trang.
- Thời gian đo trên Docker với bài mẫu 137 MB (38 trang, 5 video MP4): giữ nguyên thiết kế ~75–90 giây; sửa được + giữ nguyên nội dung ~135 giây (gồm AI).
  Trình duyệt dùng chung semaphore với ảnh bìa/xuất PDF (`RENDER_CONCURRENCY`) — lượt nhập dài chiếm 1 chỗ trong thời gian đó.

## 28. Video: YouTube + Vimeo, tải lên ≤ 200 MB + nén chạy nền, tự phát / toàn màn hình / phát trong khung, căn + cỡ (2026-11-08, Đợt 4 — mục 3)

### Nguồn video (`slide.video` / phần tử `video` của trang tự do)
- `provider: 'file'` (asset video) · `'youtube'` (`id` 11 ký tự) · **`'vimeo'`** (`id` 5–12 chữ số + `hash` tuỳ chọn — mã riêng tư `h=…` của video
  "không công khai"). Mọi nguồn có `poster` (asset ảnh bìa), `title`, `caption`.
- Dán link: **1 ô nhận cả YouTube lẫn Vimeo** → `POST /:id/video-link` (`addVideoLink`, nhận dạng theo link; `/youtube` cũ giữ tương thích, chỉ nhận
  YouTube). Vimeo (`src/services/vimeoService.js`): nhận `vimeo.com/<id>[/<hash>]`, `player.vimeo.com/video/<id>?h=`, `/channels|groups|showcase|album/…/<id>`;
  oEmbed `vimeo.com/api/oembed.json` (404 → `VIMEO_NOT_FOUND`, 401/403 → `VIMEO_NOT_EMBEDDABLE`, mạng lỗi → vẫn gắn, thiếu tên/ảnh bìa); ảnh bìa chỉ tải khi
  URL do oEmbed trả nằm đúng `https://i.vimeocdn.com` → cắt 16:9 (`poster169`, dùng chung với YouTube) → asset `poster` của bài.
- Phát: YouTube qua `youtube-nocookie.com/embed`, Vimeo qua `player.vimeo.com/video/<id>?autoplay=1&dnt=1[&h=]` — trong lớp phát của ứng dụng (khung chiếu
  sandbox không nhúng được) hoặc `#vov`/khung trang ở bản HTML độc lập; luôn có link "Mở trên YouTube/Vimeo".

### Tải lên + nén (`src/services/videoService.js`, `src/services/videoOptimizer.js`)
- Tối đa **200 MB** (`MAX_VIDEO_MB`, mặc định đổi 150 → 200; Nginx `client_max_body_size 310m` đã đủ). MP4/MOV/WebM (kiểm chữ ký tệp như cũ).
- Ngay khi tải (đồng bộ, < 1 giây): `ffprobe` đọc kích thước (đảo khi cờ xoay 90° — video quay dọc), codec; **tệp không đọc được hình → 422 `INVALID_VIDEO`**
  (chữ ký MP4 hợp lệ nhưng nội dung rác). Trình duyệt không gửi ảnh bìa (MOV/HEVC trên Chrome…) → `ffmpeg` chụp khung giây 1 (video < 3 giây: 1/3 thời lượng).
  `assets.width/height` của video nay có giá trị → renderer dựng khung **đúng tỷ lệ** (`--ar`, kẹp 0,4–2,6; không có = 16:9 như cũ).
- Sau khi lưu: `assets.process_state = 'pending'` + đưa vào **hàng nén chạy nền** (Semaphore 1 — mỗi lúc 1 video, không tranh CPU với tạo bài):
  `running` → nén H.264 (`libx264 -crf 24 -preset veryfast`, `profile high`, `yuv420p`) + AAC 128k stereo, cạnh dài ≤ 1920 (không phóng to), bỏ metadata,
  `-movflags +faststart` (chỉ mục đầu tệp → phát ngay khi chưa tải hết). Quyết định (`decide`): bản gốc **không phát được trên trình duyệt** (MOV, HEVC/ProRes,
  10-bit, âm thanh PCM…) → luôn thay; còn lại chỉ thay khi bản nén ≤ 90% bản gốc; không thay nhưng MP4 gốc để `moov` sau `mdat` (`moovAtEnd` đọc tiêu đề
  hộp cấp 1) → chỉ **đóng gói lại** `-c copy +faststart`.
- Thay tệp: ghi khoá mới `<asset>-<8 ký tự>.mp4` (không ghi đè tệp đang được phát theo Range) → `replaceVideoFile` UPDATE có điều kiện `storage_key` cũ →
  thành công thì xoá tệp cũ, `done`; 0 dòng (video bị xoá/thay giữa chừng) → xoá bản nén. Không giảm được → `skipped`; lỗi/quá hạn → `failed` (giữ gốc).
  Mã asset **không đổi** → spec, bản nháp, URL ký không phải sửa.
- Khởi động lại máy chủ: `resumeVideoJobs` đưa video `pending/running` vào hàng lại (tệp gốc còn nguyên). Thiếu ffmpeg / `VIDEO_TRANSCODE=0` → không đọc
  thông số, không nén, `process_state` NULL (hành vi cũ). Cả 3 đường tạo video đều qua bước này: tải lên ở trình soạn thảo/dàn ý (`addVideo`), media gửi kèm
  khi tạo bài (`storeUserMedia`), video tách từ bài HTML nhập vào (`storeVideoBuffer`).
- Giao diện: asset video có `state`; `VideoPicker` hiện dải "Đang tối ưu video để trình chiếu mượt hơn…" trên ảnh bìa và hỏi `GET /:id/videos/:assetId`
  mỗi 4 giây tới khi xong (toast "Đã tối ưu video…"). Đo thật: MP4 1080p 60 giây 146 MB → 33 MB sau ~14 giây (Docker trên máy dev); MOV dọc → MP4 720×1280.

### Tuỳ chọn trình chiếu + vị trí (`shared/deck/video.js` — người dùng chọn, KHÔNG qua AI)
- `autoplay: true` — **tự phát khi tới trang**, hoặc khi bước trình chiếu (`slide.build`) chứa video vừa hiện; mỗi lần vào trang phát 1 lần (`data-played`).
- `fullscreen: false` — **phát ngay trong khung** trên trang (mặc định: phóng toàn màn hình). Trong khung chiếu của ứng dụng (sandbox) chỉ video tải lên
  phát được trong khung; YouTube/Vimeo vẫn mở lớp phát của ứng dụng nhưng không xin toàn màn hình.
- `muted: true` — phát không tiếng. Trình duyệt chặn tự phát có tiếng (người xem chưa bấm gì) → engine/ứng dụng tự lùi về **không tiếng + nút "Bật tiếng"**.
- `align: 'left'|'right'` (không có = giữa) + `size` 30–99 (% ô media; không có = 100) — **chỉ ô media của bố cục** (`.vbox[data-va]`, `--vz`); phần tử
  video của trang tự do giữ kéo/đổi cỡ như cũ + **nút "Căn theo trang"** (trái/giữa/phải, trên/giữa/dưới) dùng chung mọi phần tử tự do.
- Chỉ lưu khác mặc định (`cleanVideoOpts`); renderer gắn `data-auto` / `data-inline` / `data-muted` lên `figure.vid`. Khung soạn thảo + thumbnail + PDF
  không tự phát (chỉ chế độ `present`).
- Điều khiển khi đang phát toàn màn hình: **Esc hoặc phím Trước/Sau (bút trình chiếu) đóng video, chưa chuyển trang**; video tải lên phát hết → tự đóng,
  quay về trang. Video phát trong khung dừng + gỡ khi rời trang.
- Đổi video khác vào cùng ô (tải lên / link / "Video trong bài") giữ chú thích + tuỳ chọn của ô (`VideoPicker.pick`).
- Bảng "Video" (`VideoPicker`): "Khi trình chiếu" (3 công tắc + giải thích) và — khi mở từ ô media của bố cục (`layout`) — "Vị trí và kích thước" (3 nút căn
  + thanh "Cỡ video"). Trên mobile cả hàng công tắc là vùng chạm 44px.

## 29. Kiểu trình bày mới cho danh sách, ảnh nhấn, hộp chú thích, chuyển trang (2026-11-09, Đợt 5a — mục 8 phần 1 + mục 11)

Chủ dự án chốt danh mục 09/11/2026: Đợt 5a = kiểu danh sách + ảnh nhấn + số liệu + hộp chú thích + chuyển trang; **Đợt 5b** (sau) = sơ đồ + biểu đồ có
bảng dữ liệu. Bỏ hẳn: bánh răng, quỹ đạo, ghép hình, tảng băng trôi, lưới chấm. **AI chỉ tự chọn kiểu "an toàn"** (các bước, mốc thời gian, số lớn, A vs B,
2×2 — đều là kiểu đã có hoặc thuộc 5b); mọi kiểu mới của 5a là **chỉ người dùng chọn** (`MANUAL_VARIANTS` — `artDirect` không bao giờ bốc).

### Kiểu mới (`shared/deck/variants.js`, vẽ ở `render.js` + `theme.css`)
| Bố cục | Kiểu mới (`variant`) | Điều kiện hợp nội dung (`FITS`) |
|---|---|---|
| bullets | `big` — gạch đầu dòng lớn | không có media, 2–4 ý |
| cards | `solid` hộp đặc · `outline` hộp viền · `labeled` có nhãn trên tên · `alternate` xen kẽ trái/phải · `arrows` hộp nối mũi tên | labeled: mọi mục có `value`; alternate 2–4; arrows 2–5 (khung hẹp < 1,7: 2–3) |
| stats | `progress` thanh tiến độ · `stars` xếp hạng sao | progress: 1–6 số, mọi số % 0–100; stars: 1–4 số, giá trị 0–5, hậu tố ∈ '', '/5', 'sao', 'điểm'… |
| timeline | `minimal` tối giản · `pills` viên thuốc · `arrows` mũi tên | minimal/pills 2–6 (hẹp 2–4); arrows 2–5 (hẹp 2–4) |
| process | `pyramid` kim tự tháp · `funnel` phễu | 3–6 bước |
| quote | `bubble` bong bóng lời thoại | không có media |

Đường mũi tên vẽ bằng SVG `pathLength=1` + `data-a="draw"` (engine vẽ dần); kim tự tháp/phễu là các tầng `clip-path` (`tierClip`); sao là SVG với lớp phủ
theo `--pct` (container query `100cqi`). Các lớp đơn vị mới được thêm vào `UNIT`/`ZOOM` của engine → trình chiếu từng ý + bấm phóng to chạy cho kiểu mới.

### Đổi bố cục giữ nội dung ("cùng danh sách, khác hình")
- `LIST_LAYOUTS` = bullets, cards, agenda (`items`) · process, timeline (`steps`) — `LIST_KEY`. Bảng chọn kiểu có mục "Đổi sang bố cục khác — giữ nguyên
  nội dung": chọn kiểu của bố cục khác trong họ → `useEditor.changeLayout` chuyển `items` ↔ `steps` (cắt theo `SPEC_LIMITS` của khoá mới), **làm rỗng danh
  sách nguồn** (không để bản sao), bỏ `variant` không thuộc bố cục mới, rồi đặt kiểu vừa chọn.
- **Số cột** `slide.cols` (2–6, `COLS_RANGE`): chỉ áp cho `COLS_VARIANTS` (agenda list/tiles; bullets icons/numbered/checks/panels; cards
  grid/numbered/solid/outline/labeled; stats cards/plain); `userCols()` không cho vượt số mục. Kiểu khác bỏ qua trường này.

### Ảnh nhấn (`slide.accent` = `left|right|top|bg`, `shared/deck/blocks.js`)
- Dùng ảnh `slide.image` sẵn có, vẽ thành khối tràn mép `figure.acc acc-<vị trí>`; trang có lớp `A-<vị trí>` (đệm thêm, dời chân trang/logo). Trái/phải:
  vùng nội dung `ctx.CW` = 0,6 × chiều rộng — mọi chỗ trong hàm bố cục trước dùng `ctx.W` nay dùng `ctx.CW`. `bg` = ảnh nền tràn trang qua `bleed()` (kèm
  lớp phủ màu Đợt 2).
- Bố cục được dùng: `ACCENT_LAYOUTS` (agenda, bullets, cards, stats, timeline, process, comparison, closing). **Ẩn** khi trang > 6 mục (`accentTooDense` —
  trình soạn thảo hiện gợi ý) hoặc trang có video. Ảnh `fit: contain` (sơ đồ/ảnh chụp màn hình) → `acc-fit`: nền trắng, không cắt, không Ken Burns.
- **Điểm lấy nét**: dùng lại `image.pos` {x, y} (object-position) — bấm vào ảnh xem trước hoặc phím mũi tên trong `SlideFields`.

### Hộp chú thích (`slide.callout` = `{tone: note|warn|ok, text}`)
- `<aside class="callout co-<tone>">` đứng sau `.body`; chữ định dạng như các ô khác, sửa trực tiếp trên khung (`editPaths` `callout.text`, chỉ khi trang có
  callout). Giới hạn `SPEC_LIMITS.callout` = 300. Bố cục được dùng: `CALLOUT_LAYOUTS` (agenda, bullets, cards, stats, timeline, process, comparison, image).

### Chuyển trang (mục 11)
- `spec.transition` (cả bài; 'fade' là mặc định nên không lưu) + `slide.transition` (riêng trang, được lưu cả 'fade' để ghi đè). Giá trị:
  `fade | push | zoom | flip | curtain | none` (`TRANSITIONS`, làm sạch bằng `cleanTransition`).
- Renderer gắn `data-tr` lên `#deck` và `<section>`; engine (`show()`) đặt `#deck[data-tr][data-dir]` theo trang tới (riêng trang > cả bài), trang vào nhận
  `.pre` (tư thế đầu, `transition: none`, ép reflow) rồi `.on`; trang ra `.off`, dọn sau 900 ms. Lùi trang → `data-dir="back"` đảo chiều đẩy/mở màn.
- Chỉ chạy ở chế độ `present` (khung soạn thảo/thumbnail/PDF không chuyển); `prefers-reduced-motion` → luôn 'fade' (engine + khối `@media` trong CSS).
  Chạy được trong bản HTML xuất offline.

### Làm sạch (`specService.cleanSlide` / `cleanDesign`)
`cols` ngoài 2–6, `accent` lạ, `callout` sai tone/rỗng, `transition` lạ → **bỏ im lặng** (không báo lỗi, bài cũ không đổi). Không đổi CSDL, không đổi API
(các trường nằm trong spec JSON). Prompt/schema AI không đổi (AI không đặt accent/callout/transition/kiểu mới).

## 30. Sơ đồ + biểu đồ có bảng dữ liệu (2026-11-09, Đợt 5b — mục 8 phần 2)

Danh mục đã chốt ở §29. **AI chỉ tự chọn được `cards:matrix` (2×2) và `comparison:versus` (A vs B)** khi hợp nội dung (`artDirect`; `contentWeight` của
matrix = 0,6). Các sơ đồ còn lại và mọi kiểu biểu đồ trừ "Cột" nằm trong `MANUAL_VARIANTS`; **bố cục `chart` chỉ người dùng tạo** (có trong `LAYOUTS` của
renderer, không có trong `AI_LAYOUTS` — prompt/schema AI không đổi).

### Sơ đồ (biến thể của bố cục có sẵn — dùng lại `items`/`steps`/`columns`, không thêm trường)
| Bố cục | Kiểu (`variant`) | `FITS` | Cách vẽ |
|---|---|---|---|
| cards | `matrix` ma trận 2×2 | đúng 4 mục | 4 ô `.mx-q` quanh 2 trục `.mx-v/.mx-h`, biểu tượng ở góc |
| cards | `venn` vòng giao nhau | 2–3 mục | `.dg.vn.n2|n3`: hình vuông `.dg-art` (vòng `.vn-c` + lõi) + chú giải `.dg-lg` không đánh số |
| process | `cycle` chu trình | 3–6 bước | vòng SVG `.cy-ring` vẽ dần (`draw`) + đầu mũi tên tính theo lượng giác + nút đánh số `.dg-dot` + biểu tượng giữa |
| process | `concentric` đồng tâm | 2–5 bước | vòng `.dg-ring` lồng nhau, số thứ tự `.dg-num` + chú giải đánh số |
| process | `bullseye` bia | 3–5 bước | như đồng tâm, thêm mũi tên `.dg-arw` cắm vào tâm (bước cuối = đích) |
| comparison | `versus` đối đầu A vs B | đúng 2 cột | 2 nửa cắt chéo (`clip-path`) + huy hiệu "VS" ở giữa |

Sơ đồ + chú giải dùng chung khung `.dg` (lưới: hình vuông `container-type: size`, cỡ `100cqmin` | chú giải). Lớp đơn vị mới (`.mx-q`, `.dg-r`) được thêm vào
`UNIT`/`ZOOM` của engine → trình chiếu từng ý + bấm phóng to chạy cho sơ đồ.

### Biểu đồ (bố cục `chart`, `shared/deck/chart.js` + `chartView.js`)
- Dữ liệu: `slide.chart = { categories: string[], series: [{ name, values: (number|null)[] }], unit?, values?: false }`. **Kiểu biểu đồ = `slide.variant`**
  (`VARIANTS.chart` = column · bar · stacked · line · area · pie · donut · waterfall; mặc định cột). Giới hạn `CHART_LIMITS`: 12 hạng mục, 4 chuỗi, nhãn 40,
  đơn vị 16 ký tự, |số| ≤ 1e15.
- `FITS`: bar ≥ 1 hạng mục; stacked ≥ 2 chuỗi, không số âm; line/area ≥ 2 hạng mục; pie/donut 1 chuỗi, 2–8 lát, không âm, tổng > 0; waterfall 1 chuỗi,
  2–10 hạng mục. Không hợp → renderer về "Cột" (`resolveVariant`), bảng chọn kiểu làm mờ kèm lý do.
- Làm sạch (`cleanChart`, gọi ở `specService.cleanSlide`): chữ thuần (bỏ ký tự điều khiển, cắt độ dài), ô số đọc bằng `parseNum` — nhận cả "1.234,5" lẫn
  "1,234.5", ký hiệu tiền/%, số âm dạng "(5)"; ô không đọc được → `null` (ô trống). Không có hạng mục/chuỗi → bỏ `slide.chart`. `slide.chart` **được giữ khi
  đổi sang bố cục khác** (đổi lại không mất số liệu). Chế độ không nghiêm (kết quả AI): `chart` không có dữ liệu → hạ bố cục (`fallbackLayout`).
- Vẽ (HTML theo % vùng vẽ + SVG khi cần, mọi chữ qua `esc()`): trục "đẹp" `niceScale` (bước 1/2/2,5/5 × 10ⁿ, luôn có 0; số âm mọc xuống từ trục 0), số kiểu
  Việt Nam `fmtNum` (vạch trục lớn rút gọn "1,2 Tr"). **Đơn vị**: "%" gắn vào từng số; đơn vị khác ghi một lần "Đơn vị: …" ở góc, nhãn chỉ có số. Nhãn số
  liệu hiện khi `values !== false` (đường/vùng: chỉ khi 1 chuỗi). Thác nước tự thêm cột "Tổng" + đường nối. Tròn/vành khuyên: chú giải có % từng lát, vành
  khuyên ghi tổng ở giữa. Màu chuỗi `--ch0..7` (mẫu sáng đổi thứ tự để 2 chuỗi đầu tách màu rõ). `role="img"` + `aria-label` đọc đơn vị, tên chuỗi, số từng
  hạng mục. Trang có `caption` → dòng "Nguồn số liệu" nhỏ dưới biểu đồ. Hộp chú thích (§29) dùng được trên trang biểu đồ.
- Trình soạn thảo: bảng **"Dữ liệu biểu đồ"** (xem `06`) — gõ trực tiếp hoặc **dán bảng từ Excel/Google Sheets** (Tab hoặc ";"; cột đầu = hạng mục, hàng đầu =
  tên chuỗi nếu có ô chữ hoặc toàn là năm). Đổi **Con số → Biểu đồ** (cùng họ `['stats','chart']` trong bảng chọn kiểu): số liệu dạng số → 1 chuỗi, hậu tố
  chung → đơn vị (`chartFromStats`); ngược lại `statsFromChart` (chuỗi đầu, tối đa 8). Trang biểu đồ mới (chưa có số) nhận dữ liệu mẫu "Mục A–D".
