// Kiểm thử khói end-to-end trên server đang chạy (cần Gemini thật + Internet cho YouTube): 2 tenant, tạo dàn ý từ văn bản,
// duyệt/sửa dàn ý + gắn media (logo tách nền, video tải lên, YouTube) + thiết kế → dựng bài, cách ly tenant, công khai,
// sửa có khoá phiên bản, phát video theo Range, xem trước, xuất HTML (nhúng video, phông)/PDF.
// Dùng: BASE=http://localhost:3000 node test/smoke/smoke.mjs
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';

const BASE = process.env.BASE || 'http://localhost:3000';
const stamp = Date.now().toString(36);

function client() {
  let cookie = '';
  let csrf = '';
  async function req(method, path, body, { raw = false, form = null, extra = {} } = {}) {
    const headers = { cookie, ...extra };
    if (method !== 'GET') headers['x-csrf-token'] = csrf;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    if (raw) return res;
    const json = await res.json().catch(() => null);
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    if (json?.data?.token) csrf = json.data.token;
    return { status: res.status, json };
  }
  return { req, init: () => req('GET', '/api/auth/csrf') };
}

const a = client();
const b = client();
await a.init();
await b.init();

let r = await a.req('POST', '/api/auth/register', { email: `a-${stamp}@misa.com.vn`, password: 'Matkhau12345', displayName: 'Người Dùng Á' });
assert.equal(r.status, 201, JSON.stringify(r.json));
assert.equal(r.json.data.user.displayName, 'Người Dùng Á');
r = await b.req('POST', '/api/auth/register', { email: `b-${stamp}@misa.com.vn`, password: 'Matkhau12345', displayName: 'Người Dùng B' });
assert.equal(r.status, 201);
console.log('✓ đăng ký 2 tenant, tiếng Việt giữ nguyên');

const form = new FormData();
form.set('text', `MISA AMIS là nền tảng quản trị doanh nghiệp hợp nhất gồm kế toán, bán hàng, nhân sự, kho vận.
Năm 2025 có hơn 250.000 doanh nghiệp sử dụng. Thời gian lập báo cáo giảm 62%, tốc độ phê duyệt tăng 3,5 lần.
Lộ trình triển khai: khảo sát (2 tuần), thiết lập (4 tuần), chuyển dữ liệu (4 tuần), đào tạo (4 tuần), vận hành.
So sánh: cách làm cũ thủ công, nhập liệu lặp lại; cách làm mới tự động, số liệu tức thời trên di động.`);
form.set('ratio', '16:9');
form.set('slideCount', '7');
form.set('tone', 'light');
form.set('theme', 'custom');
form.set('primary', '#EA580C');
form.set('secondary', '#7C2D12');
r = await a.req('POST', '/api/presentations', undefined, { form });
assert.equal(r.status, 202, JSON.stringify(r.json));
assert.equal(r.json.data.status, 'outlining');
const id = r.json.data.id;
console.log('✓ tạo bài (202) → AI lập dàn ý, id', id);

async function waitWhile(statuses, label) {
  for (let i = 0; i < 150; i += 1) {
    await new Promise((s) => setTimeout(s, 2000));
    r = await a.req('GET', `/api/presentations/${id}`);
    if (!statuses.includes(r.json.data.status)) return r.json.data;
  }
  throw new Error(`hết thời gian chờ AI ${label}`);
}

let deck = await waitWhile(['outlining'], 'lập dàn ý');
assert.equal(deck.status, 'outline', deck.errorMessage);
assert.equal(deck.spec, null);
assert.equal(deck.outline.design.theme, 'custom');
assert.equal(deck.outline.design.palette.primary, '#EA580C');
console.log(`✓ dàn ý: ${deck.outline.slides.length} trang — ${deck.outline.slides.map((s) => `${s.layout}:${s.points.length}`).join(', ')}`);

// Tenant B không chạm được dàn ý / media của A
for (const [m, p, body] of [['PUT', `/api/presentations/${id}/outline`, { outline: deck.outline, outlineVersion: deck.outlineVersion }], ['POST', `/api/presentations/${id}/build`, { outlineVersion: deck.outlineVersion }], ['POST', `/api/presentations/${id}/youtube`, { url: 'https://youtu.be/aqz-KE-bpKQ' }]]) {
  r = await b.req(m, p, body);
  assert.equal(r.status, 404, `${m} ${p}`);
}
console.log('✓ tenant B không sửa/dựng/gắn media vào dàn ý của A');

// Media: logo nền trắng → tách nền; video tải lên; YouTube
const logoPng = await sharp({ create: { width: 600, height: 200, channels: 3, background: '#FFFFFF' } })
  .composite([{ input: Buffer.from('<svg width="600" height="200"><rect x="40" y="50" width="520" height="100" rx="20" fill="#E8590C"/></svg>'), top: 0, left: 0 }])
  .png()
  .toBuffer();
let fd = new FormData();
fd.set('file', new Blob([logoPng], { type: 'image/png' }), 'logo.png');
r = await a.req('POST', `/api/presentations/${id}/logo`, undefined, { form: fd });
assert.equal(r.status, 201, JSON.stringify(r.json));
const logoId = r.json.data.id;
r = await a.req('POST', `/api/presentations/${id}/logo/${logoId}/cutout`, { mode: 'color' });
assert.equal(r.status, 201, JSON.stringify(r.json));
assert.equal(r.json.data.method, 'color');
const cutoutId = r.json.data.asset.id;
assert.notEqual(cutoutId, logoId);

const fakeMp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(200_000, 7)]);
fd = new FormData();
fd.set('file', new Blob([fakeMp4], { type: 'video/mp4' }), 'gioi-thieu.mp4');
r = await a.req('POST', `/api/presentations/${id}/videos`, undefined, { form: fd });
assert.equal(r.status, 201, JSON.stringify(r.json));
const fileVideo = r.json.data.video;
assert.equal(fileVideo.provider, 'file');
fd = new FormData();
fd.set('file', new Blob([Buffer.from('ID3 không phải video')], { type: 'video/mp4' }), 'x.mp4');
r = await a.req('POST', `/api/presentations/${id}/videos`, undefined, { form: fd });
assert.equal(r.status, 422);

r = await a.req('POST', `/api/presentations/${id}/youtube`, { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
assert.equal(r.status, 201, JSON.stringify(r.json));
const ytVideo = r.json.data.video;
assert.equal(ytVideo.id, 'aqz-KE-bpKQ');
assert.ok(ytVideo.poster, 'có ảnh bìa YouTube');
r = await a.req('POST', `/api/presentations/${id}/youtube`, { url: 'https://evil.example/watch?v=aqz-KE-bpKQ' });
assert.equal(r.status, 400);
console.log(`✓ media: logo + tách nền (color), video tải lên (MP4 thật/giả mạo → 201/422), YouTube "${ytVideo.title}" có ảnh bìa 16:9`);

// Sửa dàn ý + thiết kế, lưu với khoá phiên bản
const outline = structuredClone(deck.outline);
outline.slides[0].title = 'Tiêu đề dàn ý đã sửa';
outline.slides[1].video = ytVideo;
outline.slides[1].images = [];
outline.slides[2].video = fileVideo;
outline.slides[2].images = [];
outline.slides.splice(3, 0, { id: 'them-moi', layout: 'stats', title: 'Con số nổi bật', subtitle: '', points: ['250.000 doanh nghiệp — Đang sử dụng', '62% — Giảm thời gian báo cáo'], notes: '', images: [], video: null });
outline.design = { ...outline.design, background: 'circuit', font: { heading: 'montserrat', body: 'roboto' }, logo: { asset: logoId, cutout: cutoutId, removeBg: true, position: 'br', size: 120, showOn: 'all' } };
r = await a.req('PUT', `/api/presentations/${id}/outline`, { outline, outlineVersion: deck.outlineVersion });
assert.equal(r.status, 200, JSON.stringify(r.json));
const v2 = r.json.data.outlineVersion;
r = await a.req('PUT', `/api/presentations/${id}/outline`, { outline, outlineVersion: deck.outlineVersion });
assert.equal(r.status, 409);
const bad = structuredClone(outline);
bad.slides[0].images = [{ asset: fileVideo.asset, caption: '' }];
r = await a.req('PUT', `/api/presentations/${id}/outline`, { outline: bad, outlineVersion: v2 });
assert.equal(r.status, 422, 'video không được đặt vào ô ảnh');
console.log('✓ lưu dàn ý (khoá phiên bản → 409; sai loại media → 422)');

r = await a.req('POST', `/api/presentations/${id}/build`, { outlineVersion: v2 });
assert.equal(r.status, 202, JSON.stringify(r.json));
r = await a.req('POST', `/api/presentations/${id}/build`, { outlineVersion: v2 });
assert.equal(r.status, 409, 'bấm Dựng bài 2 lần');
deck = await waitWhile(['generating'], 'dựng bài');
assert.equal(deck.status, 'ready', deck.errorMessage);
assert.equal(deck.spec.slides.length, outline.slides.length);
assert.equal(deck.spec.slides[0].title, 'Tiêu đề dàn ý đã sửa');
assert.equal(deck.spec.slides[1].video?.id, 'aqz-KE-bpKQ');
assert.equal(deck.spec.slides[2].video?.asset, fileVideo.asset);
assert.equal(deck.spec.slides[3].layout, 'stats');
assert.deepEqual([deck.spec.theme, deck.spec.background, deck.spec.font.heading, deck.spec.logo.cutout], ['custom', 'circuit', 'montserrat', cutoutId]);
console.log(`✓ dựng bài theo dàn ý: ${deck.spec.slides.length} trang — layouts: ${deck.spec.slides.map((s) => s.layout).join(', ')}`);

// Video phát theo Range
const vUrl = deck.assets.find((x) => x.id === fileVideo.asset).url;
r = await a.req('GET', vUrl, undefined, { raw: true });
assert.equal(r.status, 200);
assert.equal(r.headers.get('content-type'), 'video/mp4');
const ranged = await a.req('GET', vUrl, undefined, { raw: true, extra: { range: 'bytes=0-99' } });
assert.equal(ranged.status, 206);
assert.equal((await ranged.arrayBuffer()).byteLength, 100);
console.log('✓ video tải lên phát theo Range (206)');

// Cách ly tenant
r = await b.req('GET', `/api/presentations/${id}`);
assert.equal(r.status, 404);
r = await b.req('PATCH', `/api/presentations/${id}`, { title: 'chiếm quyền' });
assert.equal(r.status, 404);
r = await b.req('DELETE', `/api/presentations/${id}`);
assert.equal(r.status, 404);
r = await b.req('GET', `/api/presentations/${id}/preview`, undefined, { raw: true });
assert.equal(r.status, 404);
r = await b.req('GET', '/api/presentations?scope=mine');
assert.equal(r.json.data.length, 0);
console.log('✓ tenant B không đọc/sửa/xoá/xem trước được bài private của A');

// Sửa có khoá phiên bản
const spec = deck.spec;
spec.slides[0].title = 'Tiêu đề đã sửa';
r = await a.req('PATCH', `/api/presentations/${id}`, { spec, specVersion: deck.specVersion });
assert.equal(r.status, 200, JSON.stringify(r.json));
r = await a.req('PATCH', `/api/presentations/${id}`, { spec, specVersion: deck.specVersion });
assert.equal(r.status, 409);
console.log('✓ lưu spec, lưu lại bằng phiên bản cũ → 409');

// Công khai
r = await a.req('PATCH', `/api/presentations/${id}`, { visibility: 'public' });
assert.equal(r.json.data.visibility, 'public');
r = await b.req('GET', `/api/presentations/${id}`);
assert.equal(r.status, 200);
assert.equal(r.json.data.isOwner, false);
assert.equal(r.json.data.assets, undefined);
r = await b.req('GET', '/api/presentations?scope=public');
assert.ok(r.json.data.some((d) => d.id === id));
r = await b.req('PATCH', `/api/presentations/${id}`, { title: 'sửa bài người khác' });
assert.equal(r.status, 404);
r = await b.req('POST', `/api/presentations/${id}/duplicate`);
assert.equal(r.status, 201);
assert.equal(r.json.data.visibility, 'private');
assert.equal(r.json.data.isOwner, true);
console.log('✓ công khai: B xem được, không sửa được, nhân bản thành bản private của B');

// Xem trước + xuất
r = await a.req('GET', `/api/presentations/${id}/preview`, undefined, { raw: true });
assert.equal(r.status, 200);
assert.match(r.headers.get('content-security-policy'), /sandbox allow-scripts/);
r = await a.req('GET', `/api/presentations/${id}/export.html`, undefined, { raw: true });
assert.equal(r.status, 200);
const html = await r.text();
assert.ok(!/src="\/api\//.test(html), 'HTML xuất còn link ảnh ngoài');
assert.ok(html.includes('data:font/woff2;base64,'));
assert.ok(html.includes('font-family:"Deck Montserrat"'), 'nhúng phông đã chọn');
assert.ok(html.includes('type="application/octet-stream"'), 'nhúng video tải lên');
assert.ok(html.includes('data-vid="aqz-KE-bpKQ"'));
mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/smoke-export.html', html);
r = await a.req('GET', `/api/presentations/${id}/export.pdf`, undefined, { raw: true });
assert.equal(r.status, 200);
const pdf = Buffer.from(await r.arrayBuffer());
assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
writeFileSync('tmp/smoke-export.pdf', pdf);
console.log(`✓ xem trước (CSP sandbox), xuất HTML 1 tệp (${(html.length / 1024).toFixed(0)} KB), PDF (${(pdf.length / 1024).toFixed(0)} KB)`);

r = await a.req('PATCH', `/api/presentations/${id}`, { visibility: 'private' });
r = await b.req('GET', `/api/presentations/${id}`);
assert.equal(r.status, 404);
console.log('✓ chuyển lại private → B mất quyền xem');
console.log('TẤT CẢ ĐẠT');
