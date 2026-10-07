# 03 — Lược đồ cơ sở dữ liệu

Nguồn: `startup/database/schema.sql` (baseline `schema.sql@2026-10-05-baseline`). Mọi thời gian lưu UTC, `DATETIME(3)`. Khoá chính là UUID dạng `CHAR(36)` do server sinh.

## Danh sách bảng

### Bảng: `users`

Mỗi người dùng đồng thời là **một tenant** (`presentations.tenant_id = users.id`).

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| id | CHAR(36) | PK | Mã người dùng = mã tenant |
| email | VARCHAR(190) | UNIQUE | Chuẩn hoá chữ thường |
| display_name | VARCHAR(120) | NOT NULL | 2–120 ký tự |
| password_hash | VARCHAR(100) | NOT NULL | bcrypt |
| role | ENUM('user','admin') | default 'user' | |
| status | ENUM('active','disabled') | default 'active' | `disabled` → không đăng nhập, phiên cũ bị chặn |
| must_change_password | TINYINT(1) | default 0 | 1 khi admin tạo/đặt lại mật khẩu tạm |
| session_version | INT UNSIGNED | default 1 | Tăng khi đổi mật khẩu/khoá → vô hiệu mọi phiên cũ |
| created_at / updated_at / last_login_at | DATETIME(3) | | |

### Bảng: `presentations`

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| id | CHAR(36) | PK | |
| tenant_id | CHAR(36) | FK → users.id ON DELETE CASCADE | Chủ sở hữu |
| short_code | CHAR(8) | UNIQUE `uq_presentations_code`, NULL được | Mã ngắn `[a-z0-9]{8}` cho đường dẫn `/<ten-bai>/<ma>/<tinh-nang>`; sinh ngẫu nhiên khi tạo/nhân bản (trùng → thử lại). Tra mã **không** lọc tenant (chỉ ra UUID; quyền vẫn kiểm ở service) |
| title | VARCHAR(200) | NOT NULL | Tên bài (hiển thị danh sách) |
| ratio | ENUM('16:9','4:3','2:1','3:1') | default '16:9' | Đổi được bất kỳ lúc nào (không cần render lại spec) |
| visibility | ENUM('private','public') | default 'private' | |
| status | ENUM('outlining','outline','generating','ready','failed') | | `outlining` AI lập dàn ý → `outline` chờ người dùng duyệt → `generating` AI dựng bài → `ready`. Dựng lỗi → quay về `outline` (kèm `error_message`). Khởi động lại: `generating` còn dàn ý → `outline`; `generating`/`outlining` không có dàn ý → `failed` (`failStaleGenerating`) |
| source_kind | ENUM('file','url','text','copy') | | `copy` = bản nhân bản |
| source_label | VARCHAR(300) | NULL | Tên tệp/URL nguồn (không lưu nội dung nguồn) |
| instructions | VARCHAR(2000) | NULL | Yêu cầu thêm cho AI |
| spec | JSON | NULL | **Đặc tả bài trình bày — nguồn sự thật duy nhất** để render (NULL khi chưa dựng) |
| outline | JSON | NULL | Dàn ý: nội dung từng trang (`points[]`), media (`images[]`/`video`), `design` (theme, palette, background, font, logo). Giữ lại sau khi dựng; tuỳ chọn tạo bài (`tone`, `autoSlides`, `slideCount`) do server giữ |
| outline_version | INT UNSIGNED | default 0 | Khoá lạc quan riêng cho dàn ý; `PUT /outline`, `POST /build` phải gửi đúng version |
| spec_version | INT UNSIGNED | default 0 | Khoá lạc quan: lưu với version cũ → 409 |
| slide_count | SMALLINT UNSIGNED | | |
| thumbnail_asset_id | CHAR(36) | NULL | Ảnh bìa (asset kind `thumbnail`) |
| error_message | VARCHAR(500) | NULL | Lỗi tiếng Việt khi tạo thất bại |
| published_at | DATETIME(3) | NULL | Lúc công khai (COALESCE giữ lần đầu); về private → NULL |

Chỉ mục: `(tenant_id, updated_at)` cho "Bài của tôi"; `(visibility, status, published_at)` cho thư viện công khai.

### Bảng: `assets`

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| id | CHAR(36) | PK | Được tham chiếu trong spec/dàn ý (`image.asset`, `video.asset`, `video.poster`, `logo.asset`, `logo.cutout`, `items[].image.asset`, `brand.<ô>`) |
| tenant_id | CHAR(36) | FK → users ON DELETE CASCADE | |
| presentation_id | CHAR(36) | FK → presentations ON DELETE CASCADE | Ảnh thuộc đúng 1 bài |
| kind | ENUM('image','thumbnail','video','logo','poster','brand') | | `logo` gồm cả bản tách nền; `poster` = ảnh bìa video tải lên / YouTube; `brand` = ảnh bộ nhận diện (nền bìa/nội dung/mở đầu phần/kết, dải đầu/chân trang — cạnh dài ≤ 3840, giữ trong suốt, ≤ 120 ảnh/bài) |
| mime, bytes, width, height | | | Ảnh luôn `image/webp` sau chuẩn hoá; video `video/mp4`·`quicktime`·`webm` (width/height NULL) |
| storage_key | VARCHAR(255) | | Đường dẫn tương đối do server sinh, không lấy từ tên client |
| original_name | VARCHAR(255) | NULL | Chỉ để hiển thị |

### Bảng: `design_templates`

Mẫu thiết kế / bộ nhận diện thương hiệu người dùng lưu để áp cho bài khác (`05` §13).

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| id | CHAR(36) | PK | |
| tenant_id | CHAR(36) | FK → users ON DELETE CASCADE | Chủ mẫu |
| name | VARCHAR(120) | NOT NULL | 1–120 ký tự (gộp khoảng trắng) |
| visibility | ENUM('private','public') | default 'private' | `public` = mọi người dùng thấy + áp được; chỉ chủ sửa/xoá |
| design | JSON | NOT NULL | `{ theme, palette, background, font, logo, brand, style? }` đã qua `normalizeDesign` strict — mã ảnh trỏ tới `template_assets` **của chính mẫu** |
| created_at / updated_at | DATETIME(3) | | |

Chỉ mục: `(tenant_id, updated_at)`, `(visibility, updated_at)`. Tối đa 50 mẫu/người.

### Bảng: `template_assets`

Ảnh của mẫu — **bản sao riêng** (lưu mẫu: chép ảnh của bài sang; áp mẫu: chép tiếp sang `assets` của bài đích). Không dùng chung tệp giữa mẫu và bài → xoá bài/mẫu không ảnh hưởng nhau, cô lập tenant giữ nguyên.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| id | CHAR(36) | PK | |
| tenant_id | CHAR(36) | FK → users ON DELETE CASCADE | Chủ mẫu |
| template_id | CHAR(36) | FK → design_templates ON DELETE CASCADE | |
| kind | ENUM('logo','brand','image') | | |
| mime, bytes, width, height, storage_key, original_name | | | Như `assets`; `storage_key` do server sinh (`templates/<tenant>/<mẫu>/…`) |
| created_at | DATETIME(3) | | |

### Bảng: `presentation_shares`

Chia sẻ theo người: chủ bài mời người dùng khác (theo email) với quyền **chỉ xem** hoặc **chỉnh sửa** (`05` §4). Dữ liệu bài vẫn thuộc tenant của chủ bài — bảng này chỉ cấp quyền truy cập.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| presentation_id | CHAR(36) | PK (cùng user_id), FK → presentations ON DELETE CASCADE | |
| user_id | CHAR(36) | PK, FK → users ON DELETE CASCADE | Người được mời (không bao giờ là chủ bài — service chặn `SELF_SHARE`) |
| role | ENUM('viewer','editor') | NOT NULL | `viewer` chỉ xem (như công khai); `editor` sửa + handoff |
| created_by | CHAR(36) | NULL, FK → users ON DELETE SET NULL | Chủ bài lúc mời |
| created_at / updated_at | DATETIME(3) | | Mời lại cùng người = đổi quyền (`INSERT … AS n ON DUPLICATE KEY UPDATE role = n.role`) |

Chỉ mục: `(user_id, updated_at)` cho trang "Được chia sẻ với tôi". Tối đa 100 người/bài (service).

### Bảng: `presentation_versions`

Ảnh chụp bài để khôi phục: **bản gốc** (`baseline`, 1 bản/bài — chụp lần đầu chia sẻ) + tối đa **5 bản handoff**.

| Cột | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| id | CHAR(36) | PK | |
| presentation_id | CHAR(36) | FK → presentations ON DELETE CASCADE | |
| kind | ENUM('baseline','handoff') | NOT NULL | |
| title, ratio, spec, spec_version, slide_count | | | Chụp **từ dòng `presentations` phía máy chủ** (`INSERT … SELECT`) — không bao giờ nhận spec từ client |
| note | VARCHAR(200) | NULL | Ghi chú khi handoff |
| created_by | CHAR(36) | NULL, FK → users ON DELETE SET NULL | Người chụp (chủ bài / người được mời sửa) |
| created_at | DATETIME(3) | | |
| baseline_lock | TINYINT | GENERATED `IF(kind='baseline',1,NULL)` STORED | UNIQUE `(presentation_id, baseline_lock)` → mỗi bài **đúng 1 bản gốc** kể cả khi 2 request chạy song song (NULL không trùng nhau nên handoff không bị chặn) |

Chỉ mục: `(presentation_id, kind, created_at)`. Tối đa 5 handoff/bài: kiểm trong transaction có `SELECT … FOR UPDATE` dòng bài (`versionRepository.createHandoff`) — không có ràng buộc DB riêng.

### Bảng: `sessions`

Store của express-session (`MySqlSessionStore`): `session_id` PK, `expires` (ms epoch, có index), `data` MEDIUMTEXT. Dọn phiên hết hạn mỗi 15 phút.

### Bảng: `audit_logs`

`actor_id`, `action` (vd. `auth.login`, `presentation.visibility`, `presentation.export_pdf`, `admin.user_create`), `target_type`, `target_id`, `result`, `ip`, `meta` JSON. Không bao giờ ghi mật khẩu/token. Ghi lỗi chỉ cảnh báo, không làm hỏng request.

### Bảng: `schema_changelog`

Tên các changelog đã áp dụng (baseline tự chèn). Changelog mới đặt ở `startup/database/changelogs/` và chạy **thủ công** (xem README trong thư mục đó).

## Quan hệ giữa các bảng

```
users 1 ──< presentations 1 ──< assets
  (xoá user → xoá bài → xoá asset trong DB; tệp trên đĩa dọn bằng storage.removePrefix khi xoá bài qua API)
presentations 1 ──< presentation_shares >── 1 users        (xoá bài / người được mời → xoá quyền)
presentations 1 ──< presentation_versions                   (xoá bài → xoá phiên bản; xoá người chụp → created_by NULL)
users 1 ──< design_templates 1 ──< template_assets
  (ảnh mẫu ⇄ ảnh bài chỉ liên hệ bằng SAO CHÉP khi lưu/áp mẫu — không có FK chéo)
```

## Lịch sử thay đổi lược đồ đáng chú ý

- 2026-10-05: baseline đầu tiên.
- 2026-10-05 (`changelog_database_20261005_170000.sql`, idempotent): trạng thái `outlining`/`outline`, cột `outline` + `outline_version`, asset kind `video`/`logo`/`poster`. Baseline `schema.sql` đã gồm sẵn.
- 2026-10-06 (`changelog_database_20261006_090000.sql`, idempotent): cột `presentations.short_code` + backfill mã ngẫu nhiên cho bài cũ + unique key `uq_presentations_code`. Có trong `REQUIRED_CHANGELOGS` (app từ chối khởi động nếu chưa chạy). Baseline đã gồm sẵn.
- 2026-10-06 (`changelog_database_20261006_200000.sql`, idempotent — `MODIFY` ENUM chỉ khi chưa có `'brand'`, `CREATE TABLE IF NOT EXISTS`): asset kind `brand`, bảng `design_templates` + `template_assets`. Có trong `REQUIRED_CHANGELOGS`; baseline đã gồm sẵn. Đã chạy 2 lần trên MySQL Docker để kiểm idempotent.
- 2026-10-07 (`changelog_database_20261007_100000.sql`, idempotent — `CREATE TABLE IF NOT EXISTS`, seed `INSERT … WHERE NOT EXISTS`): bảng `presentation_shares` + `presentation_versions`; tạo **bản gốc** cho các bài đang công khai + ready chưa có bản gốc (để "khôi phục mặc định" dùng được ngay với bài đã chia sẻ trước đây). Có trong `REQUIRED_CHANGELOGS` + `REQUIRED_TABLES`; baseline đã gồm sẵn. Chạy 2 lần trên MySQL Docker → vẫn đúng 1 bản gốc/bài.
