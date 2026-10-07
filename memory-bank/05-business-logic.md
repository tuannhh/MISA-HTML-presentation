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
      "notes": "ghi chú người trình bày" }
  ]
}
```

Giới hạn độ dài/số lượng: `shared/deck/limits.js` (`SPEC_LIMITS`) — dùng chung server và `maxlength` trên form.

**Chữ có định dạng** (2026-10-06, `shared/deck/rich.js`, §13): mọi trường văn bản (trừ ô số liệu `stats.value/prefix/suffix` và chân trang) có thể chứa
`⟦thuộc tính⟧đoạn chữ⟦/⟧` — thuộc tính = token màu theo theme (`RICH_COLORS`: text, accent, accent-2, amber, mint, coral, violet, muted, white, dark) | `#RRGGBB` | `b` (đậm) | `n` (giữ liền, không ngắt dòng) — và `\n` = xuống dòng.
Giới hạn độ dài tính theo **chữ hiển thị** (`plainText`); chuỗi thô dài quá `max*4+400` thì bỏ định dạng. Thẻ sai cú pháp → chữ thường (bỏ dấu ⟦ ⟧).

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
- **Sửa trực tiếp trên khung xem trước** (2026-10-06, §12): khung không còn tải lại sau khi lưu — ứng dụng dựng lại slide từ bản nháp và gửi vào khung; lưu xong chỉ cập nhật version. Ctrl/Cmd+S lưu (cả khi đang gõ trong khung).
- Thành công → ảnh bìa render lại sau 4 giây (gộp nhiều lần lưu liên tiếp — `scheduleThumbnail`).
- **Tỷ lệ** và **Công khai/Riêng tư** áp dụng ngay (PATCH riêng, không cần spec) và **giữ nguyên bản nháp** chưa lưu.
- Rời trang khi nháp chưa lưu → hộp thoại xác nhận. Nếu component bị unmount do đổi bề mặt desktop↔mobile, nháp được giữ trong `pendingDrafts` (RAM) và khôi phục nếu `specVersion` vẫn khớp.
- Ảnh mới: `POST /:id/assets` → trả asset id + URL ký → gắn vào `image.asset` của slide trong nháp. Trang có ô media (`MEDIA_LAYOUTS`) chọn được tab Ảnh / Video; Lưu bỏ video ở bố cục không có ô media, bỏ `palette` khi theme không phải `custom`.
- Bảng **Thiết kế** (màu, nền, phông, logo) dùng chung giữa bước dàn ý và trình soạn thảo (`DesignPanel.vue`).

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

- Tự đăng ký: bật/tắt bằng `SELF_REGISTRATION`, chỉ domain trong `ALLOWED_EMAIL_DOMAINS` (để trống = mọi domain).
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

## 11. Ảnh giao diện phần mềm từ PDF + tấm nền ảnh + màu nhấn rực (2026-10-06)

Slide sản phẩm (PDF) thường dán nhiều ảnh chụp giao diện; trước đây PDF chỉ cho chữ → bài toàn chữ. Nay **ưu tiên đưa ảnh UI vào bài**.
- **Cắt ảnh** (`pdfShotService.extractPdfUiShots`, gọi đầu `generateOutline`): `pdftoppm` (poppler-utils, có trong Docker) render ≤ `PDF_UI_SHOT_PAGES` trang
  cạnh dài 2000px → ảnh trang 1024px gửi `gemini.locateUiShots` (1 lượt, prompt `UI_SHOTS_PROMPT`: chỉ lấy màn hình phần mềm web/mobile/tablet,
  cụm điện thoại liền nhau = 1 vùng; bỏ logo, QR, sơ đồ, ảnh người, bảng giá) → `box_2d` 0–1000 + `device` + `title` + `quality` 1–3.
  `boxToRegion` nới 0,5%/phía, bỏ vùng < 12% cạnh hoặc > 90% diện tích trang; bỏ `quality` 1; bỏ ảnh trùng (dHash 64 bit, Hamming ≤ 6);
  tối đa `PDF_UI_SHOTS_MAX`. Cắt từ bản render (không trích ảnh nhúng) → giữ đúng ảnh chồng lớp/PNG trong suốt trên nền trang gốc.
  Lỗi bất kỳ (thiếu pdftoppm, PDF mật khẩu, AI lỗi) → `[]`, log `pdf_ui_shots_failed`, bài vẫn tạo được.
- Ảnh cắt đứng **đầu** danh sách IMGn (luôn có hình xem trước), mô tả "ẢNH GIAO DIỆN PHẦN MỀM (device) cắt từ trang N…".
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

### Trang tự do (layout `free`) + chèn trang
- Không có trong danh sách layout cho AI (`AI_LAYOUTS`); chỉ người dùng tạo. `slide.elements[]` (≤ 30): `text` (kiểu chữ title/heading/body/caption/label × hệ số cỡ 0.4–4, căn ngang/dọc, màu theo token theme, nền), `image` (tham chiếu ảnh + bo góc), `video`, `table` (≤ 12×8, hàng tiêu đề, kiểu sọc/kẻ ô/kẻ ngang), `shape` (chữ nhật/bo góc/tròn/đường kẻ, màu token, độ đậm). Toạ độ **% khung** (x, y, w, h) → giữ đúng bố cục khi đổi tỷ lệ.
- "Thêm trang" mở hộp chọn: 10 mẫu trang tự do (`FREE_TEMPLATES` trong `shared/deck/free.js`: trang trắng, tiêu đề + nội dung, 2 cột, ảnh trái/phải, ảnh lớn + tiêu đề, bảng, video, 3 ảnh, con số lớn) + 13 bố cục có cấu trúc.
- Trên khung: bấm chọn, kéo di chuyển, 8 tay nắm đổi cỡ (Shift giữ tỷ lệ), hít lề/tâm/phần tử khác trong 0,8% (Alt tắt), phím mũi tên dịch (Shift ×8), Delete xoá, Ctrl/Cmd+D nhân bản, bấm đúp sửa chữ / đổi ảnh. Bảng thuộc tính (`FreeElementsPanel`): thêm phần tử, danh sách lớp, ô số %, thuộc tính theo loại, thứ tự lớp.
- Máy chủ chuẩn hoá phần tử (`cleanElement`): loại lạ bị bỏ, toạ độ kẹp (−50..100 / 2..150), id `e-…` trùng được cấp lại, bảng luôn chữ nhật.

### Ảnh: AI, tìm Internet, chỉnh sửa
- **Ảnh AI khi dựng bài** (tuỳ chọn ở màn Tạo, mặc định bật, lưu ở `outline.options.aiImages`): `designDeck` được yêu cầu thêm `imagePrompt` (tiếng Anh) cho trang **cần** minh hoạ mà chưa có ảnh thật/ảnh giao diện; `illustrate()` tạo tối đa `AI_IMAGES_PER_DECK` (6) ảnh 4:3 — ưu tiên bìa → mở đầu phần → còn lại — chạy song song `AI_IMAGES_CONCURRENCY`; ảnh lỗi bỏ qua, không làm hỏng bài.
- **Hộp "Đổi / chỉnh sửa ảnh"** (`ImageStudioPanel`; desktop = dialog, mobile = màn toàn màn hình): Tải lên · Ảnh trong bài · Tìm ảnh (Pixabay, từ khoá Việt/Anh, lọc hướng) · Tạo bằng AI (mô tả + tỷ lệ, gợi ý sẵn từ tiêu đề trang) · Chỉnh sửa. Chọn ảnh mới giữ chú thích/kiểu hiển thị, bỏ thông số chỉnh sửa của ảnh cũ.
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
- Ngắt dòng hợp lý: `text-wrap: balance` cho tiêu đề/nhãn, `pretty` cho đoạn văn, `n` để giữ liền cụm từ.

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

## 14. Trình chiếu từng ý, phóng to khi bấm, hiệu ứng 3D (2026-10-06)

Chỉ xuất **HTML + PDF** (không PowerPoint — PPTX không giữ được chuyển động/3D).

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
