# 06 — Kiến trúc giao diện

## Tổng quan

- Vue 3 SPA (`frontend/`), build bằng Vite ra `dist/`, Express phục vụ tĩnh + fallback `index.html`.
- **MISA Design System 2.0** (nguồn `C:\MISA-project\misa-design-system-skill`): component copy vào `frontend/src/components/mds/`, token vào `frontend/src/styles/mds/`. Theme mặc định `blue`. Không tự vẽ lại component MDS đã có.
- Alias: `@` → `frontend/src`, `@shared` → `shared/` (dùng `SPEC_LIMITS`, `icons`, `palette`, `fonts`, `backgrounds` chung với server — xem trước thiết kế bằng **chính mã** của deck).
- Mọi gọi API đi qua `lib/api.js` (gắn CSRF, chuẩn hoá `ApiError{status, code, message, details}`, phát sự kiện `mp:unauthorized` khi 401).

## Cấu trúc thư mục

```
frontend/src/
  App.vue            # chọn trang theo bề mặt: meta.desktop | meta.mobile, key = `${surface}:${route.name}:${code|id}` (đổi tên bài trên URL không dựng lại trang); gắn VideoOverlay toàn cục
  router.js          # route + guard (session, guest, auth, mustChange, admin), safeNext()
  lib/               # api, session, surface, slideModel, deckActions, format, design (tông màu/nền/phông/logo cho giao diện),
                     #   deckPath (đường dẫn /ten-bai/ma/tinh-nang), editPaths (allowlist đường dẫn trường sửa trên khung)
  composables/       # logic dùng chung 2 bề mặt: useDecks, useCreate, useOutline, useEditor, useMedia, useVideoPlayer, useDeckFrame, useAuthForms, useAdminUsers,
                     #   useLiveDeck (khung sửa trực tiếp), useSlideMedia (mở hộp ảnh/video theo ô), useDeckUrl,
                     #   useSharing (mời/đổi quyền/gỡ — chủ bài), useVersions (bản gốc + handoff, khôi phục)
  shared/            # component dùng chung: SlideFields, ImagePicker, DeckThumb, RatioPicker, FormField, FormAlert, TempPasswordBox,
                     #   ThemePicker, DesignPanel (+ DesignPreview, BackgroundPicker, DeckBgCanvas, FontPicker, LogoSettings),
                     #   OutlineSlideCard, OutlineMedia, VideoPicker, MediaLibrary, VideoOverlay,
                     #   ImageStudio(+Panel), ImageEditor (Cropper.js), RangeField, InsertSlidePanel, FreeElementsPanel,
                     #   IconPicker (biểu tượng + ảnh/logo thay biểu tượng), BrandSettings (tab Thương hiệu: ảnh nhận diện + mẫu),
                     #   SharePanel (công khai + mời theo email + danh sách quyền), VersionsPanel (handoff, xem lại, khôi phục — xác nhận ngay trong panel)
  desktop/           # composition desktop: DesktopShell (MHeaderBar + MSidebar) + các trang
  mobile/            # composition mobile mini-app: MobileShell (MMobileTopBar + MMobileBottomNav) + ActionSheet + FullScreenSheet + các trang
  components/mds/    # bản sao MDS 2.0 (có vá cục bộ — xem 09)
```

**Nguyên tắc:** logic nghiệp vụ nằm trong `composables/` (dùng chung); `desktop/*` và `mobile/*` chỉ khác **cách bố trí** (composition), không phải CSS co giãn của cùng một trang.

## Chọn bề mặt (`lib/surface.js`)

1. Chạy trong host MISA AMIS (`window.MISAAmisHost` hoặc `?host=amis`) → **luôn mobile**, kể cả tablet rộng.
2. `?surface=mobile|desktop` ép để kiểm thử (ghi nhớ trong sessionStorage của tab).
3. Trình duyệt thường: bề rộng < 1024px → mobile, ngược lại desktop. Đổi kích thước → tự đổi bề mặt (debounce 150ms).

Không bao giờ chọn theo user-agent hay vai trò.

## Ma trận route × bề mặt × vai trò

Ký hiệu: ✅ hiển thị trang; ↪ chuyển hướng; 🚫 trang 403 **trong shell của bề mặt đó** (mobile: trong MobileShell, không phải trang desktop).

Vai trò trên **từng bài** (2026-10-07, `05` §4) tính theo `deck.access` (`lib/deckActions.js` → `deckAccess`, `deckTarget`, `deckMenuItems`, `deckNav`): **chủ** · **người sửa** (được mời Chỉnh sửa) · **người xem** (được mời Chỉ xem hoặc bài công khai). Ô "user"/"admin" bên dưới áp cho cả 3 vai trò bài trừ khi ghi rõ.

| Route | Trang | Khách | user | admin | Desktop | Mobile |
|---|---|---|---|---|---|---|
| `/` | — | ↪ `/login` | ↪ `/decks` | ↪ `/decks` | — | — |
| `/login`, `/register` | Đăng nhập / Đăng ký | ✅ | ↪ `/decks` | ↪ `/decks` | AuthLayout | MobileShell, không bottom nav |
| `/change-password` | Đổi mật khẩu (bắt buộc hoặc tự chọn) | ↪ `/login` | ✅ | ✅ | AuthLayout (forced) / DesktopShell | MobileShell, footer sticky |
| `/decks` | Bài của tôi | ↪ `/login?next=` | ✅ | ✅ | Lưới thẻ + tab + tìm kiếm + phân trang | Danh sách hàng + ActionSheet; bottom nav "Bài của tôi" |
| `/shared` | Được chia sẻ với tôi | ↪ login | ✅ | ✅ | như trên, tab thứ 2; thẻ có tag "Chỉnh sửa"/"Chỉ xem" + tên chủ bài; bấm thẻ: người sửa → `/edit`, người xem → `/view` | như trên; bottom nav "Chia sẻ" (aria "Bài được chia sẻ với tôi") |
| `/public` | Thư viện công khai | ↪ login | ✅ | ✅ | như trên (menu chỉ đọc) | như trên; bottom nav "Công khai" |
| `/create` | Tạo bằng AI (bước 1: lập dàn ý) | ↪ login | ✅ | ✅ | Tab nguồn, MUpload `block` nhiều tệp (tổng ≤ 300MB, tiến trình tải lên qua `uploadForm` XHR), RatioPicker, **ThemePicker** (Nền tối/sáng + mẫu theo tông + Tự động + Tuỳ chỉnh 2 màu có gợi ý), số trang Tự động/Tuỳ chỉnh, nút "Lập dàn ý bằng AI" → `/<ten-bai>/<ma>/outline` | Back → `/decks`, không bottom nav, footer Hủy/Lập dàn ý, ThemePicker `compact` |
| `/:slug/:code/outline` | Duyệt dàn ý (bước 2) — trạng thái `outlining`/`outline`/`generating` | ↪ login | ✅ chủ sở hữu | như user | Bước tiến trình 3 bước; cột trái: thẻ từng trang (`OutlineSlideCard`: bố cục, tiêu đề, mô tả, các dòng nội dung, media, ghi chú, menu ⋯); cột phải: `DesignPanel` (xem trước + tab Màu sắc/Nền/Phông chữ/Logo + chân trang); footer Hủy thay đổi/Lưu nháp/Dựng bài; xong → ↪ `/:slug/:code/edit` | Tab phân đoạn "Nội dung (N)" / "Thiết kế"; thẻ `compact` (⋯ 44px mở ActionSheet thao tác trang); footer Lưu nháp/Dựng bài; ActionSheet ⋯: Hủy thay đổi, Xóa bài |
| `/:slug/:code/edit` | Trình soạn thảo | ↪ login (bài còn ở bước dàn ý → ↪ `/outline`) | ✅ chủ + người sửa; người xem → thông báo "Bạn chỉ có quyền xem" + Trình chiếu/Nhân bản. **Chủ**: nút "Chia sẻ" (MDialog `SharePanel` — desktop) / mục "Chia sẻ" (FullScreenSheet — mobile), "Xóa bài". **Chủ + người sửa**: "Phiên bản" (MDrawer 520px `VersionsPanel` — desktop) / "Phiên bản & handoff" (FullScreenSheet — mobile); người sửa thấy tag "Được chia sẻ · Chỉnh sửa", không có Chia sẻ/Xóa, chỉ xoá bản handoff của mình, không khôi phục | như user | 3 cột: danh sách trang (+ "Thêm trang" → dialog `InsertSlidePanel`) · **khung sửa trực tiếp** · panel sửa (trang tự do: `FreeElementsPanel` trên `SlideFields`; tab "Thiết lập bài" chứa DesignPanel); hộp "Đổi / chỉnh sửa ảnh" (`ImageStudio`) + hộp video; Ctrl/Cmd+S | Khung sửa trực tiếp trên (chạm chữ sửa, chạm ảnh đổi), dải trang ngang (+ → màn con Thêm trang), form dưới (trang tự do có `FreeElementsPanel compact`), màn con toàn màn hình (`FullScreenSheet`): ảnh (`ImageStudioPanel compact`), video, thêm trang, "Thiết kế & thiết lập" |
| `/:slug/:code/view` | Trình chiếu | ↪ login | ✅ chủ, người được mời, hoặc bài public | như user | Toolbar Prev/Next, toàn màn hình, tải xuống; "Chỉnh sửa" (chủ + người sửa) hoặc "Nhân bản để sửa" (người xem); tag "Được chia sẻ · …" khi được mời | Footer Prev/Next/Chỉnh sửa hoặc Nhân bản; Back về `/decks` · `/shared` · `/public` theo `deckNav` |
| `/account` | Tài khoản | ↪ login | ✅ | ✅ (+ lối vào Quản trị) | DesktopShell | Bottom nav "Tài khoản"; link đổi mật khẩu, quản trị, đăng xuất |
| `/admin/users` | Quản lý người dùng | ↪ login | 🚫 `/403` | ✅ | MDataTable + dialog | Danh sách thẻ + ActionSheet + sheet tạo |
| `/403` | Không có quyền | — | ✅ | ✅ | DesktopShell | MobileShell |
| `/:pathMatch(.*)*` | 404 | ✅ | ✅ | ✅ | DesktopShell | MobileShell |

Đường dẫn cũ `/p/:id/:feature` (UUID hoặc mã) → `beforeEach` hỏi API rồi ↪ đường dẫn mới; `:code` khớp `[a-z0-9]{8}`, phần tên bài tự sửa theo tên hiện tại (`useDeckUrl`).

Guard bổ sung: `mustChangePassword=true` → mọi route (trừ `allowMustChange`) ↪ `/change-password`. `?next=` chỉ nhận đường dẫn nội bộ (`safeNext` chặn open redirect).

### Quy tắc mobile đã áp dụng (MDS mobile composition)

- Gốc `.mds-mobile-app`; MMobileTopBar (Back ở màn gốc → `exitToHost()`); MMobileBottomNav 5 mục: Bài của tôi / Công khai / **Tạo bài** (nút nổi giữa) / Chia sẻ (bài được chia sẻ với tôi) / Tài khoản. Nhãn ≤ ~8 ký tự để không bị cắt ở 375px ("Được chia sẻ" bị cắt → đổi "Chia sẻ", aria-label giữ nghĩa đầy đủ).
- Footer sticky: Hủy bên trái, nút chính bên phải; vùng chạm ≥ 44px (hàng ActionSheet 52px).
- Menu ngữ cảnh dùng `mobile/ActionSheet.vue` (bottom sheet tự viết vì MDS chưa có): phát `select` **trước** khi đóng, Esc đóng, trả focus.
- Admin vào từ trang Tài khoản (không có mục admin trên bottom nav).

### Chưa kiểm chứng

- Chạy thật trong host MISA AMIS (adapter `window.MISAAmisHost.close()` chỉ là giả định giao diện, **chưa kiểm chứng** với host thật).
- Safe-area (tai thỏ/home indicator) trên thiết bị iOS/Android thật — **chưa kiểm chứng**.
- Cử chỉ vuốt (swipe back, vuốt giữa các slide trong iframe) — **chưa kiểm chứng**.
- Trình đọc màn hình của hệ điều hành (VoiceOver/TalkBack) — **chưa kiểm chứng**; mới kiểm tra nhãn/role ở mức DOM.

Đã kiểm chứng (puppeteer + browser pane, 2026-10-05): mọi route ở 390px và 1440px không cuộn ngang; luồng đăng ký → tạo bài → sửa trên mobile → Lưu → xem lại.
Đã kiểm chứng (browser pane, 2026-10-07, chia sẻ): desktop 1440px — chủ bài mở "Chia sẻ" (email sai → lỗi ngay dưới ô; mời B "Chỉnh sửa" → hiện trong danh sách), "Phiên bản" (bản gốc chọn sẵn, 5/5 → nút Handoff khoá kèm lý do, xem lại 1 bản, xác nhận khôi phục trong ngăn → trang 1 về bản gốc); mobile 375px — B: `/shared` có tag "Chỉnh sửa", editor có footer Lưu, menu ⋯ không có Chia sẻ/Xóa, "Phiên bản & handoff": xoá bản của mình (xác nhận trong thẻ) → 4/5 → handoff kèm ghi chú → tag "Đang dùng"; chủ bài: ActionSheet "Chia sẻ…" → màn con, bật Công khai → tag danh sách đổi ngay. Không cuộn ngang ở 375px.
Đã kiểm chứng (browser pane, 2026-10-05, bản dàn ý): desktop 1366px — tạo bài với tông tuỳ chỉnh → dàn ý 8 trang → đổi phông, tải logo + tách nền, gắn YouTube (ảnh bìa 16:9, bấm → lớp phủ tự phát) → Dựng bài → tự sang editor; mobile 375px — tab Nội dung/Thiết kế, ActionSheet thao tác trang. **Không** xem được slide trong iframe preview ở browser pane (pane chặn request từ trang sandbox origin `null` — `ERR_BLOCKED_BY_CLIENT`); slide thật kiểm bằng Chrome headless trên HTML xuất.

## Trình soạn thảo (`useEditor` + `SlideFields`)

- `SlideFields.vue` sinh form theo layout: **chip "Kiểu trình bày"** (`VARIANT_LABELS`, mờ khi không hợp nội dung), kicker, tiêu đề, highlight (phải nằm trong tiêu đề), subtitle, caption, tags (phân tách dấu phẩy), icon (`IconPicker`, lưới có tìm kiếm), quote, danh sách stats/items/steps/columns (thêm/xoá/di chuyển; mục ở `ITEM_IMAGE_LAYOUTS` có nút "Ảnh/logo" thay biểu tượng), ImagePicker (tải ảnh mới hoặc chọn ảnh đã có trong bài), gallery, ghi chú. Lỗi độ dài tính từ `SPEC_LIMITS` theo **chữ hiển thị** ngay khi gõ.
- Chữ định dạng (`05` §13): ô nhập hiện `plainText`, ghi lại bằng `repaintRich` (giữ định dạng theo vị trí) qua helper `rx(obj, key)`; tiêu đề trong danh sách trang/aria dùng `plainText`. Định dạng (màu, đậm, VIẾT HOA, giữ liền) chỉ làm trên khung (thanh `#rtb` của engine) → `deck:edit` với chuỗi có thẻ → `editPaths` (`cutR` kiểm/cắt).
- `FreeElementsPanel` hiện ở **mọi** trang: trang tự do = đủ phần tử; trang có bố cục = `overlay` ("Chèn lên trang": Logo, chữ, ảnh, hình) — `useLiveDeck.addElement` không còn đòi layout `free`.
- Tab **Thương hiệu** của `DesignPanel` (`BrandSettings`): 6 ô ảnh nhận diện (tải lên/chọn lại/bỏ), "Chữ tối / Chữ sáng" cho ảnh nền toàn trang (tự đo độ sáng khi đặt ảnh), công tắc chữ chân trang, mẫu thương hiệu (lưu tên, danh sách có ảnh thu nhỏ, Áp dụng, menu chủ: đổi tên tại chỗ / chia sẻ công khai / xoá có `MDialog` xác nhận). API gọi qua `useMedia` (`uploadBrand`, `listTemplates`, `saveTemplate`, `updateTemplate`, `deleteTemplate`, `applyTemplate`). Mobile: ⋯ "Thêm thao tác" → "Thiết kế & thiết lập bài" → tab Thương hiệu (`compact`). `DesignPreview` vẽ ảnh bìa/nền + dải đầu/chân, đổi màu chữ theo `tones`.
- Đổi layout (`change-layout`) dùng `lib/slideModel.js` để chuyển dữ liệu sang hình dạng của layout mới mà không mất nội dung chung.
- Preview trình soạn thảo là iframe `sandbox="allow-scripts allow-popups"` + **`data-deck-frame`** trỏ `/api/presentations/:id/preview?edit=1` — **khung sửa trực tiếp** (`useLiveDeck`, xem `05` §12): engine → app `deck:ready|slide|edit|media|select|geom|el|save`; app → engine `deck:render|goto|select`. Mọi tin nhận chỉ từ đúng `e.source`, đường dẫn trường qua allowlist `editPaths`, số qua kẹp hữu hạn. Trang xem (`/view`) dùng `useDeckFrame` (`deck:goto`/`deck:slide {index,count,step,steps}`/`deck:step {dir}`/`deck:cmd {black|esc}`; `keys: true` chuyển phím bút trình chiếu từ trang cha vào khung; nút Trước/Sau đi theo từng ý — `05` §14). Bấm video trong slide → engine gửi `deck:video` → `useVideoPlayer` chỉ nhận từ iframe có `data-deck-frame` → `VideoOverlay` phát toàn màn hình (iframe sandbox không tự fullscreen/nhúng YouTube được).
- Trang có ô media (`MEDIA_LAYOUTS`) có tab Ảnh / Video trong `SlideFields`; bảng Thiết kế dùng chung `DesignPanel` với bước dàn ý.
- `useEditor`/`useOutline` áp `withDesignDefaults` khi nhận dữ liệu (component không tự sửa props).
- Engine thêm `body.embed` khi chạy trong iframe → ẩn HUD của engine; ứng dụng tự vẽ nút Prev/Next.

## Trình bày (deck renderer — `shared/deck/`)

- `render.js`: spec → HTML (escape mọi chuỗi), 13 layout × biến thể (`variants.js`, lớp `V-<biến thể>`), `data-style` phong cách bài, 20 mẫu màu + tuỳ chỉnh, `data-bg`/`data-tone` trên trang, khung video 16:9, logo, `mode: present|print`; chữ định dạng (`rich.js` → `span.rt`), ảnh mục `.ib-img`, lớp chèn đè `.free.over`, bộ nhận diện (`brandFor`: `.bimg`/`.bhd`/`.bft`, lớp `has-bimg`/`bspec`/`no-ftt`/`ink-light`/`ink-dark`, biến `--bt`/`--bb`).
- `rich.js`: cú pháp `⟦…⟧…⟦/⟧` (parse/serialize/plainText/cutRich/repaintRich/formatRange/richHtml) — dùng chung server, renderer, giao diện.
- `variants.js`: danh sách biến thể/phong cách, điều kiện hợp nội dung, `artDirect` (server) + `resolveVariant` (renderer) — xem `05` §9.
- `engine.js`: điều khiển trang (phím mũi tên/Space/PageUp/Down, chạm, HUD), hiệu ứng spring, đếm số, vẽ đường, nền động (`window.DeckBg` từ `backgrounds.js` ghép trước engine), lớp phát video; mode print tắt chuyển động.
- `theme.css`: biến màu 5 mẫu gốc, bố cục theo tỷ lệ; `palette.js` sinh biến cho các mẫu còn lại + tuỳ chỉnh (đảm bảo tương phản); `fonts.js` + `fonts/`: @font-face theo phông đã chọn.
- `icons.js`: tập icon SVG nội tuyến (dùng chung server + editor).

## Kiểm tra tệp trước khi tải lên (`lib/fileKinds.js`)

- `SOURCE_ACCEPT` liệt kê cả .doc/.xls/.ppt/.key/.pages/.numbers để người dùng chọn được và nhận hướng dẫn ngay (`sourceProblem`), thay vì tệp bị làm mờ không rõ lý do. Nhiều tệp lỗi → gộp tối đa 3 lý do + "và N tệp khác".
- `heicToJpeg`: ảnh HEIC → JPEG ≤ 2560px trên trình duyệt (Safari); trình duyệt không giải mã được → lỗi `HEIC_UNSUPPORTED` kèm cách đổi. Dùng ở tư liệu (`useCreate`), ảnh trang + logo (`useMedia`).
- `OutlineMedia.vue`: kéo-thả nhiều ảnh vào khung media của trang (desktop).
- `CreateMediaPicker.vue` (trang Tạo bài, tab Nhập nội dung — desktop + mobile `touch`): ảnh/video gửi kèm, lưới ảnh thu nhỏ (video hiện ảnh bìa + nhãn Video), nút bỏ 32px/44px, kéo-thả (desktop), tóm tắt "2 ảnh · 1 video · 1,3 MB"; logic ở `useCreate` (`addMedia`/`removeMedia`, giới hạn `MAX_CREATE_MEDIA` 20, video 10).

### Trình chiếu từng ý / 3D (2026-10-06)
- `SlideFields`: mục "Trình chiếu khi bấm Sau" (`BUILD_OPTIONS`, `BUILD_LAYOUTS` ở `slideModel.js`) + "Áp cho mọi trang" (phát `build-all` → `EditorPage` → `useEditor.setBuildAll`), cả desktop + mobile.
- `FreeElementsPanel`: công tắc "Hiện khi bấm" cho mọi phần tử; nút + thuộc tính **Logo 3D** (chuyển động, độ dày, đổi logo; prop `deckLogo` = `spec.logo`). Icon MDS `cube` (vá registry — `09`).
- `BackgroundPicker`/`DeckBgCanvas`: thêm 4 ô nền 3D (`BACKGROUND_OPTIONS[].is3d`); `DeckBgCanvas` import động `@shared/deck/deck3d.js`, tạo **canvas WebGL mới** mỗi lần dựng (canvas đã mất ngữ cảnh không dùng lại được), không WebGL → mẫu 2D `FALLBACK_2D`.
