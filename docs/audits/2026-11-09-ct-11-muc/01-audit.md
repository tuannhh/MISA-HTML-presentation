# Audit độc lập CT — 11 mục và thư mục lồng nhau

Ngày: 09/11/2026 (Asia/Ho_Chi_Minh). Nhánh `feature/cai-tien-11-muc`.

## Kết luận

**Chưa nên merge vào `main`.** Có **9 finding đã chứng minh: 1 P0, 6 P1, 2 P2, 0 P3**.
P0 là HTML nhập vào vượt lớp chặn mạng Chromium bằng popup và WebSocket.
P1 tập trung vào bảo toàn nội dung, tính đúng của số liệu và vòng đời video.
Unit **315/315**, tích hợp MySQL **44/44**, build đạt, audit bố cục báo **0 trang lỗi**.
Các kết quả xanh này chưa bao phủ các ca lỗi bổ sung bên dưới.
Kiểm tra HTTP hai tenant, migration và tệp HTML mẫu cho kết quả tốt trong phạm vi đã thử.
Chưa xác nhận ứng dụng đủ điều kiện production với 500 người dùng đồng thời.
Không sửa mã ứng dụng, không commit/push/deploy; **0 lời gọi Gemini thật**.

## Phạm vi và cơ sở

- Base `827da35` → HEAD `3e2c5d36cf4d03c9b9b10e9cd297e29e790af673`: 5 commit tính năng (`73eda47`, `704918a`, `12b718c`, `a3e3e81`, `80c22d2`) và commit bàn giao `3e2c5d3`. Không quy lỗi của bản cũ thành lỗi mới nếu chưa có bằng chứng liên quan phạm vi CT.
- Đối chiếu MISA Backend Standard đã cài tại `~/.claude/skills/misa-backend-standard/` (nguồn `/Users/tuanbui/BackEnd.SKILL` không còn trên máy); MDS 2.0 tại `~/.codex/skills/misa-design-system/`; `AGENTS.md`, `CLAUDE.md`, memory-bank và yêu cầu CT. Áp dụng ngoại lệ ứng dụng độc lập, ngưỡng chạm **44px** và mức P0–P3 theo prompt của chủ dự án.
- Kiểm thử trên snapshot HEAD, không sửa working tree ứng dụng. Hash **131 tệp `src/` + `shared/`** trong app Docker 8088 khớp snapshot. Container thử riêng dùng source snapshot mount chỉ đọc, MySQL tạm, AI giả.
- Log/script nằm trong [evidence/](evidence/). Cách chạy, giới hạn và việc dọn dữ liệu ở [02-bang-chung.md](02-bang-chung.md). Thứ tự sửa và test gate ở [03-ke-hoach-sua.md](03-ke-hoach-sua.md).

## Bảng nghiệm thu

“Đạt có điều kiện” nghĩa là bằng chứng hiện có chưa đủ đóng nghiệm thu toàn bộ; không đồng nghĩa đã production-ready.

| Mục | Kết quả | Căn cứ |
|---|---|---|
| 1. Giữ nguyên nội dung/số trang | **Không đạt** | CT-002: biết nguồn 3 trang nhưng vẫn nhận 2 trang; nội dung bị cắt theo giới hạn dàn ý. Trên 40 trang văn bản đã chặn trước AI. |
| 2. Nhập HTML | **Không đạt** | CT-001 chặn merge. Mẫu 137.542.503 byte đã tách 5 video, đọc/chụp đủ 38 trang; chưa phải kiểm toàn bộ luồng nhập–lưu–xuất của mẫu lớn. |
| 3. Video | **Không đạt** | CT-003/004/005; kiểm quyền HTTP đạt, video mẫu thực probe/poster/transcode được, video nhúng phát offline được. |
| 4. Chọn chữ trang kết | Đạt có điều kiện | Chromium giữ nguyên “Cảm ơn quý khách” sau chọn chữ/định dạng/blur; cần thêm thao tác kéo chọn bằng cảm ứng thật và vòng lưu–mở lại. |
| 5. Bấm ảnh toàn màn hình | Đạt có điều kiện | Lightbox mở trong trình chiếu và đóng bằng Esc; chưa xác nhận fullscreen native trên thiết bị thật, focus trap và trình đọc màn hình. |
| 6. Kéo/thả/dán và sửa ảnh | **Không đạt** | CT-007: upload đang chờ, xoá trang đích → ảnh được chèn nhầm sang trang khác. |
| 7. Lớp phủ màu/độ mờ | Đạt có điều kiện | Normalization/render và unit đạt; chưa thao tác đầy đủ ImageStudio trên thiết bị thật, chưa chứng nhận mọi control đạt MDS. |
| 8. Bố cục/sơ đồ/biểu đồ | **Không đạt** | CT-006 mất mục khi đổi bố cục; CT-008 sai số thập phân; CT-009 vùng chạm quá nhỏ. |
| 9. Mẫu chia sẻ khi tạo | Đạt có điều kiện | Thu hồi chia sẻ rồi tạo từ mẫu trả 404; service có kiểm lại khi job áp mẫu. Chưa ép race thu hồi đúng giữa từng bước sao chép asset. |
| 10. Rà bố cục tự động | **Đạt trong ma trận script** | Chạy nguyên script, mặc định 3 tỷ lệ × 3 mức nội dung, `report.json=[]`, exit 0. Không suy rộng thành mọi nội dung hợp lệ đều vừa trang. |
| 11. Chuyển trang | Đạt có điều kiện | Chromium: override `zoom`, phím tới/lùi nhanh kết thúc 1 trang `.on`, 0 `.off/.pre`; reduced-motion dùng `fade`; PDF 4 trang. Cần đủ 6 kiểu/thiết bị. |
| Thư mục lồng nhau | Đạt có điều kiện | HTTP tenant/cycle/delete đạt; 5 vòng chuyển chéo đồng thời không tạo vòng; migration upgrade/replay khớp cột/index/FK. Chưa phủ toàn bộ race tạo cây rỗng, quota và lỗi DB giữa transaction. |

## Finding đã chứng minh

### CT-001 — P0 — Mục 2: HTML nhập vượt chặn mạng bằng popup và WebSocket

**Bằng chứng:** `src/services/browserService.js:64–77` tạo page, chỉ gắn request interception trên page đó rồi `setContent(html)`; `:119–173` dùng cùng cơ chế cho HTML không tin cậy. Không có cô lập mạng cấp tiến trình/container cho riêng tác vụ nhập. Dockerfile bật `CHROME_NO_SANDBOX=true`; điều này không được dùng làm bằng chứng RCE.

[Probe](evidence/browser-probe.mjs) chạy service thật với Chromium trong container `--network none`, máy chủ thử chỉ nghe loopback của chính container. [Kết quả](evidence/browser-probe.log):

```json
{"localRequests":["/popup-probe","/websocket-probe","/favicon.ico"],"fetchBlocked":true,"popupEscaped":true,"webSocketEscaped":true}
```

**Tái hiện:** HTML có `fetch`, `window.open` và `new WebSocket` cùng trỏ endpoint thử. `fetch` bị chặn; popup thực hiện GET và WebSocket gửi handshake. Job sau đó timeout `RENDER_FAILED`, nhưng request đã xảy ra trước khi thất bại. Không cần thao tác click người dùng.

**Tác động:** người có quyền nhập HTML điều khiển request xuất phát từ máy chủ tới dịch vụ nội bộ mà container app truy cập được. Đã chứng minh blind SSRF; **chưa** thử đọc secret, exfiltrate dữ liệu hay RCE.

**Sửa:** tách worker nhập HTML không có network và không mount DB credentials/service keys/storage tenant khác; giới hạn RAM/CPU/PID/thời gian, huỷ cả browser context/process tree khi hết hạn. Nếu cần tài nguyên ngoài, nạp trước qua `safeFetch`, giới hạn byte rồi nhúng. Context riêng + kiểm soát popup/WebSocket là lớp bổ sung, không thay thế chặn egress ở hạ tầng.

**Test bắt buộc:** fixture fetch/image/iframe/popup/WebSocket/navigation/worker, endpoint loopback và container nội bộ của bộ test đều nhận **0 request**; đóng job không còn target con; mẫu hợp lệ vẫn đọc đủ trang.

### CT-002 — P1 — Mục 1: “Giữ nguyên” chỉ là chỉ dẫn cho AI, không phải bất biến được kiểm tra

**Bằng chứng:** `presentationService.js:548,564,575–579` normalize lenient, cap rồi lưu thành công; `outlineService.js:100–103` cắt số dòng/độ dài theo `limits.js:52–53`. Không so sánh số trang đầu ra với `pageCount`, không xác nhận độ đầy đủ nội dung.

[Service probe](evidence/service-probes.log), service thật + AI giả: `requestedPages=3`, `actualPages=2`, `firstPagePoints=12` dù AI trả 13 dòng, `failed=null`. Ca 41 trang trả `422 TOO_MANY_PAGES`, số lời gọi AI=0.

**Tái hiện:** tạo văn bản 3 trang ngăn bằng `---`, bật `keepOriginal`; giả lập AI trả 2 trang và một trang 13 dòng. Job vẫn thành `outline`.

**Tác động:** không thực hiện cam kết chủ đạo; có thể thiếu trang/ý mà không báo. Kết quả mô phỏng không chứng minh AI thật luôn trả thiếu; nó chứng minh server chấp nhận sai lệch.

**Sửa:** giữ manifest trang nguồn và nội dung đã trích; bắt buộc đối chiếu cardinality/order. Chế độ giữ nguyên không dùng nhánh cắt mất nội dung của normalizer. Không đủ khả năng dựng vừa một trang thì báo rõ hoặc giữ trang ảnh, không tự lược bỏ. Chỉ retry AI có giới hạn; không coi thêm trang trống là khôi phục nội dung.

**Test:** AI thiếu/thừa/đảo trang; 13 dòng, dòng >400 ký tự; PDF/PPTX/DOCX/HTML, trang trống, nguồn hỗn hợp; >40 bị chặn trước mọi lời gọi AI; vòng duyệt–dựng–xuất vẫn giữ đủ nội dung.

### CT-003 — P1 — Mục 3: hai đường lưu video bỏ qua cờ `broken`

**Bằng chứng:** `presentationService.js:263` chỉ lấy `info`; `:365` lấy `info, poster` nhưng bỏ `broken`. Trong khi `:1015–1016` (upload trong editor) đã kiểm và trả 422. `videoOptimizer.js:22–32` trả `{broken:true}` khi probe lỗi.

[Probe ffprobe thật](evidence/video-real-probe.log) xác nhận MP4 64 byte chỉ có `ftypisom` bị nhận diện hỏng. [Service probe](evidence/service-probes.log) cho `inspect` trả kết quả hỏng đó: `storedVideos=1`, `outlineReady=true`, `failed=null`. Nhánh HTML tương tự được chứng minh bằng đọc mã, chưa chạy end-to-end riêng với MP4 giả.

**Tác động:** bài tạo mới/nhập HTML có thể lưu video không phát được, khác hành vi upload editor; `info=null` làm asset không được enqueue để sửa lại.

**Sửa:** dùng một hàm validate/store chung cho cả 3 đường; probe và quyết định lỗi trước ghi asset chính thức; xoá file vừa tạo khi validation/DB lỗi. Định nghĩa rõ trường hợp công cụ video không sẵn sàng trong production, không âm thầm coi là hợp lệ.

**Test:** MP4 giả, audio-only, video hợp lệ, thiếu công cụ; tạo bài/editor/HTML đều có cùng kết quả và không để file/asset rác.

### CT-004 — P1 — Mục 3: file nén mồ côi khi cập nhật DB thất bại

**Bằng chứng:** `videoOptimizer.js:78–95`: `storage.putFile(key,out)` xong rồi `replaceVideoFile`; nếu DB ném lỗi, catch/finally chỉ xoá `out`, không xử lý `key` mới trong kho lâu dài.

[Fault injection](evidence/optimizer-probes.log): storage giả ghi thành công, repository ném `ECONNRESET`; job thành `failed`, **1 file mới còn lại**, `removed=[]`. Đây là test lỗi có kiểm soát, không làm hỏng MySQL thật.

**Tác động:** sau lỗi DB, đĩa tích luỹ bản nén không được asset nào tham chiếu; cleanup temp/upload không dọn kho private. Bản gốc vẫn còn, chưa chứng minh mất video gốc.

**Sửa:** track khoá staging và trạng thái publish; khi kết quả commit không rõ, đọc lại tham chiếu DB trước khi quyết định xoá. Có bộ reconciliation/GC file mồ côi theo tuổi an toàn; không xoá mù file có thể đã được DB commit. Cần xử lý cả nhánh xoá file cũ thất bại và crash sau ghi file.

**Test:** lỗi trước/sau putFile, DB fail trước commit, commit thành công nhưng mất response, xoá asset đồng thời, remove thất bại và kill/restart; không xoá file còn tham chiếu, GC dọn được orphan.

### CT-005 — P1 — Mục 3: giới hạn nén không bao phủ probe/poster và hàng chờ không có trần

**Bằng chứng:** `videoOptimizer.js:15,22–43`: Semaphore(1) chỉ bao `optimize`; `inspect` gọi probe/poster thẳng; `enqueue` dùng `run`, không reserve/cap. `:102–105` đưa toàn bộ pending/running vào hàng. Upload route có giới hạn byte từng request, nhưng không có quota tổng số byte đang xử lý trên toàn app.

[Probe](evidence/optimizer-probes.log): gọi **30 inspect đồng thời → 30 probe đồng thời**, trong khi `stats()` báo `active=0,pending=0`. Probe là double có barrier, không cố làm máy hết RAM. `videoService.js:128–141` cho thấy từng lời gọi tương ứng subprocess thật ở production.

**Tác động:** CPU/PID/RAM/đĩa không được chặn ở bước trước nén. 500 người dùng đồng thời không đồng nghĩa 500 video, nhưng một đợt upload nhiều người có thể vượt ngân sách tài nguyên; chưa đo ngưỡng sập thực tế.

**Sửa:** admission control trước nhận payload, quota byte tạm toàn app/tenant; pool chung có giới hạn cho probe/poster/transcode, hàng chờ có trần và phản hồi quá tải rõ. Poll/claim job theo lô, có lease nếu chạy nhiều worker. Giữ giới hạn 1 replica cho tới khi thực sự có điều phối dùng chung.

**Test:** đo subprocess active/queued, N+1 khi đầy, nhiều tenant, client ngắt upload, tải đầy đĩa, resume nhiều job; stats phải phản ánh cả công đoạn kiểm video.

### CT-006 — P1 — Mục 8: đổi bố cục làm mất 2 mục danh sách

**Bằng chứng:** `frontend/src/composables/useEditor.js:276–278`:

```js
s[to] = s[from].slice(0, SPEC_LIMITS[to]);
s[from] = [];
```

`SPEC_LIMITS.items=12`, `steps=10`. [Composable thật](evidence/editor-probes.log): bullets 12 → timeline 10 → bullets **10**, mất “Mục 11”, “Mục 12”. UI mô tả đổi bố cục giữ nguyên nội dung (`StylePicker.vue:66`).

**Tác động:** mất nội dung trong bản nháp; nếu lưu sẽ lưu bản thiếu. Có Undo nên xếp P1 theo sai nghiệp vụ chính, không kết luận mất dữ liệu không thể phục hồi.

**Sửa:** không slice rồi xoá nguồn. Chặn lựa chọn không chứa đủ nội dung và giải thích rõ, hoặc thiết kế chuyển đổi bảo toàn toàn bộ mục. Dùng cùng logic eligibility ở dropdown/picker/service chuyển đổi.

**Test:** 10/11/12 mục, đổi qua lại nhiều lần, sửa mục sau đổi, Undo/Redo và lưu–mở lại; assert từng ID/nội dung chứ không chỉ đếm phần tử.

### CT-007 — P2 — Mục 6: upload ảnh đang chờ dùng chỉ số trang đã cũ

**Bằng chứng:** `useImageDrop.js:35,51–56` giữ `index` trước await rồi chọn lại index và `live.addElement`.

[Probe](evidence/editor-probes.log): thả ảnh vào A ở index 0, upload chưa xong; xoá A làm B lên index 0; resolve upload → `inserted:[{slide:"B",asset:"asset-test"}]`, vẫn toast thành công.

**Sửa:** bám `slide.id`, kiểm lại tồn tại/phiên bản đích sau await; trang bị xoá thì không chèn sang trang khác. Với thay ảnh cần kiểm lại target path/element ID. Quy định asset thừa giữ trong thư viện hay dọn, không báo đã chèn nếu chỉ upload thành công.

**Test:** xoá/đổi thứ tự trang, Undo, đổi desktop/mobile trong khi upload, thả nhiều ảnh và lỗi từng phần.

### CT-008 — P1 — Mục 8: số thập phân biến thành số hàng trăm khi sửa ô biểu đồ

**Bằng chứng:** `ChartFields.vue:25,31–34` hiển thị `String(v).replace('.', ',')` rồi đưa text lại vào `parseNum`. `shared/deck/chart.js:28–31` coi nhóm đúng 3 chữ số sau dấu là phân cách hàng nghìn.

[Chromium, component thật](evidence/ui-probe.log): **desktop và mobile** đều `numericBefore:"0,123"`; sửa thành `0,124`, dispatch input rồi blur → `numericAfter:"124"`. Quy tắc đọc chuỗi hàng nghìn có ghi chú, nhưng không tương thích với chuỗi chính component hiển thị.

**Tác động:** số liệu biểu đồ sai 1.000 lần; lưu tiếp sẽ ghi giá trị sai.

**Sửa:** tách parser ô nhập theo locale đã chọn khỏi parser đoán định dạng bảng dán; bảo đảm `parse(format(n)) === n` trong miền hỗ trợ. Với dữ liệu dán mơ hồ, cho chọn định dạng/preview thay vì tự suy đoán. Không sửa bằng ngoại lệ chỉ riêng số 0.

**Test:** 0.001/0.123/1.234/-0.125, 4–6 chữ số thập phân, hàng nghìn vi/en, số cực lớn/NaN/Infinity; gõ từng ký tự, dán, blur, lưu–mở lại phải giữ số đã nhập.

### CT-009 — P2 — Mục 8/MDS: nút mở bố cục khác chỉ cao 18px trên mobile

**Bằng chứng:** `StylePicker.vue:65–66` dùng button chữ, không min-height/padding chạm. [Đo DOM thật](evidence/ui-probe.log) trên mobile 390px: `familyButton:{width:300.78125,height:18}`.

**Tái hiện:** mở editor có biểu đồ/danh sách, cuộn đến chọn kiểu; nút “Đổi sang bố cục khác — giữ nguyên nội dung” không đạt 44px. Kết quả kiểm những nút ở viewport đầu đều đạt không bao hàm nút này bên dưới.

**Sửa/test:** vùng tương tác ≥44×44, giữ typography nhỏ nếu cần; kiểm cả sheet/control dưới fold ở 390px, font/display lớn, bàn phím và focus visible. Không chỉ đo nút ở đầu màn.

## Các giả thuyết còn lại: kết luận và giới hạn

“SAI trong ca đã kiểm” chỉ bác bỏ ca cụ thể; không phải chứng minh tuyệt đối không có lỗ hổng.

| Giả thuyết | Kết luận | Bằng chứng / giới hạn |
|---|---|---|
| B truy cập video A hoặc asset sai bài qua API mới | **SAI trong ca đã kiểm** | HTTP owner=200; foreign deck/foreign asset/cùng tenant khác bài/add link trái phép=404; `ct-http-probes.log`. |
| B gắn parent/folder của A, sửa/xoá folder A, move IDs hỗn hợp | **SAI trong ca đã kiểm** | 404 ở 4 thao tác; move IDs chỉ chuyển 1 bài của mình. Repository dùng `tenantClause`. |
| Mẫu thôi chia sẻ vẫn chọn được để tạo | **SAI trong ca đã kiểm** | Thu hồi rồi create=404; `templateService.applyOnCreate` kiểm readable lần nữa. Race giữa quá trình copy chưa chứng minh. |
| Spec tham chiếu asset ngoại qua image/video/elements/items/QR/logo/brand | **Không tìm thấy bypass trong mã và unit đã chạy** | `specService.js:488–558` duyệt đủ các nhánh nêu trên. Chưa có HTTP fuzz toàn bộ tổ hợp mới. |
| Link Vimeo/YouTube trực tiếp chọn host nội bộ | **SAI theo đường mã đã kiểm** | Parse ID/hash, dựng URL provider cố định; Vimeo thumbnail đúng hostname; `safeFetch` kiểm IP tại kết nối và mỗi redirect, giới hạn byte/timeout. Không gọi provider thật trong audit. |
| HTML không thể gọi mạng nội bộ | **SAI — CT-001** | Popup/WebSocket đã vượt; direct fetch bị chặn. `file://`, worker và dữ liệu trả về từ nội bộ chưa thử. |
| ffmpeg bị chèn shell qua tên tệp/metadata | **Không tìm thấy ở đường đã kiểm** | `execFile` + mảng args, đường file server sinh, `-protocol_whitelist file`; unit tham số đạt. Không có PoC RCE; không kiểm CVE binary. |
| MIME giả video bị chặn ở mọi đường | **SAI — CT-003** | ffprobe thật báo hỏng, hai nhánh service không xử lý cờ. |
| Tệp tối ưu luôn được dọn khi lỗi | **SAI — CT-004** | Fault injection chứng minh orphan lâu dài; không đánh đồng với temp file thường đã dọn. |
| Có giới hạn mọi công đoạn video dưới tải | **SAI — CT-005** | 30 probe chạy cùng lúc; chưa chạy 500 upload 200 MB hay gây OOM. |
| Resume tự lặp vô hạn mọi lỗi | **Chưa chứng minh** | Resume lấy pending/running; lỗi thường chuyển failed. Chưa kill process ở từng ranh giới để kết luận phục hồi crash. |
| SVG/HTML giả ảnh được chấp nhận như ảnh raster | **Không tìm thấy trong đường mã/unit** | Nhận magic bytes + normalize bằng sharp; `decodeDataImage` loại SVG. Chưa fuzz decoder. |
| Stored XSS qua chart/callout/sơ đồ/tên folder/video/aria | **Chưa tìm thấy** | Chuỗi chart/callout đi qua escape, folder qua Vue interpolation, title thuộc tính escape; probe renderer không tạo `img[onerror]`, marker không chạy. Không thay thế fuzz toàn bộ trường. |
| `StylePicker` v-html chứa input người dùng | **SAI theo dataflow hiện tại** | `tiles → stylePreview(layout,variant)` dùng SVG hằng; label hiển thị qua Vue interpolation. |
| CSP mới mở wildcard script/mạng | **SAI theo diff** | Thêm đúng player Vimeo và media self/blob; connect-src không mở. CSP trang app không bảo vệ `setContent` ở worker nhập HTML. |
| Chuyển thư mục chéo tạo cycle; xoá mất bài | **SAI trong ca đã kiểm** | 5 vòng race: một 200, một 422; xoá con chuyển bài lên cha. Cả các bước SQL nằm transaction; chưa inject rollback giữa SQL. |
| Migration chạy lại hỏng hoặc không khớp baseline | **SAI trong ca đã kiểm** | Hai delta CT từ schema base, chạy 3 lần: cột/index/FK đều khớp baseline HEAD. Unit/integration changelog cũ cũng đạt. Chưa diễn tập rollback dữ liệu production. |
| >40 trang vẫn tốn lượt AI | **SAI với văn bản thử; các định dạng còn lại chưa đóng hết** | 41 trang văn bản=422, 0 AI; unit có đếm nguồn/PPTX giả. DOCX conversion lỗi chuyển sang số trang không xác định cần test bổ sung. |
| NaN/Infinity/1e999 làm số vô hạn lọt chart | **Không thấy lọt theo hàm/unit** | `parseNum` kiểm finite và trần; có lỗi locale độc lập CT-008. Chưa thử paste hàng triệu dòng. |
| AI tự chọn kiểu manual | **Không thấy theo mã/unit** | `artDirect` loại manual; test layouts-dot5/5b đạt. Không gọi AI thật để đánh giá chất lượng đề xuất. |
| Đổi layout không mất/nhân đôi dữ liệu | **SAI — CT-006** | Roundtrip 12→10→10. Các chuyển chart↔stats cần bổ sung test nhiều series/quay lại sau sửa. |
| HTML offline/PDF không hỗ trợ khối mới | **SAI trong fixture đã thử** | Video blob readyState=4, không media error, 0 request ngoài; PDF 4 trang có chart/ảnh/video/trang kết. Video provider cần mạng là hành vi có chủ đích; vượt tổng trần nhúng video chưa nghiệm thu. |
| Chuyển trang sai khi thao tác nhanh/reduced motion | **Chưa thấy lỗi trong chuỗi đã thử** | Renderer log: 1 on, 0 off/pre; override zoom; reduced fade. Chưa đủ mọi kiểu/cảm ứng. |
| Có route CT thiếu composition mobile | **SAI theo router và runtime owner** | 5 cặp route, 10 lượt mở; không JS error/scroll ngang trang. Không suy ra đầy đủ mọi role/thiết bị. |

## Phần chưa được chứng minh — không cộng thành finding khai thác được

- Khả năng phục vụ **500 người dùng đồng thời**, OOM/đầy đĩa, kill/restart giữa xử lý, nhiều replica, phục hồi DB/storage: chưa chạy tải hoặc fault matrix đầy đủ. Không có số liệu để chấm mức chịu tải production.
- Ma trận MDS `route × role × thiết bị`: đã mở 5 route chính với owner trên desktop + mobile giả lập; chưa runtime đầy đủ admin/editor/viewer, thu hồi quyền trong khi đang mở sheet, OS font/display, bàn phím thật, screen reader, Android/iOS/WebView.
- Mẫu HTML lớn mới kiểm strip + inspect + chụp đủ trang; chưa so sánh pixel từng trang với nguồn, chưa nhập–lưu–xuất toàn bộ video 200 MB. Không coi 38 screenshot là chứng nhận giữ nguyên mọi chi tiết.
- Bộ unit hiện tại có nhiều assert chuỗi CSS/HTML hữu ích để bắt regression cấu trúc, nhưng không đủ cho network boundary, async race, lỗi DB/filesystem và nhập số. Các probe bổ sung chưa nằm trong CI; cần chuyển thành regression test trước sửa.
- Không chạy lại các script E2E cá nhân cần tài khoản lưu trong `tmp/e2e-user.json`; không đọc tài khoản đó. Không chạy full smoke dùng AI thật ở 8088; đã health check và chạy HTTP/integration trên app cô lập. Không tuyên bố đã hoàn thành smoke production-like.

**Điểm nên giữ:** tenant scoping và quyền trên API mới rõ; migration tương thích tốt; nội dung nhúng có escape; hai composition desktop/mobile đã tồn tại; có layout gate thật và video xử lý bằng subprocess không qua shell. Nên sửa tập trung các ranh giới vừa phát hiện, giữ các bảo vệ này và tăng test hành vi, không viết lại toàn bộ ứng dụng.
