# 06 — Kiến trúc giao diện

## Tổng quan

- Vue 3 SPA (`frontend/`), build bằng Vite ra `dist/`, Express phục vụ tĩnh + fallback `index.html`.
- **MISA Design System 2.0** (nguồn `C:\MISA-project\misa-design-system-skill`): component copy vào `frontend/src/components/mds/`, token vào `frontend/src/styles/mds/`. Theme mặc định `blue`. Không tự vẽ lại component MDS đã có.
- Alias: `@` → `frontend/src`, `@shared` → `shared/` (dùng `SPEC_LIMITS`, `icons` chung với server).
- Mọi gọi API đi qua `lib/api.js` (gắn CSRF, chuẩn hoá `ApiError{status, code, message, details}`, phát sự kiện `mp:unauthorized` khi 401).

## Cấu trúc thư mục

```
frontend/src/
  App.vue            # chọn trang theo bề mặt: meta.desktop | meta.mobile, key = `${surface}:${path}`
  router.js          # route + guard (session, guest, auth, mustChange, admin), safeNext()
  lib/               # api, session, surface, slideModel, deckActions, format
  composables/       # logic dùng chung 2 bề mặt: useDecks, useCreate, useEditor, useDeckFrame, useAuthForms, useAdminUsers
  shared/            # component dùng chung: SlideFields, ImagePicker, DeckThumb, RatioPicker, TonePicker, FormField, FormAlert, TempPasswordBox
  desktop/           # composition desktop: DesktopShell (MHeaderBar + MSidebar) + các trang
  mobile/            # composition mobile mini-app: MobileShell (MMobileTopBar + MMobileBottomNav) + ActionSheet + các trang
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

| Route | Trang | Khách | user | admin | Desktop | Mobile |
|---|---|---|---|---|---|---|
| `/` | — | ↪ `/login` | ↪ `/decks` | ↪ `/decks` | — | — |
| `/login`, `/register` | Đăng nhập / Đăng ký | ✅ | ↪ `/decks` | ↪ `/decks` | AuthLayout | MobileShell, không bottom nav |
| `/change-password` | Đổi mật khẩu (bắt buộc hoặc tự chọn) | ↪ `/login` | ✅ | ✅ | AuthLayout (forced) / DesktopShell | MobileShell, footer sticky |
| `/decks` | Bài của tôi | ↪ `/login?next=` | ✅ | ✅ | Lưới thẻ + tab + tìm kiếm + phân trang | Danh sách hàng + ActionSheet; bottom nav "Bài của tôi" |
| `/public` | Thư viện công khai | ↪ login | ✅ | ✅ | như trên (menu chỉ đọc) | như trên; bottom nav "Công khai" |
| `/create` | Tạo bằng AI | ↪ login | ✅ | ✅ | Tab nguồn, MUpload `block` nhiều tệp (tổng ≤ 300MB, tiến trình tải lên qua `uploadForm` XHR), RatioPicker, TonePicker, số trang Tự động/Tuỳ chỉnh (MRadioGroup), footer sticky | Back → `/decks`, không bottom nav, footer Hủy/Tạo, TonePicker `compact` |
| `/p/:id/edit` | Trình soạn thảo | ↪ login | ✅ chủ sở hữu (không phải chủ → thông báo + nút Xem) | như user | 3 cột: danh sách trang · preview · panel sửa | Preview trên, dải trang ngang, form dưới, màn con "Thiết lập bài" |
| `/p/:id/view` | Trình chiếu | ↪ login | ✅ chủ sở hữu hoặc bài public | như user | Toolbar Prev/Next, toàn màn hình, tải xuống | Footer Prev/Next/Chỉnh sửa hoặc Nhân bản |
| `/account` | Tài khoản | ↪ login | ✅ | ✅ (+ lối vào Quản trị) | DesktopShell | Bottom nav "Tài khoản"; link đổi mật khẩu, quản trị, đăng xuất |
| `/admin/users` | Quản lý người dùng | ↪ login | 🚫 `/403` | ✅ | MDataTable + dialog | Danh sách thẻ + ActionSheet + sheet tạo |
| `/403` | Không có quyền | — | ✅ | ✅ | DesktopShell | MobileShell |
| `/:pathMatch(.*)*` | 404 | ✅ | ✅ | ✅ | DesktopShell | MobileShell |

Guard bổ sung: `mustChangePassword=true` → mọi route (trừ `allowMustChange`) ↪ `/change-password`. `?next=` chỉ nhận đường dẫn nội bộ (`safeNext` chặn open redirect).

### Quy tắc mobile đã áp dụng (MDS mobile composition)

- Gốc `.mds-mobile-app`; MMobileTopBar (Back ở màn gốc → `exitToHost()`); MMobileBottomNav 4 mục: Bài của tôi / Công khai / **Tạo bài** (nút nổi giữa) / Tài khoản.
- Footer sticky: Hủy bên trái, nút chính bên phải; vùng chạm ≥ 44px (hàng ActionSheet 52px).
- Menu ngữ cảnh dùng `mobile/ActionSheet.vue` (bottom sheet tự viết vì MDS chưa có): phát `select` **trước** khi đóng, Esc đóng, trả focus.
- Admin vào từ trang Tài khoản (không có mục admin trên bottom nav).

### Chưa kiểm chứng

- Chạy thật trong host MISA AMIS (adapter `window.MISAAmisHost.close()` chỉ là giả định giao diện, **chưa kiểm chứng** với host thật).
- Safe-area (tai thỏ/home indicator) trên thiết bị iOS/Android thật — **chưa kiểm chứng**.
- Cử chỉ vuốt (swipe back, vuốt giữa các slide trong iframe) — **chưa kiểm chứng**.
- Trình đọc màn hình của hệ điều hành (VoiceOver/TalkBack) — **chưa kiểm chứng**; mới kiểm tra nhãn/role ở mức DOM.

Đã kiểm chứng (puppeteer + browser pane, 2026-10-05): mọi route ở 390px và 1440px không cuộn ngang; luồng đăng ký → tạo bài → sửa trên mobile → Lưu → xem lại.

## Trình soạn thảo (`useEditor` + `SlideFields`)

- `SlideFields.vue` sinh form theo layout: kicker, tiêu đề, highlight (phải nằm trong tiêu đề), subtitle, caption, tags (phân tách dấu phẩy), icon (combobox), quote, danh sách stats/items/steps/columns (thêm/xoá/di chuyển), ImagePicker (tải ảnh mới hoặc chọn ảnh đã có trong bài), gallery, ghi chú. Lỗi độ dài tính từ `SPEC_LIMITS` ngay khi gõ.
- Đổi layout (`change-layout`) dùng `lib/slideModel.js` để chuyển dữ liệu sang hình dạng của layout mới mà không mất nội dung chung.
- Preview là iframe `sandbox="allow-scripts allow-popups"` trỏ `/api/presentations/:id/preview?v=<specVersion>`; đồng bộ trang qua `postMessage` (`deck:goto` từ app, `deck:slide` từ engine) — `useDeckFrame`.
- Engine thêm `body.embed` khi chạy trong iframe → ẩn HUD của engine; ứng dụng tự vẽ nút Prev/Next.

## Trình bày (deck renderer — `shared/deck/`)

- `render.js`: spec → HTML (escape mọi chuỗi), 13 layout, 4 theme, `mode: present|print`.
- `engine.js`: điều khiển trang (phím mũi tên/Space/PageUp/Down, chạm, HUD), hiệu ứng spring, đếm số, vẽ đường, nền động; mode print tắt chuyển động.
- `theme.css`: biến màu theo theme, bố cục theo tỷ lệ; font `InterVariable.woff2`.
- `icons.js`: tập icon SVG nội tuyến (dùng chung server + editor).
