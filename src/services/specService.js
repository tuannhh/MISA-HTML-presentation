// Chuẩn hoá đặc tả bài trình bày (spec). Allowlist từng trường — trường lạ bị bỏ, không mass-assignment.
// Hai chế độ:
//  - lenient (kết quả AI): tự cắt chuỗi quá dài, thay giá trị lạ bằng mặc định, bỏ phần tử thừa.
//  - strict (người dùng lưu): vượt giới hạn → trả danh sách lỗi để API báo 422 (không âm thầm cắt dữ liệu người dùng).
import { randomUUID } from 'node:crypto';
import { LAYOUTS, THEMES, BACKGROUNDS, LOGO_POSITIONS, LOGO_SHOW, LOGO_SIZE } from '../../shared/deck/render.js';
import { CUSTOM_THEME, normHex } from '../../shared/deck/palette.js';
import { FONT_IDS, DEFAULT_FONT } from '../../shared/deck/fonts.js';
import { ICON_NAMES } from '../../shared/deck/icons.js';
import { isUuid } from '../repositories/tenantScope.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { VARIANTS, STYLES } from '../../shared/deck/variants.js';

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
      const s = String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
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

function cleanImage(c, v, path) {
  const o = c.obj(v);
  const asset = typeof o.asset === 'string' && isUuid(o.asset) ? o.asset.toLowerCase() : null;
  if (o.asset && !asset && c.strict) c.errors.push(`${path}.asset: mã ảnh không hợp lệ`);
  const img = { asset, alt: c.str(o.alt, SPEC_LIMITS.alt, `${path}.alt`), caption: c.str(o.caption, SPEC_LIMITS.caption, `${path}.caption`), fit: o.fit === 'contain' ? 'contain' : 'cover' };
  // Khung trình duyệt cho ảnh giao diện phần mềm (chỉ với ảnh trọn khung).
  if (o.frame === 'browser' && img.fit === 'contain') img.frame = 'browser';
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
  return { theme, palette, background, font, logo };
}

function cleanItem(c, v, path) {
  const o = c.obj(v);
  return {
    icon: ICON_SET.has(o.icon) ? o.icon : 'sparkles',
    title: c.str(o.title, SPEC_LIMITS.itemTitle, `${path}.title`),
    text: c.str(o.text, SPEC_LIMITS.itemText, `${path}.text`),
    value: c.str(o.value, SPEC_LIMITS.itemValue, `${path}.value`),
  };
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
    items: c.arr(o.items, SPEC_LIMITS.items, `${p}.items`).map((it, k) => cleanItem(c, it, `${p}.items[${k}]`)).filter((it) => it.title || it.text),
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
  if (slide.highlight && !slide.title.includes(slide.highlight)) slide.highlight = '';
  if (!c.strict) slide.layout = fallbackLayout(slide);
  // Biến thể trình bày do hệ thống chọn ngầm (không có trên giao diện) → giá trị lạ/không thuộc bố cục: bỏ, không báo lỗi.
  slide.variant = VARIANTS[slide.layout]?.includes(o.variant) ? o.variant : '';
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
  for (const s of spec.slides || []) {
    add(s.image?.asset);
    for (const im of s.images || []) add(im.asset);
    add(s.video?.asset);
    add(s.video?.poster);
  }
  const lg = spec.logo || spec.design?.logo;
  add(lg?.asset);
  add(lg?.cutout);
  return ids;
}

// Bỏ tham chiếu tới asset không thuộc bài trình bày (phòng spec trỏ sang asset của tenant khác).
export function dropForeignAssets(spec, allowedIds) {
  const ok = (v) => !!v && allowedIds.has(v);
  const keep = (im) => (im && im.asset && !ok(im.asset) ? { ...im, asset: null } : im);
  for (const s of spec.slides) {
    s.image = keep(s.image);
    s.images = (s.images || []).map(keep);
    if (s.video) {
      if (s.video.provider === 'file' && !ok(s.video.asset)) s.video = null;
      else if (s.video.poster && !ok(s.video.poster)) s.video = { ...s.video, poster: null };
    }
  }
  const holder = spec.design || spec;
  if (holder.logo) {
    if (!ok(holder.logo.asset)) holder.logo = null;
    else if (holder.logo.cutout && !ok(holder.logo.cutout)) holder.logo = { ...holder.logo, cutout: null, removeBg: false };
  }
  return spec;
}

// Đổi toàn bộ mã asset theo bảng ánh xạ (nhân bản bài: asset được sao chép sang mã mới).
export function remapAssetIds(doc, map) {
  const m = (v) => (v ? map.get(v) || null : v);
  for (const s of doc.slides || []) {
    if (s.image?.asset) s.image.asset = m(s.image.asset);
    for (const im of s.images || []) if (im.asset) im.asset = m(im.asset);
    if (s.video) {
      if (s.video.asset) s.video.asset = m(s.video.asset);
      if (s.video.poster) s.video.poster = m(s.video.poster);
      if (s.video.provider === 'file' && !s.video.asset) s.video = null;
    }
  }
  const holder = doc.design || doc;
  if (holder.logo) {
    holder.logo.asset = m(holder.logo.asset);
    holder.logo.cutout = m(holder.logo.cutout);
    if (!holder.logo.asset) holder.logo = null;
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
