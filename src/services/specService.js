// Chuẩn hoá đặc tả bài trình bày (spec). Allowlist từng trường — trường lạ bị bỏ, không mass-assignment.
// Hai chế độ:
//  - lenient (kết quả AI): tự cắt chuỗi quá dài, thay giá trị lạ bằng mặc định, bỏ phần tử thừa.
//  - strict (người dùng lưu): vượt giới hạn → trả danh sách lỗi để API báo 422 (không âm thầm cắt dữ liệu người dùng).
import { randomUUID } from 'node:crypto';
import { LAYOUTS, THEMES, BACKGROUNDS, LOGO_POSITIONS, LOGO_SHOW, LOGO_SIZE, BRAND_SLOTS, BUILDS } from '../../shared/deck/render.js';
import { hasRich, canonicalRich, plainText, cutRich } from '../../shared/deck/rich.js';
import { CUSTOM_THEME, normHex } from '../../shared/deck/palette.js';
import { FONT_IDS, DEFAULT_FONT } from '../../shared/deck/fonts.js';
import { ICON_NAMES } from '../../shared/deck/icons.js';
import { isUuid } from '../repositories/tenantScope.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { LOGO_MOTIONS } from '../../shared/deck/bg3d.js';
import { VARIANTS, STYLES } from '../../shared/deck/variants.js';
import { FREE_TYPES, TEXT_STYLES, TEXT_ALIGNS, TEXT_VALIGNS, TEXT_COLORS, FILLS, SHAPES, SHAPE_FILLS, TABLE_STYLES, RADII, SIZE_RANGE } from '../../shared/deck/free.js';

export { SPEC_LIMITS };


const ICON_SET = new Set(ICON_NAMES);
const LAYOUT_SET = new Set(LAYOUTS);
const TONES = new Set(['neg', 'pos', 'neutral']);
const ID_RE = /^[a-z0-9-]{1,40}$/i;
export const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const uuidOrNull = (v) => (typeof v === 'string' && isUuid(v) ? v.toLowerCase() : null);

function makeCtx(strict) {
  const errors = [];
  return {
    strict,
    errors,
    str(v, max, path) {
      if (v === undefined || v === null) return '';
      if (typeof v !== 'string' && typeof v !== 'number') {
        if (strict) errors.push(`${path}: phải là chuỗi`);
        return '';
      }
      // Bỏ ký tự điều khiển (trừ xuống dòng/tab), chuẩn hoá khoảng trắng đầu cuối.
      let s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
      // Chữ có định dạng (màu/đậm/giữ liền — shared/deck/rich.js): độ dài tính theo chữ HIỂN THỊ; thẻ sai cú pháp thành chữ thường.
      // Trần thô (gồm thẻ) chặn chuỗi phình to vì quá nhiều đoạn định dạng.
      if (hasRich(s)) {
        s = canonicalRich(s);
        const len = plainText(s).length;
        if (len > max || s.length > max * 4 + 400) {
          if (strict) errors.push(`${path}: tối đa ${max} ký tự`);
          return len > max ? cutRich(s, max) : plainText(s).slice(0, max);
        }
        return s;
      }
      if (s.length > max) {
        if (strict) errors.push(`${path}: tối đa ${max} ký tự`);
        return s.slice(0, max).trim();
      }
      return s;
    },
    arr(v, max, path) {
      if (v === undefined || v === null) return [];
      if (!Array.isArray(v)) {
        if (strict) errors.push(`${path}: phải là danh sách`);
        return [];
      }
      if (v.length > max) {
        if (strict) errors.push(`${path}: tối đa ${max} phần tử`);
        return v.slice(0, max);
      }
      return v;
    },
    obj(v) {
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    },
  };
}

const num = (v, min, max, dp = 2) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const k = 10 ** dp;
  return Math.round(Math.min(max, Math.max(min, n)) * k) / k;
};

// Thông số chỉnh ảnh (đã "nướng" vào ảnh mới ở server; giữ lại để mở trình chỉnh sửa tiếp tục từ ảnh gốc `src`).
// crop: vùng cắt theo tỷ lệ 0–1 của ảnh SAU khi lật + xoay; rotate: độ; brightness/saturation/contrast: -100…100.
export function cleanImageEdit(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  const cr = v.crop && typeof v.crop === 'object' ? v.crop : null;
  if (cr) {
    const x = num(cr.x, 0, 1, 4) ?? 0;
    const y = num(cr.y, 0, 1, 4) ?? 0;
    const w = num(cr.w, 0.02, 1 - x, 4);
    const h = num(cr.h, 0.02, 1 - y, 4);
    if (w && h && (x > 0 || y > 0 || w < 1 || h < 1)) out.crop = { x, y, w, h };
  }
  const r = num(v.rotate, -360, 360, 1);
  if (r && r % 360 !== 0) out.rotate = r;
  if (v.flipH === true) out.flipH = true;
  if (v.flipV === true) out.flipV = true;
  for (const k of ['brightness', 'saturation', 'contrast']) {
    const n = num(v[k], -100, 100, 0);
    if (n) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

function cleanImage(c, v, path) {
  const o = c.obj(v);
  const asset = typeof o.asset === 'string' && isUuid(o.asset) ? o.asset.toLowerCase() : null;
  if (o.asset && !asset && c.strict) c.errors.push(`${path}.asset: mã ảnh không hợp lệ`);
  const img = { asset, alt: c.str(o.alt, SPEC_LIMITS.alt, `${path}.alt`), caption: c.str(o.caption, SPEC_LIMITS.caption, `${path}.caption`), fit: o.fit === 'contain' ? 'contain' : 'cover' };
  // Khung trình duyệt cho ảnh giao diện phần mềm (chỉ với ảnh trọn khung).
  if (o.frame === 'browser' && img.fit === 'contain') img.frame = 'browser';
  // Ảnh đã chỉnh sửa: src = ảnh gốc, edit = thông số đã áp (để chỉnh tiếp không giảm chất lượng qua nhiều lần nén).
  const src = uuidOrNull(o.src);
  const edit = src && src !== asset ? cleanImageEdit(o.edit) : null;
  if (asset && edit) Object.assign(img, { src, edit });
  // Vị trí ảnh trong khung (object-position %) + phóng to — khung giữ nguyên, ảnh dịch/zoom bên trong (hiển thị bằng CSS).
  const p = c.obj(o.pos);
  const px = num(p.x, 0, 100, 1);
  const py = num(p.y, 0, 100, 1);
  if (px !== null && py !== null && (px !== 50 || py !== 50)) img.pos = { x: px, y: py };
  const zoom = num(o.zoom, 1, 4, 2);
  if (zoom && zoom > 1) img.zoom = zoom;
  return img.asset || img.alt || img.caption ? img : null;
}

// Video trên slide: YouTube (mã 11 ký tự) hoặc tệp tải lên (asset). poster = ảnh bìa (asset).
export function cleanVideo(c, v, path) {
  if (v === undefined || v === null) return null;
  const o = c.obj(v);
  const provider = o.provider === 'youtube' ? 'youtube' : o.provider === 'file' ? 'file' : null;
  const base = { poster: uuidOrNull(o.poster), title: c.str(o.title, SPEC_LIMITS.videoTitle, `${path}.title`), caption: c.str(o.caption, SPEC_LIMITS.caption, `${path}.caption`) };
  if (provider === 'youtube' && typeof o.id === 'string' && YOUTUBE_ID_RE.test(o.id)) return { provider, id: o.id, ...base };
  if (provider === 'file' && uuidOrNull(o.asset)) return { provider, asset: uuidOrNull(o.asset), ...base };
  if (c.strict) c.errors.push(`${path}: video không hợp lệ`);
  return null;
}

// Thiết kế toàn bài (dùng chung cho spec và dàn ý): tông màu, mẫu nền, phông chữ, logo.
export function cleanDesign(c, o) {
  let theme = THEMES.includes(o.theme) ? o.theme : 'midnight';
  if (o.theme !== undefined && !THEMES.includes(o.theme) && c.strict) c.errors.push('theme: tông màu không hợp lệ');
  let palette = null;
  if (theme === CUSTOM_THEME) {
    const pl = c.obj(o.palette);
    const primary = normHex(pl.primary);
    const secondary = normHex(pl.secondary) || primary;
    if (primary) palette = { tone: pl.tone === 'light' ? 'light' : 'dark', primary, secondary };
    else {
      if (c.strict) c.errors.push('palette: cần màu chính dạng #RRGGBB');
      theme = 'midnight';
    }
  }
  const background = BACKGROUNDS.includes(o.background) ? o.background : 'network';
  const f = c.obj(o.font);
  const body = FONT_IDS.includes(f.body) ? f.body : DEFAULT_FONT;
  const font = { heading: FONT_IDS.includes(f.heading) ? f.heading : body, body };
  let logo = null;
  if (o.logo) {
    const lg = c.obj(o.logo);
    const asset = uuidOrNull(lg.asset);
    if (asset) {
      const size = Math.round(Number(lg.size));
      logo = {
        asset,
        cutout: uuidOrNull(lg.cutout),
        removeBg: lg.removeBg === true,
        position: LOGO_POSITIONS.includes(lg.position) ? lg.position : 'tr',
        size: Number.isFinite(size) ? Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, size)) : LOGO_SIZE.def,
        showOn: LOGO_SHOW.includes(lg.showOn) ? lg.showOn : 'all',
      };
    } else if (c.strict) c.errors.push('logo: mã ảnh logo không hợp lệ');
  }
  return { theme, palette, background, font, logo, brand: cleanBrand(c, o.brand) };
}

// Bộ nhận diện thương hiệu: ảnh nền trang bìa / trang nội dung / trang mở đầu phần / trang kết + dải đầu trang, chân trang.
// Mỗi ô là mã asset (ảnh của bài). footerText = vẫn hiện chữ chân trang + số trang phía trên dải chân trang.
export function cleanBrand(c, v) {
  if (!v) return null;
  const o = c.obj(v);
  const out = {};
  let any = false;
  for (const k of BRAND_SLOTS) {
    if (o[k] && !uuidOrNull(o[k]) && c.strict) c.errors.push(`brand.${k}: mã ảnh không hợp lệ`);
    out[k] = uuidOrNull(o[k]);
    any = any || !!out[k];
  }
  if (!any) return null;
  out.footerText = o.footerText !== false;
  // Độ sáng ảnh nền toàn trang (giao diện đo khi chọn ảnh, người dùng chỉnh được) → renderer đổi màu chữ trang khác tông.
  const tn = c.obj(o.tones);
  const tones = {};
  for (const k of ['cover', 'page', 'section', 'closing']) if (out[k] && (tn[k] === 'light' || tn[k] === 'dark')) tones[k] = tn[k];
  if (Object.keys(tones).length) out.tones = tones;
  return out;
}

const oneOf = (v, list, def) => (list.includes(v) ? v : def);
const ELEMENT_ID_RE = /^e-[a-z0-9]{1,20}$/;

// Phần tử trang tự do: toạ độ % khung slide (cho phép tràn mép một chút để làm ảnh tràn viền).
function cleanElement(c, v, path, seen) {
  const o = c.obj(v);
  if (!FREE_TYPES.includes(o.type)) {
    if (c.strict) c.errors.push(`${path}.type: loại phần tử không hợp lệ`);
    return null;
  }
  let id = typeof o.id === 'string' && ELEMENT_ID_RE.test(o.id) ? o.id : '';
  if (!id || seen.has(id)) id = `e-${randomUUID().slice(0, 8)}`;
  seen.add(id);
  const el = {
    id,
    type: o.type,
    x: num(o.x, -50, 100, 2) ?? 10,
    y: num(o.y, -50, 100, 2) ?? 10,
    w: num(o.w, 2, 150, 2) ?? 30,
    h: num(o.h, 2, 150, 2) ?? 20,
  };
  // Hiện khi bấm (trình chiếu từng phần tử) — chỉ lưu khi bật.
  if (o.step === true) el.step = true;
  const size = num(o.size, SIZE_RANGE.min, SIZE_RANGE.max, 2) ?? 1;
  if (o.type === 'text') {
    return Object.assign(el, {
      text: c.str(o.text, SPEC_LIMITS.elText, `${path}.text`),
      style: oneOf(o.style, Object.keys(TEXT_STYLES), 'body'),
      align: oneOf(o.align, TEXT_ALIGNS, 'left'),
      valign: oneOf(o.valign, TEXT_VALIGNS, 'top'),
      color: oneOf(o.color, Object.keys(TEXT_COLORS), 'text'),
      fill: oneOf(o.fill, Object.keys(FILLS), 'none'),
      size,
    });
  }
  if (o.type === 'image') return Object.assign(el, { image: cleanImage(c, o.image, `${path}.image`), radius: oneOf(o.radius, Object.keys(RADII), 'md') });
  if (o.type === 'video') return Object.assign(el, { video: cleanVideo(c, o.video, `${path}.video`) });
  if (o.type === 'logo3d') {
    return Object.assign(el, { image: cleanImage(c, o.image, `${path}.image`), motion: oneOf(o.motion, Object.keys(LOGO_MOTIONS), 'swing'), depth: num(o.depth, 0.1, 1, 2) ?? 0.5 });
  }
  if (o.type === 'table') {
    const rows = c.arr(o.rows, SPEC_LIMITS.tableRows, `${path}.rows`).map((r, i) =>
      c.arr(r, SPEC_LIMITS.tableCols, `${path}.rows[${i}]`).map((cell, k) => c.str(cell, SPEC_LIMITS.cell, `${path}.rows[${i}][${k}]`)),
    );
    // Bảng luôn hình chữ nhật: thiếu ô thì bù ô trống theo hàng dài nhất.
    const cols = Math.max(1, ...rows.map((r) => r.length));
    const grid = (rows.length ? rows : [['']]).map((r) => [...r, ...Array(cols - r.length).fill('')]);
    return Object.assign(el, { rows: grid, header: o.header !== false, style: oneOf(o.style, Object.keys(TABLE_STYLES), 'striped'), size });
  }
  return Object.assign(el, {
    shape: oneOf(o.shape, Object.keys(SHAPES), 'round'),
    fill: oneOf(o.fill, Object.keys(SHAPE_FILLS), 'soft'),
    opacity: num(o.opacity, 0.05, 1, 2) ?? 1,
  });
}

function cleanItem(c, v, path, withImage = false) {
  const o = c.obj(v);
  const it = {
    icon: ICON_SET.has(o.icon) ? o.icon : 'sparkles',
    title: c.str(o.title, SPEC_LIMITS.itemTitle, `${path}.title`),
    text: c.str(o.text, SPEC_LIMITS.itemText, `${path}.text`),
    value: c.str(o.value, SPEC_LIMITS.itemValue, `${path}.value`),
  };
  // Ảnh/logo thay biểu tượng của thẻ/ý (vd. logo OpenAI, Gemini…) — chỉ ở danh sách items (không ở bước quy trình).
  if (withImage) {
    const img = cleanImage(c, o.image, `${path}.image`);
    if (img?.asset) it.image = img;
  }
  return it;
}

function cleanStat(c, v, path) {
  const o = c.obj(v);
  let value = o.value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    value = Math.round(value * 100) / 100;
  } else {
    value = c.str(value, SPEC_LIMITS.statText, `${path}.value`);
    const n = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
    if (Number.isFinite(n)) value = n;
  }
  return {
    value,
    prefix: c.str(o.prefix, SPEC_LIMITS.statPrefix, `${path}.prefix`),
    suffix: c.str(o.suffix, SPEC_LIMITS.statSuffix, `${path}.suffix`),
    label: c.str(o.label, SPEC_LIMITS.statLabel, `${path}.label`),
  };
}

// Kết quả AI đôi khi chọn layout nhưng thiếu dữ liệu tương ứng → hạ về layout hiển thị được, tránh trang trống.
function fallbackLayout(s) {
  const has = {
    agenda: s.items.length > 0,
    bullets: s.items.length > 0,
    cards: s.items.length > 0,
    stats: s.stats.length > 0,
    timeline: s.steps.length > 0,
    process: s.steps.length > 0,
    comparison: s.columns.length >= 2,
    quote: !!s.quote.text,
    image: !!s.image?.asset || !!s.video,
    gallery: s.images.some((im) => im.asset),
    free: true,
  };
  if (!(s.layout in has) || has[s.layout]) return s.layout;
  if (s.layout === 'image' && s.items.length) return 'bullets';
  if (s.layout === 'gallery' && s.image?.asset) return 'image';
  return 'section';
}

function cleanSlide(c, v, i, seen) {
  const o = c.obj(v);
  const p = `slides[${i}]`;
  let id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : '';
  if (!id || seen.has(id)) id = `s-${randomUUID().slice(0, 8)}`;
  seen.add(id);
  let layout = o.layout;
  if (!LAYOUT_SET.has(layout)) {
    if (c.strict && layout !== undefined) c.errors.push(`${p}.layout: bố cục không hợp lệ`);
    layout = 'bullets';
  }
  const q = c.obj(o.quote);
  const slide = {
    id,
    layout,
    kicker: c.str(o.kicker, SPEC_LIMITS.kicker, `${p}.kicker`),
    title: c.str(o.title, SPEC_LIMITS.title, `${p}.title`),
    highlight: c.str(o.highlight, SPEC_LIMITS.highlight, `${p}.highlight`),
    subtitle: c.str(o.subtitle, SPEC_LIMITS.subtitle, `${p}.subtitle`),
    caption: c.str(o.caption, SPEC_LIMITS.caption, `${p}.caption`),
    icon: ICON_SET.has(o.icon) ? o.icon : 'sparkles',
    notes: c.str(o.notes, SPEC_LIMITS.notes, `${p}.notes`),
    tags: c.arr(o.tags, SPEC_LIMITS.tags, `${p}.tags`).map((t, k) => c.str(t, SPEC_LIMITS.tag, `${p}.tags[${k}]`)).filter(Boolean),
    items: c.arr(o.items, SPEC_LIMITS.items, `${p}.items`).map((it, k) => cleanItem(c, it, `${p}.items[${k}]`, true)).filter((it) => it.title || it.text || it.image),
    stats: c.arr(o.stats, SPEC_LIMITS.stats, `${p}.stats`).map((it, k) => cleanStat(c, it, `${p}.stats[${k}]`)).filter((it) => it.value !== '' || it.label),
    steps: c.arr(o.steps, SPEC_LIMITS.steps, `${p}.steps`).map((it, k) => cleanItem(c, it, `${p}.steps[${k}]`)).filter((it) => it.title || it.text),
    columns: c
      .arr(o.columns, SPEC_LIMITS.columns, `${p}.columns`)
      .map((col, k) => {
        const co = c.obj(col);
        return {
          title: c.str(co.title, SPEC_LIMITS.colTitle, `${p}.columns[${k}].title`),
          subtitle: c.str(co.subtitle, SPEC_LIMITS.colSubtitle, `${p}.columns[${k}].subtitle`),
          tone: TONES.has(co.tone) ? co.tone : 'neutral',
          points: c.arr(co.points, SPEC_LIMITS.points, `${p}.columns[${k}].points`).map((pt, m) => c.str(pt, SPEC_LIMITS.point, `${p}.columns[${k}].points[${m}]`)).filter(Boolean),
        };
      })
      .filter((col) => col.title || col.points.length),
    quote: { text: c.str(q.text, SPEC_LIMITS.quoteText, `${p}.quote.text`), author: c.str(q.author, SPEC_LIMITS.quoteAuthor, `${p}.quote.author`), role: c.str(q.role, SPEC_LIMITS.quoteAuthor, `${p}.quote.role`) },
    image: cleanImage(c, o.image, `${p}.image`),
    images: c.arr(o.images, SPEC_LIMITS.images, `${p}.images`).map((im, k) => cleanImage(c, im, `${p}.images[${k}]`)).filter(Boolean),
    video: cleanVideo(c, o.video, `${p}.video`),
  };
  // Phần tử đặt tự do: là toàn bộ nội dung của trang tự do; ở bố cục khác là lớp CHÈN THÊM phía trên (ảnh, logo, chữ, hình khối…).
  if (layout === 'free' || (Array.isArray(o.elements) && o.elements.length)) {
    const seenEl = new Set();
    slide.elements = c.arr(o.elements, SPEC_LIMITS.elements, `${p}.elements`).map((e, k) => cleanElement(c, e, `${p}.elements[${k}]`, seenEl)).filter(Boolean);
    if (layout !== 'free' && !slide.elements.length) delete slide.elements;
  }
  if (slide.highlight && !plainText(slide.title).includes(slide.highlight)) slide.highlight = '';
  if (!c.strict) slide.layout = fallbackLayout(slide);
  // Biến thể trình bày do hệ thống chọn ngầm (không có trên giao diện) → giá trị lạ/không thuộc bố cục: bỏ, không báo lỗi.
  slide.variant = VARIANTS[slide.layout]?.includes(o.variant) ? o.variant : '';
  // Cách trình chiếu (người dùng chọn, không qua AI): mặc định 'auto' = không lưu trường.
  if (BUILDS.includes(o.build)) slide.build = o.build;
  return slide;
}

/** @returns {{ spec: object, errors: string[] }} */
export function normalizeSpec(input, { strict = false } = {}) {
  const c = makeCtx(strict);
  const o = c.obj(input);
  const seen = new Set();
  const slides = c.arr(o.slides, SPEC_LIMITS.slides, 'slides').map((s, i) => cleanSlide(c, s, i, seen));
  if (!slides.length) c.errors.push('slides: bài trình bày cần ít nhất 1 trang');
  const spec = {
    version: 1,
    title: c.str(o.title, SPEC_LIMITS.deckTitle, 'title') || slides[0]?.title || 'Bài trình bày',
    ...cleanDesign(c, o),
    style: STYLES.includes(o.style) ? o.style : STYLES[0],
    footer: c.str(o.footer, SPEC_LIMITS.footer, 'footer'),
    slides,
  };
  return { spec, errors: c.errors.slice(0, 20) };
}

// Mọi mã asset mà spec (hoặc dàn ý) tham chiếu: ảnh, video + ảnh bìa video, logo (để kiểm tra thuộc đúng bài trình bày).
export function collectAssetIds(spec) {
  const ids = new Set();
  const add = (v) => v && ids.add(v);
  const img = (im) => {
    add(im?.asset);
    add(im?.src);
  };
  for (const s of spec.slides || []) {
    img(s.image);
    for (const im of s.images || []) img(im);
    for (const it of s.items || []) img(it.image);
    add(s.video?.asset);
    add(s.video?.poster);
    for (const e of s.elements || []) {
      img(e.image);
      add(e.video?.asset);
      add(e.video?.poster);
    }
  }
  const lg = spec.logo || spec.design?.logo;
  add(lg?.asset);
  add(lg?.cutout);
  const br = spec.brand || spec.design?.brand;
  for (const k of BRAND_SLOTS) add(br?.[k]);
  return ids;
}

// Bỏ tham chiếu tới asset không thuộc bài trình bày (phòng spec trỏ sang asset của tenant khác).
export function dropForeignAssets(spec, allowedIds) {
  const ok = (v) => !!v && allowedIds.has(v);
  const keep = (im) => {
    if (!im) return im;
    let out = im.asset && !ok(im.asset) ? { ...im, asset: null } : im;
    if (out.src && !ok(out.src)) {
      out = { ...out };
      delete out.src;
      delete out.edit;
    }
    return out;
  };
  const keepVideo = (v) => {
    if (!v) return v;
    if (v.provider === 'file' && !ok(v.asset)) return null;
    return v.poster && !ok(v.poster) ? { ...v, poster: null } : v;
  };
  for (const s of spec.slides) {
    s.image = keep(s.image);
    s.images = (s.images || []).map(keep);
    for (const it of s.items || []) {
      if (it.image) it.image = keep(it.image);
      if (it.image && !it.image.asset) delete it.image;
    }
    s.video = keepVideo(s.video);
    for (const e of s.elements || []) {
      if (e.image) e.image = keep(e.image);
      if (e.video) e.video = keepVideo(e.video);
    }
  }
  const holder = spec.design || spec;
  if (holder.logo) {
    if (!ok(holder.logo.asset)) holder.logo = null;
    else if (holder.logo.cutout && !ok(holder.logo.cutout)) holder.logo = { ...holder.logo, cutout: null, removeBg: false };
  }
  if (holder.brand) {
    for (const k of BRAND_SLOTS) if (holder.brand[k] && !ok(holder.brand[k])) holder.brand[k] = null;
    if (!BRAND_SLOTS.some((k) => holder.brand[k])) holder.brand = null;
  }
  return spec;
}

// Đổi toàn bộ mã asset theo bảng ánh xạ (nhân bản bài: asset được sao chép sang mã mới).
export function remapAssetIds(doc, map) {
  const m = (v) => (v ? map.get(v) || null : v);
  const img = (im) => {
    if (!im) return;
    if (im.asset) im.asset = m(im.asset);
    if (im.src) im.src = m(im.src);
    if (!im.src) {
      delete im.src;
      delete im.edit;
    }
  };
  const vid = (v) => {
    if (!v) return v;
    if (v.asset) v.asset = m(v.asset);
    if (v.poster) v.poster = m(v.poster);
    return v.provider === 'file' && !v.asset ? null : v;
  };
  for (const s of doc.slides || []) {
    img(s.image);
    for (const im of s.images || []) img(im);
    for (const it of s.items || []) {
      img(it.image);
      if (it.image && !it.image.asset) delete it.image;
    }
    s.video = vid(s.video);
    for (const e of s.elements || []) {
      img(e.image);
      if (e.video) e.video = vid(e.video);
    }
  }
  const holder = doc.design || doc;
  if (holder.logo) {
    holder.logo.asset = m(holder.logo.asset);
    holder.logo.cutout = m(holder.logo.cutout);
    if (!holder.logo.asset) holder.logo = null;
  }
  if (holder.brand) {
    for (const k of BRAND_SLOTS) holder.brand[k] = m(holder.brand[k]) || null;
    if (!BRAND_SLOTS.some((k) => holder.brand[k])) holder.brand = null;
  }
  return doc;
}

// Áp trần số trang cho kết quả AI (schema đã khoá, đây là lưới an toàn): giữ trang đầu và trang kết (closing).
export function capSlides(spec, max) {
  if (!Number.isInteger(max) || max < 1 || spec.slides.length <= max) return spec;
  const last = spec.slides[spec.slides.length - 1];
  spec.slides = last.layout === 'closing' && max >= 2 ? [...spec.slides.slice(0, max - 1), last] : spec.slides.slice(0, max);
  return spec;
}

// Đưa theme về đúng tông người dùng chọn khi AI chọn lệch (theme đầu nhóm = mặc định của tông).
export function themeForTone(theme, tone, toneThemes) {
  const allowed = toneThemes[tone];
  return allowed && !allowed.includes(theme) ? allowed[0] : theme;
}

// Thiết kế độc lập (mẫu thiết kế / bộ nhận diện thương hiệu): tông màu, nền, phông, logo, ảnh thương hiệu + phong cách bài.
export function normalizeDesign(input, { strict = false } = {}) {
  const c = makeCtx(strict);
  const o = c.obj(input);
  const design = { ...cleanDesign(c, o), style: STYLES.includes(o.style) ? o.style : STYLES[0] };
  return { design, errors: c.errors.slice(0, 20) };
}
