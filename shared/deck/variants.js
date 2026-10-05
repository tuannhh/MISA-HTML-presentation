// "Chỉ đạo nghệ thuật" chạy ngầm: mỗi bố cục có nhiều biến thể trình bày + phong cách toàn bài, hệ thống tự chọn theo
// nội dung từng trang (số ý, số liệu %, có ảnh, tỷ lệ khung…) để các bài không na ná nhau. Người dùng không phải chọn.
// Hàm thuần, dùng chung server (dựng bài) và renderer (kiểm tra biến thể còn hợp nội dung sau khi người dùng sửa).

// Phần tử đầu = mặc định (giao diện gốc trước khi có biến thể).
export const VARIANTS = Object.freeze({
  cover: Object.freeze(['split', 'mirror', 'center', 'bottom']),
  section: Object.freeze(['num', 'center', 'band', 'ghost']),
  agenda: Object.freeze(['list', 'tiles', 'split', 'path']),
  bullets: Object.freeze(['icons', 'numbered', 'split', 'panels', 'checks']),
  cards: Object.freeze(['grid', 'bento', 'rows', 'numbered']),
  stats: Object.freeze(['cards', 'hero', 'bars', 'rings', 'plain']),
  image: Object.freeze(['side', 'right', 'full']),
  gallery: Object.freeze(['grid', 'mosaic', 'polaroid']),
  timeline: Object.freeze(['line', 'vertical', 'zigzag', 'cards']),
  process: Object.freeze(['cards', 'chevrons', 'stairs', 'vertical']),
  quote: Object.freeze(['classic', 'center', 'band']),
  comparison: Object.freeze(['columns', 'split']),
  closing: Object.freeze(['center', 'split', 'minimal']),
});

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
const longest = (list, key) => Math.max(0, ...(list || []).map((x) => String(x?.[key] || '').length));

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
  },
  cards: {
    bento: (s) => n(s.items) >= 3 && n(s.items) <= 5,
    rows: (s) => n(s.items) >= 2 && n(s.items) <= 6,
    numbered: (s) => n(s.items) >= 2,
  },
  stats: {
    hero: (s) => n(s.stats) >= 1 && n(s.stats) <= 4,
    // Biểu đồ thanh: mọi giá trị là số ≥ 0 cùng đơn vị (so sánh được với nhau).
    bars: (s) => n(s.stats) >= 2 && n(s.stats) <= 8 && s.stats.every((x) => isNum(x.value) && x.value >= 0) && new Set(s.stats.map(unit)).size === 1 && Math.max(...s.stats.map((x) => x.value)) > 0,
    // Vòng tiến độ: chỉ khi là phần trăm 0–100.
    rings: (s) => n(s.stats) >= 1 && n(s.stats) <= 4 && s.stats.every((x) => isNum(x.value) && x.value > 0 && x.value <= 100 && unit(x) === '%'),
    plain: (s) => n(s.stats) >= 2 && n(s.stats) <= 4,
  },
  image: { right: (s) => n(s.items) > 0, full: (s) => !!s.image?.asset && !s.video && !contain(s) && n(s.items) <= 3 },
  gallery: { mosaic: (s) => [3, 5].includes(photos(s)) && !contain(s), polaroid: (s) => photos(s) >= 2 && photos(s) <= 4 && !contain(s) },
  timeline: {
    vertical: (s) => n(s.steps) >= 2 && n(s.steps) <= 5,
    zigzag: (s, r) => n(s.steps) >= 4 && n(s.steps) <= (r >= 1.7 ? 7 : 5),
    cards: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 5 : 4),
  },
  process: {
    // Mũi tên ngang: tên bước ngắn (nằm cạnh số trong mũi tên), khung hẹp tối đa 3 bước.
    chevrons: (s, r) => n(s.steps) >= 2 && n(s.steps) <= (r >= 1.7 ? 5 : 3) && longest(s.steps, 'title') <= (n(s.steps) <= 3 ? 26 : 16),
    stairs: (s) => n(s.steps) >= 3 && n(s.steps) <= 5,
    vertical: (s) => n(s.steps) >= 2 && n(s.steps) <= 5,
  },
  quote: { center: (s) => !hasMedia(s), band: (s) => !hasMedia(s) },
  comparison: { split: (s) => n(s.columns) === 2 },
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
  if (layout === 'timeline' && v === 'zigzag') return n(s.steps) >= 5 ? 1.6 : 1;
  if (layout === 'image' && v === 'full') return n(s.items) <= 1 ? 1.8 : 1;
  if (layout === 'gallery' && v === 'mosaic') return 1.4;
  return 1;
}

// Phong cách nào hợp biến thể nào (giữ bài nhất quán: editorial chuộng số/đường kẻ, solid chuộng khối màu…).
const AFFINITY = {
  neon: { cards: 1.3, rings: 1.3, line: 1.2, chevrons: 1.2 },
  editorial: { numbered: 1.8, plain: 1.8, split: 1.5, vertical: 1.5, minimal: 1.6, rows: 1.5, ghost: 1.5, list: 1.3, center: 1.2 },
  solid: { tiles: 1.6, panels: 1.6, bento: 1.8, band: 1.6, hero: 1.5, chevrons: 1.4, stairs: 1.4, split: 1.2 },
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
export function artDirect(spec, { seed = 1, ratio = 16 / 9, style } = {}) {
  const rnd = rng(seed);
  spec.style = STYLES.includes(style) ? style : pick(STYLES, STYLES.map(() => 1), rnd);
  const aff = AFFINITY[spec.style] || {};
  const used = {}; // bố cục → số lần đã dùng mỗi biến thể
  let prev = '';
  for (const s of spec.slides || []) {
    const vs = VARIANTS[s.layout];
    if (!vs) {
      s.variant = '';
      continue;
    }
    const options = vs.filter((v) => fits(s.layout, v, s, ratio));
    const seen = used[s.layout] || (used[s.layout] = {});
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
