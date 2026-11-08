# Kế hoạch sửa và nghiệm thu CT — chờ chủ dự án duyệt

Căn cứ: [01-audit.md](01-audit.md), HEAD `3e2c5d3`, **1 P0 + 6 P1 + 2 P2** đã chứng minh. Đây là đề xuất triển khai; audit chưa sửa source, chưa commit/push/deploy. Ưu tiên giữ các cơ chế tenant, version conflict, normalization, escape và composition desktop/mobile đang làm đúng.

## Trình tự đề xuất

**Gate merge:** đóng CT-001 trước, sau đó toàn bộ P1; P2 trong phạm vi này nhỏ, nên sửa cùng đợt. **Gate giao DevOps production:** thêm kiểm tải 500 users, lỗi/restart, backup/restore và nghiệm thu mobile. Test xanh không tự động cho phép deploy.

Ước lượng **12–21 ngày công** cho một người hiểu repo, gồm sửa/test/tài liệu, chưa tính thời gian chờ hạ tầng và thiết bị. Đây là ước lượng kế hoạch, không cam kết tiến độ khi chưa chốt phương án worker và yêu cầu giữ nguyên nội dung.

| Đợt | Phạm vi | Công dự kiến | Điều kiện kết thúc |
|---|---|---:|---|
| A | Đưa bằng chứng thành regression test | 0,5–1 ngày | Ca tái hiện đỏ đúng nguyên nhân, baseline unit/integration giữ xanh |
| B | CT-001: cô lập nhập HTML | 2–4 ngày | Mọi đường mạng trong fixture bị chặn ở ranh giới worker, dọn toàn process tree |
| C | CT-002: bảo toàn nguồn | 2–3 ngày | Không đánh dấu thành công với thiếu/thừa/đảo trang hoặc cắt nội dung |
| D | CT-003/004/005: video và chịu lỗi | 3–5 ngày | 3 đường ingest thống nhất, publish/GC an toàn, admission có trần đo được |
| E | CT-006/007/008/009: editor/MDS | 1–2 ngày | Không mất mục, không chèn nhầm trang, số nhập đúng, vùng chạm đạt |
| F | Nghiệm thu chéo 11 mục + bàn giao | 1,5–2,5 ngày | HTTP/E2E/offline/PDF/mobile matrix và tài liệu hoàn chỉnh |
| G | Tải 500 users + fault/DevOps | 2–3,5 ngày | Có báo cáo số đo, cấu hình tài nguyên, recovery và giới hạn vận hành rõ |

Cộng biên ước lượng khoảng 12–21,5 ngày; có thể rút ngắn nếu hạ tầng test đã sẵn. Không mở rộng sang viết lại toàn bộ editor hoặc thay toàn bộ stack.

## A. Regression test trước khi sửa

**Tệp dự kiến:** `test/unit/*`, `test/integration/*`, thư mục E2E/browser có runner được version-control; fixture trong `test/fixtures/`. Các probe hiện nằm trong `evidence/` cần chuyển thành test assertion, bỏ phụ thuộc tên máy/đường dẫn tuyệt đối.

1. Đóng băng commit và bảng finding; giữ unit315/integration44 làm baseline, không thay expected chỉ để xanh.
2. Với mỗi CT, tạo một ca đỏ tái hiện lỗi và một ca đối chứng hợp lệ. Phân biệt test service double với test HTTP/DB/browser thật.
3. Browser test dùng network cô lập, máy chủ đích giả và asset tổng hợp; không gọi nội bộ doanh nghiệp, secret hoặc provider thật.
4. Dùng clock/barrier điều khiển race thay sleep ngẫu nhiên. Assert dữ liệu và trạng thái cuối, không chỉ snapshot chuỗi CSS.
5. DB mỗi run riêng, teardown kể cả lỗi; không `IT_OPTIONAL=1` trong gate. Log không chứa credentials/cookie/token.

**Gate:** test mới fail đúng bug hiện tại; test cũ đạt; có thể chạy trên máy khác/CI. Không yêu cầu biến mọi probe hiện tại thành test trong một PR khổng lồ: nhóm test và fix theo từng finding, nhưng test phải được xác định trước sửa.

## B. Cô lập HTML không tin cậy — CT-001 (P0)

**Tệp/nhóm:** `browserService.js`, `htmlDeckService.js`, `htmlDeckPage.js`, luồng `analyseHtml/importHtmlDesign`, container/config; Docker worker mới và tài liệu mạng/vận hành.

**Phương án khuyến nghị:** worker chuyên nhập HTML, không có egress, không chứa secrets, không truy cập filesystem của các tenant khác. App điều phối gửi đúng input vào sandbox job, nhận JSON/screenshot/video qua kênh giới hạn. Không mount Docker socket vào app để tự tạo container. DevOps có thể triển khai worker qua dịch vụ điều phối tách biệt hoặc job runner; cần thống nhất giao thức này trước coding.

- Tách browser xử lý HTML lạ khỏi browser render spec tin cậy. Mỗi job có context riêng; mặc định không popup/download/permission; worker/page con cũng nằm trong ranh giới egress bị chặn.
- CPU/RAM/PID/timeout áp ở worker/container; hết hạn huỷ toàn bộ tác vụ và các target con, không chỉ tab gốc. Chặn vô hạn popup/CPU loop; job lỗi không chặn PDF của người khác.
- Input/output đều có giới hạn byte, số trang, số ảnh/video; JSON trả về phải validate và normalize lại, không tin global JS của trang.
- Dùng sandbox Chromium nếu nền tảng cho phép. Nếu buộc `--no-sandbox`, cô lập OS/container phải được thiết kế và kiểm thử rõ; không tuyên bố `BrowserContext` thay thế sandbox OS.
- Không tắt JS toàn bộ một cách vội vàng vì bài HTML nguồn có thể cần JS để hiện nội dung. Nội dung cần mạng ngoài: tải qua bộ nạp `safeFetch` trước, allowlist tài nguyên và nhúng có hạn mức.

**Test gate:** popup/WebSocket/fetch/iframe/navigate/worker/file scheme, không endpoint nội bộ giả nào nhận request; không đọc marker file ngoài input; watchdog dọn process; chạy 2 job hợp lệ xen 1 job độc hại không ảnh hưởng nhau. Tệp mẫu phải giữ 38 trang/5 video. Cập nhật `08-security-model`, `09-technical-traps`, `DEVOPS-NETWORK` theo cơ chế thật.

## C. Bảo toàn nội dung và số trang — CT-002 (P1)

**Tệp:** `pageSource.js`, `presentationService.js`, `outlineService.js`, `geminiService.js`, limits và UI thông báo chế độ nguồn.

- Lập manifest nguồn: mỗi trang có ID/thứ tự, nội dung gốc đã trích, ảnh/video tham chiếu và độ tin cậy của việc đếm. Với nguồn không xác định trang, UI phải nói rõ phạm vi giữ nguyên, không mặc định cam kết số trang.
- Truyền page ID sang AI và kiểm lại ID/count/order; không dựa vào “AI được dặn”. Không nhận thiếu trang rồi âm thầm tiếp tục.
- Tách đường bảo toàn khỏi đường biên tập có truncation; giữ text gốc, không cắt 13→12 dòng/400 ký tự. Chọn renderer/layout phù hợp hoặc báo nội dung vượt khả năng hỗ trợ. Nếu cần chuyển sang ảnh trang để giữ thiết kế/nội dung, để người dùng biết rõ tính sửa được.
- Retry có giới hạn theo trang lỗi và tổng ngân sách, ghi nhận nguyên nhân; hết ngân sách trả trạng thái có thể phục hồi. Không thêm trang trống để đạt số đếm.
- Với OCR/scan, không thể chứng nhận “nguyên văn tuyệt đối” chỉ bằng output AI; giữ bản trang nguồn và đường đối chiếu, định nghĩa tiêu chí nghiệm thu rõ.

**Test gate:** 1/3/40/41 trang cho từng dạng; trang rỗng; 13 dòng và dòng dài; nguồn hỗn hợp; AI thiếu/thừa/trùng/đảo trang; conversion Office lỗi; số liệu/URL/email không bị biến đổi sai bởi bước hậu xử lý. Test cả build từ outline và export, không chỉ `generateOutline`.

## D. Video: validation, storage và tải — CT-003/004/005 (P1)

### D1. Validate/store dùng chung

**Tệp:** `presentationService.js`, `videoOptimizer.js`, `videoService.js`, helper ingest video nếu cần.

- Một contract kết quả phân biệt `valid`, `invalid`, `tool-unavailable`; ba đường editor/create/HTML phải xử lý như nhau.
- Validation trước tạo asset chính thức; staging có owner/job ID và cleanup trong mọi nhánh lỗi.
- Production thiếu ffprobe phải health/degraded/error có chủ đích, không lặng lẽ bỏ kiểm định. Chính sách có thể cho lưu “chờ kiểm tra”, nhưng chưa được coi video sẵn sàng.
- Test file giả, audio-only, MP4/MOV/WebM hợp lệ, codec cần chuyển, tên file lạ, file cắt cụt, poster lỗi.

### D2. Publish và GC an toàn khi lỗi

**Tệp:** `videoOptimizer.js`, `assetRepository.js`, `storageService.js`, job state/schema nếu cần.

- Staging → xác nhận DB tham chiếu → dọn bản cũ; giữ original trong suốt quá trình.
- Khi update timeout/mất kết nối, đọc lại tham chiếu và trạng thái job trước quyết định xoá. Không xoá file mới chỉ vì API cập nhật DB ném lỗi: commit có thể đã xong.
- GC chỉ xoá file không tham chiếu sau grace period, có dry-run/log; xử lý remove thất bại; crash/restart tiếp tục idempotent.
- Nếu thêm state/lease/attempts, tạo changelog mới idempotent và cập nhật baseline; không chỉnh lịch sử migration đã triển khai để che khác biệt.
- Fault matrix: disk-full, DB unavailable, commit-unknown, remove-old fail, delete asset while optimizing, kill từng ranh giới và restart. Assert byte/hash và tham chiếu DB sau recovery.

### D3. Admission control và worker budget

**Tệp:** routes upload, `cappedDiskStorage`, `videoOptimizer`, semaphore/config/metrics, worker lifecycle.

- Đặt trần request đang nhận, tổng byte tạm, số video/job trên tenant và toàn app. Kiểm/giữ chỗ atomically trước ghi payload lớn; release khi abort/error.
- Giới hạn cả probe/poster và transcode; các trần phải phù hợp tổng CPU/RAM, không mỗi nhánh một “concurrency=2” rồi cộng thành quá tải.
- Hàng đợi có capacity/age/retry budget; quá tải trả 429 hoặc 503 có mã lỗi/retry guidance thống nhất, không tích luỹ vô hạn.
- Resume lấy theo lô, claim có lease nếu nhiều worker; single-instance là constraint có thể chấp nhận ở bước đầu nếu được đo tải và ghi rõ cho DevOps. Không tự scale replica khi queue còn process-local.
- Metrics: active/queued theo công đoạn, wait time, upload bytes, disk free, subprocess count, success/fail/timeout, orphan cleanup. Không đưa chi tiết kỹ thuật này vào flow người dùng ngoài thông báo trạng thái cần thiết.

**Gate D:** test 30/50 yêu cầu có admission giữ đúng trần, reject không để rác; video hợp lệ vẫn phát khi job tối ưu lỗi; fault matrix D2 xanh; đủ bằng chứng reboot/resume, không chỉ mock state.

## E. Editor và MDS — CT-006/007/008/009

**Tệp:** `useEditor.js`, `StylePicker.vue`, `useImageDrop.js`, `useLiveDeck.js`, `ChartFields.vue`, `shared/deck/chart.js`, tests composable/browser.

- **CT-006:** conversion không phá huỷ. Khuyến nghị ngắn hạn: disable đích không chứa đủ nội dung và giải thích; thống nhất dropdown/picker/hàm chuyển. Nếu mở rộng steps lên12, phải cập nhật normalization, renderer/layout gate và mọi variant liên quan, không chỉ sửa constant.
- **CT-007:** định danh slide/element ổn định sau await, đối chiếu lại target; trang đã xoá thì báo upload xong nhưng chưa chèn, không chuyển ảnh sang index kế. Theo dõi transaction UI để Undo/Redo không tạo bước giả.
- **CT-008:** parser nhập số với locale rõ, format/parse roundtrip; import bảng có nhận diện/preview riêng. Giá trị mơ hồ phải có lựa chọn rõ. Không áp parser nhóm nghìn lên chuỗi thập phân chính component xuất ra.
- **CT-009:** vùng chạm ≥44px; kiểm cả nội dung dưới fold, sheet, ColorSwatches và nút phụ mới. Bổ sung focus/keyboard cho picker, label/error input. Không thay MDS bằng CSS gần giống rồi tuyên bố tuân thủ hoàn toàn.

**Gate:** chạy hành vi trên desktop + mobile390, sửa/lưu/mở lại dữ liệu, Undo/Redo, upload delay + xoá/di chuyển slide, chuyển composition khi đang có nháp; không horizontal overflow toàn trang. Bảng dữ liệu được cuộn ngang trong vùng riêng.

## F. Ma trận nghiệm thu 11 mục (sau sửa)

| Mục | Ca bắt buộc bổ sung/giữ lại | Cấp kiểm thử |
|---|---|---|
| 1 | Manifest trang và nội dung đầy đủ, 40/41, AI sai, Office/PDF/HTML hỗn hợp | Unit + service + HTTP/E2E |
| 2 | Mẫu38/5, HTML động/ẩn trang, mạng độc hại, timeout/CPU loop, template khác ratio | Worker integration + ảnh so sánh mẫu |
| 3 | 3 đường nhập; invalid/valid; biên 199/200/201MB; Range/seek; options; race optimize/delete/restart | HTTP + ffmpeg thật + load/fault |
| 4 | Kéo chọn/double click, đậm/màu, blur, Undo/Redo, lưu–mở lại trang kết | Browser desktop + cảm ứng thật |
| 5 | Ảnh thường/free/gallery, mở/đóng Esc/touch, focus trở về, không chuyển nhầm trang | Browser + thiết bị |
| 6 | Drop/paste một/nhiều ảnh, thay target, delay/race, size/type server, Undo | Composable + HTTP + browser |
| 7 | Overlay0/100%, frame/border/shadow/position, save/reload/export | Unit + browser + PDF |
| 8 | Mỗi variant/ratio, overflow, dữ liệu âm/null/decimal/lớn, conversion bảo toàn, AI không chọn manual | Unit + property/roundtrip + layout + browser |
| 9 | Owner/public/private/revoke; job chờ rồi revoke; asset copy không xuyên tenant | HTTP + DB + browser |
| 10 | Script exit1 với fixture overflow chủ động; exit0 với mẫu chuẩn; log/report artifact | CI Chromium |
| 11 | 6 transitions + override, nhanh/đảo chiều, reduced-motion, editor/print/still không chuyển động ngoài ý muốn | Browser + PDF/thumbnail |
| Folder | Max-depth5/6, count300/301, cycle, empty tree race, mixed IDs, rollback delete, rename XSS, keyboard/mobile | DB concurrency + HTTP + browser |

Ma trận UI cần owner/editor/viewer/admin ở các route có quyền, cả desktop/mobile riêng; role không được phép phải về trạng thái từ chối đúng shell. Thêm session hết hạn, revoke trong lúc mở editor/sheet, dữ liệu trống/loading/error, deep link/back/restore nháp. Dùng OS font/display lớn và screen reader trên thiết bị thật; giả lập390px không thay thế các bước này.

**Gate F:** toàn bộ unit/integration không fail/skip; build và layout đạt; bộ E2E đã version-control tái chạy được; chạy full smoke trên Docker candidate sau khi chốt ngân sách AI thử (ghi số lượt). Không sửa expectation để bỏ qua P0/P1. Người sửa đính kèm commit, log, fixture và các giới hạn còn lại cho lần audit xác nhận.

## G. Mục tiêu 500 users và gói DevOps

**500 người dùng đồng thời là giả định được chủ dự án chọn, chưa phải số liệu đã đo.** Cần phân biệt phiên người dùng đang hoạt động với 500 job AI/PDF/video cùng lúc. Đề xuất ban đầu sau đây cần duyệt và điều chỉnh theo số đo:

### Workload đề xuất

- 500 phiên đăng nhập hoạt động, ramp10 phút, giữ30 phút, soak2 giờ. Tạo đủ tenant/bài/folder tổng hợp và có cả bài lớn; không benchmark trên DB rỗng.
- Tỷ lệ thao tác: 60% danh sách/xem, 25% đọc/sửa/lưu, 10% quản lý thư mục/chia sẻ, 5% yêu cầu job nặng. Ghi rõ think time và RPS đạt thật; quota job nặng có thể từ chối phần vượt capacity với phản hồi đã thiết kế.
- Đợt spike riêng: 20 yêu cầu AI, 20 xuất PDF, 10 upload video200MB đồng thời; tăng dần 1→2→5→10, dừng khi chạm ngưỡng bảo vệ. Không bắt đầu bằng 500×200MB.
- 500-user load dùng AI stub có delay/lỗi thực tế mô phỏng, cô lập chi phí; một bộ acceptance nhỏ dùng provider thật theo ngân sách riêng. Không dùng kết quả stub để cam kết latency AI thật.
- Cấu hình candidate đầu để đo: API2vCPU/4GiB, worker render/import2vCPU/4GiB, worker video2vCPU/4GiB, MySQL2vCPU/4GiB, SSD có giám sát dung lượng. Đây là **điểm bắt đầu đo**, không khẳng định đủ tải. DevOps chốt topology, storage, mạng và resource limits thực tế.

### SLO đề xuất cho phần app kiểm soát

| Chỉ số | Ngưỡng ban đầu để duyệt |
|---|---|
| API đọc/ghi thông thường | p95≤1s, p99≤2,5s trong steady-state, tách request download/upload/job dài |
| Lỗi ngoài dự kiến | <1%; tách 429/503 admission dự kiến và 409 version conflict khỏi lỗi bất thường nhưng vẫn báo tỷ lệ rõ |
| Job | Không thất lạc/trùng publish; có status/failure reason, thời gian chờ đo được và giới hạn backlog |
| Tài nguyên | Không OOM/restart ngoài kiểm soát; không tăng RSS/đĩa/FD/process không hồi phục sau tải và GC |
| Cạn tài nguyên | Chặn sớm trước khi đầy đĩa; số process/job luôn ≤budget cấu hình, không mất file còn được tham chiếu |
| Restart | Worker khôi phục job hoặc đánh failed có thể thử lại; API/DB trở lại phục vụ trong ngưỡng vận hành đề xuất≤5 phút |
| Backup/restore | Thử phục hồi DB+storage nhất quán; đề xuất RPO≤24h/RTO≤4h, chủ dự án và DevOps xác nhận riêng |

Không dùng trung bình latency để thay p95/p99, không loại các request thất bại khỏi báo cáo. Lưu image digest, commit, cấu hình, dữ liệu đầu vào, CPU/RAM/IO/network, test script và raw results.

### Fault và bàn giao

- Thử mất DB30 giây, disk quota/full, kill worker khi transcode/putFile/update DB, browser timeout, client upload disconnect, provider429/timeout, graceful shutdown. Kiểm file/DB trước và sau bằng hash + referential checks.
- Gói giao DevOps: image digest của các thành phần, cấu hình mẫu **không secret**, migration thứ tự/kiểm tra trước-sau, rollback app tương thích schema, backup/restore runbook, worker network policy, quota và concurrency, dashboards/alerts, tài liệu scale1→n và điều kiện được scale.
- Với schema CT mang tính bổ sung, ưu tiên rollback binary tương thích và giữ cột/dữ liệu mới; không chạy DROP theo thói quen. Nếu cần rollback dữ liệu phải có kế hoạch riêng được duyệt.
- Cập nhật memory-bank03/05/06/07/08/09/10/11 và README/DEVOPS-NETWORK tương ứng **trong đợt triển khai đã duyệt**, không trong audit chỉ đọc này.

## Những việc có thể hoãn có điều kiện

Có thể hoãn thêm kiểu biểu đồ, tối ưu thẩm mỹ ngoài 11 mục, và thay queue chuyên dụng nếu single-instance đã được đo đủ tải và có vận hành rõ. Không hoãn CT-001, sai số biểu đồ, mất nội dung, validation video, orphan/giới hạn tài nguyên bằng lý do “unit đang xanh”.

**Đề xuất duyệt:** chốt A→F để đủ điều kiện merge; G là cổng riêng bắt buộc trước giao production cho DevOps. Phương án worker không mạng và contract “giữ nguyên” là hai quyết định cần được review cụ thể trước triển khai, vì chúng ảnh hưởng kiến trúc và hành vi người dùng.
