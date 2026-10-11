// Kiểm thử nhận diện hình đưa vào bài (ảnh giao diện phần mềm + sơ đồ): vùng cắt (boxToRegion), cắt thật bằng AI giả lập
// (extractVisuals, cần pdftoppm), làm sạch tệp Office trước LibreOffice (sanitizeOffice), gộp ảnh nhúng trùng (mergeEmbedded),
// đặt sơ đồ (placeDiagrams) + ảnh không bắt buộc vào dàn ý (placeUserMedia force=false), khung trình duyệt, renderer tấm nền trắng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import JSZip from 'jszip';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { boxToRegion, extractVisuals, sanitizeOffice, mergeEmbedded, dHash } from '../../src/services/visualService.js';
import { placeUserMedia, placeDiagrams, normalizeOutline, applyOutlineMedia } from '../../src/services/outlineService.js';
import { readBuffer } from '../../src/services/ingestService.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';
import { PDFDocument, rgb } from 'pdf-lib';

const U = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const slide = (layout, extra = {}) => ({ id: `s-${Math.random().toString(36).slice(2, 8)}`, layout, title: layout, subtitle: '', points: ['x'], notes: '', images: [], video: null, ...extra });

test('boxToRegion: toạ độ 0–1000 → điểm ảnh có nới mép; bỏ vùng quá nhỏ / gần cả trang / sai dạng', () => {
  const r = boxToRegion([200, 100, 800, 600], 2000, 1125);
  assert.ok(r.left < 200 && r.left >= 180 && r.top < 225 && r.width > 1000 && r.height > 675);
  assert.ok(r.left + r.width <= 2000 && r.top + r.height <= 1125);
  assert.equal(boxToRegion([0, 0, 50, 900], 2000, 1125), null, 'hẹp hơn 12% cạnh trang');
  assert.equal(boxToRegion([0, 0, 1000, 1000], 2000, 1125), null, 'cả trang slide');
  assert.equal(boxToRegion([1, 2, 3], 2000, 1125), null);
  assert.equal(boxToRegion(['a', 0, 500, 500], 2000, 1125), null);
  const edge = boxToRegion([-50, 850, 400, 1200], 2000, 1125);
  assert.ok(edge.left + edge.width <= 2000 && edge.top === 0, 'kẹp trong trang');
  // Sơ đồ: nới rộng hơn (nhãn/mũi tên sát mép), nhận vùng hẹp hơn một chút (sơ đồ quy trình dài, thấp).
  const d = boxToRegion([200, 100, 800, 600], 2000, 1125, 'diagram');
  assert.ok(d.left < r.left && d.width > r.width);
  assert.ok(boxToRegion([400, 50, 510, 950], 2000, 1125, 'diagram'), 'sơ đồ ngang 11% chiều cao');
  assert.equal(boxToRegion([400, 50, 510, 950], 2000, 1125), null, 'ảnh giao diện 11% → quá nhỏ');
});

const hasPdftoppm = (() => {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('extractVisuals: render trang, cắt ảnh giao diện + sơ đồ AI chỉ ra, xén nền thừa của sơ đồ, bỏ hình trùng/chất lượng thấp', { skip: !hasPdftoppm && 'thiếu pdftoppm' }, async () => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < 2; i += 1) {
    const p = doc.addPage([960, 540]);
    p.drawRectangle({ x: 480, y: 100, width: 400, height: 340, color: rgb(0.2, 0.4, 0.9) });
    p.drawRectangle({ x: 520, y: 140, width: 120, height: 60, color: rgb(1, 1, 1) });
    // "sơ đồ": 3 khối nối nhau ở nửa trái
    for (let k = 0; k < 3; k += 1) p.drawRectangle({ x: 60 + k * 130, y: 240, width: 90, height: 60, color: rgb(0.9, 0.5, 0.1) });
    p.drawRectangle({ x: 150, y: 268, width: 220, height: 4, color: rgb(0.1, 0.1, 0.1) });
  }
  const buffer = Buffer.from(await doc.save());
  let seen = null;
  const gemini = {
    async locateVisuals({ pages }) {
      seen = pages;
      return {
        shots: [
          { page: 1, kind: 'screenshot', box_2d: [185, 500, 815, 917], device: 'web', diagramType: 'none', title: 'Bảng điều khiển', quality: 3 },
          { page: 1, kind: 'diagram', box_2d: [380, 40, 620, 480], device: 'web', diagramType: 'process', title: 'Quy trình 3 bước', quality: 3 },
          { page: 2, kind: 'screenshot', box_2d: [185, 500, 815, 917], device: 'web', diagramType: 'none', title: 'Trùng trang 1', quality: 3 },
          { page: 2, kind: 'screenshot', box_2d: [0, 0, 300, 300], device: 'mobile', diagramType: 'none', title: 'Mờ', quality: 1 },
          { page: 2, kind: 'chart', box_2d: [0, 0, 500, 500], device: 'web', diagramType: 'none', title: 'Loại lạ', quality: 3 },
          { page: 9, kind: 'diagram', box_2d: [0, 0, 500, 500], device: 'web', diagramType: 'model', title: 'Trang không tồn tại', quality: 3 },
        ],
      };
    },
  };
  const shots = await extractVisuals([{ name: 'demo.pdf', kind: 'pdf', buffer }], { gemini, tempDir: mkdtempSync(join(tmpdir(), 'shots-')) });
  assert.equal(seen.length, 2, 'AI xem ảnh mọi trang');
  assert.equal(shots.length, 2, 'bỏ hình trùng, chất lượng thấp, loại lạ, trang lạ');
  const ui = shots.find((x) => x.ui);
  const dg = shots.find((x) => x.diagram);
  assert.equal(ui.ui.device, 'web');
  assert.match(ui.hint, /ẢNH GIAO DIỆN PHẦN MỀM \(web\) cắt từ trang 1 của "demo\.pdf": Bảng điều khiển/);
  assert.deepEqual(dg.diagram, { type: 'process', page: 1, title: 'Quy trình 3 bước' });
  assert.match(dg.hint, /^SƠ ĐỒ quy trình cắt từ trang 1/);
  // Vùng AI khoanh rộng (44% × 24% trang) → xén còn sát 3 khối (+ lề mỏng).
  const m = await sharp(dg.buffer).metadata();
  assert.ok(m.width < 0.44 * 2000 * 0.9, `đã xén ngang (${m.width}px)`);
  // AI lỗi / thiếu công cụ → không làm hỏng lượt tạo bài
  const none = await extractVisuals([{ name: 'x.pdf', kind: 'pdf', buffer }], { gemini: { locateVisuals: async () => { throw new Error('quota'); } }, tempDir: tmpdir() });
  assert.deepEqual(none, []);
  assert.deepEqual(await extractVisuals([{ name: 'x.pdf', kind: 'pdf', buffer }], { gemini, bin: 'khong-co-pdftoppm', tempDir: tmpdir() }), []);
  // Thiếu LibreOffice → bỏ qua tệp Office, vẫn xử lý PDF.
  const mixed = await extractVisuals(
    [{ name: 'a.pptx', kind: 'office', ext: 'pptx', buffer: await (await officeZip()).generateAsync({ type: 'nodebuffer' }) }, { name: 'demo.pdf', kind: 'pdf', buffer }],
    { gemini, soffice: 'khong-co-soffice', tempDir: mkdtempSync(join(tmpdir(), 'shots-')) },
  );
  assert.equal(mixed.length, 2);
});

// Gói OOXML tối thiểu có liên kết ngoài, trường INCLUDEPICTURE, macro — đầu vào của sanitizeOffice.
async function officeZip() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('ppt/presentation.xml', '<p:presentation/>');
  zip.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId1" Type="http://x/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="http://x/image" Target="http://169.254.169.254/latest" TargetMode="External"/><Relationship Id="rId3" Type="http://x/oleObject" TargetMode="External" Target="file:///etc/passwd"/></Relationships>');
  zip.file('word/document.xml', '<w:document><w:r><w:instrText xml:space="preserve"> INCLUDEPICTURE "http://evil/x.png" \\d </w:instrText></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:fldSimple w:instr=" INCLUDETEXT c:\\secret.txt "><w:r/></w:fldSimple></w:document>');
  zip.file('ppt/vbaProject.bin', 'macro');
  zip.file('content.xml', '<office:document><draw:image xlink:href="Pictures/a.png"/><draw:image xlink:href="https://evil/b.png"/><draw:object xlink:href="/etc/passwd"/><draw:object xlink:href="./Object 1"/></office:document>');
  return zip;
}

test('sanitizeOffice: bỏ quan hệ ngoài (SSRF/tệp cục bộ), trường nhúng nội dung ngoài, macro; giữ quan hệ nội bộ', async () => {
  const out = await JSZip.loadAsync(await sanitizeOffice(await (await officeZip()).generateAsync({ type: 'nodebuffer' })));
  const rels = await out.file('ppt/slides/_rels/slide1.xml.rels').async('string');
  assert.match(rels, /Target="\.\.\/media\/image1\.png"/);
  assert.ok(!/169\.254|etc\/passwd|External/.test(rels));
  const docx = await out.file('word/document.xml').async('string');
  assert.ok(!/INCLUDEPICTURE|INCLUDETEXT|evil|secret/.test(docx));
  assert.match(docx, / PAGE /, 'trường thường giữ nguyên');
  assert.equal(out.file('ppt/vbaProject.bin'), null);
  const odf = await out.file('content.xml').async('string');
  assert.match(odf, /xlink:href="Pictures\/a\.png"/);
  assert.match(odf, /xlink:href="\.\/Object 1"/);
  assert.ok(!/evil|etc\/passwd/.test(odf));
});

test('readBuffer: PPTX/DOCX giữ tệp gốc (docs) để render trang; XLSX thì không', async () => {
  const pptx = new JSZip();
  pptx.file('ppt/presentation.xml', '<p/>');
  pptx.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:t>Xin chào</a:t></a:p></p:sld>');
  const buf = await pptx.generateAsync({ type: 'nodebuffer' });
  const r = await readBuffer(buf, 'demo.pptx', { maxTextChars: 1000 }, 'zip');
  assert.equal(r.docs.length, 1);
  assert.equal(r.docs[0].ext, 'pptx');
  assert.equal(r.docs[0].buffer, buf);
  const docx = new JSZip();
  docx.file('word/document.xml', '<w:document><w:p><w:r><w:t>Chào</w:t></w:r></w:p></w:document>');
  assert.equal((await readBuffer(await docx.generateAsync({ type: 'nodebuffer' }), 'a.docx', { maxTextChars: 1000 }, 'zip')).docs[0].ext, 'docx');
});

test('mergeEmbedded: ảnh nhúng trùng hình đã cắt → bỏ ảnh nhúng (ảnh gốc nét hơn thay nội dung hình cắt)', async () => {
  const pattern = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: Math.round(w / 2), height: Math.round(h / 3), channels: 3, background: '#1d4ed8' } }, left: Math.round(w / 8), top: Math.round(h / 4) }])
    .jpeg().toBuffer();
  const cut = await pattern(600, 400);
  const original = await pattern(1600, 1067);
  const other = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#ff0000' } }).composite([{ input: { create: { width: 100, height: 500, channels: 3, background: '#00ff00' } }, left: 600, top: 50 }]).jpeg().toBuffer();
  const shots = [{ buffer: cut, hash: await dHash(cut), ui: { device: 'web' } }];
  const r = await mergeEmbedded(shots, [{ buffer: original, name: 'image1.jpg' }, { buffer: other, name: 'image2.jpg' }]);
  assert.equal(r.merged, 1);
  assert.equal(r.images.length, 1);
  assert.equal(r.images[0].name, 'image2.jpg');
  assert.equal(shots[0].buffer, original, 'dùng ảnh gốc nét hơn');
  assert.deepEqual((await mergeEmbedded([], [{ buffer: other }])).images.length, 1);
});

test('placeDiagrams: mỗi sơ đồ 1 trang ảnh lớn; gỡ khỏi trang thẻ/bộ sưu tập/bìa; sơ đồ thừa → trang mới cạnh nội dung liên quan', () => {
  const dg = (n, title) => ({ asset: U(n), title });
  const slides = [
    slide('cover', { images: [{ asset: U(1), caption: '' }] }),
    slide('bullets', { title: 'Quy trình phê duyệt chứng từ', points: ['a', 'b'], images: [{ asset: U(2), caption: 'x' }] }),
    slide('gallery', { images: [{ asset: U(3), caption: '' }, { asset: U(9), caption: '' }] }),
    slide('cards', { title: 'Kiến trúc tích hợp ngân hàng', points: ['1', '2', '3', '4', '5'] }),
    slide('bullets', { title: 'Khác', points: ['a'], images: [{ asset: U(2), caption: '' }] }),
    slide('closing'),
  ];
  const r = placeDiagrams(slides, [dg(1, 'Mô hình tổng thể'), dg(2, 'Quy trình phê duyệt'), dg(3, 'Kiến trúc tích hợp ngân hàng AMIS')], { room: 2 });
  assert.equal(slides[0].images.length, 0, 'không để sơ đồ ở bìa');
  assert.equal(slides[1].layout, 'image');
  assert.deepEqual(slides[1].images, [{ asset: U(2), caption: 'x', fit: 'contain' }]);
  assert.equal(slides[2].layout, 'image', 'bộ sưu tập còn 1 ảnh chụp');
  assert.deepEqual(slides[2].images.map((x) => x.asset), [U(9)]);
  assert.equal(slides.find((s) => s.title === 'Khác').images.length, 0, 'sơ đồ trùng bị bỏ');
  assert.equal(r.added, 2);
  const kt = slides.findIndex((s) => s.title === 'Kiến trúc tích hợp ngân hàng AMIS');
  assert.equal(slides[kt - 1].title, 'Kiến trúc tích hợp ngân hàng', 'đặt ngay sau trang cùng chủ đề');
  assert.deepEqual(slides[kt].images, [{ asset: U(3), caption: '', fit: 'contain' }]);
  assert.equal(slides.at(-1).layout, 'closing');
  assert.equal(r.placed, 3);
  // Hết hạn mức trang: gắn vào trang chữ ngắn chưa có media, không có thì bỏ.
  const tight = [slide('cover'), slide('bullets', { title: 'Mô hình vận hành', points: ['a'] }), slide('closing')];
  const r2 = placeDiagrams(tight, [dg(5, 'Mô hình vận hành mới'), dg(6, 'Sơ đồ tổ chức')], { room: 0 });
  assert.equal(tight[1].layout, 'image');
  assert.equal(tight[1].images[0].asset, U(5));
  assert.equal(r2.placed, 1);
  assert.equal(tight.length, 3);
});

test('placeUserMedia force=false: chỉ vào trang chữ ngắn hoặc trang mới khi còn hạn mức; hết chỗ thì bỏ, giữ khung trình duyệt', () => {
  const shot = (n) => ({ asset: U(n), fit: 'contain', frame: 'browser' });
  const full = [slide('cover'), slide('cards', { points: ['a', 'b', 'c', 'd', 'e', 'f'] }), slide('stats'), slide('closing')];
  const r0 = placeUserMedia(full, { images: [shot(1)], videos: [] }, { room: 0, force: false });
  assert.equal(r0.added, 0);
  assert.equal(full.flatMap((s) => s.images).length, 0, 'không ép vào trang thẻ 6 dòng / số liệu / bìa');

  const withRoom = [slide('cover'), slide('stats'), slide('closing')];
  const r1 = placeUserMedia(withRoom, { images: [1, 2, 3, 4, 5].map(shot), videos: [] }, { room: 1, force: false, chunk: 4, title: 'Giao diện sản phẩm' });
  assert.equal(r1.added, 1, 'thêm đúng 1 trang (hạn mức)');
  const g = withRoom.find((s) => s.title === 'Giao diện sản phẩm');
  assert.equal(g.layout, 'gallery');
  assert.equal(g.images.length, 4, 'tối đa 4 ảnh giao diện mỗi trang');
  assert.deepEqual(g.images[0], { asset: U(1), caption: '', fit: 'contain', frame: 'browser' });
  assert.equal(withRoom.at(-1).layout, 'closing');

  const text = [slide('cover'), slide('bullets', { points: ['a', 'b'] }), slide('closing')];
  placeUserMedia(text, { images: [shot(9)], videos: [] }, { room: 0, force: false });
  assert.equal(text[1].images[0].frame, 'browser', 'trang chữ ngắn nhận ảnh');
});

test('khung trình duyệt: dàn ý → slide → spec giữ frame (chỉ với ảnh trọn khung)', () => {
  const { outline } = normalizeOutline({ title: 'T', slides: [{ layout: 'image', title: 'Màn hình', points: ['a'], images: [{ asset: U(1), fit: 'contain', frame: 'browser' }] }] });
  assert.deepEqual(outline.slides[0].images[0], { asset: U(1), caption: '', fit: 'contain', frame: 'browser' });
  const s = applyOutlineMedia({ layout: 'image', items: [] }, outline.slides[0]);
  assert.equal(s.image.frame, 'browser');
  const { spec } = normalizeSpec({ title: 'T', slides: [{ layout: 'image', title: 'A', image: { asset: U(1), fit: 'contain', frame: 'browser' } }, { layout: 'image', title: 'B', image: { asset: U(2), fit: 'cover', frame: 'browser' } }] });
  assert.equal(spec.slides[0].image.frame, 'browser');
  assert.equal(spec.slides[1].image.frame, undefined, 'ảnh chụp (cover) không có khung');
});

test('renderer: ảnh trọn khung → tấm nền trắng đúng tỷ lệ asset, khung trình duyệt; ảnh rất ngang → cột ảnh rộng', () => {
  const { spec } = normalizeSpec({
    title: 'T',
    slides: [
      { layout: 'image', title: 'Bảng', caption: 'Quản lý người dùng', items: [{ title: 'a', text: 'b' }], image: { asset: U(1), fit: 'contain', frame: 'browser' } },
      { layout: 'image', title: 'Ảnh', image: { asset: U(2), fit: 'cover' } },
    ],
  });
  const meta = { [U(1)]: { width: 2600, height: 1000 }, [U(2)]: { width: 1600, height: 900 } };
  const html = renderDeckHtml(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}`, assetMeta: (id) => meta[id] || null, css: '', engineJs: '' });
  assert.match(html, /class="media plate web cap" style="--ar:2\.6000"/);
  assert.match(html, /class="pbar"/);
  assert.match(html, /class="im has-side wide/);
  assert.match(html, /<figcaption>Quản lý người dùng<\/figcaption>/);
  assert.equal((html.match(/class="media plate/g) || []).length, 1, 'ảnh chụp thật vẫn hiển thị kiểu cover');
});

test('F10: môi trường truyền cho LibreOffice/pdftoppm không chứa khoá/bí mật của ứng dụng', async () => {
  const { toolEnv } = await import('../../src/services/visualService.js');
  const keep = { ...process.env };
  Object.assign(process.env, { GEMINI_API_KEY: 'k-secret', SESSION_SECRET: 's-secret', DB_PASSWORD: 'p-secret', GOOGLE_API_KEY: 'g-secret', PATH: process.env.PATH || '/usr/bin' });
  try {
    const env = toolEnv({ HOME: '/tmp/x' });
    assert.equal(env.HOME, '/tmp/x');
    assert.ok(env.PATH);
    assert.ok(!JSON.stringify(env).includes('secret'), JSON.stringify(Object.keys(env)));
    assert.deepEqual(Object.keys(env).filter((k) => /KEY|SECRET|PASSWORD|TOKEN/i.test(k)), []);
  } finally {
    for (const k of ['GEMINI_API_KEY', 'SESSION_SECRET', 'DB_PASSWORD', 'GOOGLE_API_KEY']) if (!(k in keep)) delete process.env[k];
  }
});
