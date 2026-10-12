// Xuất bản ra domain công khai — phần không cần DB: slug, cấu hình PUBLISH_BASE_URL, phân luồng theo domain,
// chặn lập chỉ mục, header CDN/CSP, chuyển hướng slug cũ, media chỉ của revision đang công khai.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import session from 'express-session';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicSlug, parsePublicPath, SLUG_MAX } from '../../src/lib/slug.js';
import { loadConfig } from '../../src/config/index.js';
import { createApp } from '../../src/app.js';
import { NOINDEX, PAGE_CACHE, MEDIA_CACHE } from '../../src/routes/publicSiteRoutes.js';

process.env.NODE_ENV = 'test';

test('publicSlug: bỏ dấu, đ→d, chữ thường, chỉ [a-z0-9-], tối đa 80, không rỗng', () => {
  assert.equal(publicSlug('Giới thiệu AMIS tổng thể'), 'gioi-thieu-amis-tong-the');
  assert.equal(publicSlug('ĐƯỜNG ĐI   của Đá!!'), 'duong-di-cua-da');
  assert.equal(publicSlug('  --Q3/2026: Kết quả & kế hoạch--  '), 'q3-2026-ket-qua-ke-hoach');
  assert.equal(publicSlug(''), 'bai-trinh-bay');
  assert.equal(publicSlug('***'), 'bai-trinh-bay');
  assert.equal(publicSlug(null), 'bai-trinh-bay');
  const long = publicSlug('Báo cáo quý 3 năm 2026 kết quả kinh doanh và kế hoạch phát triển hệ sinh thái MISA AMIS toàn quốc');
  assert.ok(long.length <= SLUG_MAX && !long.endsWith('-'), long);
  assert.ok(publicSlug('x'.repeat(200)).length === SLUG_MAX);
  for (const t of ['<script>alert(1)</script>', '../../etc/passwd', 'a"b\'c', '😀 emoji']) assert.match(publicSlug(t), /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test('parsePublicPath: /<slug>-<8 ký tự [a-z0-9]>', () => {
  assert.deepEqual(parsePublicPath('/gioi-thieu-amis-tong-the-1234abcd'), { slug: 'gioi-thieu-amis-tong-the', code: '1234abcd' });
  assert.deepEqual(parsePublicPath('/a-1234abcd/'), { slug: 'a', code: '1234abcd' });
  for (const bad of ['/1234abcd', '/-1234abcd', '/x-1234ABCD', '/x-123abcd', '/x-1234abcd/y', '/x_y-1234abcd', '/../x-1234abcd']) assert.equal(parsePublicPath(bad), null, bad);
});

function withEnv(vars, fn) {
  const old = {};
  for (const k of Object.keys(vars)) {
    old[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(old)) if (old[k] === undefined) delete process.env[k];
    else process.env[k] = old[k];
  }
}

test('PUBLISH_BASE_URL: trống = tắt; chỉ http(s)://domain; phải khác domain nội bộ', () => {
  withEnv({ PUBLISH_BASE_URL: undefined }, () => assert.deepEqual({ ...loadConfig().publish }, { baseUrl: '', host: '' }));
  withEnv({ PUBLISH_BASE_URL: 'https://Slides.MISA.vn/' }, () => {
    const p = loadConfig().publish;
    assert.equal(p.baseUrl, 'https://slides.misa.vn');
    assert.equal(p.host, 'slides.misa.vn');
  });
  for (const bad of ['slides.misa.vn', 'ftp://slides.misa.vn', 'https://slides.misa.vn/p', 'https://slides.misa.vn/?a=1', 'https://u:p@slides.misa.vn']) {
    withEnv({ PUBLISH_BASE_URL: bad }, () => assert.throws(() => loadConfig(), /PUBLISH_BASE_URL/, bad));
  }
  withEnv({ APP_BASE_URL: 'https://slide.misa.local', PUBLISH_BASE_URL: 'https://slide.misa.local' }, () => assert.throws(() => loadConfig(), /domain riêng/));
});

// Ứng dụng đầy đủ (createApp) với dịch vụ giả: IP_ALLOWLIST chặn 127.0.0.1 để chứng minh domain công khai đi trước lớp IP,
// còn domain nội bộ vẫn bị chặn như cũ.
async function startApp(publications) {
  const base = loadConfig();
  const config = { ...base, publish: { baseUrl: 'https://pub.test', host: 'pub.test' }, ipAllowlist: ['10.9.9.9'], trustProxy: 0 };
  const services = {
    sessionStore: new session.MemoryStore(),
    presentations: { queueStats: () => ({}) },
    auth: {},
    templates: {},
    sharing: {},
    publications,
  };
  const app = createApp({ config, pool: { query: async () => [] }, repos: { users: { findById: async () => null } }, services });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const port = server.address().port;
  const req = (host, p, headers = {}) =>
    new Promise((resolve, reject) => {
      const rq = http.request({ host: '127.0.0.1', port, path: p, headers: { host, ...headers } }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      rq.on('error', reject);
      rq.end();
    });
  return { req, close: () => server.close() };
}

function fakePublications(dir) {
  const pub = { slug: 'gioi-thieu', code: 'abcd1234', revision: '0123456789abcdef', csp_nonce: 'bm9uY2Vub25jZW5vbmNlMTI=' };
  const calls = [];
  return {
    calls,
    pub,
    async page(slug, code) {
      calls.push(['page', slug, code]);
      if (code !== pub.code) return null;
      if (slug !== pub.slug) return { redirect: `/${pub.slug}-${pub.code}` };
      return { pub, html: Buffer.from('<!doctype html><title>Bài</title>') };
    },
    async mediaPath(code, rev, file) {
      calls.push(['media', code, rev, file]);
      return code === pub.code && rev === pub.revision && file === '11111111-2222-3333-4444-555555555555.webp' ? path.join(dir, 'a.webp') : null;
    },
  };
}

test('phân luồng theo domain: domain công khai chỉ thấy trang xuất bản, bỏ qua IP_ALLOWLIST; domain nội bộ không thấy trang xuất bản', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mp-pub-'));
  await writeFile(path.join(dir, 'a.webp'), Buffer.from('RIFFxxxxWEBP'));
  const fake = fakePublications(dir);
  const { req, close } = await startApp(fake);
  try {
    const page = await req('pub.test', '/gioi-thieu-abcd1234');
    assert.equal(page.status, 200, 'người ngoài mạng MISA xem được');
    assert.match(page.body, /<title>Bài<\/title>/);
    assert.equal(page.headers['x-robots-tag'], NOINDEX);
    assert.equal(page.headers['cache-control'], PAGE_CACHE);
    assert.equal(page.headers.etag, `"${fake.pub.revision}"`);
    assert.match(page.headers['content-security-policy'], new RegExp(`script-src 'nonce-${fake.pub.csp_nonce.replace(/[+/=]/g, (c) => `\\${c}`)}'`));
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.match(page.headers['content-security-policy'], /connect-src 'none'/);
    assert.equal(page.headers['set-cookie'], undefined, 'không phiên/cookie ở domain công khai');

    const notModified = await req('pub.test', '/gioi-thieu-abcd1234', { 'if-none-match': `"${fake.pub.revision}"` });
    assert.equal(notModified.status, 304);

    const moved = await req('pub.test', '/ten-cu-abcd1234');
    assert.equal(moved.status, 301);
    assert.equal(moved.headers.location, '/gioi-thieu-abcd1234');

    const robots = await req('pub.test', '/robots.txt');
    assert.equal(robots.status, 200);
    assert.match(robots.body, /User-agent: \*\nDisallow: \//);

    const media = await req('pub.test', `/m/abcd1234/${fake.pub.revision}/11111111-2222-3333-4444-555555555555.webp`);
    assert.equal(media.status, 200);
    assert.equal(media.headers['cache-control'], MEDIA_CACHE);
    assert.match(media.headers['content-type'], /image\/webp/);
    assert.equal(media.headers['x-robots-tag'], NOINDEX);
    const oldRev = await req('pub.test', `/m/abcd1234/fedcba9876543210/11111111-2222-3333-4444-555555555555.webp`);
    assert.equal(oldRev.status, 404, 'revision cũ/đã gỡ không phục vụ');

    // Mọi đường dẫn khác ở domain công khai → 404 noindex, không lộ API/giao diện nội bộ.
    for (const p of ['/', '/api/health', '/api/auth/me', '/api/presentations', '/deck-assets/InterVariable.woff2', '/login', '/khong-ton-tai-zzzz9999', '/x/y']) {
      const r = await req('pub.test', p);
      assert.equal(r.status, 404, p);
      assert.equal(r.headers['x-robots-tag'], NOINDEX, p);
      assert.doesNotMatch(r.body, /"data"|"error"/, `${p}: không phải phản hồi API`);
    }

    // Domain nội bộ: vẫn qua IP_ALLOWLIST như cũ, không bao giờ trả trang xuất bản.
    const internal = await req('app.internal', '/gioi-thieu-abcd1234');
    assert.equal(internal.status, 403);
    assert.ok(!fake.calls.some((c) => c[1] === 'gioi-thieu' && internal.body.includes('Bài')));
    const callsBefore = fake.calls.length;
    await req('app.internal', '/robots.txt');
    await req('app.internal', `/m/abcd1234/${fake.pub.revision}/11111111-2222-3333-4444-555555555555.webp`);
    assert.equal(fake.calls.length, callsBefore, 'domain nội bộ không chạm dịch vụ xuất bản');
  } finally {
    close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test('chưa đặt PUBLISH_BASE_URL → không có luồng công khai (mọi host đi luồng nội bộ)', async () => {
  const base = loadConfig();
  const config = { ...base, publish: { baseUrl: '', host: '' }, ipAllowlist: ['10.9.9.9'], trustProxy: 0 };
  let touched = false;
  const services = { sessionStore: new session.MemoryStore(), presentations: { queueStats: () => ({}) }, auth: {}, templates: {}, sharing: {}, publications: { page: async () => { touched = true; } } };
  const app = createApp({ config, pool: { query: async () => [] }, repos: { users: {} }, services });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const status = await new Promise((resolve) => {
      http.get({ host: '127.0.0.1', port: server.address().port, path: '/gioi-thieu-abcd1234', headers: { host: 'pub.test' } }, (res) => { res.resume(); resolve(res.statusCode); });
    });
    assert.equal(status, 403);
    assert.equal(touched, false);
  } finally {
    server.close();
  }
});
