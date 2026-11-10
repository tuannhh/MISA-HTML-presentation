// Hình minh hoạ vector (AI_ART_VECTOR): làm sạch SVG do model viết, dựng PNG nền trong suốt, và luồng dựng bài dùng vector cho hình từng thẻ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { sanitizeSvg, renderVectorArt, vectorUserText, VECTOR_PROMPT, VECTOR_PALETTES } from '../../src/services/vectorArt.js';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';

const GOOD = `Đây là hình:
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" onload="alert(1)">
  <!-- chú thích -->
  <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9DBBFF"/><stop offset="1" stop-color="#245FDF"/></linearGradient></defs>
  <g transform="translate(0 2)">
    <rect x="24" y="30" width="80" height="60" rx="14" fill="url(#g1)" onclick="x()" style="fill:red"/>
    <circle cx="64" cy="60" r="18" fill="#FFFFFF" fill-opacity="0.5"/>
    <path d="M40 96 L88 96" stroke="#2B3A55" stroke-width="4" stroke-linecap="round" fill="none"/>
  </g>
</svg>
\`\`\``;

test('sanitizeSvg: giữ phần tử / thuộc tính cho phép, bỏ thuộc tính lạ (on*, style, width), dựng lại thẻ gốc', () => {
  const svg = sanitizeSvg(GOOD);
  assert.ok(svg);
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 128 128">/);
  assert.match(svg, /<linearGradient id="g1"/);
  assert.match(svg, /fill="url\(#g1\)"/);
  assert.doesNotMatch(svg, /onload|onclick|style=|width="512"|<!--/);
  assert.match(svg, /<\/g><\/svg>$/);
});

test('sanitizeSvg: từ chối phần tử ngoài danh sách, url ngoài, tham chiếu id không tồn tại, thẻ không đóng, hình quá ít nét', () => {
  const wrap = (inner) => `<svg viewBox="0 0 128 128">${inner}<rect x="1" y="1" width="9" height="9"/><rect x="1" y="1" width="9" height="9"/><rect x="1" y="1" width="9" height="9"/></svg>`;
  assert.equal(sanitizeSvg(wrap('<script>alert(1)</script>')), null);
  assert.equal(sanitizeSvg(wrap('<image href="http://x/y.png"/>')), null);
  assert.equal(sanitizeSvg(wrap('<text x="1" y="1">a</text>')), null);
  assert.equal(sanitizeSvg(wrap('<foreignObject><div/></foreignObject>')), null);
  assert.equal(sanitizeSvg(wrap('<use href="#a"/>')), null);
  assert.equal(sanitizeSvg(wrap('<rect fill="url(http://evil/x)" width="5" height="5"/>')), null);
  assert.equal(sanitizeSvg(wrap('<rect fill="url(#khong-co)" width="5" height="5"/>')), null);
  assert.equal(sanitizeSvg(wrap('<g><rect width="5" height="5"/>')), null, 'thẻ g không đóng');
  assert.equal(sanitizeSvg('<svg viewBox="0 0 128 128"><rect width="5" height="5"/></svg>'), null, 'chỉ 1 nét');
  assert.equal(sanitizeSvg('không có mã'), null);
  // Khai báo trước thẻ svg bị cắt bỏ (đầu ra dựng lại từ thẻ svg); khai báo / thực thể bên trong → từ chối.
  assert.doesNotMatch(sanitizeSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg><rect/><rect/><rect/></svg>'), /DOCTYPE|ENTITY/);
  assert.equal(sanitizeSvg('<svg><!ENTITY x "y"><rect/><rect/><rect/></svg>'), null);
  assert.equal(sanitizeSvg(wrap('<rect fill="&x;" width="5" height="5"/>')), null);
  assert.equal(sanitizeSvg(`<svg>${'<rect width="1" height="1"/>'.repeat(120)}</svg>`), null, 'quá nhiều nét');
  // thuộc tính href bị bỏ (không nằm trong danh sách) nhưng hình vẫn dùng được
  assert.ok(sanitizeSvg(wrap('<rect href="javascript:x" width="5" height="5"/>')));
});

test('renderVectorArt: PNG vuông nền trong suốt, hình cắt sát + lề đều; SVG rỗng / hình tí hon → null', async () => {
  const png = await renderVectorArt(sanitizeSvg(GOOD), { size: 256 });
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([info.width, info.height, info.channels], [256, 256, 4]);
  const a = (x, y) => data[(y * 256 + x) * 4 + 3];
  assert.equal(a(2, 2), 0, 'góc trong suốt');
  assert.equal(a(128, 128), 255, 'giữa hình đặc');
  // hình rộng 80/128 khung → sau khi cắt sát chiếm gần hết bề ngang (trừ lề 9% mỗi bên)
  let minX = 256, maxX = 0;
  for (let x = 0; x < 256; x += 1) if (a(x, 110) > 16) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
  assert.ok(minX >= 14 && minX <= 30 && maxX >= 225 && maxX <= 242, `lề đều: ${minX}–${maxX}`);
  // cạnh sắc: không có dải bán trong suốt rộng (lem) quanh mép khối
  let soft = 0;
  for (let x = 0; x < 256; x += 1) { const v = a(x, 110); if (v > 16 && v < 240) soft += 1; }
  assert.ok(soft <= 6, `mép sắc: ${soft} điểm bán trong suốt trên 1 dòng`);
  assert.equal(await renderVectorArt('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect x="0" y="0" width="0" height="0"/></svg>'), null);
  assert.equal(await renderVectorArt('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><circle cx="64" cy="64" r="3" fill="#000"/></svg>'), null);
});

test('lời nhắc vector: bảng màu theo màu phần, không cho text / image / script', () => {
  assert.match(vectorUserText('a truck', 'cyan'), /teal cyan/);
  assert.match(vectorUserText('a truck', 'cyan'), new RegExp(VECTOR_PALETTES.cyan.ramp[3]));
  assert.match(vectorUserText('a truck', 'khong-co'), /cobalt blue/);
  assert.match(VECTOR_PROMPT, /không text, image, filter, style, script/);
});

const os = (title, points = [], extra = {}) => ({ id: `s-${title}`, layout: 'auto', title, subtitle: '', points, notes: '', images: [], video: null, ...extra });

async function build(vectorArt, { failSubject = 'FAIL' } = {}) {
  process.env.NODE_ENV = 'test';
  const base = loadConfig();
  const config = { ...base, design: { direct: true }, aiImages: { ...base.aiImages, enabled: true, perDeck: 6, artPerDeck: 10, vectorArt } };
  const created = [];
  const st = {};
  const calls = { image: [], vector: [] };
  const outline = { title: 'Bài', options: { aiImages: true, tone: 'light' }, slides: [os('Bìa', ['a'], { layout: 'cover' }), os('Mục tiêu', ['Giao hàng: đúng hạn', 'Giá thành: tối ưu']), os('Rủi ro', ['Chậm', 'Thiếu'])] };
  const gemini = {
    async designDeck() {
      return {
        style: 'soft',
        parts: [],
        slides: [
          { ref: 'S1', layout: 'cover', variant: 'split', title: 'Bìa', art: 'a shield' },
          { ref: 'S2', layout: 'cards', variant: 'grid', title: 'Mục tiêu', art: '', items: [{ title: 'Giao hàng', text: 'đúng hạn', art: 'a truck with a clock' }, { title: 'Giá thành', text: 'tối ưu', art: 'a caliper and a coin' }] },
          { ref: 'S3', layout: 'cards', variant: 'grid', title: 'Rủi ro', art: '', items: [{ title: 'Chậm', art: 'a snail' }, { title: 'Thiếu', art: failSubject }] },
        ],
      };
    },
    async generateImage({ prompt }) {
      calls.image.push(prompt);
      if (/^FAIL/.test(prompt)) throw new Error('model lỗi');
      return { buffer: await sharp({ create: { width: 300, height: 300, channels: 3, background: '#F0EEEA' } }).png().toBuffer() };
    },
    async vectorArt({ subject, thinking }) {
      calls.vector.push({ subject, thinking });
      return /^FAIL/.test(subject) ? '<svg><script>x</script></svg>' : GOOD;
    },
  };
  const svc = createPresentationService({
    config,
    repos: {
      presentations: { async findOwned() { return { id: 'd1', tenant_id: 'u1', status: 'outline', ratio: '16:9', outline, outline_version: 1 }; }, async startBuildOwned() { return 1; }, async setGenerationResult(_t, _id, r) { st.spec = r.spec; }, async buildFailed(_t, _id, m) { st.failed = m; } },
      assets: { async create(_t, row) { created.push(row); }, async listMediaForPresentation() { return created.map((a) => ({ id: a.id, kind: a.kind, original_name: a.originalName })); } },
      versions: {},
    },
    storage: { async put() {} }, gemini, browser: {}, signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {},
  });
  await svc.build({ id: 'u1' }, 'd1', { outlineVersion: 1 }, '');
  const t = Date.now();
  while (!st.spec && !st.failed && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 20));
  assert.equal(st.failed, undefined, st.failed);
  return { spec: st.spec, created, calls };
}

test('buildDeck: hình từng thẻ là vector (model viết SVG), hình bìa vẫn là ảnh 3D; mã hỏng thử lại 1 lần rồi bỏ cả bộ của trang', async () => {
  const { spec, created, calls } = await build(true);
  assert.ok(spec.slides[0].image?.asset, 'bìa có hình');
  assert.equal(calls.image.length, 1, 'chỉ hình bìa đi đường vẽ ảnh');
  assert.ok(spec.slides[1].items.every((it) => it.image?.asset && it.image.frame === 'art'), 'trọn bộ hình vector cho từng thẻ');
  assert.ok(spec.slides[2].items.every((it) => !it.image), 'thiếu 1 hình → không gắn dở bộ hình');
  const fail = calls.vector.filter((c) => c.subject === 'FAIL');
  assert.deepEqual(fail.map((c) => c.thinking), ['low', ''], 'mã hỏng: thử lại 1 lần với mức suy luận mặc định');
  assert.equal(calls.vector.filter((c) => c.subject !== 'FAIL').length, 3);
  assert.equal(created.filter((a) => /^ai-hinh-vector-trang-2-muc-/.test(a.originalName)).length, 2);
  assert.equal(created.filter((a) => /^ai-hinh-3d-trang-1$/.test(a.originalName)).length, 1);
});

test('buildDeck: AI_ART_VECTOR tắt → mọi hình đi đường vẽ ảnh 3D như cũ', async () => {
  const { spec, calls, created } = await build(false, { failSubject: 'a box' });
  assert.equal(calls.vector.length, 0);
  assert.equal(calls.image.length, 5);
  assert.ok(spec.slides[1].items.every((it) => it.image?.asset));
  assert.equal(created.filter((a) => /^ai-hinh-vector-/.test(a.originalName)).length, 0);
});
