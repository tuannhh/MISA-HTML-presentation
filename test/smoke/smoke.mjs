// Kiểm thử khói end-to-end trên server đang chạy (cần Gemini thật): 2 tenant, tạo bài từ văn bản,
// kiểm tra cách ly tenant, công khai, sửa có khoá phiên bản, xem trước, xuất HTML/PDF.
// Dùng: BASE=http://localhost:3000 node test/smoke/smoke.mjs
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:3000';
const stamp = Date.now().toString(36);

function client() {
  let cookie = '';
  let csrf = '';
  async function req(method, path, body, { raw = false, form = null } = {}) {
    const headers = { cookie };
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
r = await a.req('POST', '/api/presentations', undefined, { form });
assert.equal(r.status, 202, JSON.stringify(r.json));
const id = r.json.data.id;
console.log('✓ tạo bài (202), id', id);

let deck;
for (let i = 0; i < 90; i += 1) {
  await new Promise((s) => setTimeout(s, 2000));
  r = await a.req('GET', `/api/presentations/${id}`);
  if (r.json.data.status !== 'generating') {
    deck = r.json.data;
    break;
  }
}
assert.ok(deck, 'hết thời gian chờ AI');
assert.equal(deck.status, 'ready', deck.errorMessage);
console.log(`✓ AI tạo xong: ${deck.spec.slides.length} trang — "${deck.title}" — layouts: ${deck.spec.slides.map((s) => s.layout).join(', ')}`);

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
