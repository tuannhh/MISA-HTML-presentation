// Chữ có định dạng trong các trường văn bản của spec (tiêu đề, mô tả, nội dung thẻ…): màu chữ, chữ đậm, "giữ liền" (không
// ngắt dòng giữa cụm từ), liên kết (hyperlink) và xuống dòng. Dùng chung renderer (server + trình soạn thảo), specService và bảng nội dung.
//
// Định dạng lưu NGAY TRONG CHUỖI để đi theo nội dung khi sắp xếp/nhân bản/đổi bố cục:
//   "Hỏi đáp ⟦accent,b⟧song song⟦/⟧ và trợ lý AI"     — đoạn "song song" màu nhấn, chữ đậm
//   thuộc tính (phân tách dấu phẩy): token màu theo theme (RICH_COLORS) | #RRGGBB | b (đậm) | n (giữ liền)
//   | href=<URL> (liên kết — luôn đứng CUỐI vì URL có thể chứa dấu phẩy): "⟦b,href=https://amis.misa.vn/⟧AMIS⟦/⟧"
//   xuống dòng = ký tự "\n". Không lồng nhau; dấu ⟦ ⟧ (U+27E6/U+27E7) không xuất hiện trong văn bản thường.
// AN TOÀN: chỉ nhận thuộc tính trong danh sách cho phép (màu hex kiểm định dạng, URL chỉ http(s)/mailto/tel — safeHref) — thẻ sai
// cú pháp được coi là chữ thường; richHtml escape toàn bộ chữ, style/href chỉ ghép từ giá trị đã kiểm; liên kết mở ở tab mới
// (target=_blank, rel=noopener noreferrer — trang đích không điều khiển được trang trình chiếu).

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
// Thuộc tính tối đa 600 ký tự (URL liên kết ≤ HREF_MAX + các thuộc tính ngắn).
const RUN = /⟦([^⟦⟧\n]{1,600})⟧([^⟦⟧]*?)⟦\/⟧/g;

export const HREF_MAX = 500;
const EMAIL_RE = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,24}$/;
const BAD_URL_CH = /[\s⟦⟧<>"`\\]/;

/**
 * URL liên kết an toàn (dạng chuẩn hoá) | null. Chỉ nhận http(s)://<tên miền>, mailto:<email>, tel:<số> — chặn javascript:, data:,
 * URL có tài khoản (https://user:pass@…), ký tự trắng/ngoặc/⟦⟧ (không phá được cú pháp lưu trữ hay thuộc tính HTML).
 */
export function safeHref(v) {
  const s = String(v ?? '').trim();
  if (!s || s.length > HREF_MAX || BAD_URL_CH.test(s)) return null;
  if (/^mailto:/i.test(s)) return EMAIL_RE.test(s.slice(7)) ? `mailto:${s.slice(7)}` : null;
  if (/^tel:/i.test(s)) return /^\+?\d{3,15}$/.test(s.slice(4)) ? `tel:${s.slice(4)}` : null;
  if (!/^https?:\/\//i.test(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.') || u.username || u.password) return null;
  return u.href.length <= HREF_MAX && !BAD_URL_CH.test(u.href) ? u.href : null;
}

/** Thuộc tính hợp lệ → { c, b, n, h } | null (sai → cả thẻ là chữ thường). h = URL liên kết (đã chuẩn hoá) | null. */
export function parseAttrs(str) {
  const out = { c: null, b: false, n: false, h: null };
  let s = String(str);
  // href luôn đứng cuối: phần sau "href=" là nguyên URL (có thể chứa dấu phẩy).
  const at = s.startsWith('href=') ? 0 : s.indexOf(',href=');
  if (at >= 0) {
    out.h = safeHref(s.slice(at === 0 ? 5 : at + 6));
    if (!out.h) return null;
    s = s.slice(0, at);
  }
  if (s) {
    for (const raw of s.split(',')) {
      const a = raw.trim();
      if (a === 'b') out.b = true;
      else if (a === 'n') out.n = true;
      else if (RICH_COLORS[a] && !out.c) out.c = a;
      else if (HEX.test(a) && !out.c) out.c = a.toUpperCase();
      else return null;
    }
  }
  return out.c || out.b || out.n || out.h ? out : null;
}
const attrKey = (s) => [s.c || '', s.b ? 'b' : '', s.n ? 'n' : '', s.h ? `href=${s.h}` : ''].filter(Boolean).join(',');

export const hasRich = (s) => typeof s === 'string' && s.includes(RICH_OPEN);

/** Chuỗi → các đoạn [{ t, c, b, n, h }] (đoạn thường: c = h = null, b = n = false). */
export function parseRich(s) {
  const str = String(s ?? '');
  if (!str.includes(RICH_OPEN)) return str ? [{ t: str, c: null, b: false, n: false, h: null }] : [];
  const out = [];
  // Dấu ⟦ ⟧ lẻ (thẻ sai cú pháp) bị bỏ — chữ thuần, bản lưu và HTML luôn khớp nhau.
  const plain = (t) => {
    const v = t.replace(/[⟦⟧]/g, '');
    if (v) out.push({ t: v, c: null, b: false, n: false, h: null });
  };
  let last = 0;
  RUN.lastIndex = 0;
  for (let m = RUN.exec(str); m; m = RUN.exec(str)) {
    const at = parseAttrs(m[1]);
    if (!at) {
      // Liên kết có URL bị chặn (javascript:, data:…) → giữ chữ, bỏ hẳn liên kết; thẻ sai khác → chữ thường (bỏ dấu ngoặc) như cũ.
      if (/(^|,)href=/.test(m[1])) {
        plain(str.slice(last, m.index));
        plain(m[2]);
        last = m.index + m[0].length;
      }
      continue;
    }
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
    const at = { c: s.c && (RICH_COLORS[s.c] || HEX.test(s.c)) ? s.c : null, b: !!s.b, n: !!s.n, h: s.h ? safeHref(s.h) : null };
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
  for (const s of segs) for (let i = 0; i < s.t.length; i += 1) out.push({ t: s.t[i], c: s.c, b: s.b, n: s.n, h: s.h || null });
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
  const fmt = chars[a - 1] || chars[a] || { c: null, b: false, n: false, h: null };
  // Chữ gõ thêm chỉ thuộc liên kết khi nằm GIỮA liên kết (gõ nối sau cuối liên kết là chữ thường).
  const after = chars[old.length - b];
  const h = chars[a - 1] && after && chars[a - 1].h === after.h ? chars[a - 1].h : null;
  const mid = nw.slice(a, nw.length - b).map((t) => ({ t, c: fmt.c, b: fmt.b, n: fmt.n && t !== '\n', h }));
  return serializeRich([...chars.slice(0, a), ...mid, ...chars.slice(old.length - b)]);
}

/** Áp định dạng cho khoảng [start, end) theo chữ thuần: patch = { c?: token|hex|null, b?: bool, n?: bool, h?: URL|null, upper?: 'upper'|'lower'|'title' }. */
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
    if ('h' in patch) o.h = patch.h ? safeHref(patch.h) : null;
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

// Liên kết: mở tab mới, không cho trang đích truy cập trang trình chiếu (noopener) hay biết trang nguồn (noreferrer).
export const linkAttrs = (href) => ` href="${escText(href)}" target="_blank" rel="noopener noreferrer"`;

function wrap(seg, html) {
  let out = html;
  if (seg.c || seg.b || seg.n) {
    const css = colorCss(seg.c);
    const st = `${css ? `color:${css};` : ''}${seg.b ? 'font-weight:800;' : ''}${seg.n ? 'white-space:nowrap;' : ''}`;
    const data = `${seg.c ? ` data-rc="${escText(seg.c)}"` : ''}${seg.b ? ' data-rb=""' : ''}${seg.n ? ' data-rn=""' : ''}`;
    out = `<span class="rt"${data} style="${st}">${html}</span>`;
  }
  const h = seg.h ? safeHref(seg.h) : null;
  return h ? `<a class="rl"${linkAttrs(h)}>${out}</a>` : out;
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

/** Các URL liên kết trong chuỗi (theo thứ tự, có thể trùng). */
export function richLinks(s) {
  if (!hasRich(s)) return [];
  return parseRich(s).filter((x) => x.h).map((x) => x.h);
}

/** Tổng độ dài phần "href=…" trong chuỗi — không tính vào trần độ dài thô (URL dài không làm hỏng giới hạn ký tự của ô chữ). */
export function hrefWeight(s) {
  if (!hasRich(s)) return 0;
  let n = 0;
  RUN.lastIndex = 0;
  for (let m = RUN.exec(s); m; m = RUN.exec(s)) {
    const at = m[1].startsWith('href=') ? 0 : m[1].indexOf(',href=');
    if (at >= 0) n += m[1].length - at;
  }
  return n;
}

/**
 * Gắn liên kết cho lần xuất hiện ĐẦU của cụm chữ `phrase` (so khớp trên chữ thuần, phân biệt hoa thường) chưa có liên kết.
 * Trả chuỗi mới, hoặc null khi không tìm thấy / URL không hợp lệ.
 */
export function linkPhrase(raw, phrase, href) {
  const h = safeHref(href);
  const p = String(phrase ?? '');
  if (!h || !p.trim()) return null;
  const chars = toChars(parseRich(raw));
  const plain = chars.map((c) => c.t).join('');
  let from = 0;
  for (let i = plain.indexOf(p, from); i >= 0; i = plain.indexOf(p, from)) {
    if (!chars.slice(i, i + p.length).some((c) => c.h)) return formatRange(raw, i, i + p.length, { h });
    from = i + 1;
  }
  return null;
}
