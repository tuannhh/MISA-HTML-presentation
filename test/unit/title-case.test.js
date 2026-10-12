// Kiểu chữ tiêu đề: mặc định viết hoa đầu câu (AI hay "Viết Hoa Từng Chữ"), giữ tên riêng có bằng chứng trong tư liệu,
// luôn viết hoa MISA/AMIS/ASP/JETPAY (AI chỉ giữ khi đã viết hoa); tuỳ chọn VIẾT HOA TOÀN BỘ hiển thị bằng CSS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTitleCased, sentenceCasePlain, sentenceCase, buildCaseIndex, sentenceCaseOutline, sentenceCaseSpec } from '../../shared/deck/textCase.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeck } from '../../src/services/renderService.js';

const CORPUS = 'CHƯƠNG TRÌNH ƯU ĐÃI MISA AMIS KẾ TOÁN — QUÝ 4/2026\nMISA AMIS Kế toán là phần mềm kế toán online. Văn phòng ở phố Duy Tân, Cầu Giấy, Hà Nội. Ứng dụng AI để hạch toán.\nTiêu Đề Viết Hoa Từng Chữ Ngân Hàng';

test('nhận diện "Viết Hoa Từng Chữ" — chuỗi viết kiểu câu / có tên riêng không bị coi là sai', () => {
  assert.ok(isTitleCased('Chương Trình Ưu Đãi MISA AMIS Kế Toán'));
  assert.ok(isTitleCased('Ưu Đãi AMIS'));
  assert.ok(!isTitleCased('Doanh thu tăng 2,7 lần sau 1 quý'));
  assert.ok(!isTitleCased('Văn phòng Hà Nội và Hồ Chí Minh'));
  assert.ok(!isTitleCased('Giới thiệu MISA AMIS'));
});

test('đổi về viết hoa đầu câu: giữ tên riêng có trong tư liệu, từ viết tắt, MISA/AMIS luôn hoa; "ai" tiếng Việt không đổi', () => {
  const idx = buildCaseIndex(CORPUS);
  assert.equal(sentenceCasePlain('Chương Trình Ưu Đãi MISA AMIS Kế Toán', idx), 'Chương trình ưu đãi MISA AMIS Kế toán');
  assert.equal(sentenceCasePlain('Chính Sách Ưu Đãi Đặc Biệt Quý 4/2026', idx), 'Chính sách ưu đãi đặc biệt quý 4/2026');
  assert.equal(sentenceCasePlain('Văn Phòng Tại Hà Nội', idx), 'Văn phòng tại Hà Nội');
  assert.equal(sentenceCasePlain('Ứng Dụng AI Trong Kế Toán Của Misa', idx), 'Ứng dụng AI trong kế toán của MISA');
  assert.equal(sentenceCasePlain('Đồng Hành Cùng Jetpay. Bắt Đầu Ngay', idx), 'Đồng hành cùng JETPAY. Bắt đầu ngay');
  assert.equal(sentenceCasePlain('Ai cũng dùng được Amis', idx), 'Ai cũng dùng được AMIS');
  // "Ngân Hàng" chỉ viết hoa trong dòng cũng đang Viết Hoa Từng Chữ → không phải bằng chứng tên riêng.
  assert.equal(sentenceCasePlain('Kết Nối Ngân Hàng', idx), 'Kết nối ngân hàng');
  // Không có tư liệu: chỉ giữ chữ đầu + từ viết tắt.
  assert.equal(sentenceCasePlain('Lộ Trình Triển Khai ERP Năm 2027'), 'Lộ trình triển khai ERP năm 2027');
});

test('giữ thẻ định dạng; dàn ý: chỉ đổi nhãn đầu dòng, không đụng URL liên kết', () => {
  assert.equal(sentenceCase('⟦accent⟧Chương Trình⟦/⟧ Ưu Đãi'), '⟦accent⟧Chương trình⟦/⟧ ưu đãi');
  const outline = {
    title: 'Ưu Đãi AMIS Kế Toán',
    slides: [{ title: 'Lợi Ích Cốt Lõi', subtitle: 'Xem [Trang Sản Phẩm](https://amis.misa.vn/Ke-Toan/)', points: ['Tự Động Hạch Toán: Tự động hạch toán từ hoá đơn', 'Doanh thu tăng 30%'] }],
  };
  const n = sentenceCaseOutline(outline, buildCaseIndex(CORPUS));
  assert.equal(outline.title, 'Ưu đãi AMIS Kế toán');
  assert.equal(outline.slides[0].title, 'Lợi ích cốt lõi');
  assert.equal(outline.slides[0].subtitle, 'Xem [trang sản phẩm](https://amis.misa.vn/Ke-Toan/)');
  assert.deepEqual(outline.slides[0].points, ['Tự động hạch toán: Tự động hạch toán từ hoá đơn', 'Doanh thu tăng 30%']);
  assert.equal(n, 4);
});

test('bài đã dựng: tiêu đề, nhãn chủ đề, tiêu đề mục; cụm nhấn mạnh đi theo tiêu đề mới', () => {
  const spec = { slides: [{ layout: 'cards', title: 'Lợi Ích Cốt Lõi Cho Doanh Nghiệp', highlight: 'Cốt Lõi', kicker: 'Giá Trị Mang Lại', items: [{ title: 'Kết Nối Ngân Hàng', text: 'Kết nối 20 ngân hàng' }] }] };
  sentenceCaseSpec(spec);
  const s = spec.slides[0];
  assert.equal(s.title, 'Lợi ích cốt lõi cho doanh nghiệp');
  assert.equal(s.highlight, 'cốt lõi');
  assert.equal(s.kicker, 'Giá trị mang lại');
  assert.equal(s.items[0].title, 'Kết nối ngân hàng');
});

test('tuỳ chọn VIẾT HOA TOÀN BỘ: lưu font.titleCase = upper, renderer gắn data-tcase; mặc định không lưu trường', () => {
  const up = normalizeSpec({ font: { heading: 'inter', body: 'inter', titleCase: 'upper' }, slides: [{ layout: 'section', title: 'Phần 1' }] }).spec;
  assert.equal(up.font.titleCase, 'upper');
  assert.match(renderDeck(up, { ratio: '16:9', assetUrl: () => null }), /data-tcase="upper"/);
  const def = normalizeSpec({ font: { heading: 'inter', body: 'inter', titleCase: 'sentence' }, slides: [{ layout: 'section', title: 'Phần 1' }] }).spec;
  assert.equal(def.font.titleCase, undefined);
  assert.match(renderDeck(def, { ratio: '16:9', assetUrl: () => null }), /data-tcase="sentence"/);
  assert.ok(normalizeSpec({ font: { titleCase: 'lung tung' }, slides: [{ layout: 'section', title: 'x' }] }, { strict: true }).errors.some((e) => /titleCase/.test(e)));
});
