// Mô hình slide phía giao diện: danh sách layout, trường hiển thị theo layout, tạo slide mới.
// Dùng chung cho trình soạn thảo desktop và mobile (chỉ dữ liệu, không DOM).
import { SPEC_LIMITS } from '@shared/deck/limits.js';
import { ICON_NAMES } from '@shared/deck/icons.js';
import { elementsFromTemplate } from '@shared/deck/free.js';

export { SPEC_LIMITS };

export const LAYOUTS = [
  { value: 'cover', label: 'Trang bìa', icon: 'home' },
  { value: 'section', label: 'Mở đầu phần', icon: 'tag' },
  { value: 'agenda', label: 'Mục lục', icon: 'list' },
  { value: 'bullets', label: 'Ý chính', icon: 'list' },
  { value: 'cards', label: 'Thẻ nội dung', icon: 'layout-grid' },
  { value: 'stats', label: 'Con số nổi bật', icon: 'star' },
  { value: 'image', label: 'Ảnh / video lớn', icon: 'photo' },
  { value: 'gallery', label: 'Bộ sưu tập ảnh', icon: 'photo' },
  { value: 'timeline', label: 'Dòng thời gian', icon: 'clock' },
  { value: 'process', label: 'Quy trình', icon: 'arrow-right' },
  { value: 'quote', label: 'Trích dẫn', icon: 'message' },
  { value: 'comparison', label: 'So sánh', icon: 'copy' },
  { value: 'closing', label: 'Trang kết', icon: 'circle-check' },
  { value: 'free', label: 'Trang tự do', icon: 'layout-board' },
];
export const LAYOUT_LABEL = Object.fromEntries(LAYOUTS.map((l) => [l.value, l.label]));
export const LAYOUT_ICON = Object.fromEntries(LAYOUTS.map((l) => [l.value, l.icon]));

const HEAD = ['kicker', 'title', 'highlight', 'subtitle'];
export const LAYOUT_FIELDS = {
  cover: [...HEAD, 'tags', 'caption', 'icon', 'image'],
  section: [...HEAD, 'tags', 'image'],
  agenda: [...HEAD, 'items'],
  bullets: [...HEAD, 'items', 'image'],
  cards: [...HEAD, 'items'],
  stats: [...HEAD, 'stats', 'items'],
  image: [...HEAD, 'image', 'caption', 'items'],
  gallery: [...HEAD, 'images'],
  timeline: [...HEAD, 'steps'],
  process: [...HEAD, 'steps'],
  quote: ['kicker', 'title', 'highlight', 'quote', 'image'],
  comparison: [...HEAD, 'columns'],
  closing: ['kicker', 'title', 'subtitle', 'tags', 'caption'],
  // Trang tự do: nội dung là các phần tử (xem FreeElementsPanel) — tiêu đề chỉ dùng cho danh sách trang/ghi chú.
  free: ['title'],
};

export const ICON_OPTIONS = ICON_NAMES.map((n) => ({ label: n, value: n }));

// Tên tiếng Việt các kiểu trình bày (biến thể) của từng bố cục — khớp VARIANTS (shared/deck/variants.js), phần tử đầu = mặc định.
export const VARIANT_LABELS = {
  cover: { split: 'Chữ trái – hình phải', mirror: 'Hình trái – chữ phải', center: 'Căn giữa', bottom: 'Chữ dưới đáy' },
  section: { num: 'Số thứ tự lớn', center: 'Căn giữa', band: 'Dải màu', ghost: 'Số chìm nền' },
  agenda: { list: 'Danh sách', tiles: 'Ô lưới', split: 'Tiêu đề bên trái', path: 'Lộ trình' },
  bullets: { icons: 'Biểu tượng', numbered: 'Đánh số', split: 'Tiêu đề bên trái', panels: 'Ô nội dung', checks: 'Dấu tích' },
  cards: { grid: 'Lưới thẻ', bento: 'Bento (ô to nhỏ)', rows: 'Hàng ngang', numbered: 'Đánh số' },
  stats: { cards: 'Thẻ số liệu', hero: 'Số lớn nổi bật', bars: 'Biểu đồ thanh', rings: 'Vòng tiến độ (%)', plain: 'Tối giản' },
  image: { side: 'Ảnh trái', right: 'Ảnh phải', full: 'Ảnh tràn trang' },
  gallery: { grid: 'Lưới ảnh', mosaic: 'Ghép mảng', polaroid: 'Ảnh polaroid' },
  timeline: { line: 'Trục ngang', vertical: 'Trục dọc', zigzag: 'Zíc zắc', cards: 'Thẻ mốc' },
  process: { cards: 'Thẻ bước', chevrons: 'Mũi tên', stairs: 'Bậc thang', vertical: 'Dọc' },
  quote: { classic: 'Cổ điển', center: 'Căn giữa', band: 'Dải màu' },
  comparison: { columns: 'Cột song song', split: 'Chia đôi đối lập' },
  closing: { center: 'Căn giữa', split: 'Chia đôi', minimal: 'Tối giản' },
};
// Phong cách toàn bài (hình khối, viền, bóng) — khớp STYLES.
export const STYLE_OPTIONS = [
  { value: 'neon', label: 'Neon công nghệ', hint: 'Viền sáng, phát quang' },
  { value: 'editorial', label: 'Tạp chí', hint: 'Đường kẻ mảnh, chữ lớn' },
  { value: 'solid', label: 'Khối đặc', hint: 'Mảng màu đậm, rõ ràng' },
  { value: 'outline', label: 'Viền nét', hint: 'Tối giản, chỉ viền' },
  { value: 'soft', label: 'Mềm mại', hint: 'Bo tròn, bóng nhẹ' },
];
// Bố cục có ảnh/logo thay biểu tượng cho từng mục (renderer: mark()).
export const ITEM_IMAGE_LAYOUTS = ['bullets', 'cards', 'stats', 'image'];
// Tỷ lệ khung chữ ('16:9') → số.
export const ratioNum = (r) => {
  const m = /^(\d+):(\d+)$/.exec(String(r || ''));
  return m ? Number(m[1]) / Number(m[2]) : 16 / 9;
};
export const TONE_OPTIONS = [
  { label: 'Trung tính', value: 'neutral' },
  { label: 'Tích cực (✓)', value: 'pos' },
  { label: 'Hạn chế (✕)', value: 'neg' },
];

// Sao chép sâu dữ liệu thuần (structuredClone không nhận Proxy reactive của Vue).
export const clone = (v) => JSON.parse(JSON.stringify(v));

let seq = 0;
const newId = () => `s-${Date.now().toString(36)}${(seq++).toString(36)}`;

export const emptyItem = () => ({ icon: 'sparkles', title: '', text: '', value: '' });
export const emptyStat = () => ({ value: '', prefix: '', suffix: '', label: '' });
export const emptyColumn = () => ({ title: '', subtitle: '', tone: 'neutral', points: [''] });

// template: mẫu bố cục trang tự do (shared/deck/free.js) — chỉ dùng khi layout = 'free'.
export function newSlide(layout = 'bullets', template = 'blank') {
  const s = {
    id: newId(), layout, kicker: '', title: layout === 'free' ? 'Trang tự do' : 'Tiêu đề mới', highlight: '', subtitle: '', caption: '', icon: 'sparkles', notes: '',
    tags: [], items: [], stats: [], steps: [], columns: [], quote: { text: '', author: '', role: '' }, image: null, images: [], video: null,
  };
  if (layout === 'free') s.elements = elementsFromTemplate(template);
  return ensureLayoutContent(s);
}

// Khi đổi layout: bổ sung khung dữ liệu tối thiểu để người dùng có chỗ nhập ngay.
export function ensureLayoutContent(s) {
  if (['agenda', 'bullets', 'cards'].includes(s.layout) && !s.items.length) s.items = [emptyItem(), emptyItem(), emptyItem()];
  if (s.layout === 'stats' && !s.stats.length) s.stats = [emptyStat(), emptyStat(), emptyStat()];
  if (['timeline', 'process'].includes(s.layout) && !s.steps.length) s.steps = [emptyItem(), emptyItem(), emptyItem()];
  if (s.layout === 'comparison' && s.columns.length < 2) s.columns = [emptyColumn(), emptyColumn()];
  if (s.layout === 'quote' && !s.quote) s.quote = { text: '', author: '', role: '' };
  if (s.layout === 'free' && !Array.isArray(s.elements)) s.elements = [];
  return s;
}

// Bố cục có ô media (ảnh hoặc video) — khớp MEDIA_LAYOUTS của renderer.
export const MEDIA_LAYOUTS = ['cover', 'section', 'bullets', 'image', 'quote'];

export function duplicateSlide(s) {
  return { ...clone(s), id: newId() };
}

// Chuẩn hoá giá trị số liệu trước khi gửi: "62" → 62, "24/7" giữ chuỗi.
export function prepareSpecForSave(spec) {
  const out = clone(spec);
  for (const s of out.slides) {
    for (const st of s.stats || []) {
      const v = String(st.value ?? '').trim().replace(',', '.');
      st.value = /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : String(st.value ?? '').trim();
    }
    for (const c of s.columns || []) c.points = (c.points || []).map((p) => String(p).trim()).filter(Boolean);
    s.tags = (s.tags || []).map((t) => String(t).trim()).filter(Boolean);
    // Bố cục không có ô media → bỏ video (renderer không hiển thị, tránh dữ liệu thừa).
    if (s.video && !MEDIA_LAYOUTS.includes(s.layout)) s.video = null;
    if (s.video) s.image = null;
  }
  if (out.palette && out.theme !== 'custom') out.palette = null;
  return out;
}
