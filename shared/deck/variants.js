// "Chỉ đạo nghệ thuật" chạy ngầm: mỗi bố cục có nhiều biến thể trình bày + phong cách toàn bài, hệ thống tự chọn theo
// nội dung từng trang (số ý, số liệu %, có ảnh, tỷ lệ khung…) để các bài không na ná nhau. Người dùng không bắt buộc chọn —
// có thể chọn tay ở form nội dung trang (chỉ các biến thể còn hợp nội dung).
// Hàm thuần, dùng chung server (dựng bài) và renderer (kiểm tra biến thể còn hợp nội dung sau khi người dùng sửa).

import { plainText } from './rich.js';
import { CHART_LIMITS } from './chart.js';
import { SPEC_LIMITS } from './limits.js';

// Phần tử đầu = mặc định (giao diện gốc trước khi có biến thể).
export const VARIANTS = Object.freeze({
  cover: Object.freeze(['split', 'mirror', 'center', 'bottom']),
  section: Object.freeze(['num', 'center', 'band', 'ghost']),
  agenda: Object.freeze(['list', 'tiles', 'split', 'path']),
  bullets: Object.freeze(['icons', 'numbered', 'split', 'panels', 'checks', 'big']),
  cards: Object.freeze(['grid', 'bento', 'rows', 'numbered', 'solid', 'outline', 'labeled', 'alternate', 'arrows', 'matrix', 'venn']),
  stats: Object.freeze(['cards', 'hero', 'bars', 'rings', 'plain', 'progress', 'stars']),
  image: Object.freeze(['side', 'right', 'full']),
  gallery: Object.freeze(['grid', 'mosaic', 'polaroid']),
  timeline: Object.freeze(['line', 'vertical', 'zigzag', 'cards', 'minimal', 'pills', 'arrows']),
  process: Object.freeze(['cards', 'chevrons', 'stairs', 'vertical', 'pyramid', 'funnel', 'cycle', 'concentric', 'bullseye']),
  org: Object.freeze(['tree', 'boxes']),
  quote: Object.freeze(['classic', 'center', 'band', 'bubble']),
  comparison: Object.freeze(['columns', 'split', 'versus']),
  // Biểu đồ (dữ liệu bảng slide.chart — shared/deck/chart.js): kiểu = loại biểu đồ. Chỉ tạo từ trình soạn thảo.
  chart: Object.freeze(['column', 'bar', 'stacked', 'line', 'area', 'pie', 'donut', 'waterfall']),
  closing: Object.freeze(['center', 'split', 'minimal']),
});

// Kiểu chỉ người dùng chọn trong trình soạn thảo — "chỉ đạo nghệ thuật" khi dựng bài bằng AI không tự chọn (chỉ dùng các kiểu an toàn với
// mọi nội dung: các bước, dòng thời gian, số lớn, so sánh…). Khoá 'bố cục:kiểu'.
export const MANUAL_VARIANTS = Object.freeze(new Set([
  'bullets:big', 'cards:solid', 'cards:outline', 'cards:labeled', 'cards:alternate', 'cards:arrows', 'stats:progress', 'stats:stars',
  'timeline:minimal', 'timeline:pills', 'timeline:arrows', 'process:pyramid', 'process:funnel', 'quote:bubble',
  // Sơ đồ (Đợt 5b): chỉ người dùng chọn — trừ ma trận 2×2 (4 mục) và đối đầu A vs B (2 cột), AI được dùng.
  'cards:venn', 'process:cycle', 'process:concentric', 'process:bullseye',
  'chart:bar', 'chart:stacked', 'chart:line', 'chart:area', 'chart:pie', 'chart:donut', 'chart:waterfall',
]));

// Họ bố cục "danh sách": cùng một danh sách mục (items/steps: biểu tượng, tiêu đề, mô tả, nhãn) → đổi qua lại giữa các bố cục/kiểu này
// không mất nội dung (trình soạn thảo chép items ↔ steps khi bố cục đích còn trống).
export const LIST_LAYOUTS = Object.freeze(['bullets', 'cards', 'agenda', 'process', 'timeline']);
export const LIST_KEY = Object.freeze({ bullets: 'items', cards: 'items', agenda: 'items', process: 'steps', timeline: 'steps' });
// Họ bố cục đổi qua lại giữ nội dung (bảng chọn kiểu hiện kiểu của các bố cục cùng họ): danh sách · số liệu (Con số ↔ Biểu đồ).
/**
 * Đổi sang bố cục L có làm mất mục không (CT-006)? Các mục đang có (items ↔ steps) vượt giới hạn danh sách của bố cục đích → chặn,
 * KHÔNG cắt. Chỉ tính khi sẽ thật sự chuyển (danh sách đích đang trống — cùng điều kiện với useEditor.changeLayout).
 * @returns {{ from: string, to: string, count: number, max: number } | null}
 */
export function listBlock(s, L) {
  const from = LIST_KEY[s?.layout];
  const to = LIST_KEY[L];
  if (!from || !to || from === to || (s[to] || []).length) return null;
  const count = (s[from] || []).length;
  const max = SPEC_LIMITS[to];
  return count > max ? { from, to, count, max } : null;
}

export const LAYOUT_FAMILIES = Object.freeze([LIST_LAYOUTS, Object.freeze(['stats', 'chart'])]);
export const familyOf = (layout) => LAYOUT_FAMILIES.find((f) => f.includes(layout)) || null;

// Số cột người dùng chọn (slide.cols 2–6, không có = tự động) — chỉ các kiểu dạng lưới.
export const COLS_RANGE = Object.freeze({ min: 2, max: 6 });
export const COLS_VARIANTS = Object.freeze({
  agenda: Object.freeze(['list', 'tiles']),
  bullets: Object.freeze(['icons', 'numbered', 'checks', 'panels']),
  cards: Object.freeze(['grid', 'numbered', 'solid', 'outline', 'labeled']),
  stats: Object.freeze(['cards', 'plain']),
});
/** Số cột người dùng chọn còn dùng được cho kiểu v với n mục (không vượt số mục) — null = tự động. */
export function userCols(s, v, n) {
  const c = s?.cols;
  if (!Number.isInteger(c) || c < COLS_RANGE.min || c > COLS_RANGE.max || !COLS_VARIANTS[s.layout]?.includes(v)) return null;
  return Math.min(c, Math.max(1, n));
}

// Phong cách toàn bài (hình khối, viền, bóng, cách đánh số) — kết hợp với tông màu/nền/phông người dùng chọn.
// 'neon' = giao diện gốc (bài cũ không có trường style hiển thị như trước).
export const STYLES = Object.freeze(['neon', 'editorial', 'solid', 'outline', 'soft']);

const n = (a) => (Array.isArray(a) ? a.length : 0);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const hasMedia = (s) => !!(s.video || s.image?.asset);
const photos = (s) => (Array.isArray(s.images) ? s.images.filter((im) => im && im.asset).length : 0);
// Ảnh đồ hoạ (infographic, sơ đồ…) hiển thị trọn khung (fit contain) → không dùng kiểu cắt ảnh tràn trang / xoay / ghép mảng.
const contain = (s) => s.image?.fit === 'contain' || (Array.isArray(s.images) && s.images.some((im) => im?.fit === 'contain'));
const unit = (st) => String(st.suffix || '').trim().toLowerCase();
const longestPoints = (s) => Math.max(0, ...(s.columns || []).flatMap((c) => (c?.points || []).map((p) => plainText(p).length)));
const longest = (list, key) => Math.max(0, ...(list || []).map((x) => plainText(x?.[key] || '').length));
const allNum = (s, lo, hi) => s.stats.every((x) => isNum(x.value) && x.value > lo && x.value <= hi);
// Biểu đồ: số hạng mục, số chuỗi, mọi ô số của các chuỗi.
const cats = (s) => n(s.chart?.categories);
const ser = (s) => n(s.chart?.series);
const cells = (s) => (s.chart?.series || []).flatMap((x) => x.values || []);
const roundOk = (s) => ser(s) === 1 && cats(s) >= 2 && cats(s) <= CHART_LIMITS.pie && cells(s).every((v) => v === null || v >= 0) && cells(s).some((v) => v > 0);

// Điều kiện để biến thể hiển thị đẹp với nội dung hiện có (r = rộng/cao của khung). Biến thể mặc định luôn hợp.
const FITS = {
  cover: { mirror: () => true, center: (s) => !s.video && !contain(s), bottom: () => true },
  section: { center: (s) => !hasMedia(s), band: (s) => !hasMedia(s), ghost: (s) => !hasMedia(s) },
  agenda: {
    tiles: (s) => n(s.items) >= 2 && n(s.items) <= 8,
    split: (s) => n(s.items) >= 2 && n(s.items) <= 6,
    path: (s, r) => n(s.items) >= 3 && n(s.items) <= (r >= 1.7 ? 5 : 4),
  },
  bullets: {
    numbered: (s) => n(s.items) >= 2,
    split: (s) => !hasMedia(s) && n(s.items) >= 2 && n(s.items) <= 5,
    panels: (s) => !hasMedia(s) && n(s.items) >= 2 && n(s.items) <= 6,
    checks: (s) => n(s.items) >= 2,
    // Gạch đầu dòng lớn: ít ý, chữ to — không kèm ảnh.
    big: (s) => !hasMedia(s) && n(s.items) >= 2 && n(s.items) <= 4,
  },
  cards: {
    bento: (s) => n(s.items) >= 3 && n(s.items) <= 5,
    rows: (s) => n(s.items) >= 2 && n(s.items) <= 6,
    numbered: (s) => n(s.items) >= 2,
    solid: (s) => n(s.items) >= 2,
    outline: (s) => n(s.items) >= 2,
    // Có nhãn: mọi thẻ đều có nhãn (trường "Nhãn / số liệu") — nhãn là điểm nhấn đầu thẻ.
    labeled: (s) => n(s.items) >= 2 && s.items.every((it) => plainText(it?.value || '').trim()),
    // Xen kẽ: mỗi mục một hàng, biểu tượng đổi bên trái/phải.
    alternate: (s) => n(s.items) >= 2 && n(s.items) <= 4,
    // Hộp nối mũi tên: các hộp xếp ngang, mũi tên giữa các hộp.
    arrows: (s, r) => n(s.items) >= 2 && n(s.items) <= (r >= 1.7 ? 5 : 3),
    // Ma trận 2×2: đúng 4 mục (4 góc phần tư). Venn: 2–3 vòng giao nhau.
    matrix: (s) => n(s.items) === 4,
    venn: (s) => n(s.items) >= 2 && n(s.items) <= 3,
  },
  stats: {
    hero: (s) => n(s.stats) >= 1 && n(s.stats) <= 4,
    // Biểu đồ thanh: mọi giá trị là số ≥ 0 cùng đơn vị (so sánh được với nhau).
    bars: (s) => n(s.stats) >= 2 && n(s.stats) <= 8 && s.stats.every((x) => isNum(x.value) && x.value >= 0) && new Set(s.stats.map(unit)).size === 1 && Math.max(...s.stats.map((x) => x.value)) > 0,
    // Vòng tiến độ: chỉ khi là phần trăm 0–100.
    rings: (s) => n(s.stats) >= 1 && n(s.stats) <= 4 && s.stats.every((x) => isNum(x.value) && x.value > 0 && x.value <= 100 && unit(x) === '%'),
    plain: (s) => n(s.stats) >= 2 && n(s.stats) <= 4,
    // Thanh tiến độ: phần trăm 0–100 (mỗi thanh so với 100%, khác biểu đồ thanh so với số lớn nhất).
    progress: (s) => n(s.stats) >= 1 && n(s.stats) <= 6 && allNum(s, -1e-9, 100) && s.stats.every((x) => unit(x) === '%'),
    // Xếp hạng sao: điểm 0–5 (hậu tố trống, "/5", "sao", "điểm").
    stars: (s) => n(s.stats) >= 1 && n(s.stats) <= 4 && allNum(s, 0, 5) && s.stats.every((x) => ['', '/5', '/ 5', 'sao', '/5 sao', 'điểm', '/5 điểm'].includes(unit(x))),
  },
  image: { right: (s) => n(s.items) > 0, full: (s) => !!s.image?.asset && !s.video && !contain(s) && n(s.items) <= 3 },
  gallery: { mosaic: (s) => [3, 5].includes(photos(s)) && !contain(s), polaroid: (s) => photos(s) >= 2 && photos(s) <= 4 && !contain(s) },
  timeline: {
    vertical: (s) => n(s.steps) >= 2 && n(s.steps) <= 5,
    zigzag: (s, r) => n(s.steps) >= 4 && n(s.steps) <= (r >= 1.7 ? 7 : 5),
    cards: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 5 : 4),
    minimal: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 6 : 4),
    pills: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 6 : 4),
    arrows: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 5 : 4),
  },
  process: {
    // Mũi tên ngang: tên bước ngắn (nằm cạnh số trong mũi tên), khung hẹp tối đa 3 bước.
    chevrons: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 5 : 3) && longest(s.steps, 'title') <= (n(s.steps) <= 3 ? 26 : 16),
    stairs: (s) => n(s.steps) >= 3 && n(s.steps) <= 5,
    vertical: (s) => n(s.steps) >= 2 && n(s.steps) <= 5,
    // Kim tự tháp / phễu: các tầng xếp dọc (tầng hình thang bên trái, chữ bên phải).
    pyramid: (s) => n(s.steps) >= 3 && n(s.steps) <= 6,
    funnel: (s) => n(s.steps) >= 3 && n(s.steps) <= 6,
    // Sơ đồ + chú giải bên phải: chu trình (vòng lặp), vòng đồng tâm (lõi → ngoài), bia (đích ở tâm).
    cycle: (s) => n(s.steps) >= 3 && n(s.steps) <= 6,
    concentric: (s) => n(s.steps) >= 2 && n(s.steps) <= 5,
    bullseye: (s) => n(s.steps) >= 3 && n(s.steps) <= 5,
  },
  // Ô viền cho mục con: chỉ khi mục con ngắn (ô 1 dòng).
  // Ô khối hẹp dần theo số nhánh → giới hạn độ dài chữ con tương ứng (quá dài thì lùi về cây nhánh).
  org: { boxes: (s) => longestPoints(s) <= ((s.columns || []).length <= 3 ? 48 : (s.columns || []).length <= 4 ? 34 : 22) },
  quote: { center: (s) => !hasMedia(s), band: (s) => !hasMedia(s), bubble: (s) => !hasMedia(s) },
  comparison: { split: (s) => n(s.columns) === 2, versus: (s) => n(s.columns) === 2 },
  chart: {
    bar: (s) => cats(s) >= 1,
    // Cột chồng: ≥ 2 chuỗi, không số âm (phần cộng dồn).
    stacked: (s) => ser(s) >= 2 && cells(s).every((v) => v === null || v >= 0),
    line: (s) => cats(s) >= 2,
    area: (s) => cats(s) >= 2,
    // Tròn / vành khuyên: 1 chuỗi, 2–8 lát, không số âm.
    pie: roundOk,
    donut: roundOk,
    // Thác nước: 1 chuỗi các mức tăng/giảm (cột "Tổng" tự thêm).
    waterfall: (s) => ser(s) === 1 && cats(s) >= 2 && cats(s) <= CHART_LIMITS.waterfall,
  },
  closing: { split: (s) => n(s.tags) > 0 || !!s.caption, minimal: () => true },
};

export function fits(layout, variant, s, ratio = 16 / 9) {
  const vs = VARIANTS[layout];
  if (!vs || !vs.includes(variant)) return false;
  if (variant === vs[0]) return true;
  const f = FITS[layout]?.[variant];
  return !!f && f(s, ratio);
}

/** Biến thể hiển thị thực tế: biến thể đã chọn nếu còn hợp nội dung (người dùng có thể đã sửa), nếu không → mặc định. */
export function resolveVariant(s, ratio = 16 / 9) {
  const vs = VARIANTS[s?.layout];
  if (!vs) return '';
  return s.variant && fits(s.layout, s.variant, s, ratio) ? s.variant : vs[0];
}

// Ưu tiên nội dung: biến thể "nói" đúng bản chất dữ liệu được chọn nhiều hơn (vd. % → vòng tiến độ, 1 con số → hero).
function contentWeight(layout, v, s) {
  if (layout === 'stats') {
    if (v === 'rings') return 3;
    if (v === 'bars') return n(s.stats) >= 3 ? 2.5 : 1.2;
    if (v === 'hero') return n(s.stats) === 1 ? 6 : n(s.stats) === 3 ? 1.4 : 1;
  }
  if (layout === 'cards' && v === 'bento') return n(s.items) === 3 || n(s.items) === 5 ? 1.6 : 1;
  // Ma trận 2×2 ngụ ý 2 trục phân loại — 4 mục bất kỳ chưa chắc là góc phần tư → ít được chọn hơn.
  if (layout === 'cards' && v === 'matrix') return 0.6;
  if (layout === 'timeline' && v === 'zigzag') return n(s.steps) >= 5 ? 1.6 : 1;
  if (layout === 'image' && v === 'full') return n(s.items) <= 1 ? 1.8 : 1;
  if (layout === 'gallery' && v === 'mosaic') return 1.4;
  return 1;
}

// Phong cách nào hợp biến thể nào (giữ bài nhất quán: editorial chuộng số/đường kẻ, solid chuộng khối màu…).
const AFFINITY = {
  neon: { cards: 1.3, rings: 1.3, line: 1.2, chevrons: 1.2 },
  editorial: { numbered: 1.8, plain: 1.8, split: 1.5, vertical: 1.5, minimal: 1.6, rows: 1.5, ghost: 1.5, list: 1.3, center: 1.2 },
  solid: { boxes: 1.4, tiles: 1.6, panels: 1.6, bento: 1.8, band: 1.6, hero: 1.5, chevrons: 1.4, stairs: 1.4, split: 1.2 },
  outline: { rows: 1.5, checks: 1.5, zigzag: 1.4, path: 1.5, bars: 1.3, numbered: 1.3, cards: 1.2 },
  soft: { tiles: 1.4, rings: 1.4, polaroid: 1.8, bento: 1.4, center: 1.4, panels: 1.3, mirror: 1.2 },
};

// Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32) — cùng hạt giống → cùng kết quả (kiểm thử được).
function rng(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (Math.imul(a ^ ch.charCodeAt(0), 2654435761) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(list, weights, rnd) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rnd() * total;
  for (let i = 0; i < list.length; i += 1) {
    x -= weights[i];
    if (x <= 0) return list[i];
  }
  return list[list.length - 1];
}

/**
 * Chọn phong cách toàn bài + biến thể từng trang (ghi vào spec.style, slide.variant).
 * - Chỉ chọn biến thể hợp nội dung (fits) · ưu tiên biến thể hợp dữ liệu và hợp phong cách.
 * - Hai trang cùng bố cục trong bài cố tránh trùng kiểu; trang liền kề không trùng cả bố cục lẫn kiểu.
 * @param {object} spec spec đã chuẩn hoá (normalizeSpec)
 * @param {{ seed?: string|number, ratio?: number, style?: string }} o seed khác nhau → bài khác nhau
 */
// honor = true (chỉ đạo thiết kế bằng AI): giữ phong cách + biến thể AI đã chọn theo nội dung nếu hợp lệ và còn vừa nội dung;
// trang AI không chọn/chọn sai mới bốc ngẫu nhiên như cũ.
export function artDirect(spec, { seed = 1, ratio = 16 / 9, style, honor = false } = {}) {
  const rnd = rng(seed);
  spec.style = STYLES.includes(style) ? style : honor && STYLES.includes(spec.style) ? spec.style : pick(STYLES, STYLES.map(() => 1), rnd);
  const aff = AFFINITY[spec.style] || {};
  const used = {}; // bố cục → số lần đã dùng mỗi biến thể
  let prev = '';
  for (const s of spec.slides || []) {
    const vs = VARIANTS[s.layout];
    if (!vs) {
      s.variant = '';
      continue;
    }
    const seen = used[s.layout] || (used[s.layout] = {});
    if (honor && s.layout !== 'chart' && vs.includes(s.variant) && fits(s.layout, s.variant, s, ratio)) {
      seen[s.variant] = (seen[s.variant] || 0) + 1;
      prev = `${s.layout}:${s.variant}`;
      if (s.variant === vs[0]) s.variant = '';
      continue;
    }
    const options = vs.filter((v) => !MANUAL_VARIANTS.has(`${s.layout}:${v}`) && fits(s.layout, v, s, ratio));
    const weights = options.map((v) => {
      let w = contentWeight(s.layout, v, s) * (aff[v] || 1);
      w *= 0.2 ** (seen[v] || 0); // đã dùng ở trang cùng bố cục → giảm mạnh cơ hội lặp lại
      if (`${s.layout}:${v}` === prev) w *= 0.05;
      return w;
    });
    const v = pick(options, weights, rnd);
    s.variant = v === vs[0] ? '' : v;
    seen[v] = (seen[v] || 0) + 1;
    prev = `${s.layout}:${v}`;
  }
  return spec;
}
