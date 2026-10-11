// Sơ đồ tổ chức (layout org) + vẽ lại sơ đồ đơn giản từ tư liệu (org / timeline / process thay cho ảnh cắt):
// chuẩn hoá spec, renderer, kiểm tra dữ liệu AI chép từ sơ đồ, dàn ý ↔ spec, đặt trang trong dàn ý, schema AI, sửa trên khung.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';
import { resolveVariant as pickVariant } from '../../shared/deck/variants.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { cleanRedraw } from '../../src/services/visualService.js';
import { redrawPoints, parseOrgPoints, applyRedraws, outlineSlideToSpec, composeDeckFromOutline } from '../../src/services/outlineService.js';
import { visualsResponseSchema, outlineResponseSchema, deckResponseSchema } from '../../src/services/geminiService.js';
import { applyFrameEdit } from '../../frontend/src/lib/editPaths.js';

const html = (spec, mode = 'present') => renderDeckHtml(spec, { ratio: '16:9', mode, assetUrl: () => null, css: '', engineJs: '' });
const branch = (t, n = 3) => ({ title: t, icon: 'cart', points: Array.from({ length: n }, (_, i) => `${t} ${i + 1}`) });
const ORG = { layout: 'org', title: 'Sơ đồ cơ cấu tổ chức', root: 'Chủ doanh nghiệp / Giám đốc', icon: 'user', columns: [branch('Kinh doanh'), branch('Vận hành'), branch('Kế toán', 4)] };

test('normalizeSpec org: ≤ 6 nhánh (so sánh vẫn ≤ 3), icon nhánh theo danh sách, root giữ khi đổi bố cục, thiếu nhánh → lùi bố cục', () => {
  const cols = Array.from({ length: 8 }, (_, i) => branch(`N${i}`));
  const { spec } = normalizeSpec({ title: 'T', slides: [{ ...ORG, columns: cols }, { ...ORG, layout: 'comparison', columns: cols }] }, { strict: false });
  assert.equal(spec.slides[0].columns.length, SPEC_LIMITS.orgBranches);
  assert.equal(spec.slides[1].columns.length, SPEC_LIMITS.columns);
  assert.equal(spec.slides[1].root, ORG.root, 'đổi qua lại bố cục không mất ô đứng đầu');
  const bad = normalizeSpec({ title: 'T', slides: [{ ...ORG, columns: [{ title: 'A', icon: '<x>', points: ['a'] }, { title: 'B', icon: 'users', points: [] }] }] }, { strict: false }).spec.slides[0];
  assert.equal('icon' in bad.columns[0], false);
  assert.equal(bad.columns[1].icon, 'users');
  assert.equal(normalizeSpec({ title: 'T', slides: [{ layout: 'org', title: 'x', columns: [] }] }, { strict: false }).spec.slides[0].layout, 'section');
  assert.ok(normalizeSpec({ title: 'T', slides: [{ ...ORG, root: 'a'.repeat(SPEC_LIMITS.root + 1) }] }, { strict: true }).errors.length);
});

test('renderer org: ô đứng đầu + đường nối + nhánh có icon, mục con; ô chữ sửa được; không ô gốc thì không đường nối', () => {
  const { spec } = normalizeSpec({ title: 'T', slides: [ORG, { ...ORG, root: '' }] }, { strict: false });
  const out = html({ ...spec, slides: [spec.slides[0]] }, 'edit');
  assert.match(out, /class="org-root"[^>]*>.*Chủ doanh nghiệp \/ Giám đốc/s);
  assert.match(out, /class="org-bus"/);
  assert.equal((out.match(/class="org-br"/g) || []).length, 3);
  assert.equal((out.match(/class="org-k"/g) || []).length, 10);
  for (const p of ['root', 'columns.0.title', 'columns.2.points.3']) assert.match(out, new RegExp(`data-e="${p.replace(/\./g, '\\.')}"`));
  assert.match(out, /--n:3/);
  const noRoot = html({ ...spec, slides: [spec.slides[1]] });
  assert.match(noRoot, /class="org noroot/);
  assert.doesNotMatch(noRoot, /org-wire|org-root/);
  // Chèn HTML vào nhãn → luôn escape.
  const evil = normalizeSpec({ title: 'T', slides: [{ ...ORG, root: '<img src=x onerror=1>' }] }, { strict: false }).spec;
  assert.doesNotMatch(html(evil), /<img src=x/);
});

test('biến thể org: ô khối chỉ khi chữ con đủ ngắn so với số nhánh', () => {
  const s = (n, len) => ({ ...ORG, variant: 'boxes', columns: Array.from({ length: n }, () => ({ title: 'A', points: ['x'.repeat(len)] })) });
  assert.equal(pickVariant(s(3, 40)), 'boxes');
  assert.equal(pickVariant(s(3, 60)), 'tree');
  assert.equal(pickVariant(s(6, 30)), 'tree');
});

test('cleanRedraw: chỉ nhận sơ đồ đơn giản (org 2–6 nhánh ≤ 8 mục, timeline 3–8 mốc, process 3–6 bước), nhãn quá dài → bỏ (không cắt chữ)', () => {
  const org = cleanRedraw({ type: 'org', root: '  Giám   đốc ', nodes: [{ title: 'A', value: 'x', items: ['a1', ''] }, { title: 'B', items: [] }] });
  assert.deepEqual(org, { type: 'org', root: 'Giám đốc', nodes: [{ title: 'A', value: '', items: ['a1'] }, { title: 'B', value: '', items: [] }] });
  assert.equal(cleanRedraw({ type: 'org', root: 'G', nodes: [{ title: 'A', items: [] }] }), null, '1 nhánh');
  assert.equal(cleanRedraw({ type: 'org', nodes: [{ title: 'A', items: Array(9).fill('x') }, { title: 'B', items: [] }] }), null, 'quá 8 mục');
  assert.equal(cleanRedraw({ type: 'none', nodes: [] }), null);
  assert.equal(cleanRedraw({ type: 'process', nodes: [{ title: 'a' }, { title: 'b' }] }), null, '< 3 bước');
  // Lộ trình thiếu mốc thời gian → coi là quy trình.
  const tl = cleanRedraw({ type: 'timeline', nodes: [{ title: 'a', value: '' }, { title: 'b', value: '' }, { title: 'c', value: 'Q3' }] });
  assert.equal(tl.type, 'process');
  // Nhãn dài quá giới hạn → không cắt (đổi nghĩa), bỏ vẽ lại để giữ ảnh gốc.
  assert.equal(cleanRedraw({ type: 'org', root: 'x'.repeat(SPEC_LIMITS.root + 1), nodes: [{ title: 'A' }, { title: 'B' }] }), null, 'gốc quá dài');
  assert.equal(cleanRedraw({ type: 'org', root: 'G', nodes: [{ title: 'A'.repeat(SPEC_LIMITS.colTitle + 1) }, { title: 'B' }] }), null, 'tên nhánh quá dài');
  assert.equal(cleanRedraw({ type: 'org', root: 'G', nodes: [{ title: 'A', items: ['m'.repeat(SPEC_LIMITS.point + 1)] }, { title: 'B' }] }), null, 'mục quá dài');
  assert.equal(cleanRedraw({ type: 'process', nodes: [{ title: 'a', items: ['1', '2', '3', '4', '5'] }, { title: 'b' }, { title: 'c' }] }), null, 'quá 4 mục');
  assert.equal(cleanRedraw({ type: 'org', root: 'x'.repeat(SPEC_LIMITS.root), nodes: [{ title: 'A' }, { title: 'B' }] }).root.length, SPEC_LIMITS.root, 'đúng giới hạn thì giữ');
});

test('dàn ý org: redrawPoints ↔ parseOrgPoints khứ hồi; outlineSlideToSpec dựng root + nhánh', () => {
  const r = { type: 'org', root: 'Chủ DN / Giám đốc', nodes: [{ title: 'Kinh doanh / Bán hàng', items: ['Tìm khách hàng', 'Tư vấn / chốt đơn'] }, { title: 'Kế toán', items: [] }] };
  const pts = redrawPoints(r);
  assert.deepEqual(pts, ['Đứng đầu: Chủ DN / Giám đốc', 'Kinh doanh / Bán hàng: Tìm khách hàng; Tư vấn / chốt đơn', 'Kế toán']);
  const org = parseOrgPoints(pts);
  assert.equal(org.root, r.root);
  assert.deepEqual(org.columns.map((c) => [c.title, c.points]), [['Kinh doanh / Bán hàng', ['Tìm khách hàng', 'Tư vấn / chốt đơn']], ['Kế toán', []]]);
  assert.deepEqual(redrawPoints({ type: 'timeline', nodes: [{ value: '2024', title: 'Ra mắt', items: ['a'] }, { value: 'Q2', title: '', items: ['x', 'y'] }] }), ['2024 — Ra mắt: a', 'Q2 — x: y']);
  const s = outlineSlideToSpec({ id: 's1', layout: 'org', title: 'Cơ cấu', subtitle: '', points: pts, notes: '', images: [], video: null }, 1, 3);
  assert.equal(s.layout, 'org');
  assert.equal(s.root, r.root);
  assert.equal(s.columns.length, 2);
  assert.equal(outlineSlideToSpec({ id: 's1', layout: 'org', title: 'x', subtitle: '', points: [], notes: '', images: [], video: null }, 1, 3).layout, 'bullets');
});

test('composeDeckFromOutline org: nội dung nhánh lấy đúng dàn ý (AI chỉ góp icon theo thứ tự)', () => {
  const outline = { title: 'T', footer: '', design: {}, slides: [{ id: 's1', layout: 'org', title: 'Cơ cấu', subtitle: '', points: ['Đứng đầu: Giám đốc', 'Bán hàng: A; B', 'Kế toán: C'], notes: '', images: [], video: null }] };
  const model = [{ ref: 'S1', layout: 'org', title: 'Cơ cấu', root: 'GIÁM ĐỐC (AI đổi)', columns: [{ title: 'Bán', icon: 'cart', points: ['A sai'] }, { title: 'KT', icon: 'coins', points: [] }] }];
  const s = composeDeckFromOutline(outline, model).slides[0];
  assert.equal(s.root, 'Giám đốc');
  assert.deepEqual(s.columns.map((c) => [c.title, c.icon, c.points]), [['Bán hàng', 'cart', ['A', 'B']], ['Kế toán', 'coins', ['C']]]);
});

test('applyRedraws: trang AI ghi mã → đổi bố cục + chép đúng; bỏ sót → thêm trang cạnh chủ đề / đổi trang chữ khi hết hạn mức; không đè media', () => {
  const mk = (layout, title, extra = {}) => ({ id: `s-${title}`, layout, title, subtitle: '', points: ['a'], notes: '', images: [], video: null, ...extra });
  const dr = (ref, title) => ({ ref, type: 'org', title, root: 'Giám đốc', nodes: [{ title: 'Kinh doanh', items: ['Bán hàng'] }, { title: 'Kế toán', items: [] }] });
  const slides = [mk('cover', 'Bìa'), mk('bullets', 'Cơ cấu doanh nghiệp nhỏ'), mk('bullets', 'Có ảnh', { images: [{ asset: 'x' }] }), mk('closing', 'Kết')];
  const refs = new Map([[slides[1], 'dr1'], [slides[2], 'DR2']]);
  const r = applyRedraws(slides, [dr('DR1', 'Sơ đồ tổ chức'), dr('DR2', 'Cơ cấu kế toán giám đốc')], { room: 1, refs });
  assert.deepEqual(r, { applied: 1, added: 1, converted: 0 });
  assert.equal(slides[1].layout, 'org');
  assert.equal(slides[1].title, 'Cơ cấu doanh nghiệp nhỏ', 'giữ tiêu đề AI');
  assert.deepEqual(slides[1].points, ['Đứng đầu: Giám đốc', 'Kinh doanh: Bán hàng', 'Kế toán']);
  assert.equal(slides.find((s) => s.title === 'Có ảnh').layout, 'bullets', 'trang có media không bị đổi');
  assert.equal(slides.at(-1).layout, 'closing');
  assert.equal(slides.filter((s) => s.layout === 'org').length, 2);
  // Hết hạn mức: đổi trang chữ cùng chủ đề (chung ≥ 3 từ), không có thì bỏ.
  const s2 = [mk('cover', 'Bìa'), mk('bullets', 'Phòng kinh doanh và kế toán', { points: ['Giám đốc điều hành'] }), mk('closing', 'Kết')];
  assert.deepEqual(applyRedraws(s2, [dr('DR1', '')], { room: 0 }), { applied: 0, added: 0, converted: 1 });
  assert.equal(s2[1].layout, 'org');
  const s3 = [mk('cover', 'Bìa'), mk('bullets', 'Chủ đề khác hẳn'), mk('closing', 'Kết')];
  assert.deepEqual(applyRedraws(s3, [dr('DR1', '')], { room: 0 }), { applied: 0, added: 0, converted: 0 });
});

test('schema AI: khoanh vùng có redraw; dàn ý có trường diagram khi có DRn; dựng bài có root + icon nhánh', () => {
  const shot = visualsResponseSchema().properties.shots.items;
  assert.ok(shot.required.includes('redraw'));
  assert.deepEqual(shot.properties.redraw.properties.type.enum, ['org', 'timeline', 'process', 'none']);
  assert.equal('diagram' in outlineResponseSchema({}).properties.slides.items.properties, false);
  assert.ok(outlineResponseSchema({ hasRedraws: true }).properties.slides.items.required.includes('diagram'));
  const deck = deckResponseSchema({}).properties.slides.items;
  assert.ok(deck.properties.layout.enum.includes('org'));
  assert.ok(deck.required.includes('root'));
  assert.ok(deck.properties.columns.items.required.includes('icon'));
});

test('editPaths: sửa ô đứng đầu trên khung xem trước, cắt theo giới hạn', () => {
  const { spec } = normalizeSpec({ title: 'T', slides: [ORG] }, { strict: false });
  assert.equal(applyFrameEdit(spec, 0, 'root', 'Tổng giám đốc'), true);
  assert.equal(spec.slides[0].root, 'Tổng giám đốc');
  applyFrameEdit(spec, 0, 'root', 'x'.repeat(500));
  assert.equal(spec.slides[0].root.length, SPEC_LIMITS.root);
});
