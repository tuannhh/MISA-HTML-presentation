// Mã QR vẽ bằng SVG từ đường link người dùng nhập (trang Liên hệ / Ưu đãi) — vector nên nét ở mọi cỡ, in PDF vẫn quét được.
// Dùng lõi thư viện `qrcode` (chỉ tính ma trận điểm, không vẽ canvas/tệp) → chạy được cả ở server lẫn trình duyệt.
// AN TOÀN: SVG chỉ gồm số (toạ độ) do hàm này sinh — nội dung link không bao giờ chèn vào HTML.
import { create } from 'qrcode/lib/core/qrcode.js';

const QUIET = 4; // vùng trắng quanh mã (chuẩn ≥ 4 ô) — máy quét cần để nhận diện

/** Ma trận QR → { size, d } (path các ô tối, mỗi đoạn liền trên 1 hàng là 1 hình chữ nhật) | null nếu không mã hoá được. */
export function qrPath(text) {
  const t = String(text ?? '');
  if (!t) return null;
  let q;
  try {
    q = create(t, { errorCorrectionLevel: 'M' });
  } catch {
    return null;
  }
  const n = q.modules.size;
  const data = q.modules.data;
  let d = '';
  for (let y = 0; y < n; y += 1) {
    let x = 0;
    while (x < n) {
      if (!data[y * n + x]) {
        x += 1;
        continue;
      }
      let w = 1;
      while (x + w < n && data[y * n + x + w]) w += 1;
      d += `M${x} ${y}h${w}v1h-${w}z`;
      x += w;
    }
  }
  return { size: n, d };
}

/** SVG mã QR (nền trắng + vùng trắng 4 ô) | '' nếu không mã hoá được. */
export function qrSvg(text, label = 'Mã QR') {
  const q = qrPath(text);
  if (!q) return '';
  const v = q.size + QUIET * 2;
  const lab = String(label).replace(/[&<>"']/g, '');
  return `<svg class="qr-svg" viewBox="-${QUIET} -${QUIET} ${v} ${v}" shape-rendering="crispEdges" role="img" aria-label="${lab}"><rect x="-${QUIET}" y="-${QUIET}" width="${v}" height="${v}" fill="#FFFFFF"/><path d="${q.d}" fill="#111111"/></svg>`;
}
