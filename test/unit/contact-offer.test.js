// Trang "Thông tin liên hệ" / "Chương trình ưu đãi" + liên kết lấy từ tư liệu nguồn:
// chuẩn hoá slide.contact, HTML (liên kết mở tab mới, escape), mã QR, dòng dàn ý → contact, đối chiếu chống bịa với nguồn,
// gắn liên kết dàn ý vào bài, đọc liên kết trong DOCX/PPTX/HTML/PDF, sửa trực tiếp trên khung xem trước.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { normalizeSpec, collectAssetIds, dropForeignAssets } from '../../src/services/specService.js';
import { renderDeck } from '../../src/services/renderService.js';
import { channelHref, validPhone, webHref, hasContact } from '../../shared/deck/contact.js';
import { qrPath, qrSvg } from '../../shared/deck/qr.js';
import { stripLinks, linksIn, cleanLinks } from '../../shared/deck/mdLinks.js';
import { normalizeOutline, composeDeckFromOutline, parseContactPoints, verifyOutlineFacts, applyOutlineLinks } from '../../src/services/outlineService.js';
import { readBuffer, htmlToText, mergeLinks } from '../../src/services/ingestService.js';
import { pdfUris, linksFromText, collectSourceFacts } from '../../src/services/sourceFacts.js';
import { applyFrameEdit, mediaTarget, setMedia } from '../../frontend/src/lib/editPaths.js';
import { outlineResponseSchema, IMAGE_KINDS } from '../../src/services/geminiService.js';

const LIMITS = { maxTextChars: 200000, maxUploadMb: 300, maxUploadFiles: 20 };
const contactSlide = (contact, extra = {}) => ({ layout: 'contact', title: 'Liên hệ', contact, ...extra });
const html = (spec, mode = 'present') => renderDeck(spec, { ratio: '16:9', mode, nonce: 'n1', assetUrl: (id) => `/a/${id}` });

test('contact.js: số điện thoại, liên kết từng kênh (Zalo số nội địa, Viber/Telegram/iMessage số quốc tế)', () => {
  assert.ok(validPhone('0912 345 678') && validPhone('+84 912.345.678') && validPhone('1900 8677'));
  assert.ok(!validPhone('12') && !validPhone('0912abc678') && !validPhone('javascript:1'));
  assert.equal(channelHref('call', '0912 345 678'), 'tel:0912345678');
  assert.equal(channelHref('zalo', '+84 912 345 678'), 'https://zalo.me/0912345678');
  assert.equal(channelHref('viber', '0912345678'), 'viber://chat?number=%2B84912345678');
  assert.equal(channelHref('telegram', '0912345678'), 'https://t.me/+84912345678');
  assert.equal(channelHref('imessage', '0912345678'), 'sms:+84912345678');
  assert.equal(channelHref('zalo', 'abc'), null);
  assert.equal(webHref('amis.misa.vn'), 'https://amis.misa.vn/');
  assert.equal(webHref('javascript:alert(1)'), null);
});

test('normalizeSpec: contact hợp lệ được giữ; lưu (strict) báo lỗi số/email/website sai; AI (lenient) bỏ mục sai', () => {
  const contact = {
    phones: [{ number: '0912 345 678', label: 'Hotline', channels: ['call', 'zalo', 'skype'] }, { number: 'abc' }],
    emails: ['sales@misa.com.vn', 'sai-email'],
    addresses: ['Tầng 9, Duy Tân, Hà Nội'],
    website: 'amis.misa.vn',
    cta: 'Liên hệ để được tư vấn miễn phí',
    qr: { asset: null, link: 'zalo.me/0912345678', caption: 'Quét để nhắn Zalo' },
  };
  const { spec } = normalizeSpec({ slides: [contactSlide(contact)] });
  const c = spec.slides[0].contact;
  assert.equal(spec.slides[0].layout, 'contact');
  assert.deepEqual(c.phones, [{ number: '0912 345 678', label: 'Hotline', channels: ['call', 'zalo'] }]);
  assert.deepEqual(c.emails, ['sales@misa.com.vn']);
  assert.equal(c.website, 'https://amis.misa.vn/');
  assert.equal(c.qr.link, 'https://zalo.me/0912345678');
  const { errors } = normalizeSpec({ slides: [contactSlide(contact)] }, { strict: true });
  assert.ok(errors.some((e) => /phones\[1\]/.test(e)) && errors.some((e) => /emails\[1\]/.test(e)));
  // Trang liên hệ không có thông tin nào → hạ về trang kết; trang ưu đãi không có quyền lợi/liên hệ → trang khác.
  assert.equal(normalizeSpec({ slides: [contactSlide({ cta: 'Gọi ngay' })] }).spec.slides[0].layout, 'closing');
  assert.notEqual(normalizeSpec({ slides: [{ layout: 'offer', title: 'Ưu đãi' }] }).spec.slides[0].layout, 'offer');
  // Giữ contact khi đổi sang bố cục khác (đổi qua lại không mất dữ liệu).
  const moved = normalizeSpec({ slides: [{ layout: 'bullets', title: 'x', items: [{ title: 'a' }], contact }] }).spec.slides[0];
  assert.equal(moved.contact.phones.length, 1);
});

test('asset QR: thuộc danh sách asset của bài; asset lạ bị bỏ', () => {
  const qa = randomUUID();
  const { spec } = normalizeSpec({ slides: [contactSlide({ phones: [{ number: '0912345678' }], qr: { asset: qa } })] });
  assert.ok(collectAssetIds(spec).has(qa));
  dropForeignAssets(spec, new Set());
  assert.equal(spec.slides[0].contact.qr.asset, null);
});

test('render: liên kết kênh mở tab mới, escape dữ liệu người dùng; chế độ sửa không có thẻ <a>; QR tự tạo là SVG', () => {
  const contact = {
    phones: [{ number: '0912 345 678', label: '<img src=x onerror=alert(1)>', channels: ['call', 'zalo', 'viber'] }],
    emails: ['sales@misa.com.vn'],
    addresses: ['Số 1 "Duy Tân" <script>'],
    website: 'amis.misa.vn',
    cta: 'Liên hệ ngay',
    qr: { link: 'https://zalo.me/0912345678', caption: 'Quét mã' },
  };
  const { spec } = normalizeSpec({ slides: [contactSlide(contact)] });
  const out = html(spec);
  assert.match(out, /<a class="ct-num" href="tel:0912345678" target="_blank" rel="noopener noreferrer"/);
  assert.match(out, /href="https:\/\/zalo\.me\/0912345678"/);
  assert.match(out, /href="viber:\/\/chat\?number=%2B84912345678"/);
  assert.match(out, /href="mailto:sales@misa\.com\.vn"/);
  assert.match(out, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/);
  assert.ok(!out.includes('<img src=x') && !out.includes('"Duy Tân" <script>'));
  assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(out, /class="qr-svg"/);
  const edit = html(spec, 'edit');
  assert.ok(!/<a class="ct-/.test(edit));
  assert.match(edit, /data-e="contact\.phones\.0\.number"|contact\.phones\.0\.number/);
});

test('render trang Ưu đãi: quyền lợi + thời hạn + mã QR cột phải (nửa trang)', () => {
  const qa = randomUUID();
  const { spec } = normalizeSpec({
    slides: [{ layout: 'offer', title: 'Giảm 30% gói AMIS', caption: 'Đến hết 31/12/2026', items: [{ icon: 'check', title: 'Giảm 30%', text: 'năm đầu' }], contact: { cta: 'Đăng ký ngay', qr: { asset: qa } } }],
  });
  const out = html(spec);
  assert.match(out, /class="of has-qr"/);
  assert.match(out, /class="of-r"><div class="qr"/);
  assert.match(out, new RegExp(`src="/a/${qa}"`));
  assert.match(out, /Đến hết 31\/12\/2026/);
});

test('qr.js: mã hoá link thành ma trận (vùng trắng 4 ô), nhãn được escape', () => {
  const p = qrPath('https://amis.misa.vn/');
  assert.ok(p.size >= 21 && /^M\d+ \d+h\d+v1h-\d+z/.test(p.d));
  const svg = qrSvg('https://amis.misa.vn/', 'a"<b>');
  assert.match(svg, /viewBox="-4 -4 \d+ \d+"/);
  assert.ok(!svg.includes('<b>'));
  assert.equal(qrPath(''), null);
});

test('mdLinks: [nhãn](URL) — tách nhãn, URL xấu chỉ giữ nhãn', () => {
  const t = 'Xem [AMIS](https://amis.misa.vn) và [xấu](javascript:alert(1))';
  assert.equal(stripLinks('Xem [AMIS](https://amis.misa.vn)'), 'Xem AMIS');
  assert.deepEqual(linksIn(t), [{ label: 'AMIS', url: 'https://amis.misa.vn/' }]);
  assert.equal(cleanLinks('[A](https://a.vn) [B](https://b.vn)', (u) => u.includes('a.vn')), '[A](https://a.vn/) B');
});

test('parseContactPoints: dòng dàn ý → số điện thoại + kênh, email, địa chỉ, website, lời kêu gọi, QR; còn lại là nội dung', () => {
  const { contact, rest } = parseContactPoints([
    'Hotline: 1900 8677',
    'Điện thoại: 0912 345 678 (Zalo, Viber)',
    'Email: sales@misa.com.vn',
    'Địa chỉ: Tầng 9, Duy Tân, Hà Nội',
    'Website: amis.misa.vn',
    'Kêu gọi: Liên hệ để được tư vấn miễn phí',
    'QR: https://zalo.me/0912345678',
    'Giảm 30%: năm đầu tiên',
  ]);
  assert.equal(contact.phones.length, 2);
  assert.deepEqual(contact.phones[1].channels.slice().sort(), ['call', 'viber', 'zalo']);
  assert.deepEqual(contact.emails, ['sales@misa.com.vn']);
  assert.equal(contact.addresses[0], 'Tầng 9, Duy Tân, Hà Nội');
  assert.match(contact.website, /amis\.misa\.vn/);
  assert.equal(contact.cta, 'Liên hệ để được tư vấn miễn phí');
  assert.match(contact.qr.link, /zalo\.me/);
  assert.deepEqual(rest, ['Giảm 30%: năm đầu tiên']);
});

test('verifyOutlineFacts: bỏ liên kết lạ và số/email không có trong nguồn; trang liên hệ trống → AI tự chọn', () => {
  const { outline } = normalizeOutline({
    title: 'Bài',
    slides: [
      { layout: 'bullets', title: 'Xem [tài liệu](https://misa.vn/tl) và [web lạ](https://bịa.vn)', points: ['Ý [AMIS](https://amis.misa.vn)'] },
      { layout: 'contact', title: 'Liên hệ', points: ['Hotline: 1900 8677', 'Điện thoại: 0988 000 111', 'Email: bia@misa.vn', 'Kêu gọi: Gọi ngay'] },
      { layout: 'contact', title: 'Liên hệ 2', points: ['Email: khong@co.vn'] },
    ],
  });
  const facts = { corpus: 'Gọi tổng đài 1900.8677 hoặc xem https://amis.misa.vn', links: [{ label: 'tài liệu', url: 'https://misa.vn/tl' }] };
  const r = verifyOutlineFacts(outline, facts);
  assert.equal(outline.slides[0].title, 'Xem [tài liệu](https://misa.vn/tl) và web lạ');
  assert.equal(outline.slides[0].points[0], 'Ý [AMIS](https://amis.misa.vn/)');
  assert.deepEqual(outline.slides[1].points, ['Hotline: 1900 8677', 'Kêu gọi: Gọi ngay']);
  assert.equal(outline.slides[2].layout, 'auto');
  assert.equal(r.links, 1);
  assert.equal(r.contacts, 3);
});

test('dựng bài: dòng liên hệ → slide.contact; liên kết dàn ý gắn vào chữ của bài (mở tab mới)', () => {
  const { outline } = normalizeOutline({
    title: 'Bài',
    slides: [
      { layout: 'bullets', title: 'Tính năng', points: ['Kế toán: xem [hướng dẫn](https://amis.misa.vn/hd) chi tiết'] },
      { layout: 'contact', title: 'Liên hệ', points: ['Hotline: 1900 8677', 'Kêu gọi: Liên hệ để được tư vấn ngay'] },
    ],
  });
  const composed = composeDeckFromOutline(outline, []);
  const { spec } = normalizeSpec(composed);
  assert.equal(spec.slides[1].layout, 'contact');
  assert.equal(spec.slides[1].contact.phones[0].number, '1900 8677');
  assert.equal(spec.slides[1].contact.cta, 'Liên hệ để được tư vấn ngay');
  assert.ok(!JSON.stringify(spec.slides[0]).includes(']('));
  const n = applyOutlineLinks(spec, outline);
  assert.equal(n, 1);
  assert.match(JSON.stringify(spec.slides[0]), /href=https:\/\/amis\.misa\.vn\/hd⟧hướng dẫn/);
  assert.match(html(spec), /<a class="rl" href="https:\/\/amis\.misa\.vn\/hd" target="_blank" rel="noopener noreferrer">/);
  assert.ok(hasContact(spec.slides[1].contact));
});

test('đọc liên kết trong tư liệu: DOCX hyperlink, PPTX hlinkClick, HTML <a> (đường dẫn tương đối), PDF /URI', async () => {
  const d = new JSZip();
  d.file('[Content_Types].xml', '<Types/>');
  d.file('word/_rels/document.xml.rels', '<Relationships><Relationship Id="rId9" Type="hyperlink" Target="https://amis.misa.vn/ke-toan" TargetMode="External"/><Relationship Id="rId8" Target="javascript:alert(1)" TargetMode="External"/></Relationships>');
  d.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Xem </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>AMIS Kế toán</w:t></w:r></w:hyperlink><w:hyperlink r:id="rId8"><w:r><w:t> bấm</w:t></w:r></w:hyperlink></w:p></w:body></w:document>');
  const docx = await readBuffer(await d.generateAsync({ type: 'nodebuffer' }), 'a.docx', LIMITS);
  const dt = docx.pieces.map((p) => p.text).join('\n');
  assert.match(dt, /\[AMIS Kế toán\]\(https:\/\/amis\.misa\.vn\/ke-toan\)/);
  assert.ok(!dt.includes('javascript'));

  const p = new JSZip();
  p.file('[Content_Types].xml', '<Types/>');
  p.file('ppt/presentation.xml', '<p:presentation/>');
  p.file('ppt/slides/_rels/slide1.xml.rels', '<Relationships><Relationship Id="rId2" Target="https://misa.vn/" TargetMode="External"/></Relationships>');
  p.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:rPr><a:hlinkClick r:id="rId2"/></a:rPr><a:t>MI</a:t></a:r><a:r><a:rPr><a:hlinkClick r:id="rId2"/></a:rPr><a:t>SA</a:t></a:r><a:r><a:t> chào</a:t></a:r></a:p></p:sld>');
  const pptx = await readBuffer(await p.generateAsync({ type: 'nodebuffer' }), 'b.pptx', LIMITS);
  assert.match(pptx.pieces.map((x) => x.text).join('\n'), /\[MISA\]\(https:\/\/misa\.vn\/\) chào/);
  assert.equal(mergeLinks('[MI](u)[SA](u)'), '[MISA](u)');

  const { text } = htmlToText('<title>T</title><p>Đọc <a href="/bang-gia">bảng giá</a>, <a href="#top">đầu</a>, <a href="javascript:x()">x</a></p>', 'https://amis.misa.vn/san-pham/');
  assert.match(text, /\[bảng giá\]\(https:\/\/amis\.misa\.vn\/bang-gia\)/);
  assert.ok(!text.includes('#top') && !text.includes('javascript'));

  const pdf = Buffer.from('%PDF-1.4 1 0 obj << /A << /S /URI /URI (https://misa.vn/a\\(1\\)) >> >> endobj 2 0 obj << /URI (javascript:x) >> endobj', 'latin1');
  assert.deepEqual([...pdfUris(pdf).keys()], ['https://misa.vn/a(1)']);
  assert.deepEqual([...linksFromText('Xem https://amis.misa.vn/, và [MISA](https://misa.vn)').keys()].sort(), ['https://amis.misa.vn/', 'https://misa.vn/']);
  // Thiếu pdftotext: vẫn có liên kết /URI, không ném lỗi.
  const facts = await collectSourceFacts({ pieces: [{ text: 'Hotline 1900 8677' }], media: [{ kind: 'pdf', buffer: pdf }] }, { pdftotext: 'khong-co-cong-cu-nay', tempDir: process.cwd() });
  assert.match(facts.corpus, /1900 8677/);
  assert.ok(facts.links.some((l) => l.url === 'https://misa.vn/a(1)'));
});

test('sửa trực tiếp trên khung: đường dẫn contact.* (chữ thường / có định dạng), ảnh QR', () => {
  const qa = randomUUID();
  const spec = { slides: [{ layout: 'contact', contact: { phones: [{ number: '1', label: '', channels: ['call'] }], emails: ['a@b.vn'], addresses: ['x'], website: '', cta: '', qr: { asset: null, link: '', caption: '' } } }] };
  assert.ok(applyFrameEdit(spec, 0, 'contact.phones.0.number', '0912 345 678'));
  assert.ok(applyFrameEdit(spec, 0, 'contact.emails.0', 'b@c.vn'));
  assert.ok(applyFrameEdit(spec, 0, 'contact.cta', '⟦accent⟧Gọi⟦/⟧ ngay'));
  assert.ok(applyFrameEdit(spec, 0, 'contact.website', '⟦b⟧misa.vn⟦/⟧'));
  assert.ok(!applyFrameEdit(spec, 0, 'contact.emails.5', 'x'));
  assert.ok(!applyFrameEdit(spec, 0, 'contact.__proto__', 'x'));
  const c = spec.slides[0].contact;
  assert.equal(c.phones[0].number, '0912 345 678');
  assert.equal(c.cta, '⟦accent⟧Gọi⟦/⟧ ngay');
  assert.equal(c.website, '⟦b⟧misa.vn⟦/⟧'.slice(0, 300));
  assert.equal(mediaTarget(spec.slides[0], 'contact.qr').kind, 'qr');
  assert.ok(setMedia(spec.slides[0], 'contact.qr', { image: { asset: qa } }));
  assert.equal(c.qr.asset, qa);
  setMedia(spec.slides[0], 'contact.qr', { image: null });
  assert.equal(spec.slides[0].contact.qr.asset, null);
});

test('schema dàn ý: có loại ảnh qr, bố cục contact/offer', () => {
  assert.ok(IMAGE_KINDS.includes('qr'));
  const sc = outlineResponseSchema({ tone: 'dark' });
  const layouts = sc.properties.slides.items.properties.layout.enum;
  assert.ok(layouts.includes('contact') && layouts.includes('offer'));
});
