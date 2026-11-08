// Đợt 5b (mục 8 phần 2): sơ đồ (ma trận 2×2, Venn, chu trình, vòng đồng tâm, bia, đối đầu A vs B) + bố cục Biểu đồ (dữ liệu bảng).
// Danh mục + điều kiện hợp nội dung, AI chỉ tự chọn 2×2 / A vs B, dữ liệu biểu đồ (đọc số, dán bảng, làm sạch, trục), renderer, hình thu nhỏ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VARIANTS, MANUAL_VARIANTS, fits, artDirect, familyOf } from '../../shared/deck/variants.js';
import { parseNum, parseTable, cleanChart, niceScale, fmtNum, withUnit, chartFromStats, statsFromChart, CHART_LIMITS } from '../../shared/deck/chart.js';
import { CALLOUT_LAYOUTS } from '../../shared/deck/blocks.js';
import { LAYOUTS, AI_LAYOUTS } from '../../shared/deck/render.js';
import { renderDeck } from '../../src/services/renderService.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { stylePreview } from '../../frontend/src/lib/stylePreviews.js';

const it = (title, text = '', value = '') => ({ icon: 'sparkles', title, text, value });
const items = (n) => Array.from({ length: n }, (_, i) => it(`Mục ${i + 1}`, `Mô tả ${i + 1}`));
const col = (title) => ({ title, subtitle: '', tone: 'neutral', points: ['Ý 1', 'Ý 2'] });
const chart = (cats, ...series) => ({ categories: cats, series: series.map((values, k) => ({ name: `S${k + 1}`, values })) });
const html = (slides) => {
  const { spec, errors } = normalizeSpec({ title: 'Thử', slides });
  assert.deepEqual(errors, []);
  return renderDeck(spec, { ratio: '16:9' });
};

test('danh mục: sơ đồ + biểu đồ; chỉ 2×2 và A vs B để AI tự chọn; Biểu đồ không thuộc bố cục AI', () => {
  const add = { cards: ['matrix', 'venn'], process: ['cycle', 'concentric', 'bullseye'], comparison: ['versus'] };
  for (const [l, vs] of Object.entries(add)) for (const v of vs) assert.ok(VARIANTS[l].includes(v), `${l}:${v}`);
  assert.deepEqual(VARIANTS.chart, ['column', 'bar', 'stacked', 'line', 'area', 'pie', 'donut', 'waterfall']);
  for (const k of ['cards:venn', 'process:cycle', 'process:concentric', 'process:bullseye', 'chart:pie', 'chart:waterfall']) assert.ok(MANUAL_VARIANTS.has(k), k);
  assert.ok(!MANUAL_VARIANTS.has('cards:matrix') && !MANUAL_VARIANTS.has('comparison:versus'));
  assert.ok(LAYOUTS.includes('chart') && !AI_LAYOUTS.includes('chart'));
  assert.ok(CALLOUT_LAYOUTS.includes('chart'));
  assert.deepEqual(familyOf('chart'), ['stats', 'chart']);
  assert.ok(familyOf('process').includes('cards'));
});

test('điều kiện hợp nội dung: sơ đồ', () => {
  assert.equal(fits('cards', 'matrix', { items: items(4) }), true);
  assert.equal(fits('cards', 'matrix', { items: items(3) }), false);
  assert.equal(fits('cards', 'venn', { items: items(3) }), true);
  assert.equal(fits('cards', 'venn', { items: items(4) }), false);
  assert.equal(fits('process', 'cycle', { steps: items(6) }), true);
  assert.equal(fits('process', 'cycle', { steps: items(2) }), false);
  assert.equal(fits('process', 'concentric', { steps: items(2) }), true);
  assert.equal(fits('process', 'concentric', { steps: items(6) }), false);
  assert.equal(fits('process', 'bullseye', { steps: items(5) }), true);
  assert.equal(fits('comparison', 'versus', { columns: [col('A'), col('B')] }), true);
  assert.equal(fits('comparison', 'versus', { columns: [col('A'), col('B'), col('C')] }), false);
});

test('điều kiện hợp nội dung: biểu đồ (cột chồng ≥ 2 chuỗi không âm, tròn 1 chuỗi 2–8 lát không âm, thác nước 1 chuỗi)', () => {
  const C = ['a', 'b', 'c'];
  assert.equal(fits('chart', 'column', {}), true, 'mặc định luôn hợp');
  assert.equal(fits('chart', 'stacked', { chart: chart(C, [1, 2, 3]) }), false);
  assert.equal(fits('chart', 'stacked', { chart: chart(C, [1, 2, 3], [3, null, 1]) }), true);
  assert.equal(fits('chart', 'stacked', { chart: chart(C, [1, -2, 3], [3, 2, 1]) }), false);
  assert.equal(fits('chart', 'pie', { chart: chart(C, [1, 2, 3]) }), true);
  assert.equal(fits('chart', 'donut', { chart: chart(C, [1, 2, 3], [1, 1, 1]) }), false);
  assert.equal(fits('chart', 'pie', { chart: chart(C, [0, 0, 0]) }), false);
  assert.equal(fits('chart', 'pie', { chart: chart(Array(9).fill('x'), Array(9).fill(1)) }), false);
  assert.equal(fits('chart', 'waterfall', { chart: chart(C, [5, -2, 1]) }), true);
  assert.equal(fits('chart', 'line', { chart: chart(['a'], [1]) }), false);
});

test('chỉ đạo nghệ thuật: chọn được 2×2 / A vs B khi hợp, không bao giờ chọn sơ đồ chỉ-người-dùng hay đổi biểu đồ', () => {
  const seen = new Set();
  for (let seed = 0; seed < 200; seed += 1) {
    const spec = {
      slides: [
        { layout: 'cards', items: items(4) },
        { layout: 'comparison', columns: [col('A'), col('B')] },
        { layout: 'process', steps: items(4) },
        { layout: 'cards', items: items(3) },
        { layout: 'chart', variant: 'pie', chart: chart(['a', 'b'], [1, 2]) },
      ],
    };
    artDirect(spec, { seed });
    for (const s of spec.slides) {
      if (s.variant) seen.add(`${s.layout}:${s.variant}`);
      assert.ok(!MANUAL_VARIANTS.has(`${s.layout}:${s.variant}`), `seed ${seed}: ${s.layout}:${s.variant}`);
    }
  }
  assert.ok(seen.has('cards:matrix') && seen.has('comparison:versus'), [...seen].join(' '));
});

test('đọc số: kiểu Việt Nam và kiểu Anh, ký hiệu, số âm; không đọc được → null', () => {
  const cases = [['1.234,5', 1234.5], ['1,234.5', 1234.5], ['1.234', 1234], ['1,5', 1.5], ['2.5', 2.5], ['45%', 45], ['-12', -12], ['(7)', -7], ['− 3,2', -3.2], ['12 tỷ', null], ['', null], ['abc', null], ['1,2,3', null], [7, 7], [Infinity, null], ['1.234.567', 1234567], ['100 000', 100000]];
  for (const [v, want] of cases) assert.equal(parseNum(v), want, String(v));
});

test('dán bảng: hàng đầu là tên chuỗi, cột đầu là hạng mục; Tab hoặc ";"; giới hạn hạng mục/chuỗi', () => {
  const t = parseTable('Quý\t2025\t2026\nQ1\t100\t120\nQ2\t1.300,5\t150\n\nQ3\t\t170\n');
  assert.deepEqual(t.categories, ['Q1', 'Q2', 'Q3']);
  assert.deepEqual(t.series.map((s) => s.name), ['2025', '2026']);
  assert.deepEqual(t.series[0].values, [100, 1300.5, null]);
  const n = parseTable('A;1\nB;2');
  assert.deepEqual(n.series[0], { name: 'Chuỗi 1', values: [1, 2] });
  assert.equal(parseTable('một dòng không có cột'), null);
  assert.equal(parseTable('a\tb\nc\td'), null, 'không có số');
  const big = parseTable(Array.from({ length: 20 }, (_, i) => `r${i}\t${[1, 2, 3, 4, 5, 6].join('\t')}`).join('\n'));
  assert.equal(big.categories.length, CHART_LIMITS.categories);
  assert.equal(big.series.length, CHART_LIMITS.series);
});

test('cleanChart: chữ thuần, cắt độ dài, ô số lạ → null, cờ ẩn số; rỗng → null', () => {
  const c = cleanChart({ categories: ['  Bán\u0000hàng  ', 'x'.repeat(80)], series: [{ name: '<b>S</b>', values: ['12', 'abc', 99] }], unit: ' tỷ đồng ', values: false, extra: 1 });
  assert.deepEqual(c.categories, ['Bán hàng', 'x'.repeat(CHART_LIMITS.label)]);
  assert.deepEqual(c.series, [{ name: '<b>S</b>', values: [12, null] }]);
  assert.equal(c.unit, 'tỷ đồng');
  assert.equal(c.values, false);
  assert.equal('extra' in c, false);
  assert.equal(cleanChart({ categories: [], series: [{ values: [] }] }), null);
  assert.equal(cleanChart({ categories: ['a'], series: [] }), null);
  assert.equal(cleanChart('x'), null);
});

test('trục "đẹp", định dạng số, Con số ↔ Biểu đồ', () => {
  assert.deepEqual(niceScale(0, 210).ticks, [0, 50, 100, 150, 200, 250]);
  const s = niceScale(-5, 22);
  assert.ok(s.lo <= -5 && s.hi >= 22 && s.ticks.includes(0));
  assert.equal(fmtNum(1234.5), '1.234,5');
  assert.equal(fmtNum(-3), '−3');
  assert.equal(withUnit('45', '%'), '45%');
  assert.equal(withUnit('12', 'tỷ'), '12 tỷ');
  const ch = chartFromStats([{ value: 62, suffix: '%', label: '⟦#ff0000⟧Giảm⟦/⟧ thời gian' }, { value: '24/7', label: 'Hỗ trợ' }, { value: 85, suffix: '%', label: 'Duyệt' }]);
  assert.deepEqual(ch.categories, ['Giảm thời gian', 'Duyệt']);
  assert.deepEqual(ch.series[0].values, [62, 85]);
  assert.equal(ch.unit, '%');
  assert.deepEqual(statsFromChart(ch)[1], { value: 85, prefix: '', suffix: '%', label: 'Duyệt' });
  assert.equal(chartFromStats([{ value: 'nhiều', label: 'x' }]), null);
});

test('normalizeSpec: bố cục Biểu đồ giữ dữ liệu; dữ liệu giữ cả khi đổi sang bố cục khác; dữ liệu hỏng bị bỏ', () => {
  const { spec, errors } = normalizeSpec({ title: 't', slides: [
    { layout: 'chart', title: 'Doanh thu', variant: 'donut', chart: chart(['a', 'b'], [1, 2]) },
    { layout: 'stats', title: 'x', stats: [{ value: 1, label: 'y' }], chart: chart(['a'], [5]) },
    { layout: 'chart', title: 'Hỏng', chart: { categories: 'abc', series: 5 } },
  ] }, { strict: true });
  assert.deepEqual(errors, []);
  assert.equal(spec.slides[0].variant, 'donut');
  assert.deepEqual(spec.slides[0].chart.series[0].values, [1, 2]);
  assert.deepEqual(spec.slides[1].chart.categories, ['a']);
  assert.equal(spec.slides[2].chart, undefined);
  // Bản AI (không strict): trang biểu đồ không có dữ liệu → hạ về bố cục hiển thị được.
  assert.notEqual(normalizeSpec({ slides: [{ layout: 'chart', title: 'x' }] }).spec.slides[0].layout, 'chart');
});

test('renderer: mọi loại biểu đồ vẽ đúng khối, chữ dữ liệu được escape', () => {
  const C = ['Q1', '<img src=x onerror=alert(1)>', 'Q3'];
  const base = { layout: 'chart', title: 'Biểu đồ', caption: 'Nguồn: nội bộ' };
  const want = {
    column: ['ch-axis', 'ch-b', 'data-a="grow"'],
    bar: ['ch-bar', 'ch-hb-b', 'data-a="bar"'],
    stacked: ['ch-b seg', 'ch-tot', 'ch-lg'],
    line: ['ch-ln', 'ch-pt', 'ch-rev'],
    area: ['ch-ar', 'ch-ln'],
    pie: ['ch-round', 'data-a="ring"', 'ch-pr'],
    donut: ['ch-round donut', 'ch-dc'],
    waterfall: ['ch-cols wf', 'ch-cn', 'Tổng'],
  };
  for (const [v, keys] of Object.entries(want)) {
    const two = v === 'stacked' ? [[1, 2, 3], [2, 2, 2]] : [[10, 20, 30]];
    const out = html([{ ...base, variant: v, chart: { ...chart(C, ...two), unit: 'tỷ' } }]);
    assert.ok(out.includes(`V-${v}`), v);
    for (const k of keys) assert.ok(out.includes(k), `${v}: ${k}`);
    assert.ok(!out.includes('<img src=x'), `${v}: escape`);
    assert.ok(out.includes('Nguồn: nội bộ'));
  }
  // Đơn vị: % gắn vào số; đơn vị khác ghi ở góc, nhãn chỉ có số.
  const pct = html([{ ...base, chart: { ...chart(['a'], [45]), unit: '%' } }]);
  assert.ok(pct.includes('>45%<') && !pct.includes('Đơn vị:'));
  const ty = html([{ ...base, chart: { ...chart(['a'], [45]), unit: 'tỷ' } }]);
  assert.ok(ty.includes('Đơn vị: tỷ') && ty.includes('>45<'));
  // Ẩn số liệu trên biểu đồ.
  assert.ok(!html([{ ...base, chart: { ...chart(['a'], [45]), values: false } }]).includes('class="ch-v"'));
  // Âm: cột mọc xuống từ trục 0.
  assert.ok(html([{ ...base, chart: chart(['a', 'b'], [5, -3]) }]).includes('ch-b neg'));
  // Trình đọc màn hình: đơn vị, tên chuỗi, số liệu từng hạng mục (ô trống → "—").
  const two = { categories: ['Q1', 'Q2'], series: [{ name: '2025', values: [1250.5, null] }, { name: '', values: [3, 4] }], unit: 'tỷ' };
  assert.ok(html([{ ...base, chart: two }]).includes('aria-label="Biểu đồ (đơn vị tỷ) — 2025 / Chuỗi 2. Q1: 1.250,5 / 3; Q2: — / 4"'));
});

test('renderer: sơ đồ (2×2, Venn, chu trình, đồng tâm, bia, A vs B)', () => {
  const out = html([
    { layout: 'cards', title: 'a', variant: 'matrix', items: items(4) },
    { layout: 'cards', title: 'b', variant: 'venn', items: items(3) },
    { layout: 'process', title: 'c', variant: 'cycle', steps: items(5) },
    { layout: 'process', title: 'd', variant: 'concentric', steps: items(4) },
    { layout: 'process', title: 'e', variant: 'bullseye', steps: items(3) },
    { layout: 'comparison', title: 'f', variant: 'versus', columns: [col('Cũ'), col('Mới')] },
  ]);
  for (const k of ['class="mx"', 'mx-q q3', 'dg vn n3', 'vn-c p2', 'dg dg-cycle', 'cy-ring', 'dg-dot', 'dg-sq concentric', 'dg-ring', 'dg-arw', 'class="vsx"', 'vsx-m']) assert.ok(out.includes(k), k);
  assert.equal((out.match(/class="dg-dot"/g) || []).length, 5);
  assert.equal((out.match(/class="cy-h"/g) || []).length, 5);
  // Hết hợp (5 mục) → về kiểu mặc định, không vỡ trang.
  assert.ok(html([{ layout: 'cards', title: 'x', variant: 'matrix', items: items(5) }]).includes('V-grid'));
});

test('hình thu nhỏ: mọi kiểu của mọi bố cục đều có hình xem trước', () => {
  for (const [l, vs] of Object.entries(VARIANTS)) for (const v of vs) assert.ok(stylePreview(l, v).startsWith('<svg'), `${l}:${v}`);
});
