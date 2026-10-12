// Luồng chính qua HTTP (roadmap B) — tạo bài → dàn ý → dựng → sửa, quyền tenant, hàng đợi. Mã kịch bản theo catalogue
// docs/audits/2026-10-12-codex/03-ma-tran-test-case.csv. App thật + MySQL tạm + Gemini giả (helpers/httpApp.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { loadConfig } from '../../src/config/index.js';
import { useHttpApp } from './helpers/httpApp.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const getApp = useHttpApp(config, { before, after }, { generationConcurrency: 1 });
const P = (id, tail = '') => `/api/presentations/${id}${tail}`;

test('OUT-01 + kiểu chữ: tạo bài → outlining → outline (tiêu đề AI "Viết Hoa Từng Chữ" đã về viết hoa đầu câu) → dựng → ready', async () => {
  const app = getApp();
  const u = await app.newUser('flow');
  const o = await app.createOutline(u, 'Giới thiệu nền tảng MISA AMIS cho doanh nghiệp\nMISA AMIS có 250.000 doanh nghiệp sử dụng.');
  assert.equal(o.status, 'outline');
  assert.equal(o.outline.title, 'Giới thiệu nền tảng MISA AMIS');
  assert.deepEqual(o.outline.slides.map((s) => s.title), ['Giới thiệu nền tảng MISA AMIS', 'Kết quả nổi bật', 'Lộ trình triển khai', 'Cách làm cũ và mới', 'Cảm ơn quý khách']);
  assert.ok(o.outline.slides.every((s) => s.id), 'mỗi trang dàn ý có id');

  const d = await app.buildDeck(u, o.id);
  assert.equal(d.status, 'ready');
  assert.equal(d.spec.slides.length, 5, 'đủ trang đã duyệt, đúng thứ tự (OUT-08: AI không trả bố cục → dựng từ dàn ý)');
  assert.deepEqual(d.spec.slides.map((s) => s.layout), ['cover', 'stats', 'process', 'comparison', 'closing']);
  assert.equal(d.spec.slides[1].title, 'Kết quả nổi bật');
  const list = await u.get('/api/presentations');
  assert.ok(list.json.data.some((x) => x.id === o.id && x.status === 'ready'));
});

test('SRC + F01: tạo bài từ văn bản kèm ảnh → ảnh vào thư viện bài, dàn ý lập được; từ tệp .txt; tệp sai loại → 415, trộn 2 nguồn → 400', async () => {
  const app = getApp();
  const u = await app.newUser('media');
  const png = await sharp({ create: { width: 800, height: 450, channels: 3, background: '#245FDF' } }).png().toBuffer();
  const f = new FormData();
  f.set('text', 'Hội nghị khách hàng MISA 2026\nHơn 1.000 khách hàng tham dự.');
  f.set('slideCount', '5');
  f.set('aiImages', '0');
  f.append('media', new Blob([png], { type: 'image/png' }), 'hoi-nghi.png');
  let r = await u.post('/api/presentations', undefined, { form: f });
  assert.equal(r.status, 202, JSON.stringify(r.json));
  const o = await app.waitStatus(u, r.json.data.id, ['outline']);
  const imgs = o.assets.filter((a) => a.kind === 'image');
  assert.equal(imgs.length, 1, 'ảnh gửi kèm thành asset của bài');
  assert.equal((await fetch(app.base + imgs[0].url)).status, 200);

  const tf = new FormData();
  tf.set('slideCount', '5');
  tf.set('aiImages', '0');
  tf.append('files', new Blob(['Chương trình hội nghị gồm 3 phiên: khai mạc, chia sẻ, giao lưu.'], { type: 'text/plain' }), 'chuong-trinh.txt');
  r = await u.post('/api/presentations', undefined, { form: tf });
  assert.equal(r.status, 202, JSON.stringify(r.json));
  const fromFile = await app.waitStatus(u, r.json.data.id, ['outline']);
  assert.match(fromFile.sourceLabel || '', /chuong-trinh/, 'nguồn ghi đúng tên tệp');
  assert.equal(fromFile.outline.slides.length, 5);

  const bad = new FormData();
  bad.set('slideCount', '5');
  bad.append('files', new Blob([Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])], { type: 'application/x-msdownload' }), 'cai-dat.exe');
  r = await u.post('/api/presentations', undefined, { form: bad });
  assert.equal(r.status, 415, `${r.status} ${JSON.stringify(r.json)}`);
  assert.equal(r.json.error.code, 'UNSUPPORTED_FILE');
  const mixed = new FormData();
  mixed.set('text', 'Văn bản');
  mixed.set('url', 'https://amis.misa.vn');
  r = await u.post('/api/presentations', undefined, { form: mixed });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'SOURCE_REQUIRED');
  const mine = (await u.get('/api/presentations')).json.data;
  assert.equal(mine.length, 2, 'yêu cầu lỗi không để lại bài rác');
});

test('OUT-04/07: lưu dàn ý với phiên bản cũ → 409; hai lần "Dựng bài" cùng lúc → đúng 1 lần nhận', async () => {
  const app = getApp();
  const u = await app.newUser('outline');
  const o = await app.createOutline(u);
  const v = o.outlineVersion;
  const edited = structuredClone(o.outline);
  edited.slides[1].title = 'Kết quả sau một năm';
  let r = await u.put(P(o.id, '/outline'), { outline: edited, outlineVersion: v });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  r = await u.put(P(o.id, '/outline'), { outline: edited, outlineVersion: v });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'VERSION_CONFLICT');

  const cur = (await u.get(P(o.id))).json.data;
  const [a, b] = await Promise.all([u.post(P(o.id, '/build'), { outlineVersion: cur.outlineVersion }), u.post(P(o.id, '/build'), { outlineVersion: cur.outlineVersion })]);
  assert.deepEqual([a.status, b.status].sort(), [202, 409], `${a.status} ${b.status}`);
  const d = await app.waitStatus(u, o.id, ['ready']);
  assert.equal(d.spec.slides[1].title, 'Kết quả sau một năm', 'dựng đúng dàn ý đã lưu');
});

test('OUT-09: AI lỗi khi dựng → bài quay về bước dàn ý, giữ dàn ý; thử lại thành công', async () => {
  const app = getApp();
  const u = await app.newUser('retry');
  const o = await app.createOutline(u);
  app.ai.set({ fail: '500', failRate: 1 });
  try {
    const r = await u.post(P(o.id, '/build'), { outlineVersion: o.outlineVersion });
    assert.equal(r.status, 202);
    const back = await app.waitStatus(u, o.id, ['outline', 'failed'], 40000);
    assert.equal(back.status, 'outline', 'lỗi dựng không làm mất dàn ý');
    assert.ok(back.errorMessage, 'có thông báo lỗi cho người dùng');
    assert.equal(back.outline.slides.length, 5);
  } finally {
    app.ai.set({ fail: null });
  }
  const d = await app.buildDeck(u, o.id);
  assert.equal(d.status, 'ready');
});

test('EDIT-01/02/03 + EDIT-08: lưu theo specVersion; bản cũ → 409; spec sai → lỗi có chi tiết; chữ tiêu đề có thẻ HTML được escape', async () => {
  const app = getApp();
  const u = await app.newUser('edit');
  const d = await app.readyDeck(u);
  const spec = structuredClone(d.spec);
  spec.slides[1].title = 'Doanh thu <script>alert(1)</script> tăng “2,7 lần”';
  let r = await u.patch(P(d.id), { spec, specVersion: d.specVersion });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.data.specVersion, d.specVersion + 1);
  r = await u.patch(P(d.id), { spec, specVersion: d.specVersion });
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'VERSION_CONFLICT');

  const bad = structuredClone(spec);
  bad.slides[0].layout = 'khong-ton-tai';
  r = await u.patch(P(d.id), { spec: bad, specVersion: d.specVersion + 1 });
  assert.ok([400, 422].includes(r.status), String(r.status));
  assert.ok(r.json.error.details?.length || r.json.error.message, 'có chi tiết lỗi');

  const html = await (await u.req('GET', P(d.id, '/preview'), undefined, { raw: true })).text();
  assert.ok(!html.includes('<script>alert(1)</script>'), 'thẻ script người dùng không lọt vào HTML');
  assert.ok(html.includes('&lt;script&gt;'), 'được escape');
  assert.ok(html.includes('“2,7 lần”'), 'Unicode giữ nguyên');
});

test('ACL-04: người lạ không đọc/sửa/xoá/xuất/xem trước bài riêng tư → 404; mã ngắn lạ → 404 (ACL-10)', async () => {
  const app = getApp();
  const owner = await app.newUser('owner');
  const stranger = await app.newUser('stranger');
  const d = await app.readyDeck(owner);
  for (const [m, p, body] of [
    ['GET', P(d.id)],
    ['PATCH', P(d.id), { title: 'Chiếm' }],
    ['DELETE', P(d.id)],
    ['POST', P(d.id, '/duplicate'), {}],
    ['GET', P(d.id, '/preview')],
    ['GET', P(d.id, '/export.html')],
    ['GET', P(d.id, '/versions')],
    ['GET', P(d.id, '/shares')],
    ['POST', P(d.id, '/publication'), {}],
  ]) {
    const r = await stranger.req(m, p, body);
    assert.equal(r.status, 404, `${m} ${p} → ${r.status}`);
  }
  // Admin cũng không xem được bài riêng tư của người khác (cách ly tenant tuyệt đối).
  assert.equal((await app.admin.get(P(d.id))).status, 404);
  assert.equal((await stranger.get('/api/presentations/00000000-0000-4000-8000-000000000000')).status, 404);
});

test('ACL-02/03: bài công khai — người đăng nhập xem được, không sửa được (403 VIEW_ONLY); khách chưa đăng nhập bị chặn; client không giả được chủ bài', async () => {
  const app = getApp();
  const owner = await app.newUser('pubowner');
  const other = await app.newUser('reader');
  const d = await app.readyDeck(owner);
  let r = await owner.patch(P(d.id), { visibility: 'public', tenantId: other.id, tenant_id: other.id });
  assert.equal(r.status, 200);
  r = await other.get(P(d.id));
  assert.equal(r.status, 200);
  assert.equal(r.json.data.access, 'viewer');
  assert.equal(r.json.data.isOwner, false, 'trường tenant gửi lên bị bỏ qua');
  r = await other.patch(P(d.id), { title: 'Sửa trộm' });
  assert.equal(r.status, 403);
  assert.equal(r.json.error.code, 'VIEW_ONLY');
  const anon = app.makeClient();
  await anon.init();
  assert.equal((await anon.get(P(d.id))).status, 401);
  // Người xem được nhân bản về tài khoản mình (ACL-01).
  r = await other.post(P(d.id, '/duplicate'), {});
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const copy = await other.get(P(r.json.data.id));
  assert.equal(copy.json.data.isOwner, true);
  assert.equal(copy.json.data.status, 'ready');
});

test('Xoá bài → mất khỏi danh sách, GET 404; nhân bản là bản độc lập', async () => {
  const app = getApp();
  const u = await app.newUser('del');
  const d = await app.readyDeck(u);
  let r = await u.post(P(d.id, '/duplicate'), {});
  assert.equal(r.status, 201);
  const copyId = r.json.data.id;
  r = await u.del(P(d.id));
  assert.ok([200, 204].includes(r.status), String(r.status));
  assert.equal((await u.get(P(d.id))).status, 404);
  const copy = await u.get(P(copyId));
  assert.equal(copy.status, 200, 'bản sao không bị xoá theo');
  const list = await u.get('/api/presentations');
  assert.ok(!list.json.data.some((x) => x.id === d.id));
});

test('Hàng đợi (B, LOAD-04): bài đang chờ có vị trí + thời gian đo được; đầy hàng → 503 QUEUE_FULL + Retry-After; health/ready có số đo hàng đợi', { timeout: 180000 }, async () => {
  const app = getApp();
  app.ai.set({ delayMs: 400 });
  try {
    // generationConcurrency = 1 → bài thứ 2, 3 phải chờ.
    const users = await Promise.all([1, 2, 3].map((i) => app.newUser(`q${i}`)));
    const forms = users.map(() => {
      const f = new FormData();
      f.set('text', 'Kế hoạch kinh doanh quý 4 của phòng bán hàng\nDoanh thu mục tiêu tăng 20%.');
      f.set('slideCount', '5');
      f.set('aiImages', '0');
      return f;
    });
    const created = [];
    for (let i = 0; i < 3; i += 1) created.push((await users[i].post('/api/presentations', undefined, { form: forms[i] })).json.data.id);
    const third = (await users[2].get(P(created[2]))).json.data;
    assert.equal(third.status, 'outlining');
    assert.equal(third.queue.state, 'waiting');
    assert.equal(third.queue.position, 2);
    const first = (await users[0].get(P(created[0]))).json.data;
    assert.equal(first.queue.state, 'running');
    for (let i = 0; i < 3; i += 1) await app.waitStatus(users[i], created[i], ['outline']);
    const done = (await users[2].get(P(created[2]))).json.data;
    assert.equal(done.queue, undefined, 'xong → không còn thông tin hàng đợi');

    // Đầy hàng: 1 chạy + 20 chờ (MAX_PENDING_JOBS) → yêu cầu tiếp theo bị từ chối ngay, có Retry-After, không tạo bài.
    app.ai.set({ delayMs: 1500 });
    const heavy = await app.newUser('burst');
    const burst = await Promise.all(Array.from({ length: 24 }, () => {
      const f = new FormData();
      f.set('text', 'Báo cáo tổng kết năm của chi nhánh miền Bắc\nDoanh thu tăng 12%.');
      f.set('slideCount', '5');
      f.set('aiImages', '0');
      return heavy.post('/api/presentations', undefined, { form: f });
    }));
    const full = burst.filter((r) => r.status === 503);
    assert.equal(burst.filter((r) => r.status === 202).length, 21, burst.map((r) => r.status).join(','));
    assert.equal(full.length, 3);
    assert.equal(full[0].json.error.code, 'QUEUE_FULL');
    assert.equal(full[0].headers.get('retry-after'), '30');
    const mine = (await heavy.get('/api/presentations?pageSize=50')).json.data;
    assert.equal(mine.length, 21, 'yêu cầu bị từ chối không để lại bài rác');
    const busy = await fetch(`${app.base}/api/health/ready`).then((r) => r.json());
    assert.equal(busy.data.queue.active + busy.data.queue.pending, 21);
    app.ai.set({ delayMs: 0 });
    for (const r of burst.filter((x) => x.status === 202)) await app.waitStatus(heavy, r.json.data.id, ['outline'], 120000);

    const health = await fetch(`${app.base}/api/health/ready`).then((r) => r.json());
    assert.equal(health.data.status, 'ready');
    assert.ok(health.data.queue.avgOutlineSec !== undefined && health.data.queue.oldestWaitSec !== undefined, JSON.stringify(health.data.queue));
  } finally {
    app.ai.set({ delayMs: 0 });
  }
});
