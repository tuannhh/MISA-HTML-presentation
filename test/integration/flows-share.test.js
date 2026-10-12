// Luồng chính qua HTTP (roadmap B) — chia sẻ theo người, phiên bản/handoff/khôi phục, mẫu thiết kế, media, xuất HTML/PDF,
// xuất bản ra domain công khai, admin. Mã kịch bản theo catalogue docs/audits/2026-10-12-codex/03-ma-tran-test-case.csv.
// PDF dùng Chromium thật (máy dev: Chrome/Edge cài sẵn; Docker: /usr/bin/chromium).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import { loadConfig } from '../../src/config/index.js';
import { useHttpApp, PUBLISH_BASE } from './helpers/httpApp.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const getApp = useHttpApp(config, { before, after });
const P = (id, tail = '') => `/api/presentations/${id}${tail}`;

async function imageForm(name = 'anh.png', color = '#245FDF') {
  const buf = await sharp({ create: { width: 640, height: 360, channels: 3, background: color } }).png().toBuffer();
  const f = new FormData();
  f.set('file', new Blob([buf], { type: 'image/png' }), name);
  return f;
}

async function save(c, id, mutate) {
  const cur = (await c.get(P(id))).json.data;
  const spec = structuredClone(cur.spec);
  mutate(spec);
  const r = await c.patch(P(id), { spec, specVersion: cur.specVersion });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.data;
}

test('SHARE-01 + ACL-06: mời xem / mời sửa; người xem không sửa, người sửa không chia sẻ; thu hồi → mất quyền ngay', async () => {
  const app = getApp();
  const owner = await app.newUser('sowner');
  const viewer = await app.newUser('sviewer');
  const editor = await app.newUser('seditor');
  const d = await app.readyDeck(owner);
  let r = await owner.post(P(d.id, '/shares'), { email: viewer.email, role: 'viewer' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  r = await owner.post(P(d.id, '/shares'), { email: editor.email, role: 'editor' });
  assert.equal(r.status, 201);
  r = await owner.post(P(d.id, '/shares'), { email: owner.email, role: 'viewer' });
  assert.equal(r.json.error.code, 'SELF_SHARE');
  r = await owner.post(P(d.id, '/shares'), { email: 'khong-co@it.test', role: 'viewer' });
  assert.equal(r.json.error.code, 'USER_NOT_FOUND');

  r = await viewer.patch(P(d.id), { title: 'Sửa' });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'VIEW_ONLY');
  assert.equal((await viewer.get(P(d.id, '/export.html'))).status, 200, 'người xem được xuất HTML (EXPORT-03)');

  const ed = await save(editor, d.id, (s) => {
    s.slides[1].title = 'Người sửa đã cập nhật';
  });
  assert.equal(ed.specVersion, d.specVersion + 1);
  // Hợp đồng `05` §chia sẻ: mời người / xoá bài là việc của chủ bài — người sửa nhận 404 (không lộ thao tác), đổi công khai → 403 OWNER_ONLY.
  r = await editor.post(P(d.id, '/shares'), { email: viewer.email, role: 'editor' });
  assert.equal(r.status, 404);
  r = await editor.patch(P(d.id), { visibility: 'public' });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'OWNER_ONLY');
  assert.ok([403, 404].includes((await editor.del(P(d.id))).status), 'người sửa không xoá được bài');
  assert.equal((await owner.get(P(d.id))).status, 200);

  const shared = (await editor.get('/api/presentations?scope=shared')).json.data;
  assert.ok(shared.some((x) => x.id === d.id), 'bài xuất hiện trong mục được chia sẻ');

  r = await owner.del(P(d.id, `/shares/${editor.id}`));
  assert.ok([200, 204].includes(r.status), String(r.status));
  assert.equal((await editor.get(P(d.id))).status, 404, 'thu hồi → không còn đọc được');
  r = await editor.patch(P(d.id), { title: 'Sau khi bị thu hồi' });
  assert.equal(r.status, 404);
});

test('SHARE-02/05/06/07/09: bản gốc khi chia sẻ lần đầu; handoff ≤ 5, không trùng; xoá handoff; khôi phục chỉ chủ bài, bản cũ → 409', { timeout: 60000 }, async () => {
  const app = getApp();
  const owner = await app.newUser('vowner');
  const editor = await app.newUser('veditor');
  const d = await app.readyDeck(owner);
  const originalTitle = d.spec.slides[1].title;
  await owner.post(P(d.id, '/shares'), { email: editor.email, role: 'editor' });
  let v = (await owner.get(P(d.id, '/versions'))).json.data;
  assert.equal(v.items.filter((x) => x.kind === 'baseline').length, 1, 'có đúng 1 bản gốc');
  const baseline = v.items.find((x) => x.kind === 'baseline');

  let cur;
  for (let i = 1; i <= 5; i += 1) {
    cur = await save(editor, d.id, (s) => {
      s.slides[1].title = `Bản số ${i}`;
    });
    const r = await editor.post(P(d.id, '/versions'), { specVersion: cur.specVersion, note: `Handoff ${i}` });
    assert.equal(r.status, 201, JSON.stringify(r.json));
  }
  let r = await editor.post(P(d.id, '/versions'), { specVersion: cur.specVersion });
  assert.equal(r.json.error.code, 'HANDOFF_EXISTS');
  cur = await save(editor, d.id, (s) => {
    s.slides[1].title = 'Bản số 6';
  });
  r = await editor.post(P(d.id, '/versions'), { specVersion: cur.specVersion });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'HANDOFF_LIMIT');

  v = (await owner.get(P(d.id, '/versions'))).json.data;
  assert.equal(v.items.filter((x) => x.kind !== 'baseline').length, 5);
  r = await owner.del(P(d.id, `/versions/${baseline.id}`));
  assert.equal(r.json.error.code, 'BASELINE_LOCKED');
  const h1 = v.items.find((x) => x.kind !== 'baseline');
  r = await editor.del(P(d.id, `/versions/${h1.id}`));
  assert.ok([200, 204].includes(r.status), `${r.status} ${JSON.stringify(r.json)}`);

  r = await editor.post(P(d.id, '/restore'), { versionId: null, specVersion: cur.specVersion });
  assert.equal(r.status, 404, 'người sửa không khôi phục được (chỉ chủ bài)');
  r = await owner.post(P(d.id, '/restore'), { versionId: null, specVersion: cur.specVersion - 1 });
  assert.equal(r.status, 409, 'phiên bản cũ → 409');
  r = await owner.post(P(d.id, '/restore'), { versionId: null, specVersion: cur.specVersion });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const back = (await owner.get(P(d.id))).json.data;
  assert.equal(back.spec.slides[1].title, originalTitle, 'về đúng nội dung bản gốc');
});

test('MEDIA + ACL-05/08: ảnh tải lên vào tenant chủ bài (kể cả người sửa tải); URL ký đọc được, sửa chữ ký → bị từ chối; người lạ không tải lên được', async () => {
  const app = getApp();
  const owner = await app.newUser('mowner');
  const editor = await app.newUser('meditor');
  const stranger = await app.newUser('mstranger');
  const d = await app.readyDeck(owner);
  await owner.post(P(d.id, '/shares'), { email: editor.email, role: 'editor' });
  let r = await editor.post(P(d.id, '/assets'), undefined, { form: await imageForm() });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const asset = r.json.data.asset || r.json.data;
  assert.ok(asset.id && asset.url, JSON.stringify(r.json.data));
  const img = await fetch(app.base + asset.url, { headers: { cookie: owner.cookie } });
  assert.equal(img.status, 200);
  assert.match(img.headers.get('content-type'), /^image\//);
  const tampered = asset.url.replace(/([?&](sig|s|signature)=)([^&]+)/, (_m, k, _n, v) => `${k}${v.slice(0, -2)}xx`);
  assert.notEqual(tampered, asset.url, `URL ký có tham số chữ ký: ${asset.url}`);
  assert.ok([403, 404].includes((await fetch(app.base + tampered)).status), 'chữ ký sai bị từ chối');
  const deck = (await owner.get(P(d.id))).json.data;
  assert.ok(deck.assets.some((a) => a.id === asset.id), 'asset thuộc thư viện bài của chủ');
  r = await stranger.post(P(d.id, '/assets'), undefined, { form: await imageForm() });
  assert.equal(r.status, 404);
});

test('TPL-01/02/04: lưu mẫu từ bài (sao chép ảnh); mẫu riêng tư không lộ; công khai → người khác áp vào bài của mình (bản sao riêng)', async () => {
  const app = getApp();
  const a = await app.newUser('tpla');
  const b = await app.newUser('tplb');
  const da = await app.readyDeck(a);
  let r = await a.post(P(da.id, '/brand'), undefined, { form: await imageForm('nen.png', '#0FBF79') });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const brandId = (r.json.data.asset || r.json.data).id;
  r = await a.post('/api/templates', { name: 'Mẫu xanh MISA', presentationId: da.id, design: { theme: 'ocean', brand: { cover: brandId } } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const tpl = r.json.data;
  assert.notEqual(tpl.design.brand.cover, brandId, 'mẫu giữ bản sao ảnh, không tham chiếu ảnh của bài');

  assert.ok(!(await b.get('/api/templates')).json.data.some((x) => x.id === tpl.id), 'mẫu riêng tư không lộ');
  const db = await app.readyDeck(b);
  r = await b.post(P(db.id, `/templates/${tpl.id}/apply`), {});
  assert.equal(r.status, 404);

  r = await a.patch(`/api/templates/${tpl.id}`, { visibility: 'public' });
  assert.equal(r.status, 200);
  assert.ok((await b.get('/api/templates')).json.data.some((x) => x.id === tpl.id));
  r = await b.post(P(db.id, `/templates/${tpl.id}/apply`), {});
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const applied = r.json.data;
  const cover = applied.design.brand.cover;
  assert.ok(applied.assets.some((x) => x.id === cover), 'ảnh đã chép vào bài của B');
  const deckB = (await b.get(P(db.id))).json.data;
  assert.ok(deckB.assets.some((x) => x.id === cover), 'ảnh thuộc thư viện bài của B (tenant B)');
  r = await b.patch(`/api/templates/${tpl.id}`, { name: 'Đổi tên trộm' });
  assert.equal(r.status, 404, 'không sửa được mẫu của người khác');
});

test('EXPORT-01/02/04: HTML độc lập (đúng tiêu đề, không lộ API/URL ký), PDF hợp lệ đủ trang, tên tệp UTF-8 an toàn', { timeout: 120000 }, async () => {
  const app = getApp();
  const u = await app.newUser('export');
  const d = await app.readyDeck(u);
  let r = await u.patch(P(d.id), { title: 'Báo cáo "quý 4"\r\nX-Injected: 1' });
  assert.equal(r.status, 200);
  const res = await u.req('GET', P(d.id, '/export.html'), undefined, { raw: true });
  assert.equal(res.status, 200);
  const cd = res.headers.get('content-disposition');
  assert.ok(!/[\r\n]/.test(cd) && !res.headers.get('x-injected'), 'không chèn được header');
  assert.match(cd, /filename\*=UTF-8''/);
  const html = await res.text();
  // <title> lấy theo spec.title (trình soạn thảo đồng bộ khi lưu); đổi tên chỉ metadata → chỉ tên tệp đổi (ghi nhận ở memory-bank 10).
  assert.match(html, /<title>Giới thiệu nền tảng MISA AMIS<\/title>/);
  assert.match(decodeURIComponent(cd.split("UTF-8''")[1]), /^Báo cáo  ?quý 4/);
  assert.ok(!html.includes('/api/') && !/sig=|signature=/.test(html), 'HTML xuất không trỏ API nội bộ / URL ký');
  assert.ok(html.includes('Kết quả nổi bật'));

  const pdf = await u.req('GET', P(d.id, '/export.pdf'), undefined, { raw: true });
  assert.equal(pdf.status, 200, await pdf.clone().text().catch(() => ''));
  const buf = Buffer.from(await pdf.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  const pages = (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  assert.equal(pages, 5, 'mỗi trang bài = 1 trang PDF');
});

test('Xuất bản (P) qua HTTP: chủ bài xuất bản → domain công khai phục vụ theo Host, noindex; người khác không xuất bản được; admin gỡ được', { timeout: 60000 }, async () => {
  const app = getApp();
  const u = await app.newUser('pub');
  const other = await app.newUser('pubother');
  const d = await app.readyDeck(u);
  let r = await u.post(P(d.id, '/publication'), {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const url = new URL(r.json.data.url);
  assert.equal(url.origin, PUBLISH_BASE);
  const port = new URL(app.base).port;
  const viaHost = (p) => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers: { host: url.host } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    }).on('error', reject);
  });
  const page = await viaHost(url.pathname);
  assert.equal(page.status, 200);
  assert.match(page.headers['x-robots-tag'] || '', /noindex/);
  assert.ok(page.body.includes('Kết quả nổi bật'));
  assert.equal((await viaHost('/api/auth/me')).status, 404, 'domain công khai không phục vụ API nội bộ');
  assert.match((await viaHost('/robots.txt')).body, /Disallow: \//);

  r = await other.post(P(d.id, '/publication'), {});
  assert.equal(r.status, 404);
  r = await app.admin.get('/api/admin/publications');
  assert.ok(r.json.data.some((x) => (x.presentationId || x.presentation_id) === d.id), JSON.stringify(r.json.data[0]));
  r = await app.admin.del(`/api/admin/publications/${d.id}`);
  assert.equal(r.status, 204);
  assert.equal((await viaHost(url.pathname)).status, 404, 'gỡ → trang công khai ngừng hiện');
});
