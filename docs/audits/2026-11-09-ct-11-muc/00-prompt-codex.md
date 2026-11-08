# Prompt gửi Codex — audit độc lập "Cải tiến 11 mục" (CT)

> Dán nguyên phần dưới đường kẻ cho Codex. Kết quả Codex ghi vào chính thư mục này (`docs/audits/2026-11-09-ct-11-muc/`).

---

Bạn là **kiểm định viên độc lập** cho dự án **MISA Presentation** (repo hiện tại: `/Users/tuanbui/MISA-HTML-presentation`). Một agent khác vừa làm xong
"Cải tiến 11 mục" (CT) qua 5 đợt. Nhiệm vụ của bạn: **audit chỉ đọc**, tìm lỗi thật có bằng chứng, xếp mức độ, đề xuất cách sửa. **Không tin** tài liệu hay
commit message — mọi kết luận phải dựa trên mã nguồn, test bạn tự chạy, hoặc thao tác thật trên Docker.

## 1. Phạm vi

- Nhánh `feature/cai-tien-11-muc`, so với gốc `main` = `827da35`. Xem toàn bộ: `git log --oneline 827da35..HEAD` và `git diff 827da35..HEAD`
  (~111 tệp, +7.1k dòng). 5 commit:
  | Commit | Đợt | Mục |
  |---|---|---|
  | `73eda47` | 1 | 4, 5, 9, 10 (+ thư mục lồng nhau "Bài của tôi") |
  | `704918a` | 2 | 6, 7 |
  | `12b718c` | 3 | 1, 2 |
  | `a3e3e81` | 4 | 3 |
  | `80c22d2` | 5 (5a + 5b) | 8, 11 |
- Yêu cầu gốc + kế hoạch: `docs/ROADMAP.md` mục **CT**. Cách làm thật: `memory-bank/05-business-logic.md` §26–§30, `memory-bank/06-frontend-architecture.md`,
  bẫy kỹ thuật `memory-bank/09-technical-traps.md`, lịch sử + số liệu kiểm chứng tự khai `memory-bank/10-development-history.md` (5 mục đầu).
- Đọc trước: `CLAUDE.md`, `memory-bank/README.md`, `memory-bank/11-coding-rules.md`, `memory-bank/08-security-model.md`.

### 11 mục cần nghiệm thu
1. **Giữ nguyên nội dung + số trang** theo nguồn; nguồn > 40 trang → từ chối (`src/services/pageSource.js`, `geminiService`, `outlineService`).
2. **Nhập bài trình bày HTML** làm ở công cụ khác: "giữ nguyên thiết kế" (trang tự do, tách video nhúng) hoặc "chuyển thành bài sửa được"
   (`htmlDeckService.js`, `htmlDeckPage.js`, `browserService.inspectHtmlDeck`, job `importHtmlDesign`).
3. **Video**: YouTube + Vimeo + tải lên ≤ 200 MB, ffprobe/ffmpeg nén nền, tự phát / toàn màn hình / tắt tiếng, căn + cỡ (`videoService.js`,
   `videoOptimizer.js`, `vimeoService.js`, `shared/deck/video.js`, route `POST /:id/video-link`, `GET /:id/videos/:assetId`, changelog `20261108_200000`,
   Dockerfile cài ffmpeg, CSP).
4. **Bôi chọn chữ trang kết** không mất chữ (trình soạn thảo trực tiếp).
5. **Bấm ảnh xem toàn màn hình** khi trình chiếu.
6. **Ảnh**: kéo-thả / dán, di chuyển, bo góc, đổ bóng, màu viền (`useImageDrop`, `dropRect`, `shared/deck/imgstyle.js`, `ImageEditor`/`ImageStudio*`).
7. **Lớp phủ màu + độ mờ** cho ảnh.
8. **Bố cục**: kiểu danh sách mới (đổi bố cục giữ nội dung, số cột), ảnh nhấn + điểm lấy nét, hộp chú thích, sơ đồ (2×2, Venn, chu trình, đồng tâm, bia,
   A vs B), **biểu đồ có bảng dữ liệu** (`shared/deck/variants.js`, `render.js`, `blocks.js`, `chart.js`, `chartView.js`, `ChartFields.vue`,
   `StylePicker.vue`, `stylePreviews.js`).
9. **Chọn mẫu thiết kế được chia sẻ** khi tạo bài (`templateService`, `useCreate`).
10. **Rà lỗi bố cục tự động** `npm run audit:layout` (`scripts/layout-audit.mjs`).
11. **Chuyển trang** cả bài + riêng trang (`engine.js`, `theme.css`, `blocks.js`).
- Kèm: **thư mục lồng nhau** (`folders`, changelog `20261108_100000`, `folderService`/`folderRepository`/`folderRoutes`, `FolderDialogs`, `useFolders`).

## 2. Chuẩn đối chiếu (bắt buộc)
- Backend: **MISA Backend Standard** — `~/.claude/skills/misa-backend-standard` (nguồn `/Users/tuanbui/BackEnd.SKILL`). Nếu máy không có, dùng
  `~/.claude/skills/xoan-backend-standard` (nội dung giống hệt).
- Giao diện: **MDS 2.0** — `~/.claude/skills/misa-design-system`; ứng dụng chạy độc lập (bỏ 9 chấm/AVA/chat/thông báo); **mọi route phải có giao diện
  desktop (`frontend/src/desktop/`) và mobile native riêng (`frontend/src/mobile/`)**, không chấp nhận "desktop co lại".
- Quy tắc riêng dự án (`CLAUDE.md`, `memory-bank/11`): mọi truy vấn theo tenant qua `tenantClause`; spec luôn qua `normalizeSpec` + `dropForeignAssets`;
  mọi chuỗi vào HTML qua `esc()`.

## 3. Trọng tâm rủi ro — kiểm từng giả thuyết, ghi rõ ĐÚNG/SAI kèm bằng chứng
**Bảo mật + cô lập tenant**
- IDOR: người dùng B đọc/sửa/xoá được tài nguyên của A? Kiểm `GET /:id/videos/:assetId` (asset thuộc bài khác/tenant khác), `POST /:id/video-link`,
  folder (`parentId`/`folderId` của tenant khác, `move-decks` với `ids` lẫn bài người khác), mẫu thiết kế đã thôi chia sẻ (mục 9), asset trong spec
  (`dropForeignAssets` có bao hết `video.asset`, `image.asset`, `elements[]`, ảnh mục, QR…?).
- SSRF / mạng: oEmbed Vimeo/YouTube (host có bị cố định? redirect? timeout? cỡ phản hồi?), link nhập HTML/web.
- **HTML lạ chạy trong Chromium** (mục 2): sandbox, chặn mạng ra ngoài / `file://` / IP nội bộ, giới hạn thời gian + bộ nhớ, `blob:` mở ở đâu, mã trong
  `htmlDeckPage.js` có tin dữ liệu trang lạ không; chữ/thuộc tính lấy từ trang lạ có được escape khi đưa vào spec/HTML không (XSS lưu trữ).
- **ffmpeg/ffprobe**: tham số có thể bị chèn (tên tệp, metadata)? Có dùng shell không? Giới hạn thời gian/CPU, tệp tạm có dọn khi lỗi/khởi động lại,
  MIME giả (chữ ký `ftyp` + rác) có bị chặn, video 200 MB × nhiều người cùng lúc → đĩa/RAM, hàng nén có giới hạn đồng thời, resume sau restart có lặp vô hạn.
- Tải lên + dán ảnh: giới hạn cỡ/loại phía server (không chỉ phía client), SVG/HTML giả ảnh.
- XSS: tên chuỗi/hạng mục biểu đồ, nhãn sơ đồ, chú thích (`callout`), tên thư mục, tên video, `aria-label`, `v-html` trong `StylePicker` (chỉ được là hằng).
- CSP sau khi thêm Vimeo/`media-src`/`blob:` — có nới quá mức cần thiết?
**Đúng nghiệp vụ + dữ liệu**
- Thư mục: chặn vòng lặp cha-con, giới hạn độ sâu/số lượng, xoá thư mục chuyển bài + thư mục con lên cha trong **transaction**, race 2 thao tác song song.
- Changelog DB: idempotent, chạy lại an toàn, khớp `schema.sql`, có rollback/hướng dẫn.
- Mục 1: đếm trang đúng với PDF/PPTX/DOCX/văn bản `---`/HTML; > 40 trang từ chối **trước** khi tốn lượt AI.
- Mục 8: `cleanChart`/`parseNum` (số kiểu vi/en, số rất lớn, NaN, `1e999`, chuỗi rất dài), `FITS`/`resolveVariant` không để trang vỡ, đổi bố cục không mất
  hoặc nhân đôi dữ liệu; AI (`artDirect`) không bao giờ chọn kiểu trong `MANUAL_VARIANTS`.
- Mục 11: chuyển trang lùi/tiến nhanh, `prefers-reduced-motion`, không chạy trong khung soạn thảo/PDF/thumbnail.
- Bản HTML xuất offline + PDF: đủ khối mới, video/biểu đồ chạy offline, không gọi mạng ngoài ngoài ý muốn.
**Giao diện**
- Desktop + mobile cho mọi màn đã sửa (Tạo bài, Dàn ý, Trình soạn thảo, Xem/Trình chiếu, Bài của tôi + thư mục): đúng MDS, vùng chạm 44px trên mobile,
  không cuộn ngang ở 390px, trạng thái rỗng/đang tải/lỗi, khả năng tiếp cận (nhãn, `role`, bàn phím).
**Chất lượng**
- Test có thật sự kiểm hành vi hay chỉ kiểm chuỗi CSS; ca thiếu quan trọng; mã chết; trùng lặp; lỗi đồng bộ (race) trong `useEditor`/`useLiveDeck`.

## 4. Cách chạy (được phép)
- `npm ci` (nếu cần), `npm test` (unit), `npm run build`, `npm run audit:layout`.
- Docker local cổng **8088**: `docker compose up -d --build app` (sau `npm run build`); smoke:
  `SMOKE_BOOTSTRAP=1 BASE=http://localhost:8088 node test/smoke/smoke.mjs`. Integration (`test/integration/`, MySQL thật DB tạm `_it`) — xem `test/integration/README.md`.
- Tài khoản thử: `tmp/e2e-user.json` (gitignore). **Không in, không chép, không ghi mật khẩu vào báo cáo.** Đăng nhập qua `GET /api/auth/csrf`
  (token ở `data.token`) rồi `POST /api/auth/login`. Script tham khảo (chỉ có trên máy này): `tmp/e2e-dot3.mjs`, `tmp/e2e-dot4.mjs`, `tmp/ui-dot4.mjs`,
  `tmp/e2e-dot5.mjs`, `tmp/ui-dot5.mjs`, `tmp/e2e-dot5b.mjs`, `tmp/ui-dot5b.mjs <code> <id> [mobile]`. Thử IDOR: tạo tài khoản thứ 2 theo cách smoke đang
  làm (`SMOKE_BOOTSTRAP`) và dọn sau khi xong.
- Tệp mẫu nhập HTML (mục 2): `/Users/tuanbui/Downloads/MISA_Xu_huong_lua_dao_va_Phan_xa_an_toan-4.html` (137 MB, 38 trang, 5 video).

## 5. Ràng buộc (cứng)
- **Chỉ đọc mã nguồn.** Không sửa tệp trong repo ngoài thư mục báo cáo `docs/audits/2026-11-09-ct-11-muc/`. Không `git commit`/`push`/`merge`/`rebase`/`reset`.
  Script thử nghiệm của bạn để trong `tmp/` (gitignore).
- **Không đọc/in/ghi secret**: `.env`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `SESSION_SECRET`, khoá service account, mật khẩu tài khoản thử.
- Không deploy Cloud Run, không gọi môi trường production. Hạn chế gọi Gemini thật (tốn phí) — chỉ khi cần chứng minh một lỗi, và ghi rõ đã gọi bao nhiêu lần.
- **Không ghi tên bất kỳ sản phẩm bên ngoài nào** mà dự án có thể đã tham khảo vào báo cáo; chỉ mô tả hành vi.
- Mọi dữ liệu thử bạn tạo trên Docker (bài, thư mục, tài khoản, video) phải dọn sau khi xong, hoặc liệt kê ra để chủ dự án dọn.

## 6. Mức độ
- **P0** — mất/lộ dữ liệu, vượt tenant, RCE/SSRF/XSS lưu trữ khai thác được, hỏng DB/migration. Chặn merge.
- **P1** — sai nghiệp vụ chính của 1 trong 11 mục, crash/treo job, rò tài nguyên (đĩa, tiến trình ffmpeg/Chromium), vi phạm chuẩn bắt buộc (tenant, escape,
  thiếu mobile cho route). Phải sửa trước merge.
- **P2** — lỗi biên, UX/MDS/a11y, thiếu test quan trọng. Sửa trong đợt kế.
- **P3** — gợi ý, dọn mã.

## 7. Đầu ra (ghi vào `docs/audits/2026-11-09-ct-11-muc/`)
1. `01-audit.md`:
   - Tóm tắt 10 dòng: kết luận **có nên merge `main` không**, số finding theo mức.
   - Bảng nghiệm thu 11 mục (+ thư mục): Đạt / Đạt có điều kiện / Không đạt, mỗi dòng 1 câu lý do + ID finding liên quan.
   - Danh sách finding, mỗi finding: `ID` (CT-001…), mức, mục (1–11/thư mục), tiêu đề, **bằng chứng** (`đường/dẫn:dòng` + trích ≤ 10 dòng, hoặc lệnh +
     kết quả thật), **cách tái hiện**, tác động, đề xuất sửa cụ thể, test nên thêm. Phân biệt rõ **"đã chứng minh"** và **"nghi ngờ, chưa chứng minh"**.
   - Giả thuyết ở mục 3 đã kiểm mà **không** phải lỗi (để không bị kiểm lại).
2. `02-bang-chung.md`: lệnh đã chạy + kết quả (unit, build, audit:layout, smoke, script riêng), phiên bản commit đã audit (`git rev-parse HEAD`).
3. `03-ke-hoach-sua.md`: thứ tự sửa đề xuất (P0 → P1 → P2), gom theo tệp/đợt, ước lượng công, test gate cho từng nhóm.

Viết báo cáo bằng **tiếng Việt**. Ngắn gọn, mỗi kết luận có bằng chứng; không đoán.
