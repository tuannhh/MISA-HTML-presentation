// Nguồn = đường link (tối đa 5): tìm ảnh nội dung chính trong trang web (lazy-load, srcset, <picture>, og:image), lọc ảnh rác,
// tải ảnh có hạn mức chia đều giữa các link, Facebook chỉ thẻ og:, kiểm tra đầu vào nhiều link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { findPageImages, fetchImages, largestFromSrcset, imageKey, mainRegion, pageMeta, webImageHint } from '../../src/services/webSource.js';
import { precheckSource, ingestSource, shareBudget } from '../../src/services/ingestService.js';

const jpeg = (width, height) => sharp({ create: { width, height, channels: 3, background: '#4a7bd0' } }).jpeg().toBuffer();
const LIMITS = { maxUploadMb: 300, maxTextChars: 200000, maxImageUploadMb: 15, maxImagesPerDeck: 60, maxLinkImages: 24, maxSourceLinks: 5, maxUploadFiles: 20 };

const ARTICLE = `<!doctype html><html><head><title>Tin MISA</title>
<meta content="https://news.example.vn/og/cover.jpg" property="og:image">
<meta property="og:description" content="MISA ra mắt nền tảng AI cho doanh nghiệp vừa và nhỏ.">
<script>var x = '<img src="https://news.example.vn/js.jpg">';</script></head><body>
<header><img src="/static/logo-misa.png" alt="MISA"><img src="/img/top-banner.jpg"></header>
<nav><img src="/icons/menu.png"></nav>
<div class="post entry-content">
  <h2>Ra mắt nền tảng AMIS</h2>
  <p>${'Nội dung bài viết rất dài về sản phẩm. '.repeat(20)}</p>
  <figure><img class="lazy" src="data:image/gif;base64,R0lGOD" data-src="/uploads/2026/10/su-kien-300x200.jpg" alt="wm1-1791946565839-5630"><figcaption>Lễ ra mắt tại Hà Nội &amp; TP HCM</figcaption></figure>
  <picture><source data-srcset="https://cdn.example.vn/a.jpg?w=480 1x, https://cdn.example.vn/a.jpg?w=1200 2x"><img src="https://cdn.example.vn/a.jpg?w=300" alt="Khách hàng dùng AMIS"></picture>
  <h3>Giao diện</h3>
  <img srcset="/g/ui-480.png 480w, /g/ui-1600.png 1600w, /g/ui-800.png 800w" src="/g/ui-480.png" alt="Màn hình báo cáo">
  <img src="/g/chart.svg"><img src="/g/thumb.jpg" width="40" height="40"><img src="/g/a1.jpg" class="author-avatar">
  <img src="/g/doi-tac.jpg" alt="Logo đối tác"><img src="/uploads/2026/10/su-kien.jpg">
  <noscript><img src='/g/no-js.jpg'></noscript>
</div>
<aside><img src="/related/other-news.jpg"></aside>
<footer><img src="/f/bct.png"></footer></body></html>`;

test('findPageImages: ảnh trong khối nội dung chính theo thứ tự, lazy-load/srcset/picture, chú thích + mục, og:image cuối, bỏ ảnh rác', () => {
  const list = findPageImages(ARTICLE, 'https://news.example.vn/tin/ra-mat.html');
  assert.deepEqual(list.map((x) => x.url), [
    'https://news.example.vn/uploads/2026/10/su-kien-300x200.jpg',
    'https://cdn.example.vn/a.jpg?w=1200',
    'https://news.example.vn/g/ui-1600.png',
    'https://news.example.vn/g/no-js.jpg',
    'https://news.example.vn/og/cover.jpg',
  ]);
  const [ev, pic, ui, , og] = list;
  assert.equal(ev.caption, 'Lễ ra mắt tại Hà Nội & TP HCM');
  assert.equal(ev.alt, '', 'alt dạng mã tệp bị bỏ');
  assert.equal(ev.heading, 'Ra mắt nền tảng AMIS');
  assert.equal(pic.alt, 'Khách hàng dùng AMIS', '<img> cùng ảnh với <source> → gộp, giữ mô tả');
  assert.equal(ui.heading, 'Giao diện');
  assert.equal(og.og, true);
  // ảnh trong <script>, header/nav/aside/footer, svg, ảnh 40px, ảnh đại diện, logo, bản khác cỡ (-300x200) của cùng ảnh → không có
  assert.ok(!list.some((x) => /\/js\.jpg|logo|menu|chart\.svg|thumb|avatar|doi-tac|other-news|bct/.test(x.url)));
});

test('mainRegion: không có khối nội dung → cả trang trừ đầu/chân trang; <article> ít chữ không được chọn', () => {
  const html = `<header><img src="/h.jpg"></header><article><p>ngắn</p></article><div><img src="/body.jpg"></div><footer><img src="/f.jpg"></footer>`;
  const r = mainRegion(html);
  assert.ok(r.includes('/body.jpg') && !r.includes('/h.jpg') && !r.includes('/f.jpg'));
  assert.deepEqual(findPageImages(html, 'https://x.example.vn/').map((x) => x.url), ['https://x.example.vn/body.jpg']);
});

test('largestFromSrcset / imageKey / pageMeta / Facebook chỉ og', () => {
  assert.equal(largestFromSrcset('a.jpg 480w, b.jpg 1200w,c.jpg 800w'), 'b.jpg');
  assert.equal(largestFromSrcset('a.jpg, b.jpg 2x'), 'b.jpg');
  assert.equal(imageKey(new URL('https://a.vn/up/x-1024x683.jpg?v=2')), imageKey(new URL('https://a.vn/up/x.jpg')));
  assert.notEqual(imageKey(new URL('https://a.vn/img.php?id=1')), imageKey(new URL('https://a.vn/img.php?id=2')));
  const fb = `<title>Facebook</title><meta property="og:title" content="MISA JSC"><meta property="og:image" content="https://scontent.fbcdn.net/p.jpg?stp=1&amp;oh=2"><body><img src="/x.jpg"></body>`;
  assert.equal(pageMeta(fb).title, 'MISA JSC');
  assert.deepEqual(findPageImages(fb, 'https://www.facebook.com/MISAJSC', { ogOnly: true }).map((x) => x.url), ['https://scontent.fbcdn.net/p.jpg?stp=1&oh=2']);
  const hint = webImageHint('Tin "MISA"\nmới', { caption: 'Ảnh 1', heading: 'Mục A', alt: 'bỏ' });
  assert.equal(hint, 'ảnh trên trang web "Tin MISA mới" — chú thích: Ảnh 1 — thuộc mục "Mục A"');
});

test('fetchImages: chỉ nhận ảnh thật đủ lớn, bỏ dải mảnh/lỗi, thử ảnh kế khi hỏng, gửi referer, dừng khi đủ', async () => {
  const bodies = {
    'https://i.vn/html.jpg': Buffer.from('<html>not image</html>'),
    'https://i.vn/small.jpg': await jpeg(150, 150),
    'https://i.vn/strip.jpg': await jpeg(1200, 200),
    'https://i.vn/ok1.jpg': await jpeg(800, 600),
    'https://i.vn/ok2.jpg': await jpeg(600, 900),
    'https://i.vn/ok3.jpg': await jpeg(640, 480),
  };
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, referer: opts.headers.referer });
    if (url.endsWith('404.jpg')) return { status: 404, body: Buffer.alloc(0) };
    if (url.endsWith('boom.jpg')) throw new Error('ECONNRESET');
    return { status: 200, body: bodies[url] };
  };
  const cands = ['html', '404', 'boom', 'small', 'strip', 'ok1', 'ok2', 'ok3'].map((n) => ({ url: `https://i.vn/${n}.jpg`, alt: '', caption: '', heading: '' }));
  const { images, next } = await fetchImages(cands, { fetch, referer: 'https://page.vn/a', max: 2, maxBytes: 1e7, concurrency: 3 });
  assert.deepEqual(images.map((x) => x.name), ['ok1.jpg', 'ok2.jpg']);
  assert.equal(images[0].width, 800);
  assert.ok(next <= cands.length && !calls.some((c) => c.url.endsWith('ok3.jpg')), 'đủ 2 ảnh → không tải tiếp');
  assert.ok(calls.every((c) => c.referer === 'https://page.vn/a'));
  const late = await fetchImages(cands, { fetch, max: 5, maxBytes: 1e7, deadline: Date.now() - 1 });
  assert.equal(late.images.length, 0, 'quá hạn thời gian → không tải');
});

test('shareBudget: chia đều, phần ít ảnh lấy đủ, phần dư dồn cho phần nhiều ảnh', () => {
  assert.deepEqual(shareBudget([10, 10, 10], 24), [8, 8, 8]);
  assert.deepEqual(shareBudget([2, 30, 1], 24), [2, 21, 1]);
  assert.deepEqual(shareBudget([0, 5], 3), [0, 3]);
  assert.deepEqual(shareBudget([5, 5], 0), [0, 0]);
});

test('precheckSource: tối đa 5 link, bỏ ô trống + link trùng, báo link sai theo thứ tự, chặn thư mục Drive, không trộn nguồn', async () => {
  const one = await precheckSource({ url: 'https://amis.misa.vn/118140/phan-mem/' }, LIMITS);
  assert.deepEqual(one.urls, ['https://amis.misa.vn/118140/phan-mem/']);
  assert.equal(one.sourceLabel, 'https://amis.misa.vn/118140/phan-mem/');
  const many = await precheckSource({ urls: ['https://www.misa.vn/a', '  ', 'https://vnexpress.net/b.html', 'https://www.misa.vn/a#muc-2'] }, LIMITS);
  assert.deepEqual(many.urls, ['https://www.misa.vn/a', 'https://vnexpress.net/b.html']);
  assert.equal(many.sourceLabel, '2 link: misa.vn, vnexpress.net');
  const six = Array.from({ length: 6 }, (_, i) => `https://misa.vn/${i}`);
  await assert.rejects(precheckSource({ urls: six }, LIMITS), (e) => e.code === 'TOO_MANY_LINKS' && /Tối đa 5/.test(e.message));
  await assert.rejects(precheckSource({ urls: ['https://misa.vn/a', 'ftp://x.vn/b'] }, LIMITS), (e) => e.code === 'INVALID_URL' && /^Link 2: /.test(e.message));
  await assert.rejects(precheckSource({ urls: ['https://misa.vn/a', 'http://127.0.0.1/x'] }, LIMITS), (e) => e.code === 'SSRF_BLOCKED');
  await assert.rejects(precheckSource({ urls: ['https://drive.google.com/drive/folders/1AbCdEfGhIjK'] }, LIMITS), (e) => e.code === 'UNSUPPORTED_LINK');
  await assert.rejects(precheckSource({ urls: ['https://misa.vn/a'], text: 'Nội dung nhập tay đủ dài để tạo bài' }, LIMITS), (e) => e.code === 'SOURCE_REQUIRED');
  await assert.rejects(precheckSource({ urls: ['', ' '] }, LIMITS), (e) => e.code === 'SOURCE_REQUIRED');
});

test('ingestSource nhiều link: chữ từng trang + ảnh xen kẽ giữa các link trong hạn mức, Facebook chỉ og, link lỗi báo rõ thứ tự', async () => {
  const pageA = ARTICLE;
  const pageFb = `<title>Facebook</title><meta property="og:title" content="MISA JSC"><meta property="og:description" content="Bài đăng: MISA khai trương văn phòng mới tại Đà Nẵng"><meta property="og:image" content="https://scontent.fbcdn.net/post.jpg"><body>Đăng nhập Facebook</body>`;
  const img = await jpeg(900, 600);
  const seen = [];
  const fetch = async (url) => {
    seen.push(url);
    if (url === 'https://news.example.vn/tin/ra-mat.html') return { status: 200, contentType: 'text/html; charset=utf-8', body: Buffer.from(pageA), finalUrl: new URL(url) };
    if (url === 'https://www.facebook.com/MISAJSC/posts/1') return { status: 200, contentType: 'text/html', body: Buffer.from(pageFb), finalUrl: new URL(url) };
    if (url === 'https://www.facebook.com/private') return { status: 200, contentType: 'text/html', body: Buffer.from('<title>Facebook</title><body>Đăng nhập</body>'), finalUrl: new URL(url) };
    if (url === 'https://blocked.example.vn/') return { status: 403, contentType: 'text/html', body: Buffer.alloc(0) };
    if (url.endsWith('no-js.jpg')) return { status: 404, body: Buffer.alloc(0) };
    return { status: 200, contentType: 'image/jpeg', body: img };
  };
  const out = await ingestSource({ urls: ['https://news.example.vn/tin/ra-mat.html', 'https://www.facebook.com/MISAJSC/posts/1'] }, { limits: { ...LIMITS, maxLinkImages: 4 }, fetch });
  assert.equal(out.pieces.length, 2);
  assert.match(out.pieces[0].text, /^Mô tả trang: MISA ra mắt nền tảng AI/);
  assert.equal(out.pieces[1].text, 'Mô tả trang: Bài đăng: MISA khai trương văn phòng mới tại Đà Nẵng\nMISA JSC');
  assert.ok(!out.pieces[1].text.includes('Đăng nhập'), 'Facebook: bỏ chữ khung đăng nhập');
  // Hạn mức 4: Facebook 1 ảnh og, trang báo 3 ảnh; xen kẽ link 1 → link 2 → link 1…
  assert.equal(out.images.length, 4);
  assert.match(out.images[0].hint, /^ảnh trên trang web "Tin MISA" — chú thích: Lễ ra mắt/);
  assert.match(out.images[1].hint, /"MISA JSC" — ảnh tiêu biểu của trang \(og:image\)/);
  assert.ok(out.images.every((im) => im.buffer?.length && im.name));
  assert.ok(seen.includes('https://scontent.fbcdn.net/post.jpg'));

  await assert.rejects(
    ingestSource({ urls: ['https://news.example.vn/tin/ra-mat.html', 'https://blocked.example.vn/'] }, { limits: LIMITS, fetch }),
    (e) => e.code === 'SOURCE_FORBIDDEN' && /^Link 2 \(blocked\.example\.vn\): Không truy cập được/.test(e.message),
  );
  await assert.rejects(ingestSource({ urls: ['https://www.facebook.com/private'] }, { limits: LIMITS, fetch }), (e) => e.code === 'SOURCE_FORBIDDEN' && /Facebook/.test(e.message));
  const textOnly = await ingestSource({ urls: ['https://news.example.vn/tin/ra-mat.html'] }, { limits: { ...LIMITS, maxLinkImages: 0 }, fetch });
  assert.equal(textOnly.images.length, 0, 'MAX_LINK_IMAGES=0 → chỉ lấy chữ');
});
