# Codex kiểm tra lại chặng A

Ngày kiểm tra: **12/10/2026**. Commit: **`233d3483bf2d1d61febf2d9d59a2052d9a775567`**, so với `09cbc5a`. Repo: `/Users/tuanbui/MISA-HTML-presentation`.

**Kết luận: phần lớn sửa đổi chặng A đúng hướng và có kiểm thử tốt hơn rõ rệt; chưa nên đóng chặng A. Có 6 nhóm vấn đề cần xử lý hoặc chốt lại, trong đó 3 nhóm ưu tiên cao: tài khoản admin do smoke tạo, mất nội dung đang gõ và vượt giới hạn hàng đợi.** Các lỗi này xử lý được trong kiến trúc hiện tại; không cần chuyển sang nhiều instance hay thêm Redis.

Tôi đã đọc phản hồi Claude, đặc biệt mục 5, 6 và 8, và áp dụng điều chỉnh của chủ dự án: **một máy chủ, một instance, 500 người là cao điểm dự kiến**. Tôi đồng ý thay kế hoạch lớn trước đây bằng A → B → C có điều kiện. Catalogue 198 case là bản đồ phạm vi; không cần viết xong tất cả mới sửa một lỗi đã tái hiện. Mỗi sửa đổi vẫn phải có test bảo vệ đúng hành vi trước hoặc cùng lúc sửa.

Nguồn quy chuẩn: `misa-backend-standards` và `/Users/tuanbui/BackEnd.SKILL`, cùng `AGENTS.md` và memory-bank của repo. Đây là review bảo trì, không sửa mã ứng dụng. File phản hồi `08` được giữ nguyên.

## 1. Những vấn đề cần xử lý

### A01 — P1: smoke tự tạo admin có mật khẩu cố định và để lại sau test

**Vị trí:** `test/smoke/provision.mjs:16–25`, `test/smoke/smoke.mjs:385`.

Khi đăng ký đóng và không có `SMOKE_ADMIN_*`, provisioner gọi `docker compose exec ... create-admin.js`, đăng nhập rồi đổi mật khẩu admin sang `TEST_PASSWORD` cố định trong mã nguồn. Admin này hết trạng thái bắt buộc đổi mật khẩu và tiếp tục tồn tại; smoke không có bước thu hồi admin hoặc cleanup trong `finally`. Cả khi một assertion sau đó thất bại, tài khoản vẫn còn. Nhánh dùng admin được truyền sẵn không đổi mật khẩu admin; lỗi nằm ở nhánh tự bootstrap.

Đây là rủi ro thực tế nếu chạy đúng lệnh smoke hiện được hướng dẫn trên Docker đang chứa dữ liệu. Tài khoản email theo timestamp không thay thế được mật khẩu bí mật. Chưa khẳng định môi trường của anh hiện có tài khoản tồn dư: tôi không truy vấn dữ liệu người dùng thật.

**Kiểm chứng:** chạy provisioner thật với HTTP và lệnh Docker được thay bằng stub trong tiến trình probe. Ghi nhận admin được đổi sang mật khẩu fixture. Đọc toàn bộ phần kết thúc smoke để kiểm tra không có cleanup. Không tạo admin thật trong đợt review.

**Sửa nhỏ đề nghị:** chạy smoke trong compose project/database/storage riêng, có kiểm tra đúng môi trường đích; dùng mật khẩu ngẫu nhiên từng lần chạy; trả handle cleanup và dọn theo ID trong `finally`, gồm cả trường hợp bootstrap/test lỗi. Nếu dùng admin cung cấp sẵn, không sửa/xoá tài khoản đó. Bổ sung hướng dẫn kiểm tra và vô hiệu hoá admin smoke còn sót nếu trước đây đã chạy trên Docker có dữ liệu.

**Test nghiệm thu:** đăng ký đóng vẫn chạy được; thiếu xác nhận môi trường test thì không tự bootstrap; test thất bại giữa chừng vẫn dọn tài khoản do runner tạo; `BASE` trỏ khác compose đích phải bị phát hiện trước khi ghi dữ liệu.

### A02 — P1: mất chữ vẫn xảy ra ở updateMeta và lưu dàn ý

**Vị trí:** `frontend/src/composables/useEditor.js:130–137`; `frontend/src/composables/useOutline.js:160–163`.

`draftVersion` đã sửa đúng lỗi lấy version mới của người khác cho một nháp cũ. `save()` của editor cũng giữ được chữ gõ thêm khi chờ phản hồi. Tuy nhiên:

- `updateMeta()` chụp `keep` **trước** `await`. Trong khi đổi tỷ lệ/chia sẻ, người dùng gõ thêm; phản hồi về thì `adopt()` và `keep` khôi phục bản cũ, xoá phần vừa gõ. Nếu lúc bắt đầu nháp sạch, phần gõ sau đó cũng mất vì `keep=null`.
- `useOutline.save()` vẫn `adopt(response)` vô điều kiện. Gõ thêm khi lưu nháp dàn ý làm phần vừa gõ biến mất; giao diện có thể quay về trạng thái không còn thay đổi chưa lưu.

Các trường nhập của desktop/mobile không bị khoá toàn bộ khi những request này đang chạy. Đây không chỉ là tình huống gọi API nội bộ giả định.

**Kiểm chứng:** composable thật, API giả với barrier chủ động giữ phản hồi. Đã tái hiện cả ba trường hợp: metadata khi nháp sạch, metadata khi nháp bẩn, và lưu dàn ý. Không chạy trình duyệt E2E cho ba trường hợp này.

**Sửa nhỏ đề nghị:** theo dõi revision cục bộ và version nền riêng cho từng loại nháp; so sánh trạng thái lúc gửi với lúc nhận, giữ phần người dùng sửa sau lúc gửi. Metadata không được thay toàn bộ nháp một cách vô điều kiện. Tuần tự hoá hoặc loại bỏ phản hồi đã lỗi thời khi save/metadata chạy xen kẽ; không giải quyết bằng cách gán version máy chủ mới cho mọi nháp cũ.

**Test nghiệm thu:** ba case đã tái hiện; save và metadata về ngược thứ tự; hai người cùng sửa vẫn báo 409 đúng; giữ chữ mới nhưng lần lưu tiếp mang version đúng. Kiểm tra cùng composable trên cả desktop/mobile.

### A03 — P1: trần 20 job chờ chưa được bảo đảm khi gửi đồng thời

**Vị trí:** `src/services/presentationService.js:137–162` và `:399–404`; `src/lib/semaphore.js:14–16`.

`create()` và `build()` kiểm `genQueue.pending` trước các thao tác DB/audit có `await`, sau đó mới đưa job vào queue. Nhiều request có thể cùng nhìn thấy còn chỗ. Semaphore chỉ hạn chế số job chạy, không từ chối khi số chờ vượt 20.

**Kiểm chứng:** gọi service thật với 50 bài/50 người giả lập; đặt barrier ở `startBuildOwned` và giữ AI chưa hoàn tất. Với concurrency = 2, kết quả là **50 yêu cầu được nhận, 48 job chờ**, vượt trần 20. Không gọi AI thật; đây là kiểm thử interleaving có điều khiển, không phải số đo throughput của máy chủ.

Đây là lỗi có sẵn chưa được chặng A sửa, nhưng làm giả định trong phản hồi Claude §7 không còn đúng: không thể chắc rằng burst 50 yêu cầu sẽ từ chối khoảng 30 yêu cầu. Một instance vẫn bị lỗi này. Nếu request kèm tệp, việc nhận vượt mức còn giữ thêm upload và kéo dài thời gian chờ.

**Sửa nhỏ đề nghị:** cơ chế giữ chỗ/admission đồng bộ trong queue cho tổng active + pending **trước** các `await` có thể tạo trạng thái nghiệp vụ. Khi DB/audit lỗi phải trả chỗ; khi từ chối phải dọn upload và không để bài mang trạng thái chờ nhưng không có job. Không chỉ dời phép kiểm tra xuống sát `.run()` sau khi đã ghi trạng thái vào DB, vì có thể tạo bản ghi mồ côi khi queue đầy.

**Test nghiệm thu:** burst 50 yêu cầu khi worker đang bị giữ phải nhận tối đa 22 với cấu hình 2 + 20, phần còn lại trả `QUEUE_FULL`; lỗi DB/audit trả lại chỗ; create và build cùng dùng tổng hạn mức; không mất chỗ hoặc nhận quá mức qua nhiều vòng.

### A04 — P2: restart giữa lúc nhân bản có dàn ý đi vào nhánh phục hồi sai

**Vị trí:** `src/services/presentationService.js:628–639`; `src/repositories/presentationRepository.js:259–267`.

Đưa bản sao về `generating` trước khi copy media là cải thiện đúng. Nhưng bản sao của chính chủ bài có thể mang `outline`. Khi restart, `failStaleGenerating()` đưa **mọi** bài `generating` có outline về `outline`, không phân biệt `source_kind='copy'`.

**Kiểm chứng MySQL thật:** tạo bản sao `source_kind=copy`, `status=generating`, outline tham chiếu asset chưa được copy; gọi đúng repository phục hồi. Kết quả là `status=outline` với thông báo “Bấm Dựng bài để thử lại”, không phải `failed` như giả định trong phản hồi. Probe gọi recovery trực tiếp, chưa thực hiện kill/restart container ứng dụng.

Theo code, người dùng có thể gọi build lại từ outline chưa đủ media; `buildDeck()` dựng lại bằng AI rồi `dropForeignAssets()` loại ID chưa có trong thư viện. Vì vậy bản sao có thể mất ảnh hoặc khác bản gốc, thay vì báo sao chép chưa hoàn tất. Phần dựng lại này là suy luận từ luồng code, chưa gọi AI để đo kết quả cuối.

**Sửa nhỏ đề nghị:** phân biệt copy với AI trong recovery. Bản copy dở → failed với thông báo đúng và cách thử sao chép lại từ nguồn; dọn phần dở có log/khả năng chạy lại. Chưa cần manifest hay job engine tổng quát. Tránh xếp copy dở vào nhánh dựng AI từ outline.

**Test nghiệm thu:** restart copy có/không có outline và đã copy 0/1/n asset; không có bài ready thiếu media; không chuyển copy dở thành outline AI; bài gốc nguyên vẹn. Sau đó có một bài test kill/restart ở môi trường Docker test.

### A05 — P2: integration có thể báo lệnh thành công dù không kiểm được gì

**Vị trí:** `test/integration/concurrency.test.js:21–31`, `:48–49` và các test phía sau.

Hook setup bắt mọi lỗi và chuyển thành skip, gồm không kết nối được DB, thiếu quyền, lỗi tạo schema và lỗi SQL. Khi job CI gọi riêng `test:integration`, exit 0 không đủ chứng minh integration đã chạy.

**Kiểm chứng:** chạy với DB test không có tại loopback cổng 1: **0 pass, 0 fail, 5 skip, exit 0**. Trên container MySQL đúng cấu hình, cả 5 test thực sự pass; không phủ nhận kết quả tốt đó. Với lỗi giữa setup sau khi mở connection, code còn thiếu `finally` đóng connection và dọn DB khi `pool` chưa được tạo.

**Sửa nhỏ đề nghị:** integration được gọi tường minh thì mặc định setup lỗi phải fail. Nếu cần chế độ optional local, dùng cờ riêng và không cho dùng cờ đó trong gate CI. DB test có tên duy nhất từng lần chạy, credentials tách biệt và teardown ở `finally`. Không cần cấp quyền tạo/xoá database cho tài khoản runtime của ứng dụng để chạy test.

**Test nghiệm thu:** DB thiếu/không đủ quyền/schema lỗi → exit khác 0; teardown không treo; CI kiểm test count và skip count; hai runner cùng lúc không drop DB của nhau.

### A06 — P2: F13 mới sửa đường mời người, đường bật công khai vẫn có lỗi một phần

**Vị trí:** `src/services/presentationService.js:577–583`.

`sharingService.addShare()` tạo baseline trước cấp quyền đã sửa đúng cửa sổ được báo. Nhưng đường `PATCH visibility=public` vẫn ghi công khai trước, ghi audit, rồi mới `ensureBaseline()`. Nếu baseline lỗi, API báo lỗi nhưng bài đã công khai và chưa có bản gốc khôi phục. Đây là phần còn sót của F13, không phải regression mới do việc đảo thứ tự ở `addShare`.

**Kiểm chứng:** chạy presentation service thật với repository giả mô phỏng baseline write failure: lời gọi update bị reject, nhưng trạng thái đã là `public`; thứ tự ghi nhận `updateOwned → audit → ensureBaseline`.

**Sửa nhỏ đề nghị:** một thao tác repository/giao dịch nhỏ khoá dòng bài, chụp baseline và bật public cùng nhau; xác định rõ baseline của request đồng thời sửa spec + bật public là bản nào. Không cần outbox tổng quát để giải quyết invariant này. Đối với đường mời người, tiếp tục test trường hợp cấp quyền thất bại sau khi đã tạo baseline; không coi việc chỉ đảo thứ tự là bảo đảm atomicity cho mọi đường chia sẻ.

**Test nghiệm thu:** inject lỗi baseline khi mời và khi public; không phát sinh quyền/trạng thái công khai ngoài ý muốn của response lỗi; hai lần chia sẻ đầu đồng thời chỉ tạo một baseline; baseline ứng với đúng nội dung đã chốt.

## 2. Những gì đã kiểm chứng đạt

| Hạng mục | Kết quả độc lập của Codex | Giới hạn |
|---|---|---|
| Unit suite trên snapshot commit | **169 pass, 0 fail, 0 skip** sau build | Lần trước build: 168 pass, 1 skip vì thiếu bundle 3D; đã chạy lại đầy đủ |
| Integration MySQL 8.4 thật, container riêng | **5 pass, 0 fail, 0 skip** | Test repository/DDL, chưa phải 30 luồng HTTP của chặng B |
| Frontend + deck3d build | **Đạt** | Vite dùng `--configLoader native` với dependencies đã cài, không thực hiện clean npm ci |
| Kiểm whitespace của diff | `git diff --check 09cbc5a..233d348` đạt | Không thay thế lint/typecheck |
| Probe bổ sung | Tái hiện 3 tình huống mất chữ, queue 48 chờ, copy recovery, public/baseline, smoke bootstrap, integration skip | Phân biệt rõ probe dùng mock với MySQL thật trong từng finding |
| Source gốc | HEAD đúng commit, working tree sạch trước/sau review | Không sửa code, không commit/push |

MySQL test đã chạy trên container mới riêng biệt, database tạm đã được dọn; container review cũng đã xoá. Không mở quyền trên MySQL dự án cổng 3307, không đọc `.env`, không sửa stack Docker đang chạy.

**Chưa chạy lại:** smoke HTTP trên app sẵn có, AI/Gemini thật, E2E giao diện, conversion Office bằng fixture tấn công, load 500 người, kill/restart ứng dụng thật. Kết quả Docker/AI “TẤT CẢ ĐẠT” trong file `08` là bằng chứng Claude cung cấp, không được gộp thành kết quả độc lập của đợt review này. Smoke chưa chạy trên stack hiện có vì A01 và yêu cầu tách dữ liệu test theo chuẩn §07. Tôi đã kiểm nhánh provisioner bằng stub an toàn.

## 3. Đối chiếu toàn bộ nhóm finding cũ với chặng A

“Đạt phần A” chỉ xác nhận sửa nhỏ đã định cho chặng này, không có nghĩa đã đạt mọi tiêu chí production của finding gốc.

| Finding | Đánh giá | Phần còn lại / quyết định |
|---|---|---|
| F01 — storeImage | **Đạt phần A**: đúng tenant/deck tại các call site đã sửa; test tạo kèm ảnh và ảnh AI pass | Chặng B kiểm qua HTTP với ảnh/video/poster thật |
| F02 — đồng bộ nháp | **Một phần**: draftVersion và save editor đã tốt hơn | A02: metadata và outline vẫn mất chữ |
| F03 — job/restart | **Đồng ý hoãn durable jobs/fencing** trong một instance | A03 phải sửa admission; A04 sửa copy recovery; trước production test restart và báo retry đúng |
| F04 — NAT limiter | **Đạt phần A**: per-user sau loadUser, IP guard trước session/DB | Chưa chứng minh mức 30000/1200 phù hợp 500 người; đo ở B |
| F05 — tải asset/render | **Đạt phần lọc asset + HTML queue** | PDF còn render/nạp asset trước chờ browser semaphore, queue browser không có hard cap/deadline chờ; HTML cap không bao trọn giai đoạn gửi về client chậm. Kiểm dưới tải ở B, chưa kết luận hết OOM |
| F06 — aggregate upload | **Đạt phần A**: đếm byte streaming, test chunked pass | Có khoản dư 20 MiB cho poster; không nhầm với quota tổng tenant/đĩa. Test abort/đầy đĩa ở B |
| F07 — admin cuối/share cap | **Đạt phần A**: transaction + lock, MySQL concurrency pass | Test HTTP quyền/nghiệp vụ và CI fail-closed còn cần |
| F08 — cleanup race | **Đạt race được sửa**: chờ các worker đang chạy rồi cleanup | allSettled chưa bảo đảm file xoá lỗi được xử lý lại; cần log/quan sát tối thiểu, ledger bền vững có thể hoãn |
| F09 — duplicate | **Đạt lỗi storage bình thường, chưa đạt restart** | A04; không cần manifest tổng quát |
| F10 — Office env | **Đạt phần env tối thiểu**, cả soffice và pdftoppm | Chưa chứng minh sandbox mạng/filesystem. Không coi proxy chết là network deny |
| F11 — mật khẩu bcrypt | **Đạt phần A**: chặn mật khẩu mới quá 72 byte | Test auth HTTP thuộc B |
| F12 — asset must-change | **Đạt phần A** trên đường unsigned | Signed URL vẫn capability có hạn, chấp nhận thiết kế; ghi đúng thời gian hiệu lực |
| F13 — baseline | **Một phần**: đã đưa baseline trước addShare | A06: đường public; chưa có giao dịch chung cho mọi đường chia sẻ |
| F14 — verifyTables | **Đạt phần bổ sung 2 bảng** | Deadline/query health/readiness sâu hơn chưa nằm trong sửa này |
| F15 — baseline/changelog | **Đạt phần chống hạ ENUM** và cập nhật quy tắc baseline mới nhất | Test “DB cũ” hiện mô phỏng bằng thu hẹp 2 ENUM trên baseline mới; chưa chứng minh mọi đường nâng cấp từ snapshot schema cũ. Tên DB cố định vẫn xử lý bằng hướng dẫn thủ công |
| F16 — phân trang/quota | **Chấp nhận hoãn phân trang mẫu** khi thư viện nhỏ | Không đồng nghĩa hoãn vô thời hạn giám sát dung lượng đĩa/quota khi có upload thật |
| F17 — config/prod | **Đạt kiểm tra URL/cookie khớp; chưa cưỡng chế HTTPS production** | Test còn cho `production + http + secure=false`. Local Docker được phân biệt với gate HTTPS ở môi trường giao DevOps |
| F18 — shutdown | **Đạt comment + grace period 30s** | Không chứng minh mọi job xong trong 20s; restart recovery vẫn là yêu cầu độc lập |
| F19 — vận hành/DR | **Hoãn khỏi A được** | Restore drill DB + storage, kế hoạch backup/rollback và quan sát cơ bản phải nằm trong gate bàn giao, không đợi nhiều instance |
| F20 — test | **Tiến bộ rõ**, 169 unit và 5 MySQL test đã xác minh | A01/A05; tiếp tục HTTP integration/E2E theo rủi ro, không gọi là phủ toàn bộ nghiệp vụ |
| F21 — nguồn chuẩn/docs | **Đạt phần lớn**: AGENTS/CLAUDE/rule 11 trỏ chuẩn đúng | `memory-bank/README.md:10` còn tên xoan-backend-standard; sửa tài liệu cùng vòng sau, không phải blocker vận hành |
| Org/redraw | **Đạt sửa không cắt nhãn và giữ asset ảnh gốc**, unit pass | Chưa xác minh thao tác UI “về ảnh gốc một bước”; vẫn cần bộ vàng, org nhiều nhánh, history/template/duplicate và các tỷ lệ thực hỗ trợ |

## 4. Trả lời trực tiếp các điểm Claude hỏi

### Mục 6: nhiều instance, limiter và LibreOffice

1. **Không có bằng chứng cần ≥ 2 instance.** Ngược lại, chủ dự án đã xác nhận một instance. Tôi rút yêu cầu ưu tiên hạ tầng nhiều instance khỏi A/B. Tiếp tục ghi rõ giới hạn vận hành này và không bật rolling overlap hai app khi recovery đang quét toàn bộ job.
2. **Không thấy bypass per-user chỉ bằng cách tự tạo nhiều cookie/phiên chưa đăng nhập trên cùng IP.** `req.user` được server nạp từ session + bản ghi user; anonymous key vẫn theo IP, không phải session ID. Test header `x-user` chỉ là harness unit, không phải production nhận header đó để xác thực. Tuy nhiên tầng anon đặt sau session/loadUser nên request có session hợp lệ vẫn có thể phát sinh DB trước khi bị chặn; mức IP 30000/phút là 500 request/giây trung bình theo cửa sổ, không phải giới hạn concurrency. Chưa đủ bằng chứng bắt làm cost bucket; cần test NAT burst, đăng nhập đầu giờ, cookie sai/phiên bị thu hồi, và trust-proxy trên cấu hình DevOps thật. Một văn phòng 500 người trung bình 60 request/người/phút đã dùng hết mức IP 30000; cần tính cả polling/asset.
3. **Chưa có fixture chứng minh LibreOffice vượt được các bước sanitize hiện tại để đọc env/file hoặc gọi mạng.** Tôi không nâng giả thuyết thành exploit đã xác nhận. Env tối thiểu là sửa đúng; không suy ra từ đó là process đã bị cô lập filesystem/network. Có thể hoãn worker riêng khỏi A; ở gate bàn giao cần ghi rõ biện pháp containment đang có, cập nhật image và kiểm fixtures âm. Nếu chưa thực hiện network/filesystem isolation, ghi rõ phần còn thiếu thay vì báo 100% hoàn tất.

### Mục 8: bốn rủi ro Claude tự nêu

| Câu hỏi | Trả lời |
|---|---|
| IP 30000, anon 1200 có bị fake-session bypass? | Không thấy bypass khoá quota bằng session giả cùng IP; số ngưỡng vẫn cần đo. Chưa cần store chia sẻ khi một instance |
| useVersions/useOutline dùng version của deck đúng không? | Handoff/restore dùng version bản đã lưu là hợp lý. Outline thực tế dùng **outlineVersion**, không phải specVersion. Không nên thay tất cả bằng draftVersion máy móc; vấn đề xác nhận là bảo toàn nháp ở A02. B bổ sung race restore/handoff với draft bẩn và save đang chạy |
| Copy generating bị recovery quét có chấp nhận? | Chấp nhận đánh dấu copy dở là failed, không chấp nhận đẩy copy có outline sang luồng AI như hiện tại. Xem A04 |
| Signed URL tiếp tục dùng được sau thu hồi quyền? | Đồng ý mô hình capability nếu được ghi rõ. Mặc định ttl 2 giờ nhưng làm tròn lên giờ nên URL mới có hiệu lực **từ 2 đến dưới 3 giờ**; không hứa “thu hồi ngay” hay “tối đa 2 giờ”. Hết hạn chặn request mới, không thu hồi byte đã tải/cache hoặc HTML offline |

## 5. Lộ trình thu gọn sau review

### A bổ sung — sửa các điểm có bằng chứng, mỗi điểm red → green

| Thứ tự | Công việc | Điều kiện đóng |
|---|---|---|
| 1 | A01: cô lập runner smoke, secrets tạm ngẫu nhiên, cleanup | Smoke không để lại admin dùng mật khẩu fixture; lỗi giữa chừng cũng dọn |
| 2 | A02: bảo toàn nháp editor metadata + outline save, thứ tự response | 3 probe hiện tại chuyển thành regression test với kỳ vọng giữ chữ; thêm save/meta đảo thứ tự |
| 3 | A03: admission/giữ chỗ atomic cho generation queue | Burst 50 không vượt 2 active + 20 pending; lỗi không rò slot/trạng thái |
| 4 | A04: recovery phân biệt copy/AI | Copy dở không đi vào dựng AI, không ready thiếu media |
| 5 | A05: integration fail khi setup lỗi, teardown chắc chắn | Gate không xanh với 0 test được chạy; không đụng DB runtime |
| 6 | A06: baseline + public nhất quán | DB lỗi không để trạng thái public dở dang; không tạo baseline trùng |

Sau vòng này chạy toàn bộ unit, integration trên DB riêng và smoke trên môi trường test riêng; cập nhật memory-bank tương ứng. Không bắt buộc hoàn thành 198 case để đóng các sửa lỗi nhỏ này.

### B — giữ hướng ~30 luồng quan trọng + bộ vàng + tải 500

Giữ kế hoạch của Claude, với những điều chỉnh cụ thể:

- HTTP + MySQL thật cho tạo có media, outline/build, hai người sửa, chia sẻ/public/handoff/restore, duplicate/restart, templates, HTML/PDF, admin/must-change/thu hồi phiên. Dùng AI stub có kiểm soát để integration lặp lại được; AI thật dành bộ vàng riêng.
- Không lấy số test làm điều kiện duy nhất. Mỗi invariant vừa sửa cần cả thành công, từ chối, lỗi phụ thuộc và thao tác đồng thời. F15 cần fixture schema cũ thực, ngoài test thu hẹp ENUM đang có.
- 500 người có think time và NAT chung; tách tỷ lệ browse/edit/create/export. Warm-up/ramp-up rồi steady 1 giờ là chặng đầu hợp lý. Có burst vào queue, client chậm khi export, dependency timeout/429 và disconnect; đo active/pending thực thay vì tin hằng số cấu hình.
- Báo cáo p50/p95/p99 HTTP, queue wait, tổng thời gian job, tỷ lệ admission reject, lỗi ngoài dự kiến, RSS/heap/external memory, CPU, đĩa, DB pool wait, quota AI. Ghi cấu hình CPU/RAM, dữ liệu và quota dùng để đo; không suy diễn 500 VU với stub thành 500 job AI thật.
- Quyết định tăng concurrency dựa trên RAM và quota. Trước khi đo tải nặng PDF, bổ sung cap/deadline chờ đơn giản nếu cần để không tích vô hạn HTML trong queue. Chưa cần budget theo trọng số, nhưng tài nguyên phải có giới hạn có hiệu lực.
- UX queue: hiển thị đã nhận/đang chờ/đang xử lý và thời gian chờ đo được. Vị trí/ETA chỉ đưa ra khi có dữ liệu đủ tin cậy; không hứa một con số cố định từ phép ước tính 30–60 giây/job.

### Gate bàn giao DevOps — tách khỏi “C chỉ khi cần scale”

Không nên để mọi mục F19 chờ đến lúc có nhiều instance. Chuẩn MISA §13.4 yêu cầu backup dữ liệu quan trọng và xác minh restore. Một máy chủ mất volume vẫn mất dữ liệu.

Trước khi coi gói Docker đủ điều kiện production cần: cấu hình HTTPS/cookie và proxy/allowlist được kiểm thực; backup + restore thử **DB và storage cùng nhau**; RPO/RTO được chốt; runbook khởi động, nâng schema, rollback, sự cố queue/đĩa/DB; quan sát và cảnh báo cơ bản về lỗi, RAM, đĩa và job treo. Có thể tận dụng công cụ DevOps đã có, không bắt dựng một hệ monitoring lớn trong ứng dụng.

Đề nghị giữ production HTTP như hiện tại chỉ cho môi trường local/test có chủ đích; không dùng test “URL/cookie khớp” để tuyên bố gate TLS production đã đạt. Chưa đưa ra chứng nhận tải hay mức tuân thủ 100% khi những mục này chưa được kiểm chứng.

### C — chỉ mở khi có số đo hoặc thay đổi yêu cầu

Jobs bền vững/fencing/store limiter chia sẻ khi nhiều instance hoặc cần resume không mất job; tách worker khi cạnh tranh CPU/RAM ảnh hưởng API; budget theo trọng số khi cap đơn giản không đáp ứng; cleanup ledger khi phần dư qua crash trở thành rủi ro vận hành; stress 1000/soak dài khi có mục tiêu tương ứng. Phần cô lập converter đánh giá theo rủi ro xử lý tệp và gate an toàn của DevOps, không chỉ theo số người.

Không đề nghị quay lại kế hoạch 46–69 ngày công ban đầu như điều kiện cứng. Chốt lại effort sau vòng A bổ sung và số đo B; hiện chưa có dữ liệu để hứa chắc tổng số ngày.

## 6. Bằng chứng và phạm vi bàn giao

Log và các probe tái hiện: [evidence/review-chang-a/README.md](evidence/review-chang-a/README.md). Probe dùng assertion xác nhận **lỗi đang tồn tại**, nên exit 0 của probe không có nghĩa ứng dụng đạt yêu cầu; chi tiết có trong README. Đây là tài liệu và công cụ review ngoài repo, không phải test đã được thêm vào bộ test chính thức của dự án.

Đề xuất quyết định: giữ commit A làm nền vì các sửa đúng đã được kiểm lại; thực hiện một vòng A bổ sung cho sáu nhóm trên, sau đó tiếp tục B theo phạm vi một instance đã thống nhất. Không cần viết lại kiến trúc để giải quyết những vấn đề hiện đã có bằng chứng.
