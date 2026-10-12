// Liên kết (hyperlink) trong chữ có định dạng: cú pháp lưu trữ, kiểm URL an toàn, HTML mở tab mới, giữ liên kết khi sửa chữ,
// gắn liên kết theo cụm chữ (liên kết lấy từ tư liệu nguồn).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeHref, parseRich, serializeRich, canonicalRich, plainText, richHtml, repaintRich, formatRange, linkPhrase, richLinks, hrefWeight, cutRich } from '../../shared/deck/rich.js';
import { normalizeSpec } from '../../src/services/specService.js';

test('safeHref: chỉ http(s) có tên miền, mailto, tel; chặn javascript:/data:/tài khoản/ký tự lạ', () => {
  assert.equal(safeHref('https://amis.misa.vn'), 'https://amis.misa.vn/');
  assert.equal(safeHref(' http://misa.vn/a?b=1,2#c '), 'http://misa.vn/a?b=1,2#c');
  assert.equal(safeHref('mailto:sales@misa.com.vn'), 'mailto:sales@misa.com.vn');
  assert.equal(safeHref('tel:+84912345678'), 'tel:+84912345678');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<b>', 'https://u:p@misa.vn', 'ftp://misa.vn', 'misa.vn', 'https://localhost', 'https://misa.vn/"onmouseover=x', 'https://misa.vn/a b', 'https://misa.vn/⟧x', 'mailto:khong-phai-email', 'tel:abc', `https://misa.vn/${'a'.repeat(600)}`, '', null]) {
    assert.equal(safeHref(bad), null, String(bad));
  }
});

test('cú pháp lưu: href đứng cuối, URL có dấu phẩy; kết hợp màu/đậm; thẻ có URL xấu → chữ thường', () => {
  const s = 'Xem ⟦accent,b,href=https://misa.vn/a?x=1,2⟧tài liệu⟦/⟧ nhé';
  const segs = parseRich(s);
  assert.deepEqual(segs[1], { t: 'tài liệu', c: 'accent', b: true, n: false, h: 'https://misa.vn/a?x=1,2' });
  assert.equal(serializeRich(segs), s);
  assert.equal(plainText(s), 'Xem tài liệu nhé');
  assert.equal(canonicalRich('⟦href=https://misa.vn⟧MISA⟦/⟧'), '⟦href=https://misa.vn/⟧MISA⟦/⟧');
  assert.equal(canonicalRich('⟦href=javascript:alert(1)⟧bấm⟦/⟧'), 'bấm');
  assert.equal(canonicalRich('⟦b,href=⟧x⟦/⟧'), 'x');
  assert.deepEqual(richLinks(s), ['https://misa.vn/a?x=1,2']);
  assert.equal(hrefWeight(s), ',href=https://misa.vn/a?x=1,2'.length);
});

test('richHtml: <a> mở tab mới, rel noopener noreferrer, href escape; chữ trong liên kết vẫn escape', () => {
  const html = richHtml('⟦href=https://misa.vn/?q=x&a=1⟧<b>AMIS</b>⟦/⟧');
  assert.match(html, /^<a class="rl" href="https:\/\/misa\.vn\/\?q=x&amp;a=1" target="_blank" rel="noopener noreferrer">&lt;b&gt;AMIS&lt;\/b&gt;<\/a>$/);
  const colored = richHtml('⟦coral,href=https://misa.vn/⟧Đỏ⟦/⟧');
  assert.match(colored, /^<a class="rl"[^>]*><span class="rt" data-rc="coral" style="color:var\(--coral\);">Đỏ<\/span><\/a>$/);
  // Cụm nhấn mạnh cắt ngang liên kết: mỗi mảnh vẫn là liên kết.
  const hl = richHtml('Dùng ⟦href=https://misa.vn/⟧MISA AMIS⟦/⟧ ngay', 'AMIS ngay');
  assert.equal((hl.match(/<a class="rl"/g) || []).length, 2);
  assert.match(hl, /<a class="rl"[^>]*>MISA <\/a><em class="hl"><a class="rl"[^>]*>AMIS<\/a><\/em><em class="hl"> ngay<\/em>/);
});

test('sửa chữ ở form giữ liên kết; gõ nối sau cuối liên kết không kéo dài liên kết; gõ giữa liên kết thì thuộc liên kết', () => {
  const raw = 'Xem ⟦href=https://misa.vn/⟧tài liệu⟦/⟧';
  assert.equal(repaintRich(raw, 'Xem tài liệu mới'), 'Xem ⟦href=https://misa.vn/⟧tài liệu⟦/⟧ mới');
  assert.equal(repaintRich(raw, 'Xem tài liệu gốc'.replace(' gốc', '')), raw);
  assert.equal(repaintRich(raw, 'Xem tài-liệu'.replace('-', ' x ')), 'Xem ⟦href=https://misa.vn/⟧tài x liệu⟦/⟧');
  assert.equal(repaintRich(raw, 'Đọc tài liệu'), 'Đọc ⟦href=https://misa.vn/⟧tài liệu⟦/⟧');
});

test('formatRange gắn/gỡ liên kết; cutRich giữ liên kết', () => {
  const linked = formatRange('Liên hệ MISA', 8, 12, { h: 'https://misa.vn' });
  assert.equal(linked, 'Liên hệ ⟦href=https://misa.vn/⟧MISA⟦/⟧');
  assert.equal(formatRange(linked, 0, 12, { h: null }), 'Liên hệ MISA');
  assert.equal(formatRange('abc', 0, 3, { h: 'javascript:x' }), 'abc');
  assert.equal(cutRich(linked, 10), 'Liên hệ ⟦href=https://misa.vn/⟧MI⟦/⟧');
});

test('linkPhrase: gắn vào lần xuất hiện đầu chưa có liên kết; không thấy → null', () => {
  const a = linkPhrase('MISA AMIS và MISA AMIS', 'MISA AMIS', 'https://amis.misa.vn');
  assert.equal(a, '⟦href=https://amis.misa.vn/⟧MISA AMIS⟦/⟧ và MISA AMIS');
  assert.equal(linkPhrase(a, 'MISA AMIS', 'https://amis.misa.vn/khac'), '⟦href=https://amis.misa.vn/⟧MISA AMIS⟦/⟧ và ⟦href=https://amis.misa.vn/khac⟧MISA AMIS⟦/⟧');
  assert.equal(linkPhrase('abc', 'xyz', 'https://misa.vn'), null);
  assert.equal(linkPhrase('abc', 'abc', 'javascript:x'), null);
});

test('normalizeSpec: URL không tính vào giới hạn ký tự thô của ô chữ ngắn (nhãn 40 ký tự), liên kết xấu bị gỡ', () => {
  const url = `https://misa.vn/${'a'.repeat(470)}`;
  // 2 liên kết dài trong 1 nhãn 40 ký tự: chuỗi thô ~1.000 ký tự nhưng chữ hiển thị chỉ 4 ký tự.
  const tag = `⟦href=${url}⟧AM⟦/⟧⟦href=${url}b⟧IS⟦/⟧`;
  const { spec, errors } = normalizeSpec({ slides: [{ layout: 'closing', title: 'Cảm ơn', tags: [tag], subtitle: '⟦href=javascript:alert(1)⟧bấm⟦/⟧' }] }, { strict: true });
  assert.deepEqual(errors, []);
  assert.equal(spec.slides[0].tags[0], tag);
  assert.equal(spec.slides[0].subtitle, 'bấm');
});
