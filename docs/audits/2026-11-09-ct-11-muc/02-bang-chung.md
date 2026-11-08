# Bằng chứng thực thi — CT 09/11/2026

## Phiên bản và cách cô lập

- HEAD: `3e2c5d36cf4d03c9b9b10e9cd297e29e790af673`; base: `827da35`; nhánh `feature/cai-tien-11-muc`. Working tree sạch trước audit.
- Snapshot **416 tệp tracked**, loại `.env*` và `docs/audits/`, lấy nội dung từ HEAD bằng `git show`. [Manifest SHA-256](evidence/source-manifest.json).
- Thư mục thử: `tmp/codex-ct-audit-20261109/`; snapshot có symlink tới `node_modules` đã cài. Không chạy install, không đọc `.env` hay tài khoản thử có sẵn.
- Host Node `v24.16.0`; container Node `v24.22.2`, Chromium `/usr/bin/chromium`, MySQL 8.4. [Metadata](evidence/metadata.json) chứa image ID đã dùng.
- App 8088 đang chạy có **131/131 hash src/shared khớp HEAD**: [runtime-hashes.json](evidence/runtime-hashes.json). Đây không phải kiểm chứng hash toàn bộ dependency hoặc dist của container đang chạy. UI audit dùng dist mới build từ snapshot.
- Chromium/probe dùng container tạm, source mount read-only. Test có DB dùng network Docker `--internal`, MySQL riêng không mở cổng host. Probe SSRF/HTML/render/ffmpeg dùng `--network none`. Không mount secret hoặc data ứng dụng thật vào các container thử.

## Lệnh và kết quả thật

Các đường dẫn dưới đây tính từ repo, trừ khi ghi rõ snapshot. Log đi kèm là kết quả của lượt chạy cuối hợp lệ, không phải kết quả dự kiến.

| Kiểm tra | Lệnh/thao tác đã thực hiện | Kết quả và bằng chứng |
|---|---|---|
| Git | `git rev-parse HEAD`, `git log --oneline 827da35..HEAD`, `git diff 827da35..HEAD`, `git diff --check` | HEAD như trên; diff whitespace không báo lỗi. Không commit/push. |
| Unit | `npm test` trong snapshot | **315 pass / 0 fail / 0 skip**, khoảng 2,85 giây. [unit-network.log](evidence/unit-network.log) |
| Build | Vite build với `--configLoader native`, sau đó `node scripts/build-deck3d.mjs`, trong snapshot | Thành công; **206 module frontend**, có gói deck3d. [build.log](evidence/build.log). Đây là hai bước của build với đổi cách nạp config để không ghi file cache vào node_modules gốc qua symlink; không tuyên bố đã chạy nguyên xi `npm run build` mà không điều chỉnh harness. |
| Layout | `CHROME_PATH=/usr/bin/chromium node scripts/layout-audit.mjs` trong Docker | Exit 0; **0 trang có lỗi** theo script mặc định. [layout-docker.log](evidence/layout-docker.log), [report rỗng](evidence/layout-report.json). Không thêm/bớt case hay sửa script. |
| Integration | `node --test --test-concurrency=1 'test/integration/**/*.test.js'` trong Docker, `NODE_ENV=test`, `CHROME_NO_SANDBOX=true`, IT_DB riêng | **44 pass / 0 fail / 0 skip**, khoảng 25,5 giây. Có HTTP app thật, Chromium/PDF thật, AI giả. [integration.log](evidence/integration.log) |
| Docker 8088 | `curl http://localhost:8088/api/health`; GET `/` | Cả hai HTTP 200; health `{"data":{"status":"ok"}}`. [health8088.json](evidence/health8088.json). `/health` cũng trả 200 nhưng là fallback SPA nên không dùng làm bằng chứng health. |
| HTML SSRF | `browser-probe.mjs`, Docker không mạng ngoài | Fetch bị chặn; popup GET và WebSocket handshake tới loopback của probe vẫn xảy ra; import timeout 503 sau đó. **CT-001**. [log](evidence/browser-probe.log) |
| Giữ nguyên / video sai | `node service-probes.mjs`, host, service thật + repositories/storage/AI double | 3 trang nguồn → nhận 2; 13 dòng AI → còn 12; video hỏng vẫn stored+outline ready; 41 trang=422/0 AI. **CT-002/003**. [log](evidence/service-probes.log) |
| Editor / ảnh race | `node editor-probes.mjs`, composable thật + alias/fake API sẵn của test | Danh sách 12→10→10; xoá A khi upload → chèn vào B. **CT-006/007**. [log](evidence/editor-probes.log) |
| Video lỗi / concurrency | `node optimizer-probes.mjs` | 30 inspect → 30 probe đồng thời; putFile thành công + DB throw → 1 orphan, state failed. **CT-004/005**. [log](evidence/optimizer-probes.log) |
| Công cụ video thật | `video-real-probe.mjs` trong Docker | ftyp giả: `broken=true`; tiny.mp4: H.264, poster 4.508 byte, transcode 14.779 byte. [log](evidence/video-real-probe.log) |
| HTTP CT hai tenant | `ct-http-probes.mjs`, app/MySQL tạm | 4 thao tác folder ngoại=404, move hỗn hợp chỉ 1; video owner200/ba loại sai quyền404/add link404; mẫu thu hồi404; 5 vòng race folder không cycle. [log](evidence/ct-http-probes.log) |
| Migration | `migration-probe.mjs` | Schema từ `827da35` + 2 delta CT, replay 3 lần; cột/index/FK **đều khớp** schema HEAD. [log](evidence/migration.log) |
| UI | `ui-probe.mjs`, Chromium desktop1440×1000 và mobile390×844, owner | 5 route × 2 bề mặt, scrollWidth đúng viewport, không pageerror. Biểu đồ `0,124→124` ở cả hai; nút đổi họ bố cục cao18px. **CT-008/009**. [log](evidence/ui-probe.log), [ma trận](evidence/ui-matrix.json), [mobile](evidence/ui-mobile-edit.png), [desktop](evidence/ui-desktop-edit.png) |
| Renderer/offline/PDF | `render-probe.mjs`, không mạng ngoài | XSS marker không chạy/0 img onerror; lightbox mở; video blob readyState4/error null; 0 request ngoài; override zoom, reduced fade, fast nav1on/0off/0pre; chữ kết giữ nguyên; PDF4 trang. [log](evidence/render-probe.log), [PDF](evidence/render-new-blocks.pdf) |
| HTML mẫu lớn | `sample-import-probe.mjs`, 2 CPU/2GiB, `--network none` | 137.542.503 byte → 2.833.680 ký tự HTML nhẹ; 5 video/0 skipped; **38 trang/38 ảnh/5 khung video**, mode keys; 85.337ms. RSS Node cuối lượt 345.743.360 byte, **không phải peak RAM hay RAM toàn container**. [log](evidence/sample-import.log) |

### Những lần chạy chưa hợp lệ hoặc chưa thực hiện

- Unit lượt đầu chưa được phép mở loopback: 304 pass, 10 fail, 1 skip; lỗi môi trường EPERM và gói deck3d chưa build. Sau quyền loopback/build, chạy lại đầy đủ đạt 315/315. Không dùng lỗi lượt đầu làm finding.
- Chromium trên host không khởi động; chuyển sang Chromium Docker. Một lệnh layout Docker đầu thiếu image argument, Docker hiểu tên script là image nên thất bại trước khi chạy. Lệnh sửa lại chạy nguyên script thành công; không phải lỗi ứng dụng.
- UI lượt mở rộng sau khi sửa ô số bị hộp thoại rời trang có thay đổi chặn navigation của harness. Thêm xử lý **chấp nhận bỏ nháp thử** ở Puppeteer rồi chạy lại toàn bộ. Đây là chỉnh script thử trong tmp, không sửa app. Ma trận cuối đủ 10 lượt.
- Một số warning thumbnail `Target closed`/`browser service đã đóng` xuất hiện khi harness teardown đóng app; không suy diễn thành lỗi runtime production.
- **Không chạy full `test/smoke/smoke.mjs` trên 8088**, không chạy script cá nhân dùng credentials có sẵn, không rebuild/redeploy app đang chạy. HTTP fixture cô lập bổ sung không được gọi là thay thế hoàn toàn smoke này.
- **Gemini thật: 0 lời gọi.** Unit dùng double; integration/HTTP/UI dùng fake provider nội bộ. Không kiểm live Vimeo/YouTube hoặc chất lượng AI thật.
- Không chạy load 500 users, không thử gây cạn RAM/đĩa. Test concurrency 30 inspect dùng barrier giả; nó đo số lời gọi đồng thời, không phải benchmark ffmpeg.

## Tái hiện trên máy khác

Mang **cả thư mục audit này**, không chỉ 3 file Markdown. Bằng chứng đã chép vào `evidence/` để không phụ thuộc `tmp/` bị gitignore. Không cần mang `.env`, data thật hoặc tài khoản thử. Tệp HTML mẫu 137 MB không được sao chép vào gói báo cáo; muốn thử lại cần có bản mẫu riêng.

### Chuẩn bị snapshot và probe

Đứng tại root repo có commit audited và dependency đã cài. Lệnh chuẩn bị sau chỉ tạo thư mục `tmp/ct-replay/`, không checkout hay sửa source:

```bash
python3 - <<'PY'
from pathlib import Path
import subprocess, shutil
repo = Path.cwd()
head = '3e2c5d36cf4d03c9b9b10e9cd297e29e790af673'
out = repo / 'tmp/ct-replay'
snap = out / 'snapshot'
snap.mkdir(parents=True, exist_ok=True)
files = subprocess.check_output(['git','ls-tree','-r','--name-only',head], text=True).splitlines()
for name in files:
    if name.startswith('.env') or name.startswith('docs/audits/'):
        continue
    dst = snap / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_bytes(subprocess.check_output(['git','show',f'{head}:{name}']))
if not (snap / 'node_modules').exists():
    (snap / 'node_modules').symlink_to(repo / 'node_modules', target_is_directory=True)
for src in (repo / 'docs/audits/2026-11-09-ct-11-muc/evidence').glob('*.mjs'):
    shutil.copy2(src, out / src.name)
(out / 'base-schema.sql').write_bytes(subprocess.check_output(['git','show','827da35:startup/database/schema.sql']))
PY
```

Probe host dùng imports `./snapshot/...`; bản lưu trong evidence chỉ đổi thư mục tmp tuyệt đối sang thư mục chứa script để chạy được khi chuyển máy, không đổi logic kiểm tra.

```bash
node tmp/ct-replay/service-probes.mjs
node tmp/ct-replay/editor-probes.mjs
node tmp/ct-replay/optimizer-probes.mjs
```

Build snapshot trước các thử UI/3D. Trong thư mục `tmp/ct-replay/snapshot/`:

```bash
node node_modules/vite/bin/vite.js build --configLoader native
node scripts/build-deck3d.mjs
npm test
```

Nếu máy chưa có dependency/image thì chuẩn bị bằng quy trình dự án; không dùng tag `latest` khác để kết luận khớp dependency audited. Khi xác nhận sau sửa, đổi snapshot sang commit cần xác nhận và lưu lại hash; không chỉ chạy lại commit cũ.

### Các probe Docker

Ví dụ chạy browser, video-real, render hoặc sample bằng image runtime dự án; source/test mount từ snapshot để đúng commit:

```bash
AUDIT_TMP="$PWD/tmp/ct-replay"
AUDIT_IMAGE="misa-presentation:latest"
AUDIT_PROBE="browser-probe.mjs"
docker run --rm --network none --memory 2g --cpus 2 --pids-limit 512 \
  --entrypoint node -e NODE_ENV=test \
  --mount "type=bind,src=$AUDIT_TMP/snapshot/src,dst=/app/src,readonly" \
  --mount "type=bind,src=$AUDIT_TMP/snapshot/shared,dst=/app/shared,readonly" \
  --mount "type=bind,src=$AUDIT_TMP/snapshot/test,dst=/app/test,readonly" \
  --mount "type=bind,src=$AUDIT_TMP/$AUDIT_PROBE,dst=/app/probe.mjs,readonly" \
  --mount "type=bind,src=$AUDIT_TMP,dst=/app/audit-out" \
  "$AUDIT_IMAGE" /app/probe.mjs
```

Đổi `AUDIT_PROBE` thành `video-real-probe.mjs` hoặc `render-probe.mjs`. Với `sample-import-probe.mjs`, bổ sung bind file mẫu tới `/app/sample.html:ro`. Probe SSRF **chỉ** gọi endpoint thử trong cùng container; giữ `--network none`.

Layout chạy `scripts/layout-audit.mjs` thay `/app/probe.mjs`, bổ sung mount `snapshot/scripts` → `/app/scripts:ro`, mount `$AUDIT_TMP` → `/app/tmp` và `-e CHROME_PATH=/usr/bin/chromium`. Không cần sửa script gốc.

HTTP/UI/migration/integration cần MySQL riêng. Không dùng DB của app8088. Các tên dưới khớp probe; nếu đã tồn tại tài nguyên cùng tên thì kiểm tra chủ sở hữu, không tự xoá tài nguyên lạ:

```bash
docker network create --internal codex-ct-audit-20261109
docker run -d --rm --name codex-ct-mysql-20261109 \
  --network codex-ct-audit-20261109 --memory 1g \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes -e MYSQL_ROOT_HOST=% mysql:8.4
docker exec codex-ct-mysql-20261109 mysqladmin ping --silent
```

Đây là DB **chỉ cho test**, không publish port, không chứa dữ liệu thật. Đợi ping thành công. Dùng lệnh Docker probe phía trên nhưng:

- Đổi network thành `codex-ct-audit-20261109`.
- Thêm `-e CHROME_PATH=/usr/bin/chromium -e CHROME_NO_SANDBOX=true -e IT_DB_HOST=codex-ct-mysql-20261109 -e IT_DB_USER=root -e IT_DB_PASSWORD=`.
- Thêm mount `snapshot/startup` → `/app/startup:ro`, `snapshot/dist` → `/app/dist:ro`; migration thêm `base-schema.sql` → `/app/base-schema.sql:ro`.
- Probe: `ct-http-probes.mjs`, `ui-probe.mjs`, `migration-probe.mjs`.
- Integration: thay `/app/probe.mjs` bằng `--test --test-concurrency=1 'test/integration/**/*.test.js'`; thêm mount `snapshot/scripts` → `/app/scripts:ro`.

Các probe hiện tại ghi **hành vi quan sát**, không phải tất cả đều là test assert phải xanh: một probe tái hiện lỗi có thể exit0 và in bằng chứng lỗi. Sau sửa phải chuyển expected behavior thành assert chống hồi quy theo `03-ke-hoach-sua.md`.

## Dọn dữ liệu và bàn giao

- Mỗi suite/probe gọi teardown: đóng app/browser và drop DB tạm. Kiểm `SHOW DATABASES` trước gỡ MySQL chỉ còn `information_schema`, `mysql`, `performance_schema`, `sys`.
- Đã xoá container MySQL riêng, network riêng và anonymous volume MySQL xác định đúng bằng container ID trong Docker volume event. Container thử khác chạy `--rm`. [cleanup.json](evidence/cleanup.json).
- Không tạo tài khoản/bài/folder/video trên app8088; chỉ GET health/home và đọc hash source. Không có dữ liệu thử trên app này cần chủ dự án dọn.
- Giữ có chủ đích log, script, screenshot, PDF fixture và snapshot dưới `tmp/`; báo cáo/evidence dưới `docs/audits/2026-11-09-ct-11-muc/`. Snapshot/scratch không cần mang sang máy khác khi đã có repo và evidence.
- Không sửa `memory-bank/` theo ràng buộc chỉ ghi báo cáo. Không commit/push. Khi đóng gói, đưa **toàn bộ thư mục audit và evidence** vào cùng source commit đã nêu; không dựa vào lịch sử chat để hiểu finding.
