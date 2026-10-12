// Kiểu chữ tiêu đề (2026-10-12): mặc định VIẾT HOA ĐẦU CÂU — chỉ chữ cái đầu câu + tên riêng + từ viết tắt viết hoa.
// AI hay trả "Chương Trình Ưu Đãi MISA AMIS Kế Toán" (viết hoa mọi chữ đầu từ, kiểu tiếng Anh) → đổi về
// "Chương trình ưu đãi MISA AMIS Kế toán". Kiểu "VIẾT HOA TOÀN BỘ" là tuỳ chọn hiển thị (design.font.titleCase = 'upper', CSS).
//
// Không đoán bừa tên riêng: 1 chữ viết hoa giữa câu chỉ được GIỮ khi tư liệu/nội dung có bằng chứng — chữ đó xuất hiện viết hoa
// ở giữa câu (không phải đầu câu, không trong dòng cũng đang Viết Hoa Từng Chữ) và (không bao giờ xuất hiện viết thường, hoặc
// đúng cặp "chữ trước + chữ này" cũng viết hoa trong tư liệu — vd. "AMIS Kế toán"). Chỉ đổi chuỗi ĐANG Viết Hoa Từng Chữ;
// chuỗi viết đúng kiểu câu giữ nguyên. Hàm thuần, dùng chung server + giao diện.
import { plainText, parseRich, serializeRich } from './rich.js';

/** Từ luôn viết hoa toàn bộ. "AI" chỉ giữ khi đã viết hoa ("ai" tiếng Việt là đại từ — không tự đổi). */
export const ALWAYS_UPPER = Object.freeze(['MISA', 'AMIS', 'ASP', 'AI', 'JETPAY']);
const FORCE = new Set(['MISA', 'AMIS', 'ASP', 'JETPAY']);
export const TITLE_CASES = Object.freeze(['sentence', 'upper']);

const TOKEN = /\p{L}[\p{L}\p{M}\p{N}]*/gu;
// Ranh giới câu giữa 2 chữ: dấu kết câu, xuống dòng, dấu hai chấm, gạch đầu dòng, ngoặc, dấu ngoặc kép, ký hiệu liệt kê.
const BOUNDARY = /[.!?\n:;•·|()[\]"“”*–—]/;
const lc = (s) => s.toLocaleLowerCase('vi');
const uc = (s) => s.toLocaleUpperCase('vi');

function kind(t) {
  const up = uc(t);
  if (t === up && t !== lc(t)) return [...t].filter((ch) => /\p{L}/u.test(ch)).length >= 2 ? 'acronym' : 'cap';
  const rest = t.slice(1);
  if (t[0] === uc(t[0]) && t[0] !== lc(t[0])) return rest === lc(rest) ? 'cap' : 'mixed';
  return t === lc(t) ? 'lower' : 'mixed';
}

/** Chuỗi đang "Viết Hoa Từng Chữ": (sau chữ đầu) ≥ 1 chữ viết hoa chữ cái đầu và không chữ thường, hoặc ≥ 2 và chữ thường ≤ 20%. */
export function isTitleCased(s) {
  const toks = String(s ?? '').match(TOKEN) || [];
  let cap = 0;
  let lower = 0;
  toks.forEach((t, i) => {
    const k = kind(t);
    if (k === 'lower') lower += 1;
    else if (k === 'cap' && i > 0) cap += 1;
  });
  return (cap >= 1 && lower === 0) || (cap >= 2 && lower <= 0.2 * (cap + lower));
}

/**
 * Bằng chứng tên riêng từ tư liệu / nội dung bài.
 * @param {string|string[]} texts
 */
export function buildCaseIndex(texts) {
  const midCap = new Set();
  const lowerSeen = new Set();
  const pairs = new Set();
  const lines = (Array.isArray(texts) ? texts : [texts]).flatMap((t) => String(t ?? '').split('\n'));
  for (const line of lines) {
    const titled = isTitleCased(line);
    let prev = null;
    let last = 0;
    for (const m of line.matchAll(TOKEN)) {
      const t = m[0];
      const gap = line.slice(last, m.index);
      const initial = prev === null || BOUNDARY.test(gap);
      const k = kind(t);
      if (k === 'lower') lowerSeen.add(t);
      else if (k === 'cap' && !initial && !titled) {
        midCap.add(t);
        if (/^\s+$/.test(gap)) pairs.add(`${prev} ${t}`);
      }
      prev = t;
      last = m.index + t.length;
    }
  }
  return { midCap, lowerSeen, pairs };
}

const keepCap = (idx, t, prev) => !!idx && idx.midCap.has(t) && (!idx.lowerSeen.has(lc(t)) || (prev !== null && idx.pairs.has(`${prev} ${t}`)));
const forceUpper = (s) => s.replace(TOKEN, (t) => (FORCE.has(uc(t)) ? uc(t) : t));

/**
 * Chữ thường → viết hoa đầu câu. Luôn viết hoa MISA/AMIS/ASP/JETPAY. Chuỗi không "Viết Hoa Từng Chữ" chỉ được sửa các từ đó.
 * @param {string} s  chữ thuần (không thẻ định dạng)
 * @param {ReturnType<typeof buildCaseIndex>} [idx]
 */
export function sentenceCasePlain(s, idx) {
  const src = String(s ?? '');
  if (!isTitleCased(src)) return forceUpper(src);
  let prev = null;
  let last = 0;
  let out = '';
  for (const m of src.matchAll(TOKEN)) {
    const t = m[0];
    const gap = src.slice(last, m.index);
    const start = prev === null || /[.!?\n]/.test(gap);
    let v = t;
    const k = kind(t);
    if (FORCE.has(uc(t))) v = uc(t);
    else if (k === 'cap' && !start && !keepCap(idx, t, prev)) v = lc(t);
    else if (k === 'lower' && start) v = uc(t[0]) + t.slice(1);
    out += gap + v;
    prev = t;
    last = m.index + t.length;
  }
  return out + src.slice(last);
}

/** Như sentenceCasePlain nhưng giữ thẻ định dạng ⟦…⟧ (đổi hoa/thường không đổi độ dài chữ → chia lại theo đúng đoạn). */
export function sentenceCase(raw, idx) {
  const s = String(raw ?? '');
  const segs = parseRich(s);
  const plain = segs.map((g) => g.t).join('');
  const next = sentenceCasePlain(plain, idx);
  if (next === plain) return s;
  if (next.length !== plain.length) return next;
  let k = 0;
  for (const g of segs) {
    g.t = next.slice(k, k + g.t.length);
    k += g.t.length;
  }
  return serializeRich(segs);
}

// Cụm nhấn mạnh phải nằm nguyên văn trong tiêu đề — tiêu đề đổi hoa/thường thì lấy lại đúng đoạn tương ứng.
function fixHighlight(s) {
  if (!s.highlight || typeof s.title !== 'string') return;
  const title = plainText(s.title);
  if (title.includes(s.highlight)) return;
  const k = lc(title).indexOf(lc(s.highlight));
  s.highlight = k >= 0 ? title.slice(k, k + s.highlight.length) : '';
}

/** Mọi chữ của dàn ý / bài (làm bằng chứng tên riêng khi không có tư liệu gốc). */
export function deckTexts(doc) {
  const out = [];
  const add = (v) => typeof v === 'string' && v && out.push(plainText(v));
  for (const s of doc?.slides || []) {
    add(s.title);
    add(s.subtitle);
    add(s.caption);
    add(s.notes);
    (s.points || []).forEach(add);
    for (const it of [...(s.items || []), ...(s.steps || [])]) {
      add(it.title);
      add(it.text);
    }
    for (const c of s.columns || []) (c.points || []).forEach(add);
    if (s.quote) add(s.quote.text);
  }
  return out;
}

/**
 * Dàn ý từ AI: tiêu đề bài, tiêu đề/mô tả trang, phần nhãn của dòng ("Tự Động Hạch Toán: …") về viết hoa đầu câu.
 * Liên kết "[nhãn](URL)": chỉ đổi phần chữ, không đụng URL.
 * @returns {number} số chuỗi đã đổi
 */
export function sentenceCaseOutline(outline, idx) {
  let n = 0;
  const fix = (v) => {
    if (typeof v !== 'string' || !v) return v;
    // Che URL của liên kết "](URL)" (cùng độ dài) để không đổi chữ trong URL, đổi xong trả URL gốc về đúng chỗ.
    const masked = v.replace(/\]\([^()\s]*\)/g, (m) => '\u0000'.repeat(m.length));
    const changed = applyHeads(masked, idx);
    if (changed === masked || changed.length !== masked.length) return v;
    let out = '';
    for (let i = 0; i < v.length; i += 1) out += masked[i] === '\u0000' ? v[i] : changed[i];
    n += 1;
    return out;
  };
  outline.title = fix(outline.title);
  for (const s of outline.slides || []) {
    s.title = fix(s.title);
    s.subtitle = fix(s.subtitle);
    s.points = (s.points || []).map(fix);
  }
  return n;
}

// Dòng "Nhãn: diễn giải" — đổi riêng phần nhãn (diễn giải thường đã viết kiểu câu); cả dòng đang Viết Hoa Từng Chữ → đổi cả dòng.
function applyHeads(v, idx) {
  const whole = sentenceCasePlain(v, idx);
  if (whole !== forceUpper(v)) return whole;
  const m = /^([^:：—]{2,80}?)(\s*[:：—]\s*)([\s\S]*)$/.exec(v);
  if (!m) return whole;
  return `${sentenceCasePlain(m[1], idx)}${m[2]}${forceUpper(m[3])}`;
}

/**
 * Bài đã dựng: tiêu đề, mô tả, nhãn chủ đề, tiêu đề mục/bước/cột, nhãn, ô đứng đầu, lời kêu gọi.
 * @returns {number} số chuỗi đã đổi
 */
export function sentenceCaseSpec(spec, idx = buildCaseIndex(deckTexts(spec))) {
  let n = 0;
  const fix = (obj, key) => {
    if (!obj || typeof obj[key] !== 'string' || !obj[key]) return;
    const next = sentenceCase(obj[key], idx);
    if (next !== obj[key]) {
      obj[key] = next;
      n += 1;
    }
  };
  fix(spec, 'title');
  for (const s of spec.slides || []) {
    for (const k of ['title', 'subtitle', 'kicker', 'root']) fix(s, k);
    for (const it of [...(s.items || []), ...(s.steps || [])]) fix(it, 'title');
    for (const c of s.columns || []) fix(c, 'title');
    (s.tags || []).forEach((_t, i) => fix(s.tags, i));
    if (s.contact) fix(s.contact, 'cta');
    fixHighlight(s);
  }
  return n;
}
