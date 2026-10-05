// Renderer đặc tả bài trình bày (JSON) → 1 trang HTML hoàn chỉnh có chuyển động.
// Hàm thuần: không đọc file, không gọi mạng. CSS/engine/font do nơi gọi truyền vào (xem src/services/renderService.js).
// AN TOÀN: mọi chuỗi từ spec đều escape; icon chỉ lấy từ ICONS (hằng số tin cậy); URL ảnh do server cấp.
import { ICONS } from './icons.js';

export const RATIO_SIZES = Object.freeze({
  '16:9': [2560, 1440],
  '4:3': [1920, 1440],
  '2:1': [2880, 1440],
  '3:1': [4320, 1440],
});
export const LAYOUTS = Object.freeze([
  'cover', 'section', 'agenda', 'bullets', 'cards', 'stats', 'image', 'gallery', 'timeline', 'process', 'quote', 'comparison', 'closing',
]);
export const THEMES = Object.freeze(['midnight', 'aurora', 'ocean', 'paper', 'ember']);
// Tông nền người dùng chọn khi tạo bài → AI chỉ được chọn theme trong nhóm tương ứng (phần tử đầu = mặc định).
export const TONE_THEMES = Object.freeze({
  dark: Object.freeze(['midnight', 'ocean', 'aurora']),
  light: Object.freeze(['paper', 'ember']),
});

const ACC = ['cyan', 'blue', 'amber', 'mint', 'violet', 'coral'];
const PAD_X = 160;
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);
}
const pad2 = (n) => String(n).padStart(2, '0');
const accent = (i) => `--c:var(--${ACC[((i % ACC.length) + ACC.length) % ACC.length]})`;
const list = (v) => (Array.isArray(v) ? v : []);

function icon(name, fallback = 'sparkles') {
  const p = ICONS[name] || ICONS[fallback];
  return `<span class="ic" aria-hidden="true"><svg viewBox="0 0 24 24">${p}</svg></span>`;
}

// Tô màu cụm từ nhấn mạnh (lần xuất hiện đầu tiên) — escape từng phần, không ghép HTML thô.
function hl(text, highlight) {
  const t = String(text ?? '');
  const h = String(highlight ?? '').trim();
  const idx = h ? t.indexOf(h) : -1;
  if (idx < 0) return esc(t);
  return `${esc(t.slice(0, idx))}<em class="hl">${esc(h)}</em>${esc(t.slice(idx + h.length))}`;
}

function maxCols(W) {
  return Math.max(2, Math.min(6, Math.round((W - 2 * PAD_X) / 560)));
}
// Chọn số cột sao cho các hàng lấp đều (không để 1 thẻ lẻ loi nếu tránh được).
function gridCols(n, W, cap = 99) {
  const m = Math.min(cap, maxCols(W));
  if (n <= m) return Math.max(1, n);
  const rows = Math.ceil(n / m);
  return Math.ceil(n / rows);
}

function media(ref, ctx, o = {}) {
  const url = ref && ref.asset ? ctx.assetUrl(ref.asset) : null;
  const fit = ref && ref.fit === 'contain' ? 'contain' : 'cover';
  const cap = o.caption !== undefined ? o.caption : ref && ref.caption;
  const inner = url
    ? `<img src="${esc(url)}" alt="${esc(ref.alt || '')}" style="object-fit:${fit}"${fit === 'cover' ? ' data-loop="kb" data-p="20"' : ''}>`
    : `<div class="ph">${icon('image')}</div>`;
  return `<figure class="media ${o.cls || ''}" data-a="${o.anim || 'zoom'}" data-d="${o.d ?? 10}">${inner}${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`;
}

function head(s, ctx, { sub = true } = {}) {
  const k = s.kicker
    ? `<div class="kicker" data-a="left" data-d="0"><span class="num">${pad2(ctx.index + 1)}</span><span>${esc(s.kicker)}</span></div>`
    : '';
  const t = s.title ? `<h2 class="title" data-a="words" data-d="4" data-s="2">${hl(s.title, s.highlight)}</h2>` : '';
  const st = sub && s.subtitle ? `<p class="sub" data-a="up" data-d="16" data-dist="40">${esc(s.subtitle)}</p>` : '';
  return k || t || st ? `<header class="hd">${k}${t}${st}</header>` : '';
}

function chips(tags, d0) {
  const t = list(tags);
  if (!t.length) return '';
  return `<div class="chips">${t.map((x, i) => `<span class="chip" data-a="pop" data-d="${d0 + i * 4}">${esc(x)}</span>`).join('')}</div>`;
}

function itemText(it) {
  return `<h4>${esc(it.title)}</h4>${it.text ? `<p>${esc(it.text)}</p>` : ''}`;
}

function coreArt(ctx, iconName) {
  const id = `g${ctx.index}`;
  return `<div class="cv-art" data-a="zoom" data-d="6"><svg viewBox="0 0 900 900" aria-hidden="true">
<defs><radialGradient id="${id}c"><stop offset="0" style="stop-color:var(--core)"/><stop offset=".38" style="stop-color:var(--accent)"/><stop offset=".78" style="stop-color:var(--accent-2);stop-opacity:.5"/><stop offset="1" style="stop-color:var(--accent-2);stop-opacity:0"/></radialGradient></defs>
<circle cx="450" cy="450" r="436" fill="none" style="stroke:var(--line-2)" stroke-width="2" stroke-dasharray="2 16" data-loop="spin" data-p="90"/>
<circle cx="450" cy="450" r="352" fill="none" style="stroke:var(--accent-2)" stroke-opacity=".6" stroke-width="3" stroke-dasharray="190 40 10 40" data-loop="spin" data-p="40" data-dir="-1"/>
<circle cx="450" cy="450" r="268" fill="none" style="stroke:var(--accent-2)" stroke-opacity=".45" stroke-width="2"/>
<circle cx="450" cy="450" r="190" fill="none" style="stroke:var(--accent)" stroke-width="4" stroke-dasharray="70 22" data-loop="spin" data-p="16"/>
<circle cx="450" cy="450" r="250" fill="url(#${id}c)" opacity=".28" data-loop="pulse" data-p="4" data-amp="6"/>
<circle cx="450" cy="450" r="140" fill="url(#${id}c)" data-loop="pulse" data-p="3" data-amp="4"/>
<g data-loop="spin" data-p="20"><circle cx="450" cy="450" r="352" fill="none"/><circle cx="802" cy="450" r="12" style="fill:var(--accent)"/></g>
<g data-loop="spin" data-p="32" data-dir="-1"><circle cx="450" cy="450" r="268" fill="none"/><circle cx="182" cy="450" r="10" style="fill:var(--amber)"/></g>
<g data-loop="spin" data-p="55"><circle cx="450" cy="450" r="436" fill="none"/><circle cx="450" cy="14" r="8" style="fill:var(--mint)"/></g>
</svg><div class="cv-ico">${icon(iconName)}</div></div>`;
}

/* ---------------- layouts ---------------- */
const L = {
  cover(s, ctx) {
    const right = s.image && s.image.asset ? media(s.image, ctx, { d: 14 }) : coreArt(ctx, s.icon);
    return `<div class="body"><div class="cv"><div class="cv-l">
${s.kicker ? `<div class="live" data-a="left" data-d="0"><i></i>${esc(s.kicker)}</div>` : ''}
<h1 class="cv-title" data-a="words" data-d="6" data-s="3">${hl(s.title, s.highlight)}</h1>
${s.subtitle ? `<p class="cv-sub" data-a="up" data-d="24" data-dist="40">${esc(s.subtitle)}</p>` : ''}
${chips(s.tags, 32)}
${s.caption ? `<div class="cv-cap" data-a="fade" data-d="44">${esc(s.caption)}</div>` : ''}
</div>${right}</div></div>`;
  },

  section(s, ctx) {
    const img = s.image && s.image.asset;
    return `<div class="body"><div class="sec${img ? ' has-media' : ''}">
<div class="sec-no" data-a="zoom" data-d="0">${pad2(ctx.sectionNo)}</div>
<div class="sec-c">${s.kicker ? `<div class="kicker" data-a="left" data-d="6"><span>${esc(s.kicker)}</span></div>` : ''}
<h2 class="sec-t" data-a="words" data-d="8" data-s="3">${hl(s.title, s.highlight)}</h2>
${s.subtitle ? `<p class="sub" data-a="up" data-d="24" data-dist="40">${esc(s.subtitle)}</p>` : ''}${chips(s.tags, 32)}</div>
${img ? media(s.image, ctx, { d: 16 }) : ''}</div></div>`;
  },

  agenda(s, ctx) {
    const items = list(s.items);
    const cols = Math.max(1, Math.min(gridCols(items.length, ctx.W, 3), Math.ceil(items.length / 3)));
    return `${head(s, ctx)}<div class="body"><div class="ag" style="--cols:${cols}">${items
      .map((it, i) => `<div class="ag-i" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}"><span class="ag-n">${pad2(i + 1)}</span><div>${itemText(it)}</div></div>`)
      .join('')}</div></div>`;
  },

  bullets(s, ctx) {
    const items = list(s.items);
    const img = s.image && s.image.asset;
    const wideCols = Math.max(1, Math.round((ctx.W - 2 * PAD_X) / 1050));
    // ≤3 ý: 1 cột (đọc dọc dễ hơn bố cục 2+1 lệch); nhiều hơn: chia cột theo độ rộng khung.
    const cols = img ? Math.max(1, wideCols - 2) : items.length <= 3 ? 1 : Math.min(items.length, wideCols);
    const bl = `<div class="bl${!img && cols === 1 ? ' narrow' : ''}" style="--cols:${cols}">${items
      .map((it, i) => `<div class="bi" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}"><span class="ib">${icon(it.icon)}</span><div>${itemText(it)}${it.value ? `<span class="tag">${esc(it.value)}</span>` : ''}</div></div>`)
      .join('')}</div>`;
    return `${head(s, ctx)}<div class="body">${img ? `<div class="split">${bl}${media(s.image, ctx, { d: 14 })}</div>` : bl}</div>`;
  },

  cards(s, ctx) {
    const items = list(s.items);
    const cols = gridCols(items.length, ctx.W);
    return `${head(s, ctx)}<div class="body"><div class="cards" style="--cols:${cols}">${items
      .map((it, i) => `<div class="panel card${i === 0 && items.length > 2 ? ' hot' : ''}" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}"><span class="ib">${icon(it.icon)}</span>${itemText(it)}${it.value ? `<span class="tag">${esc(it.value)}</span>` : ''}</div>`)
      .join('')}</div></div>`;
  },

  stats(s, ctx) {
    const stats = list(s.stats);
    const cols = gridCols(stats.length, ctx.W, 4);
    const html = stats
      .map((st, i) => {
        const num = typeof st.value === 'number' && Number.isFinite(st.value);
        const dec = num ? Math.min(2, (String(st.value).split('.')[1] || '').length) : 0;
        const val = num
          ? `<span data-a="count" data-to="${st.value}" data-dec="${dec}" data-d="${20 + i * 6}">${esc(new Intl.NumberFormat('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(st.value))}</span>`
          : `<span>${esc(st.value)}</span>`;
        return `<div class="panel stat" style="${accent(i)}" data-a="up" data-d="${14 + i * 6}"><div class="sv">${st.prefix ? `<small>${esc(st.prefix)}</small>` : ''}${val}${st.suffix ? `<small>${esc(st.suffix)}</small>` : ''}</div><p>${esc(st.label)}</p></div>`;
      })
      .join('');
    const items = list(s.items);
    const note = items.length
      ? `<div class="bl stats-note" style="--cols:${Math.min(items.length, maxCols(ctx.W))}">${items
          .map((it, i) => `<div class="bi" style="${accent(i + 2)}" data-a="up" data-d="${40 + i * 5}"><span class="ib">${icon(it.icon)}</span><div>${itemText(it)}</div></div>`)
          .join('')}</div>`
      : '';
    return `${head(s, ctx)}<div class="body"><div class="stats" style="--cols:${cols}">${html}</div>${note}</div>`;
  },

  image(s, ctx) {
    const items = list(s.items);
    const side = items.length
      ? `<div class="bl" style="--cols:1">${items
          .map((it, i) => `<div class="bi" style="${accent(i)}" data-a="left" data-d="${22 + i * 5}"><span class="ib">${icon(it.icon)}</span><div>${itemText(it)}</div></div>`)
          .join('')}</div>`
      : '';
    return `${head(s, ctx)}<div class="body"><div class="im${side ? ' has-side' : ''}">${media(s.image, ctx, { d: 10, caption: s.caption })}${side}</div></div>`;
  },

  gallery(s, ctx) {
    const imgs = list(s.images);
    const n = Math.max(1, imgs.length);
    const ratio = ctx.W / ctx.H;
    const cols = n <= 3 ? n : n === 4 ? (ratio >= 2.5 ? 4 : 2) : Math.min(gridCols(n, ctx.W, ratio >= 2.5 ? 4 : 3), n);
    const rows = Math.ceil(n / cols);
    return `${head(s, ctx)}<div class="body"><div class="gal" style="--cols:${cols};--rows:${rows}">${imgs
      .map((im, i) => media(im, ctx, { d: 14 + i * 5, anim: 'pop' }))
      .join('')}</div></div>`;
  },

  timeline(s, ctx) {
    const steps = list(s.steps);
    const per = maxCols(ctx.W) + 1;
    const cols = steps.length <= per ? Math.max(1, steps.length) : Math.ceil(steps.length / Math.ceil(steps.length / per));
    return `${head(s, ctx)}<div class="body"><div class="tl" style="--cols:${cols}">${steps
      .map((st, i) => {
        const rowEnd = (i + 1) % cols === 0 || i === steps.length - 1;
        return `<div class="tl-step" style="${accent(i)}"><div class="tl-dotrow"><i class="tl-dot" data-a="pop" data-d="${14 + i * 7}"></i>${rowEnd ? '' : `<i class="tl-seg" data-a="bar" data-to="100" data-d="${18 + i * 7}"></i>`}</div>
${st.value ? `<span class="label" data-a="up" data-d="${18 + i * 7}" data-dist="30">${esc(st.value)}</span>` : ''}<div data-a="up" data-d="${20 + i * 7}" data-dist="40">${itemText(st)}</div></div>`;
      })
      .join('')}</div></div>`;
  },

  process(s, ctx) {
    const steps = list(s.steps);
    const cols = gridCols(steps.length, ctx.W, 4);
    return `${head(s, ctx)}<div class="body"><div class="proc" style="--cols:${cols}">${steps
      .map((st, i) => {
        const rowEnd = (i + 1) % cols === 0 || i === steps.length - 1;
        return `<div class="panel ps" style="${accent(i)}" data-a="up" data-d="${18 + i * 7}"><span class="ps-n">${pad2(i + 1)}</span>${st.value ? `<span class="label">${esc(st.value)}</span>` : ''}${itemText(st)}${rowEnd ? '' : `<span class="arr">${icon('arrow')}</span>`}</div>`;
      })
      .join('')}</div></div>`;
  },

  quote(s, ctx) {
    const q = s.quote || {};
    const img = s.image && s.image.asset;
    return `${s.title || s.kicker ? head(s, ctx, { sub: false }) : ''}<div class="body"><div class="qt${img ? ' has-media' : ''}"><div class="qt-c">
<div class="qt-mark" data-a="pop" data-d="0">“</div>
<blockquote class="qt-text" data-a="words" data-d="8" data-s="2">${esc(q.text || s.subtitle || '')}</blockquote>
${q.author ? `<div class="qt-by" data-a="up" data-d="40" data-dist="30"><b>${esc(q.author)}</b>${q.role ? `<span>${esc(q.role)}</span>` : ''}</div>` : ''}
</div>${img ? media(s.image, ctx, { d: 16 }) : ''}</div></div>`;
  },

  comparison(s, ctx) {
    const cols = list(s.columns).slice(0, 3);
    const two = cols.length === 2;
    const toneIcon = { neg: 'x', pos: 'check', neutral: 'arrow' };
    const toneColor = { neg: 'coral', pos: 'mint', neutral: 'blue' };
    const colHtml = (c, i) => {
      const tone = toneIcon[c.tone] ? c.tone : i === cols.length - 1 ? 'pos' : 'neutral';
      return `<div class="panel col${tone === 'pos' ? ' hot' : ''}" style="--c:var(--${toneColor[tone]})" data-a="${two ? (i === 0 ? 'left' : 'right') : 'up'}" data-d="${16 + i * 8}">
${c.subtitle ? `<span class="label">${esc(c.subtitle)}</span>` : ''}<h3>${esc(c.title)}</h3>
<ul class="pts">${list(c.points).map((p) => `<li>${icon(toneIcon[tone])}<span>${esc(p)}</span></li>`).join('')}</ul></div>`;
    };
    const inner = two
      ? `${colHtml(cols[0], 0)}<div class="vs" data-a="pop" data-d="30">VS</div>${colHtml(cols[1], 1)}`
      : cols.map(colHtml).join('');
    return `${head(s, ctx)}<div class="body"><div class="cmp${two ? ' two' : ''}" style="--cols:${Math.max(1, cols.length)}">${inner}</div></div>`;
  },

  closing(s, ctx) {
    return `<div class="body"><div class="cl">
${s.kicker ? `<div class="kicker" data-a="up" data-d="0"><span>${esc(s.kicker)}</span></div>` : ''}
<h2 class="cl-t" data-a="zoom" data-d="4">${esc(s.title)}</h2>
${s.subtitle ? `<p class="cl-sub" data-a="up" data-d="20" data-dist="40">${esc(s.subtitle)}</p>` : ''}
${chips(s.tags, 28)}
${s.caption ? `<div class="cv-cap" data-a="fade" data-d="40">${esc(s.caption)}</div>` : ''}
</div></div>`;
  },
};

// Vị trí quầng sáng trang trí: xác định theo số thứ tự slide (cùng spec → cùng hình).
function glows(i, W) {
  const a = [
    [0.78, -0.15, 1100, 'accent'],
    [-0.12, 0.62, 900, 'accent-2'],
    [0.55, 0.7, 1000, 'violet'],
    [0.05, -0.2, 800, 'amber'],
  ];
  const g1 = a[i % a.length];
  const g2 = a[(i + 2) % a.length];
  return [g1, g2]
    .map(([x, y, size, c], k) => `<div class="glow" style="--c:var(--${c});left:${Math.round(x * W)}px;top:${Math.round(y * 1440)}px;width:${size}px;height:${size}px" data-loop="float" data-p="${9 + k * 4}" data-amp="${30 + k * 10}" data-ph="${i}"></div>`)
    .join('');
}

const HUD_ICON = {
  prev: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  fs: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
};

/**
 * @param {object} spec  đặc tả đã qua sanitizeSpec
 * @param {object} opts  { ratio, mode:'present'|'print', assetUrl(id)→url|null, css, engineJs, fontCss, nonce, lang }
 */
export function renderDeckHtml(spec, opts) {
  const [W, H] = RATIO_SIZES[opts.ratio] || RATIO_SIZES['16:9'];
  const theme = THEMES.includes(spec.theme) ? spec.theme : 'midnight';
  const mode = opts.mode === 'print' ? 'print' : 'present';
  const nonce = opts.nonce ? ` nonce="${esc(opts.nonce)}"` : '';
  const slides = list(spec.slides);
  const total = slides.length;
  const footer = spec.footer || spec.title || '';
  let sectionNo = 0;

  const slideHtml = slides
    .map((s, index) => {
      if (s.layout === 'section') sectionNo += 1;
      const ctx = { W, H, index, total, sectionNo, assetUrl: opts.assetUrl || (() => null) };
      const fn = L[s.layout] || L.bullets;
      const ft =
        s.layout === 'cover'
          ? ''
          : `<div class="ft"><span>${esc(footer)}</span><span><b>${pad2(index + 1)}</b> / ${pad2(total)}</span></div>`;
      const label = `Trang ${index + 1}/${total}${s.title ? `: ${s.title}` : ''}`;
      return `<section class="slide L-${esc(s.layout)}" data-id="${esc(s.id)}" aria-label="${esc(label)}"><div class="sbg"></div>${glows(index, W)}${fn(s, ctx)}${ft}</section>`;
    })
    .join('\n');

  const hud =
    mode === 'present'
      ? `<div id="hud"><button id="prev" type="button" aria-label="Trang trước"><svg viewBox="0 0 24 24">${HUD_ICON.prev}</svg></button><span id="count">01 / ${pad2(total)}</span><button id="next" type="button" aria-label="Trang sau"><svg viewBox="0 0 24 24">${HUD_ICON.next}</svg></button><button id="fs" type="button" aria-label="Toàn màn hình"><svg viewBox="0 0 24 24">${HUD_ICON.fs}</svg></button></div><div id="bar"><i></i></div><div id="hint">← → để chuyển trang · F toàn màn hình</div>`
      : '';

  return `<!doctype html>
<html lang="${esc(opts.lang || 'vi')}" data-deck-theme="${theme}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="MISA Presentation">
<title>${esc(spec.title || 'Bài trình bày')}</title>
<style${nonce}>${opts.fontCss || ''}
:root{--W:${W}px;--H:${H}px}
${opts.css || ''}</style>
</head>
<body>
<div id="stage"><div id="deck" data-w="${W}" data-h="${H}" data-mode="${mode}"><canvas id="bg" aria-hidden="true"></canvas>
${slideHtml}
</div></div>
${hud}
<script${nonce}>${opts.engineJs || ''}</script>
</body>
</html>`;
}
