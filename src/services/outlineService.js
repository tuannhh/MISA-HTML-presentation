// Dàn ý (bước 1 của quy trình tạo bài): AI đọc tư liệu → dàn ý từng trang (tiêu đề + các dòng nội dung sẽ hiển thị);
// người dùng duyệt/sửa, gắn media (ảnh, video, YouTube), chọn thiết kế → bước 2 AI dựng bài theo đúng dàn ý.
// Hàm thuần (không DB/HTTP): chuẩn hoá dàn ý, gắn media vào slide, dựng slide dự phòng khi AI thiếu trang.
import { randomUUID } from 'node:crypto';
import { LAYOUTS, MEDIA_LAYOUTS } from '../../shared/deck/render.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { isUuid } from '../repositories/tenantScope.js';
import { cleanDesign, cleanVideo } from './specService.js';

export const OUTLINE_LAYOUTS = Object.freeze(['auto', ...LAYOUTS]);
const ID_RE = /^[a-z0-9-]{1,40}$/i;

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
    obj: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
  };
}

function cleanOutlineSlide(c, v, i, seen) {
  const o = c.obj(v);
  const p = `slides[${i}]`;
  let id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : '';
  if (!id || seen.has(id)) id = `s-${randomUUID().slice(0, 8)}`;
  seen.add(id);
  let layout = OUTLINE_LAYOUTS.includes(o.layout) ? o.layout : 'auto';
  if (o.layout !== undefined && !OUTLINE_LAYOUTS.includes(o.layout) && c.strict) c.errors.push(`${p}.layout: bố cục không hợp lệ`);
  const video = cleanVideo(c, o.video, `${p}.video`);
  // 1 trang chỉ phát 1 video; có video thì không kèm ảnh (ô media chỉ chứa 1 thứ).
  const images = video
    ? []
    : c
        .arr(o.images, SPEC_LIMITS.images, `${p}.images`)
        .map((im, k) => {
          const x = c.obj(im);
          const asset = typeof x.asset === 'string' && isUuid(x.asset) ? x.asset.toLowerCase() : null;
          if (!asset && c.strict) c.errors.push(`${p}.images[${k}]: mã ảnh không hợp lệ`);
          if (!asset) return null;
          const img = { asset, caption: c.str(x.caption, SPEC_LIMITS.caption, `${p}.images[${k}].caption`) };
          // Ảnh đồ hoạ người dùng gửi kèm (infographic, sơ đồ…) hiển thị trọn khung, không cắt.
          if (x.fit === 'contain') img.fit = 'contain';
          return img;
        })
        .filter(Boolean);
  const slide = {
    id,
    layout,
    title: c.str(o.title, SPEC_LIMITS.title, `${p}.title`),
    subtitle: c.str(o.subtitle, SPEC_LIMITS.subtitle, `${p}.subtitle`),
    points: c
      .arr(o.points, SPEC_LIMITS.outlinePoints, `${p}.points`)
      .map((pt, k) => c.str(pt, SPEC_LIMITS.outlinePoint, `${p}.points[${k}]`))
      .filter(Boolean),
    notes: c.str(o.notes, SPEC_LIMITS.notes, `${p}.notes`),
    images,
    video,
  };
  if (c.strict && !slide.title && !slide.points.length && !images.length && !video) c.errors.push(`${p}: trang trống — nhập tiêu đề hoặc nội dung`);
  return slide;
}

/**
 * @param {object} input dàn ý từ AI (lenient) hoặc người dùng lưu (strict)
 * @param {{ strict?: boolean, options?: object }} o options = tuỳ chọn tạo bài do server giữ (người dùng không sửa được)
 */
export function normalizeOutline(input, { strict = false, options } = {}) {
  const c = makeCtx(strict);
  const o = c.obj(input);
  const seen = new Set();
  const slides = c.arr(o.slides, SPEC_LIMITS.outlineSlides, 'slides').map((s, i) => cleanOutlineSlide(c, s, i, seen));
  if (!slides.length) c.errors.push('slides: dàn ý cần ít nhất 1 trang');
  const opt = c.obj(options ?? o.options);
  const outline = {
    version: 1,
    title: c.str(o.title, SPEC_LIMITS.deckTitle, 'title') || slides[0]?.title || 'Bài trình bày',
    footer: c.str(o.footer, SPEC_LIMITS.footer, 'footer'),
    options: { tone: opt.tone === 'light' ? 'light' : 'dark', autoSlides: opt.autoSlides !== false, slideCount: Number.isInteger(opt.slideCount) ? opt.slideCount : null },
    design: cleanDesign(c, c.obj(o.design)),
    slides,
  };
  return { outline, errors: c.errors.slice(0, 20) };
}

/**
 * Chỉ giữ ảnh chụp thật trên các trang dàn ý do AI lập (infographic, slide, biểu đồ… là tư liệu, không gắn vào trang).
 * Trang bố cục ảnh (image/gallery) mất hết ảnh → 'auto' để bước dựng bài tự chọn bố cục hợp nội dung chữ.
 * @param {Array} slides  trang dàn ý (images: [{asset, caption}])
 * @param {(assetId:string)=>boolean} isPhoto
 */
export function keepPhotoImages(slides, isPhoto) {
  let dropped = 0;
  for (const s of slides) {
    const kept = (s.images || []).filter((im) => isPhoto(im.asset));
    dropped += (s.images || []).length - kept.length;
    s.images = kept;
    if (!kept.length && !s.video && (s.layout === 'image' || s.layout === 'gallery')) s.layout = 'auto';
    if (kept.length === 1 && s.layout === 'gallery') s.layout = 'image';
  }
  return dropped;
}

/**
 * Media người dùng gửi kèm khi tạo bài là BẮT BUỘC: mỗi ảnh/video xuất hiện đúng 1 lần trong dàn ý.
 * AI đặt trước (theo nội dung); hàm này sửa lại cho chắc chắn — bỏ trùng, trang có video thì không kèm ảnh, mỗi trang ≤ 6 ảnh,
 * rồi đặt phần còn thiếu: ưu tiên trang chưa có media (trang chữ trước, trang số liệu/quy trình sau cùng), hết chỗ thì thêm
 * trang ảnh/video trước trang kết (khi còn hạn mức trang), cuối cùng gom thêm vào trang ảnh sẵn có.
 * @param {Array} slides  trang dàn ý đã chuẩn hoá (images: [{asset, caption, fit?}], video)
 * @param {{ images: Array<{asset:string, fit?:string}>, videos: Array<object> }} required  video = đối tượng video dàn ý
 * @param {{ room?: number }} o  số trang còn được thêm (0 = giữ đúng số trang)
 * @returns {{ added: number, moved: number }}
 */
export function placeUserMedia(slides, required, { room = 0 } = {}) {
  const imgs = new Map((required.images || []).map((im) => [im.asset, im]));
  const vids = new Map((required.videos || []).map((v) => [v.asset, v]));
  if (!imgs.size && !vids.size) return { added: 0, moved: 0 };
  const seenImg = new Set();
  const seenVid = new Set();
  let moved = 0;
  for (const s of slides) {
    if (s.video?.provider === 'file' && vids.has(s.video.asset)) {
      if (seenVid.has(s.video.asset)) s.video = null;
      else seenVid.add(s.video.asset);
    }
    const kept = [];
    for (const im of s.images || []) {
      if (!imgs.has(im.asset)) {
        kept.push(im);
        continue;
      }
      // trùng, hoặc trang đã có video (1 trang chỉ 1 loại media), hoặc vượt 6 ảnh → đặt lại ở bước sau
      if (seenImg.has(im.asset) || s.video || kept.length >= SPEC_LIMITS.images) {
        if (!seenImg.has(im.asset)) moved += 1;
        continue;
      }
      seenImg.add(im.asset);
      kept.push({ ...im, ...(imgs.get(im.asset).fit === 'contain' ? { fit: 'contain' } : {}) });
    }
    s.images = s.video ? [] : kept;
  }
  const leftVids = [...vids.values()].filter((v) => !seenVid.has(v.asset));
  const leftImgs = [...imgs.values()].filter((im) => !seenImg.has(im.asset)).map((im) => ({ asset: im.asset, caption: '', ...(im.fit === 'contain' ? { fit: 'contain' } : {}) }));
  if (!leftVids.length && !leftImgs.length) return { added: 0, moved };

  const RANK = { image: 0, gallery: 0, auto: 1, bullets: 1, section: 2, quote: 2, cards: 3, agenda: 4, cover: 5 };
  const closingAt = () => (slides.length > 1 && slides[slides.length - 1].layout === 'closing' ? slides.length - 1 : slides.length);
  const free = () =>
    slides
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i < closingAt() && !s.video && !(s.images || []).length)
      .sort((a, b) => (RANK[a.s.layout] ?? 6) - (RANK[b.s.layout] ?? 6) || a.i - b.i)
      .map(({ s }) => s);
  let added = 0;
  const insert = (slide) => {
    slides.splice(closingAt(), 0, { id: `s-${randomUUID().slice(0, 8)}`, subtitle: '', points: [], notes: '', images: [], video: null, ...slide });
    added += 1;
    room -= 1;
  };
  for (const v of leftVids) {
    const target = free()[0];
    if (target) target.video = v;
    else insert({ layout: 'image', title: v.title || 'Video', video: v }); // 1 trang chỉ phát 1 video → thiếu chỗ thì buộc thêm trang
  }
  while (leftImgs.length) {
    const spots = free();
    // Trang hợp để chèn ảnh: trang chữ / bìa (trang số liệu, quy trình… giữ nguyên cấu trúc, chỉ dùng khi hết cách).
    const good = spots.filter((x) => (RANK[x.layout] ?? 6) <= 5);
    // 1–2 ảnh: mỗi ảnh 1 trang chữ; nhiều hơn: gom thành bộ sưu tập (≤ 6 ảnh/trang).
    if (leftImgs.length <= 2 && leftImgs.length <= good.length) {
      for (const sp of good.slice(0, leftImgs.length)) sp.images = [leftImgs.shift()];
      break;
    }
    const chunk = leftImgs.splice(0, SPEC_LIMITS.images);
    const withRoom = slides.find((x) => !x.video && x.images.length && x.images.length + chunk.length <= SPEC_LIMITS.images && x.images.every((im) => imgs.has(im.asset)));
    if (withRoom) withRoom.images.push(...chunk);
    else if (room > 0) insert({ layout: chunk.length > 1 ? 'gallery' : 'image', title: 'Hình ảnh', images: chunk });
    else if (good.length || spots.length) (good[0] || spots[0]).images = chunk;
    else insert({ layout: chunk.length > 1 ? 'gallery' : 'image', title: 'Hình ảnh', images: chunk }); // không bỏ media người dùng
  }
  for (const s of slides) if ((s.images || []).length >= 2 && !s.video && s.layout !== 'gallery') s.layout = 'gallery';
  return { added, moved };
}

/* ---------------- dàn ý → slide ---------------- */
// "Tiêu đề: mô tả" / "Mốc — nội dung" → { title, text }. Dòng ngắn không có dấu tách = chỉ tiêu đề.
export function splitPoint(pt) {
  const m = /^(.{1,90}?)\s*(?::|\s[—–-]\s)\s*(.+)$/.exec(pt);
  if (m) return { title: m[1].trim(), text: m[2].trim() };
  return pt.length <= 70 ? { title: pt, text: '' } : { title: '', text: pt };
}

// Số liệu dạng "1.250 tỷ đồng — Doanh thu 2025" / "+62% — thời gian lập báo cáo".
export function parseStat(pt) {
  // Đơn vị có thể nhiều chữ ("tỷ đồng"); dấu tách: ":" hoặc gạch ngang (gạch nối phải có khoảng trắng 2 bên).
  const m = /^([+\-~≈]?)\s*(\d[\d.,]*)\s*([^\d—–:]{0,16}?)\s*(?::|\s-\s|[—–])\s*(.+)$/.exec(pt);
  if (!m) {
    // Giá trị dạng chữ có số ("24/7", "Top 3", "ISO-27001") → giữ nguyên chuỗi.
    const t = /^([^\s—–:]*\d[^\s—–:]*)\s*(?::|\s-\s|[—–])\s*(.+)$/.exec(pt);
    return t && t[1].length <= SPEC_LIMITS.statText ? { value: t[1], prefix: '', suffix: '', label: t[2].trim() } : null;
  }
  const raw = m[2];
  // Kiểu Việt Nam: 1.250 = một nghìn hai trăm năm mươi; 3,5 = ba phẩy năm.
  const num = Number(/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw) ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.'));
  return { value: Number.isFinite(num) ? num : raw, prefix: m[1], suffix: m[3], label: m[4].trim() };
}

const ITEM = (x) => ({ icon: 'sparkles', title: x.title, text: x.text, value: '' });

// Khi AI thiếu trang (hoặc lỗi định dạng) → dựng slide xác định từ dàn ý, không bỏ trang người dùng đã duyệt.
export function outlineSlideToSpec(os, index, total) {
  const layout = os.layout !== 'auto' ? os.layout : index === 0 ? 'cover' : index === total - 1 && total > 2 ? 'closing' : os.points.length ? 'bullets' : 'section';
  const s = { id: os.id, layout, kicker: '', title: os.title, highlight: '', subtitle: os.subtitle, caption: '', icon: 'sparkles', notes: os.notes, tags: [], items: [], stats: [], steps: [], columns: [], quote: {}, image: null, images: [] };
  const pts = os.points;
  if (layout === 'stats') {
    s.stats = pts.map(parseStat).filter(Boolean).slice(0, SPEC_LIMITS.stats);
    if (!s.stats.length) s.layout = 'bullets';
  }
  if (['timeline', 'process'].includes(layout)) s.steps = pts.slice(0, SPEC_LIMITS.steps).map((pt) => {
    const x = splitPoint(pt);
    return layout === 'timeline' && x.title.length <= SPEC_LIMITS.itemValue ? { icon: 'sparkles', title: x.text.split(/[.,;]/)[0].slice(0, 80) || x.title, text: x.text, value: x.title } : ITEM(x);
  });
  if (layout === 'comparison') {
    const cols = new Map();
    for (const pt of pts) {
      const x = splitPoint(pt);
      const key = x.title && x.text ? x.title : 'Nội dung';
      if (!cols.has(key)) cols.set(key, []);
      cols.get(key).push(x.text || pt);
    }
    s.columns = [...cols.entries()].slice(0, SPEC_LIMITS.columns).map(([title, points]) => ({ title, subtitle: '', tone: 'neutral', points: points.slice(0, SPEC_LIMITS.points) }));
    if (s.columns.length < 2) s.layout = 'bullets';
  }
  if (layout === 'quote') {
    s.quote = { text: pts[0] || os.subtitle || os.title, author: pts[1] ? splitPoint(pts[1]).title : '', role: pts[1] ? splitPoint(pts[1]).text : '' };
  }
  if (['cover', 'section', 'closing'].includes(layout) && !s.subtitle && pts.length) s.subtitle = pts.slice(0, 2).join(' · ').slice(0, SPEC_LIMITS.subtitle);
  if (['agenda', 'bullets', 'cards', 'image'].includes(s.layout) || (s.layout === 'bullets' && !s.items.length)) {
    s.items = pts.slice(0, SPEC_LIMITS.items).map((pt) => ITEM(splitPoint(pt)));
  }
  return s;
}

// Nội dung có cấu trúc khác (số liệu, bước, cột) → danh sách ý, dùng khi phải đổi sang bố cục có ô media.
function contentAsItems(s) {
  if (s.items?.length) return s.items;
  if (s.steps?.length) return s.steps.map((x) => ({ icon: x.icon || 'sparkles', title: [x.value, x.title].filter(Boolean).join(' · '), text: x.text, value: '' }));
  if (s.stats?.length) return s.stats.map((x) => ({ icon: 'chart', title: `${x.prefix || ''}${x.value}${x.suffix ? ` ${x.suffix}` : ''}`, text: x.label, value: '' }));
  if (s.columns?.length) return s.columns.map((x) => ({ icon: 'check', title: x.title, text: (x.points || []).join('; '), value: '' }));
  return [];
}

/**
 * Gắn media người dùng đã chọn ở dàn ý vào slide — xác định, không phụ thuộc AI:
 *  video / 1 ảnh → bố cục có ô media (giữ bố cục nếu đã phù hợp, nếu không đổi sang "Ảnh/video lớn" kèm ý bên cạnh);
 *  ≥ 2 ảnh → bộ sưu tập ảnh.
 */
export function applyOutlineMedia(slide, os) {
  const imgs = os.images || [];
  if (!Array.isArray(slide.items)) slide.items = [];
  if (os.video) {
    slide.video = { ...os.video };
    slide.image = null;
    slide.images = [];
  } else if (imgs.length === 1) {
    slide.image = { asset: imgs[0].asset, alt: imgs[0].caption || '', caption: imgs[0].caption || '', fit: imgs[0].fit === 'contain' ? 'contain' : 'cover' };
    slide.video = null;
  } else if (imgs.length >= 2) {
    slide.layout = 'gallery';
    slide.images = imgs.map((im) => ({ asset: im.asset, alt: im.caption || '', caption: im.caption || '', fit: im.fit === 'contain' ? 'contain' : 'cover' }));
    slide.image = null;
    slide.video = null;
    return slide;
  } else {
    slide.video = null;
    if (slide.image) slide.image = null;
    slide.images = [];
    return slide;
  }
  if (!MEDIA_LAYOUTS.includes(slide.layout)) {
    slide.items = contentAsItems(slide).slice(0, 4);
    slide.layout = 'image';
  }
  // Bố cục "Ảnh/video lớn": tối đa 4 ý bên cạnh cho dễ đọc.
  if (slide.layout === 'image' && slide.items.length > 4) slide.items = slide.items.slice(0, 4);
  return slide;
}

// Số trang theo tuỳ chọn tạo bài (dàn ý từ AI): tự động ≤ max, tuỳ chỉnh = N; giữ trang kết.
export function capOutline(outline, max) {
  if (!Number.isInteger(max) || max < 1 || outline.slides.length <= max) return outline;
  const last = outline.slides[outline.slides.length - 1];
  outline.slides = last.layout === 'closing' && max >= 2 ? [...outline.slides.slice(0, max - 1), last] : outline.slides.slice(0, max);
  return outline;
}

const MEDIA_ONE = (os) => !!os.video || os.images.length === 1;

/**
 * Bước 2: ghép kết quả AI (mỗi trang có ref Sn) với dàn ý đã duyệt → spec thô (chưa normalizeSpec).
 * Dàn ý là chuẩn: giữ tiêu đề/mô tả/ghi chú người dùng đã sửa, bố cục người dùng đã chọn; trang AI thiếu hoặc
 * sai bố cục → dựng xác định từ dàn ý; media gắn theo dàn ý (không phụ thuộc AI).
 */
export function composeDeckFromOutline(outline, modelSlides = []) {
  const n = outline.slides.length;
  const byRef = new Map();
  for (const m of modelSlides) {
    const k = Number(String(m?.ref || '').replace(/^S/i, ''));
    if (Number.isInteger(k) && k >= 1 && k <= n && !byRef.has(k - 1)) byRef.set(k - 1, m);
  }
  // AI bỏ ref nhưng trả đúng số trang → ghép theo thứ tự.
  if (!byRef.size && modelSlides.length === n) modelSlides.forEach((m, i) => byRef.set(i, m));
  const slides = outline.slides.map((os, i) => {
    let m = byRef.get(i);
    if (m && os.layout !== 'auto' && m.layout !== os.layout) {
      const mediaOk = (MEDIA_ONE(os) && !MEDIA_LAYOUTS.includes(os.layout) && MEDIA_LAYOUTS.includes(m.layout)) || (os.images.length >= 2 && m.layout === 'gallery');
      if (!mediaOk) m = null;
    }
    const s = m ? { ...m, id: os.id } : outlineSlideToSpec(os, i, n);
    delete s.ref;
    if (os.title) s.title = os.title;
    if (os.subtitle) s.subtitle = os.subtitle;
    s.notes = os.notes || s.notes || '';
    return applyOutlineMedia(s, os);
  });
  return { title: outline.title, footer: outline.footer, ...outline.design, slides };
}
