# 05 — Logic nghiệp vụ cốt lõi

## 1. Spec — mô hình dữ liệu của bài trình bày

Bài trình bày được lưu dưới dạng **spec JSON** (`presentations.spec`) — là nguồn sự thật duy nhất. Preview, HTML xuất ra, PDF và ảnh bìa đều được render từ spec qua `shared/deck/render.js`. AI **không bao giờ** sinh HTML.

```jsonc
{
  "title": "…", "theme": "midnight|aurora|ocean|paper|ember", "footer": "…",
  "slides": [
    { "layout": "cover|section|agenda|bullets|cards|stats|image|gallery|timeline|process|quote|comparison|closing",
      "kicker", "title", "highlight" /* phải là chuỗi con của title */, "subtitle", "caption", "tags": [],
      "icon" /* tên trong shared/deck/icons.js */,
      "items": [{ "title", "text", "value", "icon" }], "stats": [{ "value", "prefix", "suffix", "label" }],
      "steps": [...], "columns": [{ "title", "subtitle", "points": [] }],
      "quote": { "text", "author", "role" },
      "image": { "asset": "<uuid>", "fit": "cover|contain", "alt" }, "images": [{ "asset", "alt" }],
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

Luôn: theme lạ → `midnight`; 0 trang → lỗi "cần ít nhất 1 trang"; tối đa 60 trang; `dropForeignAssets` bỏ tham chiếu ảnh không thuộc bài (chống đọc chéo ảnh tenant khác).

## 2. Luồng tạo bằng AI

```
POST /api/presentations (multipart)
  → precheckSource: đúng 1 nguồn, kiểm kích thước/loại tệp (magic bytes)
  → hàng đợi đầy (pending ≥ MAX_PENDING_JOBS) → 503 QUEUE_FULL
  → INSERT presentations(status='generating') + audit → trả 202 {id}
  → genQueue (Semaphore GENERATION_CONCURRENCY) chạy nền:
      ingestSource → { pieces (văn bản), media (PDF/ghi âm), images }:
        tệp tải lên nằm trên đĩa (STORAGE_DIR/uploads, tên UUID) tới khi job xong — xoá trong finally của hàng đợi
        .pptx/.docx → jszip đọc XML (giới hạn 5000 entry, 400MB giải nén) + rút ảnh nhúng
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
      geminiService.generateDeck: prompt tiếng Việt + responseSchema (mảng tuỳ chọn được đánh dấu required để model không bỏ sót;
                                  theme chỉ trong tông đã chọn) + ảnh xem trước 1280px (≤30 ảnh, ≤6MB) để AI đọc chữ trong ảnh
                                  và chọn ảnh đúng slide (tham chiếu bằng chỉ số ảnh)
      mapModelDeck (chỉ số ảnh → asset id) → normalizeSpec (lenient) → capSlides (tự động ≤ 25 / tuỳ chỉnh = N, giữ trang kết)
        → themeForTone → dropForeignAssets
      → status='ready', spec, slide_count, title (nếu người dùng không đặt) → hẹn tạo ảnh bìa
  lỗi → status='failed', error_message tiếng Việt (lỗi không phải HttpError → thông điệp chung, chi tiết chỉ ở log)
```

- **Số trang:** `auto` → AI tự chọn theo lượng nội dung, tối đa 25; số cụ thể → "ĐÚNG N trang" (prompt + mô tả schema) và server cắt về N nếu thừa.
- **Tông nền:** `dark` → theme midnight/ocean/aurora; `light` → paper (xanh dương – đen) / ember (cam – đen). Theme sáng: mọi màu chữ/hình ≥ 4.5:1 trên nền, không chữ vàng/xám nhạt (xem `shared/deck/theme.css`).
- Giao diện poll `GET /:id` mỗi ~3–4 giây khi `status='generating'`; danh sách poll khi còn bài đang tạo hoặc chưa có ảnh bìa.
- Khởi động lại server: `recoverStale()` → các bài `generating` bị đánh `failed` (hàng đợi nằm trong RAM, không khôi phục được).

## 3. Chỉnh sửa & lưu

- Trình soạn thảo làm việc trên **bản nháp** (`draft`) clone từ spec; mọi thay đổi chỉ cục bộ cho tới khi bấm **Lưu**.
- **Lưu** = `PATCH /:id { spec, specVersion, title }` → strict normalize → `UPDATE … WHERE spec_version = ?` → version +1. Lệch version → 409, giao diện hiện link "Tải lại bản mới nhất".
- Thành công → khung xem trước reload, giữ trang đang xem; ảnh bìa render lại sau 4 giây (gộp nhiều lần lưu liên tiếp — `scheduleThumbnail`).
- **Tỷ lệ** và **Công khai/Riêng tư** áp dụng ngay (PATCH riêng, không cần spec) và **giữ nguyên bản nháp** chưa lưu.
- Rời trang khi nháp chưa lưu → hộp thoại xác nhận. Nếu component bị unmount do đổi bề mặt desktop↔mobile, nháp được giữ trong `pendingDrafts` (RAM) và khôi phục nếu `specVersion` vẫn khớp.
- Ảnh mới: `POST /:id/assets` → trả asset id + URL ký → gắn vào `image.asset` của slide trong nháp.

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
| Xem trước (iframe) | `render(mode='present')`, ảnh qua URL ký HMAC, font qua `/deck-assets` | Chạy engine chuyển động; nhận `deck:goto` qua postMessage, báo `deck:slide` |
| HTML một tệp | `render(mode='present', embedFont)` + ảnh inline base64 | Mở offline, giữ chuyển động, điều khiển bằng phím/chạm |
| PDF | `render(mode='print')` → Chromium `page.pdf` khổ đúng tỷ lệ (canvas cao 1440px) | Không chuyển động; mỗi slide 1 trang; Chromium chặn mọi request mạng |
| Ảnh bìa | Slide đầu, `mode='present'`, chụp sau khi hiệu ứng ổn định → WebP | Asset kind `thumbnail`, ảnh cũ bị xoá |

Kích thước canvas (`RATIO_SIZES`): 16:9 = 2560×1440, 4:3 = 1920×1440, 2:1 = 2880×1440, 3:1 = 4320×1440 — engine scale vừa khung nhìn.

## 6. Tài khoản

- Tự đăng ký: bật/tắt bằng `SELF_REGISTRATION`, chỉ domain trong `ALLOWED_EMAIL_DOMAINS` (để trống = mọi domain).
- Admin tạo tài khoản / đặt lại mật khẩu → mật khẩu tạm hiển thị **một lần** → người dùng bắt buộc đổi (router chặn mọi trang khác, API trả `MUST_CHANGE_PASSWORD`).
- Admin đầu tiên: `npm run create-admin -- email "Họ tên"` (xem `07`).
- Không thể tự khoá/tự hạ quyền; luôn còn ít nhất 1 admin active (`LAST_ADMIN`).
