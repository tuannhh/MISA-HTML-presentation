// Chữ có định dạng trong các trường văn bản của spec (tiêu đề, mô tả, nội dung thẻ…): màu chữ, chữ đậm, "giữ liền" (không
// ngắt dòng giữa cụm từ) và xuống dòng. Dùng chung renderer (server + trình soạn thảo), specService và bảng nội dung.
//
// Định dạng lưu NGAY TRONG CHUỖI để đi theo nội dung khi sắp xếp/nhân bản/đổi bố cục:
//   "Hỏi đáp ⟦accent,b⟧song song⟦/⟧ và trợ lý AI"     — đoạn "song song" màu nhấn, chữ đậm
//   thuộc tính (phân tách dấu phẩy): token màu theo theme (RICH_COLORS) | #RRGGBB | b (đậm) | n (giữ liền)
//   xuống dòng = ký tự "\n". Không lồng nhau; dấu ⟦ ⟧ (U+27E6/U+27E7) không xuất hiện trong văn bản thường.
// AN TOÀN: chỉ nhận thuộc tính trong danh sách cho phép (màu hex kiểm định dạng) — thẻ sai cú pháp được coi là chữ thường;
// richHtml escape toàn bộ chữ, style chỉ ghép từ giá trị đã kiểm.

export const RICH_OPEN = '⟦';
export const RICH_CLOSE = '⟧';
const END = '⟦/⟧';

// Màu theo token của theme → tự đổi theo tông màu bài (giữ nhận diện khi đổi theme). Thêm mã #RRGGBB cho màu thương hiệu.
export const RICH_COLORS = Object.freeze({
  text: { label: 'Màu chữ chính', css: 'var(--text)' },
  accent: { label: 'Màu nhấn', css: 'var(--accent)' },
  'accent-2': { label: 'Màu nhấn phụ', css: 'var(--accent-2)' },
  amber: { label: 'Màu pha', css: 'var(--amber)' },
  mint: { label: 'Xanh lá', css: 'var(--mint)' },
  coral: { label: 'Đỏ', css: 'var(--coral)' },
  violet: { label: 'Đậm nhấn', css: 'var(--violet)' },
  muted: { label: 'Xám', css: 'var(--muted)' },
  white: { label: 'Trắng', css: '#FFFFFF' },
  dark: { label: 'Đen', css: '#111111' },
});
const HEX = /^#[0-9a-f]{6}$/i;
const RUN = /⟦([^⟦⟧\n]{1,40})⟧([^⟦⟧]*?)⟦\/⟧/g;

/** Thuộc tính hợp lệ → { c, b, n } | null (sai → cả thẻ là chữ thường). */
export function parseAttrs(str) {
  const out = { c: null, b: false, n: false };
  for (const raw of String(str).split(',')) {
    const a = raw.trim();
    if (a === 'b') out.b = true;
    else if (a === 'n') out.n = true;
    else if (RICH_COLORS[a] && !out.c) out.c = a;
    else if (HEX.test(a) && !out.c) out.c = a.toUpperCase();
    else return null;
  }
  return out.c || out.b || out.n ? out : null;
}
const attrKey = (s) => [s.c || '', s.b ? 'b' : '', s.n ? 'n' : ''].filter(Boolean).join(',');

export const hasRich = (s) => typeof s === 'string' && s.includes(RICH_OPEN);

/** Chuỗi → các đoạn [{ t, c, b, n }] (đoạn thường: c = null, b = n = false). */
export function parseRich(s) {
  const str = String(s ?? '');
  if (!str.includes(RICH_OPEN)) return str ? [{ t: str, c: null, b: false, n: false }] : [];
  const out = [];
  // Dấu ⟦ ⟧ lẻ (thẻ sai cú pháp) bị bỏ — chữ thuần, bản lưu và HTML luôn khớp nhau.
  const plain = (t) => {
    const v = t.replace(/[⟦⟧]/g, '');
    if (v) out.push({ t: v, c: null, b: false, n: false });
  };
  let last = 0;
  RUN.lastIndex = 0;
  for (let m = RUN.exec(str); m; m = RUN.exec(str)) {
    const at = parseAttrs(m[1]);
    if (!at) continue;
    plain(str.slice(last, m.index));
    if (m[2]) out.push({ t: m[2], ...at });
    last = m.index + m[0].length;
  }
  plain(str.slice(last));
  return out;
}

/** Các đoạn → chuỗi lưu trữ (gộp đoạn liền kề cùng định dạng, bỏ đoạn rỗng). */
export function serializeRich(segs) {
  const merged = [];
  for (const s of segs || []) {
    const t = String(s?.t ?? '').replace(/[⟦⟧]/g, '');
    if (!t) continue;
    const at = { c: s.c && (RICH_COLORS[s.c] || HEX.test(s.c)) ? s.c : null, b: !!s.b, n: !!s.n };
    const prev = merged[merged.length - 1];
    if (prev && attrKey(prev) === attrKey(at)) prev.t += t;
    else merged.push({ t, ...at });
  }
  return merged.map((s) => (attrKey(s) ? `${RICH_OPEN}${attrKey(s)}${RICH_CLOSE}${s.t}${END}` : s.t)).join('');
}

/** Chữ thuần (bỏ định dạng) — dùng cho đếm độ dài, aria-label, danh sách trang, so khớp cụm từ nhấn mạnh. */
export function plainText(s) {
  if (!hasRich(s)) return String(s ?? '');
  return parseRich(s).map((x) => x.t).join('');
}
/** Chuẩn hoá chuỗi có định dạng (thẻ sai thành chữ thường, gộp đoạn) — chuỗi không có thẻ trả nguyên. */
export const canonicalRich = (s) => (hasRich(s) ? serializeRich(parseRich(s)) : String(s ?? ''));

/** Cắt theo số ký tự HIỂN THỊ (không tính thẻ định dạng). */
export function cutRich(s, max) {
  const segs = parseRich(s);
  let left = max;
  const out = [];
  for (const x of segs) {
    if (left <= 0) break;
    out.push({ ...x, t: x.t.slice(0, left) });
    left -= x.t.length;
  }
  return serializeRich(out);
}

// Mảng ký tự kèm định dạng — tiện cho thao tác theo vị trí (đổi màu, viết hoa đoạn được chọn). Đơn vị = mã UTF-16 (khớp
// vị trí con trỏ của DOM trong khung sửa trực tiếp).
function toChars(segs) {
  const out = [];
  for (const s of segs) for (let i = 0; i < s.t.length; i += 1) out.push({ t: s.t[i], c: s.c, b: s.b, n: s.n });
  return out;
}

/**
 * Người dùng sửa bản chữ thuần (ô nhập ở bảng nội dung) → giữ định dạng cho phần không đổi.
 * So khớp đầu/cuối chung giữa chữ cũ và mới; phần chèn mới lấy định dạng của ký tự đứng trước.
 */
export function repaintRich(oldRaw, newPlain) {
  const next = String(newPlain ?? '');
  if (!hasRich(oldRaw)) return next;
  const chars = toChars(parseRich(oldRaw));
  const old = chars.map((c) => c.t);
  const nw = next.split('');
  let a = 0;
  while (a < old.length && a < nw.length && old[a] === nw[a]) a += 1;
  let b = 0;
  while (b < old.length - a && b < nw.length - a && old[old.length - 1 - b] === nw[nw.length - 1 - b]) b += 1;
  const fmt = chars[a - 1] || chars[a] || { c: null, b: false, n: false };
  const mid = nw.slice(a, nw.length - b).map((t) => ({ t, c: fmt.c, b: fmt.b, n: fmt.n && t !== '\n' }));
  return serializeRich([...chars.slice(0, a), ...mid, ...chars.slice(old.length - b)]);
}

/** Áp định dạng cho khoảng [start, end) theo chữ thuần: patch = { c?: token|hex|null, b?: bool, n?: bool, upper?: 'upper'|'lower'|'title' }. */
export function formatRange(raw, start, end, patch) {
  const chars = toChars(parseRich(raw));
  const s = Math.max(0, Math.min(start, chars.length));
  const e = Math.max(s, Math.min(end, chars.length));
  const out = [];
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (i < s || i >= e) {
      out.push(ch);
      continue;
    }
    const o = { ...ch };
    if ('c' in patch) o.c = patch.c || null;
    if ('b' in patch) o.b = !!patch.b;
    if ('n' in patch) o.n = !!patch.n && o.t !== '\n';
    if (patch.upper === 'upper') o.t = o.t.toLocaleUpperCase('vi');
    else if (patch.upper === 'lower') o.t = o.t.toLocaleLowerCase('vi');
    else if (patch.upper === 'title') {
      const prev = i === 0 ? ' ' : chars[i - 1].t;
      o.t = /\s/.test(prev) ? o.t.toLocaleUpperCase('vi') : o.t.toLocaleLowerCase('vi');
    }
    out.push(o);
  }
  return serializeRich(out);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escText = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
const lines = (t) => t.split('\n').map(escText).join('<br>');
export const colorCss = (c) => (!c ? '' : RICH_COLORS[c] ? RICH_COLORS[c].css : HEX.test(c) ? c.toUpperCase() : '');

function wrap(seg, html) {
  if (!seg.c && !seg.b && !seg.n) return html;
  const css = colorCss(seg.c);
  const st = `${css ? `color:${css};` : ''}${seg.b ? 'font-weight:800;' : ''}${seg.n ? 'white-space:nowrap;' : ''}`;
  const data = `${seg.c ? ` data-rc="${escText(seg.c)}"` : ''}${seg.b ? ' data-rb=""' : ''}${seg.n ? ' data-rn=""' : ''}`;
  return `<span class="rt"${data} style="${st}">${html}</span>`;
}

/**
 * Chuỗi có định dạng → HTML an toàn. highlight = cụm từ nhấn mạnh (trường highlight của slide, so khớp trên chữ thuần, lần
 * xuất hiện đầu) → bọc <em class="hl">; đoạn người dùng tự tô màu bên trong vẫn giữ màu của họ.
 */
export function richHtml(s, highlight) {
  const segs = parseRich(s);
  const h = String(highlight ?? '').trim();
  const plain = segs.map((x) => x.t).join('');
  const hs = h ? plain.indexOf(h) : -1;
  const he = hs >= 0 ? hs + h.length : -1;
  let pos = 0;
  let html = '';
  for (const seg of segs) {
    const a = pos;
    const b = pos + seg.t.length;
    pos = b;
    if (hs < 0 || he <= a || hs >= b) {
      html += wrap(seg, lines(seg.t));
      continue;
    }
    const x = Math.max(hs, a) - a;
    const y = Math.min(he, b) - a;
    const pre = seg.t.slice(0, x);
    const mid = seg.t.slice(x, y);
    const post = seg.t.slice(y);
    if (pre) html += wrap(seg, lines(pre));
    html += `<em class="hl">${wrap(seg, lines(mid))}</em>`;
    if (post) html += wrap(seg, lines(post));
  }
  return html;
}
