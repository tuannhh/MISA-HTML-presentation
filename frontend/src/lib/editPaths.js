// Áp nội dung sửa trực tiếp trên khung xem trước (engine gửi {path, value}) vào bản nháp spec.
// Chỉ nhận các đường dẫn trong danh sách cho phép, cắt theo SPEC_LIMITS — khung xem trước là nguồn dữ liệu không tin cậy.
// Đường dẫn tương đối (không dùng alias @shared) để kiểm thử đơn vị chạy thẳng bằng Node.
import { SPEC_LIMITS as L } from '../../../shared/deck/limits.js';
import { hasRich, canonicalRich, cutRich, plainText, hrefWeight } from '../../../shared/deck/rich.js';
import { CONTACT_LIMITS as CL } from '../../../shared/deck/contact.js';
import { isMovePath, MOVE_LIMIT, MOVE_RANGE, DECORS, cleanHide, cleanSize } from '../../../shared/deck/layers.js';
import { newElement } from '../../../shared/deck/free.js';

const clean = (v) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const cut = (v, max) => clean(v).slice(0, max);
// Chữ có định dạng (màu/đậm/giữ liền — shared/deck/rich.js): giới hạn tính theo chữ HIỂN THỊ, thẻ sai cú pháp thành chữ thường,
// chuỗi thô quá dài (quá nhiều đoạn định dạng) → bỏ định dạng. Khớp specService.str để bản nháp không bị server từ chối
// (URL liên kết tính riêng: ≤ 8 liên kết dài tối đa mỗi ô).
const cutR = (v, max) => {
  const s = clean(v);
  if (!hasRich(s)) return s.slice(0, max);
  const r = cutRich(canonicalRich(s), max);
  const links = hrefWeight(r);
  return r.length - links > max * 4 + 400 || links > 8 * 506 ? plainText(r).slice(0, max) : r;
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
  if (p.length === 1 && ['kicker', 'title', 'subtitle', 'caption', 'root'].includes(p[0])) return set(s, p[0], L[p[0]]);
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
  // Thông tin liên hệ (trang Liên hệ / Ưu đãi): lời kêu gọi, chú thích QR là chữ có định dạng; số/email/địa chỉ/website chữ thường.
  if (p[0] === 'contact' && s.contact) {
    const ct = s.contact;
    if (p.length === 2 && p[1] === 'cta') return set(ct, 'cta', CL.cta);
    if (p.length === 2 && p[1] === 'website') return set(ct, 'website', CL.website, true);
    if (p.length === 3 && p[1] === 'qr' && p[2] === 'caption') return ct.qr ? set(ct.qr, 'caption', CL.qrCaption) : false;
    if (p.length === 3 && (p[1] === 'emails' || p[1] === 'addresses')) return at(ct[p[1]], n(2)) !== null ? set(ct[p[1]], n(2), p[1] === 'emails' ? CL.email : CL.address, true) : false;
    if (p.length === 4 && p[1] === 'phones' && (p[3] === 'number' || p[3] === 'label')) return set(at(ct.phones, n(2)), p[3], p[3] === 'number' ? CL.phone : CL.phoneLabel, true);
    return false;
  }
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
  // Ảnh mã QR của trang Liên hệ / Ưu đãi.
  if (path === 'contact.qr') return slide.contact ? { kind: 'qr', image: slide.contact.qr?.asset ? { asset: slide.contact.qr.asset, alt: '', caption: '', fit: 'contain' } : null, video: null } : null;
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
  if (t.kind === 'qr' && image !== undefined) slide.contact.qr = { ...(slide.contact.qr || { link: '', caption: '' }), asset: image?.asset || null };
  if (t.kind === 'element-image' && image !== undefined) t.element.image = image;
  if (t.kind === 'element-video' && video !== undefined) t.element.video = video;
  return true;
}

/* ---- tinh chỉnh tay trên trang có bố cục (shared/deck/layers.js) ---- */
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : null;
};

/**
 * Ô chữ được kéo dời / đổi cỡ trên khung (engine gửi 'deck:move'): x/y = % khung so với chỗ bố cục đặt, size = hệ số cỡ chữ
 * (không gửi = giữ cỡ hiện có); về chỗ cũ + cỡ gốc = xoá mục.
 * @returns {boolean} true nếu bản nháp thay đổi
 */
export function applyFrameMove(spec, index, path, x, y, size) {
  const s = at(spec?.slides, index);
  if (!s || s.layout === 'free' || !isMovePath(path)) return false;
  const X = num(x, -MOVE_RANGE, MOVE_RANGE);
  const Y = num(y, -MOVE_RANGE, MOVE_RANGE);
  if (X === null || Y === null) return false;
  const moves = { ...(s.moves || {}) };
  const old = moves[path];
  const S = size === undefined || size === null ? old?.s ?? 1 : cleanSize(size);
  const reset = Math.abs(X) < 0.05 && Math.abs(Y) < 0.05 && S === 1;
  if (reset) {
    if (!old) return false;
    delete moves[path];
  } else {
    if (old && old.x === X && old.y === Y && (old.s ?? 1) === S) return false;
    if (!old && Object.keys(moves).length >= MOVE_LIMIT) return false;
    moves[path] = S === 1 ? { x: X, y: Y } : { x: X, y: Y, s: S };
  }
  if (Object.keys(moves).length) s.moves = moves;
  else delete s.moves;
  return true;
}

/** Bật/tắt 1 hoạ tiết của trang (hidden = true → ẩn). */
export function setDecorHidden(slide, key, hidden) {
  if (!slide || !DECORS[key]) return false;
  const cur = new Set(slide.hide || []);
  if (cur.has(key) === !!hidden) return false;
  if (hidden) cur.add(key);
  else cur.delete(key);
  const next = cleanHide([...cur]);
  if (next) slide.hide = next;
  else delete slide.hide;
  return true;
}

// Hình khối thay hoạ tiết: gần giống dáng hoạ tiết cũ.
const DECO_SHAPE = { art: 'circle', vs: 'circle', qmark: 'round', secno: 'round' };

/**
 * Thao tác trên hoạ tiết bấm chọn ở khung (engine gửi 'deck:deco'): 'hide' xoá, 'shape' / 'image' = xoá + đặt hình khối / ảnh
 * vào đúng hộp của hoạ tiết (box % khung). Hình bìa thay bằng ảnh → dùng ô media của trang bìa (bố cục tự chia cột).
 * @returns {{ changed: boolean, element?: object, media?: { path: string, kind: 'image', aspect: number } }}
 */
export function applyDeco(slide, key, action, box, { ratio = 16 / 9, maxElements = L.elements } = {}) {
  if (!slide || slide.layout === 'free' || !DECORS[key]?.pick || !['hide', 'image', 'shape'].includes(action)) return { changed: false };
  const b = box && typeof box === 'object' ? box : {};
  const rect = { x: num(b.x, -50, 100) ?? 40, y: num(b.y, -50, 100) ?? 30, w: num(b.w, 2, 100) ?? 20, h: num(b.h, 2, 100) ?? 20 };
  if (action === 'image' && key === 'art' && slide.layout === 'cover') return { changed: false, media: { path: 'slot', kind: 'image', aspect: 1 } };
  if (action === 'hide') return { changed: setDecorHidden(slide, key, true) };
  if ((slide.elements || []).length >= maxElements) return { changed: setDecorHidden(slide, key, true), full: true };
  setDecorHidden(slide, key, true);
  const el =
    action === 'shape'
      ? newElement('shape', { ...rect, shape: DECO_SHAPE[key] || 'round', fill: key === 'vs' ? 'accent' : 'soft' })
      : newElement('image', { ...rect, radius: key === 'vs' || key === 'art' ? 'circle' : 'md' });
  slide.elements = slide.elements || [];
  slide.elements.push(el);
  return { changed: true, element: el, media: action === 'image' ? { path: `elements.${el.id}`, kind: 'image', aspect: (rect.w * ratio) / rect.h } : undefined };
}

/**
 * Đổi kiểu phần tử chèn: ảnh ↔ hình khối (giữ vị trí, kích thước, thứ tự lớp, "hiện khi bấm").
 * @returns {object|null} phần tử mới (cùng id) hoặc null
 */
export function convertElement(slide, id, to) {
  const list = slide?.elements;
  const k = Array.isArray(list) ? list.findIndex((e) => e.id === id) : -1;
  if (k < 0 || !['image', 'shape'].includes(to) || list[k].type === to) return null;
  const src = list[k];
  if (!['image', 'shape'].includes(src.type)) return null;
  const keep = { id: src.id, x: src.x, y: src.y, w: src.w, h: src.h, ...(src.step ? { step: true } : {}) };
  const el =
    to === 'shape'
      ? newElement('shape', { ...keep, shape: src.radius === 'circle' ? 'circle' : src.radius === 'none' ? 'rect' : 'round' })
      : newElement('image', { ...keep, radius: src.shape === 'circle' ? 'circle' : src.shape === 'rect' ? 'none' : 'md' });
  el.id = src.id;
  list.splice(k, 1, el);
  return el;
}

/**
 * Danh sách (items/steps/stats/columns/tags/images) đổi thứ tự hoặc xoá mục trên bảng điều khiển → vị trí chữ đã dời đi theo mục.
 * op: { from, to } (đổi chỗ) | { remove } (xoá). Gọi TRƯỚC khi đổi mảng.
 */
export function shiftMoves(slide, list, op) {
  if (!slide?.moves) return;
  const re = new RegExp(`^${list}\\.(\\d+)(\\..*)?$`);
  const next = {};
  for (const [k, v] of Object.entries(slide.moves)) {
    const m = re.exec(k);
    if (!m) {
      next[k] = v;
      continue;
    }
    let i = Number(m[1]);
    if (op.remove !== undefined) {
      if (i === op.remove) continue;
      if (i > op.remove) i -= 1;
    } else if (op.from !== undefined) {
      if (i === op.from) i = op.to;
      else if (i === op.to) i = op.from;
    }
    next[`${list}.${i}${m[2] || ''}`] = v;
  }
  if (Object.keys(next).length) slide.moves = next;
  else delete slide.moves;
}
