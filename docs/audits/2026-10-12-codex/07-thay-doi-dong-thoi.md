# Phụ lục: thay đổi đồng thời trong lúc audit

Trong lúc audit, working tree tiếp tục có thay đổi ngoài thao tác của audit. Snapshot kiểm thử baseline được tạo lúc10:24:43 ngày11/10/2026. Sau đó quan sát renderer/spec/AI rồi ingest/visual có diff chưa commit; HEAD vẫn `ec7bdf78d1928c7c66477109761fcc57451873c7` tại lần kiểm tra.

Các diff đã đọc bổ sung gồm `shared/deck/layers.js`, `limits.js`, `render.js`, `theme.css`, `variants.js`; `src/services/geminiService.js`, `specService.js`, `ingestService.js`, `visualService.js`. Working tree có thể tiếp tục thay đổi; đây không phải danh sách đóng băng cuối cùng.

Nhận diện chủ đích mới: layout `org` (root,2–6nhánh,tree/boxes), icon nhánh, root text move/edit; schema/prompt Gemini hỗ trợ redraw org/timeline/process; ảnh standalone đi qua visual extraction; `cleanRedraw`/`redrawPoints` chuyển nhãn sơ đồ sang dàn ý.

Không đánh giá một thay đổi đang viết dở là lỗi hoàn chỉnh chỉ vì chưa thấy mọi caller/UI/test được cập nhật. Những điểm cần kiểm chứng trước merge:

- Luồng end-to-end từ ảnh/PDF/Office → locate → redraw → outline → spec → renderer → edit/save → export. Bộ đếm13layout của audit áp dụng baseline; nhánhmới thêmorg phải được cập nhật ở mọi enum/picker/test/docs.
- `cleanRedraw` cắt chuỗi theo giới hạn và cắt items; khi dùng redraw thay ảnh gốc, có nguy cơ mất nhãn hoặc thay nghĩa. Test phải yêu cầu hoặc giữ đầy đủ nội dung, hoặc fallback về ảnh với thông báo rõ. Không chỉ kiểm rằng render ra đượcHTML.
- Timeline thiếu mốc chuyển process chỉ khi đúng chính sách; không tự biến sơ đồ nhiều tầng/rẽ nhánh/vòng lặp thành cấu trúc tuyến tính sai.
- Box phủ cả ảnh standalone khác giới hạn area của trangPDF; không nới rule cho mọi nguồn ngoài ý định.
- `root` phải đi đủ pipeline rich text, move/size, strict save, prompt, outline fallback, mobile picker và history/template/duplicate. Kiểm backward compatibility khi đọc spec cũ chưa córoot.
- Org6nhánh×8mục, tên tiếngViệt dài,3ratio,PDF print/reducedmotion/WebGL fallback; đường nối không mất khi animation không chạy.

Tám case DELTA-01…08 đã thêm vào catalogue để W02 tiếp nhận sau khi chốt diff. Chưa chạy unit/build mới cho diff còn biến động. Kế hoạch không tự sửa/cherry-pick/revert các thay đổi này.
