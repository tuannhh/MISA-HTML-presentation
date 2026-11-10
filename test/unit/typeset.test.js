// Dàn chữ + bàn soát chữ + thị giác bìa → kết: cụm nghĩa của tiêu đề (rich.phraseHtml, slide.wrap), bước dàn chữ bằng AI (typeset.js),
// điểm/sửa tự động của bàn soát (deckLint.js), sân khấu quỹ đạo của hình 3D chủ đạo, hình lõi trang chuyển đoạn, hình trang kết, mốc thời gian lặp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phraseHtml, validPhrases } from '../../shared/deck/rich.js';
import { deckParts } from '../../shared/deck/render.js';
import { normalizeSpec } from '../../src/services/specService.js';
import { typesetBrief, parseGroups, snapHighlight, applyTypeset, typesetResponseSchema, TYPESET_PROMPT, GROUP_MAX_WORDS } from '../../src/services/typeset.js';
import { lintScore, lintTotals, lintFixes, LINT_WEIGHT } from '../../src/services/deckLint.js';
import { fitTrials, FIT_TIGHT } from '../../src/services/designReview.js';
import { planArt, tidyNumbers } from '../../src/services/artDirection.js';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';
import { existsSync } from 'node:fs';
import { createBrowserService } from '../../src/services/browserService.js';
import { renderDeck } from '../../src/services/renderService.js';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((x) => x && existsSync(x));

const A = 'a0000001-0000-4000-8000-000000000000';
const render = (slides) => {
  const { spec, errors } = normalizeSpec({ title: 'Thử', slides });
  assert.deepEqual(errors, []);
  return { spec, html: deckParts(spec, { ratio: '16:9', assetUrl: (id) => (id === A ? '/a.png' : null) }).slides };
};
const cards = () => [
  { icon: 'clock', title: 'Giả danh cơ quan công an', text: 'Gọi điện doạ dẫm' },
  { icon: 'cash', title: 'Lừa đảo', text: 'Yêu cầu chuyển khoản ngay' },
];

test('phraseHtml: mỗi cụm 1 khối không ngắt, cụm nhấn bọc theo từng cụm, escape chữ; cụm không khớp nguyên văn → null', () => {
  const html = phraseHtml('NGÀNH CÔNG NGHIỆP LỪA ĐẢO', 'CÔNG NGHIỆP LỪA ĐẢO', ['NGÀNH', 'CÔNG NGHIỆP', 'LỪA ĐẢO']);
  assert.equal(html, '<span class="nbp">NGÀNH</span> <span class="nbp"><em class="hl">CÔNG NGHIỆP</em></span> <span class="nbp"><em class="hl">LỪA ĐẢO</em></span>');
  assert.equal(phraseHtml('A & B  c', 'B', ['A & B', 'c']), '<span class="nbp">A &amp; <em class="hl">B</em></span> <span class="nbp">c</span>');
  assert.equal(phraseHtml('<b>x</b> y', '', ['<b>x</b>', 'y']), '<span class="nbp">&lt;b&gt;x&lt;/b&gt;</span> <span class="nbp">y</span>');
  assert.equal(phraseHtml('PHÒNG TRÁNH', '', ['PHÒNG TRÁNH']), '<span class="nbp">PHÒNG TRÁNH</span>');
  assert.equal(phraseHtml('A b', '', ['A', 'c']), null);
  assert.equal(phraseHtml('A\nb', '', ['A', 'b']), null);
  assert.equal(phraseHtml('A ⟦b⟧b⟦/⟧', '', ['A', 'b']), null);
  assert.equal(validPhrases('A b', []), false);
  assert.equal(validPhrases('A b', ['A ', 'b']), false);
});

test('normalizeSpec: giữ wrap khi khớp nguyên văn (tiêu đề, mục, câu chốt), bỏ khi chữ đã đổi; renderer dùng cụm ở mọi tiêu đề', () => {
  const slide = {
    layout: 'cards',
    title: 'XU HƯỚNG LỪA ĐẢO',
    highlight: 'LỪA ĐẢO',
    wrap: ['XU HƯỚNG', 'LỪA ĐẢO'],
    items: [{ ...cards()[0], wrap: ['Giả danh', 'cơ quan công an'] }, { ...cards()[1], wrap: ['Lừa', 'gạt'] }],
    callout: { tone: 'note', style: 'band', text: 'Không có gì là miễn phí', wrap: ['Không có gì', 'là miễn phí'], highlight: 'miễn phí' },
  };
  const { spec, html } = render([slide, { layout: 'cover', title: 'Bài mới', wrap: ['Bài', 'cũ'] }, { layout: 'closing', title: 'CẢM ƠN CÁC BẠN', highlight: 'CÁC BẠN', wrap: ['CẢM ƠN', 'CÁC BẠN'] }]);
  assert.deepEqual(spec.slides[0].wrap, ['XU HƯỚNG', 'LỪA ĐẢO']);
  assert.deepEqual(spec.slides[0].items[0].wrap, ['Giả danh', 'cơ quan công an']);
  assert.equal(spec.slides[0].items[1].wrap, undefined);
  assert.deepEqual(spec.slides[0].callout.wrap, ['Không có gì', 'là miễn phí']);
  assert.equal(spec.slides[1].wrap, undefined);
  assert.match(html[0], /<h2 class="title"[^>]*><span class="nbp">XU HƯỚNG<\/span> <span class="nbp"><em class="hl">LỪA ĐẢO<\/em><\/span><\/h2>/);
  assert.match(html[0], /<h4[^>]*><span class="nbp">Giả danh<\/span> <span class="nbp">cơ quan công an<\/span><\/h4>/);
  assert.match(html[0], /class="co-t"[^>]*><span class="nbp">Không có gì<\/span> <span class="nbp">là <em class="hl">miễn phí<\/em><\/span>/);
  assert.doesNotMatch(html[1], /nbp/);
  // Trang kết: tiêu đề cũng theo cụm + tô nhấn như các trang khác.
  assert.match(html[2], /class="cl-t"[^>]*><span class="nbp">CẢM ƠN<\/span> <span class="nbp"><em class="hl">CÁC BẠN<\/em><\/span>/);
});

test('typesetBrief: tiêu đề → câu chốt → tiêu đề mục/bước; bỏ câu ≤ 2 từ, chữ có định dạng, trang tự do', () => {
  const spec = {
    slides: [
      { layout: 'cards', title: 'NGÀNH CÔNG NGHIỆP LỪA ĐẢO', highlight: 'CÔNG NGHIỆP', items: cards(), callout: { tone: 'note', style: 'quote', text: 'Không có gì là miễn phí' } },
      { layout: 'section', title: 'PHÒNG TRÁNH' },
      { layout: 'process', title: 'Hành trình ⟦b⟧lừa đảo⟦/⟧ qua mạng', steps: [{ title: 'Cài ứng dụng lạ' }], callout: { tone: 'note', text: 'Hộp thường không dàn chữ lớn' } },
      { layout: 'free', title: 'Trang tự do nhiều chữ' },
    ],
  };
  assert.deepEqual(typesetBrief(spec), [
    { id: 't0', kind: 'title', text: 'NGÀNH CÔNG NGHIỆP LỪA ĐẢO', hl: 'CÔNG NGHIỆP' },
    { id: 'c0', kind: 'callout', text: 'Không có gì là miễn phí' },
    { id: 'i0.0', kind: 'item', text: 'Giả danh cơ quan công an' },
    { id: 's2.0', kind: 'item', text: 'Cài ứng dụng lạ' },
  ]);
});

test('parseGroups: chỉ nhận khi ghép lại đúng nguyên văn và ranh giới cụm trùng ranh giới từ; cụm quá dài → bỏ', () => {
  assert.deepEqual(parseGroups('15 tỷ đồng bị mất', '15 tỷ đồng | bị mất'), ['15 tỷ đồng', 'bị mất']);
  assert.deepEqual(parseGroups('BỊ LỪA  LẦN HAI: “DỊCH VỤ”', 'BỊ LỪA|LẦN HAI:|“DỊCH VỤ”'), ['BỊ LỪA', 'LẦN HAI:', '“DỊCH VỤ”']);
  assert.equal(parseGroups('a b c', 'a b|d'), null); // sửa chữ
  assert.equal(parseGroups('a b c', 'a b'), null); // thiếu chữ
  assert.equal(parseGroups('a b c', 'a b c|d'), null); // thừa chữ
  assert.equal(parseGroups('lừa đảo', 'lừ|a đảo'), null); // cắt giữa từ
  assert.equal(parseGroups('một hai ba bốn năm sáu', 'một hai ba bốn năm sáu'), null);
  assert.equal(GROUP_MAX_WORDS, 5);
});

test('snapHighlight: nới cụm nhấn cho trọn cụm, bỏ hư từ dẫn đầu và dấu câu cuối, không tô cả câu / quá dài', () => {
  const g = ['NGÀNH', 'CÔNG NGHIỆP', 'LỪA ĐẢO', 'TỶ ĐÔ'];
  assert.equal(snapHighlight(g, 'NGHIỆP LỪA'), 'CÔNG NGHIỆP LỪA ĐẢO');
  assert.equal(snapHighlight(g, 'LỪA ĐẢO TỶ ĐÔ'), 'LỪA ĐẢO TỶ ĐÔ');
  assert.equal(snapHighlight(g, ''), null);
  assert.equal(snapHighlight(g, 'không có trong câu'), '');
  assert.equal(snapHighlight(g, 'NGÀNH CÔNG NGHIỆP LỪA ĐẢO TỶ ĐÔ'), '');
  assert.equal(snapHighlight(['Không có gì', 'là miễn phí'], 'miễn phí'), 'miễn phí');
  assert.equal(snapHighlight(['Không có gì', 'là miễn phí'], 'phí'), 'là miễn phí');
  assert.equal(snapHighlight(['BỊ LỪA', 'LẦN HAI:', '“DỊCH VỤ”'], 'LỪA LẦN'), 'BỊ LỪA LẦN HAI');
});

test('applyTypeset: ghi wrap + cụm nhấn trọn cụm; kết quả sai nguyên văn bị bỏ (chữ của bài không đổi); câu ≤ 2 từ tự thành 1 cụm', () => {
  const spec = {
    slides: [
      { layout: 'cards', title: 'NGÀNH CÔNG NGHIỆP LỪA ĐẢO', highlight: 'CÔNG NGHIỆP', items: cards(), callout: { tone: 'note', style: 'band', text: 'Không có gì là miễn phí' } },
      { layout: 'section', title: 'PHÒNG TRÁNH', highlight: '' },
      { layout: 'bullets', title: 'TỔNG QUAN SỰ PHÁT TRIỂN', highlight: 'PHÁT', wrap: ['cũ'] },
    ],
  };
  const before = JSON.stringify(spec.slides.map((s) => [s.title, s.items?.map((x) => x.title), s.callout?.text]));
  const out = applyTypeset(spec, {
    lines: [
      { id: 't0', split: 'NGÀNH|CÔNG NGHIỆP|LỪA ĐẢO', hl: 'CÔNG NGHIỆP LỪA ĐẢO' },
      { id: 'c0', split: 'Không có gì|là miễn phí', hl: 'miễn phí' },
      { id: 'i0.0', split: 'Giả danh|cơ quan công an', hl: 'công an' },
      { id: 't2', split: 'TỔNG QUAN|SỰ PHÁT TRIỂN MẠNH', hl: 'SỰ PHÁT TRIỂN' },
      { id: 'x9', split: 'rác' },
    ],
  });
  assert.equal(JSON.stringify(spec.slides.map((s) => [s.title, s.items?.map((x) => x.title), s.callout?.text])), before);
  assert.deepEqual(spec.slides[0].wrap, ['NGÀNH', 'CÔNG NGHIỆP', 'LỪA ĐẢO']);
  assert.equal(spec.slides[0].highlight, 'CÔNG NGHIỆP LỪA ĐẢO');
  assert.deepEqual(spec.slides[0].callout.wrap, ['Không có gì', 'là miễn phí']);
  assert.equal(spec.slides[0].callout.highlight, 'miễn phí');
  assert.deepEqual(spec.slides[0].items[0].wrap, ['Giả danh', 'cơ quan công an']);
  assert.equal(spec.slides[0].items[0].highlight, undefined);
  assert.deepEqual(spec.slides[0].items[1].wrap, ['Lừa đảo']);
  assert.deepEqual(spec.slides[1].wrap, ['PHÒNG TRÁNH']);
  // Model sửa chữ → bỏ cả wrap cũ; cụm nhấn đang dùng giữ nguyên.
  assert.equal(spec.slides[2].wrap, undefined);
  assert.equal(spec.slides[2].highlight, 'PHÁT');
  assert.deepEqual(out, { lines: 6, wrapped: 5, highlights: 2, rejected: 1 });
  // Spec sau dàn chữ vẫn hợp lệ và giữ được wrap qua normalizeSpec.
  const { spec: clean, errors } = normalizeSpec({ title: 'Thử', slides: spec.slides });
  assert.deepEqual(errors, []);
  assert.deepEqual(clean.slides[0].wrap, ['NGÀNH', 'CÔNG NGHIỆP', 'LỪA ĐẢO']);
  // Model không trả gì (lỗi mạng): chỉ áp phần tự xử lý.
  const s2 = { slides: [{ layout: 'section', title: 'CẬN CẢNH' }, { layout: 'cards', title: 'Một tiêu đề dài hơn hai từ', items: cards() }] };
  assert.deepEqual(applyTypeset(s2, null), { lines: 4, wrapped: 2, highlights: 0, rejected: 0 });
});

test('typeset: lược đồ trả lời + lời nhắc coi câu là dữ liệu', () => {
  const sc = typesetResponseSchema();
  assert.deepEqual(sc.properties.lines.items.required, ['id', 'split']);
  assert.match(TYPESET_PROMPT, /DỮ LIỆU/);
});

test('deckLint: điểm trang = k − phạt; lỗi che/cắt chữ kéo trang chữ nguyên cỡ xuống dưới ngưỡng thử kiểu khác; tổng lỗi; sửa tự động', () => {
  assert.equal(lintScore({ k: 1, issues: [] }), 1);
  assert.equal(lintScore({ k: 1, issues: [{ kind: 'orphan' }] }), 0.96);
  assert.ok(lintScore({ k: 1, issues: [{ kind: 'overlap' }] }) < FIT_TIGHT);
  assert.equal(lintScore({ k: 0.9, issues: [{ kind: 'clip' }, { kind: 'spill' }, { kind: 'overlap' }] }), 0.3);
  assert.equal(LINT_WEIGHT.tiny, 0);
  assert.deepEqual(lintTotals([{ k: 1, issues: [{ kind: 'orphan' }, { kind: 'clip' }] }, { k: 1, issues: [{ kind: 'orphan' }] }]), { orphan: 2, clip: 1 });
  // Trang k = 1 có hình đè chữ được đưa vào danh sách thử kiểu trình bày khác.
  const { spec } = normalizeSpec({ title: 'Thử', slides: [{ layout: 'cards', title: 'Bốn thẻ', items: [...cards(), ...cards()] }, { layout: 'cards', title: 'Trang ổn', items: cards() }] });
  const lint = [{ k: 1, issues: [{ kind: 'overlap', at: 'h4', with: 'ib' }] }, { k: 1, issues: [{ kind: 'orphan', at: 'p' }] }];
  const trials = fitTrials(spec, lint.map(lintScore));
  assert.ok(trials.length > 0);
  assert.ok(trials.every((t) => t.slide === 0));
  // Sửa tự động: huy hiệu tràn/đè chữ → bỏ huy hiệu; hình trong hộp câu chốt đè chữ → về dạng dải, bỏ hình.
  const s = {
    slides: [
      { layout: 'process', steps: [{ title: 'A', badge: 'Dừng lại ở đây là an toàn' }, { title: 'B' }] },
      { layout: 'cards', items: cards(), callout: { tone: 'note', style: 'quote', text: 'Câu chốt' }, image: { asset: A, frame: 'art', fit: 'contain' } },
      { layout: 'cards', items: [{ title: 'C', badge: 'Giữ' }] },
    ],
  };
  const fixed = lintFixes(s, [
    { k: 1, issues: [{ kind: 'spill', at: 'fbadge' }] },
    { k: 1, issues: [{ kind: 'overlap', at: 'h4', with: 'cq-art' }] },
    { k: 1, issues: [{ kind: 'orphan', at: 'fbadge' }] },
  ]);
  assert.equal(fixed, 2);
  assert.equal(s.slides[0].steps[0].badge, undefined);
  assert.equal(s.slides[1].callout.style, 'band');
  assert.equal(s.slides[1].image, undefined);
  assert.equal(s.slides[2].items[0].badge, 'Giữ');
});

test('thị giác bìa → kết: sân khấu quỹ đạo sau hình 3D chủ đạo, hình lõi ở trang chuyển đoạn không số/không hình, hình ở trang kết', () => {
  const art = { asset: A, frame: 'art', fit: 'contain' };
  const { spec, errors } = normalizeSpec({
    title: 'Thử',
    parts: [{ title: 'Mở đầu', color: 'blue' }, { title: 'Nội dung', color: 'green' }],
    slides: [
      { layout: 'cover', title: 'Bìa có hình', image: art, part: 0 },
      { layout: 'section', title: 'Phần hai', image: art, part: 1 },
      { layout: 'section', title: 'VIDEO 1', icon: 'play', part: 1 },
      { layout: 'bullets', title: 'Trang thường', items: cards(), image: art, part: 1 },
      { layout: 'closing', title: 'Cảm ơn', tags: ['Kết luận'], image: art, part: 1 },
      { layout: 'closing', title: 'Cảm ơn lần nữa', part: 1 },
    ],
  });
  assert.deepEqual(errors, []);
  const html = deckParts(spec, { ratio: '16:9', assetUrl: (id) => (id === A ? '/a.png' : null) }).slides;
  assert.match(html[0], /class="vbox stage"[^>]*><svg class="stage-rings"/);
  assert.match(html[0], /<figure data-loop="float"[^>]* class="media plate art"/);
  assert.match(html[1], /class="vbox stage"/);
  // Trang chuyển đoạn thứ hai của cùng phần: không số, không hình → hình lõi quỹ đạo + biểu tượng.
  assert.match(html[2], /class="sec no-num has-core"/);
  assert.match(html[2], /class="cv-art"/);
  assert.doesNotMatch(html[1], /has-core/);
  // Hình minh hoạ của trang nội dung không lên sân khấu.
  assert.doesNotMatch(html[3], /stage-rings/);
  assert.match(html[4], /class="cl-hero"><div class="cl">[\s\S]*class="vbox stage"/);
  assert.match(html[5], /class="cl"><div class="cv-ghost">/);
  assert.doesNotMatch(html[5], /cl-hero/);
});

test('planArt: trang kết nhận hình chủ đạo, xếp ngay sau bìa cùng trang mở đầu phần', () => {
  const { spec } = normalizeSpec({
    title: 'Thử',
    slides: [
      { layout: 'cover', title: 'Bìa' },
      { layout: 'bullets', title: 'Nội dung', items: cards() },
      { layout: 'closing', title: 'Kết' },
    ],
  });
  const arts = [{ slide: 'a shield', items: [] }, { slide: 'a lock', items: [] }, { slide: 'a handshake', items: [] }];
  assert.deepEqual(planArt(spec, arts, 2).map((x) => x.slide), [0, 2]);
});

test('tidyNumbers: mốc thời gian lặp ở đầu tiêu đề bước → về nhãn mốc; không có nhãn trùng mốc thì giữ nguyên', () => {
  const spec = {
    slides: [
      { layout: 'timeline', steps: [{ title: 'TRƯỚC 2015 · Lừa đại trà', value: '' }, { title: '2015 – 2019 · Lợi dụng mạng xã hội', value: '2015–2019' }, { title: '2023 – NAY · Thời AI', value: '2023–nay' }] },
      { layout: 'timeline', steps: [{ title: 'Thay đổi: nhận thức', value: 'Quý I' }, { title: 'Luyện tập: phản xạ', value: 'Quý II' }] },
      { layout: 'process', steps: [{ title: '2015 · Bắt đầu', value: '2015' }, { title: '2016 · Tiếp', value: '2016' }] },
    ],
  };
  assert.equal(tidyNumbers(spec), 1);
  assert.deepEqual(spec.slides[0].steps.map((s) => [s.value, s.title]), [['TRƯỚC 2015', 'Lừa đại trà'], ['2015–2019', 'Lợi dụng mạng xã hội'], ['2023–nay', 'Thời AI']]);
  assert.equal(spec.slides[1].steps[0].title, 'Thay đổi: nhận thức');
  assert.equal(spec.slides[2].steps[0].title, '2015 · Bắt đầu');
});

test('buildDeck: dàn chữ áp trước bàn soát; trang có hình đè chữ được đổi kiểu; model dàn chữ lỗi không làm hỏng lượt dựng', async () => {
  process.env.NODE_ENV = 'test';
  const base = loadConfig();
  const os = (title, points = [], extra = {}) => ({ id: `s-${title}`, layout: 'auto', title, subtitle: '', points, notes: '', images: [], video: null, ...extra });
  const TITLE = 'XU HƯỚNG LỪA ĐẢO VÀ CÁCH PHÒNG TRÁNH';
  const outline = { title: 'Bài', options: { tone: 'light' }, slides: [os(TITLE, ['a'], { layout: 'cover' }), os('Bốn kiểu lừa thường gặp', ['Giả danh cơ quan công an', 'Việc nhẹ lương cao', 'Đầu tư lãi khủng', 'Trúng thưởng bất ngờ'])] };
  const run = async (typesetImpl) => {
    const config = { ...base, design: { direct: true, review: false, typeset: true, lint: true } };
    const st = {};
    const lintCalls = [];
    const seen = [];
    const gemini = {
      async designDeck() {
        return {
          style: 'soft',
          parts: [],
          slides: [
            { ref: 'S1', layout: 'cover', variant: 'split', title: TITLE, highlight: 'CÁCH', art: '' },
            { ref: 'S2', layout: 'cards', variant: 'grid', title: 'Bốn kiểu lừa thường gặp', art: '', items: ['Giả danh cơ quan công an', 'Việc nhẹ lương cao', 'Đầu tư lãi khủng', 'Trúng thưởng bất ngờ'].map((title) => ({ title, text: 'mô tả', art: '' })) },
          ],
        };
      },
      async typeset(input) {
        seen.push(input.lines);
        return typesetImpl(input);
      },
    };
    const svc = createPresentationService({
      config,
      repos: {
        presentations: { async findOwned() { return { id: 'd1', tenant_id: 'u1', status: 'outline', ratio: '16:9', outline, outline_version: 1 }; }, async startBuildOwned() { return 1; }, async setGenerationResult(_t, _id, r) { st.spec = r.spec; }, async buildFailed(_t, _id, m) { st.failed = m; } },
        assets: { async create() {}, async listMediaForPresentation() { return []; }, async findById() { return null; }, async deleteOwned() {} },
        versions: {},
      },
      storage: { async put() {}, async get() { return Buffer.alloc(0); }, async remove() {} },
      gemini,
      browser: {
        // Lần 1 (cả bài): trang 2 có biểu tượng đè chữ; các lần sau (bài thử, đo lại) sạch.
        async lintDeck(html) {
          const n = (html.match(/<section class="slide /g) || []).length;
          lintCalls.push({ n, phrased: html.includes('<span class="nbp">XU HƯỚNG</span>') });
          return Array.from({ length: n }, (_, i) => ({ k: 1, issues: lintCalls.length === 1 && i === 1 ? [{ kind: 'overlap', at: 'h4', with: 'ib', text: 'x' }] : [] }));
        },
      },
      signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {},
    });
    await svc.build({ id: 'u1' }, 'd1', { outlineVersion: 1 }, '');
    const t = Date.now();
    while (!st.spec && !st.failed && Date.now() - t < 8000) await new Promise((r) => setTimeout(r, 20));
    return { st, lintCalls, seen };
  };
  const ok = await run(async () => ({
    lines: [
      { id: 't0', split: 'XU HƯỚNG|LỪA ĐẢO|VÀ CÁCH|PHÒNG TRÁNH', hl: 'CÁCH PHÒNG TRÁNH' },
      { id: 'i1.0', split: 'Giả danh|cơ quan công an', hl: '' },
    ],
  }));
  assert.equal(ok.st.failed, undefined, ok.st.failed);
  const [cover, cardsSlide] = ok.st.spec.slides;
  assert.deepEqual(cover.wrap, ['XU HƯỚNG', 'LỪA ĐẢO', 'VÀ CÁCH', 'PHÒNG TRÁNH']);
  assert.equal(cover.highlight, 'CÁCH PHÒNG TRÁNH');
  assert.deepEqual(cardsSlide.items[0].wrap, ['Giả danh', 'cơ quan công an']);
  assert.ok(ok.seen[0].some((l) => l.id === 't0' && l.hl === 'CÁCH'), 'model nhận cụm nhấn đang dùng');
  // Bàn soát đo bản ĐÃ dàn chữ; trang lỗi được thử kiểu khác rồi đo lại.
  assert.equal(ok.lintCalls.length, 3);
  assert.ok(ok.lintCalls[0].phrased);
  assert.equal(ok.lintCalls[0].n, 2);
  assert.notEqual(cardsSlide.variant, 'grid');
  // Model dàn chữ lỗi → bài vẫn dựng xong, không có cụm của model (chỉ phần tự xử lý), chữ giữ nguyên.
  const bad = await run(async () => {
    throw new Error('mạng');
  });
  assert.equal(bad.st.failed, undefined);
  assert.equal(bad.st.spec.slides[0].wrap, undefined);
  assert.equal(bad.st.spec.slides[0].title, TITLE);
});

test('Chromium thật: bàn soát chữ đo từng trang; bìa tự co cỡ chữ để tiêu đề gom về 2 dòng trọn cụm, không lỗi che/cắt chữ', { skip: CHROME ? false : 'không có Chromium', timeout: 90000 }, async () => {
  const TITLE = 'XU HƯỚNG LỪA ĐẢO VÀ CÁCH PHÒNG TRÁNH TRONG KỶ NGUYÊN SỐ';
  const { spec, errors } = normalizeSpec({
    title: 'Thử',
    theme: 'paper',
    slides: [
      { layout: 'cover', title: TITLE, highlight: 'CÁCH PHÒNG TRÁNH', wrap: ['XU HƯỚNG', 'LỪA ĐẢO', 'VÀ CÁCH', 'PHÒNG TRÁNH', 'TRONG KỶ NGUYÊN SỐ'], subtitle: 'Từ nhận diện thủ đoạn đến xây dựng phản xạ an toàn' },
      { layout: 'cards', title: 'Bốn kiểu lừa thường gặp', items: [...cards(), ...cards()] },
    ],
  });
  assert.deepEqual(errors, []);
  const html = renderDeck(spec, { ratio: '16:9', mode: 'present', assetUrl: () => null, assetMeta: () => null, videoEmbed: () => null, embeds: [], embedFont: true });
  const b = createBrowserService({ chromePath: CHROME, noSandbox: process.platform === 'linux', timeoutMs: 30000 });
  try {
    const lint = await b.lintDeck(html, { width: 1920, height: 1080 });
    assert.equal(lint.length, 2);
    assert.ok(lint.every((r) => r.k > 0 && r.k <= 1 && Array.isArray(r.issues)));
    assert.deepEqual(lint.flatMap((r) => r.issues).filter((x) => ['clip', 'spill', 'overlap'].includes(x.kind)), []);
    assert.equal(lint[0].issues.filter((x) => x.kind === 'orphan' && x.at === 'cv-title').length, 0);
  } finally {
    await b.close();
  }
});

test('cột so sánh + thẻ hàng ngang: tiêu đề cũng theo cụm nghĩa (dàn chữ gửi id k<trang>.<cột>, renderer dùng wrap)', () => {
  const spec = {
    slides: [
      { layout: 'comparison', title: 'Hai hình thức', columns: [{ title: 'HÌNH THỨC 2 · TỰ SA BẪY: Bạn tìm đến kẻ gian', points: ['a'] }, { title: 'Cách cũ', points: ['b'] }] },
      { layout: 'cards', variant: 'rows', title: 'Bám sát đời sống', items: [{ title: 'NĂM HỌC MỚI · Học bổng, việc làm thêm', text: 'x' }, { title: 'Mùa thuế', text: 'y' }, { title: 'Dịp Tết', text: 'z' }] },
    ],
  };
  assert.ok(typesetBrief(spec).some((l) => l.id === 'k0.0' && l.kind === 'item'));
  applyTypeset(spec, { lines: [{ id: 'k0.0', split: 'HÌNH THỨC 2 ·|TỰ SA BẪY:|Bạn tìm đến|kẻ gian' }, { id: 'i1.0', split: 'NĂM HỌC MỚI ·|Học bổng,|việc làm thêm' }] });
  const { spec: clean, html } = render(spec.slides);
  assert.deepEqual(clean.slides[0].columns[0].wrap, ['HÌNH THỨC 2 ·', 'TỰ SA BẪY:', 'Bạn tìm đến', 'kẻ gian']);
  assert.deepEqual(clean.slides[0].columns[1].wrap, ['Cách cũ']);
  assert.match(html[0], /<span class="nbp">TỰ SA BẪY:<\/span> <span class="nbp">Bạn tìm đến<\/span>/);
  assert.match(html[1], /class="crow"[\s\S]*<span class="nbp">Học bổng,<\/span> <span class="nbp">việc làm thêm<\/span>/);
});

test('Chromium thật: logo phía trên — tiêu đề ngắn không mất khoảng trên, tiêu đề dài chỉ lùi xuống vừa đủ dưới logo, không dòng chữ nào chạm logo', { skip: CHROME ? false : 'không có Chromium', timeout: 90000 }, async () => {
  const LOGO = '7b1c2d3e-4f50-4a61-8b72-93a4b5c6d7e8';
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const { spec, errors } = normalizeSpec({
    title: 'Thử',
    theme: 'paper',
    logo: { asset: LOGO, position: 'tr', size: 140 },
    slides: [
      { layout: 'cards', kicker: 'Mở đầu', title: 'Bốn kiểu lừa', items: cards() },
      { layout: 'cards', kicker: 'Khởi động', title: 'CÔNG NGHIỆP LỪA ĐẢO GIỜ ĐANG TINH VI THẾ NÀO', items: cards() },
    ],
  });
  assert.deepEqual(errors, []);
  const html = renderDeck(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => (id === LOGO ? PX : null), assetMeta: (id) => (id === LOGO ? { width: 660, height: 264 } : null), videoEmbed: () => null, embeds: [], embedFont: true });
  assert.match(html, /lg-top/);
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: process.platform === 'linux' ? ['--no-sandbox'] : [] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (window.__deck ? window.__deck.ready : null));
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#deck .slide')).map((s) => {
      const lg = Array.from(s.children).find((c) => c.classList.contains('logo'));
      const L = lg.getBoundingClientRect();
      const free = s.classList.contains('lg-free');
      const pad = parseFloat(getComputedStyle(s).paddingTop);
      s.classList.remove('lg-free');
      const full = parseFloat(getComputedStyle(s).paddingTop);
      s.classList.toggle('lg-free', free);
      const range = document.createRange();
      let hit = 0;
      const walk = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, null);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (!n.nodeValue.trim() || !n.parentElement.closest('.hd,.body')) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0 && r.right > L.left && r.left < L.right && r.bottom > L.top && r.top < L.bottom) hit += 1;
      }
      return { free, pad, full, hit, logoH: L.height };
    }));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.logoH > 0 && r.full > 200), 'logo có kích thước, khoảng chừa mặc định lớn');
    // Tiêu đề ngắn: bỏ hẳn khoảng chừa (về lề 100px của trang không logo).
    assert.equal(rows[0].free, true);
    assert.equal(rows[0].pad, 100);
    // Tiêu đề dài tới logo: chỉ lùi một phần (nhỏ hơn hẳn khoảng chừa mặc định) và không dòng chữ nào đè logo.
    assert.equal(rows[1].free, true);
    assert.ok(rows[1].pad > 100 && rows[1].pad < rows[1].full - 40, `đẩy vừa đủ: ${rows[1].pad} / ${rows[1].full}`);
    assert.deepEqual(rows.map((r) => r.hit), [0, 0]);
  } finally {
    await browser.close();
  }
});
