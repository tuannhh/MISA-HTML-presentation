// Renderer đặc tả bài trình bày (JSON) → 1 trang HTML hoàn chỉnh có chuyển động.
// Hàm thuần: không đọc file, không gọi mạng. CSS/engine/font do nơi gọi truyền vào (xem src/services/renderService.js).
// AN TOÀN: mọi chuỗi từ spec đều escape; icon chỉ lấy từ ICONS (hằng số tin cậy); URL ảnh/video do server cấp;
// mã YouTube đã được kiểm định dạng ở specService (11 ký tự [A-Za-z0-9_-]).
import { ICONS } from './icons.js';
import { THEME_PRESETS, CUSTOM_THEME, resolveTheme, themeVarsCss, inkVarsCss, presetsForTone } from './palette.js';
import { fontStack, DECK_FONTS, DEFAULT_FONT } from './fonts.js';
import { STYLES, resolveVariant } from './variants.js';
import { SPEC_LIMITS as LIM } from './limits.js';
import { TEXT_STYLES } from './free.js';
import { richHtml, plainText } from './rich.js';

export { VARIANTS, STYLES } from './variants.js';
import { NAMES_3D } from './bg3d.js';

export const RATIO_SIZES = Object.freeze({
  '16:9': [2560, 1440],
  '4:3': [1920, 1440],
  '2:1': [2880, 1440],
  '3:1': [4320, 1440],
});
// Bố cục AI được chọn khi dựng bài; 'free' (trang tự do — người dùng tự đặt phần tử) chỉ tạo từ trình soạn thảo.
export const AI_LAYOUTS = Object.freeze([
  'cover', 'section', 'agenda', 'bullets', 'cards', 'stats', 'image', 'gallery', 'timeline', 'process', 'quote', 'comparison', 'closing',
]);
export const LAYOUTS = Object.freeze([...AI_LAYOUTS, 'free']);
// Tông màu: các bảng màu dựng sẵn (palette.js) + 'custom' (người dùng nhập 2 màu, xem spec.palette).
export const THEMES = Object.freeze([...Object.keys(THEME_PRESETS), CUSTOM_THEME]);
// Tông nền người dùng chọn khi tạo bài → AI chỉ được chọn theme trong nhóm tương ứng (phần tử đầu = mặc định).
export const TONE_THEMES = Object.freeze({
  dark: Object.freeze(presetsForTone('dark')),
  light: Object.freeze(presetsForTone('light')),
});
// Mẫu nền chuyển động (vẽ bằng canvas trong shared/deck/backgrounds.js) — 'none' = chỉ nền màu chuyển sắc.
export const BACKGROUNDS = Object.freeze(['network', 'circuit', 'grid', 'matrix', 'waves', 'hex', 'dots', 'orbits', 'particles', 'radar', ...NAMES_3D, 'none']);
// Bố cục có ô media (1 ảnh hoặc 1 video) — gallery có ô nhiều ảnh riêng.
// Trình chiếu: auto (mặc định, không lưu) · step (từng ý khi bấm) · dim (từng ý + làm mờ ý trước) · tour (phóng lần lượt từng ý).
export const BUILDS = Object.freeze(['step', 'dim', 'tour']);
export const MEDIA_LAYOUTS = Object.freeze(['cover', 'section', 'bullets', 'image', 'quote']);
export const LOGO_POSITIONS = Object.freeze(['tl', 'tc', 'tr', 'bl', 'bc', 'br']);
export const LOGO_SHOW = Object.freeze(['all', 'cover', 'inner']);
export const LOGO_SIZE = Object.freeze({ min: 40, max: 360, def: 110 });
// Ô ảnh của bộ nhận diện thương hiệu (spec.brand): nền trang bìa / trang nội dung / trang mở đầu phần / trang kết, dải đầu & chân trang.
export const BRAND_SLOTS = Object.freeze(['cover', 'page', 'section', 'closing', 'header', 'footer']);

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

// Chữ có định dạng (màu, đậm, giữ liền, xuống dòng — shared/deck/rich.js) + cụm từ nhấn mạnh (lần xuất hiện đầu tiên).
// richHtml escape toàn bộ chữ; chỉ ghép thẻ từ thuộc tính đã kiểm.
const hl = (text, highlight) => richHtml(text, highlight);
const rt = (text) => richHtml(text);

// Chế độ sửa trực tiếp (mode 'edit', chỉ khung xem trước của trình soạn thảo): gắn đường dẫn trường spec vào phần tử chữ
// (data-e) → engine bật contenteditable và gửi nội dung sửa về ứng dụng. ml = cho phép nhiều dòng. Bản xuất không có thuộc tính này.
// pl = trường chữ thuần (số liệu, chân trang): không có thanh định dạng, giữ nguyên ký tự gõ vào.
function E(ctx, path, max, ml = false, pl = false) {
  return ctx.edit ? ` data-e="${esc(path)}" data-max="${max}"${ml ? ' data-ml=""' : ''}${pl ? ' data-pl=""' : ''}` : '';
}
// Ô media bấm được để đổi ảnh/video (chế độ sửa): path = 'slot' (ô media của trang) | 'images.N' | 'elements.<id>'.
const M = (ctx, path) => (ctx.edit ? ` data-m="${esc(path)}"` : '');

// Vị trí ảnh trong khung + phóng to (người dùng chỉnh trong trình sửa ảnh) — CSS thuần, khung giữ nguyên.
// Dùng thuộc tính `scale` (không phải transform) để không xung đột hiệu ứng Ken Burns của engine (ghi đè transform).
function imgPos(ref) {
  if (!ref) return '';
  const p = ref.pos && Number.isFinite(ref.pos.x) && Number.isFinite(ref.pos.y) ? ref.pos : null;
  const z = Number.isFinite(ref.zoom) && ref.zoom > 1 ? ref.zoom : 0;
  const at = p ? `${p.x}% ${p.y}%` : '';
  return `${at ? `object-position:${at};` : ''}${z ? `scale:${z};transform-origin:${at || '50% 50%'};` : ''}`;
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

// Ảnh trọn khung (ảnh giao diện phần mềm, infographic, PNG nền trong suốt): đặt trên tấm nền trắng đúng tỷ lệ ảnh, căn giữa ô —
// rõ trên cả nền tối, không cắt mất thông tin; ảnh giao diện máy tính có thêm thanh trình duyệt. Tỷ lệ lấy từ kích thước asset.
function plate(ref, url, cap, ctx, o) {
  const m = ctx.assetMeta ? ctx.assetMeta(ref.asset) : null;
  const ar = m && m.width > 0 && m.height > 0 ? Math.min(4, Math.max(0.3, m.width / m.height)) : 1.6;
  const web = ref.frame === 'browser';
  const bar = web ? '<div class="pbar" aria-hidden="true"><i></i><i></i><i></i></div>' : '';
  const st = imgPos(ref);
  return `<div class="vbox" data-a="${o.anim || 'zoom'}" data-d="${o.d ?? 10}"><figure class="media plate${web ? ' web' : ''}${cap ? ' cap' : ''}" style="--ar:${ar.toFixed(4)}"${M(ctx, o.mp)}>${bar}<div class="pimg"><img src="${esc(url)}" alt="${esc(ref.alt || '')}"${st ? ` style="${st}"` : ''}></div>${
    cap ? `<figcaption${E(ctx, o.capPath, LIM.caption, true)}>${rt(cap)}</figcaption>` : ''
  }</figure></div>`;
}

// o.mp = đường dẫn ô media (chế độ sửa), o.capPath = đường dẫn chú thích (mặc định chú thích của chính ảnh).
function media(ref, ctx, o = {}) {
  const url = ref && ref.asset ? ctx.assetUrl(ref.asset) : null;
  const fit = ref && ref.fit === 'contain' ? 'contain' : 'cover';
  const cap = o.caption !== undefined ? o.caption : ref && ref.caption;
  if (url && fit === 'contain') return plate(ref, url, cap, ctx, o);
  // Ken Burns chỉ khi chưa phóng to tay (zoom tay = người dùng đã chọn khuôn hình cố định).
  const kb = fit === 'cover' && !(ref.zoom > 1);
  const inner = url
    ? `<img src="${esc(url)}" alt="${esc(ref.alt || '')}" style="object-fit:${fit};${imgPos(ref)}"${kb ? ' data-loop="kb" data-p="20"' : ''}>`
    : `<div class="ph">${icon('image')}</div>`;
  return `<figure class="media ${o.cls || ''}" data-a="${o.anim || 'zoom'}" data-d="${o.d ?? 10}"${M(ctx, o.mp)}>${inner}${cap ? `<figcaption${E(ctx, o.capPath, LIM.caption, true)}>${rt(cap)}</figcaption>` : ''}</figure>`;
}

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
const hasMedia = (s) => !!(s.video || (s.image && s.image.asset));

// Video (tải lên hoặc YouTube): ảnh bìa 16:9 + nút phát. Bấm → engine mở video toàn màn hình, tự phát.
// Không nhúng trình phát ngay trong slide: trang nhẹ, in PDF/thumbnail vẫn đẹp, không tải YouTube khi chưa cần.
function videoFig(v, ctx, o = {}) {
  const poster = v.poster ? ctx.assetUrl(v.poster) : null;
  const label = v.title || v.caption || (v.provider === 'youtube' ? 'Video YouTube' : 'Video');
  let src = '';
  if (v.provider === 'youtube') src = ` data-vp="youtube" data-vid="${esc(v.id)}"`;
  else {
    const embed = ctx.videoEmbed ? ctx.videoEmbed(v.asset) : null;
    const url = embed ? null : ctx.assetUrl(v.asset);
    src = embed ? ` data-vp="file" data-embed="${esc(embed)}"` : url ? ` data-vp="file" data-src="${esc(url)}"` : ' data-vp="none"';
  }
  const cap = o.caption !== undefined ? o.caption : v.caption;
  return `<div class="vbox" data-a="${o.anim || 'zoom'}" data-d="${o.d ?? 10}"><figure class="media vid"${src} data-title="${esc(plainText(label))}"${M(ctx, o.mp)}>${
    poster ? `<img src="${esc(poster)}" alt="${esc(v.title || '')}">` : `<div class="ph">${icon('play')}</div>`
  }<button class="vplay" type="button" aria-label="Phát video: ${esc(plainText(label))}">${PLAY}</button>${
    v.provider === 'youtube' ? '<span class="vbadge">YouTube</span>' : ''
  }${cap ? `<figcaption${E(ctx, o.capPath, LIM.caption, true)}>${rt(cap)}</figcaption>` : ''}</figure></div>`;
}

// Ô media của slide: video ưu tiên hơn ảnh (1 trang chỉ phát 1 video).
const slot = (s, ctx, o) => {
  const opt = { mp: 'slot', capPath: o.caption !== undefined ? 'caption' : s.video ? 'video.caption' : 'image.caption', ...o };
  return s.video ? videoFig(s.video, ctx, opt) : media(s.image, ctx, opt);
};

function head(s, ctx, { sub = true } = {}) {
  const k = s.kicker
    ? `<div class="kicker" data-a="left" data-d="0"><span class="num">${pad2(ctx.index + 1)}</span><span${E(ctx, 'kicker', LIM.kicker)}>${rt(s.kicker)}</span></div>`
    : '';
  const t = s.title ? `<h2 class="title" data-a="words" data-d="4" data-s="2"${E(ctx, 'title', LIM.title, true)}>${hl(s.title, s.highlight)}</h2>` : '';
  const st = sub && s.subtitle ? `<p class="sub" data-a="up" data-d="16" data-dist="40"${E(ctx, 'subtitle', LIM.subtitle, true)}>${rt(s.subtitle)}</p>` : '';
  return k || t || st ? `<header class="hd">${k}${t}${st}</header>` : '';
}

function chips(tags, d0, ctx) {
  const t = list(tags);
  if (!t.length) return '';
  return `<div class="chips">${t.map((x, i) => `<span class="chip" data-a="pop" data-d="${d0 + i * 4}"${E(ctx, `tags.${i}`, LIM.tag)}>${rt(x)}</span>`).join('')}</div>`;
}

// p = đường dẫn phần tử (vd. 'items.2') cho chế độ sửa.
function itemText(it, ctx, p) {
  return `<h4${E(ctx, `${p}.title`, LIM.itemTitle, true)}>${rt(it.title)}</h4>${it.text ? `<p${E(ctx, `${p}.text`, LIM.itemText, true)}>${rt(it.text)}</p>` : ''}`;
}
// Biểu tượng của thẻ/ý: ảnh/logo người dùng gắn (items[i].image) thay icon. Chế độ sửa: bấm biểu tượng để gắn/đổi ảnh.
function mark(it, ctx, p, fallback) {
  const url = it.image && it.image.asset ? ctx.assetUrl(it.image.asset) : null;
  if (url) return `<span class="ib ib-img${it.image.fit === 'cover' ? ' is-cover' : ''}"${M(ctx, `${p}.image`)}><img src="${esc(url)}" alt="${esc(it.image.alt || plainText(it.title))}"></span>`;
  const html = fallback || `<span class="ib">${icon(it.icon)}</span>`;
  return ctx.edit && p.startsWith('items.') ? html.replace(/^<span class="(ib[^"]*)"/, `<span class="$1"${M(ctx, `${p}.image`)}`) : html;
}
const valueTag = (it, ctx, p) => (it.value ? `<span class="tag"${E(ctx, `${p}.value`, LIM.itemValue)}>${rt(it.value)}</span>` : '');

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
// Mỗi bố cục nhận biến thể v (shared/deck/variants.js, đã kiểm tra hợp nội dung); v mặc định = giao diện gốc.

// Ảnh tràn toàn trang (đặt ngoài .body, nằm dưới nội dung) — CSS phủ lớp tối + đổi chữ sang trắng cho dễ đọc.
function bleed(img, ctx) {
  const url = img && img.asset ? ctx.assetUrl(img.asset) : null;
  const kb = !(img && img.zoom > 1);
  return url ? `<div class="bleed"${M(ctx, 'slot')}><img src="${esc(url)}" alt="${esc(img.alt || '')}" style="${imgPos(img)}"${kb ? ' data-loop="kb" data-p="24"' : ''}></div>` : '';
}

// Độ dài từ dài nhất (ký tự) — co cỡ chữ mốc thời gian để "T12/2026" không bị ngắt giữa từ trong thẻ hẹp.
const longestWord = (list) => Math.max(4, ...list.map((t) => Math.max(0, ...String(t).split(/\s+/).map((w) => w.length))));

function statValue(st, d, ctx, p) {
  const num = typeof st.value === 'number' && Number.isFinite(st.value);
  const dec = num ? Math.min(2, (String(st.value).split('.')[1] || '').length) : 0;
  const shown = num ? new Intl.NumberFormat('vi-VN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(st.value) : String(st.value);
  // Chế độ sửa: số hiển thị đã định dạng (270.000), khi sửa engine đổi sang giá trị thô (data-raw) rồi định dạng lại khi rời ô.
  const ev = ctx && ctx.edit ? `${E(ctx, `${p}.value`, LIM.statText, false, true)} data-raw="${esc(String(st.value))}"` : '';
  const val = num ? `<span data-a="count" data-to="${st.value}" data-dec="${dec}" data-d="${d}"${ev}>${esc(shown)}</span>` : `<span${ev}>${esc(shown)}</span>`;
  // Độ dài hiển thị (ký tự; tiền tố/hậu tố cỡ .42em) → CSS co cỡ số theo bề rộng thẻ, "270.000+" không bị cắt ở lưới 4 cột.
  const sl = Math.max(3, shown.length + 0.45 * (String(st.prefix || '').length + String(st.suffix || '').length));
  return `<div class="sv" style="--sl:${Math.round(sl * 10) / 10}">${st.prefix ? `<small${E(ctx || {}, `${p}.prefix`, LIM.statPrefix, false, true)}>${esc(st.prefix)}</small>` : ''}${val}${st.suffix ? `<small${E(ctx || {}, `${p}.suffix`, LIM.statSuffix, false, true)}>${esc(st.suffix)}</small>` : ''}</div>`;
}

// Danh sách dọc có trục nối (dòng thời gian dọc, quy trình dọc): cột nhãn | trục chấm | nội dung.
function railList(steps, label, ctx, editValue) {
  return `<div class="tlv">${steps
    .map((st, i) => `<div class="tlv-i" style="${accent(i)}"><span class="tlv-v" data-a="up" data-d="${16 + i * 7}" data-dist="30"${editValue && st.value ? E(ctx, `steps.${i}.value`, LIM.itemValue) : ''}>${rt(label(st, i))}</span><div class="tlv-rail"><i class="tl-dot" data-a="pop" data-d="${14 + i * 7}"></i><i class="tlv-ln"></i></div><div class="tlv-c" data-a="left" data-d="${18 + i * 7}">${itemText(st, ctx, `steps.${i}`)}</div></div>`)
    .join('')}</div>`;
}

const L = {
  cover(s, ctx, v) {
    const m = hasMedia(s);
    const txt = `<div class="cv-l">
${s.kicker ? `<div class="live" data-a="left" data-d="0"><i></i><span${E(ctx, 'kicker', LIM.kicker)}>${rt(s.kicker)}</span></div>` : ''}
<h1 class="cv-title" data-a="words" data-d="6" data-s="3"${E(ctx, 'title', LIM.title, true)}>${hl(s.title, s.highlight)}</h1>
${s.subtitle ? `<p class="cv-sub" data-a="up" data-d="24" data-dist="40"${E(ctx, 'subtitle', LIM.subtitle, true)}>${rt(s.subtitle)}</p>` : ''}
${chips(s.tags, 32, ctx)}
${s.caption ? `<div class="cv-cap" data-a="fade" data-d="44"${E(ctx, 'caption', LIM.caption, true)}>${rt(s.caption)}</div>` : ''}
</div>`;
    // center: chữ giữa trang; có ảnh → ảnh tràn nền, không có → hình minh hoạ mờ phía sau.
    if (v === 'center') return `${m ? bleed(s.image, ctx) : ''}<div class="body"><div class="cv">${m ? '' : `<div class="cv-ghost">${coreArt(ctx, s.icon)}</div>`}${txt}</div></div>`;
    const art = m ? slot(s, ctx, { d: 14 }) : coreArt(ctx, s.icon);
    return `<div class="body"><div class="cv">${v === 'mirror' ? art + txt : txt + art}</div></div>`;
  },

  section(s, ctx) {
    const img = hasMedia(s);
    // Các biến thể (center/band/ghost) chỉ khác cách đặt số thứ tự phần → xử lý bằng CSS.
    return `<div class="body"><div class="sec${img ? ' has-media' : ''}">
<div class="sec-no" data-a="zoom" data-d="0">${pad2(ctx.sectionNo)}</div>
<div class="sec-c">${s.kicker ? `<div class="kicker" data-a="left" data-d="6"><span${E(ctx, 'kicker', LIM.kicker)}>${rt(s.kicker)}</span></div>` : ''}
<h2 class="sec-t" data-a="words" data-d="8" data-s="3"${E(ctx, 'title', LIM.title, true)}>${hl(s.title, s.highlight)}</h2>
${s.subtitle ? `<p class="sub" data-a="up" data-d="24" data-dist="40"${E(ctx, 'subtitle', LIM.subtitle, true)}>${rt(s.subtitle)}</p>` : ''}${chips(s.tags, 32, ctx)}</div>
${img ? slot(s, ctx, { d: 16 }) : ''}</div></div>`;
  },

  agenda(s, ctx, v) {
    const items = list(s.items);
    const row = (it, i) => `<div class="ag-i" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}"><span class="ag-n">${pad2(i + 1)}</span><div>${itemText(it, ctx, `items.${i}`)}</div></div>`;
    if (v === 'tiles') {
      return `${head(s, ctx)}<div class="body"><div class="tiles" style="--cols:${gridCols(items.length, ctx.W, 4)}">${items
        .map((it, i) => `<div class="panel tile" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}"><span class="ag-n">${pad2(i + 1)}</span>${itemText(it, ctx, `items.${i}`)}</div>`)
        .join('')}</div></div>`;
    }
    if (v === 'split') return `<div class="body"><div class="hsplit">${head(s, ctx)}<div class="ag" style="--cols:1">${items.map(row).join('')}</div></div></div>`;
    if (v === 'path') {
      return `${head(s, ctx)}<div class="body"><div class="path" style="--cols:${items.length}">${items
        .map((it, i) => `<div class="path-i" style="${accent(i)}"><div class="path-row"><span class="path-dot" data-a="pop" data-d="${14 + i * 7}">${pad2(i + 1)}</span>${i < items.length - 1 ? `<i class="path-seg" data-a="bar" data-to="100" data-d="${18 + i * 7}"></i>` : ''}</div><div data-a="up" data-d="${20 + i * 7}" data-dist="40">${itemText(it, ctx, `items.${i}`)}</div></div>`)
        .join('')}</div></div>`;
    }
    const cols = Math.max(1, Math.min(gridCols(items.length, ctx.W, 3), Math.ceil(items.length / 3)));
    return `${head(s, ctx)}<div class="body"><div class="ag" style="--cols:${cols}">${items.map(row).join('')}</div></div>`;
  },

  bullets(s, ctx, v) {
    const items = list(s.items);
    const img = hasMedia(s);
    const mk = (it, i) => (v === 'numbered' && !it.image ? `<span class="bn">${pad2(i + 1)}</span>` : v === 'checks' && !it.image ? `<span class="ib ck">${icon('check')}</span>` : mark(it, ctx, `items.${i}`));
    const one = (it, i) => `<div class="bi${v === 'panels' ? ' panel' : ''}" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}">${mk(it, i)}<div>${itemText(it, ctx, `items.${i}`)}${valueTag(it, ctx, `items.${i}`)}</div></div>`;
    if (v === 'split') return `<div class="body"><div class="hsplit">${head(s, ctx)}<div class="bl" style="--cols:1">${items.map(one).join('')}</div></div></div>`;
    const wideCols = Math.max(1, Math.round((ctx.W - 2 * PAD_X) / 1050));
    // ≤3 ý: 1 cột (đọc dọc dễ hơn bố cục 2+1 lệch); nhiều hơn: chia cột theo độ rộng khung.
    const cols = img ? Math.max(1, wideCols - 2) : items.length <= 3 ? 1 : v === 'panels' ? Math.min(2, wideCols) : Math.min(items.length, wideCols);
    const bl = `<div class="bl${!img && cols === 1 ? ' narrow' : ''}" style="--cols:${cols}">${items.map(one).join('')}</div>`;
    return `${head(s, ctx)}<div class="body">${img ? `<div class="split">${bl}${slot(s, ctx, { d: 14 })}</div>` : bl}</div>`;
  },

  cards(s, ctx, v) {
    const items = list(s.items);
    const n = items.length;
    if (v === 'rows') {
      return `${head(s, ctx)}<div class="body"><div class="crows">${items
        .map((it, i) => `<div class="crow" style="${accent(i)}" data-a="left" data-d="${18 + i * 5}">${mark(it, ctx, `items.${i}`)}<h4${E(ctx, `items.${i}.title`, LIM.itemTitle, true)}>${rt(it.title)}</h4><p${E(ctx, `items.${i}.text`, LIM.itemText, true)}>${rt(it.text)}</p>${it.value ? valueTag(it, ctx, `items.${i}`) : '<span></span>'}</div>`)
        .join('')}</div></div>`;
    }
    // bento: thẻ đầu chiếm nhiều hàng (3 thẻ: 1+2 · 4 thẻ: 1+3 · 5 thẻ: 1 lớn + lưới 2×2).
    const bento = v === 'bento';
    const cols = bento ? (n === 5 ? 3 : 2) : gridCols(n, ctx.W);
    const style = bento ? `--cols:${cols};--span:${n === 5 ? 2 : n - 1}` : `--cols:${cols}`;
    return `${head(s, ctx)}<div class="body"><div class="cards${bento ? ' bento' : ''}" style="${style}">${items
      .map((it, i) => `<div class="panel card${i === 0 && n > 2 ? ' hot' : ''}" style="${accent(i)}" data-a="up" data-d="${18 + i * 5}">${v === 'numbered' && !it.image ? `<span class="cn">${pad2(i + 1)}</span>` : mark(it, ctx, `items.${i}`)}${itemText(it, ctx, `items.${i}`)}${valueTag(it, ctx, `items.${i}`)}</div>`)
      .join('')}</div></div>`;
  },

  stats(s, ctx, v) {
    const stats = list(s.stats);
    const items = list(s.items);
    const note = items.length
      ? `<div class="bl stats-note" style="--cols:${Math.min(items.length, maxCols(ctx.W))}">${items
          .map((it, i) => `<div class="bi" style="${accent(i + 2)}" data-a="up" data-d="${40 + i * 5}">${mark(it, ctx, `items.${i}`)}<div>${itemText(it, ctx, `items.${i}`)}</div></div>`)
          .join('')}</div>`
      : '';
    const SL = (i) => E(ctx, `stats.${i}.label`, LIM.statLabel, true);
    let main;
    if (v === 'hero') {
      const [a, ...rest] = stats;
      main = `<div class="st-h${rest.length ? '' : ' solo'}"><div class="st-hero" style="${accent(0)}" data-a="up" data-d="14">${statValue(a, 20, ctx, 'stats.0')}<p${SL(0)}>${rt(a.label)}</p></div>${
        rest.length ? `<div class="st-side">${rest.map((st, i) => `<div class="st-row" style="${accent(i + 1)}" data-a="left" data-d="${26 + i * 6}">${statValue(st, 30 + i * 6, ctx, `stats.${i + 1}`)}<p${SL(i + 1)}>${rt(st.label)}</p></div>`).join('')}</div>` : ''
      }</div>`;
    } else if (v === 'bars') {
      // Biểu đồ thanh ngang: độ dài theo giá trị lớn nhất (cùng đơn vị — xem variants.js).
      const max = Math.max(...stats.map((st) => st.value)) || 1;
      main = `<div class="st-bars">${stats
        .map((st, i) => `<div class="st-bar" style="${accent(i)}"><p data-a="up" data-d="${16 + i * 5}" data-dist="30"${SL(i)}>${rt(st.label)}</p><div class="st-track"><i class="st-fill" data-a="bar" data-to="${Math.max(2, Math.round((st.value / max) * 1000) / 10)}" data-d="${20 + i * 5}"></i></div>${statValue(st, 22 + i * 5, ctx, `stats.${i}`)}</div>`)
        .join('')}</div>`;
    } else if (v === 'rings') {
      main = `<div class="st-rings" style="--cols:${stats.length}">${stats
        .map((st, i) => `<div class="st-ring" style="${accent(i)}" data-a="up" data-d="${14 + i * 6}"><div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rg-bg"/><circle cx="60" cy="60" r="52" class="rg-fg" pathLength="100" stroke-dasharray="${st.value} 100" data-a="ring" data-to="${st.value}" data-dur="54" data-d="${20 + i * 6}"/></svg>${statValue(st, 20 + i * 6, ctx, `stats.${i}`)}</div><p${SL(i)}>${rt(st.label)}</p></div>`)
        .join('')}</div>`;
    } else {
      main = `<div class="stats${v === 'plain' ? ' plain' : ''}" style="--cols:${gridCols(stats.length, ctx.W, 4)}">${stats
        .map((st, i) => `<div class="panel stat" style="${accent(i)}" data-a="up" data-d="${14 + i * 6}">${statValue(st, 20 + i * 6, ctx, `stats.${i}`)}<p${SL(i)}>${rt(st.label)}</p></div>`)
        .join('')}</div>`;
    }
    return `${head(s, ctx)}<div class="body">${main}${note}</div>`;
  },

  image(s, ctx, v) {
    const items = list(s.items);
    const side = items.length
      ? `<div class="bl" style="--cols:1">${items
          .map((it, i) => `<div class="bi" style="${accent(i)}" data-a="left" data-d="${22 + i * 5}">${mark(it, ctx, `items.${i}`)}<div>${itemText(it, ctx, `items.${i}`)}</div></div>`)
          .join('')}</div>`
      : '';
    if (v === 'full') {
      return `${bleed(s.image, ctx)}${head(s, ctx)}<div class="body"><div class="im-full">${side ? `<div class="im-glass" data-a="up" data-d="18">${side}</div>` : ''}${s.caption ? `<div class="im-cap" data-a="fade" data-d="30"${E(ctx, 'caption', LIM.caption, true)}>${rt(s.caption)}</div>` : ''}</div></div>`;
    }
    const fig = slot(s, ctx, { d: 10, caption: s.caption });
    // Ảnh trọn khung rất ngang (bảng dữ liệu, dashboard) → cột ảnh rộng hơn để ảnh không bị thu nhỏ.
    const m = !s.video && s.image?.fit === 'contain' && ctx.assetMeta ? ctx.assetMeta(s.image.asset) : null;
    const wide = m && m.height > 0 && m.width / m.height >= 1.9 ? ' wide' : '';
    return `${head(s, ctx)}<div class="body"><div class="im${side ? ' has-side' : ''}${wide}${v === 'right' ? ' rev' : ''}">${v === 'right' ? side + fig : fig + side}</div></div>`;
  },

  gallery(s, ctx, v) {
    const imgs = list(s.images);
    const n = Math.max(1, imgs.length);
    if (v === 'polaroid') {
      const tilt = [-2.6, 1.8, -1.2, 2.4];
      return `${head(s, ctx)}<div class="body"><div class="pola-row" style="--cols:${n}">${imgs
        .map((im, i) => {
          const url = im.asset ? ctx.assetUrl(im.asset) : null;
          return `<figure class="pola" style="--rot:${tilt[i % tilt.length]}deg" data-a="pop" data-d="${14 + i * 6}"><div class="pola-i"${M(ctx, `images.${i}`)}>${url ? `<img src="${esc(url)}" alt="${esc(im.alt || '')}" style="${imgPos(im)}">` : `<div class="ph">${icon('image')}</div>`}</div>${im.caption ? `<figcaption${E(ctx, `images.${i}.caption`, LIM.caption, true)}>${rt(im.caption)}</figcaption>` : ''}</figure>`;
        })
        .join('')}</div></div>`;
    }
    const ratio = ctx.W / ctx.H;
    // mosaic: ảnh đầu chiếm ô 2×2 (3 ảnh: lưới 3×2 · 5 ảnh: lưới 4×2).
    const mosaic = v === 'mosaic';
    const cols = mosaic ? (n === 5 ? 4 : 3) : n <= 3 ? n : n === 4 ? (ratio >= 2.5 ? 4 : 2) : Math.min(gridCols(n, ctx.W, ratio >= 2.5 ? 4 : 3), n);
    const rows = mosaic ? 2 : Math.ceil(n / cols);
    return `${head(s, ctx)}<div class="body"><div class="gal${mosaic ? ' mosaic' : ''}" style="--cols:${cols};--rows:${rows}">${imgs
      .map((im, i) => media(im, ctx, { d: 14 + i * 5, anim: 'pop', mp: `images.${i}`, capPath: `images.${i}.caption` }))
      .join('')}</div></div>`;
  },

  timeline(s, ctx, v) {
    const steps = list(s.steps);
    if (v === 'vertical') return `${head(s, ctx)}<div class="body">${railList(steps, (st) => st.value || '', ctx, true)}</div>`;
    if (v === 'zigzag') {
      // Mốc so le trên/dưới một trục ngang giữa trang.
      return `${head(s, ctx)}<div class="body"><div class="tz" style="--cols:${steps.length}"><i class="tz-line" data-a="bar" data-to="100" data-d="10"></i>${steps
        .map((st, i) => `<div class="tz-i ${i % 2 ? 'dn' : 'up'}" style="${accent(i)}"><div class="tz-c" data-a="${i % 2 ? 'down' : 'up'}" data-d="${20 + i * 7}" data-dist="40">${st.value ? `<span class="label"${E(ctx, `steps.${i}.value`, LIM.itemValue)}>${rt(st.value)}</span>` : ''}${itemText(st, ctx, `steps.${i}`)}</div><i class="tl-dot" data-a="pop" data-d="${14 + i * 7}"></i></div>`)
        .join('')}</div></div>`;
    }
    if (v === 'cards') {
      const cols = steps.length;
      return `${head(s, ctx)}<div class="body"><div class="proc tl-cards" style="--cols:${cols};--vl:${longestWord(steps.map((st, i) => st.value || pad2(i + 1)))}">${steps
        .map((st, i) => `<div class="panel ps" style="${accent(i)}" data-a="up" data-d="${18 + i * 7}"><span class="tlc-v"${st.value ? E(ctx, `steps.${i}.value`, LIM.itemValue) : ''}>${rt(st.value || pad2(i + 1))}</span>${itemText(st, ctx, `steps.${i}`)}${i < cols - 1 ? `<span class="arr">${icon('arrow')}</span>` : ''}</div>`)
        .join('')}</div></div>`;
    }
    const per = maxCols(ctx.W) + 1;
    const cols = steps.length <= per ? Math.max(1, steps.length) : Math.ceil(steps.length / Math.ceil(steps.length / per));
    return `${head(s, ctx)}<div class="body"><div class="tl" style="--cols:${cols}">${steps
      .map((st, i) => {
        const rowEnd = (i + 1) % cols === 0 || i === steps.length - 1;
        return `<div class="tl-step" style="${accent(i)}"><div class="tl-dotrow"><i class="tl-dot" data-a="pop" data-d="${14 + i * 7}"></i>${rowEnd ? '' : `<i class="tl-seg" data-a="bar" data-to="100" data-d="${18 + i * 7}"></i>`}</div>
${st.value ? `<span class="label" data-a="up" data-d="${18 + i * 7}" data-dist="30"${E(ctx, `steps.${i}.value`, LIM.itemValue)}>${rt(st.value)}</span>` : ''}<div data-a="up" data-d="${20 + i * 7}" data-dist="40">${itemText(st, ctx, `steps.${i}`)}</div></div>`;
      })
      .join('')}</div></div>`;
  },

  process(s, ctx, v) {
    const steps = list(s.steps);
    if (v === 'vertical') return `${head(s, ctx)}<div class="body">${railList(steps, (_st, i) => pad2(i + 1), ctx, false)}</div>`;
    if (v === 'chevrons') {
      return `${head(s, ctx)}<div class="body"><div class="chev" style="--cols:${steps.length}">${steps
        .map((st, i) => `<div class="chev-i" style="${accent(i)}"><div class="chev-h" data-a="left" data-d="${14 + i * 7}"><span class="chev-n">${pad2(i + 1)}</span><h4${E(ctx, `steps.${i}.title`, LIM.itemTitle, true)}>${rt(st.title)}</h4></div>${st.value ? `<span class="label" data-a="up" data-d="${20 + i * 7}"${E(ctx, `steps.${i}.value`, LIM.itemValue)}>${rt(st.value)}</span>` : ''}${st.text ? `<p data-a="up" data-d="${22 + i * 7}" data-dist="30"${E(ctx, `steps.${i}.text`, LIM.itemText, true)}>${rt(st.text)}</p>` : ''}</div>`)
        .join('')}</div></div>`;
    }
    if (v === 'stairs') {
      // Bậc thang đi lên: bậc sau cao hơn bậc trước (min-height — nội dung dài vẫn giãn được).
      const k = steps.length - 1 || 1;
      return `${head(s, ctx)}<div class="body"><div class="stairs" style="--cols:${steps.length}">${steps
        .map((st, i) => `<div class="panel stair" style="${accent(i)};min-height:${Math.round(42 + (58 * i) / k)}%" data-a="up" data-d="${16 + i * 7}"><span class="ps-n">${pad2(i + 1)}</span>${st.value ? `<span class="label"${E(ctx, `steps.${i}.value`, LIM.itemValue)}>${rt(st.value)}</span>` : ''}${itemText(st, ctx, `steps.${i}`)}</div>`)
        .join('')}</div></div>`;
    }
    const cols = gridCols(steps.length, ctx.W, 4);
    return `${head(s, ctx)}<div class="body"><div class="proc" style="--cols:${cols}">${steps
      .map((st, i) => {
        const rowEnd = (i + 1) % cols === 0 || i === steps.length - 1;
        return `<div class="panel ps" style="${accent(i)}" data-a="up" data-d="${18 + i * 7}"><span class="ps-n">${pad2(i + 1)}</span>${st.value ? `<span class="label"${E(ctx, `steps.${i}.value`, LIM.itemValue)}>${rt(st.value)}</span>` : ''}${itemText(st, ctx, `steps.${i}`)}${rowEnd ? '' : `<span class="arr">${icon('arrow')}</span>`}</div>`;
      })
      .join('')}</div></div>`;
  },

  quote(s, ctx) {
    const q = s.quote || {};
    const img = hasMedia(s);
    // center/band chỉ khác cách đặt khối trích dẫn → CSS.
    return `${s.title || s.kicker ? head(s, ctx, { sub: false }) : ''}<div class="body"><div class="qt${img ? ' has-media' : ''}"><div class="qt-c">
<div class="qt-mark" data-a="pop" data-d="0">“</div>
<blockquote class="qt-text" data-a="words" data-d="8" data-s="2"${q.text || !s.subtitle ? E(ctx, 'quote.text', LIM.quoteText, true) : E(ctx, 'subtitle', LIM.subtitle, true)}>${rt(q.text || s.subtitle || '')}</blockquote>
${q.author ? `<div class="qt-by" data-a="up" data-d="40" data-dist="30"><b${E(ctx, 'quote.author', LIM.quoteAuthor)}>${rt(q.author)}</b>${q.role ? `<span${E(ctx, 'quote.role', LIM.quoteAuthor)}>${rt(q.role)}</span>` : ''}</div>` : ''}
</div>${img ? slot(s, ctx, { d: 16 }) : ''}</div></div>`;
  },

  comparison(s, ctx, v) {
    const cols = list(s.columns).slice(0, 3);
    const two = cols.length === 2;
    const toneIcon = { neg: 'x', pos: 'check', neutral: 'arrow' };
    const toneColor = { neg: 'coral', pos: 'mint', neutral: 'blue' };
    const colHtml = (c, i) => {
      const tone = toneIcon[c.tone] ? c.tone : i === cols.length - 1 ? 'pos' : 'neutral';
      return `<div class="panel col${tone === 'pos' ? ' hot' : ''}" style="--c:var(--${toneColor[tone]})" data-a="${two ? (i === 0 ? 'left' : 'right') : 'up'}" data-d="${16 + i * 8}">
${c.subtitle ? `<span class="label"${E(ctx, `columns.${i}.subtitle`, LIM.colSubtitle)}>${rt(c.subtitle)}</span>` : ''}<h3${E(ctx, `columns.${i}.title`, LIM.colTitle, true)}>${rt(c.title)}</h3>
<ul class="pts">${list(c.points).map((p, k) => `<li>${icon(toneIcon[tone])}<span${E(ctx, `columns.${i}.points.${k}`, LIM.point, true)}>${rt(p)}</span></li>`).join('')}</ul></div>`;
    };
    if (v === 'split' && two) {
      // Hai nửa trang đối lập, mũi tên chuyển đổi ở giữa (vị trí ở lớp ngoài, hiệu ứng ở lớp trong — engine ghi đè transform).
      return `${head(s, ctx)}<div class="body"><div class="cmp-split">${colHtml(cols[0], 0)}${colHtml(cols[1], 1)}<div class="cmp-mid"><span data-a="pop" data-d="30">${icon('arrow')}</span></div></div></div>`;
    }
    const inner = two
      ? `${colHtml(cols[0], 0)}<div class="vs" data-a="pop" data-d="30">VS</div>${colHtml(cols[1], 1)}`
      : cols.map(colHtml).join('');
    return `${head(s, ctx)}<div class="body"><div class="cmp${two ? ' two' : ''}" style="--cols:${Math.max(1, cols.length)}">${inner}</div></div>`;
  },

  closing(s, ctx, v) {
    const t = `${s.kicker ? `<div class="kicker" data-a="up" data-d="0"><span${E(ctx, 'kicker', LIM.kicker)}>${rt(s.kicker)}</span></div>` : ''}
<h2 class="cl-t" data-a="zoom" data-d="4"${E(ctx, 'title', LIM.title, true)}>${rt(s.title)}</h2>
${s.subtitle ? `<p class="cl-sub" data-a="up" data-d="20" data-dist="40"${E(ctx, 'subtitle', LIM.subtitle, true)}>${rt(s.subtitle)}</p>` : ''}`;
    if (v === 'split') {
      return `<div class="body"><div class="cl-split"><div class="cl-l">${t}</div><div class="panel cl-r" data-a="left" data-d="24">${list(s.tags)
        .map((x, i) => `<div class="cl-tag" style="${accent(i)}">${icon(i === 0 ? 'sparkles' : 'arrow')}<span${E(ctx, `tags.${i}`, LIM.tag)}>${rt(x)}</span></div>`)
        .join('')}${s.caption ? `<div class="cv-cap"${E(ctx, 'caption', LIM.caption, true)}>${rt(s.caption)}</div>` : ''}</div></div></div>`;
    }
    return `<div class="body"><div class="cl">
${t}
${chips(s.tags, 28, ctx)}
${s.caption ? `<div class="cv-cap" data-a="fade" data-d="40"${E(ctx, 'caption', LIM.caption, true)}>${rt(s.caption)}</div>` : ''}
</div></div>`;
  },
};

/* ---------------- trang tự do ---------------- */
// Màu theo token theme (không nhận mã màu tự do — xem shared/deck/free.js).
const TXT_COLOR = { text: 'var(--text)', accent: 'var(--accent)', 'accent-2': 'var(--accent-2)', muted: 'var(--muted)', white: '#FFFFFF', dark: '#111111' };
const SHAPE_FILL = { accent: 'var(--accent)', 'accent-2': 'var(--accent-2)', soft: 'color-mix(in srgb, var(--accent) 14%, transparent)', panel: 'var(--panel-a)', line: 'var(--line-2)', text: 'var(--text)' };
const n2 = (v, d = 0) => (Number.isFinite(v) ? v : d);

function freeEl(e, i, ctx) {
  const P = `elements.${e.id}`;
  const box = `left:${n2(e.x)}%;top:${n2(e.y)}%;width:${n2(e.w, 20)}%;height:${n2(e.h, 10)}%`;
  const anim = ` data-a="${e.type === 'shape' ? 'fade' : 'up'}" data-d="${6 + i * 4}" data-dist="30"`;
  const ph = (ic, label) => (ctx.edit ? `<div class="ph">${icon(ic)}<span>${label}</span></div>` : '');
  let cls = `fe fe-${e.type}`;
  let inner = '';
  let extra = '';
  if (e.type === 'text') {
    const st = TEXT_STYLES[e.style] || TEXT_STYLES.body;
    const fill = ['panel', 'soft', 'accent', 'dark'].includes(e.fill) ? e.fill : 'none';
    // Chữ "màu chính" trên nền màu nhấn/nền tối → tự đổi màu tương phản.
    const color = e.color === 'text' && fill === 'accent' ? 'var(--on-accent)' : e.color === 'text' && fill === 'dark' ? '#FFFFFF' : TXT_COLOR[e.color] || TXT_COLOR.text;
    cls += ` ts-${esc(e.style)} fill-${fill} al-${esc(e.align || 'left')} va-${esc(e.valign || 'top')}`;
    inner = `<div class="fe-t" style="--fs:${st.px}px;--fz:${n2(e.size, 1)};--fw:${st.weight};color:${color}"${E(ctx, `${P}.text`, LIM.elText, true)}${ctx.edit ? ' data-ph="Nhập chữ…"' : ''}>${rt(e.text)}</div>`;
  } else if (e.type === 'image') {
    const ref = e.image;
    const url = ref && ref.asset ? ctx.assetUrl(ref.asset) : null;
    const fit = ref && ref.fit === 'contain' ? 'contain' : 'cover';
    // Ảnh trọn khung (logo, đồ hoạ nền trong suốt) → không tô nền khung.
    inner = `<figure class="fe-fig r-${esc(e.radius || 'md')}${url ? (fit === 'contain' ? ' fit-c' : '') : ' empty'}"${M(ctx, P)}>${url ? `<img src="${esc(url)}" alt="${esc(ref.alt || '')}" style="object-fit:${fit};${imgPos(ref)}">` : ph('image', 'Bấm để chọn ảnh')}</figure>`;
  } else if (e.type === 'logo3d') {
    // Ảnh phẳng = dự phòng (trình soạn thảo, bản in, máy không có WebGL); engine phủ canvas 3D khi trình chiếu.
    // crossorigin: WebGL chỉ đọc được ảnh "sạch" CORS (URL ký từ khung sandbox origin null — route ảnh trả ACAO *).
    const ref = e.image;
    const url = ref && ref.asset ? ctx.assetUrl(ref.asset) : null;
    cls += ` mv-${esc(e.motion || 'swing')}`;
    inner = `<figure class="fe-fig fit-c${url ? '' : ' empty'}"${M(ctx, P)}>${url ? `<img src="${esc(url)}" alt="${esc(ref.alt || '')}" crossorigin="anonymous">` : ph('image', 'Bấm để chọn logo')}</figure>`;
    extra = ` data-motion="${esc(e.motion || 'swing')}" data-depth="${n2(e.depth, 0.5)}"`;
  } else if (e.type === 'video') {
    inner = e.video ? videoFig(e.video, ctx, { mp: P, anim: 'fade', d: 0, caption: '' }) : ctx.edit ? `<figure class="fe-fig r-md empty"${M(ctx, P)}>${ph('play', 'Bấm để chọn video')}</figure>` : '';
  } else if (e.type === 'table') {
    const rows = list(e.rows);
    const cell = (tag, txt, r, c) => `<${tag}${E(ctx, `${P}.rows.${r}.${c}`, LIM.cell, true)}>${rt(txt)}</${tag}>`;
    const hasHead = e.header !== false && rows.length > 1;
    const thead = hasHead ? `<thead><tr>${list(rows[0]).map((t, c) => cell('th', t, 0, c)).join('')}</tr></thead>` : '';
    const tbody = rows.slice(hasHead ? 1 : 0).map((r, k) => `<tr>${list(r).map((t, c) => cell('td', t, k + (hasHead ? 1 : 0), c)).join('')}</tr>`).join('');
    inner = `<table class="fe-tb tb-${esc(e.style || 'striped')}" style="--fz:${n2(e.size, 1)}">${thead}<tbody>${tbody}</tbody></table>`;
  } else {
    const fill = SHAPE_FILL[e.fill] || SHAPE_FILL.soft;
    inner = `<div class="fe-sh sh-${esc(e.shape || 'round')}" style="--sf:${fill};opacity:${n2(e.opacity, 1)}"></div>`;
  }
  return `<div class="${cls}" data-el="${esc(e.id)}" style="${box}"${anim}${extra}${e.step ? ' data-step' : ''}>${inner}</div>`;
}

L.free = function free(s, ctx) {
  const els = list(s.elements);
  const empty = ctx.edit && !els.length ? '<div class="fe-empty">Trang trắng — thêm chữ, ảnh, bảng, video, hình khối từ thanh công cụ</div>' : '';
  return `<div class="free">${els.map((e, i) => freeEl(e, i, ctx)).join('')}${empty}</div>`;
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

// Logo: kích thước = chiều cao (px trên khung cao 1440), rộng theo tỷ lệ ảnh; không rộng quá 1/3 khung.
function logoInfo(spec, ctx0) {
  const lg = spec.logo;
  const id = lg && (lg.removeBg && lg.cutout ? lg.cutout : lg.asset);
  const url = id ? ctx0.assetUrl(id) : null;
  if (!url) return null;
  const meta = (ctx0.assetMeta && ctx0.assetMeta(id)) || { width: 1, height: 1 };
  const ratio = meta.width > 0 && meta.height > 0 ? meta.width / meta.height : 1;
  let h = Math.min(LOGO_SIZE.max, Math.max(LOGO_SIZE.min, Number(lg.size) || LOGO_SIZE.def));
  let w = Math.round(h * ratio);
  const maxW = Math.round(ctx0.W / 3);
  if (w > maxW) {
    w = maxW;
    h = Math.round(w / ratio);
  }
  const pos = LOGO_POSITIONS.includes(lg.position) ? lg.position : 'tr';
  const show = LOGO_SHOW.includes(lg.showOn) ? lg.showOn : 'all';
  return { url, w, h, pos, show, top: pos[0] === 't' };
}
const logoOn = (lg, s) => lg && (lg.show === 'all' || (lg.show === 'cover' ? ['cover', 'closing'].includes(s.layout) : s.layout !== 'cover'));
const logoImg = (lg, cls) => `<div class="logo ${cls}" style="width:${lg.w}px;height:${lg.h}px"><img src="${esc(lg.url)}" alt=""></div>`;

// Bộ nhận diện: URL ảnh từng ô + chiều cao dải đầu/chân trang (theo tỷ lệ ảnh khi trải hết bề rộng khung, có trần).
function brandInfo(spec, c) {
  const br = spec.brand;
  if (!br) return null;
  const url = {};
  for (const k of BRAND_SLOTS) url[k] = br[k] ? c.assetUrl(br[k]) : null;
  if (!BRAND_SLOTS.some((k) => url[k])) return null;
  const band = (k, cap) => {
    if (!url[k]) return 0;
    const m = c.assetMeta ? c.assetMeta(br[k]) : null;
    const h = m && m.width > 0 && m.height > 0 ? (c.W * m.height) / m.width : c.H * 0.12;
    return Math.round(Math.min(c.H * cap, Math.max(24, h)));
  };
  return { url, top: band('header', 0.26), bot: band('footer', 0.22), footerText: br.footerText !== false, tones: br.tones || {} };
}
// Trang bìa/mở đầu phần/kết dùng ảnh riêng nếu có (trang thiết kế sẵn → không thêm dải đầu/chân); còn lại dùng nền trang nội dung + dải.
// Ảnh nền khác tông với bài (brand.tones — giao diện đo độ sáng ảnh khi chọn) → đổi màu chữ riêng trang đó (ink-light/ink-dark).
function brandFor(brand, s, tone) {
  if (!brand) return { html: '', cls: '', vars: '' };
  const kind = ['cover', 'section', 'closing'].includes(s.layout) ? s.layout : 'page';
  const own = kind !== 'page' && brand.url[kind];
  const bg = own || brand.url.page;
  const bgTone = bg ? brand.tones[own ? kind : 'page'] : null;
  const ink = bgTone && bgTone !== tone ? (bgTone === 'dark' ? ' ink-light' : ' ink-dark') : '';
  const bands = !own;
  const top = bands ? brand.top : 0;
  const bot = bands ? brand.bot : 0;
  const html = `${bg ? `<div class="bimg"><img src="${esc(bg)}" alt=""></div>` : ''}${top ? `<div class="bhd"><img src="${esc(brand.url.header)}" alt=""></div>` : ''}${bot ? `<div class="bft"><img src="${esc(brand.url.footer)}" alt=""></div>` : ''}`;
  const cls = `${bg ? ' has-bimg' : ''}${own ? ' bspec' : ''}${ink}${!brand.footerText && bands ? ' no-ftt' : ''}`;
  return { html, cls, vars: `${top ? `--bt:${top}px;` : ''}${bot ? `--bb:${bot}px;` : ''}` };
}

/**
 * Các phần của trang bài trình bày (dùng cho renderDeckHtml và cho trình soạn thảo dựng lại slide ngay trên trình duyệt
 * khi đang sửa — gửi vào khung xem trước bằng postMessage, không cần lưu).
 * @param {object} spec  đặc tả đã qua normalizeSpec
 * @param {object} opts  { ratio, mode:'present'|'print'|'edit', assetUrl(id)→url|null, assetMeta(id)→{width,height}|null, videoEmbed(assetId)→id|null }
 * @returns {{ W, H, mode, attrs, rootCss, themeCss, slides: string[], title }}
 */
export function deckParts(spec, opts) {
  const [W, H] = RATIO_SIZES[opts.ratio] || RATIO_SIZES['16:9'];
  const theme = THEMES.includes(spec.theme) ? spec.theme : 'midnight';
  const { tone } = resolveTheme(theme, spec.palette);
  const bg = BACKGROUNDS.includes(spec.background) ? spec.background : 'network';
  const fontBody = DECK_FONTS[spec.font?.body] ? spec.font.body : DEFAULT_FONT;
  const fontHead = DECK_FONTS[spec.font?.heading] ? spec.font.heading : fontBody;
  const mode = ['print', 'edit'].includes(opts.mode) ? opts.mode : 'present';
  const edit = mode === 'edit';
  const deckStyle = STYLES.includes(spec.style) ? spec.style : STYLES[0];
  const slides = list(spec.slides);
  const total = slides.length;
  const footer = spec.footer || spec.title || '';
  const assetUrl = opts.assetUrl || (() => null);
  const logo = logoInfo(spec, { W, assetUrl, assetMeta: opts.assetMeta });
  const brand = brandInfo(spec, { W, H, assetUrl, assetMeta: opts.assetMeta });
  let sectionNo = 0;

  const slideHtml = slides.map((s, index) => {
    if (s.layout === 'section') sectionNo += 1;
    const ctx = { W, H, index, total, sectionNo, assetUrl, assetMeta: opts.assetMeta, videoEmbed: opts.videoEmbed, edit };
    const fn = L[s.layout] || L.bullets;
    const v = resolveVariant(s, W / H);
    const lg = logoOn(logo, s) ? logo : null;
    // Logo phía dưới nằm trong hàng chân trang (flex) để không chồng lên chữ chân trang; trang bìa không có chân trang.
    const inFooter = lg && !lg.top && s.layout !== 'cover';
    const ftLogo = inFooter ? logoImg(lg, 'lg-in') : '';
    const ftText = `<span class="ft-t"${E(ctx, '@footer', LIM.footer, false, true)}>${esc(footer)}</span>`;
    const ftNum = `<span class="ft-n"><b>${pad2(index + 1)}</b> / ${pad2(total)}</span>`;
    const ftInner = !inFooter ? ftText + ftNum : lg.pos === 'bl' ? ftLogo + ftText + ftNum : lg.pos === 'bc' ? ftText + ftLogo + ftNum : ftText + ftNum + ftLogo;
    const ft = s.layout === 'cover' ? '' : `<div class="ft${inFooter ? ` ft-lg ft-${lg.pos}` : ''}">${ftInner}</div>`;
    const abs = lg && !inFooter ? logoImg(lg, `lg-${lg.pos}`) : '';
    const b = brandFor(brand, s, tone);
    const cls = `${lg ? ` lg-${lg.top ? 'top' : 'bot'}` : ''}${b.cls}`;
    const vars = `${lg ? `--lw:${lg.w}px;--lh:${lg.h}px;` : ''}${b.vars}`;
    const style = vars ? ` style="${vars}"` : '';
    // Lớp phần tử chèn thêm (ảnh, logo, chữ…) phía trên bố cục — trang tự do đã tự vẽ phần tử của nó.
    const over = s.layout !== 'free' && list(s.elements).length ? `<div class="free over">${list(s.elements).map((e, k) => freeEl(e, k + 8, ctx)).join('')}</div>` : '';
    const label = `Trang ${index + 1}/${total}${s.title ? `: ${plainText(s.title).replace(/\s+/g, ' ')}` : ''}`;
    const build = BUILDS.includes(s.build) ? ` data-build="${s.build}"` : '';
    return `<section class="slide L-${esc(s.layout)}${v ? ` V-${v}` : ''}${cls}"${style}${build} data-id="${esc(s.id)}" aria-label="${esc(label)}"><div class="sbg"></div>${glows(index, W)}${b.html}${fn(s, ctx, v)}${ft}${abs}${over}</section>`;
  });

  return {
    W, H, mode,
    attrs: { theme, tone, font: fontBody, style: deckStyle, bg },
    rootCss: `:root{--W:${W}px;--H:${H}px;--f-sans:${fontStack(fontBody)};--f-head:${fontStack(fontHead)}}`,
    themeCss: `${themeVarsCss(theme, spec.palette)}${brand ? inkVarsCss(theme, spec.palette) : ''}`,
    fontIds: [fontHead, fontBody],
    slides: slideHtml,
    title: spec.title || 'Bài trình bày',
  };
}

/**
 * @param {object} spec  đặc tả đã qua normalizeSpec
 * @param {object} opts  { ratio, mode:'present'|'print'|'edit', assetUrl(id)→url|null, assetMeta(id)→{width,height}|null,
 *                         videoEmbed(assetId)→id phần tử nhúng|null, embeds:[{id,mime,b64}], css, engineJs, fontCss, nonce, lang }
 */
export function renderDeckHtml(spec, opts) {
  const d = deckParts(spec, opts);
  const nonce = opts.nonce ? ` nonce="${esc(opts.nonce)}"` : '';
  const total = d.slides.length;
  const hud =
    d.mode === 'present'
      ? `<div id="hud"><button id="prev" type="button" aria-label="Trang trước"><svg viewBox="0 0 24 24">${HUD_ICON.prev}</svg></button><span id="count">01 / ${pad2(total)}</span><button id="next" type="button" aria-label="Trang sau"><svg viewBox="0 0 24 24">${HUD_ICON.next}</svg></button><button id="fs" type="button" aria-label="Toàn màn hình"><svg viewBox="0 0 24 24">${HUD_ICON.fs}</svg></button></div><div id="bar"><i></i></div><div id="hint">← → để chuyển trang · F toàn màn hình</div>`
      : '';
  // Video nhúng trong tệp HTML xuất (base64 trong thẻ script dữ liệu — trình duyệt không chạy; engine đổi thành Blob khi phát).
  const embeds = list(opts.embeds)
    .map((e) => `<script type="application/octet-stream" id="${esc(e.id)}" data-mime="${esc(e.mime)}">${e.b64}</script>`)
    .join('\n');
  const a = d.attrs;

  return `<!doctype html>
<html lang="${esc(opts.lang || 'vi')}" data-deck-theme="${a.theme}" data-tone="${a.tone}" data-font="${a.font}" data-style="${a.style}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="MISA Presentation">
<title>${rt(d.title)}</title>
<style${nonce}>${opts.fontCss || ''}
${d.rootCss}
${opts.css || ''}
${d.themeCss}</style>
</head>
<body>
<div id="stage"><div id="deck" data-w="${d.W}" data-h="${d.H}" data-mode="${d.mode}" data-bg="${a.bg}"><canvas id="bg" aria-hidden="true"></canvas>
${d.slides.join('\n')}
</div></div>
${hud}
${embeds}
${opts.preSrc ? `<script${nonce} src="${esc(opts.preSrc)}"></script>
` : ''}${opts.preJs ? `<script${nonce}>${opts.preJs}</script>
` : ''}<script${nonce}>${opts.engineJs || ''}</script>
</body>
</html>`;
}
