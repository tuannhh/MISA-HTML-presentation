// Kiểm thử bản cập nhật "thương hiệu & chữ có định dạng": chữ màu/đậm/giữ liền/xuống dòng trong chuỗi (shared/deck/rich.js),
// ảnh/logo thay biểu tượng của mục, lớp chèn đè trên trang có bố cục, bộ nhận diện thương hiệu (bìa, nền trang, mở đầu phần,
// trang kết, dải đầu/chân), tông sáng be/trắng mới, mẫu thương hiệu (cách ly tenant, sao chép ảnh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRich, serializeRich, plainText, canonicalRich, cutRich, repaintRich, formatRange, richHtml } from '../../shared/deck/rich.js';
import { normalizeSpec, normalizeDesign, collectAssetIds, dropForeignAssets, remapAssetIds } from '../../src/services/specService.js';
import { deckParts } from '../../shared/deck/render.js';
import { fits } from '../../shared/deck/variants.js';
import { THEME_PRESETS, paletteVars, contrast, presetsForTone, inkVarsCss } from '../../shared/deck/palette.js';
import { applyFrameEdit, mediaTarget, setMedia } from '../../frontend/src/lib/editPaths.js';
import { createTemplateService } from '../../src/services/templateService.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '44444444-4444-4444-8444-444444444444';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const XSS = '<img src=x onerror=alert(1)>"\'&';

test('rich: tách/ghép đoạn, chữ thuần, thẻ sai cú pháp thành chữ thường, gộp đoạn cùng định dạng', () => {
  const s = 'Hỏi đáp ⟦accent,b⟧song song⟦/⟧ và AI';
  assert.equal(plainText(s), 'Hỏi đáp song song và AI');
  assert.deepEqual(parseRich(s)[1], { t: 'song song', c: 'accent', b: true, n: false });
  assert.equal(serializeRich(parseRich(s)), s);
  // Thuộc tính lạ (CSS chèn), màu không hợp lệ, dấu ⟦ lẻ → chữ thường (bỏ dấu ngoặc), không thành định dạng.
  assert.equal(plainText('⟦red;background:url(x)⟧a⟦/⟧ ⟦b'), 'red;background:url(x)a/ b');
  assert.ok(!richHtml('⟦red;background:url(x)⟧a⟦/⟧').includes('<span'));
  assert.equal(canonicalRich('⟦#12345⟧x⟦/⟧'), '#12345x/');
  assert.equal(canonicalRich('⟦b⟧a⟦/⟧⟦b⟧b⟦/⟧'), '⟦b⟧ab⟦/⟧');
  assert.equal(canonicalRich('⟦#ff8800⟧cam⟦/⟧'), '⟦#FF8800⟧cam⟦/⟧');
  assert.equal(canonicalRich('không thẻ'), 'không thẻ');
});

test('rich: cắt theo chữ hiển thị, sửa chữ thuần giữ định dạng, định dạng theo khoảng + viết hoa', () => {
  assert.equal(cutRich('ab⟦accent⟧cdef⟦/⟧gh', 4), 'ab⟦accent⟧cd⟦/⟧');
  // Sửa ở form (chữ thuần): phần không đổi giữ màu, phần chèn lấy định dạng ký tự đứng trước.
  assert.equal(repaintRich('Xin ⟦accent⟧chào⟦/⟧ bạn', 'Xin chàooo bạn'), 'Xin ⟦accent⟧chàooo⟦/⟧ bạn');
  assert.equal(repaintRich('Xin ⟦accent⟧chào⟦/⟧ bạn', 'Xin bạn'), 'Xin bạn');
  assert.equal(repaintRich('không định dạng', 'mới'), 'mới');
  assert.equal(formatRange('trí tuệ nhân tạo', 0, 7, { upper: 'upper', c: 'accent' }), '⟦accent⟧TRÍ TUỆ⟦/⟧ nhân tạo');
  assert.equal(formatRange('⟦b⟧đậm⟦/⟧', 0, 3, { b: false }), 'đậm');
  assert.equal(plainText(formatRange('xin chào việt nam', 0, 99, { upper: 'title' })), 'Xin Chào Việt Nam');
});

test('rich: HTML an toàn (escape chữ, style chỉ từ giá trị kiểm), xuống dòng → <br>, cụm nhấn mạnh trên chữ thuần', () => {
  const html = richHtml(`⟦accent,b,n⟧${XSS}⟦/⟧\ndòng 2`);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;'));
  assert.ok(html.includes('style="color:var(--accent);font-weight:800;white-space:nowrap;"'));
  assert.ok(html.includes('<br>dòng 2'));
  const hl = richHtml('Chuyển đổi ⟦amber⟧số⟦/⟧ toàn diện', 'số toàn');
  assert.equal((hl.match(/<em class="hl">/g) || []).length, 2);
  assert.ok(hl.includes('data-rc="amber"'));
});

test('normalizeSpec: chữ có định dạng tính độ dài theo chữ hiển thị; quá dài → cắt giữ định dạng (strict báo lỗi)', () => {
  const title = `⟦accent,b⟧${'a'.repeat(50)}⟦/⟧`;
  const { spec, errors } = normalizeSpec({ title: 'T', slides: [{ layout: 'bullets', title, items: [{ title: '⟦coral⟧Rủi ro⟦/⟧\nmới', text: 'x' }] }] }, { strict: true });
  assert.deepEqual(errors, []);
  assert.equal(spec.slides[0].title, title);
  assert.equal(spec.slides[0].items[0].title, '⟦coral⟧Rủi ro⟦/⟧\nmới');
  const long = normalizeSpec({ title: 'T', slides: [{ layout: 'bullets', title: `⟦b⟧${'x'.repeat(500)}⟦/⟧` }] }, { strict: true });
  assert.ok(long.errors.length > 0);
  const lenient = normalizeSpec({ title: 'T', slides: [{ layout: 'bullets', title: `⟦b⟧${'x'.repeat(500)}⟦/⟧` }] });
  assert.ok(lenient.spec.slides[0].title.startsWith('⟦b⟧x'));
  assert.ok(plainText(lenient.spec.slides[0].title).length < 500);
  // Cụm nhấn mạnh so khớp trên chữ thuần (tiêu đề có thẻ vẫn nhận).
  const hl = normalizeSpec({ title: 'T', slides: [{ layout: 'bullets', title: 'Kỷ nguyên ⟦accent⟧AI⟦/⟧ mới', highlight: 'AI mới' }] });
  assert.equal(hl.spec.slides[0].highlight, 'AI mới');
});

test('renderer: chữ định dạng thành span.rt; ô nhiều dòng có data-ml; ô số liệu là chữ thường (data-pl)', () => {
  const spec = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'stats', title: 'Doanh thu ⟦mint,b⟧tăng⟦/⟧', stats: [{ value: 62, suffix: '%', label: '⟦accent⟧Khách⟦/⟧ hàng' }] },
    ],
  }).spec;
  const p = deckParts(spec, { ratio: '16:9', mode: 'edit' });
  const html = p.slides[0];
  assert.ok(html.includes('<span class="rt" data-rc="mint" data-rb="" style="color:var(--mint);font-weight:800;">tăng</span>'));
  assert.match(html, /data-e="title" data-max="\d+" data-ml=""/);
  assert.match(html, /data-e="stats\.0\.value" data-max="\d+" data-pl=""/);
  assert.ok(!html.includes('⟦'));
  // aria-label của trang dùng chữ thuần.
  assert.ok(html.includes('Doanh thu tăng'));
});

test('ảnh/logo thay biểu tượng của mục: normalize giữ ảnh, renderer dựng .ib-img, chặn ảnh ngoài bài', () => {
  const raw = { title: 'T', slides: [{ layout: 'cards', title: 'Mô hình AI', items: [{ title: 'OpenAI', text: '', image: { asset: A, fit: 'contain' } }, { title: 'Gemini', icon: 'zap', text: 'x' }] }] };
  const { spec, errors } = normalizeSpec(raw, { strict: true });
  assert.deepEqual(errors, []);
  assert.equal(spec.slides[0].items[0].image.asset, A);
  assert.ok(collectAssetIds(spec).has(A));
  const html = deckParts(spec, { ratio: '16:9', mode: 'edit', assetUrl: (id) => `/a/${id}` }).slides[0];
  assert.ok(html.includes(`<span class="ib ib-img" data-m="items.0.image"><img src="/a/${A}" alt="OpenAI"></span>`));
  // Mục còn biểu tượng cũng bấm được để đổi sang ảnh (chế độ sửa).
  assert.match(html, /<span class="ib"[^>]*data-m="items\.1\.image"/);
  const dropped = dropForeignAssets(spec, new Set([B]));
  assert.equal(dropped.slides[0].items[0].image, undefined);
  // Thẻ chỉ có ảnh (không chữ) vẫn được giữ.
  assert.equal(normalizeSpec({ title: 'T', slides: [{ layout: 'cards', title: 'x', items: [{ image: { asset: A } }] }] }).spec.slides[0].items.length, 1);
});

test('lớp chèn đè trên trang có bố cục: giữ phần tử, dựng .free.over phía trên nội dung', () => {
  const { spec } = normalizeSpec({
    title: 'T',
    slides: [{ layout: 'bullets', title: 'Ý chính', items: [{ title: 'a' }], elements: [{ id: 'e-lg1', type: 'image', image: { asset: A, fit: 'contain' }, radius: 'none', x: 84, y: 5, w: 11, h: 14 }] }],
  });
  assert.equal(spec.slides[0].elements.length, 1);
  const html = deckParts(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}` }).slides[0];
  assert.match(html, /<div class="free over"><div class="fe fe-image" data-el="e-lg1"/);
  assert.ok(html.includes('fe-fig r-none fit-c'));
  // Trang bố cục không có phần tử → không thêm trường thừa.
  assert.equal(normalizeSpec({ title: 'T', slides: [{ layout: 'bullets', title: 'x', elements: [] }] }).spec.slides[0].elements, undefined);
});

test('bộ nhận diện: chuẩn hoá (chỉ UUID, rỗng → null), asset được kiểm soát, đổi mã khi sao chép', () => {
  // Mã ảnh sai dạng: strict báo lỗi, lenient bỏ ô đó.
  assert.ok(normalizeDesign({ brand: { header: 'javascript:alert(1)' } }, { strict: true }).errors.length > 0);
  const { design } = normalizeDesign({ theme: 'sand', brand: { cover: A, page: B, header: 'javascript:alert(1)', footer: C, footerText: false, extra: 'x' } });
  assert.deepEqual(design.brand, { cover: A, page: B, section: null, closing: null, header: null, footer: C, footerText: false });
  assert.equal(normalizeDesign({ brand: { cover: 'x' } }).design.brand, null);
  const { spec } = normalizeSpec({ title: 'T', brand: design.brand, slides: [{ layout: 'cover', title: 'Bìa' }] });
  assert.deepEqual([...collectAssetIds(spec)].sort(), [A, B, C].sort());
  const kept = dropForeignAssets(spec, new Set([A]));
  assert.equal(kept.brand.cover, A);
  assert.equal(kept.brand.page, null);
  assert.equal(kept.brand.footer, null);
  const moved = remapAssetIds({ slides: [], brand: design.brand }, new Map([[A, FOREIGN]]));
  assert.equal(moved.brand.cover, FOREIGN);
});

test('renderer bộ nhận diện: bìa có ảnh riêng (bspec, không dải); trang nội dung = nền + dải đầu/chân đúng chiều cao ảnh', () => {
  const { spec } = normalizeSpec({
    title: 'T',
    brand: { cover: A, page: B, header: C, footer: FOREIGN, footerText: false },
    slides: [{ layout: 'cover', title: 'Bìa' }, { layout: 'bullets', title: 'Nội dung', items: [{ title: 'a' }] }, { layout: 'section', title: 'Phần 1' }],
  });
  const meta = { [C]: { width: 2560, height: 160 }, [FOREIGN]: { width: 2560, height: 2560 } };
  const p = deckParts(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}`, assetMeta: (id) => meta[id] || null });
  const [cover, page, section] = p.slides;
  assert.ok(cover.includes(`<div class="bimg"><img src="/a/${A}" alt=""></div>`));
  assert.match(cover, /class="slide[^"]*has-bimg bspec/);
  assert.ok(!cover.includes('class="bhd"'));
  assert.ok(page.includes(`<div class="bimg"><img src="/a/${B}" alt=""></div>`));
  assert.ok(page.includes(`<div class="bhd"><img src="/a/${C}" alt=""></div>`));
  assert.ok(page.includes('--bt:160px;'));
  // Dải chân trang quá cao (ảnh vuông) → kẹp 22% chiều cao trang.
  assert.ok(page.includes(`--bb:${Math.round(1440 * 0.22)}px;`));
  assert.match(page, /no-ftt/);
  // Mở đầu phần chưa có ảnh riêng → dùng nền trang nội dung + dải.
  assert.ok(section.includes(`/a/${B}`) && section.includes('class="bhd"'));
});

test('màu chữ theo độ sáng ảnh nhận diện: tones chỉ nhận light/dark cho ô có ảnh; trang khác tông bài → ink-light/ink-dark', () => {
  const { design } = normalizeDesign({ theme: 'sand', brand: { cover: A, page: B, closing: C, tones: { cover: 'dark', page: 'light', closing: 'dark', section: 'dark', header: 'dark', x: 1 } } });
  // section không có ảnh → bỏ tông; header không phải ảnh nền toàn trang → bỏ.
  assert.deepEqual(design.brand.tones, { cover: 'dark', page: 'light', closing: 'dark' });
  assert.equal(normalizeDesign({ brand: { cover: A, tones: { cover: 'red' } } }).design.brand.tones, undefined);
  const { spec } = normalizeSpec({
    title: 'T',
    theme: 'sand',
    brand: design.brand,
    slides: [{ layout: 'cover', title: 'Bìa' }, { layout: 'bullets', title: 'Nội dung', items: [{ title: 'a' }] }, { layout: 'closing', title: 'Cảm ơn' }],
  });
  const p = deckParts(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}` });
  const [cover, page, closing] = p.slides;
  // Bài tông sáng: ảnh tối → chữ sáng; ảnh sáng cùng tông → giữ nguyên.
  assert.match(cover, /class="slide[^"]*ink-light/);
  assert.match(closing, /class="slide[^"]*ink-light/);
  assert.doesNotMatch(page, /ink-(light|dark)/);
  assert.ok(p.themeCss.includes('.slide.ink-light{') && p.themeCss.includes('.slide.ink-dark{'));
  // Bài tông tối + ảnh sáng → chữ tối.
  const dark = normalizeSpec({ title: 'T', theme: 'midnight', brand: { page: B, tones: { page: 'light' } }, slides: [{ layout: 'bullets', title: 'N', items: [{ title: 'a' }] }] }).spec;
  assert.match(deckParts(dark, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}` }).slides[0], /ink-dark/);
  // Không có bộ nhận diện → không chèn CSS đổi màu chữ.
  const plain = normalizeSpec({ title: 'T', slides: [{ layout: 'cover', title: 'Bìa' }] }).spec;
  assert.ok(!deckParts(plain, { ratio: '16:9', mode: 'present' }).themeCss.includes('ink-light'));
  // Chữ của ink-light đọc được trên nền tối, ink-dark trên nền sáng — với mọi tông có sẵn.
  const textOf = (css, cls) => new RegExp(`\\.slide\\.${cls}\\{[^}]*--text:(#[0-9A-Fa-f]{6})`).exec(css)[1];
  // --accent khai báo bằng var(--blue) ở gốc → phải khai báo lại trên trang thì mới nhận màu nhấn đã nâng sáng.
  assert.match(inkVarsCss('sand'), /\.slide\.ink-light\{--accent:[^;]+;--accent-2:/);
  for (const k of Object.keys(THEME_PRESETS)) {
    const css = inkVarsCss(k);
    assert.ok(contrast(textOf(css, 'ink-light'), '#0B1220') >= 7, `${k} ink-light`);
    assert.ok(contrast(textOf(css, 'ink-dark'), '#F8FAFC') >= 7, `${k} ink-dark`);
  }
});

test('tông sáng be/trắng mới: thuộc tông sáng, màu nhấn đủ tương phản với nền, chữ trên màu nhấn đọc được', () => {
  const NEW = ['sand', 'latte', 'linen', 'pearl', 'frost', 'blossom'];
  const light = presetsForTone('light');
  for (const k of NEW) {
    assert.ok(THEME_PRESETS[k], k);
    assert.ok(light.includes(k), k);
    const r = paletteVars(THEME_PRESETS[k]);
    assert.ok(contrast(r.primary, THEME_PRESETS[k].bg) >= 3, `${k} nhấn/nền`);
    assert.ok(contrast(r.primary, r.vars['--on-accent']) >= 3, `${k} chữ trên nhấn`);
  }
});

test('editPaths: chữ định dạng cắt theo chữ hiển thị, ô số liệu chữ thường; ảnh mục đặt lần đầu = trọn khung, xoá = về biểu tượng', () => {
  const spec = { footer: '', slides: [{ layout: 'cards', title: '', items: [{ icon: 'zap', title: 'OpenAI', text: '' }], stats: [{ value: '', label: '' }] }] };
  assert.equal(applyFrameEdit(spec, 0, 'title', `⟦accent⟧${'a'.repeat(400)}⟦/⟧`), true);
  assert.ok(spec.slides[0].title.startsWith('⟦accent⟧') && spec.slides[0].title.endsWith('⟦/⟧'));
  assert.ok(plainText(spec.slides[0].title).length <= 200);
  assert.equal(applyFrameEdit(spec, 0, 'stats.0.value', '62\u0007'), true);
  assert.equal(spec.slides[0].stats[0].value, '62');
  assert.equal(applyFrameEdit(spec, 0, 'stats.0.label', '⟦mint⟧Tăng⟦/⟧'), true);
  assert.equal(spec.slides[0].stats[0].label, '⟦mint⟧Tăng⟦/⟧');

  const s = spec.slides[0];
  const t = mediaTarget(s, 'items.0.image');
  assert.equal(t.kind, 'item-image');
  assert.equal(mediaTarget(s, 'items.9.image'), null);
  assert.equal(mediaTarget(s, 'items.__proto__.image'), null);
  setMedia(s, 'items.0.image', { image: { asset: A, alt: '', caption: '', fit: 'cover' } });
  assert.equal(s.items[0].image.fit, 'contain');
  setMedia(s, 'items.0.image', { image: { asset: B, alt: '', caption: '', fit: 'cover' } });
  assert.equal(s.items[0].image.fit, 'cover');
  setMedia(s, 'items.0.image', { image: null });
  assert.equal('image' in s.items[0], false);
});

test('kiểu trình bày: kiểm tra độ dài tên bước theo chữ hiển thị (thẻ định dạng không làm mất kiểu mũi tên)', () => {
  const s = { layout: 'process', steps: [{ title: '⟦accent,b⟧Khảo sát⟦/⟧' }, { title: 'Thiết kế' }, { title: 'Triển khai' }] };
  assert.equal(fits('process', 'chevrons', s, 16 / 9), true);
});

/* ---- mẫu thương hiệu ---- */
function fakeWorld() {
  const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const D1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const D2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const decks = [{ id: D1, tenant_id: U1, status: 'ready' }, { id: D2, tenant_id: U2, status: 'ready' }];
  const deckAssets = [
    { id: A, tenant_id: U1, presentation_id: D1, kind: 'brand', mime: 'image/webp', bytes: 10, width: 1920, height: 1080, storage_key: `tenants/${U1}/presentations/${D1}/${A}.webp`, original_name: 'bia.png' },
    { id: B, tenant_id: U1, presentation_id: D1, kind: 'logo', mime: 'image/webp', bytes: 5, width: 300, height: 100, storage_key: `tenants/${U1}/presentations/${D1}/${B}.webp`, original_name: 'logo.png' },
    { id: C, tenant_id: U1, presentation_id: D1, kind: 'video', mime: 'video/mp4', bytes: 99, width: null, height: null, storage_key: 'v', original_name: 'v.mp4' },
  ];
  const tpls = [];
  const tplAssets = [];
  const copies = [];
  const repos = {
    presentations: { findOwned: async (t, id) => decks.find((d) => d.id === id && d.tenant_id === t) || null },
    assets: {
      listOwnedForPresentation: async (t, pid) => deckAssets.filter((a) => a.tenant_id === t && a.presentation_id === pid),
      countForPresentation: async (pid, kind) => deckAssets.filter((a) => a.presentation_id === pid && a.kind === kind).length,
      create: async (t, a) => deckAssets.push({ ...a, tenant_id: t, presentation_id: a.presentationId, storage_key: a.storageKey }),
    },
    templates: {
      create: async (t, x) => tpls.push({ id: x.id, tenant_id: t, name: x.name, visibility: 'private', design: x.design }),
      countOwned: async (t) => tpls.filter((x) => x.tenant_id === t).length,
      findOwned: async (t, id) => tpls.find((x) => x.id === id && x.tenant_id === t) || null,
      findReadable: async (t, id) => tpls.find((x) => x.id === id && (x.tenant_id === t || x.visibility === 'public')) || null,
      updateOwned: async (t, id, f) => {
        const x = tpls.find((y) => y.id === id && y.tenant_id === t);
        if (!x) return 0;
        Object.assign(x, f);
        return 1;
      },
      deleteOwned: async (t, id) => {
        const i = tpls.findIndex((y) => y.id === id && y.tenant_id === t);
        if (i < 0) return 0;
        tpls.splice(i, 1);
        return 1;
      },
      createAsset: async (t, a) => tplAssets.push({ ...a, tenant_id: t, template_id: a.templateId, storage_key: a.storageKey }),
      listAssets: async (tid) => tplAssets.filter((a) => a.template_id === tid),
    },
  };
  const storage = { copy: async (from, to) => copies.push([from, to]), removePrefix: async () => {}, get: async () => Buffer.from('') };
  const svc = createTemplateService({ repos, storage, signer: { url: (id) => `/s/${id}` }, audit: { record: async () => {} } });
  return { svc, U1, U2, D1, D2, tpls, copies, deckAssets };
}

test('mẫu thương hiệu: lưu sao chép ảnh sang kho mẫu; chặn ảnh không thuộc bài / không phải ảnh', async () => {
  const w = fakeWorld();
  const design = { theme: 'pearl', background: 'network', logo: { asset: B, position: 'tr', size: 110, showOn: 'all' }, brand: { cover: A, footerText: true } };
  const t = await w.svc.create({ id: w.U1 }, { name: '  Nhận diện  MISA ', presentationId: w.D1, design });
  assert.equal(t.name, 'Nhận diện MISA');
  assert.equal(w.copies.length, 2);
  assert.ok(w.copies.every(([, to]) => to.startsWith(`tenants/${w.U1}/templates/${t.id}/`)));
  // Mã ảnh trong mẫu là mã MỚI (không lộ mã asset của bài).
  assert.notEqual(t.design.brand.cover, A);
  assert.ok(t.assets[t.design.brand.cover]);
  // Ảnh của người khác / bài khác / video → từ chối.
  await assert.rejects(w.svc.create({ id: w.U1 }, { name: 'x', presentationId: w.D1, design: { brand: { cover: FOREIGN } } }), { code: 'FOREIGN_ASSET' });
  await assert.rejects(w.svc.create({ id: w.U1 }, { name: 'x', presentationId: w.D1, design: { brand: { page: C } } }), { code: 'INVALID_MEDIA' });
  await assert.rejects(w.svc.create({ id: w.U2 }, { name: 'x', presentationId: w.D1, design }), { status: 404 });
  await assert.rejects(w.svc.create({ id: w.U1 }, { name: '   ', presentationId: w.D1, design }), { code: 'INVALID_NAME' });
});

test('mẫu thương hiệu: mẫu riêng tư người khác không áp được; công khai áp được, ảnh sao chép vào bài của người áp', async () => {
  const w = fakeWorld();
  const t = await w.svc.create({ id: w.U1 }, { name: 'Chiến dịch', presentationId: w.D1, design: { theme: 'sand', brand: { cover: A, footerText: true } } });
  await assert.rejects(w.svc.apply({ id: w.U2 }, w.D2, t.id), { status: 404 });
  // Người khác không đổi được chế độ chia sẻ / xoá mẫu của chủ.
  await assert.rejects(w.svc.update({ id: w.U2 }, t.id, { visibility: 'public' }), { status: 404 });
  await assert.rejects(w.svc.remove({ id: w.U2 }, t.id), { status: 404 });
  await w.svc.update({ id: w.U1 }, t.id, { visibility: 'public' });
  w.copies.length = 0;
  const res = await w.svc.apply({ id: w.U2 }, w.D2, t.id);
  assert.equal(res.design.theme, 'sand');
  assert.equal(res.assets.length, 1);
  assert.equal(res.assets[0].kind, 'brand');
  assert.equal(res.design.brand.cover, res.assets[0].id);
  assert.ok(w.copies[0][1].startsWith(`tenants/${w.U2}/presentations/${w.D2}/`));
  // Không áp vào bài của người khác.
  await assert.rejects(w.svc.apply({ id: w.U2 }, w.D1, t.id), { status: 404 });
  await assert.rejects(w.svc.update({ id: w.U1 }, t.id, { visibility: 'everyone' }), { code: 'INVALID_VISIBILITY' });
});
