// Dàn ý (bước 1 của quy trình tạo bài): AI đọc tư liệu → dàn ý từng trang (tiêu đề + các dòng nội dung sẽ hiển thị);
// người dùng duyệt/sửa, gắn media (ảnh, video, YouTube), chọn thiết kế → bước 2 AI dựng bài theo đúng dàn ý.
// Hàm thuần (không DB/HTTP): chuẩn hoá dàn ý, gắn media vào slide, dựng slide dự phòng khi AI thiếu trang.
import { randomUUID } from 'node:crypto';
import { AI_LAYOUTS as LAYOUTS, MEDIA_LAYOUTS, CONTACT_LAYOUTS } from '../../shared/deck/render.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { linkPhrase, richLinks, safeHref } from '../../shared/deck/rich.js';
import { validPhone, validEmail, phoneDigits, webHref, CONTACT_LIMITS as CL } from '../../shared/deck/contact.js';
import { isUuid } from '../repositories/tenantScope.js';
import { cleanDesign, cleanVideo } from './specService.js';
import { stripLinks, linksIn, cleanLinks, hasLinks } from '../../shared/deck/mdLinks.js';

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

// Chữ dàn ý có liên kết "[nhãn](URL)": giới hạn tính theo chữ HIỂN THỊ (URL không tính, tối đa ~8 liên kết × 500 ký tự);
// URL hỏng → chỉ giữ nhãn.
function linkedStr(c, v, max, path) {
  const raw = c.str(v, max + 4200, path);
  if (!hasLinks(raw)) {
    if (raw.length > max) {
      if (c.strict) c.errors.push(`${path}: tối đa ${max} ký tự`);
      return raw.slice(0, max).trim();
    }
    return raw;
  }
  const s = cleanLinks(raw);
  if (stripLinks(s).length > max) {
    if (c.strict) c.errors.push(`${path}: tối đa ${max} ký tự`);
    return stripLinks(s).slice(0, max).trim();
  }
  return s;
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
          if (x.frame === 'browser') img.frame = 'browser';
          return img;
        })
        .filter(Boolean);
  const slide = {
    id,
    layout,
    title: linkedStr(c, o.title, SPEC_LIMITS.title, `${p}.title`),
    subtitle: linkedStr(c, o.subtitle, SPEC_LIMITS.subtitle, `${p}.subtitle`),
    points: c
      .arr(o.points, SPEC_LIMITS.outlinePoints, `${p}.points`)
      .map((pt, k) => linkedStr(c, pt, SPEC_LIMITS.outlinePoint, `${p}.points[${k}]`))
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
    options: { tone: opt.tone === 'light' ? 'light' : 'dark', autoSlides: opt.autoSlides !== false, slideCount: Number.isInteger(opt.slideCount) ? opt.slideCount : null, aiImages: opt.aiImages === true },
    design: cleanDesign(c, c.obj(o.design)),
    slides,
  };
  return { outline, errors: c.errors.slice(0, 20) };
}

/**
 * Chỉ giữ ảnh được phép gắn (ảnh chụp thật, ảnh giao diện phần mềm, ảnh người dùng gửi) trên các trang dàn ý do AI lập
 * (infographic, slide, biểu đồ… là tư liệu, không gắn vào trang).
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
 * @param {{ room?: number, force?: boolean, chunk?: number, title?: string }} o  room = số trang còn được thêm (0 = giữ đúng số trang);
 *   force = false: media không bắt buộc (ảnh giao diện cắt từ PDF) — chỉ chèn vào trang chữ còn trống hoặc thêm trang khi còn hạn mức,
 *   hết chỗ thì bỏ qua; chunk = số ảnh tối đa mỗi trang gom; title = tiêu đề trang ảnh thêm mới.
 * @returns {{ added: number, moved: number }}
 */
// Kiểu hiển thị ảnh mang theo khi đặt lại vị trí (trọn khung / khung trình duyệt).
const look = (im) => ({ ...(im?.fit === 'contain' ? { fit: 'contain' } : {}), ...(im?.frame === 'browser' ? { frame: 'browser' } : {}) });

export function placeUserMedia(slides, required, { room = 0, force = true, chunk: per = SPEC_LIMITS.images, title = 'Hình ảnh' } = {}) {
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
      kept.push({ ...im, ...look(imgs.get(im.asset)) });
    }
    s.images = s.video ? [] : kept;
  }
  const leftVids = [...vids.values()].filter((v) => !seenVid.has(v.asset));
  const leftImgs = [...imgs.values()].filter((im) => !seenImg.has(im.asset)).map((im) => ({ asset: im.asset, caption: '', ...look(im) }));
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
    // Media không bắt buộc chỉ vào trang chữ ngắn (≤ 4 dòng) — không ép trang thẻ/số liệu đổi bố cục làm mất nội dung.
    const good = spots.filter((x) => (force ? (RANK[x.layout] ?? 6) <= 5 : (RANK[x.layout] ?? 6) <= 2 && (x.points || []).length <= 4));
    // 1–2 ảnh: mỗi ảnh 1 trang chữ; nhiều hơn: gom thành bộ sưu tập (≤ 6 ảnh/trang).
    if (leftImgs.length <= 2 && leftImgs.length <= good.length) {
      for (const sp of good.slice(0, leftImgs.length)) sp.images = [leftImgs.shift()];
      break;
    }
    const chunk = leftImgs.splice(0, per);
    const withRoom = slides.find((x) => !x.video && x.images.length && x.images.length + chunk.length <= per && x.images.every((im) => imgs.has(im.asset)));
    if (withRoom) withRoom.images.push(...chunk);
    else if (room > 0) insert({ layout: chunk.length > 1 ? 'gallery' : 'image', title, images: chunk });
    else if (good.length || (force && spots.length)) (good[0] || spots[0]).images = chunk;
    else if (force) insert({ layout: chunk.length > 1 ? 'gallery' : 'image', title, images: chunk }); // không bỏ media người dùng
    else break; // media không bắt buộc: hết chỗ thì thôi
  }
  for (const s of slides) if ((s.images || []).length >= 2 && !s.video && s.layout !== 'gallery') s.layout = 'gallery';
  return { added, moved };
}

// Từ có nghĩa (≥ 3 ký tự) của tiêu đề/nội dung — so khớp sơ đồ với trang liên quan.
const words = (t) => new Set(String(t || '').toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
const overlap = (a, b) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n += 1;
  return n;
};

/**
 * Sơ đồ (quy trình, kiến trúc, mô hình…) cần được THẤY rõ: mỗi sơ đồ 1 trang ảnh lớn (bố cục image, ≤ 4 ý bên cạnh).
 * - Trang AI đặt sơ đồ: chỉ giữ 1 sơ đồ và chỉ khi trang không kèm ảnh khác, không phải bìa/kết, ≤ 4 dòng → đổi sang bố cục image;
 *   còn lại gỡ sơ đồ ra đặt lại (giữ nguyên cấu trúc trang thẻ/số liệu/bộ sưu tập).
 * - Sơ đồ chưa có chỗ: thêm trang image riêng (tiêu đề = tên sơ đồ AI nhận diện), đặt ngay sau trang có nội dung gần nhất (trước
 *   trang kết) khi còn hạn mức trang; hết hạn mức → gắn vào trang chữ ngắn chưa có media, ưu tiên trang cùng chủ đề; không còn
 *   chỗ thì bỏ (sơ đồ cắt tự động không bắt buộc).
 * @param {Array} slides  trang dàn ý đã chuẩn hoá
 * @param {Array<{asset:string, title?:string}>} diagrams
 * @param {{ room?: number }} o  room = số trang còn được thêm
 * @returns {{ added: number, moved: number, placed: number }}
 */
export function placeDiagrams(slides, diagrams, { room = 0 } = {}) {
  const byId = new Map(diagrams.map((d) => [d.asset, d]));
  if (!byId.size) return { added: 0, moved: 0, placed: 0 };
  const used = new Set();
  let moved = 0;
  const dgImg = (asset, caption = '') => ({ asset, caption, fit: 'contain' });
  for (const s of slides) {
    const imgs = s.images || [];
    if (!imgs.some((im) => byId.has(im.asset))) continue;
    const others = imgs.filter((im) => !byId.has(im.asset));
    const dg = imgs.find((im) => byId.has(im.asset) && !used.has(im.asset));
    const fits = dg && !others.length && !s.video && !['cover', 'closing'].includes(s.layout) && (s.points || []).length <= 4;
    moved += imgs.length - others.length - (fits ? 1 : 0);
    if (fits) {
      used.add(dg.asset);
      s.images = [dgImg(dg.asset, dg.caption)];
      s.layout = 'image';
    } else {
      s.images = others;
      if (!others.length && (s.layout === 'image' || s.layout === 'gallery') && !s.video) s.layout = 'auto';
      if (others.length === 1 && s.layout === 'gallery') s.layout = 'image';
    }
  }
  const left = [...byId.values()].filter((d) => !used.has(d.asset));
  let added = 0;
  const closingAt = () => (slides.length > 1 && slides[slides.length - 1].layout === 'closing' ? slides.length - 1 : slides.length);
  // Trang gần chủ đề nhất (theo từ chung với tên sơ đồ) — chỉ tính khi chung ≥ 2 từ.
  const best = (d, list) => {
    const w = words(d.title);
    let top = null;
    let score = 1;
    for (const x of list) {
      const n = overlap(w, words(`${x.s.title} ${(x.s.points || []).join(' ')}`));
      if (n > score) {
        score = n;
        top = x;
      }
    }
    return top;
  };
  for (const d of left) {
    if (room > 0) {
      const near = best(d, slides.map((s, i) => ({ s, i })).filter(({ i, s }) => i > 0 && i < closingAt() && s.layout !== 'cover'));
      const at = near ? near.i + 1 : closingAt();
      slides.splice(Math.min(at, closingAt()), 0, { id: `s-${randomUUID().slice(0, 8)}`, layout: 'image', title: d.title || 'Sơ đồ', subtitle: '', points: [], notes: '', images: [dgImg(d.asset)], video: null });
      used.add(d.asset);
      added += 1;
      room -= 1;
      continue;
    }
    const spots = slides
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i > 0 && i < closingAt() && !s.video && !(s.images || []).length && ['auto', 'bullets'].includes(s.layout) && (s.points || []).length <= 4);
    const spot = best(d, spots) || spots[0];
    if (!spot) continue;
    spot.s.images = [dgImg(d.asset)];
    spot.s.layout = 'image';
    used.add(d.asset);
  }
  return { added, moved, placed: used.size };
}

/* ---------------- sơ đồ vẽ lại (org / timeline / process) ---------------- */
// Dòng dàn ý của sơ đồ tổ chức: "Đứng đầu: X" (tuỳ chọn, dòng đầu) + mỗi nhánh 1 dòng "Tên nhánh: mục; mục".
const ORG_ROOT_RE = /^\s*(?:đứng đầu|cấp cao nhất|gốc)\s*:\s*(.+)$/iu;

/**
 * Sơ đồ đơn giản AI đọc từ tư liệu (visualService.cleanRedraw) → các dòng dàn ý theo cách viết points của bố cục tương ứng:
 * org: "Đứng đầu: X" + "Nhánh: mục; mục"; timeline: "Mốc — nội dung: chi tiết"; process: "Bước: chi tiết".
 */
export function redrawPoints(r) {
  const tail = (items) => (items.length ? `: ${items.join('; ')}` : '');
  if (r.type === 'org') return [...(r.root ? [`Đứng đầu: ${r.root}`] : []), ...r.nodes.map((n) => `${n.title}${tail(n.items)}`)];
  if (r.type === 'timeline') {
    return r.nodes.map((n) => {
      const [head = '', ...rest] = n.title ? [n.title, ...n.items] : n.items;
      return `${n.value || '•'} — ${head}${tail(rest)}`;
    });
  }
  return r.nodes.map((n) => `${n.title}${tail(n.items)}`);
}

/** Dòng dàn ý org → { root, columns } của spec (xác định — chữ giữ nguyên, không qua AI). */
export function parseOrgPoints(points) {
  let root = '';
  const columns = [];
  for (const pt of points || []) {
    const r = ORG_ROOT_RE.exec(pt);
    if (r && !root && !columns.length) {
      root = r[1].trim();
      continue;
    }
    const m = /^(.{1,100}?)\s*:\s*(.*)$/s.exec(pt);
    const title = (m ? m[1] : pt).trim().slice(0, SPEC_LIMITS.colTitle);
    const kids = m ? m[2].split(/\s*;\s*/).map((x) => x.trim()).filter(Boolean) : [];
    if (title) columns.push({ title, subtitle: '', tone: 'neutral', points: kids.slice(0, SPEC_LIMITS.points).map((k) => k.slice(0, SPEC_LIMITS.point)) });
  }
  return { root: root.slice(0, SPEC_LIMITS.root), columns: columns.slice(0, SPEC_LIMITS.orgBranches) };
}

/**
 * Sơ đồ đơn giản vẽ lại (DRn) — mỗi sơ đồ đúng 1 trang, nội dung chép đúng từ sơ đồ gốc:
 * - Trang AI ghi mã DRn (refs: slide → mã) và chưa có media: đổi sang bố cục của sơ đồ, points = redrawPoints (giữ tiêu đề/mô tả AI).
 * - Sơ đồ AI bỏ sót: thêm trang ngay sau trang cùng chủ đề (khi còn hạn mức); hết hạn mức → chuyển trang chữ chưa có media cùng
 *   chủ đề nhất (chung ≥ 3 từ) thành sơ đồ; không có thì bỏ (nội dung vẫn còn trong dàn ý dưới dạng chữ).
 * Trang bìa/kết và trang có media (ảnh/video người dùng bắt buộc) không bị đổi.
 * @param {Array} slides  trang dàn ý đã chuẩn hoá
 * @param {Array<{ref:string, type:string, title?:string, root?:string, nodes:Array}>} redraws
 * @param {{ room?: number, refs?: Map<object,string> }} o
 * @returns {{ applied: number, added: number, converted: number }}
 */
export function applyRedraws(slides, redraws, { room = 0, refs = new Map() } = {}) {
  const out = { applied: 0, added: 0, converted: 0 };
  if (!redraws.length) return out;
  const byRef = new Map(redraws.map((r) => [r.ref.toUpperCase(), r]));
  const used = new Set();
  const closingAt = () => (slides.length > 1 && slides[slides.length - 1].layout === 'closing' ? slides.length - 1 : slides.length);
  const free = (s, i) => i > 0 && i < closingAt() && !['cover', 'closing'].includes(s.layout) && !s.video && !(s.images || []).length;
  const fill = (s, r) => {
    s.layout = r.type;
    s.points = redrawPoints(r).map((p) => p.slice(0, SPEC_LIMITS.outlinePoint));
    if (!s.title) s.title = (r.title || '').slice(0, SPEC_LIMITS.title);
    used.add(r.ref.toUpperCase());
  };
  slides.forEach((s, i) => {
    const r = byRef.get(String(refs.get(s) || '').trim().toUpperCase());
    if (!r || used.has(r.ref.toUpperCase()) || !free(s, i)) return;
    fill(s, r);
    out.applied += 1;
  });
  for (const r of redraws) {
    if (used.has(r.ref.toUpperCase())) continue;
    const w = words(`${r.title || ''} ${r.root || ''} ${r.nodes.map((n) => n.title).join(' ')}`);
    const scored = slides
      .map((s, i) => ({ s, i, n: overlap(w, words(`${s.title} ${(s.points || []).join(' ')}`)) }))
      .filter(({ s, i }) => i > 0 && i < closingAt() && s.layout !== 'cover')
      .sort((a, b) => b.n - a.n || a.i - b.i);
    if (room > 0) {
      const near = scored[0]?.n >= 2 ? scored[0] : null;
      const at = Math.min(near ? near.i + 1 : closingAt(), closingAt());
      const s = { id: `s-${randomUUID().slice(0, 8)}`, layout: r.type, title: '', subtitle: '', points: [], notes: '', images: [], video: null };
      fill(s, r);
      if (!s.title) s.title = r.type === 'org' ? 'Sơ đồ tổ chức' : r.type === 'timeline' ? 'Lộ trình' : 'Quy trình';
      slides.splice(at, 0, s);
      out.added += 1;
      room -= 1;
      continue;
    }
    const spot = scored.find((x) => x.n >= 3 && free(x.s, x.i) && x.s.layout !== 'org');
    if (!spot) continue;
    fill(spot.s, r);
    out.converted += 1;
  }
  return out;
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
  const s = { id: os.id, layout, kicker: '', title: os.title, highlight: '', subtitle: os.subtitle, caption: '', root: '', icon: 'sparkles', notes: os.notes, tags: [], items: [], stats: [], steps: [], columns: [], quote: {}, image: null, images: [] };
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
  if (layout === 'org') {
    Object.assign(s, parseOrgPoints(pts), { icon: 'user' });
    if (!s.columns.length) s.layout = 'bullets';
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
  // Trang Liên hệ / Ưu đãi: ảnh gắn ở dàn ý là MÃ QR (ảnh đầu tiên); không có ô ảnh/video.
  if (CONTACT_LAYOUTS.includes(slide.layout)) {
    if (imgs[0]) {
      slide.contact = slide.contact || { phones: [], emails: [], addresses: [], website: '', cta: '', qr: { asset: null, link: '', caption: '' } };
      slide.contact.qr = { ...(slide.contact.qr || {}), asset: imgs[0].asset };
    }
    slide.image = null;
    slide.images = [];
    slide.video = null;
    return slide;
  }
  if (os.video) {
    slide.video = { ...os.video };
    slide.image = null;
    slide.images = [];
  } else if (imgs.length === 1) {
    slide.image = { asset: imgs[0].asset, alt: imgs[0].caption || '', caption: imgs[0].caption || '', fit: imgs[0].fit === 'contain' ? 'contain' : 'cover', ...(imgs[0].frame === 'browser' ? { frame: 'browser' } : {}) };
    slide.video = null;
  } else if (imgs.length >= 2) {
    slide.layout = 'gallery';
    slide.images = imgs.map((im) => ({ asset: im.asset, alt: im.caption || '', caption: im.caption || '', fit: im.fit === 'contain' ? 'contain' : 'cover', ...(im.frame === 'browser' ? { frame: 'browser' } : {}) }));
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
  const slides = outline.slides.map((os0, i) => {
    // Liên kết "[nhãn](URL)" gắn lại sau khi chuẩn hoá spec (applyOutlineLinks) — ở đây chỉ dùng nhãn.
    const os = { ...os0, title: stripLinks(os0.title), subtitle: stripLinks(os0.subtitle), points: os0.points.map(stripLinks) };
    let m = byRef.get(i);
    if (m && os.layout !== 'auto' && m.layout !== os.layout) {
      const mediaOk = !CONTACT_LAYOUTS.includes(os.layout) && ((MEDIA_ONE(os) && !MEDIA_LAYOUTS.includes(os.layout) && MEDIA_LAYOUTS.includes(m.layout)) || (os.images.length >= 2 && m.layout === 'gallery'));
      if (!mediaOk) m = null;
    }
    const s = m ? { ...m, id: os.id } : outlineSlideToSpec(os, i, n);
    delete s.ref;
    // Sơ đồ tổ chức người dùng đã duyệt: ô đứng đầu + nhánh + mục con lấy đúng từ dàn ý (AI chỉ góp icon theo thứ tự nhánh).
    if (os.layout === 'org' && s.layout === 'org') {
      const org = parseOrgPoints(os.points);
      if (org.columns.length) {
        const icons = (Array.isArray(m?.columns) ? m.columns : []).map((c) => c?.icon);
        s.root = org.root;
        s.columns = org.columns.map((c, k) => (icons[k] ? { ...c, icon: icons[k] } : c));
      }
    }
    // Trang Liên hệ / Ưu đãi: thông tin liên hệ + quyền lợi lấy đúng từ dàn ý (AI chỉ góp tiêu đề, icon).
    if (CONTACT_LAYOUTS.includes(s.layout)) fillContact(s, os0, m);
    if (os.title) s.title = os.title;
    if (os.subtitle) s.subtitle = os.subtitle;
    s.notes = os.notes || s.notes || '';
    return applyOutlineMedia(s, os);
  });
  return { title: outline.title, footer: outline.footer, ...outline.design, slides };
}

/* ---------------- trang Liên hệ / Ưu đãi: dòng dàn ý → slide.contact ---------------- */
// Cách viết dòng (AI lập dàn ý và người dùng sửa theo cùng quy ước):
//   "Điện thoại: 0912 345 678 (Zalo, Viber)" · "Hotline: 1900 8677" · "Zalo: 0912 345 678" · "Email: sales@misa.com.vn"
//   "Địa chỉ: …" · "Văn phòng Hà Nội: …" · "Website: amis.misa.vn" · "Kêu gọi: Liên hệ để được tư vấn miễn phí"
//   "QR: https://…" (hệ thống tự tạo mã QR) · "Chú thích QR: Quét để đăng ký". Dòng khác: trang Ưu đãi = quyền lợi, trang Liên hệ = ghi chú.
const KEY_RE = /^\s*([^:：]{1,40}?)\s*[:：]\s*(.+)$/;
const APPS = ['zalo', 'viber', 'telegram', 'imessage'];
const GENERIC_PHONE = /^(điện thoại|số điện thoại|đt|sđt|đtdđ|di động|phone|tel|mobile|liên hệ|số liên hệ)$/i;
const PHONE_KEY = /(điện thoại|đt|sđt|hotline|tổng đài|di động|phone|tel|mobile|liên hệ|zalo|viber|telegram|imessage)/i;
const NUM_RE = /\+?\d[\d .()-]{4,20}\d/g;
const lc = (v) => v.toLocaleLowerCase('vi');

function phonesOf(line, key, keyRaw) {
  const out = [];
  const low = lc(line);
  const msgs = APPS.filter((a) => low.includes(a));
  const app = APPS.find((a) => lc(key) === a);
  const channels = app ? [...new Set([app, ...msgs])] : ['call', ...msgs];
  const label = app || GENERIC_PHONE.test(key) || !key ? '' : keyRaw.slice(0, CL.phoneLabel);
  // Nhiều số trên 1 dòng: "0912 345 678 - 0987 654 321", "… hoặc …", "…, …"
  for (const part of line.split(/[,;/]|\s[-–—]\s|\bhoặc\b/)) {
    for (const n of part.match(NUM_RE) || []) {
      const number = n.trim().replace(/\s+/g, ' ');
      if (validPhone(number) && out.length < CL.phones) out.push({ number, label, channels });
    }
  }
  return out;
}

/** Dòng dàn ý → { contact, rest } (rest = dòng không phải thông tin liên hệ). Liên kết "[nhãn](URL)" dùng URL. */
export function parseContactPoints(points) {
  const ct = { phones: [], emails: [], addresses: [], website: '', cta: '', qr: { asset: null, link: '', caption: '' } };
  const rest = [];
  for (const raw of points || []) {
    const urls = linksIn(raw);
    const line = stripLinks(raw).trim();
    if (!line) continue;
    const m = KEY_RE.exec(line);
    // "https://…" có dấu ":" nhưng không phải nhãn.
    const keyed = m && !/^(https?|mailto|tel)$/i.test(m[1].trim());
    const keyRaw = keyed ? m[1].trim() : '';
    const key = lc(keyRaw);
    const val = keyed ? m[2].trim() : line;
    if (/^(kêu gọi|lời kêu gọi|cta|kêu gọi hành động)$/.test(key)) {
      ct.cta = val.slice(0, CL.cta);
      continue;
    }
    if (/^(qr|mã qr|qr code|link qr)$/.test(key)) {
      ct.qr.link = (urls[0]?.url || val).slice(0, CL.qrLink);
      continue;
    }
    if (/^(chú thích qr|ghi chú qr)$/.test(key)) {
      ct.qr.caption = val.slice(0, CL.qrCaption);
      continue;
    }
    const emails = (val.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}/g) || []).filter(validEmail);
    if (/^(email|e-mail|thư điện tử|mail)$/.test(key) || (!keyed && emails.length && emails.join(' ') === val)) {
      for (const e of emails) if (ct.emails.length < CL.emails && !ct.emails.includes(e)) ct.emails.push(e);
      continue;
    }
    if (/^(website|web|trang web|trang chủ|trang thông tin)$/.test(key) || (!keyed && /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(val))) {
      const w = webHref(urls[0]?.url || val);
      if (w && !ct.website) {
        ct.website = w;
        continue;
      }
    }
    if (/^(địa chỉ|văn phòng|trụ sở|chi nhánh|showroom|cửa hàng|nhà máy)/.test(key)) {
      if (ct.addresses.length < CL.addresses) ct.addresses.push((key === 'địa chỉ' ? val : line).slice(0, CL.address));
      continue;
    }
    if (PHONE_KEY.test(key) || (!keyed && /^\+?[\d .()-]{6,30}(\(.*\))?$/.test(val))) {
      const found = phonesOf(val, key, keyRaw);
      if (found.length) {
        for (const ph of found) if (ct.phones.length < CL.phones && !ct.phones.some((x) => phoneDigits(x.number) === phoneDigits(ph.number))) ct.phones.push(ph);
        continue;
      }
    }
    rest.push(raw);
  }
  return { contact: ct, rest };
}

// Điền slide Liên hệ / Ưu đãi từ dòng dàn ý (os0 = dàn ý gốc, còn cú pháp liên kết); m = trang AI (icon từng quyền lợi).
function fillContact(s, os0, m) {
  const { contact, rest } = parseContactPoints(os0.points);
  s.contact = contact;
  if (s.layout === 'offer') {
    const icons = (Array.isArray(m?.items) ? m.items : []).map((x) => x?.icon);
    s.items = rest.slice(0, 6).map((pt, k) => ({ ...ITEM(splitPoint(stripLinks(pt))), icon: icons[k] || 'check' }));
  } else {
    s.items = [];
    s.caption = rest.map(stripLinks).join(' · ').slice(0, SPEC_LIMITS.caption);
  }
}

/* ---------------- đối chiếu dàn ý AI với tư liệu nguồn (chống bịa thông tin liên hệ / liên kết) ---------------- */
// So khớp số điện thoại theo chữ số (0xxx ≡ +84xxx), bỏ dấu cách/chấm/gạch.
const normPhone = (d) => {
  const x = phoneDigits(d).replace('+', '');
  return x.startsWith('84') && x.length >= 11 ? `0${x.slice(2)}` : x;
};

/**
 * Bỏ khỏi dàn ý AI những gì KHÔNG có trong tư liệu nguồn: liên kết có URL lạ; trên trang Liên hệ / Ưu đãi, dòng có số điện thoại,
 * email, website, link QR không xuất hiện trong nguồn. Trang Liên hệ không còn thông tin liên hệ nào → bố cục 'auto'.
 * @param {object} outline  dàn ý đã normalizeOutline (lenient)
 * @param {{ corpus: string, links: Array<{label:string,url:string}> }} facts  chữ toàn bộ tư liệu + liên kết trong tư liệu
 * @returns {{ links: number, contacts: number }} số liên kết / dòng liên hệ đã bỏ
 */
export function verifyOutlineFacts(outline, facts) {
  const text = String(facts?.corpus || '');
  const low = lc(text);
  const urls = new Set((facts?.links || []).map((l) => safeHref(l.url)).filter(Boolean));
  for (const u of text.match(/https?:\/\/[^\s<>"'()[\]]+/gi) || []) {
    const h = safeHref(u.replace(/[.,;:!?]+$/, ''));
    if (h) urls.add(h);
  }
  const phones = new Set((text.match(NUM_RE) || []).map(normPhone).filter((d) => d.length >= 6));
  const hostOf = (h) => {
    try {
      return new URL(h).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };
  const urlOk = (h) => urls.has(h) || (h.startsWith('mailto:') && low.includes(lc(h.slice(7)))) || (h.startsWith('tel:') && phones.has(normPhone(h.slice(4))));
  const webOk = (h) => urlOk(h) || (!!hostOf(h) && low.includes(hostOf(h)));
  let links = 0;
  let contacts = 0;
  const clean = (t) => {
    const out = cleanLinks(t, urlOk);
    if (out !== t) links += linksIn(t).length - linksIn(out).length;
    return out;
  };
  for (const sl of outline.slides || []) {
    sl.title = clean(sl.title);
    sl.subtitle = clean(sl.subtitle);
    sl.points = sl.points.map(clean);
    if (!CONTACT_LAYOUTS.includes(sl.layout)) continue;
    sl.points = sl.points.filter((pt) => {
      const { contact: c } = parseContactPoints([pt]);
      const ok =
        c.phones.every((ph) => phones.has(normPhone(ph.number))) &&
        c.emails.every((e) => low.includes(lc(e))) &&
        (!c.website || webOk(c.website)) &&
        (!c.qr.link || (safeHref(c.qr.link) && webOk(safeHref(c.qr.link))));
      if (!ok) contacts += 1;
      return ok;
    });
    const { contact: left } = parseContactPoints(sl.points);
    const any = left.phones.length || left.emails.length || left.addresses.length || left.website || left.qr.link || (sl.images || []).length;
    if (sl.layout === 'contact' && !any) sl.layout = 'auto';
  }
  return { links, contacts };
}

/* ---------------- liên kết của dàn ý → chữ có định dạng của bài ---------------- */
// Thứ tự ô chữ tìm nhãn liên kết trên 1 trang (ô đầu tiên chứa nguyên văn nhãn được gắn).
function* textSlots(s) {
  const at = (obj, key) => ({ get: () => obj[key], set: (v) => (obj[key] = v) });
  for (const k of ['title', 'subtitle', 'kicker', 'caption', 'root']) if (typeof s[k] === 'string') yield at(s, k);
  for (const key of ['items', 'steps']) for (const it of s[key] || []) for (const k of ['title', 'text', 'value']) if (typeof it[k] === 'string') yield at(it, k);
  for (const st of s.stats || []) if (typeof st.label === 'string') yield at(st, 'label');
  for (const col of s.columns || []) {
    if (typeof col.title === 'string') yield at(col, 'title');
    for (let i = 0; i < (col.points || []).length; i += 1) yield at(col.points, i);
  }
  if (s.quote && typeof s.quote.text === 'string') yield at(s.quote, 'text');
  for (let i = 0; i < (s.tags || []).length; i += 1) yield at(s.tags, i);
  if (s.contact && typeof s.contact.cta === 'string') yield at(s.contact, 'cta');
}

/**
 * Gắn liên kết "[nhãn](URL)" của dàn ý vào ô chữ có nguyên văn nhãn trên trang tương ứng (theo id trang). Mỗi ô ≤ 8 liên kết.
 * @returns {number} số liên kết đã gắn
 */
export function applyOutlineLinks(spec, outline) {
  const byId = new Map((spec.slides || []).map((s) => [s.id, s]));
  let applied = 0;
  for (const os of outline?.slides || []) {
    const s = byId.get(os.id);
    if (!s) continue;
    const links = [os.title, os.subtitle, ...(os.points || [])].flatMap(linksIn);
    for (const { label, url } of links) {
      for (const slot of textSlots(s)) {
        const cur = slot.get();
        if (richLinks(cur).length >= 8) continue;
        const next = linkPhrase(cur, label, url);
        if (next) {
          slot.set(next);
          applied += 1;
          break;
        }
      }
    }
  }
  return applied;
}
