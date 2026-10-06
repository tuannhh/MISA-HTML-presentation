// Tên mẫu nền 3D + logo nổi khối — module nhỏ không phụ thuộc three.js (server, renderer, giao diện dùng chung).
// Mã vẽ 3D ở shared/deck/deck3d.js (đóng gói riêng, chỉ nhúng vào bài có dùng 3D). engine.js giữ bản sao FALLBACK_2D (test đối chiếu).
export const NAMES_3D = Object.freeze(['globe3d', 'terrain3d', 'galaxy3d', 'city3d']);
export const LABELS_3D = Object.freeze({ globe3d: 'Địa cầu 3D', terrain3d: 'Địa hình 3D', galaxy3d: 'Thiên hà 3D', city3d: 'Thành phố 3D' });
// Máy không có WebGL (hoặc bản xuất không kèm gói 3D) → nền 2D gần giống nhất.
export const FALLBACK_2D = Object.freeze({ globe3d: 'orbits', terrain3d: 'waves', galaxy3d: 'particles', city3d: 'grid' });
export const LOGO_MOTIONS = Object.freeze({ swing: 'Lắc qua lại', float: 'Bồng bềnh', turn: 'Xoay chậm' });

// Bài có dùng hiệu ứng 3D (nền 3D hoặc phần tử logo 3D) → cần nhúng gói deck3d.
export function uses3d(spec) {
  if (NAMES_3D.includes(spec?.background)) return true;
  return (spec?.slides || []).some((s) => (s.elements || []).some((e) => e.type === 'logo3d'));
}
