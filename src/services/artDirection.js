// Chỉ đạo thiết kế toàn bài (bản mẫu "thiết kế nâng cao"): AI dựng bài theo ý đồ hình ảnh thay vì đổ chữ vào khuôn.
//  1. Dọn dàn ý trước khi AI dựng: bỏ ảnh chụp sơ đồ cắt từ tệp nguồn khi trang đã có đủ chữ (tránh vừa ảnh vừa chữ lặp nhau, gắn nhầm trang),
//     bỏ chữ rác của trang video chưa có video ("Slide 5"), bỏ số thứ tự gõ tay khi bố cục tự đánh số.
//  2. Áp kết quả AI: chia phần (màu + tiến độ), phong cách, biến thể theo nghĩa nội dung.
//  3. Bộ hình minh hoạ 3D đồng bộ cả bài: lập danh sách cần vẽ trong hạn mức, câu lệnh theo một phong cách cố định, làm trắng nền hình.
// Hàm thuần (trừ cutoutArt dùng sharp) — presentationService gọi trong lượt dựng bài.
import sharp from 'sharp';
import { PART_COLORS } from '../../shared/deck/palette.js';
import { VARIANTS } from '../../shared/deck/render.js';
import { plainText, hasRich } from '../../shared/deck/rich.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { QUOTE_ART_LAYOUTS } from '../../shared/deck/blocks.js';

// Tên asset ảnh cắt từ trang tệp nguồn: "<tên tệp> · trang 9" / "<tên tệp> — trang 9" (visualService).
const CROP_RE = /\s[·—-]\s*trang\s+(\d{1,3})$/i;
const VIDEO_TITLE_RE = /^\s*video\b/i;
const SLIDE_JUNK_RE = /^\s*(slide|trang)\s*\d{1,3}\s*$/i;
const VIDEO_JUNK_RE = /^\s*\d{1,2}\s*video\s*$/i;
const LEAD_NO_RE = /^\s*(\d{1,2})\s*[.):–-]?\s+(?=\S)/;

/** Trang nguồn của ảnh cắt (số trang) hoặc null. */
export function cropPage(name) {
  const m = CROP_RE.exec(String(name || ''));
  return m ? Number(m[1]) : null;
}

/**
 * Bản sao dàn ý đã dọn cho bước dựng bài (không sửa dàn ý người dùng đã lưu).
 * @param {object} outline
 * @param {Map<string, number>} cropPages asset id → số trang nguồn của ảnh cắt
 * @returns {{ outline: object, fixes: { crops: number, videoPages: number, renumbered: number } }}
 */
export function prepareOutline(outline, cropPages = new Map()) {
  const o = structuredClone(outline);
  const fixes = { crops: 0, videoPages: 0, renumbered: 0 };
  o.slides.forEach((s, i) => {
    const points = (s.points || []).filter((p) => String(p).trim());
    // Ảnh cắt từ trang nguồn: chỉ hợp với ĐÚNG trang đó, và chỉ khi trang không có đủ chữ (≥ 3 dòng = nội dung sơ đồ đã nằm trong chữ).
    const before = (s.images || []).length;
    s.images = (s.images || []).filter((im) => {
      const pg = cropPages.get(im.asset);
      return pg === undefined || (pg === i + 1 && points.length < 3);
    });
    fixes.crops += before - s.images.length;
    if (before && !s.images.length && !s.video && (s.layout === 'image' || s.layout === 'gallery')) s.layout = 'auto';
    // Trang video chưa có video: AI lập dàn ý điền "Slide 5", "02 VIDEO" → bỏ chữ rác, để trang ảnh/video trống chờ người dùng chèn.
    if (VIDEO_TITLE_RE.test(s.title || '') && !s.video && !s.images.length) {
      s.points = points.filter((p) => !SLIDE_JUNK_RE.test(p));
      if (VIDEO_JUNK_RE.test(s.subtitle || '') || SLIDE_JUNK_RE.test(s.subtitle || '')) s.subtitle = '';
      s.layout = 'image';
      fixes.videoPages += 1;
    }
    // "(SLIDE 3 – 10)" — chỉ dẫn số trang của tệp nguồn.
    s.points = s.points.map((p) => p.replace(PAGE_REF_RE, '').trim());
    if (s.subtitle) s.subtitle = s.subtitle.replace(PAGE_REF_RE, '').trim();
    // "1 Vì sao…", "2 Kẻ gian…" — số gõ tay trùng số bố cục tự đánh → bỏ khi mọi dòng đánh số liên tục 1..n.
    const nums = s.points.map((p) => LEAD_NO_RE.exec(p)?.[1]);
    if (s.points.length >= 2 && nums.every((n, k) => Number(n) === k + 1)) {
      s.points = s.points.map((p) => p.replace(LEAD_NO_RE, ''));
      fixes.renumbered += 1;
    }
  });
  return { outline: o, fixes };
}

/**
 * Áp chỉ đạo thiết kế của AI lên bài đã ghép (TRƯỚC normalizeSpec): phần + màu, phong cách. Biến thể và mô tả hình được tách riêng
 * (normalizeSpec bỏ trường lạ và đưa biến thể mặc định về '').
 * @returns {{ variants: string[], arts: Array<{ slide: string, items: string[] }> }}
 */
export function applyDirection(composed, raw) {
  const n = composed.slides.length;
  const refIdx = (ref) => {
    const k = Number(String(ref || '').replace(/^S/i, ''));
    return Number.isInteger(k) && k >= 1 && k <= n ? k - 1 : null;
  };
  const parts = (Array.isArray(raw?.parts) ? raw.parts : [])
    .map((p) => ({ start: refIdx(p?.start), title: String(p?.title || '').trim(), color: PART_COLORS[p?.color] ? p.color : null }))
    .filter((p) => p.start !== null && p.title && p.color)
    .sort((a, b) => a.start - b.start)
    .filter((p, k, a) => k === 0 || p.start !== a[k - 1].start);
  if (parts.length >= 2) {
    parts[0].start = 0; // phần đầu luôn bắt đầu từ trang bìa
    composed.parts = parts.map(({ title, color }) => ({ title, color }));
    composed.slides.forEach((s, i) => {
      let k = 0;
      while (k + 1 < parts.length && parts[k + 1].start <= i) k += 1;
      s.part = k;
    });
  }
  if (typeof raw?.style === 'string') composed.style = raw.style;
  composed.slides.forEach(tidySlide);
  // Mục then chốt (≤ ~1/4 số trang) + câu chốt cuối trang (≤ ~1/3; câu chốt cỡ lớn kèm hình ≤ ~1/10) — quy tắc 10i, 10j.
  const cap = Math.max(1, Math.ceil(n / 3));
  const capFocus = Math.max(1, Math.ceil(n / 4));
  const capQuote = Math.max(1, Math.ceil(n / 10));
  const emphasis = { focus: 0, takeaways: 0, quotes: 0 };
  const quoteArt = composed.slides.map((s) => {
    const e = applyEmphasis(s, { focus: emphasis.focus < capFocus, takeaway: emphasis.takeaways < cap, quote: emphasis.quotes < capQuote });
    if (e.focus) emphasis.focus += 1;
    if (e.takeaway) emphasis.takeaways += 1;
    if (e.quote) emphasis.quotes += 1;
    return e.art;
  });
  const variants = composed.slides.map((s) => (typeof s.variant === 'string' && VARIANTS[s.layout]?.includes(s.variant) ? s.variant : ''));
  const arts = composed.slides.map((s, i) => ({
    slide: typeof s.art === 'string' ? s.art.trim() : '',
    quote: quoteArt[i],
    items: (Array.isArray(s.items) ? s.items : []).map((it) => ({ title: plainText(it?.title || ''), art: typeof it?.art === 'string' ? it.art.trim() : '' })),
  }));
  return { variants, arts, emphasis };
}

/* ---------------- nhấn mạnh: mục then chốt + câu chốt cuối trang ---------------- */
const FOCUS_KEY = { cards: 'items', bullets: 'items', process: 'steps', timeline: 'steps' };
const TAKEAWAY_LAYOUTS = new Set(['cards', 'bullets', 'process', 'timeline', 'agenda', 'stats']);
const QUOTE_ART = new Set(QUOTE_ART_LAYOUTS);
const QUOTE_MAX_ITEMS = 4;
const QUOTE_MAX_WORDS = 10;
const CONCLUSION_RE = /^(kết luận|chốt|tóm lại|thông điệp|ghi nhớ|bài học)$/;
const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const words = (v) => v.split(/\s+/).filter(Boolean).length;
// Bỏ câu huy hiệu khỏi mô tả của mục (kể cả dạng "(DỪNG LẠI Ở ĐÂY LÀ AN TOÀN)") — huy hiệu đã nói, không lặp.
function dropPhrase(text, phrase) {
  if (typeof text !== 'string' || hasRich(text)) return text;
  const t = text.normalize('NFC');
  const at = lower(t).indexOf(lower(phrase.normalize('NFC')));
  if (at < 0 || lower(t).length !== t.length) return text;
  let a = at;
  let b = at + phrase.length;
  if (t[a - 1] === '(' && t[b] === ')') (a -= 1), (b += 1);
  return (t.slice(0, a) + t.slice(b)).replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').replace(/[\s,;:–—-]+$/, '').trim();
}

/**
 * Áp "focus" (mục/bước then chốt → huy hiệu) và "takeaway" (câu chốt → dải kết luận / câu chốt cỡ lớn) AI đề xuất lên trang (trước normalizeSpec).
 * Câu chốt trùng một mục của danh sách → bỏ mục đó (không lặp); trùng phụ đề → bỏ phụ đề. Trả { focus, takeaway, art } (art = vật thể cho hình
 * bên câu chốt). Trường tạm focus/takeaway bị xoá khỏi trang.
 */
export function applyEmphasis(s, allow = { focus: true, takeaway: true }) {
  const out = { focus: false, takeaway: false, quote: false, art: '' };
  const f = s.focus;
  const t = s.takeaway;
  delete s.focus;
  delete s.takeaway;
  const key = FOCUS_KEY[s.layout];
  const list = key && Array.isArray(s[key]) ? s[key] : [];
  const at = Number(f?.at);
  const badge = str(f?.badge, SPEC_LIMITS.itemBadge);
  if (allow.focus && list.length >= 2 && Number.isInteger(at) && at >= 1 && at <= list.length && badge && words(badge) <= 8 && list[at - 1] && typeof list[at - 1] === 'object') {
    const it = list[at - 1];
    it.badge = badge;
    if (typeof it.text === 'string') it.text = dropPhrase(it.text, badge);
    out.focus = true;
  }
  let style = t?.style === 'band' || t?.style === 'quote' ? t.style : '';
  const text = str(t?.text, SPEC_LIMITS.callout);
  if (!allow.takeaway || !style || !text || !TAKEAWAY_LAYOUTS.has(s.layout) || s.callout) return out;
  const items = Array.isArray(s.items) && s.items.length ? s.items : Array.isArray(s.steps) ? s.steps : [];
  const nt = norm(text);
  // Mục chính là câu chốt (tiêu đề "Kết luận"/"Chốt", hoặc chữ trùng câu chốt) → rời danh sách, sang khối cuối trang.
  const dup = items.findIndex((it) => {
    const a = norm(it?.title);
    const b = norm(it?.text);
    return CONCLUSION_RE.test(a) || (a && (a === nt || (a.length >= 8 && nt.includes(a)))) || (b.length >= 8 && (b === nt || nt.includes(b) || b.includes(nt)));
  });
  if (dup >= 0 && items.length > 2) items.splice(dup, 1);
  else if (dup >= 0) return out; // danh sách còn quá ít mục → giữ nguyên, không thêm khối lặp
  // Khẩu hiệu ngắn trên trang còn thoáng (≤ 4 mục, bố cục đặt được hình bên câu chốt) → câu chốt cỡ lớn kèm hình 3D; trang dày hoặc bài đã đủ
  // số câu chốt cỡ lớn → dải kết luận (gọn, không lấn chỗ danh sách).
  const art = str(t?.art, 200);
  const roomy = items.length <= QUOTE_MAX_ITEMS && allow.quote !== false;
  if (style === 'band' && roomy && art && QUOTE_ART.has(s.layout) && words(text) <= QUOTE_MAX_WORDS) style = 'quote';
  else if (style === 'quote' && !roomy) style = 'band';
  const sub = str(t?.sub, SPEC_LIMITS.calloutSub);
  const hl = str(t?.highlight, SPEC_LIMITS.highlight);
  s.callout = { tone: 'note', style, text, ...(sub && norm(sub) !== nt ? { sub } : {}), ...(hl && text.includes(hl) ? { highlight: hl } : {}) };
  if (s.subtitle && norm(s.subtitle) === nt) s.subtitle = '';
  out.takeaway = true;
  out.quote = style === 'quote';
  if (out.quote && QUOTE_ART.has(s.layout)) out.art = art;
  return out;
}

// "(SLIDE 3 – 10)" — chỉ dẫn số trang của tài liệu nguồn, vô nghĩa khi bài đã dựng lại (thứ tự/số trang khác).
const PAGE_REF_RE = /\s*[([]\s*(?:slide|trang)s?\s*\d{1,3}\s*(?:[–—-]\s*\d{1,3})?\s*[)\]]/gi;
// "Phần 2 · Cận cảnh" trên trang mở đầu phần: số phần đã hiện cỡ lớn → bỏ tiền tố lặp.
const PART_PREFIX_RE = /^\s*phần\s+(?:\d{1,2}|[ivx]{1,4})\s*[·:.\-–—]\s*(?=\S)/i;
// Nhãn/đầu dòng đánh số: "01", "Bước 2", "Yếu tố 3", "Chỉ số 4" — cùng tiền tố, liên tục 1..n.
const SEQ_RE = /^\s*([\p{L} ]{0,16}?)\s*0?(\d{1,2})\s*$/u;
const LEAD_STEP_RE = /^\s*(?:(?:bước|step|giai đoạn)\s*)?0?(\d{1,2})\s*[.:)·–-]\s*(?=\S)/i;
const lower = (v) => String(v || '').toLocaleLowerCase('vi').trim();

/** Nhãn của mọi mục chỉ là số thứ tự (bố cục đã tự đánh số) → true. */
function sequentialLabels(list, key) {
  if (list.length < 2) return false;
  const m = list.map((it) => SEQ_RE.exec(String(it?.[key] || '')));
  return m.every((x, k) => x && Number(x[2]) === k + 1 && lower(x[1]) === lower(m[0][1]));
}

/**
 * Dọn chữ lặp/vô nghĩa trên trang AI đã dựng (trước normalizeSpec): chỉ dẫn số trang nguồn, tiền tố "Phần N ·" trên trang mở đầu
 * phần, nhãn chỉ là số thứ tự ("Yếu tố 1…5", "01…03"), "Bước 1:" / "1." đầu tiêu đề bước (bố cục bước đã có số lớn).
 */
export function tidySlide(s) {
  const clean = (v) => (typeof v === 'string' ? v.replace(PAGE_REF_RE, '').trim() : v);
  s.title = clean(s.title);
  s.subtitle = clean(s.subtitle);
  if (s.layout === 'section' && typeof s.title === 'string' && PART_PREFIX_RE.test(s.title)) s.title = s.title.replace(PART_PREFIX_RE, '');
  // Cụm tô nhấn phải nằm nguyên văn trong tiêu đề: tiêu đề giữ IN HOA theo bản gốc mà AI trả cụm chữ thường → lấy đúng đoạn trong tiêu đề.
  if (typeof s.title === 'string' && typeof s.highlight === 'string' && s.highlight.trim() && !s.title.includes(s.highlight)) {
    const t = s.title.normalize('NFC');
    const h = s.highlight.normalize('NFC').trim();
    const at = lower(t).indexOf(lower(h));
    s.highlight = at >= 0 && lower(t).length === t.length ? t.slice(at, at + h.length) : '';
  }
  for (const key of ['items', 'steps']) {
    const list = Array.isArray(s[key]) ? s[key] : [];
    for (const it of list) {
      if (!it || typeof it !== 'object') continue;
      it.title = clean(it.title);
      it.text = clean(it.text);
    }
    // Nhãn chỉ là số thứ tự: có chữ dẫn ("Kiểu 01…05") ở danh sách mục → thành nhãn nhỏ trên tiêu đề (tidyNumbers bỏ nếu bố cục đã vẽ số); còn lại bỏ.
    if (sequentialLabels(list, 'value')) {
      const word = SEQ_RE.exec(String(list[0].value))[1].trim();
      list.forEach((it) => {
        if (key === 'items' && word) it.label = it.value.trim();
        it.value = '';
      });
    }
    // Nhãn chỉ là con số ("01"), hoặc lặp lại chữ đã có trong tiêu đề mục ("Kiểu 05" ↔ "KIỂU 05 Bẫy món hời") → bỏ.
    const squash = (v) => lower(v).replace(/(^|\D)0+(?=\d)/g, '$1').replace(/\s+/g, ' ');
    for (const it of list) {
      if (!it || typeof it.value !== 'string' || !it.value.trim()) continue;
      // So nguyên từ: "Kiểu 05" ↔ "KIỂU 05 Bẫy…" là lặp; "A" ↔ "amazon.com" không phải.
      if (/^\s*\d{1,3}\s*$/.test(it.value) || ` ${squash(plainText(it.title))} `.includes(` ${squash(it.value)} `)) it.value = '';
    }
    if (key === 'steps' && list.length >= 2 && list.every((it, k) => Number(LEAD_STEP_RE.exec(String(it?.title || ''))?.[1]) === k + 1)) {
      list.forEach((it) => (it.title = it.title.replace(LEAD_STEP_RE, '')));
    }
  }
}

/* ---------------- số thứ tự trang trí: tách khỏi tiêu đề mục ---------------- */
// "Kiểu 01: Cơ quan nhà nước", "01. Giục gấp", "Giai đoạn II – …" → { word, raw, n, rest }.
const NUM_PREFIX_RE = /^\s*((?:\p{L}+\s+){0,2}?)(\d{1,2}|[IVX]{1,4})(?![\p{L}\d])(?:\s*([.:)·–—|/-])\s*|\s+)(?=\S)/u;
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];
const numValue = (raw) => (/^\d+$/.test(raw) ? Number(raw) : ROMAN.indexOf(raw) + 1);
const pad2n = (n) => String(n).padStart(2, '0');

/**
 * Tiền tố đánh số chung của cả danh sách (mọi mục cùng chữ dẫn, số liên tiếp) hoặc null.
 * Một mục lẻ "3 bước…" không bị coi là số thứ tự — cần ≥ 2 mục, đánh số liên tiếp.
 */
export function numberPrefix(list) {
  if (!Array.isArray(list) || list.length < 2) return null;
  const m = list.map((it) => NUM_PREFIX_RE.exec(typeof it?.title === 'string' ? it.title : ''));
  if (!m.every(Boolean)) return null;
  const word = m[0][1].trim();
  if (word.length > 16) return null;
  // Không chữ dẫn, không dấu ngăn ("2 triệu người", "3 tỷ đồng") chỉ là số liệu — trừ số viết đủ 2 chữ số ("01 Giục gấp").
  if (!word && m.some((x) => !x[3] && !/^0\d$/.test(x[2]))) return null;
  const start = numValue(m[0][2]);
  const ok = start >= 1 && start <= 20 && m.every((x, k) => lower(x[1]) === lower(m[0][1]) && numValue(x[2]) === start + k && list[k].title.slice(x[0].length).trim());
  if (!ok) return null;
  const head = word ? `${word.charAt(0).toLocaleUpperCase('vi')}${word.slice(1).toLocaleLowerCase('vi')} ` : '';
  return {
    word,
    start,
    cut: m.map((x) => x[0].length),
    labels: m.map((x) => `${head}${/^\d+$/.test(x[2]) ? (word ? x[2] : pad2n(Number(x[2]))) : x[2]}`),
  };
}

const NUMBERED_ITEM_VARIANTS = { bullets: new Set(['numbered']), cards: new Set(['numbered', 'alternate']) };
/** Bố cục tự vẽ số 01, 02… cho mục thứ i (render.js: agenda luôn; bullets/cards biến thể đánh số khi mục không có ảnh). */
export function drawsItemNumber(s, i) {
  if (s.layout === 'agenda') return true;
  return !!NUMBERED_ITEM_VARIANTS[s.layout]?.has(s.variant) && !s.items?.[i]?.image?.asset;
}

/**
 * Số thứ tự trong tiêu đề mục/bước → không lặp với số bố cục tự vẽ, người dùng không phải sửa tay:
 *  - bố cục đã vẽ số và dãy bắt đầu từ 1 → bỏ tiền tố khỏi tiêu đề;
 *  - còn lại → chuyển thành nhãn nhỏ phía trên tiêu đề (items[i].label) / nhãn bước (steps[i].value).
 * Nhãn chỉ là số thứ tự trùng số bố cục vẽ → bỏ. Chạy sau artDirect (biến thể đã chốt). Trả số trang đã sửa.
 */
export function tidyNumbers(spec) {
  let fixed = 0;
  for (const s of spec.slides || []) {
    let hit = false;
    const items = Array.isArray(s.items) ? s.items : [];
    const pi = numberPrefix(items);
    if (pi) {
      hit = true;
      items.forEach((it, k) => (it.title = it.title.slice(pi.cut[k]).trim()));
      const drawn = items.every((_, k) => drawsItemNumber(s, k));
      if (!(drawn && pi.start === 1)) {
        // Dãy tiếp nối trang trước (06…10) trên biến thể đánh số → bỏ biến thể (số vẽ sẽ sai), giữ nhãn đúng.
        if (drawn && s.layout !== 'agenda') s.variant = '';
        items.forEach((it, k) => {
          if (!it.label) it.label = pi.labels[k];
        });
      }
    }
    // Nhãn mục chỉ là 1, 2, 3… ở bố cục đã tự vẽ số → bỏ.
    if (items.length >= 2 && items.every((it, k) => drawsItemNumber(s, k) && SEQ_RE.exec(String(it.label || '')) && Number(SEQ_RE.exec(it.label)[2]) === k + 1)) {
      items.forEach((it) => delete it.label);
      hit = true;
    }
    const steps = Array.isArray(s.steps) ? s.steps : [];
    const ps = numberPrefix(steps);
    if (ps) {
      hit = true;
      steps.forEach((st, k) => (st.title = st.title.slice(ps.cut[k]).trim()));
      // Bước quy trình luôn có số lớn; mốc thời gian vẽ số khi chưa có nhãn → chỉ giữ nhãn khi mang thêm nghĩa (chữ dẫn / dãy tiếp nối).
      if ((ps.word && s.layout === 'timeline') || ps.start !== 1) {
        if (steps.every((st) => !st.value)) steps.forEach((st, k) => (st.value = ps.labels[k]));
      }
    }
    if (s.layout === 'timeline' && stepMarks(steps)) hit = true;
    if (hit) fixed++;
  }
  return fixed;
}

// Mốc thời gian lặp ở đầu tiêu đề bước: "2015 – 2019 · Lợi dụng mạng xã hội" trong khi nhãn mốc đã là "2015–2019" (bước chưa có nhãn:
// "TRƯỚC 2015 · Lừa đại trà"). Mọi bước cùng dạng "mốc · nội dung" và có ít nhất 1 nhãn trùng mốc → mốc về nhãn, tiêu đề chỉ còn nội dung.
const STEP_MARK_RE = /^(.{2,24}?)\s*[·|:]\s+(\S.*)$/u;
const markKey = (v) => String(v || '').toLocaleLowerCase('vi').replace(/[\s–—-]+/g, '');
function stepMarks(steps) {
  if (steps.length < 2) return false;
  const parts = steps.map((st) => (typeof st.title === 'string' && !hasRich(st.title) ? STEP_MARK_RE.exec(st.title) : null));
  if (!parts.every(Boolean)) return false;
  if (!steps.every((st, k) => !st.value || markKey(st.value) === markKey(parts[k][1]))) return false;
  if (!steps.some((st) => st.value)) return false;
  steps.forEach((st, k) => {
    if (!st.value) st.value = parts[k][1].trim().slice(0, SPEC_LIMITS.itemValue);
    st.title = parts[k][2].trim();
  });
  return true;
}

/* ---------------- chữ đầu trang lặp nhau ---------------- */
const SPEC_KICKER = SPEC_LIMITS.kicker;
const HEAD_SEP_RE = /^[\s·:—–\-|,.]+/;
const norm = (v) => lower(plainText(String(v || ''))).replace(/[\s·:—–\-|,.!?"“”'‘’]+/g, ' ').trim();
// Bỏ phần đầu `head` khỏi chuỗi `v` (so không phân biệt hoa/thường) → phần còn lại, hoặc null khi không bắt đầu bằng head.
function dropHead(v, head) {
  if (typeof v !== 'string' || typeof head !== 'string' || !head.trim()) return null;
  const a = v.normalize('NFC');
  const h = head.normalize('NFC').trim();
  const la = lower(a);
  if (la.length !== a.length || !la.trimStart().startsWith(lower(h))) return null;
  const at = a.length - a.trimStart().length + h.length;
  // Phải dừng ở ranh giới từ ("Phần 3 · …"), không cắt giữa từ ("Phần 30…").
  if (at < a.length && /[\p{L}\d]/u.test(a[at])) return null;
  return a.slice(at).replace(HEAD_SEP_RE, '').trim();
}

/**
 * Nhãn nhỏ đầu trang (kicker) / tiêu đề / phụ đề / thẻ chủ đề nhắc lại nhau → mỗi ý chỉ hiện một lần:
 * phụ đề mở đầu bằng nhãn ("CÂU HỎI 2 · HÌNH THỨC 1 — Kẻ gian…") → bỏ phần lặp; tiêu đề mở đầu bằng nhãn ("Phần 3 · Phòng tránh") → bỏ khỏi tiêu đề;
 * phụ đề trùng tiêu đề → bỏ phụ đề; thẻ chủ đề trùng nhãn/tiêu đề → bỏ thẻ. Trả số trang đã sửa.
 */
// Nhãn gốc đầu tiêu đề: "PHẦN 3 · Phòng tránh", "Câu hỏi 1 · Ai mở lời trước?" (từ chỉ phần/câu hỏi + số + dấu ngăn).
const TITLE_LABEL_RE = /^\s*((?:phần|câu hỏi|chương|chủ đề|bài)\s+(?:\d{1,2}|[ivx]{1,4}))\s*[·:.–—-]\s*(?=\S)/iu;
const isUpper = (v) => /\p{L}/u.test(v) && v === v.toLocaleUpperCase('vi') && v !== v.toLocaleLowerCase('vi');
const hasLower = (v) => /\p{Ll}/u.test(v);

/** Trang chưa có nhãn (dàn ý giữ nguyên nội dung — AI không tự đặt nhãn): cụm nhãn gốc của tài liệu → nhãn đầu trang. */
function labelFromSource(s) {
  if (s.kicker || s.layout === 'section') return;
  if (typeof s.title === 'string' && !hasRich(s.title)) {
    const m = TITLE_LABEL_RE.exec(s.title);
    if (m && m[1].length <= SPEC_KICKER) {
      s.kicker = m[1].trim();
      s.title = s.title.slice(m[0].length).trim();
      if (s.highlight && !s.title.includes(s.highlight)) s.highlight = '';
      return;
    }
  }
  if (typeof s.subtitle !== 'string' || hasRich(s.subtitle)) return;
  // "CÂU HỎI 3 · VÌ SAO SẬP BẪY? — Kẻ gian…": cụm IN HOA trước dấu gạch là nhãn gốc, phần sau (chữ thường) là phụ đề.
  const m = /^(.{3,60}?)\s+[—–]\s+(?=\S)/u.exec(s.subtitle);
  if (m && m[1].length <= SPEC_KICKER && isUpper(m[1]) && hasLower(s.subtitle.slice(m[0].length))) {
    s.kicker = m[1].trim();
    s.subtitle = s.subtitle.slice(m[0].length).trim();
    return;
  }
  // Cả phụ đề là nhãn IN HOA nhiều cụm ("CÂU HỎI 2 · HÌNH THỨC 1") → nhãn.
  const t = s.subtitle.trim();
  if (t.length <= SPEC_KICKER && t.includes('·') && isUpper(t)) {
    s.kicker = t;
    s.subtitle = '';
  }
}

export function tidyHeads(spec) {
  let fixed = 0;
  for (const s of spec.slides || []) {
    const before = JSON.stringify([s.kicker, s.title, s.subtitle, s.tags, s.highlight]);
    labelFromSource(s);
    if (s.kicker && s.subtitle) {
      const rest = dropHead(s.subtitle, plainText(s.kicker));
      if (rest !== null) s.subtitle = rest;
    }
    // "CÂU HỎI 2 · HÌNH THỨC 1 — Kẻ gian…" với nhãn "Câu hỏi 2 · Kịch bản tấn công": cụm đầu phụ đề là nhãn gốc của tài liệu, cùng đoạn đầu với nhãn
    // AI đặt → cụm gốc làm nhãn, phụ đề giữ phần sau dấu gạch.
    if (s.kicker && typeof s.subtitle === 'string') {
      const m = /^(.{3,60}?)\s+[—–-]\s+(?=\S)/u.exec(s.subtitle);
      const first = (v) => norm(String(v).split(/\s*[·|:]\s*/)[0]);
      if (m && !hasRich(s.subtitle) && first(m[1]) && first(m[1]) === first(plainText(s.kicker)) && m[1].length <= SPEC_KICKER) {
        s.kicker = m[1].trim();
        s.subtitle = s.subtitle.slice(m[0].length).trim();
      }
    }
    // "PHẦN 3 · PHÒNG TRÁNH" với nhãn "Phần 3 · Định hướng": tiền tố nhãn gốc của tiêu đề trùng cụm đầu của nhãn → bỏ khỏi tiêu đề.
    if (s.kicker && typeof s.title === 'string' && s.layout !== 'section' && !hasRich(s.title)) {
      const m = TITLE_LABEL_RE.exec(s.title);
      if (m && norm(m[1]) === norm(String(plainText(s.kicker)).split(/\s*[·|:]\s*/)[0])) {
        s.title = s.title.slice(m[0].length).trim();
        if (s.highlight && !s.title.includes(s.highlight)) s.highlight = '';
      }
    }
    if (s.kicker && s.title) {
      if (norm(s.kicker) === norm(s.title)) s.kicker = '';
      else {
        const rest = dropHead(s.title, plainText(s.kicker));
        if (rest) {
          s.title = rest;
          if (s.highlight && !s.title.includes(s.highlight)) s.highlight = '';
        }
      }
    }
    if (s.subtitle && norm(s.subtitle) === norm(s.title)) s.subtitle = '';
    if (Array.isArray(s.tags) && s.tags.length) {
      const seen = new Set([norm(s.kicker), norm(s.title)].filter(Boolean));
      s.tags = s.tags.filter((t) => !seen.has(norm(t)));
    }
    if (JSON.stringify([s.kicker, s.title, s.subtitle, s.tags, s.highlight]) !== before) fixed++;
  }
  return fixed;
}

// Trang nhận hình minh hoạ cỡ trang (ô ảnh của bố cục) · trang nhận hình cho từng mục.
const HERO_LAYOUTS = new Set(['cover', 'section', 'closing', 'bullets', 'image', 'quote']);
const ITEM_LAYOUTS = new Set(['cards', 'bullets', 'agenda']);

/**
 * Danh sách hình cần vẽ trong hạn mức `budget` — ưu tiên: bìa → trang mở đầu phần → bộ hình từng mục (trọn bộ hoặc bỏ) → hình trang khác.
 * @returns {Array<{ slide: number, item: number|null, subject: string }>}
 */
// Trang ý chính nhiều chữ (> 4 ý, hoặc ≥ 4 ý mà tổng chữ dài): hình cỡ trang chiếm ~40% bề ngang → chữ bị co nhỏ khó đọc → không nhận hình.
const DENSE_TEXT = 320;
function denseBullets(s) {
  if (s.layout !== 'bullets') return false;
  const items = s.items || [];
  const chars = items.reduce((n, it) => n + plainText(it.title || '').length + plainText(it.text || '').length, 0);
  return items.length > 4 || (items.length >= 4 && chars > DENSE_TEXT) || chars > DENSE_TEXT * 1.5;
}

export function planArt(spec, arts, budget) {
  const hero = [];
  const sets = [];
  spec.slides.forEach((s, i) => {
    const a = arts[i];
    if (!a) return;
    const items = s.items || [];
    const itemArts = items.map((it) => a.items.find((x) => x.title && x.title === plainText(it.title || ''))?.art || '');
    const userMedia = !!(s.image?.asset || s.video || items.some((it) => it.image?.asset));
    // Câu chốt cỡ lớn kèm hình (trang không có ô ảnh riêng): hình đặt ở slide.image, hiện bên phải câu chốt — thay bộ hình từng mục.
    if (!userMedia && a.quote && s.callout?.style === 'quote' && QUOTE_ART.has(s.layout)) {
      hero.push({ slide: i, item: null, subject: a.quote, quote: true });
      return;
    }
    if (!userMedia && ITEM_LAYOUTS.has(s.layout) && items.length >= 2 && items.length <= 6 && itemArts.every(Boolean)) {
      sets.push(itemArts.map((subject, k) => ({ slide: i, item: k, subject })));
      return;
    }
    if (a.slide && !userMedia && HERO_LAYOUTS.has(s.layout) && !denseBullets(s)) hero.push({ slide: i, item: null, subject: a.slide });
  });
  const rank = (s) => (s.layout === 'cover' ? 0 : s.layout === 'section' || s.layout === 'closing' || s.callout?.style === 'quote' ? 1 : 2);
  hero.sort((x, y) => rank(spec.slides[x.slide]) - rank(spec.slides[y.slide]) || x.slide - y.slide);
  const out = [];
  const take = (list) => {
    if (out.length + list.length > budget) return false;
    out.push(...list);
    return true;
  };
  for (const h of hero.filter((h) => rank(spec.slides[h.slide]) < 2)) take([h]);
  for (const set of sets) take(set);
  for (const h of hero.filter((h) => rank(spec.slides[h.slide]) === 2)) take([h]);
  return out;
}

// Một phong cách cho cả bài (bộ hình đồng bộ); màu chủ đạo theo màu phần của trang. Không bóng đổ/vật liệu trong suốt: nền được tách
// (cutoutArt) để hình nổi trên mọi nền trang, bóng do CSS tạo.
const ART_COLOR_WORDS = { blue: 'cobalt blue', red: 'coral red', green: 'mint green', violet: 'soft violet', amber: 'warm amber', cyan: 'teal cyan' };
export const ART_STYLE =
  'Glossy 3D clay-style illustration, single centered object, soft studio lighting, smooth rounded shapes, solid opaque materials (no glass, no transparent parts), no particles, no splashes, no flying fragments or light streaks, isolated object floating on a seamless pure white background with no ground shadow and no reflection, generous empty space around the object, clean and friendly, high detail.';

export function artPrompt(subject, partColor) {
  const tone = ART_COLOR_WORDS[partColor] || 'cobalt blue';
  return `${String(subject).trim().slice(0, 300)}. ${ART_STYLE} Pastel palette dominated by ${tone}, with white and a few small warm accents.`;
}

/**
 * Tách nền hình 3D (model vẽ vật thể trên nền trắng/ngà) → PNG nền trong suốt, cắt sát vật thể, để hình "nổi" trên mọi nền trang
 * (tối lẫn sáng) thay vì nằm trong một ô trắng.
 *  - Loang từ mép ảnh qua: điểm gần màu nền (trung bình 4 góc), và bóng đổ — điểm xám tối hơn nền, đổi sắc mượt so với điểm bên cạnh
 *    (mép vật thể đổi sắc gắt → loang dừng, vật thể màu xám không bị ăn).
 *  - Điểm trong vùng nền được tách ngược khỏi màu nền ("màu → độ trong suốt"): bóng xám thành bóng đen mờ (đổ đúng trên nền tối),
 *    viền khử răng cưa thành viền bán trong suốt; sát vật thể độ phủ tăng dần về 1 → viền liền, không thành nét sẫm răng cưa.
 *  - Cắt sát phần còn thấy + lề đều → vật thể to, cân giữa ô.
 * Nền tối/không đều, hoặc loang ăn gần hết hình (vật thể màu trắng liền nền) → giữ nguyên ảnh (an toàn hơn cắt hỏng).
 */
const CUT_LO = 6; // lệch ≤ mức này so với nền (nhiễu nén) → trong suốt hoàn toàn
const CUT_HI = 44; // lệch từ đây trở lên → không còn là nền (dừng loang), trừ bóng đổ
const CUT_EDGE = 22; // từ mức lệch này tới CUT_HI: vùng chuyển tiếp sát vật thể
const SHADOW_TINT = 0.12; // bóng đổ: tỷ lệ sáng từng kênh so với nền chênh nhau ≤ mức này (xám trung tính)
const SHADOW_STEP = 3; // bóng đổ: độ sáng đổi ≤ mức này giữa 2 điểm kề nhau (chuyển sắc mượt)
const CUT_PAD = 0.07; // lề quanh vật thể sau khi cắt sát (tỷ lệ cạnh ảnh)

export async function cutoutArt(buffer, { maxSide = 1024 } = {}) {
  const { data, info } = await sharp(buffer).removeAlpha().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const k = Math.max(4, Math.round(Math.min(w, h) * 0.03));
  const bg = [0, 0, 0];
  for (const [x0, y0] of [[0, 0], [w - k, 0], [0, h - k], [w - k, h - k]]) {
    for (let y = y0; y < y0 + k; y += 1) for (let x = x0; x < x0 + k; x += 1) for (let c = 0; c < 3; c += 1) bg[c] += data[(y * w + x) * 3 + c];
  }
  for (let c = 0; c < 3; c += 1) bg[c] /= 4 * k * k;
  if (bg.some((v) => v < 200)) return buffer;
  const n = w * h;
  const dist = new Uint8Array(n);
  const lum = new Uint8Array(n);
  const shade = new Uint8Array(n); // 1 = xám trung tính tối hơn nền (có thể là bóng đổ)
  for (let p = 0; p < n; p += 1) {
    const o = p * 3;
    const r = data[o] / bg[0];
    const g = data[o + 1] / bg[1];
    const b = data[o + 2] / bg[2];
    dist[p] = Math.min(255, Math.max(Math.abs(data[o] - bg[0]), Math.abs(data[o + 1] - bg[1]), Math.abs(data[o + 2] - bg[2])));
    lum[p] = Math.round((data[o] + data[o + 1] + data[o + 2]) / 3);
    shade[p] = Math.max(r, g, b) < 1 && Math.max(r, g, b) - Math.min(r, g, b) <= SHADOW_TINT ? 1 : 0;
  }
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  const push = (q, from) => {
    if (seen[q]) return;
    if (dist[q] < CUT_HI || (shade[q] && shade[from] && Math.abs(lum[q] - lum[from]) <= SHADOW_STEP)) {
      seen[q] = 1;
      queue[tail++] = q;
    }
  };
  const seed = (q) => {
    if (!seen[q] && dist[q] < CUT_HI) {
      seen[q] = 1;
      queue[tail++] = q;
    }
  };
  for (let x = 0; x < w; x += 1) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    if (x > 0) push(p - 1, p);
    if (x < w - 1) push(p + 1, p);
    if (p >= w) push(p - w, p);
    if (p < n - w) push(p + w, p);
  }
  if (tail > n * 0.93) return buffer; // hầu như không còn vật thể → nhiều khả năng ăn vào vật màu trắng
  const out = Buffer.alloc(n * 4);
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let p = 0; p < n; p += 1) {
    const i = p * 3;
    const o = p * 4;
    let a = 1;
    if (seen[p]) {
      if (dist[p] <= CUT_LO) continue; // trong suốt (RGBA = 0)
      // Độ phủ nhỏ nhất để điểm = nền trộn với một màu hợp lệ.
      a = 0;
      for (let c = 0; c < 3; c += 1) {
        const d = data[i + c] - bg[c];
        a = Math.max(a, d < 0 ? -d / bg[c] : d / Math.max(1, 255 - bg[c]));
      }
      if (!shade[p]) {
        const t = Math.min(1, Math.max(0, (dist[p] - CUT_EDGE) / (CUT_HI - CUT_EDGE)));
        a += (1 - a) * t * t;
      }
      a = Math.min(1, a);
      if (a <= 0.02) continue;
    }
    for (let c = 0; c < 3; c += 1) out[o + c] = a === 1 ? data[i + c] : Math.min(255, Math.max(0, Math.round((data[i + c] - bg[c] * (1 - a)) / a)));
    out[o + 3] = Math.round(a * 255);
    // Khung cắt: chỉ tính phần thấy rõ (bóng mờ ở rìa không kéo rộng khung).
    if (a >= 0.25) {
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const img = sharp(out, { raw: { width: w, height: h, channels: 4 } });
  if (x1 < x0) return img.png().toBuffer();
  const side = Math.max(x1 - x0 + 1, y1 - y0 + 1);
  const pad = Math.round(side * CUT_PAD);
  const cut = await img.extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).png().toBuffer();
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp(cut)
    .resize({ width: side, height: side, fit: 'contain', background: clear })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: clear })
    .png()
    .toBuffer();
}
