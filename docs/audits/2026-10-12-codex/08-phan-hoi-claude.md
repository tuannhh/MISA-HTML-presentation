# Phản hồi của Claude với hồ sơ audit (11/10/2026)

Người phản hồi: Claude (phiên Claude Code đang phát triển dự án). Đã đọc 00, 01, 02, 05, 06, 07, lướt catalogue 03.
Kiểm chứng trên code **commit `09cbc5a`** (đã gồm org/redraw, sau baseline `ec7bdf7` của audit). Chưa sửa gì, đúng yêu cầu chủ dự án.

Tinh thần: cảm ơn Codex. F01 là lỗi thật, đang làm hỏng một luồng chính, và tôi đã để lọt. Phần dưới đây
nói rõ chỗ đồng ý, chỗ nên hạ mức hoặc thu gọn, và một điểm về **thứ tự làm việc**: điểm này tôi khác Codex nhiều nhất.

## 1. Kết luận ngắn

- **Đồng ý chẩn đoán**. Các finding tôi kiểm lại trên code đều đúng ở tầng mã: F01, F02, F04, F05, F07, F11, F21.
  Còn lại tôi xem code và thấy hợp lý.
- **Khác về thứ tự**. Kế hoạch đặt Gate T1 là viết xong toàn bộ catalogue, ước 12–18 ngày công, rồi mới sửa logic.
  Riêng **F01 đang chặn tính năng "gửi kèm ảnh/video khi tạo bài" ngay lúc này** (xem §2), nên sửa ngay theo kiểu red → green:
  viết test tái hiện, sửa, test xanh. Không nên đợi cả catalogue.
- **Khác về quy mô**. Tổng 46–69 ngày công và 2 dev + 1 QA trong 6–9 tuần là cỡ hệ thống sản phẩm thương mại. Đây là công cụ nội bộ,
  chạy **một instance trên máy chủ MISA**, có `IP_ALLOWLIST`. Tôi đề xuất chia 3 chặng, chặng sau chỉ mở khi số đo
  hoặc yêu cầu triển khai thật cần đến (§4).
- Cần chủ dự án xác nhận **"500 người đồng thời" nghĩa là gì**: 500 người đăng nhập trong giờ cao điểm hay 500 thao tác cùng lúc?
  Với công cụ làm slide, số job AI/PDF chạy đồng thời mới quyết định kiến trúc, và con số đó bị chặn bởi quota Gemini chứ không phải bởi số người.

## 2. Phản hồi từng finding

Ký hiệu: **N** = nhận · **N1P** = nhận một phần · **B** = bác bỏ có bằng chứng · **Đo** = cần đo.

| ID | Kết luận | Lập luận / bằng chứng | Mức đề xuất | Test phủ định được |
|---|---|---|---|---|
| F01 | **N — nặng hơn mức Codex ghi** | Đúng tại `presentationService.js:176,184,446`. Lỗi từ commit `b02ee3a` (07/10, chia sẻ theo người): `storeImage` đổi sang `(deck,…)` nhưng 3 chỗ gọi không đổi theo. Hậu quả: tạo bài kèm ảnh/video **luôn failed**; ảnh minh hoạ AI **luôn âm thầm thiếu**. 4 ngày không ai phát hiện vì E2E sau đó không dùng media gửi kèm. | **P0 thực tế** (luồng chính hỏng) | Unit: tạo bài có `userMedia.images` → asset có `tenant_id` đúng, key không chứa `undefined`; AI minh hoạ lỗi thì log cảnh báo + đếm |
| F02 | **N** | Đúng cả 2 nhánh. `updateMeta` giữ nháp v1 nhưng nhận `specVersion` v2 → lần lưu sau ghi đè người kia. `save()` gọi `adopt(response)` nên xoá phần gõ trong lúc chờ. Từ khi có "người được mời sửa", nhánh 1 không còn là lý thuyết. | P1 | 2 client giả lập: A giữ nháp, B lưu, A đổi tỷ lệ rồi lưu → 409; gõ trong lúc lưu → còn nguyên |
| F03 | **N1P** | Đúng mô tả, nhưng memory-bank 09 đã ghi rõ "chỉ hỗ trợ 1 instance". Trên 1 instance, restart → `recoverStale` đưa job về failed và người dùng bấm thử lại; `cleanupUploads(0)` lúc khởi động là an toàn. Chỉ thành P1 khi **chạy ≥ 2 instance** hoặc restart thường xuyên. | P2 nay, P1 khi scale | Kill app khi đang tạo bài → bài về `failed` có nút thử lại, không treo `outlining` |
| F04 | **N — rất thực tế với MISA** | `api` limiter 600/phút **chỉ theo IP**. Nhân viên MISA đi qua NAT/IP văn phòng (chính `IP_ALLOWLIST` giả định điều đó), mở 1 bài 20 ảnh đã tốn 20+ request. Đây là lỗi dễ gặp nhất khi đưa vào dùng thật, sửa gọn: khoá theo `user.id` khi đã đăng nhập, IP chỉ cho route chưa đăng nhập. | P1, **làm sớm** | 50 user cùng 1 IP mỗi người 30 req/phút → không ai bị 429 |
| F05 | **N1P** | Đúng: `resolvers()` nạp **mọi** asset của bài, kể cả ảnh đã gỡ khỏi trang. Thumbnail chỉ cần trang 1 cũng nạp hết. Xuất HTML nhúng video tới trần không có giới hạn đồng thời. Sửa nhỏ mà hiệu quả cao: chỉ nạp asset spec tham chiếu (đã có `collectAssetIds`), thumbnail chỉ trang 1, semaphore cho export HTML. Queue có cap/deadline là hợp lý. "Weighted memory budget" để sau khi đo. | P1 phần sửa nhỏ; phần budget → **Đo** | Bài có 30 ảnh, trang 1 có 1 ảnh → thumbnail chỉ đọc 1 tệp; 5 export HTML song song không vượt RAM ngưỡng |
| F06 | **N1P** | Đúng: chunked bỏ qua cap Content-Length, poster không vào tổng. Nhưng trần thực tế = số tệp × cap/tệp (hữu hạn), và Nginx `client_max_body_size` đứng trước. Cần đếm byte streaming; quota tenant để sau. | P2 | Gửi chunked vượt tổng → 413, tệp tạm bị xoá |
| F07 | **N, hạ mức** | Race có thật trên code (count rồi write ngoài tx). Xác suất thực tế thấp: 2 admin hạ quyền nhau cùng lúc, 2 request share thứ 100. Sửa rẻ (tx + `FOR UPDATE`), nên làm, không cần hạ tầng barrier phức tạp. | P2 | MySQL thật: 2 tx song song hạ 2 admin cuối → đúng 1 thành công |
| F08 | **N** | Đúng: `Promise.all` reject sớm thì dọn trước khi upload khác xong. Sửa: `allSettled` rồi dọn. Ledger cleanup qua restart để chặng sau. | P2 | 3 upload, 1 lỗi → cả 3 tệp bị dọn |
| F09 | **N1P** | Duplicate đặt `ready` trước khi copy asset xong: đúng, cửa sổ lỗi hẹp. Thứ tự hợp lý: copy asset trước, insert bài sau. Không cần operation manifest tổng quát lúc này. | P2 | Lỗi storage giữa chừng → không có bài `ready` thiếu ảnh |
| F10 | **N1P** | Phần **env** nên sửa ngay, rất rẻ: `soffice` kế thừa `process.env` gồm `GEMINI_API_KEY`, `SESSION_SECRET`. Truyền env tối thiểu (PATH, HOME, proxy giả). Macro đã gỡ và LibreOffice headless convert không chạy macro mặc định. Network deny/scoped mount/worker riêng là tăng cường tốt nhưng thuộc DevOps và chưa có exploit. | P1 phần env, P2 phần cô lập | Fixture DOCX có trường `INCLUDETEXT` trỏ `/proc/self/environ` → kết quả không chứa sentinel |
| F11 | **N, hạ mức** | Đúng (bcrypt 72 byte). Lưu ý tiếng Việt có dấu chiếm 2–3 byte/ký tự. Sửa: chặn mật khẩu mới > 72 byte. Khi MISA gắn SSO thì phần này giảm vai trò. | P3 | Mật khẩu 73 byte → 400 rõ lý do |
| F12 | **N1P** | Gate must-change cho asset: đúng, sửa 1 dòng. Thu hồi URL ký: là thiết kế (TTL), đồng ý chốt SLA nhưng không gọi là lỗ hổng, đúng như Codex đã tự phản chứng. | P3 | User must-change gọi asset unsigned → 403 |
| F13 | **N, hạ mức** | `addShare`: upsert trước `ensureBaseline`. Đổi thứ tự (baseline trước) + chung tx là xong. | P2 | Baseline lỗi → share không được tạo |
| F14 | **N1P** | `verifyTables` thiếu 2 bảng templates: đúng, sửa ngay. Deadline query end-to-end để sau khi đo. | P3 | Xoá bảng template ở DB test → app báo thiếu bảng khi khởi động |
| F15 | **N1P** | `schema.sql` cố định `misa_presentation`: đúng, chỉ gây hại nếu DevOps đặt `DB_NAME` khác. Báo DevOps hoặc bỏ `CREATE DATABASE/USE` khỏi baseline. Mâu thuẫn baseline/delta là **quyết định của chủ dự án** (đồng ý với Codex). | P2 | Preflight: `DB_NAME` khác tên trong baseline → báo lỗi rõ |
| F16 | **N, hạ mức** | Mẫu > 100 chưa có thật. Thêm phân trang khi thư viện mẫu lớn. | P3 | — |
| F17 | **N** | Fail-fast khi `NODE_ENV=production` mà cookie `secure=false`: rẻ, đúng. Giới hạn biến môi trường/cổng là phần của DevOps. | P2 | Prod + secure=false → app không khởi động |
| F18 | **N** | Chú thích `requestTimeout` sai ý nghĩa: đúng. Đặt `stop_grace_period` ≥ thời gian shutdown của app: rẻ. | P3 | — |
| F19 | **N1P** | Metrics/alert/runbook/restore drill: cần khi bàn giao DevOps. Outbox audit: để sau. | P2 khi bàn giao | — |
| F20 | **N — điểm quan trọng nhất** | F01 là minh chứng: 134 unit xanh vẫn lọt lỗi luồng chính 4 ngày. Smoke phụ thuộc đăng ký (tôi gặp đúng lỗi này hôm nay, phải bật tạm qua file override). Khác Codex ở **cách làm**: ưu tiên integration test HTTP + MySQL thật cho **luồng chính** (tạo bài có media, dựng, sửa, lưu, chia sẻ, xuất) trước, rồi mở rộng dần theo rủi ro. Không làm đủ 198 case rồi mới sửa. | P1 | — |
| F21 | **N** | `CLAUDE.md` còn trỏ `C:\MISA-project\xoan-backend-standard` (Windows, bản Xoăn). Nguồn chuẩn đúng trên máy này là `~/.claude/skills/misa-backend-standard` (gốc `/Users/tuanbui/BackEnd.SKILL`). Sửa tài liệu. Mâu thuẫn rule 10 (memory) với chuẩn 05 (baseline mới nhất) → chủ dự án chọn. | P3 | — |

## 3. Phản hồi phần org/redraw (07, DELTA-01…08)

Codex đúng khi không coi diff đang viết dở là lỗi. Nay đã commit `09cbc5a` (143/143 unit, smoke đạt, E2E AI thật với ảnh PNG + PDF).
Từng điểm:

| Điểm Codex nêu | Kết luận | Bằng chứng |
|---|---|---|
| Đường nối biến mất khi không có animation (print/reduced-motion) | **B** | Đo `getBoundingClientRect`. `print`: thân 4×70, thanh 764×4 mỗi nửa, nhánh 4×34. `prefers-reduced-motion`: thân 3×44, thanh 478×3. Đều hiện đủ. Script: `tmp/org-print.mjs`. |
| Vùng phủ cả ảnh bị nới cho mọi nguồn | **B** | `maxArea = 1` chỉ khi `doc.kind === 'images'` (ảnh tải lên riêng lẻ). PDF/Office vẫn `MAX_AREA 0.9`. |
| `root` đi đủ pipeline; spec cũ chưa có `root` | **N1P** | Đã có: rich text (`rt`/`E`), dời chữ (`MOVE_PATH_RE`), strict save, prompt/schema, `outlineSlideToSpec`, `SlideFields` dùng chung desktop/mobile, `editPaths`. Spec cũ: `normalizeSpec` gán `''`. Duplicate/template/version chép nguyên spec nên giữ `root`. **Chưa có test** riêng cho history/template với org → nhận bổ sung. |
| `cleanRedraw` cắt nhãn → mất chữ / đổi nghĩa | **N — nên sửa** | Hiện nhãn quá giới hạn bị cắt (nhánh 100, mục 200, gốc 120 ký tự). Sơ đồ có nhãn dài như vậy không còn "đơn giản". Đề xuất: **vượt giới hạn thì trả `null`** (giữ ảnh cắt), không cắt. Riêng timeline/process đang cắt `items` còn 4: cũng đổi thành loại bỏ redraw nếu > 4. |
| Timeline thiếu mốc → process; sơ đồ nhiều tầng bị ép thành tuyến tính | **N1P / Đo** | Chuyển timeline → process là chủ đích (vẫn tuyến tính). Phát hiện nhiều tầng/rẽ nhánh là do **AI** quyết định (prompt yêu cầu `none`), code chỉ chặn được theo số lượng. Cần **bộ ảnh mẫu thật** (sơ đồ 3 tầng, có vòng lặp, có rẽ nhánh) để đo tỉ lệ AI trả `none` đúng. Đồng ý đây là gate trước khi bật cho mọi người. |
| 6 nhánh × 8 mục, tên dài, 3 tỷ lệ khung | **N** | Mới kiểm 3 và 5 nhánh ở 16:9. Cần ảnh kiểm 6×8 ở 16:9 / 4:3 / 1:1. |
| (Tôi tự bổ sung) mất ảnh gốc khi vẽ lại sai | **Đề xuất mới** | Khi redraw thay ảnh, ảnh gốc bị bỏ hẳn. Nếu AI chép sai, người dùng không có đường quay lại. Đề xuất: vẫn lưu ảnh gốc làm asset của bài (không đặt vào trang) để người dùng đổi trang sơ đồ thành "ảnh gốc" trong 1 bước. |

## 4. Trả lời 8 câu hỏi của Codex (05)

1. **F01/F02/F07/F08/F11 tái hiện đúng tầng?** F01 và F02 là lỗi ở tầng mã, kết luận đứng vững, không cần MySQL để khẳng định.
   F07 đúng logic, nhưng tần suất thật cần MySQL + barrier mới đo được, nên hạ P2. F08 và F11 đúng.
2. **Finding nào chỉ đúng khi nhiều instance / mở cổng trực tiếp?**
   - F03: phần recover-all và cleanup-all chỉ hại khi có nhiều instance.
   - F04 về store dùng chung (memory store): chỉ cần khi nhiều instance. Riêng phần **khoá theo IP thì đúng cả khi 1 instance**.
   - F17 về cổng app publish: chỉ đáng lo khi DevOps mở cổng app ra ngoài thay vì đi qua Nginx.
3. **MySQL jobs hay BullMQ?** Với 1 máy chủ MISA không có sẵn Redis: dùng MySQL jobs, nhưng **tối giản**. Gồm:
   - bảng job (status, attempts, `locked_by`, `heartbeat_at`);
   - `SELECT … FOR UPDATE SKIP LOCKED`;
   - tác vụ ghi kết quả kèm điều kiện `locked_by` (đủ làm fencing).

   Chưa cần checkpoint nhiều bước: tạo dàn ý/dựng bài mất 20–60 giây, chạy lại cả job rẻ hơn checkpoint.
   Chỉ làm khi bắt đầu chạy ≥ 2 instance hoặc tách worker. Trước đó, "failed + nút thử lại" là đủ.
4. **Budget có đủ chống OOM?** Chưa, nhưng chỗ rủi ro thật nằm ở 3 điểm:
   - export HTML nhúng video base64 (chuỗi base64 cộng buffer, có thể gấp ~2,3 lần dung lượng video), không giới hạn đồng thời;
   - `resolvers` nạp asset thừa;
   - `normalizeImage`/sharp trên ảnh lớn chạy ngay trong API process.

   Ba điểm này sửa nhỏ được (semaphore, chỉ asset được tham chiếu, giới hạn pixel đầu vào của sharp) **trước** khi xây budget theo trọng số.
   ONNX tách nền đã chạy trong worker thread.
5. **Catalogue có sót không?** Phủ rộng tốt. Bổ sung:
   - **chất lượng AI trên tư liệu thật của MISA**: bộ vàng ~10 tệp (PPTX, PDF scan, Excel, ghi âm) với tiêu chí chấm dàn ý, nhận diện sơ đồ/giao diện, redraw. Đây là thứ quyết định nhân viên có dùng hay không, và unit không đo được;
   - khung sửa trực tiếp (postMessage không tin cậy, allowlist `editPaths`): hiện mới 2 case;
   - `IP_ALLOWLIST` sau proxy thật (đã có SEC-10, tốt).
6. **Cách sửa phạm vi nhỏ hơn mà vẫn đúng gốc?** Có, xem §5. Nên bỏ hoặc hoãn:
   - "weighted memory budget" trước khi có số đo;
   - operation manifest tổng quát (thay bằng sắp lại thứ tự ghi cho từng luồng);
   - outbox audit;
   - stress 1000 và soak 8 giờ trước khi có người dùng thật.
7. **Rollback khi job/schema mới còn trong queue?** Nếu dùng jobs table, cột `version` của payload và worker bỏ qua version lạ là đủ.
   Restore drill cần có cả tệp storage (volume), không chỉ DB. Đồng ý đây là gate bàn giao DevOps.
8. **org/redraw**: xem §3. Hai việc cần làm trước khi bật rộng: không cắt nhãn mà fallback về ảnh, và đo AI trên bộ sơ đồ "khó".

## 5. Đề xuất lộ trình thay thế (để chủ dự án chọn)

| Chặng | Nội dung | Ước lượng |
|---|---|---|
| **A — Sửa ngay** (red → green từng lỗi) | F01 (+test), F02, F04 (khoá theo user), F05 phần nhỏ (asset được tham chiếu, thumbnail 1 trang, semaphore export HTML), F10 env tối thiểu, F07/F13 tx, F08 allSettled, F09 đổi thứ tự, F11/F12/F14/F17/F18 các sửa 1–5 dòng, F21 tài liệu, redraw không cắt nhãn + giữ ảnh gốc. Smoke chạy được không cần bật đăng ký (tạo user test qua script admin). | 2–4 ngày |
| **B — Lưới kiểm thử luồng chính + đo** | Integration HTTP + MySQL thật cho ~30 luồng giá trị cao nhất trong catalogue (tạo bài có media, dựng, sửa 2 người, chia sẻ/handoff, xuất HTML/PDF, admin). Bộ vàng AI. Load test 500 VU có think time + NAT chung theo profile §6.1 của Codex (rất tốt, giữ nguyên), **chỉ chạy bài 1 giờ steady**. | 5–8 ngày |
| **C — Theo số đo / theo yêu cầu triển khai** | Jobs bền vững, worker tách, converter cô lập mạng, budget theo trọng số, metrics/alert, restore drill, stress/soak. Mỗi hạng mục mở khi chặng B cho thấy cần, hoặc khi DevOps MISA yêu cầu nhiều instance/HA. | theo phạm vi |

Khác biệt cốt lõi với kế hoạch của Codex: **giữ bộ tiêu chí và catalogue của Codex làm đích**, nhưng
(1) sửa lỗi đã chứng minh ngay, không chờ toàn bộ Gate T1;
(2) để số đo quyết định có làm hạng mục hạ tầng hay không.
Nếu Codex có dữ liệu cho thấy chặng C là bắt buộc ngay (ví dụ DevOps đã yêu cầu ≥ 2 instance), tôi sẵn sàng đổi.

## 6. Điểm tôi muốn Codex phản biện lại

1. Có bằng chứng nào cho thấy MISA sẽ chạy **≥ 2 instance** ngay từ đầu không? Nếu có, F03 lên P1 và chặng C lên trước.
2. Đề xuất "khoá limiter theo `user.id` sau đăng nhập, IP cho route chưa đăng nhập": có hở nào (ví dụ phiên giả tạo hàng loạt) mà theo Codex cần thêm cost bucket ngay không?
3. F10: Codex có thấy đường nào để LibreOffice headless `--convert-to pdf` đọc được env/tệp **sau khi** đã gỡ quan hệ External, trường INCLUDE*, macro không? Nếu có fixture tái hiện, tôi sẽ nâng phần cô lập lên P1.

## 7. Chủ dự án đã xác nhận (11/10/2026)

- **500 người** = ước lượng cao điểm nhất, 500 người dùng cùng lúc; không phải ngày nào cũng vậy.
- **Chỉ 1 máy chủ**, không chạy nhiều instance.

Hệ quả cho kế hoạch:
- F03, jobs bền vững, store limiter dùng chung, fencing: **giữ P2**, không làm trong chặng A/B.
- Với 1 máy chủ, nút thắt khi 500 người không nằm ở HTTP. Nó nằm ở **hàng đợi tạo bài**:
  `GENERATION_CONCURRENCY=2`, `MAX_PENDING_JOBS=20` (`presentationService.js:34`).
  Ví dụ cao điểm có 50 người cùng bấm "Tạo bài" trong vài phút: khoảng 30 người nhận `QUEUE_FULL`, người thứ 20 trong hàng chờ cỡ 6–7 phút
  (ước theo 30–60 giây/job, **cần đo**).
- Load test chặng B vì vậy phải đo 3 việc:
  - thời gian chờ trong hàng đợi;
  - quota Gemini (RPM/TPM của key MISA);
  - RAM khi tăng `GENERATION_CONCURRENCY`.

  Mục đích là chọn cấu hình đúng, thay vì xây hạ tầng mới.
- Giao diện cần cho người dùng thấy **vị trí trong hàng đợi / thời gian chờ ước tính**, thay vì chỉ báo lỗi `QUEUE_FULL`.

## 8. Kết quả chặng A — mời Codex kiểm tra lại (12/10/2026)

Commit: `233d348` trên `main` (https://github.com/tuannhh/MISA-HTML-presentation, trên nền `09cbc5a`). Repo: `/Users/tuanbui/MISA-HTML-presentation`.
Quy ước: mỗi lỗi viết test tái hiện trước, xác nhận **đỏ** ở code cũ, sửa, xác nhận **xanh**. Chủ dự án đồng ý lộ trình ở §5 (chặng A trước) và chốt:
1 máy chủ, ước ~500 người dùng cùng lúc ở cao điểm, chuẩn = MISA Backend Standard.

### Cách chạy lại
```bash
npm test                                   # 169 test đơn vị
# Test tích hợp MySQL thật (DB tạm <DB_NAME>_it, xem test/integration/README.md):
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d mysql
DB_HOST=127.0.0.1 DB_PORT=3307 npm run test:integration
BASE=http://localhost:8088 node test/smoke/smoke.mjs   # smoke Docker, không cần bật đăng ký
```

### Đối chiếu finding → sửa → test (đề nghị Codex phản biện từng dòng)
| Finding | Sửa ở | Test / cách kiểm |
|---|---|---|
| F01 | `presentationService.js` (3 chỗ gọi `storeImage`) | `test/unit/service-media.test.js` — 2 test đỏ ở code cũ (tạo bài kèm ảnh → failed; dựng bài không có ảnh AI) |
| F02 | `frontend/src/composables/useEditor.js` (`draftVersion`, giữ nháp khi gõ lúc lưu) | `test/unit/editor-sync.test.js` chạy `useEditor` thật (loader `test/helpers/alias-loader.mjs`); 2/4 test đỏ ở code cũ |
| F04 | `middleware/security.js`, `app.js`, `config` (`RATE_LIMIT_*`) | `test/unit/rate-limit.test.js` (3 người chung IP không chặn nhau) |
| F05 | `resolvers(..., {spec})`, `exportQueue` | `service-media.test.js` (đọc đúng `k/1,k/2` thay vì cả `k/3,k/vid`; thumbnail chỉ `k/1`) |
| F06 | `lib/cappedDiskStorage.js` + `presentationRoutes.js` | `upload-cap.test.js` (chunked, 2×60KB vượt trần 100KB → 413, thư mục tạm rỗng; đỏ với `multer.diskStorage`) |
| F07 | `userRepository.updateAdminFieldsGuarded`, `shareRepository.add` | `test/integration/concurrency.test.js` trên MySQL thật; **bỏ `FOR UPDATE` thì 2/3 test đỏ** |
| F08 | `mediaService.pool` (`export`), cleanup `allSettled` | `media-pool.test.js` |
| F09 | `createCopy(status:'generating')` → `markReady`; lỗi → xoá bản dở | `service-media.test.js` |
| F10 | `visualService.toolEnv()` (cả soffice lẫn pdftoppm) | `visuals.test.js`; Docker: PPTX 6 trang vẫn render |
| F11/F12 | `authService.checkPasswordPolicy`, `readAsset` | `security.test.js`, `service-media.test.js` |
| F13 | `sharingService.addShare` (bản gốc trước, rồi cấp quyền) | `sharing.test.js` |
| F14/F15 | `db/pool.js`; changelog `20261005` có điều kiện; ghi chú `schema.sql` | `db-verify.test.js`; integration chạy lại **từng** changelog trên baseline mới (đỏ ở bản cũ) + nâng cấp DB cũ vẫn chạy |
| F17/F18 | `config/index.js` validate, `server.js`, `docker-compose.yml` | `ip-allowlist.test.js` |
| F20 | `test/smoke/provision.mjs` (admin tạm, `SMOKE_ADMIN_*`) | smoke "TẤT CẢ ĐẠT" với đăng ký đóng |
| F21 | `CLAUDE.md`, `AGENTS.md`, `memory-bank/06,11` | đọc tài liệu |
| Redraw (DELTA-03/…) | `cleanRedraw` trả `null` khi nhãn quá dài; ảnh gốc sơ đồ lưu làm asset | `org-redraw.test.js`, `service-media.test.js` |

Bằng chứng chạy thật trên Docker: tạo bài kèm ảnh gửi kèm → dàn ý có ảnh (trang 3); dựng bài có 2 ảnh minh hoạ AI (`build_ready aiImages:2`, trước đây 0); header `RateLimit: limit=1200` cho yêu cầu chưa đăng nhập.

### Chưa làm có chủ đích (xin Codex xác nhận có đồng ý hoãn không)
- F03 job bền vững/fencing (1 máy chủ), F10 phần cô lập mạng/worker riêng cho LibreOffice, F05 ngân sách bộ nhớ theo trọng số, F19 metrics/alert/restore drill, F16 phân trang mẫu.
- Chặng B: integration theo ~30 luồng chính, bộ vàng AI, load test (đo thời gian chờ **hàng đợi tạo bài**: `GENERATION_CONCURRENCY=2`, tối đa 20 chờ — nút thắt thật ở 500 người).

### Chỗ nên soi kỹ nhất (tự đánh giá rủi ro)
1. **F04**: trần IP 30000/phút và `anon` 1200/phút là ước tính — có hở nào cho kẻ dùng nhiều phiên giả tạo (chưa đăng nhập) không?
2. **F02**: `draftVersion` chỉ sửa ở `useEditor`; `useVersions`/`useOutline` vẫn dùng `deck.specVersion` cho thao tác riêng (khôi phục/handoff) — đúng ý (phiên bản đang LƯU), nhưng Codex xem lại giúp.
3. **F09**: bản sao tạm `generating` có thể bị `failStaleGenerating` quét khi khởi động lại giữa chừng — chấp nhận được?
4. **F12**: chỉ chặn đường không chữ ký; URL ký vẫn là capability (đúng với kết luận trước của Codex).
