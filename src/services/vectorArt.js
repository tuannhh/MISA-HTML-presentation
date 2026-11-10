// Hình minh hoạ vector cho từng thẻ/mục: model viết SVG (không vẽ ảnh) → làm sạch theo danh sách cho phép → dựng thành PNG nền trong suốt
// bằng bộ dựng vector (librsvg qua sharp). Không có bước "tách nền" nên cạnh hình luôn sắc, không lem; màu chỉnh được theo màu phần của bài.
import sharp from 'sharp';

// Bảng màu theo màu phần (ART_COLOR_WORDS ở artDirection.js dùng cùng khoá): sáng → đậm. Model chỉ dùng các màu này + trắng + màu nhấn.
export const VECTOR_PALETTES = Object.freeze({
  blue: { name: 'cobalt blue', ramp: ['#E3ECFF', '#9DBBFF', '#4F86F0', '#245FDF', '#17419C'] },
  red: { name: 'coral red', ramp: ['#FFE6E1', '#FFA99C', '#F26A5B', '#DC3E31', '#992219'] },
  green: { name: 'mint green', ramp: ['#DDF7EA', '#8EE0B6', '#34BE83', '#12996A', '#0A6B47'] },
  violet: { name: 'soft violet', ramp: ['#EEE5FF', '#BDA5FF', '#8F68F2', '#6B3FD6', '#4A2A9E'] },
  amber: { name: 'warm amber', ramp: ['#FFF1D2', '#FFD27A', '#F9AE2B', '#E08A06', '#9F5C00'] },
  cyan: { name: 'teal cyan', ramp: ['#DAF6F8', '#8EDDE6', '#35BCCB', '#0F95A6', '#0A6A77'] },
});
const DEFAULT_COLOR = 'blue';
const ACCENTS = ['#FFC145', '#FF7A59', '#FFFFFF'];
const INK = '#2B3A55';

export const VECTOR_PROMPT = `Bạn là họa sĩ minh hoạ vector chuyên làm bộ icon cho bài thuyết trình doanh nghiệp. Nhiệm vụ: viết MÃ SVG cho MỘT hình minh hoạ.

Đầu ra: CHỈ một thẻ <svg>…</svg> (không giải thích, không markdown, không chú thích trong mã).

KỸ THUẬT
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">; không width/height. Hình nằm gọn trong khoảng 12–116, cân giữa khung, KHÔNG nền, KHÔNG khung/ô bo quanh hình.
- Chỉ dùng: g, defs, linearGradient, radialGradient, stop, rect, circle, ellipse, path, polygon, polyline, line, clipPath. TUYỆT ĐỐI không text, image, filter, style, script, mask, use, animate, font.
- Tô màu bằng fill (gradient cho khối chính); nét viền nếu có phải stroke-linecap/stroke-linejoin="round", dày 3–5. Đường path dùng lệnh M L H V C Q A Z, toạ độ tối đa 1 chữ số thập phân.
- Tối đa 60 phần tử vẽ; 2–4 gradient trong <defs>, mỗi gradient có id duy nhất.

PHONG CÁCH — "clay 2.5D phẳng-mịn", thống nhất cho cả bộ
- Khối mềm, góc bo tròn lớn, hình giản lược dễ nhận ra ngay ở cỡ 80 px (không chi tiết nhỏ li ti). Đúng MỘT vật chủ đạo (to, chiếm ~60% khung) + MỘT vật phụ nhỏ nói rõ ý nghĩa (đồng hồ, đồng xu, dấu tích, khoá…) + tối đa 3 chấm/tia nhỏ trang trí.
- Khối chính tô linearGradient chéo từ màu sáng (góc trên-trái) sang màu đậm hơn (góc dưới-phải) trong CÙNG bảng màu. Mỗi khối có 1 mảng sáng bóng (hình bầu dục/cong, fill trắng, fill-opacity 0.35–0.55) ở góc trên-trái và 1 mảng tối mỏng (màu đậm nhất, fill-opacity 0.15–0.25) ở cạnh dưới-phải để có cảm giác khối.
- Các khối đặt chồng/chạm nhau có thứ tự trước-sau rõ ràng, không đè mất nghĩa của nhau. Chi tiết nhỏ (cửa sổ, kim đồng hồ, hạt) dùng màu mực đậm hoặc trắng, nét tròn.
- Không bóng đổ xuống nền, không đường chân trời, không mặt đất.

MÀU
- Màu chủ đạo (hầu hết diện tích) lấy ĐÚNG từ bảng màu của phần (sáng → đậm). Thêm màu nhấn ấm nhỏ (≤ 15% diện tích) và trắng. Màu mực cho nét chi tiết: ${INK}.
- Không đen thuần, không xám nhạt làm khối chính.

NỘI DUNG
- Vẽ đúng vật/ẩn dụ được mô tả; không chữ, số, logo, thương hiệu, người thật. Nếu mô tả là khái niệm trừu tượng, chọn ẩn dụ là vật cụ thể.`;

export function vectorUserText(subject, color) {
  const pal = VECTOR_PALETTES[color] || VECTOR_PALETTES[DEFAULT_COLOR];
  return [
    `Vẽ: ${String(subject).trim().slice(0, 300)}`,
    `Bảng màu chủ đạo (${pal.name}), sáng → đậm: ${pal.ramp.join(', ')}.`,
    `Màu nhấn ấm: ${ACCENTS.slice(0, 2).join(', ')}; trắng: #FFFFFF; màu mực: ${INK}.`,
  ].join('\n');
}

/* ---------- làm sạch SVG do model viết (danh sách cho phép; không dựa vào bộ phân tích XML đầy đủ) ---------- */
const ELEMENTS = new Set(['svg', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop', 'rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line', 'clippath']);
const DRAW = new Set(['rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);
const CANON = { lineargradient: 'linearGradient', radialgradient: 'radialGradient', clippath: 'clipPath' };
const ATTRS = new Set([
  'id', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'fx', 'fy', 'd', 'points', 'transform',
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'opacity', 'fill-opacity', 'stroke-opacity',
  'fill-rule', 'clip-rule', 'clip-path', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'spreadmethod', 'clippathunits',
]);
const ATTR_CANON = { gradientunits: 'gradientUnits', gradienttransform: 'gradientTransform', spreadmethod: 'spreadMethod', clippathunits: 'clipPathUnits' };
const VALUE_OK = /^[\w\s.,#()%+\-:/]*$/; // không < > & " ' ; \ — url() chỉ dạng #id (kiểm riêng)
const MAX_BYTES = 30000;
const MAX_DRAW = 90;

function cleanValue(name, value) {
  const v = String(value).trim();
  if (v.length > 4000 || !VALUE_OK.test(v)) return null;
  if (/url\(/i.test(v) && !/^url\(#[\w-]+\)$/.test(v)) return null;
  if (/javascript|expression|data:|&#/i.test(v)) return null;
  if (name === 'id' && !/^[\w-]{1,40}$/.test(v)) return null;
  return v;
}

/** Trích thẻ svg đầu tiên → SVG đã làm sạch (chuỗi), hoặc null nếu hỏng / có phần tử ngoài danh sách. */
export function sanitizeSvg(text) {
  const src = String(text || '');
  const start = src.search(/<svg[\s>]/i);
  const end = src.toLowerCase().lastIndexOf('</svg>');
  if (start < 0 || end < start || end - start > MAX_BYTES) return null;
  const body = src.slice(start, end + 6).replace(/<!--[\s\S]*?-->/g, '');
  if (/<!(DOCTYPE|ENTITY)|<\?/i.test(body)) return null;
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^<>]*?)?)(\/?)>/g;
  const out = [];
  const stack = [];
  let draws = 0;
  let last = 0;
  let m;
  let viewBox = null;
  while ((m = tag.exec(body))) {
    // Chữ giữa các thẻ bị bỏ (không có <text>); phát hiện '<' lạ không khớp thẻ → từ chối.
    const gap = body.slice(last, m.index);
    if (gap.includes('<')) return null;
    last = tag.lastIndex;
    const [, closing, rawName, rawAttrs, selfClose] = m;
    const lower = rawName.toLowerCase();
    if (!ELEMENTS.has(lower)) return null;
    const name = CANON[lower] || lower;
    if (closing) {
      if (stack.pop() !== name) return null;
      out.push(`</${name}>`);
      continue;
    }
    if (DRAW.has(lower) && (draws += 1) > MAX_DRAW) return null;
    let attrs = '';
    const re = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a;
    let consumed = 0;
    while ((a = re.exec(rawAttrs))) {
      consumed += a[0].length;
      const key = a[1].toLowerCase();
      const val = a[2] ?? a[3] ?? '';
      if (lower === 'svg' && key === 'viewbox') {
        const nums = val.trim().split(/[\s,]+/).map(Number);
        if (nums.length === 4 && nums.every(Number.isFinite) && nums[2] > 0 && nums[3] > 0 && nums[2] <= 2000 && nums[3] <= 2000) viewBox = nums;
        continue;
      }
      if (lower === 'svg') continue; // xmlns, width, height… dựng lại bên dưới
      if (!ATTRS.has(key)) continue;
      const clean = cleanValue(key, val);
      if (clean === null) return null;
      attrs += ` ${ATTR_CANON[key] || key}="${clean}"`;
    }
    if (lower === 'svg') {
      if (stack.length) return null;
      const vb = viewBox || [0, 0, 128, 128];
      out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}">`);
      stack.push('svg');
      if (selfClose) return null;
      continue;
    }
    if (!stack.length) return null;
    if (selfClose) out.push(`<${name}${attrs}/>`);
    else {
      out.push(`<${name}${attrs}>`);
      stack.push(name);
    }
  }
  if (stack.length || draws < 3 || body.slice(last).trim()) return null;
  // id gradient / clipPath được dùng phải có định nghĩa (url(#x) trỏ vào hư vô → dựng ra khối trong suốt).
  const ids = new Set([...out.join('').matchAll(/\bid="([\w-]+)"/g)].map((x) => x[1]));
  for (const ref of out.join('').matchAll(/url\(#([\w-]+)\)/g)) if (!ids.has(ref[1])) return null;
  return out.join('');
}

/**
 * SVG đã làm sạch → PNG nền trong suốt, cắt sát hình + lề đều, vuông (hình luôn to và cân giữa ô như bộ hình 3D cũ).
 * null nếu hình trống / quá nhỏ (model viết ra khung rỗng).
 */
export async function renderVectorArt(svg, { size = 768, pad = 0.09 } = {}) {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1].split(/\s+/).map(Number) || [0, 0, 128, 128];
  const density = Math.min(1200, Math.max(72, Math.round((72 * 1536) / Math.max(vb[2], vb[3]))));
  const { data, info } = await sharp(Buffer.from(svg), { density }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, solid = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
        solid += 1;
      }
    }
  }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  if (Math.max(bw, bh) < Math.min(w, h) * 0.25 || solid < bw * bh * 0.08) return null;
  const side = Math.round(Math.max(bw, bh) * (1 + pad * 2));
  const left = Math.round(x0 + bw / 2 - side / 2);
  const top = Math.round(y0 + bh / 2 - side / 2);
  // sharp luôn cắt (extract) trước, nới (extend) sau, đổi cỡ ở giữa → làm 2 bước: cắt phần nằm trong ảnh + nới phần lề ngoài ảnh, rồi mới đổi cỡ.
  const cl = Math.max(0, left), ct = Math.max(0, top), cr = Math.min(w, left + side), cb = Math.min(h, top + side);
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const square = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: cl, top: ct, width: cr - cl, height: cb - ct })
    .extend({ left: cl - left, top: ct - top, right: left + side - cr, bottom: top + side - cb, background: clear })
    .raw()
    .toBuffer();
  return sharp(square, { raw: { width: side, height: side, channels: 4 } }).resize(size, size, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
}
