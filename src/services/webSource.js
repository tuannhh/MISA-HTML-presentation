// Ảnh trong trang web làm tư liệu (nguồn = đường link: bài báo, trang *.misa.vn, bài đăng Facebook công khai…).
// Tìm ảnh thuộc NỘI DUNG CHÍNH của trang (khối bài viết, không lấy đầu/chân trang, menu, cột bên), tải qua fetch được truyền
// vào (mặc định safeFetch — chống SSRF) và lọc ảnh rác (biểu tượng, logo, ảnh quá nhỏ, dải băng rôn mảnh). Việc chọn ảnh hợp
// nội dung để gắn vào trang do AI làm sau khi xem từng ảnh (geminiService — danh sách IMGn).
// Chỉ đọc HTML tĩnh (không chạy JavaScript): ảnh nạp chậm (lazy-load) lấy từ data-src / data-srcset / <noscript>;
// Facebook khi không đăng nhập chỉ trả thẻ og: (ảnh + mô tả của bài đăng/trang công khai).
import sharp from 'sharp';
import { decodeEntities } from '../lib/html.js';
import { sniff, IMAGE_TYPES } from '../lib/fileType.js';

const MAX_PIXELS = 60_000_000;
// Lớp vỏ trang (đầu/chân trang, menu, cột bên) — bỏ khi không tìm được khối nội dung chính.
const CHROME_RE = /<(header|nav|footer|aside)\b[\s\S]*?<\/\1>/gi;
const SCRIPT_RE = /<(script|style|svg|template)\b[\s\S]*?<\/\1>/gi;
// Lớp/thuộc tính hay đặt cho khối nội dung bài viết (WordPress, báo điện tử VN, schema.org).
const CONTENT_ATTR =
  /<(div|section)\b[^>]*\b(?:class|id|itemprop)\s*=\s*["'][^"']*\b(?:entry-content|post-content|post-body|article-content|article-body|article__body|articleBody|content-detail|detail-content|news-content|single-content|fck_detail|the-content|blog-content|post-entry)\b[^"']*["'][^>]*>/gi;
// Tên tệp / lớp CSS của ảnh không phải nội dung (biểu tượng, logo, ảnh đại diện, ảnh đệm, nút chia sẻ, quảng cáo).
const JUNK_RE = /(?:^|[/_.\-\s])(?:logos?|icons?|favicon|sprite|avatar|emoji|emoticon|badge|spinner|loading|loader|placeholder|blank|spacer|pixel|tracking|1x1|ads?|advert|qc|social|share|sharing|btn|button)(?=$|[/_.\-\s\d])/i;
const SRCSET_ATTRS = ['data-srcset', 'data-lazy-srcset', 'srcset'];
const SRC_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-actualsrc', 'data-orig-file', 'data-large-file', 'data-full-url', 'src'];
const IMG_EXT = /\.(?:jpe?g|png|webp|gif|avif)$/i;
const FACEBOOK = /(?:^|\.)(?:facebook\.com|fb\.com|fb\.watch)$/i;

export const isFacebook = (url) => {
  try {
    return FACEBOOK.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

// Chữ thuần 1 dòng (bỏ thẻ, giải mã thực thể, gộp khoảng trắng) — dùng cho chú thích/tiêu đề mục gửi kèm ảnh.
const plain = (html) => decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ')).replace(/\s+/g, ' ').trim();

// Giá trị thuộc tính trong 1 thẻ (nháy kép, nháy đơn hoặc không nháy).
export function attrOf(tag, name) {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim() : '';
}

/** Tiêu đề, mô tả và ảnh đại diện (og:image, twitter:image) của trang. */
export function pageMeta(html) {
  const meta = new Map();
  const images = [];
  for (const m of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const key = (attrOf(m[0], 'property') || attrOf(m[0], 'name') || attrOf(m[0], 'itemprop')).toLowerCase();
    const content = attrOf(m[0], 'content');
    if (!key || !content) continue;
    if (['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) images.push(content);
    else if (!meta.has(key)) meta.set(key, content);
  }
  for (const m of String(html).matchAll(/<link\b[^>]*>/gi)) if (/\srel\s*=\s*["']?image_src/i.test(m[0])) images.push(attrOf(m[0], 'href'));
  const title = plain((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  return {
    title: meta.get('og:title') || title,
    description: (meta.get('og:description') || meta.get('description') || meta.get('twitter:description') || '').replace(/\s+/g, ' ').trim(),
    images,
  };
}

// Vị trí thẻ đóng khớp với thẻ mở `tag` tại `start` (đếm độ sâu cùng tên thẻ) — regex lười không bao được khối lồng nhau.
function balancedBlock(html, start, tag) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

const textLength = (html) => plain(html.replace(SCRIPT_RE, ' ')).length;

/**
 * Khối nội dung chính: ưu tiên khối có lớp "nội dung bài viết" → <article> → <main>; trong cùng mức chọn khối nhiều chữ nhất
 * (≥ 300 ký tự). Không có → cả trang trừ đầu/chân trang, menu, cột bên.
 */
export function mainRegion(html) {
  const tiers = [
    [...html.matchAll(CONTENT_ATTR)].map((m) => balancedBlock(html, m.index, m[1])),
    [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((m) => m[0]),
    [...html.matchAll(/<main\b[\s\S]*?<\/main>/gi)].map((m) => m[0]),
  ];
  for (const blocks of tiers) {
    let best = null;
    let bestLen = 299;
    for (const b of blocks) {
      const len = textLength(b);
      if (len > bestLen) [best, bestLen] = [b, len];
    }
    if (best) return best;
  }
  return html.replace(CHROME_RE, ' ');
}

// URL lớn nhất trong srcset ("a.jpg 480w, b.jpg 1200w" | "a.jpg 1x, b.jpg 2x").
export function largestFromSrcset(value) {
  let best = null;
  let bestScore = -1;
  for (const m of String(value).matchAll(/([^\s,][^\s]*?)(?:\s+(\d+(?:\.\d+)?)([wx]))?\s*(?:,|$)/g)) {
    if (!m[1] || m[1].startsWith('data:')) continue;
    const n = Number(m[2] || 1);
    const score = m[3] === 'w' ? n : n * 1000; // chỉ có "x" → coi 1x ≈ 1000px
    if (score > bestScore) [best, bestScore] = [m[1], score];
  }
  return best;
}

function resolve(raw, base) {
  if (!raw || /^(?:data|blob|javascript):/i.test(raw)) return null;
  try {
    const u = new URL(raw, base);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    u.hash = '';
    return u;
  } catch {
    return null;
  }
}

// Khoá chống trùng: cùng ảnh khác cỡ (?w=…, WordPress "-300x200.jpg") → 1 khoá. Đường dẫn không có đuôi ảnh (ảnh sinh động
// theo tham số) → giữ cả query.
export function imageKey(u) {
  const path = u.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, '');
  return `${u.hostname}${path}${IMG_EXT.test(u.pathname) ? '' : u.search}`.toLowerCase();
}

function bestSrc(tag, base) {
  for (const a of SRCSET_ATTRS) {
    const v = attrOf(tag, a);
    const u = v && resolve(largestFromSrcset(v), base);
    if (u) return u;
  }
  for (const a of SRC_ATTRS) {
    const u = resolve(attrOf(tag, a), base);
    if (u) return u;
  }
  return null;
}

function isJunk(tag, u) {
  if (/\.svg$/i.test(u.pathname) || /[?&](?:format|fm)=svg/i.test(u.search)) return true;
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* giữ nguyên */
  }
  if (JUNK_RE.test(path.split('/').slice(-2).join('/'))) return true;
  const cls = `${attrOf(tag, 'class')} ${attrOf(tag, 'id')}`;
  if (JUNK_RE.test(cls)) return true;
  if (/\blogo\b/i.test(attrOf(tag, 'alt'))) return true;
  // Chỉ số điểm ảnh thuần (width="100%" không tính).
  const px = (name) => (/^\d+$/.test(attrOf(tag, name)) ? Number(attrOf(tag, name)) : 0);
  return (px('width') > 0 && px('width') < 120) || (px('height') > 0 && px('height') < 120);
}

// Alt là tên tệp/mã (vd. "wm1-1791946565839-5630") → không mang nghĩa, bỏ; giữ alt có khoảng trắng hoặc chữ tiếng Việt.
const meaningfulAlt = (alt) => (/\s|[\u0080-￿]/.test(alt) ? alt : '');

/**
 * Ảnh ứng viên của trang theo thứ tự xuất hiện: ảnh trong khối nội dung chính (kèm chú thích <figcaption>, mô tả alt, tiêu đề mục
 * gần nhất phía trước) rồi tới ảnh đại diện og:image. `ogOnly` (Facebook): chỉ ảnh đại diện.
 * @returns {Array<{url:string, alt:string, caption:string, heading:string, og?:boolean}>}
 */
export function findPageImages(html, baseUrl, { max = 60, ogOnly = false } = {}) {
  const src = String(html).replace(SCRIPT_RE, ' ');
  const out = [];
  const seen = new Map();
  const add = (u, extra) => {
    const key = imageKey(u);
    const prev = seen.get(key);
    // Cùng ảnh gặp lại (<source> rồi <img> của 1 <picture>, bản khác cỡ) → giữ mục đầu, bổ sung mô tả/chú thích còn thiếu.
    if (prev) {
      for (const k of ['alt', 'caption', 'heading']) if (!prev[k] && extra[k]) prev[k] = extra[k];
      return;
    }
    if (out.length >= max) return;
    const item = { url: u.href, ...extra };
    seen.set(key, item);
    out.push(item);
  };
  if (!ogOnly) {
    const region = mainRegion(src);
    const heads = [...region.matchAll(/<h([1-4])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ at: m.index, text: plain(m[2]).slice(0, 120) })).filter((h) => h.text);
    const figs = [...region.matchAll(/<figure\b[\s\S]*?<\/figure>/gi)].map((m) => ({
      start: m.index,
      end: m.index + m[0].length,
      caption: plain((m[0].match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i) || [])[1]).slice(0, 200),
    }));
    for (const m of region.matchAll(/<(img|source)\b[^>]*>/gi)) {
      const tag = m[0];
      // <source> của <picture> (ảnh); <source> của video/audio không có srcset → bỏ.
      if (m[1].toLowerCase() === 'source' && (!/srcset\s*=/i.test(tag) || /\stype\s*=\s*["']?(?:video|audio)/i.test(tag))) continue;
      const u = bestSrc(tag, baseUrl);
      if (!u || isJunk(tag, u)) continue;
      const fig = figs.find((f) => m.index >= f.start && m.index < f.end);
      let heading = '';
      for (const h of heads) if (h.at < m.index) heading = h.text;
      add(u, { alt: meaningfulAlt(attrOf(tag, 'alt')).slice(0, 160), caption: fig?.caption || '', heading });
    }
  }
  for (const raw of pageMeta(src).images) {
    const u = resolve(raw, baseUrl);
    if (u && !/\.svg$/i.test(u.pathname)) add(u, { alt: '', caption: '', heading: '', og: true });
  }
  return out;
}

const fileName = (url) => {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
    return (last || 'anh-trang-web').normalize('NFC').slice(0, 120);
  } catch {
    return 'anh-trang-web';
  }
};

/**
 * Tải lần lượt các ảnh ứng viên (từ vị trí `start`, song song `concurrency`) tới khi đủ `max` ảnh dùng được: đúng là ảnh
 * (magic bytes), cạnh ngắn ≥ `minSide`, không phải dải mảnh (tỷ lệ cạnh ≤ `maxRatio`). Ảnh lỗi/không đạt → bỏ qua, thử ảnh kế.
 * Dừng khi hết `deadline` (mốc ms). `fetch(url, { timeoutMs, maxBytes, headers })` → { status, body }.
 * @returns {Promise<{ images: Array<{url, name, buffer, width, height, alt, caption, heading, og?}>, next: number }>}
 */
export async function fetchImages(cands, { fetch, referer, max, start = 0, maxBytes, timeoutMs = 20000, concurrency = 4, minSide = 200, maxRatio = 4, deadline = Infinity }) {
  const images = [];
  let i = start;
  const loadOne = async (c) => {
    try {
      const res = await fetch(c.url, { timeoutMs, maxBytes, headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', ...(referer ? { referer } : {}) } });
      if (!res || res.status >= 400 || !res.body?.length || !IMAGE_TYPES.has(sniff(res.body))) return null;
      const meta = await sharp(res.body, { limitInputPixels: MAX_PIXELS }).metadata();
      const width = meta.width || 0;
      const height = meta.pageHeight || meta.height || 0;
      if (Math.min(width, height) < minSide || Math.max(width, height) / Math.min(width, height) > maxRatio) return null;
      return { ...c, name: fileName(c.url), buffer: res.body, width, height };
    } catch {
      return null;
    }
  };
  while (i < cands.length && images.length < max && Date.now() < deadline) {
    const batch = cands.slice(i, i + Math.min(concurrency, max - images.length));
    i += batch.length;
    for (const got of await Promise.all(batch.map(loadOne))) if (got && images.length < max) images.push(got);
  }
  return { images, next: i };
}

// Mô tả ảnh gửi AI (1 dòng, không xuống dòng — chữ lấy từ trang web là dữ liệu, không phải chỉ thị).
export function webImageHint(pageTitle, img) {
  const one = (s, n) => String(s || '').replace(/[\r\n"]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const bits = [`ảnh trên trang web "${one(pageTitle, 100) || 'không tên'}"`];
  if (img.og) bits.push('ảnh tiêu biểu của trang (og:image)');
  if (img.caption) bits.push(`chú thích: ${one(img.caption, 160)}`);
  else if (img.alt) bits.push(`mô tả: ${one(img.alt, 120)}`);
  if (img.heading) bits.push(`thuộc mục "${one(img.heading, 100)}"`);
  return bits.join(' — ');
}
