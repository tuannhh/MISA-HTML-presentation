// Áp nội dung sửa trực tiếp trên khung xem trước (engine gửi {path, value}) vào bản nháp spec.
// Chỉ nhận các đường dẫn trong danh sách cho phép, cắt theo SPEC_LIMITS — khung xem trước là nguồn dữ liệu không tin cậy.
// Đường dẫn tương đối (không dùng alias @shared) để kiểm thử đơn vị chạy thẳng bằng Node.
import { SPEC_LIMITS as L } from '../../../shared/deck/limits.js';
import { hasRich, canonicalRich, cutRich, plainText } from '../../../shared/deck/rich.js';

const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const cut = (v, max) => clean(v).slice(0, max);
// Chữ có định dạng (màu/đậm/giữ liền — shared/deck/rich.js): giới hạn tính theo chữ HIỂN THỊ, thẻ sai cú pháp thành chữ thường,
// chuỗi thô quá dài (quá nhiều đoạn định dạng) → bỏ định dạng. Khớp specService.str để bản nháp không bị server từ chối.
const cutR = (v, max) => {
  const s = clean(v);
  if (!hasRich(s)) return s.slice(0, max);
  const r = cutRich(canonicalRich(s), max);
  return r.length > max * 4 + 400 ? plainText(r).slice(0, max) : r;
};
const at = (list, i) => (Array.isArray(list) && Number.isInteger(i) && i >= 0 && i < list.length ? list[i] : null);
// Map không có prototype → khoá như '__proto__'/'constructor' từ khung xem trước không bao giờ khớp.
const ITEM_MAX = Object.assign(Object.create(null), { title: L.itemTitle, text: L.itemText, value: L.itemValue });
const STAT_MAX = Object.assign(Object.create(null), { label: L.statLabel, prefix: L.statPrefix, suffix: L.statSuffix, value: L.statText });

/** @returns {boolean} true nếu bản nháp thay đổi */
export function applyFrameEdit(spec, index, path, value) {
  if (path === '@footer') {
    const v = cut(value, L.footer);
    if (spec.footer === v) return false;
    spec.footer = v;
    return true;
  }
  const s = at(spec?.slides, index);
  if (!s || typeof path !== 'string') return false;
  const p = path.split('.');
  const n = (k) => Number.parseInt(p[k], 10);
  // Ô chữ thường (số liệu, tiền tố/hậu tố) không nhận định dạng; còn lại là chữ có định dạng.
  const set = (obj, key, max, plain = false) => {
    if (!obj) return false;
    const v = plain ? cut(value, max) : cutR(value, max);
    if (obj[key] === v) return false;
    obj[key] = v;
    return true;
  };
  if (p.length === 1 && ['kicker', 'title', 'subtitle', 'caption'].includes(p[0])) return set(s, p[0], L[p[0]]);
  if (p[0] === 'quote' && ['text', 'author', 'role'].includes(p[1])) {
    s.quote = s.quote || { text: '', author: '', role: '' };
    return set(s.quote, p[1], p[1] === 'text' ? L.quoteText : L.quoteAuthor);
  }
  if ((p[0] === 'items' || p[0] === 'steps') && ITEM_MAX[p[2]]) return set(at(s[p[0]], n(1)), p[2], ITEM_MAX[p[2]]);
  if (p[0] === 'stats' && STAT_MAX[p[2]]) return set(at(s.stats, n(1)), p[2], STAT_MAX[p[2]], p[2] !== 'label');
  if (p[0] === 'columns' && (p[2] === 'title' || p[2] === 'subtitle')) return set(at(s.columns, n(1)), p[2], p[2] === 'title' ? L.colTitle : L.colSubtitle);
  if (p[0] === 'columns' && p[2] === 'points') {
    const col = at(s.columns, n(1));
    return col && at(col.points, n(3)) !== null ? set(col.points, n(3), L.point) : false;
  }
  if (p[0] === 'tags' && p.length === 2) return at(s.tags, n(1)) !== null ? set(s.tags, n(1), L.tag) : false;
  if (p[0] === 'images' && p[2] === 'caption') return set(at(s.images, n(1)), 'caption', L.caption);
  if ((p[0] === 'image' || p[0] === 'video') && p[1] === 'caption') return set(s[p[0]], 'caption', L.caption);
  if (p[0] === 'elements') {
    const el = (s.elements || []).find((e) => e.id === p[1]);
    if (!el) return false;
    if (p[2] === 'text' && el.type === 'text') return set(el, 'text', L.elText);
    if (p[2] === 'rows' && el.type === 'table') {
      const row = at(el.rows, n(3));
      return row && at(row, n(4)) !== null ? set(row, n(4), L.cell) : false;
    }
  }
  return false;
}

// Vị trí ô media trên slide (path từ engine) → đọc/ghi tham chiếu ảnh/video trong bản nháp.
export function mediaTarget(slide, path) {
  if (!slide || typeof path !== 'string') return null;
  if (path === 'slot') return { kind: 'slot', get: () => (slide.video ? { video: slide.video } : { image: slide.image }), image: slide.image, video: slide.video };
  const m = /^images\.(\d+)$/.exec(path);
  if (m) {
    const i = Number(m[1]);
    return slide.images?.[i] !== undefined ? { kind: 'gallery', index: i, image: slide.images[i], video: null } : null;
  }
  // Ảnh/logo thay biểu tượng của 1 mục (thẻ, gạch đầu dòng, ghi chú số liệu…).
  const it = /^items\.(\d+)\.image$/.exec(path);
  if (it) {
    const item = at(slide.items, Number(it[1]));
    return item ? { kind: 'item-image', item, image: item.image || null, video: null } : null;
  }
  const e = /^elements\.(e-[a-z0-9]+)$/i.exec(path);
  if (e) {
    const el = (slide.elements || []).find((x) => x.id === e[1]);
    return el ? { kind: el.type === 'video' ? 'element-video' : 'element-image', element: el, image: el.image || null, video: el.video || null } : null;
  }
  return null;
}

// Ghi ảnh/video mới vào ô media đã chọn.
export function setMedia(slide, path, { image, video } = {}) {
  const t = mediaTarget(slide, path);
  if (!t) return false;
  if (t.kind === 'slot') {
    if (video !== undefined) {
      slide.video = video;
      if (video) slide.image = null;
    }
    if (image !== undefined) {
      slide.image = image;
      if (image) slide.video = null;
    }
    return true;
  }
  if (t.kind === 'gallery') {
    if (image) slide.images.splice(t.index, 1, image);
    else slide.images.splice(t.index, 1);
    return true;
  }
  if (t.kind === 'item-image' && image !== undefined) {
    // Xoá ảnh → mục quay về biểu tượng. Ảnh đặt lần đầu hiển thị trọn khung (logo không bị cắt); sau đó giữ lựa chọn của trình sửa ảnh.
    if (image) t.item.image = t.item.image ? image : { ...image, fit: 'contain' };
    else delete t.item.image;
  }
  if (t.kind === 'element-image' && image !== undefined) t.element.image = image;
  if (t.kind === 'element-video' && video !== undefined) t.element.video = video;
  return true;
}
