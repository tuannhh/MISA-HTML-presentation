// Vẽ biểu đồ (bố cục 'chart') thành HTML + SVG tĩnh — chữ (nhãn, số, chú giải) là HTML để sắc nét và đổi màu theo chủ đề;
// cột/thanh định vị bằng % của vùng vẽ (co giãn theo khung, không đo DOM). Chuyển động dùng engine sẵn có:
// grow (cột mọc), bar (thanh/vùng đường kẻ lộ dần), ring (cung tròn), pop (điểm), up/fade (chú giải).
// AN TOÀN: mọi chữ từ dữ liệu đều escape; màu chỉ là biến CSS của chủ đề (hằng).
import { fmtNum, withUnit, niceScale } from './chart.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const r2 = (x) => Math.round(x * 100) / 100;
const pc = (x) => `${r2(x * 100)}%`;

// Màu chuỗi / lát: biến --ch0…--ch7 (theme.css — thứ tự khác nhau cho tông tối / sáng để 2 màu đầu luôn tách bạch).
export const seriesColor = (k) => `var(--ch${((k % 8) + 8) % 8})`;

const label = (v, unit, o) => withUnit(fmtNum(v, o), unit);
// Nhãn số trên cột/thanh/điểm: đơn vị % gắn vào số; đơn vị khác đã ghi một lần ở góc ("Đơn vị: …") → chỉ số.
const vlabel = (v, unit) => (unit === '%' ? withUnit(fmtNum(v), unit) : fmtNum(v));
const signed = (v, unit) => `${v > 0 ? '+' : ''}${fmtNum(v)}${unit === '%' ? '%' : ''}`;
// Vạch trục: số gọn (1,2 Tr); đơn vị % gắn luôn vào vạch, đơn vị khác ghi một lần ở góc ("Đơn vị: tỷ đồng").
const tick = (v, unit) => (unit === '%' ? `${fmtNum(v, { compact: true })}%` : fmtNum(v, { compact: true }));
const unitNote = (unit) => (unit && unit !== '%' ? `<div class="ch-unit" data-a="fade" data-d="10">Đơn vị: ${esc(unit)}</div>` : '');

function legend(names, d) {
  return `<div class="ch-lg" data-a="fade" data-d="${d}">${names
    .map((n, k) => `<span class="ch-li"><i style="--c:${seriesColor(k)}"></i>${esc(n || `Chuỗi ${k + 1}`)}</span>`)
    .join('')}</div>`;
}

// Lưới ngang + vạch trục tung (cột, cột chồng, thác nước, đường, vùng).
function yGrid(sc, unit) {
  const y = (v) => (v - sc.lo) / (sc.hi - sc.lo);
  return `<div class="ch-grid" aria-hidden="true">${sc.ticks
    .map((t) => `<i class="ch-gl${t === 0 ? ' z' : ''}" style="bottom:${pc(y(t))}"><span>${esc(tick(t, unit))}</span></i>`)
    .join('')}</div>`;
}
const gutter = (sc, unit) => Math.max(...sc.ticks.map((t) => tick(t, unit).length));
const xLabels = (cats, d) =>
  `<div class="ch-xl" style="--n:${cats.length}">${cats.map((c, i) => `<span data-a="up" data-d="${d + i * 2}" data-dist="20">${esc(c)}</span>`).join('')}</div>`;

// Khung chung cho biểu đồ có trục tung: [đơn vị] [chú giải] | vùng vẽ (lưới + nội dung) | nhãn trục hoành.
function axisFrame(chart, sc, inner, cats, o) {
  const many = cats.length > 8 || Math.max(0, ...cats.map((c) => c.length)) > 14;
  return `<div class="chart ch-axis${many ? ' dense' : ''}" style="--yw:${gutter(sc, chart.unit)};--n:${cats.length}">${unitNote(chart.unit)}${
    o.legend ? legend(chart.series.map((s) => s.name), o.d0) : ''
  }<div class="ch-plot">${yGrid(sc, chart.unit)}${inner}</div>${xLabels(cats, o.d0 + 4)}</div>`;
}

const allValues = (series) => series.flatMap((s) => s.values.filter(isNum));

function column(chart, o) {
  const { categories: C, series: S } = chart;
  const vals = allValues(S);
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v) => (v - sc.lo) / (sc.hi - sc.lo);
  const base = y(0);
  const m = S.length;
  const bw = m === 1 ? 56 : 76 / m;
  const pad = (100 - bw * m) / 2;
  const show = o.values && C.length * m <= 28;
  const groups = C.map((_, i) => `<div class="ch-g">${S.map((s, k) => {
    const v = s.values[i];
    if (!isNum(v)) return '';
    const h = Math.abs(y(v) - base);
    const pos = v >= 0 ? `bottom:${pc(base)}` : `top:${pc(1 - base)}`;
    return `<i class="ch-b${v < 0 ? ' neg' : ''}" style="left:${r2(pad + k * bw)}%;width:${r2(bw)}%;${pos};height:${pc(h)};--c:${seriesColor(k)}" data-a="grow" data-to="${r2(h * 100)}" data-d="${o.d0 + 6 + i * 3 + k * 2}">${
      show ? `<span class="ch-v">${esc(vlabel(v, chart.unit))}</span>` : ''
    }</i>`;
  }).join('')}</div>`).join('');
  return axisFrame(chart, sc, `<div class="ch-cols" style="--n:${C.length}">${groups}</div>`, C, { ...o, legend: m > 1 });
}

function stacked(chart, o) {
  const { categories: C, series: S } = chart;
  const totals = C.map((_, i) => S.reduce((a, s) => a + (isNum(s.values[i]) ? s.values[i] : 0), 0));
  const sc = niceScale(0, Math.max(0, ...totals));
  const y = (v) => (v - sc.lo) / (sc.hi - sc.lo);
  const show = o.values && C.length <= 12;
  const groups = C.map((_, i) => {
    let cum = 0;
    const segs = S.map((s, k) => {
      const v = s.values[i];
      if (!isNum(v) || v <= 0) return '';
      const b = y(cum);
      cum += v;
      const h = y(cum) - b;
      return `<i class="ch-b seg" style="left:20%;width:60%;bottom:${pc(b)};height:${pc(h)};--c:${seriesColor(k)}" data-a="grow" data-to="${r2(h * 100)}" data-d="${o.d0 + 6 + i * 3 + k * 6}">${
        show && h >= 0.08 ? `<span class="ch-v in">${esc(fmtNum(v))}</span>` : ''
      }</i>`;
    }).join('');
    const tot = show ? `<span class="ch-tot" style="bottom:${pc(y(totals[i]))}" data-a="up" data-d="${o.d0 + 10 + i * 3 + S.length * 6}" data-dist="20">${esc(vlabel(totals[i], chart.unit))}</span>` : '';
    return `<div class="ch-g">${segs}${tot}</div>`;
  }).join('');
  return axisFrame(chart, sc, `<div class="ch-cols" style="--n:${C.length}">${groups}</div>`, C, { ...o, legend: true });
}

function waterfall(chart, o) {
  const C = chart.categories;
  const vals = chart.series[0].values.map((v) => (isNum(v) ? v : 0));
  const levels = [0];
  for (const v of vals) levels.push(levels[levels.length - 1] + v);
  const total = levels[levels.length - 1];
  const sc = niceScale(Math.min(...levels), Math.max(...levels));
  const y = (v) => (v - sc.lo) / (sc.hi - sc.lo);
  const cats = [...C, 'Tổng'];
  const show = o.values;
  const bar = (from, to, cls, i, txt) => {
    const lo = Math.min(from, to);
    const h = Math.abs(y(to) - y(from));
    // Nối đỉnh cột này sang cột sau (mức tích luỹ).
    const cn = i < cats.length - 1 ? `<i class="ch-cn" style="bottom:${pc(y(to))}" data-a="fade" data-d="${o.d0 + 12 + i * 4}"></i>` : '';
    return `<div class="ch-g">${cn}<i class="ch-b ${cls}" style="left:22%;width:56%;bottom:${pc(y(lo))};height:${pc(h)}" data-a="grow" data-to="${r2(h * 100)}" data-d="${o.d0 + 6 + i * 4}">${
      show ? `<span class="ch-v">${esc(txt)}</span>` : ''
    }</i></div>`;
  };
  const groups = vals.map((v, i) => bar(levels[i], levels[i + 1], v >= 0 ? 'up' : 'dn', i, signed(v, chart.unit))).join('') + bar(0, total, 'tot', vals.length, vlabel(total, chart.unit));
  return axisFrame(chart, sc, `<div class="ch-cols wf" style="--n:${cats.length}">${groups}</div>`, cats, { ...o, legend: false });
}

function line(chart, o, area) {
  const { categories: C, series: S } = chart;
  const vals = allValues(S);
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const y = (v) => 1 - (v - sc.lo) / (sc.hi - sc.lo);
  const x = (i) => (i + 0.5) / C.length;
  const base = y(0);
  const P = (v) => Math.round(v * 1000);
  const paths = S.map((s, k) => {
    // Ô trống = đứt đoạn (không nối qua).
    const segs = [];
    let cur = [];
    s.values.forEach((v, i) => {
      if (isNum(v)) cur.push([x(i), y(v)]);
      else if (cur.length) segs.push(cur), (cur = []);
    });
    if (cur.length) segs.push(cur);
    const d = segs.map((g) => g.map(([a, b], j) => `${j ? 'L' : 'M'}${P(a)} ${P(b)}`).join('')).join('');
    const fill = area ? segs.filter((g) => g.length > 1).map((g) => `M${P(g[0][0])} ${P(base)}${g.map(([a, b]) => `L${P(a)} ${P(b)}`).join('')}L${P(g[g.length - 1][0])} ${P(base)}Z`).join('') : '';
    return `${fill ? `<path class="ch-ar" style="--c:${seriesColor(k)}" d="${fill}"/>` : ''}<path class="ch-ln" style="--c:${seriesColor(k)}" d="${d}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const show = o.values && S.length === 1 && C.length <= 12;
  const pts = S.map((s, k) => s.values.map((v, i) => (isNum(v)
    ? `<i class="ch-pt" style="left:${pc(x(i))};top:${pc(y(v))};--c:${seriesColor(k)}" data-a="pop" data-d="${o.d0 + 10 + i * 3}">${show ? `<span class="ch-v">${esc(vlabel(v, chart.unit))}</span>` : ''}</i>`
    : '')).join('')).join('');
  // Đường lộ dần từ trái sang (khung cắt rộng dần — hình vẽ bên trong giữ nguyên bề rộng vùng vẽ).
  const inner = `<div class="ch-rev" style="width:100%" data-a="bar" data-to="100" data-d="${o.d0 + 6}"><svg class="ch-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${paths}</svg></div><div class="ch-pts">${pts}</div>`;
  return axisFrame(chart, sc, inner, C, { ...o, legend: S.length > 1 });
}

function bar(chart, o) {
  const { categories: C, series: S } = chart;
  const vals = allValues(S);
  const sc = niceScale(Math.min(0, ...vals), Math.max(0, ...vals));
  const x = (v) => (v - sc.lo) / (sc.hi - sc.lo);
  const base = x(0);
  const m = S.length;
  const show = o.values && C.length * m <= 36;
  const lw = Math.min(22, Math.max(4, ...C.map((c) => c.length)));
  const rows = C.map((c, i) => {
    const bars = S.map((s, k) => {
      const v = s.values[i];
      if (!isNum(v)) return '';
      const w = Math.abs(x(v) - base);
      const pos = v >= 0 ? `left:${pc(base)}` : `right:${pc(1 - base)}`;
      return `<i class="ch-hb-b${v < 0 ? ' neg' : ''}" style="${pos};width:${pc(w)};top:${r2(12 + (k * 76) / m)}%;height:${r2(76 / m - (m > 1 ? 3 : 0))}%;--c:${seriesColor(k)}" data-a="bar" data-to="${r2(w * 100)}" data-d="${o.d0 + 6 + i * 3 + k * 2}">${
        show ? `<span class="ch-v">${esc(vlabel(v, chart.unit))}</span>` : ''
      }</i>`;
    }).join('');
    return `<div class="ch-hr"><span class="ch-hl" data-a="left" data-d="${o.d0 + 2 + i * 3}" data-dist="30">${esc(c)}</span><div class="ch-ht">${bars}</div></div>`;
  }).join('');
  const grid = `<div class="ch-vgrid" aria-hidden="true">${sc.ticks.map((t) => `<i class="ch-gl${t === 0 ? ' z' : ''}" style="left:${pc(x(t))}"><span>${esc(tick(t, chart.unit))}</span></i>`).join('')}</div>`;
  return `<div class="chart ch-bar${C.length > 8 ? ' dense' : ''}" style="--lw:${lw};--n:${C.length}">${unitNote(chart.unit)}${m > 1 ? legend(S.map((s) => s.name), o.d0) : ''}<div class="ch-hplot">${grid}${rows}</div></div>`;
}

function round(chart, o, donut) {
  const C = chart.categories;
  const vals = chart.series[0].values.map((v) => (isNum(v) && v > 0 ? v : 0));
  const sum = vals.reduce((a, b) => a + b, 0) || 1;
  const r = donut ? 38 : 25;
  const sw = donut ? 20 : 50;
  const gap = C.length > 1 ? (donut ? 0.6 : 0.35) : 0;
  let at = 0;
  const slices = vals.map((v, i) => {
    const p = (v / sum) * 100;
    const start = at;
    at += p;
    const len = Math.max(0, r2(p - gap));
    if (!len) return '';
    // Xoay ở nhóm bọc ngoài: engine ghi đè style.transform của phần tử đang chạy hiệu ứng.
    return `<g style="transform:rotate(${r2(start * 3.6 - 90)}deg)"><circle cx="50" cy="50" r="${r}" pathLength="100" stroke-dasharray="${len} 100" style="stroke:${seriesColor(i)};stroke-width:${sw}" data-a="ring" data-to="${len}" data-dur="26" data-d="${o.d0 + 6 + i * 8}"/></g>`;
  }).join('');
  const center = donut ? `<div class="ch-dc" data-a="pop" data-d="${o.d0 + 8 + C.length * 8}"><b>${esc(fmtNum(sum, { compact: true }))}</b><span>${esc(chart.unit && chart.unit !== '%' ? `Tổng (${chart.unit})` : 'Tổng')}</span></div>` : '';
  const rows = C.map((c, i) => `<div class="ch-pr" data-a="left" data-d="${o.d0 + 10 + i * 6}" data-dist="40"><i style="--c:${seriesColor(i)}"></i><span class="ch-pn">${esc(c)}</span><b>${esc(fmtNum((vals[i] / sum) * 100, { dec: 1 }))}%</b>${
    o.values && chart.unit !== '%' ? `<span class="ch-pv">${esc(label(chart.series[0].values[i], chart.unit))}</span>` : ''
  }</div>`).join('');
  return `<div class="chart ch-round${donut ? ' donut' : ''}"><div class="ch-pie"><div class="ch-sq"><svg viewBox="0 0 100 100" aria-hidden="true">${slices}</svg>${center}</div></div><div class="ch-pl">${rows}</div></div>`;
}

/**
 * HTML biểu đồ cho kiểu v (column|bar|stacked|line|area|pie|donut|waterfall — đã kiểm hợp dữ liệu ở variants.js).
 * @param {object} chart slide.chart đã làm sạch (cleanChart)
 * @param {{ d0?: number }} o d0 = mốc trễ hiệu ứng (khung hình)
 */
export function chartHtml(chart, v, o = {}) {
  const opt = { d0: o.d0 ?? 14, values: chart.values !== false };
  // Trình đọc màn hình: tên chuỗi, đơn vị và số liệu từng hạng mục (biểu đồ là hình — không có chữ thay thế khác).
  const names = chart.series.map((s, k) => s.name || `Chuỗi ${k + 1}`);
  const rows = chart.categories.map((c, i) => `${c || `Mục ${i + 1}`}: ${chart.series.map((s) => fmtNum(s.values[i]) || '—').join(' / ')}`);
  const aria = `Biểu đồ${chart.unit ? ` (đơn vị ${chart.unit})` : ''}${chart.series.length > 1 ? ` — ${names.join(' / ')}` : ''}. ${rows.join('; ')}`;
  let html;
  if (v === 'bar') html = bar(chart, opt);
  else if (v === 'stacked') html = stacked(chart, opt);
  else if (v === 'line' || v === 'area') html = line(chart, opt, v === 'area');
  else if (v === 'pie' || v === 'donut') html = round(chart, opt, v === 'donut');
  else if (v === 'waterfall') html = waterfall(chart, opt);
  else html = column(chart, opt);
  return html.replace('<div class="chart', `<div role="img" aria-label="${esc(aria.slice(0, 600))}" class="chart`);
}
