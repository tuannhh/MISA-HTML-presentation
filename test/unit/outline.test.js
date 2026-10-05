// Quy trình 2 bước: dàn ý → dựng bài; media (video/YouTube/logo), tông màu, phông chữ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { normalizeOutline, outlineSlideToSpec, applyOutlineMedia, composeDeckFromOutline, capOutline, parseStat, splitPoint } from '../../src/services/outlineService.js';
import { normalizeSpec, collectAssetIds, dropForeignAssets, remapAssetIds } from '../../src/services/specService.js';
import { parseThemeChoice } from '../../src/services/presentationService.js';
import { parseYouTubeId } from '../../src/services/youtubeService.js';
import { sniffVideo } from '../../src/lib/fileType.js';
import { deckFontFile } from '../../src/services/renderService.js';
import { renderDeckHtml, BACKGROUNDS } from '../../shared/deck/render.js';
import { paletteVars, contrast, themeVarsCss, THEME_PRESETS, presetsForTone } from '../../shared/deck/palette.js';
import { FONT_FILES, fontFaceCss } from '../../shared/deck/fonts.js';
import '../../shared/deck/backgrounds.js';

const A = () => randomUUID();

test('dàn ý strict: lỗi rõ ràng; trang chỉ có video HOẶC ảnh; tuỳ chọn tạo bài do server giữ', () => {
  const img = A();
  const { outline, errors } = normalizeOutline(
    {
      title: 'Bài',
      options: { tone: 'light', slideCount: 99 },
      slides: [
        { id: 'a', layout: 'bullets', title: 'T', points: ['Ý 1', '', 'Ý 2'], images: [{ asset: img }], video: { provider: 'youtube', id: 'dQw4w9WgXcQ' } },
        { id: 'a', layout: 'xxx', title: '', points: [] },
      ],
    },
    { strict: true, options: { tone: 'dark', autoSlides: true, slideCount: null } },
  );
  assert.ok(errors.some((e) => e.includes('slides[1].layout')));
  assert.ok(errors.some((e) => e.includes('slides[1]: trang trống')));
  assert.deepEqual(outline.slides[0].points, ['Ý 1', 'Ý 2']);
  assert.equal(outline.slides[0].images.length, 0, 'có video thì bỏ ảnh');
  assert.equal(outline.slides[0].video.id, 'dQw4w9WgXcQ');
  assert.notEqual(outline.slides[1].id, 'a', 'id trùng được cấp lại');
  assert.equal(outline.options.tone, 'dark', 'người dùng không đổi được tuỳ chọn tạo bài');
});

test('dàn ý: số liệu kiểu Việt Nam, tách "Tiêu đề: diễn giải"', () => {
  assert.deepEqual(parseStat('1.250 tỷ đồng — Doanh thu 2025'), { value: 1250, prefix: '', suffix: 'tỷ đồng', label: 'Doanh thu 2025' });
  assert.deepEqual(parseStat('24/7 — Hỗ trợ khách hàng'), { value: '24/7', prefix: '', suffix: '', label: 'Hỗ trợ khách hàng' });
  assert.equal(parseStat('Không có số liệu ở đây'), null);
  const st = parseStat('+62% — Tốc độ lập báo cáo');
  assert.equal(st.value, 62);
  assert.equal(st.prefix, '+');
  assert.equal(st.suffix, '%');
  assert.equal(st.label, 'Tốc độ lập báo cáo');
  assert.equal(parseStat('3,5 lần — Năng suất').value, 3.5);
  assert.deepEqual(splitPoint('Bối cảnh: Thị trường thay đổi nhanh'), { title: 'Bối cảnh', text: 'Thị trường thay đổi nhanh' });
});

test('dàn ý → slide dự phòng: đúng cấu trúc theo bố cục', () => {
  const base = { id: 's1', title: 'Số liệu', subtitle: '', notes: '', images: [], video: null };
  const stats = outlineSlideToSpec({ ...base, layout: 'stats', points: ['1.250 tỷ — Doanh thu', '+62% — Tốc độ'] }, 1, 5);
  assert.equal(stats.layout, 'stats');
  assert.equal(stats.stats.length, 2);
  const tl = outlineSlideToSpec({ ...base, layout: 'timeline', points: ['Q3/2026: Triển khai giai đoạn 1'] }, 1, 5);
  assert.equal(tl.steps[0].value, 'Q3/2026');
  const cmp = outlineSlideToSpec({ ...base, layout: 'comparison', points: ['Trước: Thủ công', 'Sau: Tự động', 'Trước: Chậm'] }, 1, 5);
  assert.deepEqual(cmp.columns.map((c) => c.title), ['Trước', 'Sau']);
  assert.equal(cmp.columns[0].points.length, 2);
  assert.equal(outlineSlideToSpec({ ...base, layout: 'auto', points: [] }, 0, 5).layout, 'cover');
  assert.equal(outlineSlideToSpec({ ...base, layout: 'auto', points: ['a'] }, 4, 5).layout, 'closing');
});

test('gắn media theo dàn ý: video/1 ảnh → bố cục có ô media; ≥2 ảnh → bộ sưu tập', () => {
  const v = { provider: 'youtube', id: 'dQw4w9WgXcQ', poster: null, title: 'Demo', caption: '' };
  const s = applyOutlineMedia({ layout: 'stats', stats: [{ value: 1, label: 'a' }, { value: 2, label: 'b' }], items: [] }, { video: v, images: [] });
  assert.equal(s.layout, 'image');
  assert.equal(s.items.length, 2);
  assert.equal(s.video.id, 'dQw4w9WgXcQ');
  const keep = applyOutlineMedia({ layout: 'bullets', items: [{ title: 'x' }] }, { video: null, images: [{ asset: A(), caption: 'c' }] });
  assert.equal(keep.layout, 'bullets');
  assert.ok(keep.image.asset);
  const g = applyOutlineMedia({ layout: 'cards', items: [] }, { video: null, images: [{ asset: A() }, { asset: A() }] });
  assert.equal(g.layout, 'gallery');
  assert.equal(g.images.length, 2);
});

test('dựng bài: ghép theo ref, giữ chữ người dùng đã duyệt, tôn trọng bố cục chọn tay, trang thiếu → dựng dự phòng', () => {
  const { outline } = normalizeOutline({
    title: 'Kế hoạch 2026',
    design: { theme: 'sky', background: 'hex', font: { heading: 'montserrat', body: 'roboto' } },
    slides: [
      { id: 'c', layout: 'auto', title: 'Kế hoạch 2026', subtitle: 'Tăng trưởng bền vững', points: [] },
      { id: 'b', layout: 'bullets', title: 'Mục tiêu', points: ['Doanh thu: tăng 20%'] },
      { id: 'k', layout: 'stats', title: 'Con số', points: ['20% — Tăng trưởng'] },
      { id: 'e', layout: 'auto', title: 'Cảm ơn', points: [] },
    ],
  });
  const model = [
    { ref: 'S2', layout: 'cards', title: 'Mục tiêu (AI đổi)', items: [{ title: 'Doanh thu', text: 'tăng 20%' }] },
    { ref: 'S1', layout: 'cover', title: 'Khác', subtitle: 'AI viết lại', kicker: 'MISA' },
    { ref: 'S3', layout: 'stats', title: 'Con số', stats: [{ value: 20, suffix: '%', label: 'Tăng trưởng' }] },
  ];
  const { spec, errors } = normalizeSpec(composeDeckFromOutline(outline, model));
  assert.deepEqual(errors, []);
  assert.equal(spec.slides.length, 4);
  assert.equal(spec.slides[0].title, 'Kế hoạch 2026', 'tiêu đề người dùng là chuẩn');
  assert.equal(spec.slides[0].subtitle, 'Tăng trưởng bền vững');
  assert.equal(spec.slides[0].kicker, 'MISA');
  assert.equal(spec.slides[1].layout, 'bullets', 'AI đổi bố cục người dùng chọn → dựng dự phòng đúng bố cục');
  assert.equal(spec.slides[2].stats[0].value, 20);
  assert.equal(spec.slides[3].layout, 'closing', 'trang AI bỏ sót vẫn được dựng');
  assert.equal(spec.theme, 'sky');
  assert.equal(spec.background, 'hex');
  assert.deepEqual(spec.font, { heading: 'montserrat', body: 'roboto' });
  assert.equal(capOutline({ slides: [{ layout: 'a' }, { layout: 'b' }, { layout: 'closing' }] }, 2).slides.at(-1).layout, 'closing');
});

test('chọn tông màu khi tạo: tự động / mẫu (tông theo mẫu) / tuỳ chỉnh (kiểm tra mã màu)', () => {
  assert.deepEqual(parseThemeChoice({ tone: 'light' }), { tone: 'light', theme: 'auto', palette: null });
  assert.equal(parseThemeChoice({ tone: 'dark', theme: 'sunset' }).tone, 'light');
  assert.deepEqual(parseThemeChoice({ tone: 'light', theme: 'custom', primary: '#ea580c' }).palette, { tone: 'light', primary: '#EA580C', secondary: '#EA580C' });
  assert.throws(() => parseThemeChoice({ theme: 'custom', primary: 'orange' }), /RRGGBB/);
  assert.throws(() => parseThemeChoice({ theme: 'hacker' }), /không hợp lệ/);
});

test('bảng màu: màu nhấn luôn đủ tương phản với nền (kể cả màu người dùng nhập khó đọc)', () => {
  for (const [tone, primary, secondary] of [['light', '#FFE066', '#FFF3B0'], ['dark', '#0A1A3A', '#111111'], ['light', '#FF7A1A', '#FFB547']]) {
    const r = paletteVars({ tone, primary, secondary });
    assert.ok(contrast(r.primary, r.vars['--bg2']) >= 4.5, `${tone} ${primary}`);
    assert.ok(contrast(r.secondary, r.vars['--bg2']) >= 4.5, `${tone} ${secondary}`);
    assert.ok(contrast(r.vars['--text'], r.vars['--bg2']) >= 7);
    assert.equal(r.adjusted, true);
  }
  assert.ok(presetsForTone('light').length >= 5 && presetsForTone('dark').length >= 5);
  assert.match(themeVarsCss('custom', { tone: 'light', primary: '#EA580C', secondary: '#7C2D12' }), /^\[data-deck-theme="custom"\]\{--bg1:#/);
  assert.equal(themeVarsCss('midnight'), '', 'theme viết tay không sinh biến');
  for (const k of Object.keys(THEME_PRESETS)) assert.ok(THEME_PRESETS[k].label && THEME_PRESETS[k].tone);
});

test('phông chữ: đủ tệp, có unicode-range tiếng Việt, chặn đường dẫn ngoài danh sách', () => {
  for (const f of FONT_FILES) assert.ok(existsSync(new URL(`../../shared/deck/fonts/${f}`, import.meta.url)), f);
  const css = fontFaceCss(['barlow', 'barlow', 'roboto'], (f) => `/x/${f}`);
  assert.equal((css.match(/@font-face/g) || []).length, 18 + 3);
  assert.match(css, /unicode-range:U\+0102-0103/);
  assert.ok(deckFontFile('roboto/roboto-vietnamese-wght-normal.woff2')?.length > 1000);
  assert.equal(deckFontFile('../../../etc/passwd'), null);
  assert.equal(deckFontFile('roboto/../../render.js'), null);
});

test('link YouTube: nhận mọi dạng phổ biến, từ chối link lạ', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [id, `https://www.youtube.com/watch?v=${id}&t=10`, `https://youtu.be/${id}?si=x`, `youtube.com/shorts/${id}`, `https://m.youtube.com/watch?v=${id}`, `https://www.youtube-nocookie.com/embed/${id}`, `https://www.youtube.com/live/${id}`]) {
    assert.equal(parseYouTubeId(u), id, u);
  }
  for (const u of ['https://evil.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://youtube.com/watch?v=short', '']) assert.equal(parseYouTubeId(u), null, u);
});

test('video tải lên: nhận MP4/MOV/WebM theo magic bytes, từ chối M4A (chỉ tiếng)', () => {
  const ftyp = (brand) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from(`ftyp${brand}`), Buffer.alloc(20)]);
  assert.equal(sniffVideo(ftyp('isom')), 'mp4');
  assert.equal(sniffVideo(ftyp('qt  ')), 'mov');
  assert.equal(sniffVideo(ftyp('M4A ')), null);
  assert.equal(sniffVideo(Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('....B\x82\x84webm'), Buffer.alloc(20)])), 'webm');
  assert.equal(sniffVideo(Buffer.from('%PDF-1.7 xxxxxxxxxxxxxxxx')), null);
});

test('thiết kế trong spec: chặn giá trị lạ, kẹp kích thước logo, asset logo/video được kiểm soát', () => {
  const logo = A();
  const vid = A();
  const poster = A();
  const { spec, errors } = normalizeSpec(
    {
      title: 'X', theme: 'custom', palette: { tone: 'light' }, background: 'lava', font: { heading: 'comic', body: 'roboto' },
      logo: { asset: logo, size: 9999, position: 'zz', showOn: 'cover' },
      slides: [{ layout: 'image', title: 'V', video: { provider: 'file', asset: vid, poster } }],
    },
    { strict: true },
  );
  assert.ok(errors.some((e) => e.startsWith('palette')));
  assert.equal(spec.theme, 'midnight');
  assert.equal(spec.background, 'network');
  assert.deepEqual(spec.font, { heading: 'roboto', body: 'roboto' });
  assert.deepEqual([spec.logo.size, spec.logo.position, spec.logo.showOn], [360, 'tr', 'cover']);
  assert.deepEqual([...collectAssetIds(spec)].sort(), [logo, vid, poster].sort());
  const copy = structuredClone(spec);
  dropForeignAssets(copy, new Set([poster]));
  assert.equal(copy.slides[0].video, null, 'video của bài khác bị bỏ');
  assert.equal(copy.logo, null);
  const nl = A();
  const remapped = remapAssetIds(structuredClone(spec), new Map([[logo, nl], [vid, A()], [poster, A()]]));
  assert.equal(remapped.logo.asset, nl);
  assert.notEqual(remapped.slides[0].video.asset, vid);
});

test('renderer: video 16:9 có nút phát + chống XSS tên video; nền/phông/tông gắn vào trang; logo theo tỷ lệ ảnh', () => {
  const logo = A();
  const { spec } = normalizeSpec({
    title: 'X', theme: 'custom', palette: { tone: 'light', primary: '#EA580C', secondary: '#7C2D12' }, background: 'radar', font: { heading: 'barlow', body: 'roboto' },
    logo: { asset: logo, size: 100, position: 'bl', showOn: 'all' },
    slides: [{ layout: 'bullets', title: 'A', items: [{ title: 'x' }], video: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: '<img src=x onerror=alert(1)>' } }],
  });
  const html = renderDeckHtml(spec, { ratio: '16:9', assetUrl: (id) => (id === logo ? '/logo.png' : null), assetMeta: () => ({ width: 400, height: 100 }) });
  assert.match(html, /data-vp="youtube" data-vid="dQw4w9WgXcQ"/);
  assert.match(html, /class="vplay"/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /data-bg="radar"/);
  assert.match(html, /data-tone="light"/);
  assert.match(html, /\[data-deck-theme="custom"\]\{/);
  assert.match(html, /--f-head:"Deck Barlow"/);
  assert.match(html, /width:400px;height:100px/);
  assert.deepEqual(BACKGROUNDS, [...globalThis.DeckBg.NAMES, 'none'], 'danh sách nền khớp backgrounds.js');
});
