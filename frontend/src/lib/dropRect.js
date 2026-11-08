// Ô ảnh chèn khi kéo-thả/dán ảnh vào trang (toạ độ % trang) — tách riêng để kiểm thử bằng node.
const W0 = 30; // độ rộng ảnh chèn mới (% trang)
const H_MAX = 70; // cao tối đa (% trang)

/** Ô ảnh tự do (% trang) có tâm tại (x, y), đúng tỷ lệ ảnh, nằm trọn trong trang. */
export function dropRect(x, y, imgAspect, slideAspect) {
  let w = W0;
  let h = (w * slideAspect) / imgAspect;
  if (h > H_MAX) {
    w = (w * H_MAX) / h;
    h = H_MAX;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const clamp = (v, size) => Math.min(100 - size, Math.max(0, v - size / 2));
  return { x: r1(clamp(x, w)), y: r1(clamp(y, h)), w: r1(w), h: r1(h) };
}
