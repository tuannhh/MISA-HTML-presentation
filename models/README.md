# models/ — mô hình AI chạy cục bộ

## `u2netp.onnx` — tách nền logo bằng AI

Dùng bởi `src/services/cutoutService.js` (chế độ `ai`, hoặc `auto` khi viền ảnh không đồng màu: nền ảnh chụp, gradient). Chạy CPU bằng `onnxruntime-node` trong một worker thread; không gọi dịch vụ ngoài.

| Mục | Giá trị |
|---|---|
| Mô hình | U²-Net bản nhỏ (`u2netp`), phát hiện vật thể nổi bật, đầu vào 1×3×320×320 float32 |
| Nguồn tải | https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx |
| Kích thước | 4 574 861 byte (~4,4 MB) |
| SHA-256 | `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8` |
| Giấy phép | Apache License 2.0 — U-2-Net của Xuebin Qin và cộng sự (https://github.com/xuebinqin/U-2-Net); bản chuyển ONNX từ dự án rembg (MIT). Toàn văn: [`LICENSE-U2NET.txt`](LICENSE-U2NET.txt) |

Tệp được giữ nguyên, không sửa đổi. Khi phân phối lại (image Docker, gói cài đặt) phải kèm `LICENSE-U2NET.txt`.

### Tải lại / kiểm tra

```bash
curl -fL -o models/u2netp.onnx https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx
shasum -a 256 models/u2netp.onnx   # Linux: sha256sum models/u2netp.onnx
# phải ra: 309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8
```

Thiếu tệp hoặc `onnxruntime-node` không nạp được → service tự lùi về tách theo màu nền và trả ghi chú
"Không có mô hình AI, đã dùng tách theo màu nền" (không lỗi).
