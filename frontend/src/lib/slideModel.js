// Mô hình slide phía giao diện: danh sách layout, trường hiển thị theo layout, tạo slide mới.
// Dùng chung cho trình soạn thảo desktop và mobile (chỉ dữ liệu, không DOM).
import { SPEC_LIMITS } from '@shared/deck/limits.js';
import { ICON_NAMES } from '@shared/deck/icons.js';

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
};

export const ICON_OPTIONS = ICON_NAMES.map((n) => ({ label: n, value: n }));
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

export function newSlide(layout = 'bullets') {
  const s = {
    id: newId(), layout, kicker: '', title: 'Tiêu đề mới', highlight: '', subtitle: '', caption: '', icon: 'sparkles', notes: '',
    tags: [], items: [], stats: [], steps: [], columns: [], quote: { text: '', author: '', role: '' }, image: null, images: [], video: null,
  };
  return ensureLayoutContent(s);
}

// Khi đổi layout: bổ sung khung dữ liệu tối thiểu để người dùng có chỗ nhập ngay.
export function ensureLayoutContent(s) {
  if (['agenda', 'bullets', 'cards'].includes(s.layout) && !s.items.length) s.items = [emptyItem(), emptyItem(), emptyItem()];
  if (s.layout === 'stats' && !s.stats.length) s.stats = [emptyStat(), emptyStat(), emptyStat()];
  if (['timeline', 'process'].includes(s.layout) && !s.steps.length) s.steps = [emptyItem(), emptyItem(), emptyItem()];
  if (s.layout === 'comparison' && s.columns.length < 2) s.columns = [emptyColumn(), emptyColumn()];
  if (s.layout === 'quote' && !s.quote) s.quote = { text: '', author: '', role: '' };
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
