// CT-002: "giữ nguyên nội dung" là bất biến được kiểm — số trang khớp nguồn (hỏi lại AI tối đa 1 lần, vẫn lệch thì cảnh báo), không cắt chữ im lặng
// (dòng thừa dồn vào dòng cuối, dòng dài giữ nguyên + cảnh báo), cảnh báo tính lại theo dàn ý hiện tại.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOutline, outlineWarnings, askOutlineKeepingPages, KEEP_POINT_MAX } from '../../src/services/outlineService.js';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';

const slide = (i, points = ['ý']) => ({ layout: 'bullets', title: `Trang ${i}`, points });
const pages = (n) => ({ title: 'Bài', slides: Array.from({ length: n }, (_, i) => slide(i + 1)) });
const keepOpt = (slideCount) => ({ tone: 'dark', autoSlides: false, slideCount, aiImages: false, keepOriginal: true });

function fakeAi(...answers) {
  const calls = [];
  const ask = async (correction) => {
    calls.push(correction);
    const a = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (a instanceof Error) throw a;
    return a;
  };
  return { ask, calls };
}

test('askOutlineKeepingPages: đúng số trang → 1 lời gọi, không hỏi lại', async () => {
  const ai = fakeAi(pages(3));
  const raw = await askOutlineKeepingPages(ai.ask, 3);
  assert.equal(raw.slides.length, 3);
  assert.deepEqual(ai.calls, [null]);
});

test('askOutlineKeepingPages: thiếu trang (2/3) → hỏi lại đúng 1 lần, nêu số trang cần có, nhận bản đúng', async () => {
  const seen = [];
  const ai = fakeAi(pages(2), pages(3));
  const raw = await askOutlineKeepingPages(ai.ask, 3, { onMismatch: (m) => seen.push(m) });
  assert.equal(raw.slides.length, 3);
  assert.equal(ai.calls.length, 2, 'tối đa 2 lời gọi AI');
  assert.match(ai.calls[1], /nguồn có 3 trang/);
  assert.match(ai.calls[1], /bạn trả 2 trang/);
  assert.deepEqual(seen, [{ expected: 3, actual: 2 }]);
});

test('askOutlineKeepingPages: thừa trang (4/3) vẫn lệch sau lần hỏi lại → không hỏi lần 3, trả bản gần nguồn hơn', async () => {
  const ai = fakeAi(pages(4), pages(5));
  const raw = await askOutlineKeepingPages(ai.ask, 3);
  assert.equal(ai.calls.length, 2);
  assert.equal(raw.slides.length, 4, 'bản 4 trang gần 3 hơn bản 5 trang');
  // Lần hỏi lại xa nguồn hơn (2/3 → 0 trang) → giữ bản đầu.
  const ai2 = fakeAi(pages(2), { slides: [] });
  assert.equal((await askOutlineKeepingPages(ai2.ask, 3)).slides.length, 2);
});

test('askOutlineKeepingPages: lần hỏi lại lỗi → giữ bản đầu; không biết số trang nguồn → không kiểm', async () => {
  const ai = fakeAi(pages(2), new Error('AI lỗi'));
  assert.equal((await askOutlineKeepingPages(ai.ask, 3)).slides.length, 2);
  assert.equal(ai.calls.length, 2);
  const none = fakeAi(pages(2));
  assert.equal((await askOutlineKeepingPages(none.ask, null)).slides.length, 2);
  assert.equal(none.calls.length, 1);
  // Lỗi ở lần hỏi đầu vẫn nổi lên cho lớp trên xử lý (job thất bại có thông báo).
  await assert.rejects(askOutlineKeepingPages(fakeAi(new Error('hết hạn')).ask, 3), /hết hạn/);
});

test('keep: 13 dòng → 12 dòng, dòng thứ 13 nối vào dòng cuối (không mất chữ), có cảnh báo dồn dòng', () => {
  const points = Array.from({ length: 13 }, (_, i) => `Dòng ${i + 1}`);
  const { outline, mergedSlides } = normalizeOutline({ title: 'Bài', slides: [slide(1, points)] }, { options: keepOpt(1) });
  const p = outline.slides[0].points;
  assert.equal(p.length, SPEC_LIMITS.outlinePoints);
  assert.deepEqual(p.slice(0, 11), points.slice(0, 11));
  assert.equal(p[11], 'Dòng 12\nDòng 13');
  assert.equal(mergedSlides.size, 1);
  assert.deepEqual(outline.warnings, [{ code: 'PAGE_LINES_MERGED', page: 1, slide: outline.slides[0].id }]);
  // 20 dòng: toàn bộ dòng 12..20 nằm trong dòng cuối.
  const many = Array.from({ length: 20 }, (_, i) => `D${i + 1}`);
  const r = normalizeOutline({ title: 'Bài', slides: [slide(1, many)] }, { options: keepOpt(1) }).outline.slides[0].points;
  assert.equal(r[11], many.slice(11).join('\n'));
});

test('keep: dòng 500 ký tự không bị cắt, có cảnh báo PAGE_TOO_LONG đúng trang; quá trần mềm vẫn cắt để chặn dữ liệu quá khổ', () => {
  const long = 'x'.repeat(500);
  const { outline } = normalizeOutline({ title: 'Bài', slides: [slide(1), slide(2, [long])] }, { options: keepOpt(2) });
  assert.equal(outline.slides[1].points[0].length, 500);
  assert.deepEqual(outline.warnings, [{ code: 'PAGE_TOO_LONG', page: 2 }]);
  const huge = normalizeOutline({ title: 'Bài', slides: [slide(1, ['y'.repeat(KEEP_POINT_MAX + 50)])] }, { options: keepOpt(1) }).outline;
  assert.equal(huge.slides[0].points[0].length, KEEP_POINT_MAX);
});

test('keep: người dùng lưu dàn ý (strict) vẫn bị kiểm chặt — dòng quá dài báo lỗi để tách dòng, không cắt âm thầm', () => {
  const long = 'x'.repeat(500);
  const { errors } = normalizeOutline({ title: 'Bài', slides: [slide(1, [long])] }, { strict: true, options: keepOpt(1) });
  assert.ok(errors.some((e) => /points\[0\].*400/.test(e)), errors.join('|'));
});

test('keep: cảnh báo PAGE_COUNT theo số trang nguồn, tính lại khi dàn ý đổi', () => {
  const expected3 = { options: keepOpt(3) };
  const two = normalizeOutline(pages(2), expected3).outline;
  assert.deepEqual(two.warnings, [{ code: 'PAGE_COUNT', expected: 3, actual: 2 }]);
  const four = normalizeOutline(pages(4), expected3).outline;
  assert.deepEqual(four.warnings, [{ code: 'PAGE_COUNT', expected: 3, actual: 4 }]);
  const ok = normalizeOutline(pages(3), expected3).outline;
  assert.equal(ok.warnings, undefined, 'đủ trang → không cảnh báo');
  // Người dùng thêm trang cho đủ rồi lưu (strict) → hết cảnh báo (server giữ options).
  const fixed = normalizeOutline({ ...two, slides: [...two.slides, slide(3)] }, { strict: true, options: two.options }).outline;
  assert.equal(fixed.warnings, undefined);
  assert.deepEqual(outlineWarnings(two), [{ code: 'PAGE_COUNT', expected: 3, actual: 2 }]);
});

test('không phải giữ nguyên nội dung: hành vi cũ — cắt ở 12 dòng/400 ký tự, không cảnh báo', () => {
  const points = Array.from({ length: 13 }, (_, i) => `Dòng ${i + 1}`);
  points[0] = 'z'.repeat(500);
  const { outline } = normalizeOutline({ title: 'Bài', slides: [slide(1, points)] }, { options: { tone: 'dark', autoSlides: true, slideCount: null, aiImages: false } });
  assert.equal(outline.slides[0].points.length, 12);
  assert.equal(outline.slides[0].points[0].length, 400);
  assert.equal(outline.warnings, undefined);
  assert.equal(outline.options.keepOriginal, undefined);
});

test('Dựng bài không gửi kèm dàn ý: giữ nguyên nội dung còn dòng quá dài → 422, không chuyển sang dựng (không rút gọn âm thầm)', async () => {
  process.env.NODE_ENV = 'test';
  const { createPresentationService } = await import('../../src/services/presentationService.js');
  const { loadConfig } = await import('../../src/config/index.js');
  const mk = (points, keepOriginal) => normalizeOutline({ title: 'Bài', slides: [slide(1, points)] }, { options: { ...keepOpt(1), keepOriginal } }).outline;
  let started = 0;
  const svc = (outline) =>
    createPresentationService({
      config: loadConfig(),
      repos: { presentations: { findOwned: async () => ({ id: 'd1', status: 'outline', outline }), startBuildOwned: async () => ((started += 1), 0) }, assets: {}, versions: {} },
      storage: {}, gemini: {}, browser: {}, signer: {}, audit: { async record() {} }, stock: {}, videos: { resume: async () => 0, stats: () => ({}) },
    });
  const body = { outlineVersion: 1 };
  await assert.rejects(svc(mk(['x'.repeat(500)], true)).build({ id: 'u1' }, 'd1', body, ''), (e) => e.status === 422 && e.code === 'INVALID_OUTLINE' && /Trang 1/.test(e.details?.join?.(' ') ?? JSON.stringify(e)));
  assert.equal(started, 0);
  // Dòng vừa đủ / bài không giữ nguyên nội dung → đi tiếp (startBuildOwned trả 0 → VERSION_CONFLICT, đủ chứng minh đã qua bước kiểm).
  await assert.rejects(svc(mk(['x'.repeat(400)], true)).build({ id: 'u1' }, 'd1', body, ''), (e) => e.code === 'VERSION_CONFLICT');
  await assert.rejects(svc(mk(['x'.repeat(500)], false)).build({ id: 'u1' }, 'd1', body, ''), (e) => e.code === 'VERSION_CONFLICT');
  assert.equal(started, 2);
});
