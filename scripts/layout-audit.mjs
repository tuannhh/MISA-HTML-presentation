// Công cụ dev: rà lỗi bố cục tự động trên trình duyệt thật — mọi bố cục × biến thể × độ dài nội dung × tỷ lệ khung.
// Lỗi bắt được: chữ tràn xuống chân trang, chữ bị cắt (vùng overflow ẩn), nhãn/chip bị xuống dòng hoặc tràn, chữ có dấu "…"
// bị cắt, icon đè chữ, chữ tràn khỏi hình khối (thẻ/ô), trang co chữ tới mức nhỏ nhất vẫn tràn.
// Dùng: node scripts/layout-audit.mjs [--ratio 16:9,4:3] [--level vua,dai,day] [--only bullets] [--shots]
// Kết quả: tmp/layout-audit/report.json (+ ảnh các trang lỗi khi có --shots). Thoát mã 1 nếu còn lỗi (dùng làm cổng kiểm tra).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { renderDeck, deckSize } from '../src/services/renderService.js';
import { normalizeSpec } from '../src/services/specService.js';
import { VARIANTS } from '../shared/deck/variants.js';
import { ACCENT_LAYOUTS, CALLOUT_LAYOUTS } from '../shared/deck/blocks.js';

const AUDIT_IMG = '00000000-0000-4000-8000-000000000001';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const RATIOS = arg('ratio', '16:9,4:3,2:1').split(',');
const LEVELS = arg('level', 'vua,dai,day').split(',');
const ONLY = arg('only', '');
const SHOTS = process.argv.includes('--shots');
const OUT = 'tmp/layout-audit';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const base = JSON.parse(readFileSync('test/fixtures/sample-spec.json', 'utf8'));
// Trang mẫu thêm cho các kiểu cần dữ liệu riêng (Đợt 5): thẻ có nhãn, số liệu phần trăm (thanh tiến độ), điểm 0–5 (xếp hạng sao).
{
  const pick = (l) => JSON.parse(JSON.stringify(base.slides.find((s) => s.layout === l)));
  const cards = pick('cards');
  cards.id = 'audit-cards-label';
  cards.items = cards.items.slice(0, 4).map((it, i) => ({ ...it, value: ['Bước khởi đầu', 'Tăng tốc', 'Mở rộng', 'Dẫn đầu'][i] }));
  const pct = pick('stats');
  pct.id = 'audit-stats-pct';
  pct.stats = [62, 85, 40, 73].map((v, i) => ({ value: v, suffix: '%', label: ['Giảm thời gian lập báo cáo', 'Chứng từ duyệt trên di động', 'Giảm sai sót nhập liệu', 'Nhân viên dùng hằng ngày'][i] }));
  const star = pick('stats');
  star.id = 'audit-stats-star';
  star.stats = [4.8, 4.5, 4.2].map((v, i) => ({ value: v, suffix: '/5', label: ['Hài lòng của khách hàng', 'Dễ sử dụng', 'Tốc độ hỗ trợ'][i] }));
  // Đợt 5b: thẻ 3 mục (Venn), biểu đồ 1 chuỗi (cột/thanh/đường/tròn/thác nước) và 3 chuỗi (cột chồng, vùng).
  const cards3 = pick('cards');
  cards3.id = 'audit-cards-3';
  cards3.items = cards3.items.slice(0, 3);
  const ch1 = { id: 'audit-chart-1', layout: 'chart', kicker: 'Kết quả', title: 'Doanh thu theo phân hệ năm 2026', caption: 'Nguồn: Báo cáo tài chính nội bộ 2026',
    chart: { categories: ['Tài chính – Kế toán', 'Bán hàng', 'Kho vận', 'Nhân sự', 'Mua hàng', 'Hoá đơn điện tử'], series: [{ name: 'Doanh thu', values: [1250, 980.5, 640, 1500, 300, 720] }], unit: 'tỷ đồng' } };
  const ch3 = { id: 'audit-chart-3', layout: 'chart', title: 'Doanh thu theo miền', chart: { categories: ['Quý 1', 'Quý 2', 'Quý 3', 'Quý 4'], series: [{ name: 'Miền Bắc', values: [50, 60, 70, 80] }, { name: 'Miền Trung', values: [20, 25, 30, 40] }, { name: 'Miền Nam', values: [50, 65, 70, 90] }], unit: '%' } };
  base.slides.push(cards, pct, star, cards3, ch1, ch3);
}

// Câu tiếng Việt thật (dấu + từ dài) để kéo dài nội dung — gần với chữ AI/người dùng nhập.
const FILL = ' giúp doanh nghiệp chuẩn hoá quy trình, đồng bộ dữ liệu giữa các phòng ban và ra quyết định nhanh hơn dựa trên số liệu tức thời';
const longer = (s, n) => (typeof s === 'string' && s ? (s + FILL).slice(0, Math.max(s.length, n)).trim() : s);
// Nhãn mốc thời gian thật hay gặp (dài nhất ~16 ký tự).
const VALUES = ['Quý I/2026', 'Tháng 4–6/2026', 'Tháng 7–9/2026', 'Quý IV/2026', 'Tháng 1–3/2027', 'Năm 2027', 'Giai đoạn 2028', 'Sau 2030'];
const TAGS = ['Chuyển đổi số toàn diện', 'Tự động hoá quy trình', 'Dữ liệu tập trung', 'Bảo mật nhiều lớp', 'Điều hành trên di động', 'AI hỗ trợ ra quyết định'];

// Mức nội dung: vua = mẫu gốc; dai = chữ dài hơn ~2 lần; day = nhiều ý + chữ dài (mức AI có thể sinh khi tài liệu dày).
function stress(slide, level) {
  const s = JSON.parse(JSON.stringify(slide));
  // Bỏ chỉnh tay có sẵn trong mẫu (dời ô chữ/ẩn hoạ tiết) — chỉ đo bố cục tự động.
  delete s.moves;
  delete s.hide;
  if (level === 'vua') return s;
  const L = level === 'day' ? 1 : 0.6;
  s.title = longer(s.title, Math.round(90 * L));
  if (s.kicker) s.kicker = longer(s.kicker, 34);
  if (s.subtitle) s.subtitle = longer(s.subtitle, Math.round(220 * L));
  if (s.caption) s.caption = longer(s.caption, 90);
  if (Array.isArray(s.tags) && s.tags.length) s.tags = TAGS.slice(0, level === 'day' ? 6 : 4);
  const grow = (arr, n, mk) => { while (arr.length < n) arr.push(mk(arr.length)); return arr; };
  if (Array.isArray(s.items) && s.items.length) {
    const n = level === 'day' ? Math.max(s.items.length, s.layout === 'image' ? 4 : 8) : s.items.length;
    s.items = grow(s.items, n, (i) => ({ ...s.items[i % s.items.length] }))
      .map((it) => ({ ...it, title: longer(it.title, Math.round(60 * L)), text: longer(it.text, Math.round(200 * L)), ...(it.value ? { value: longer(it.value, 18) } : {}) }));
  }
  if (Array.isArray(s.stats) && s.stats.length) {
    s.stats = grow(s.stats, level === 'day' ? 6 : s.stats.length, (i) => ({ ...s.stats[i % s.stats.length] })).map((st) => ({ ...st, label: longer(st.label, Math.round(120 * L)) }));
    if (level === 'day') s.stats[0] = { ...s.stats[0], value: '270.000+', suffix: ' khách hàng' };
  }
  if (Array.isArray(s.steps) && s.steps.length) {
    s.steps = grow(s.steps, level === 'day' ? 8 : s.steps.length, (i) => ({ ...s.steps[i % s.steps.length] }))
      .map((st, i) => ({ ...st, title: longer(st.title, Math.round(50 * L)), text: longer(st.text, Math.round(170 * L)), ...(st.value ? { value: VALUES[i % VALUES.length] } : {}) }));
  }
  if (Array.isArray(s.columns) && s.columns.length) {
    s.columns = s.columns.map((c) => ({
      ...c,
      title: longer(c.title, 50),
      ...(c.subtitle ? { subtitle: longer(c.subtitle, 40) } : {}),
      points: grow([...(c.points || [])], level === 'day' ? 6 : (c.points || []).length, (i) => c.points[i % c.points.length]).map((p) => longer(p, Math.round(150 * L))),
    }));
  }
  if (s.root) s.root = longer(s.root, 70);
  if (s.chart) {
    const n = level === 'day' ? 12 : s.chart.categories.length;
    const cats = Array.from({ length: n }, (_, i) => longer(s.chart.categories[i % s.chart.categories.length], Math.round(32 * L)));
    s.chart = { ...s.chart, categories: cats, series: s.chart.series.map((se) => ({ name: longer(se.name, 30), values: cats.map((_, i) => se.values[i % se.values.length] * (1 + i / 10)) })) };
  }
  if (s.quote) s.quote = { ...s.quote, text: longer(s.quote.text, Math.round(420 * L)), author: longer(s.quote.author, 40), role: longer(s.quote.role, 50) };
  return s;
}

// Kiểm tra trong trang (chạy ở khung cuối, mọi ý đã hiện). Trả danh sách lỗi { kind, text, box }.
function inspect() {
  const slide = document.querySelector('.slide.on');
  const out = [];
  if (!slide) return out;
  const R = (e) => e.getBoundingClientRect();
  const tol = 2;
  const label = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const visible = (e) => { const r = R(e); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  // Khối chữ = phần tử có chữ trực tiếp, bỏ phần tử inline (lấy khối cha).
  const blocks = [];
  const seen = new Set();
  for (const e of slide.querySelectorAll('*')) {
    if (e.closest('.ft, .sbg, .cv-ghost, .fe, #rtb, .vbadge')) continue;
    let has = false;
    for (let c = e.firstChild; c && !has; c = c.nextSibling) has = c.nodeType === 3 && /\S/.test(c.nodeValue);
    if (!has) continue;
    let b = e;
    while (b !== slide && /^(inline|contents)$/.test(getComputedStyle(b).display)) b = b.parentElement;
    if (b === slide || seen.has(b) || !visible(b)) continue;
    seen.add(b);
    blocks.push(b);
  }
  const ft = slide.querySelector('.ft');
  const ftTop = ft && visible(ft) ? R(ft).top : null;
  const k = parseFloat(getComputedStyle(slide).getPropertyValue('--k')) || 1;
  for (const b of blocks) {
    const r = R(b);
    // 1) tràn xuống chân trang
    if (ftTop !== null && r.bottom > ftTop + tol && !b.closest('.cv, .bleed, .im-full')) out.push({ kind: 'footer', text: label(b), box: [r.left, r.top, r.width, r.height] });
    // 2) bị cắt bởi vùng overflow ẩn (4 phía)
    for (let p = b.parentElement; p && p !== slide.parentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = R(p);
      if (r.top < c.top - tol || r.bottom > c.bottom + tol || r.left < c.left - tol || r.right > c.right + tol) { out.push({ kind: 'clip', text: label(b), box: [r.left, r.top, r.width, r.height] }); break; }
    }
    // 3) chữ "…" bị cắt (trừ chân trang — chủ ý)
    const cs = getComputedStyle(b);
    if (cs.textOverflow === 'ellipsis' && b.scrollWidth > b.clientWidth + 1) out.push({ kind: 'ellipsis', text: label(b), box: [r.left, r.top, r.width, r.height] });
    // 4) tràn khỏi khung slide
    const sr = R(slide);
    if (r.right > sr.right + tol || r.left < sr.left - tol || r.bottom > sr.bottom + tol || r.top < sr.top - tol) out.push({ kind: 'offslide', text: label(b), box: [r.left, r.top, r.width, r.height] });
  }
  // 5) nhãn ngắn (chip, tag, kicker, nhãn số, nhãn bước) không được xuống dòng / tràn khung
  for (const e of slide.querySelectorAll('.chip, .cl-tag, .tag, .kicker, .ps-n, .chev-n, .ag-n, .tl-d, .tlc-v, .tlv-v, .vbadge, .label')) {
    if (!visible(e) || e.closest('.ft')) continue;
    const r = R(e);
    // Đếm số dòng thật của chữ (hộp từng đoạn chữ qua Range) — chiều cao khối bị nhãn số/viền làm sai.
    // Chỉ xét nút chữ trực tiếp của nhãn (bỏ ô số trong kicker…). Nhãn dài > 24 ký tự được phép xuống dòng (vẫn phải đọc rõ).
    const tops = [];
    let own = '';
    for (const c of e.childNodes) {
      if (c.nodeType !== 3 || !/\S/.test(c.nodeValue)) continue;
      own += c.nodeValue;
      const rg = document.createRange();
      rg.selectNodeContents(c);
      for (const q of rg.getClientRects()) if (q.width > 1 && !tops.some((t) => Math.abs(t - q.bottom) < q.height * 0.5)) tops.push(q.bottom);
    }
    if (tops.length > 1 && own.trim().length <= 24) out.push({ kind: 'wrap', text: label(e), box: [r.left, r.top, r.width, r.height] });
    if (e.scrollWidth > e.clientWidth + 2) out.push({ kind: 'label-overflow', text: label(e), box: [r.left, r.top, r.width, r.height] });
  }
  // 6) icon đè chữ (bỏ nét vẽ biểu đồ/vòng chu trình — nhãn số liệu được đặt chủ ý trên vùng vẽ)
  const icons = [...slide.querySelectorAll('svg, .ib, .ic, .cv-ico')].filter((e) => visible(e) && !e.closest('.sbg, .cv-ghost, .ft, .vplay, .org-wire, .st-ring, .ring, .chart, .cy-ring'));
  for (const ic of icons) {
    const a = R(ic);
    if (a.width < 6 || a.height < 6) continue;
    for (const b of blocks) {
      if (ic.contains(b) || b.contains(ic)) continue;
      const r = R(b);
      const w = Math.min(a.right, r.right) - Math.max(a.left, r.left);
      const h = Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top);
      // Hộp chữ rộng hơn chữ thật → chỉ tính khi giao nhau đáng kể theo cả 2 chiều.
      if (w > 6 && h > 6 && w * h > 0.08 * Math.min(a.width * a.height, r.width * r.height)) { out.push({ kind: 'icon-overlap', text: label(b), box: [a.left, a.top, a.width, a.height] }); break; }
    }
  }
  // 7) chữ tràn khỏi hình khối chứa nó (thẻ, ô số liệu, bước…)
  const SHAPES = '.card, .tile, .stat, .st-hero, .st-row, .st-bar, .ps, .stair, .chev-i, .tl-step, .tz-i, .tlv-i, .col, .panel, .crow, .org-br, .org-root, .bi, .ag-i, .path-i, .ct-row, .im-glass, .qt';
  for (const b of blocks) {
    const sh = b.closest(SHAPES);
    if (!sh || sh === b) continue;
    const r = R(b), c = R(sh);
    if (r.right > c.right + tol || r.left < c.left - tol || r.bottom > c.bottom + tol || r.top < c.top - tol) out.push({ kind: 'shape', text: label(b), box: [r.left, r.top, r.width, r.height] });
  }
  if (k <= 0.5 && out.length) out.push({ kind: 'min-scale', text: 'co chữ tới mức nhỏ nhất (0,5) vẫn lỗi', box: [0, 0, 0, 0] });
  // Gộp trùng (cùng loại + cùng chữ)
  const key = new Set();
  return out.filter((x) => { const kk = x.kind + '|' + x.text; if (key.has(kk)) return false; key.add(kk); return true; }).map((x) => ({ ...x, k }));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] });
const report = [];
try {
  mkdirSync(OUT, { recursive: true });
  for (const ratio of RATIOS) {
    for (const level of LEVELS) {
      const slides = [];
      const meta = [];
      for (const sl of base.slides) {
        if (ONLY && !ONLY.split(',').includes(sl.layout)) continue;
        for (const v of VARIANTS[sl.layout] || [null]) {
          slides.push({ ...stress(sl, level), id: `${sl.id}-${v}`, ...(v ? { variant: v } : {}) });
          meta.push({ layout: sl.layout, variant: v });
        }
        // Ảnh nhấn trái/trên (vùng nội dung hẹp lại) + hộp chú thích cuối trang — đo trên kiểu mặc định của bố cục.
        if (ACCENT_LAYOUTS.includes(sl.layout) && !sl.video) {
          for (const pos of ['left', 'top']) {
            slides.push({ ...stress(sl, level), id: `${sl.id}-acc-${pos}`, image: { asset: AUDIT_IMG, alt: '' }, accent: pos, variant: '' });
            meta.push({ layout: sl.layout, variant: `accent-${pos}` });
          }
        }
        if (CALLOUT_LAYOUTS.includes(sl.layout)) {
          slides.push({ ...stress(sl, level), id: `${sl.id}-callout`, callout: { tone: 'warn', text: 'Số liệu tạm tính đến hết quý III/2026 — cập nhật lại sau khi chốt sổ cuối năm.' } });
          meta.push({ layout: sl.layout, variant: 'callout' });
        }
      }
      // Lenient = đúng đường AI sinh bài (cắt theo SPEC_LIMITS như thật).
      const { spec } = normalizeSpec({ ...base, footer: 'MISA · Hội thảo chuyển đổi số 2026', slides }, { strict: false });
      const { width, height } = deckSize(ratio);
      const html = renderDeck(spec, { ratio, embedFont: true });
      const page = await browser.newPage();
      await page.setViewport({ width, height });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => (window.__deck ? window.__deck.ready : null));
      await page.evaluate(() => document.fonts.ready);
      for (let i = 0; i < spec.slides.length; i++) {
        await page.evaluate((idx) => { document.body.classList.add('still'); document.getElementById('deck').style.setProperty('--s', '1'); window.__deck.goto(idx); }, i);
        const issues = await page.evaluate(inspect);
        const m = meta[i] || {};
        // Biến thể không hợp nội dung → renderer tự lùi về biến thể mặc định (resolveVariant): ghi biến thể thật đã vẽ.
        const drawn = await page.evaluate(() => document.querySelector('.slide.on')?.className || '');
        if (issues.length) {
          const row = { ratio, level, layout: m.layout, variant: m.variant, drawn, issues };
          report.push(row);
          if (SHOTS) {
            await page.evaluate((list) => {
              document.querySelectorAll('.__au').forEach((e) => e.remove());
              for (const x of list) {
                const d = document.createElement('div');
                d.className = '__au';
                Object.assign(d.style, { position: 'fixed', left: x.box[0] + 'px', top: x.box[1] + 'px', width: x.box[2] + 'px', height: x.box[3] + 'px', outline: '4px solid red', zIndex: 999, pointerEvents: 'none' });
                document.body.appendChild(d);
              }
            }, issues);
            await page.screenshot({ path: `${OUT}/${ratio.replace(':', 'x')}-${level}-${m.layout}-${m.variant}.png`, clip: { x: 0, y: 0, width, height } });
            await page.evaluate(() => document.querySelectorAll('.__au').forEach((e) => e.remove()));
          }
        }
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
const byKind = {};
for (const r of report) for (const x of r.issues) byKind[x.kind] = (byKind[x.kind] || 0) + 1;
const byLayout = {};
for (const r of report) byLayout[`${r.layout}/${r.variant}`] = (byLayout[`${r.layout}/${r.variant}`] || 0) + 1;
console.log('Theo loại lỗi:', byKind);
console.log('Trang lỗi theo bố cục/biến thể:', byLayout);
console.log(`Tổng: ${report.length} trang có lỗi → ${OUT}/report.json`);
process.exit(report.length ? 1 : 0);
