// Trang tự do (layout 'free'): danh mục phần tử + mẫu bố cục gợi ý khi chèn trang trắng.
// Dùng chung cho server (specService chuẩn hoá), renderer (render.js) và trình soạn thảo (chèn trang, bảng thuộc tính).
// Toạ độ phần tử tính theo % khung slide (x, y = góc trên trái; w, h = kích thước) → giữ đúng vị trí khi đổi tỷ lệ khung.

export const FREE_TYPES = Object.freeze(['text', 'image', 'video', 'table', 'shape', 'logo3d']);
// Kiểu chữ: cỡ gốc (px trên khung cao 1440) + độ đậm — người dùng phóng to/thu nhỏ bằng hệ số size.
export const TEXT_STYLES = Object.freeze({
  title: { label: 'Tiêu đề lớn', px: 96, weight: 800 },
  heading: { label: 'Tiêu đề mục', px: 60, weight: 700 },
  body: { label: 'Nội dung', px: 38, weight: 400 },
  caption: { label: 'Chú thích', px: 28, weight: 400 },
  label: { label: 'Nhãn nhỏ (IN HOA)', px: 26, weight: 700 },
});
export const TEXT_ALIGNS = Object.freeze(['left', 'center', 'right']);
export const TEXT_VALIGNS = Object.freeze(['top', 'middle', 'bottom']);
// Màu theo token của theme (tự đổi theo tông màu bài) — không cho nhập mã màu tự do để bài luôn hài hoà.
export const TEXT_COLORS = Object.freeze({ text: 'Màu chữ chính', accent: 'Màu nhấn', 'accent-2': 'Màu nhấn phụ', muted: 'Xám', white: 'Trắng', dark: 'Đen' });
export const FILLS = Object.freeze({ none: 'Không nền', panel: 'Thẻ', soft: 'Nền nhạt màu nhấn', accent: 'Màu nhấn', dark: 'Tối' });
export const SHAPES = Object.freeze({ rect: 'Chữ nhật', round: 'Bo góc', circle: 'Tròn / elip', line: 'Đường kẻ' });
export const SHAPE_FILLS = Object.freeze({ accent: 'Màu nhấn', 'accent-2': 'Màu nhấn phụ', soft: 'Nền nhạt', panel: 'Thẻ', line: 'Viền', text: 'Màu chữ' });
export const TABLE_STYLES = Object.freeze({ striped: 'Sọc xen kẽ', grid: 'Kẻ ô', lines: 'Kẻ ngang' });
export const RADII = Object.freeze({ none: 'Vuông', md: 'Bo nhẹ', lg: 'Bo nhiều', circle: 'Tròn' });
export const SIZE_RANGE = Object.freeze({ min: 0.4, max: 4 });

let seq = 0;
export const newElementId = () => `e-${Date.now().toString(36).slice(-5)}${(seq++ % 1296).toString(36).padStart(2, '0')}`;

// Phần tử mới với giá trị mặc định (vị trí giữa trang).
export function newElement(type, at = {}) {
  const base = { id: newElementId(), type, x: 30, y: 30, w: 40, h: 30, ...at };
  if (type === 'text') return { style: 'body', align: 'left', valign: 'top', color: 'text', fill: 'none', size: 1, text: 'Nhập nội dung', ...base };
  if (type === 'image') return { radius: 'md', image: null, ...base };
  if (type === 'video') return { video: null, ...base };
  // Logo nổi khối (WebGL): ảnh hiển thị trọn khung, chuyển động lắc/bồng bềnh/xoay chậm, độ dày khối 0,1–1.
  if (type === 'logo3d') return { image: null, motion: 'swing', depth: 0.5, ...base };
  if (type === 'table') {
    return {
      style: 'striped', header: true, size: 1,
      rows: [['Tiêu chí', 'Phương án A', 'Phương án B'], ['', '', ''], ['', '', '']],
      ...base, w: base.w || 60, h: base.h || 30,
    };
  }
  return { shape: 'round', fill: 'soft', opacity: 1, ...base };
}

const T = (text, style, x, y, w, h, extra = {}) => ({ type: 'text', text, style, x, y, w, h, align: 'left', valign: 'top', color: 'text', fill: 'none', size: 1, ...extra });
const I = (x, y, w, h, extra = {}) => ({ type: 'image', image: null, radius: 'md', x, y, w, h, ...extra });

// Mẫu bố cục cho trang trắng (vùng an toàn: ngang 6–94%, dọc 7–88% — chừa chân trang).
export const FREE_TEMPLATES = Object.freeze([
  { key: 'blank', label: 'Trang trắng', elements: [] },
  {
    key: 'title-body', label: 'Tiêu đề + nội dung',
    elements: [T('Tiêu đề trang', 'heading', 6.5, 8, 87, 13), T('Nội dung chính của trang — bấm đúp để sửa chữ, kéo để di chuyển, kéo góc để đổi kích thước.', 'body', 6.5, 25, 70, 50)],
  },
  {
    key: 'two-cols', label: 'Tiêu đề + 2 cột',
    elements: [T('Tiêu đề trang', 'heading', 6.5, 8, 87, 13), T('Cột trái', 'body', 6.5, 26, 41, 55, { fill: 'panel' }), T('Cột phải', 'body', 52.5, 26, 41, 55, { fill: 'panel' })],
  },
  {
    key: 'image-left', label: 'Ảnh trái – chữ phải',
    elements: [I(6.5, 10, 44, 74), T('Tiêu đề', 'heading', 55, 14, 38.5, 14), T('Nội dung mô tả cho hình ảnh bên cạnh.', 'body', 55, 32, 38.5, 48)],
  },
  {
    key: 'image-right', label: 'Chữ trái – ảnh phải',
    elements: [T('Tiêu đề', 'heading', 6.5, 14, 38.5, 14), T('Nội dung mô tả cho hình ảnh bên cạnh.', 'body', 6.5, 32, 38.5, 48), I(49.5, 10, 44, 74)],
  },
  {
    key: 'hero', label: 'Ảnh lớn + tiêu đề',
    elements: [I(0, 0, 100, 100, { radius: 'none' }), { type: 'shape', shape: 'rect', fill: 'panel', opacity: 0.86, x: 6.5, y: 52, w: 52, h: 34 }, T('Thông điệp chính', 'title', 9, 56, 47, 16), T('Mô tả ngắn', 'body', 9, 74, 47, 9)],
  },
  {
    key: 'table', label: 'Tiêu đề + bảng',
    elements: [T('Bảng so sánh', 'heading', 6.5, 8, 87, 13), { type: 'table', style: 'striped', header: true, size: 1, rows: [['Tiêu chí', 'Phương án A', 'Phương án B'], ['Chi phí', '', ''], ['Thời gian', '', ''], ['Hiệu quả', '', '']], x: 6.5, y: 26, w: 87, h: 56 }],
  },
  {
    key: 'video', label: 'Tiêu đề + video',
    elements: [T('Video giới thiệu', 'heading', 6.5, 8, 87, 13), { type: 'video', video: null, x: 20, y: 25, w: 60, h: 60 }],
  },
  {
    key: 'three-images', label: '3 ảnh + chú thích',
    elements: [
      T('Hình ảnh nổi bật', 'heading', 6.5, 8, 87, 13),
      I(6.5, 26, 27.5, 44), I(36.25, 26, 27.5, 44), I(66, 26, 27.5, 44),
      T('Chú thích 1', 'caption', 6.5, 72, 27.5, 9, { align: 'center' }), T('Chú thích 2', 'caption', 36.25, 72, 27.5, 9, { align: 'center' }), T('Chú thích 3', 'caption', 66, 72, 27.5, 9, { align: 'center' }),
    ],
  },
  {
    key: 'big-number', label: 'Con số lớn',
    elements: [T('KẾT QUẢ NỔI BẬT', 'label', 6.5, 14, 87, 6, { color: 'accent' }), T('120%', 'title', 6.5, 24, 87, 30, { size: 2.2, color: 'accent' }), T('Diễn giải ngắn cho con số', 'body', 6.5, 62, 70, 14)],
  },
]);

// Dựng trang tự do từ mẫu (mỗi phần tử nhận id mới).
export function elementsFromTemplate(key) {
  const tpl = FREE_TEMPLATES.find((t) => t.key === key) || FREE_TEMPLATES[0];
  return tpl.elements.map((e) => ({ ...JSON.parse(JSON.stringify(e)), id: newElementId() }));
}
