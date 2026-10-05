// Kiểm thử đợt "đa dạng bố cục + lọc ảnh thật + nguồn thô": chọn biến thể/phong cách (variants.js), chỉ giữ ảnh chụp
// (keepPhotoImages, imageTraits), nhận diện tệp (OLE/HEIC/AVIF/UTF-16/mã hoá cũ) và đọc XLSX/ODS/DOCX có bảng.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import sharp from 'sharp';
import { VARIANTS, STYLES, fits, resolveVariant, artDirect } from '../../shared/deck/variants.js';
import { renderDeck } from '../../src/services/renderService.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { keepPhotoImages } from '../../src/services/outlineService.js';
import { sniff, decodeText, IMAGE_TYPES } from '../../src/lib/fileType.js';
import { readBuffer } from '../../src/services/ingestService.js';
import { imageTraits, looksLikePhoto, looksLikeGraphic } from '../../src/services/imageService.js';

const LIMITS = { maxTextChars: 200000, maxUploadMb: 300, maxUploadFiles: 20 };
const it = (title, text = '', value = '') => ({ icon: 'sparkles', title, text, value });
const pct = (...v) => v.map((x) => ({ value: x, suffix: '%', label: `Chỉ số ${x}` }));

function sampleSpec() {
  const steps = [it('Khảo sát', 'Đánh giá', 'T1/2026'), it('Thí điểm', 'Một phòng ban', 'T3/2026'), it('Mở rộng', 'Toàn công ty', 'T6/2026'), it('Tối ưu', 'Đo lường', 'T12/2026')];
  const items = [it('Bán hàng', 'Tư vấn'), it('Kế toán', 'Hạch toán'), it('Nhân sự', 'Chấm công'), it('CSKH', 'Trả lời 24/7')];
  return normalizeSpec({
    title: 'Bài thử',
    slides: [
      { layout: 'cover', title: 'Đột phá', subtitle: 'AI Agent' },
      { layout: 'agenda', title: 'Nội dung', items },
      { layout: 'bullets', title: 'Lợi ích', items },
      { layout: 'stats', title: 'Hài lòng', stats: pct(95, 88, 72) },
      { layout: 'bullets', title: 'Rủi ro', items },
      { layout: 'cards', title: 'Nhóm Agent', items },
      { layout: 'timeline', title: 'Lộ trình', steps },
      { layout: 'process', title: 'Quy trình', steps },
      { layout: 'cards', title: 'Năng lực', items },
      { layout: 'stats', title: 'Doanh thu', stats: [{ value: 300, suffix: 'tỷ', label: 'HCM' }, { value: 210, suffix: 'tỷ', label: 'HN' }] },
      { layout: 'closing', title: 'Cảm ơn', tags: ['amis.misa.vn'] },
    ],
  }).spec;
}

/* ---------------- biến thể + phong cách ---------------- */
test('fits: biến thể chỉ hợp khi nội dung phù hợp (vòng % 0–100, thanh cùng đơn vị, mũi tên tên ngắn)', () => {
  assert.equal(fits('stats', 'rings', { stats: pct(95, 40) }), true);
  assert.equal(fits('stats', 'rings', { stats: [{ value: 300, suffix: 'tỷ' }] }), false, 'không phải %');
  assert.equal(fits('stats', 'rings', { stats: pct(120) }), false, 'quá 100%');
  assert.equal(fits('stats', 'bars', { stats: [{ value: 3, suffix: 'x' }, { value: 62, suffix: '%' }] }), false, 'khác đơn vị');
  assert.equal(fits('stats', 'bars', { stats: [{ value: 300, suffix: 'tỷ' }, { value: 210, suffix: 'Tỷ ' }] }), true);
  assert.equal(fits('gallery', 'mosaic', { images: [{ asset: 'a' }, { asset: 'b' }, { asset: 'c' }] }), true);
  assert.equal(fits('gallery', 'mosaic', { images: [{ asset: 'a' }, { asset: 'b' }] }), false);
  assert.equal(fits('image', 'full', { image: { asset: 'a' }, video: { provider: 'youtube', id: 'x' }, items: [] }), false, 'có video');
  const four = { steps: [it('A'), it('B'), it('C'), it('D')] };
  assert.equal(fits('process', 'chevrons', four, 16 / 9), true);
  assert.equal(fits('process', 'chevrons', four, 4 / 3), false, 'khung hẹp tối đa 3 bước');
  assert.equal(fits('process', 'chevrons', { steps: four.steps.map((s) => ({ ...s, title: 'Triển khai thí điểm diện rộng' })) }, 16 / 9), false, 'tên bước dài');
  // biến thể mặc định luôn hợp, tên lạ thì không
  for (const [layout, vs] of Object.entries(VARIANTS)) assert.equal(fits(layout, vs[0], {}), true, layout);
  assert.equal(fits('stats', 'pie', { stats: pct(50) }), false);
});

test('resolveVariant: người dùng sửa nội dung làm biến thể hết hợp → quay về mặc định', () => {
  assert.equal(resolveVariant({ layout: 'stats', variant: 'rings', stats: pct(50, 60) }), 'rings');
  assert.equal(resolveVariant({ layout: 'stats', variant: 'rings', stats: [{ value: 5, suffix: 'tỷ' }] }), 'cards');
  assert.equal(resolveVariant({ layout: 'quote', variant: '' }), 'classic');
  assert.equal(resolveVariant({ layout: 'không-có' }), '');
});

test('artDirect: xác định theo hạt giống, chỉ chọn biến thể hợp lệ, hạt giống khác → bài khác', () => {
  const a = artDirect(sampleSpec(), { seed: 'abc' });
  const b = artDirect(sampleSpec(), { seed: 'abc' });
  assert.deepEqual(a.slides.map((s) => s.variant), b.slides.map((s) => s.variant));
  assert.equal(a.style, b.style);
  assert.ok(STYLES.includes(a.style));
  for (const s of a.slides) {
    assert.ok(s.variant === '' || VARIANTS[s.layout].includes(s.variant), `${s.layout}:${s.variant}`);
    assert.ok(fits(s.layout, s.variant || VARIANTS[s.layout][0], s), `${s.layout}:${s.variant} không hợp nội dung`);
  }
  const looks = new Set();
  for (let i = 0; i < 30; i += 1) {
    const d = artDirect(sampleSpec(), { seed: i });
    looks.add(`${d.style}|${d.slides.map((s) => s.variant).join(',')}`);
  }
  assert.ok(looks.size >= 25, `30 hạt giống chỉ ra ${looks.size} kiểu bài`);
  assert.equal(artDirect(sampleSpec(), { seed: 1, style: 'soft' }).style, 'soft');
});

test('artDirect: hai trang cùng bố cục trong bài hiếm khi trùng kiểu', () => {
  let same = 0;
  const N = 200;
  for (let i = 0; i < N; i += 1) {
    const d = artDirect(sampleSpec(), { seed: `s${i}` });
    const bullets = d.slides.filter((s) => s.layout === 'bullets');
    if (bullets[0].variant === bullets[1].variant) same += 1;
  }
  assert.ok(same / N < 0.2, `trùng ${same}/${N}`);
});

test('normalizeSpec: giữ style/variant hợp lệ, bỏ giá trị lạ; renderer gắn data-style + lớp V-*', () => {
  const { spec } = normalizeSpec({ title: 'x', style: 'soft', slides: [{ layout: 'stats', variant: 'rings', title: 't', stats: pct(90) }, { layout: 'bullets', variant: '<script>', title: 't', items: [it('a'), it('b')] }] });
  assert.equal(spec.style, 'soft');
  assert.equal(spec.slides[0].variant, 'rings');
  assert.equal(spec.slides[1].variant, '');
  assert.equal(normalizeSpec({ title: 'x', style: 'evil', slides: [{ layout: 'cover', title: 'a' }] }).spec.style, 'neon');
  const html = renderDeck(spec, { mode: 'print', assetUrl: () => null });
  assert.match(html, /data-style="soft"/);
  assert.match(html, /V-rings/);
  assert.match(html, /data-a="ring"/);
  assert.doesNotMatch(html, /<script>[^<]*V-/);
});

test('renderer: mọi biến thể dựng được (không lỗi, không lọt chuỗi chưa thoát)', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const content = {
    items: [it(evil, evil), it('B', 'b'), it('C', 'c'), it('D', 'd')],
    steps: [it(evil, evil, evil), it('B', 'b', 'T2'), it('C', 'c', 'T3'), it('D', 'd', 'T4')],
    stats: pct(90, 80, 70),
    images: [{ asset: 'a', caption: evil }, { asset: 'b' }, { asset: 'c' }],
    image: { asset: 'a' },
    columns: [{ title: evil, points: [evil] }, { title: 'Sau', points: ['x'] }],
    quote: { text: evil, author: evil },
    tags: [evil],
    caption: evil,
  };
  for (const [layout, vs] of Object.entries(VARIANTS)) {
    for (const v of vs) {
      const { spec } = normalizeSpec({ title: 't', slides: [{ layout, variant: v, title: evil, ...content }] });
      const html = renderDeck(spec, { mode: 'print', assetUrl: (id) => `https://x.test/${id}.jpg` });
      assert.doesNotMatch(html, /<img src=x/, `${layout}:${v}`);
    }
  }
});

/* ---------------- chỉ giữ ảnh chụp thật ---------------- */
test('keepPhotoImages: bỏ infographic, trang ảnh hết ảnh → tự chọn bố cục, gallery còn 1 ảnh → image', () => {
  const slides = [
    { layout: 'stats', images: [{ asset: 'info' }] },
    { layout: 'image', images: [{ asset: 'info' }] },
    { layout: 'gallery', images: [{ asset: 'p1' }, { asset: 'chart' }] },
    { layout: 'image', images: [{ asset: 'chart' }], video: { provider: 'youtube', id: 'x' } },
    { layout: 'gallery', images: [{ asset: 'p1' }, { asset: 'p2' }] },
  ];
  const dropped = keepPhotoImages(slides, (id) => id.startsWith('p'));
  assert.equal(dropped, 4);
  assert.deepEqual(slides.map((s) => s.layout), ['stats', 'auto', 'image', 'image', 'gallery']);
  assert.deepEqual(slides[0].images, []);
  assert.equal(slides[4].images.length, 2);
});

test('imageTraits: ảnh chụp (chuyển màu mượt) khác đồ hoạ phẳng (mảng màu + chữ sắc nét)', async () => {
  const W = 400;
  const H = 300;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = (y * W + x) * 3;
      const n = Math.sin(x * 0.05) * 20 + Math.cos(y * 0.07) * 20;
      px[i] = 90 + (x * 120) / W + n;
      px[i + 1] = 120 + (y * 80) / H - n;
      px[i + 2] = 150 + n;
    }
  }
  const photo = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).blur(1.2).jpeg().toBuffer();
  const bars = Array.from({ length: 12 }, (_, i) => `<rect x="${30 + i * 30}" y="${280 - i * 18}" width="18" height="${i * 18 + 10}" fill="${i % 2 ? '#1d4ed8' : '#f59e0b'}"/>`).join('');
  const text = Array.from({ length: 8 }, (_, i) => `<text x="20" y="${30 + i * 18}" font-size="14" font-family="Arial" fill="#111">Doanh thu quý ${i + 1}: 300 tỷ đồng</text>`).join('');
  const info = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${bars}${text}</svg>`)).png().toBuffer();
  const tp = await imageTraits(photo);
  const tg = await imageTraits(info);
  assert.ok(looksLikePhoto(tp), JSON.stringify(tp));
  assert.ok(!looksLikeGraphic(tp), JSON.stringify(tp));
  assert.ok(looksLikeGraphic(tg), JSON.stringify(tg));
  assert.ok(!looksLikePhoto(tg), JSON.stringify(tg));
  assert.equal(looksLikePhoto(null), false);
});

/* ---------------- nhận diện tệp + giải mã chữ ---------------- */
const ftyp = (major, ...compat) => {
  const brands = Buffer.from([major, '\0\0\0\0', ...compat].join(''), 'latin1');
  const size = 8 + brands.length;
  const b = Buffer.alloc(size + 16);
  b.writeUInt32BE(size, 0);
  b.write('ftyp', 4, 'latin1');
  brands.copy(b, 8);
  return b;
};

test('sniff: Office đời cũ (OLE), HEIC, AVIF, văn bản UTF-16 và mã hoá cũ', () => {
  assert.equal(sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0])), 'ole');
  assert.equal(sniff(ftyp('heic', 'mif1', 'heic')), 'heic');
  assert.equal(sniff(ftyp('mif1', 'mif1', 'heic')), 'heic');
  assert.equal(sniff(ftyp('avif', 'avif', 'mif1')), 'avif');
  assert.ok(IMAGE_TYPES.has('avif') && !IMAGE_TYPES.has('heic'));
  assert.equal(sniff(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Tên,Số\n', 'utf16le')])), 'text');
  assert.equal(sniff(Buffer.from('Ten,So luong\nHa Noi,3\n', 'latin1')), 'text');
  // khung MP3 thật (FF FB / FF FE + dữ liệu nhị phân) vẫn là ghi âm
  assert.equal(sniff(Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0])), 'mp3');
  assert.equal(sniff(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from([0x00, 0x00, 0x01, 0x02, 0x03, 0x00, 0x1f, 0x00])])), 'mp3');
});

test('decodeText: UTF-8 (có/không BOM), UTF-16 LE/BE, Windows-1258 → chuỗi NFC', () => {
  const s = 'Doanh thu Hà Nội';
  assert.equal(decodeText(Buffer.from(s, 'utf8')), s);
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(s, 'utf8')])), s);
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(s, 'utf16le')])), s);
  const le = Buffer.from(s, 'utf16le');
  const be = Buffer.alloc(le.length);
  for (let i = 0; i < le.length; i += 2) { be[i] = le[i + 1]; be[i + 1] = le[i]; }
  assert.equal(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), s);
  // "Hà Nội" trong Windows-1258: à = E0, ộ = ô (F4) + dấu nặng tổ hợp (F2)
  const cp1258 = Buffer.from([0x48, 0xe0, 0x20, 0x4e, 0xf4, 0xf2, 0x69]);
  const out = decodeText(cp1258);
  assert.equal(out, 'Hà Nội');
  assert.equal(out, out.normalize('NFC'));
});

/* ---------------- đọc bảng tính / văn bản có bảng ---------------- */
async function xlsx() {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types/>');
  z.file('xl/workbook.xml', '<workbook xmlns:r="r"><sheets><sheet name="Doanh thu" sheetId="1" r:id="rId1"/><sheet name="Ẩn" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
  z.file('xl/sharedStrings.xml', '<sst><si><t>Chi nhánh</t></si><si><t>Doanh thu</t></si><si><t>Tỷ lệ</t></si><si><t>Ngày</t></si><si><r><t>Hà </t></r><r><t>Nội</t></r></si></sst>');
  z.file('xl/styles.xml', '<styleSheet><numFmts><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="14"/></cellXfs></styleSheet>');
  z.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>
    <row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2"><v>210</v></c><c r="C2" s="1"><v>0.125</v></c><c r="D2" s="2"><v>46023</v></c></row>
    <row r="3"><c r="A3" t="inlineStr"><is><t>Đà Nẵng</t></is></c><c r="C3" s="1"><v>0.5</v></c></row>
  </sheetData></worksheet>`);
  z.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>BÍ MẬT</t></is></c></row></sheetData></worksheet>');
  return z.generateAsync({ type: 'nodebuffer' });
}

test('readBuffer XLSX: bảng có tên cột, % và ngày định dạng đúng, trang tính ẩn được đánh dấu', async () => {
  const buf = await xlsx();
  assert.equal(sniff(buf), 'zip');
  const { pieces } = await readBuffer(buf, 'so-lieu.xlsx', LIMITS);
  const text = pieces.map((p) => p.text).join('\n');
  assert.match(text, /Doanh thu/);
  assert.match(text, /Chi nhánh.*Doanh thu.*Tỷ lệ.*Ngày/);
  assert.match(text, /Hà Nội.*210.*12[.,]5%.*01\/01\/2026/);
  assert.match(text, /Đà Nẵng/);
  assert.match(text, /"Ẩn" \(ẩn\)/);
});

test('readBuffer DOCX: giữ bảng (dạng hàng | cột) và đoạn văn theo đúng thứ tự', async () => {
  const z = new JSZip();
  z.file('[Content_Types].xml', '<Types/>');
  const p = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
  const tc = (t) => `<w:tc>${p(t)}</w:tc>`;
  z.file('word/document.xml', `<w:document><w:body>${p('ghi chu hop giao ban')}<w:tbl><w:tr>${tc('Chi nhánh')}${tc('Doanh thu')}</w:tr><w:tr>${tc('Hà Nội')}${tc('210 tỷ')}</w:tr></w:tbl>${p('Kết luận cuối')}</w:body></w:document>`);
  const buf = await z.generateAsync({ type: 'nodebuffer' });
  const { pieces } = await readBuffer(buf, 'ghi-chu.docx', LIMITS);
  const text = pieces[0].text;
  assert.match(text, /\|\s*Chi nhánh\s*\|\s*Doanh thu\s*\|/);
  assert.match(text, /\|\s*Hà Nội\s*\|\s*210 tỷ\s*\|/);
  assert.ok(text.indexOf('ghi chu hop') < text.indexOf('Chi nhánh') && text.indexOf('210 tỷ') < text.indexOf('Kết luận'));
});

test('readBuffer ODS + Office đời cũ: đọc bảng ODF; .doc/.xls báo cách lưu lại', async () => {
  const z = new JSZip();
  z.file('mimetype', 'application/vnd.oasis.opendocument.spreadsheet');
  z.file('content.xml', '<office:document-content><office:body><office:spreadsheet><table:table table:name="Số liệu"><table:table-row><table:table-cell><text:p>Tỉnh</text:p></table:table-cell><table:table-cell><text:p>Khách hàng</text:p></table:table-cell></table:table-row><table:table-row><table:table-cell><text:p>Cần Thơ</text:p></table:table-cell><table:table-cell office:value="60"><text:p>60</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>');
  const { pieces } = await readBuffer(await z.generateAsync({ type: 'nodebuffer' }), 'so-lieu.ods', LIMITS);
  assert.match(pieces[0].text, /Tỉnh.*Khách hàng/);
  assert.match(pieces[0].text, /Cần Thơ.*60/);
  const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
  await assert.rejects(readBuffer(ole, 'bao-cao.doc', LIMITS), (e) => e.status === 415 && /docx/i.test(e.message));
});
