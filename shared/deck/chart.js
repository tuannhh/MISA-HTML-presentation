// Biểu đồ (bố cục 'chart'): dữ liệu dạng bảng người dùng nhập hoặc dán từ bảng tính — hạng mục (categories) × chuỗi số liệu (series).
// Hàm thuần dùng chung: server làm sạch (specService), renderer vẽ (chartView.js), trình soạn thảo (bảng dữ liệu, đổi Con số ↔ Biểu đồ).
// Kiểu biểu đồ = biến thể của bố cục (slide.variant — VARIANTS.chart), không lưu trong slide.chart.

import { plainText } from './rich.js';

export const CHART_LIMITS = Object.freeze({ categories: 12, series: 4, label: 40, unit: 16, pie: 8, waterfall: 10, abs: 1e15 });

const CTRL = /[\u0000-\u001f\u007f]/g;
const text = (v, max) => String(v ?? '').replace(CTRL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Đọc số người dùng gõ/dán theo cả 2 thói quen: "1.234,5" (Việt Nam) và "1,234.5" (Anh/Mỹ); bỏ khoảng trắng, ký hiệu tiền, %.
 * "1.234" / "1,234" (nhóm 3 chữ số) = nghìn; "1,5" / "1.5" = thập phân. Không đọc được → null.
 */
export function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= CHART_LIMITS.abs ? v : null;
  let s = String(v ?? '').trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /^[-−–]/.test(s);
  s = s.replace(/[()\s %₫$€đ]|VND|USD/gi, '').replace(/^[-−–+]/, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    // Dấu xuất hiện sau cùng là dấu thập phân.
    s = dot > comma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (comma >= 0) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.split(',').length === 2 ? s.replace(',', '.') : '';
  } else if (dot >= 0) {
    s = /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.split('.').length === 2 ? s : '';
  }
  const n = Number(s);
  if (!s || !Number.isFinite(n) || n > CHART_LIMITS.abs) return null;
  return neg ? -n : n;
}

/**
 * Đọc số người dùng gõ vào MỘT Ô của bảng dữ liệu (khác parseNum — nơi phải đoán định dạng bảng dán): dấu phẩy luôn là thập phân,
 * dấu chấm là phân cách nghìn khi đúng nhóm 3 chữ số ("1.234,5" = 1234,5; "0.123" = 0,123 vì nhóm nghìn không mở đầu bằng 0);
 * "1.5" (không đúng nhóm) vẫn là thập phân cho người quen gõ kiểu Anh. Dạng chỉ Anh ("1,234.5", "1,234,567") giao lại cho parseNum.
 * Bảo đảm parseCell(showCell(n)) === n với mọi số cleanChart giữ (làm tròn 1e-6, |n| ≤ 1e15).
 */
export function parseCell(v) {
  if (typeof v === 'number') return parseNum(v);
  const raw = String(v ?? '').trim();
  if (!raw) return null;
  const neg = /^\(.*\)$/.test(raw) || /^[-−–]/.test(raw);
  const s = raw.replace(/[()\s %₫$€đ]|VND|USD/gi, '').replace(/^[-−–+]/, '');
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const commas = s.split(',').length - 1;
  if (commas > 1 || (commas === 1 && s.lastIndexOf('.') > s.indexOf(','))) return parseNum(raw);
  const [head, frac] = commas ? s.split(',') : [s, ''];
  const heads = /^[1-9]\d{0,2}(\.\d{3})+$/.test(head) ? head.replace(/\./g, '') : /^\d*$/.test(head) ? head : /^\d+\.\d+$/.test(head) && !commas ? head : null;
  if (heads === null || (commas && !/^\d*$/.test(frac))) return null;
  const n = Number(commas ? `${heads || '0'}.${frac || '0'}` : heads);
  if (!Number.isFinite(n) || n > CHART_LIMITS.abs) return null;
  return neg ? -n : n;
}

/** Số → chữ trong ô nhập: dấu phẩy thập phân, không nhóm nghìn, không ký hiệu mũ (làm tròn 1e-6 như cleanChart). */
export function showCell(v) {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '';
  return String(Math.round(Number(v) * 1e6) / 1e6).replace('.', ',');
}

const num = (v) => {
  const n = parseNum(v);
  return n === null ? null : Math.round(n * 1e6) / 1e6;
};

/** Làm sạch slide.chart — không hợp lệ/rỗng → null. Chữ thuần (không định dạng), cắt độ dài; ô số không đọc được → null (ô trống). */
export function cleanChart(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const categories = (Array.isArray(raw.categories) ? raw.categories : []).slice(0, CHART_LIMITS.categories).map((c) => text(c, CHART_LIMITS.label));
  const n = categories.length;
  if (!n) return null;
  const series = (Array.isArray(raw.series) ? raw.series : [])
    .slice(0, CHART_LIMITS.series)
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({ name: text(s.name, CHART_LIMITS.label), values: Array.from({ length: n }, (_, i) => num(Array.isArray(s.values) ? s.values[i] : null)) }));
  if (!series.length) return null;
  const out = { categories, series };
  const unit = text(raw.unit, CHART_LIMITS.unit);
  if (unit) out.unit = unit;
  if (raw.values === false) out.values = false;
  return out;
}

/**
 * Dán bảng từ Excel/Google Sheets (cột cách bằng Tab; tệp CSV dùng ";"): cột đầu = hạng mục, các cột sau = chuỗi số liệu.
 * Hàng đầu có tên cột (ô số không đọc được thành số) → tên chuỗi. Trả null khi không nhận ra bảng (ít hơn 1 hàng số).
 */
export function parseTable(input) {
  const lines = String(input ?? '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (!lines.length) return null;
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : null;
  if (!sep) return null;
  const rows = lines.map((l) => l.split(sep).map((c) => c.trim()));
  const width = Math.max(...rows.map((r) => r.length));
  if (width < 2) return null;
  const numeric = (r) => r.slice(1).some((c) => parseNum(c) !== null);
  // Hàng tiêu đề: có ô chữ (không phải số) ở các cột số liệu, hoặc toàn là năm (2025, 2026…) trong khi các hàng dưới không phải.
  const yearRow = (r) => r.slice(1).filter(Boolean).length > 0 && r.slice(1).filter(Boolean).every((c) => /^(19|20)\d{2}$/.test(c));
  const header = rows.length > 1 && (rows[0].slice(1).some((c) => c && parseNum(c) === null) || (yearRow(rows[0]) && !rows.slice(1).every(yearRow)));
  const body = (header ? rows.slice(1) : rows).filter(numeric).slice(0, CHART_LIMITS.categories);
  if (!body.length) return null;
  const nSeries = Math.min(CHART_LIMITS.series, width - 1);
  const series = Array.from({ length: nSeries }, (_, k) => ({
    name: text(header ? rows[0][k + 1] : '', CHART_LIMITS.label) || `Chuỗi ${k + 1}`,
    values: body.map((r) => num(r[k + 1])),
  }));
  return cleanChart({ categories: body.map((r, i) => r[0] || `Mục ${i + 1}`), series });
}

/** Con số nổi bật → biểu đồ 1 chuỗi (chỉ số liệu là số); đơn vị = hậu tố chung nếu mọi số cùng hậu tố. */
export function chartFromStats(stats) {
  const list = (Array.isArray(stats) ? stats : []).filter((st) => parseNum(st?.value) !== null).slice(0, CHART_LIMITS.categories);
  if (!list.length) return null;
  const units = [...new Set(list.map((st) => String(st.suffix || '').trim()))];
  return cleanChart({
    categories: list.map((st, i) => plainText(st.label || '') || `Mục ${i + 1}`),
    series: [{ name: '', values: list.map((st) => parseNum(st.value)) }],
    unit: units.length === 1 ? units[0] : '',
  });
}

/** Biểu đồ → Con số nổi bật (chuỗi đầu, tối đa `max` số). */
export function statsFromChart(chart, max = 8) {
  if (!chart?.categories?.length || !chart.series?.length) return [];
  const s = chart.series[0];
  return chart.categories.slice(0, max).map((c, i) => ({ value: s.values[i] ?? '', prefix: '', suffix: chart.unit || '', label: c }));
}

/** Khoảng trục "đẹp" chứa [min, max] (luôn có 0) với ~count vạch: bước 1/2/2,5/5 × 10^k. */
export function niceScale(min, max, count = 5) {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw - 1e-12) || 10 * p;
  lo = Math.floor(lo / step + 1e-9) * step;
  hi = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, step, ticks };
}

const NF = new Map();
const nf = (dec, compact) => {
  const k = `${dec}${compact ? 'c' : ''}`;
  if (!NF.has(k)) NF.set(k, new Intl.NumberFormat('vi-VN', compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: dec }));
  return NF.get(k);
};
/** Số kiểu Việt Nam (1.234,5); compact (vạch trục số lớn): "1,2 Tr". */
export function fmtNum(v, { compact = false, dec = 2 } = {}) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '';
  return nf(dec, compact && Math.abs(v) >= 1e4).format(v).replace(/-/g, '−');
}
/** Số kèm đơn vị: "45%" (dính liền khi đơn vị là ký hiệu), "12 tỷ". */
export function withUnit(s, unit) {
  if (!s || !unit) return s;
  return /^[%‰°]/.test(unit) ? `${s}${unit}` : `${s} ${unit}`;
}
