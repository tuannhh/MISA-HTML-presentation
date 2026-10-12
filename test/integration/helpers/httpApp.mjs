// Ứng dụng THẬT qua HTTP cho test luồng chính (roadmap B): Express + MySQL tạm (testDb) + storage tạm + Chromium thật (PDF)
// + Gemini giả qua HTTP (test/helpers/fakeGemini.mjs — geminiService thật gọi tới, kể cả retry/timeout).
// Tài khoản: admin bootstrap bằng authService.createAdmin rồi đổi mật khẩu qua API; người dùng thường do admin cấp qua API
// (đúng luồng production — không có đăng ký). Mật khẩu ngẫu nhiên, không in ra.
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createContainer } from '../../../src/container.js';
import { createApp } from '../../../src/app.js';
import { startFakeGemini } from '../../helpers/fakeGemini.mjs';
import { setupTestDb } from './testDb.mjs';

export const PUBLISH_BASE = 'https://pub.example.test';
export const INGRESS_CLIENT_IP = '203.0.113.7';
const password = () => `${randomBytes(12).toString('base64url')}Aa1`;

/** Client HTTP giữ cookie + CSRF như trình duyệt. */
export function makeClient(base) {
  let cookie = '';
  let csrf = '';
  async function req(method, p, body, { raw = false, form = null, headers: extra = {} } = {}) {
    const headers = { cookie, ...extra };
    if (method !== 'GET' && method !== 'HEAD') headers['x-csrf-token'] = csrf;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + p, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie();
    if (set.length) {
      const jar = new Map(cookie ? cookie.split('; ').map((c) => c.split(/=(.*)/s).slice(0, 2)) : []);
      for (const c of set) {
        const [k, v] = c.split(';')[0].split(/=(.*)/s);
        jar.set(k, v);
      }
      cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (raw) return res;
    const json = await res.json().catch(() => null);
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    if (json?.data?.token) csrf = json.data.token;
    return { status: res.status, json, headers: res.headers };
  }
  return {
    req,
    get: (p, o) => req('GET', p, undefined, o),
    post: (p, b, o) => req('POST', p, b, o),
    patch: (p, b, o) => req('PATCH', p, b, o),
    put: (p, b, o) => req('PUT', p, b, o),
    del: (p, b, o) => req('DELETE', p, b, o),
    init: () => req('GET', '/api/auth/csrf'),
    get cookie() {
      return cookie;
    },
    setCookie(v) {
      cookie = v;
    },
  };
}

/**
 * Dựng app trên cổng ngẫu nhiên. `db` = kết quả setupTestDb. Trả { base, ai, svc, admin, newUser(tag, role), deckReady(c, text), close() }.
 */
export async function startHttpApp(config, db, { aiDelayMs = 0, generationConcurrency, patch, ingress = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mp-http-'));
  const ai = await startFakeGemini({ delayMs: aiDelayMs });
  const cfg = {
    ...config,
    isTest: true,
    gemini: { ...config.gemini, apiKey: 'fake-key', baseUrl: ai.baseUrl, timeoutMs: 15000, mediaTimeoutMs: 15000, imageTimeoutMs: 15000 },
    aiImages: { ...config.aiImages, enabled: true, perDeck: 1 },
    auth: { ...config.auth, bcryptRounds: 4 },
    publish: { baseUrl: PUBLISH_BASE, host: new URL(PUBLISH_BASE).hostname },
    session: { ...config.session, cookieSecure: false },
    ipAllowlist: [],
    // Máy dev có thể thiếu poppler/LibreOffice: tắt cắt ảnh giao diện (có test riêng), không ảnh hưởng luồng chính.
    visuals: { ...config.visuals, enabled: false, office: false, pdftotext: 'pdftotext-khong-co' },
    // .env của Docker trỏ /usr/bin/chromium — máy dev không có thì để trống cho browserService tự tìm Chrome/Edge cài sẵn.
    chromePath: config.chromePath && existsSync(config.chromePath) ? config.chromePath : '',
    limits: { ...config.limits, ...(generationConcurrency ? { generationConcurrency } : {}) },
    storage: { ...config.storage, root: dir, privateDir: path.join(dir, 'private'), tempDir: path.join(dir, 'temp'), uploadDir: path.join(dir, 'uploads') },
  };
  // Chỉnh thêm cấu hình cho từng tệp test (vd. HTTPS sau proxy: trustProxy + cookie Secure).
  if (patch) Object.assign(cfg, patch(cfg));
  const stock = { async search() { return { items: [], total: 0 }; } };
  const container = await createContainer(cfg, db.pool, { stock });
  const app = createApp({ config: cfg, pool: db.pool, ...container });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const directBase = `http://127.0.0.1:${server.address().port}`;
  // ingress: giả lập cổng vào kết thúc TLS của DevOps — mọi client đi qua đây; thêm X-Forwarded-Proto=https và NỐI IP client thật
  // (203.0.113.7, dải tài liệu) vào sau X-Forwarded-For client tự gửi — app (TRUST_PROXY=1) chỉ được tin hop cuối.
  let front = null;
  if (ingress) {
    front = http.createServer((req, res) => {
      const xff = req.headers['x-forwarded-for'];
      const headers = { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-for': `${xff ? `${xff}, ` : ''}${INGRESS_CLIENT_IP}` };
      const up = http.request({ host: '127.0.0.1', port: server.address().port, method: req.method, path: req.url, headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      up.on('error', () => res.destroy());
      req.pipe(up);
    });
    await new Promise((resolve) => front.listen(0, '127.0.0.1', resolve));
  }
  const base = front ? `http://127.0.0.1:${front.address().port}` : directBase;

  // Admin: tạo bằng service (như scripts/create-admin.js) → đăng nhập → bắt đổi mật khẩu → đổi qua API.
  const loginNew = async (email, temp) => {
    const c = makeClient(base);
    await c.init();
    let r = await c.post('/api/auth/login', { email, password: temp });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
    const pw = password();
    r = await c.post('/api/auth/change-password', { currentPassword: temp, newPassword: pw });
    if (r.status !== 200) throw new Error(`change-password ${email}: ${r.status} ${JSON.stringify(r.json)}`);
    await c.get('/api/auth/me');
    c.email = email;
    c.password = pw;
    return c;
  };
  const stamp = randomBytes(3).toString('hex');
  const adminEmail = `it-admin-${stamp}@it.test`;
  const boot = await container.services.auth.createAdmin({ email: adminEmail, displayName: 'Quản trị kiểm thử' });
  const admin = await loginNew(adminEmail, boot.temporaryPassword);
  admin.id = boot.id;

  let n = 0;
  async function newUser(tag = 'u', role = 'user') {
    n += 1;
    const email = `it-${tag}-${n}-${stamp}@it.test`;
    const r = await admin.post('/api/admin/users', { email, displayName: `Người thử ${tag} ${n}`, role });
    if (r.status !== 201) throw new Error(`admin create user: ${r.status} ${JSON.stringify(r.json)}`);
    const c = await loginNew(email, r.json.data.temporaryPassword);
    c.id = r.json.data.user.id;
    return c;
  }

  async function waitStatus(c, id, want, ms = 30000) {
    const t = Date.now();
    let last;
    while (Date.now() - t < ms) {
      last = await c.get(`/api/presentations/${id}`);
      const st = last.json?.data?.status;
      if (want.includes(st)) return last.json.data;
      if (st === 'failed' && !want.includes('failed')) throw new Error(`bài ${id} failed: ${last.json.data.errorMessage}`);
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error(`quá hạn chờ ${want} (cuối: ${last?.json?.data?.status})`);
  }

  async function createOutline(c, text = 'Giới thiệu nền tảng MISA AMIS cho doanh nghiệp\nMISA AMIS có 250.000 doanh nghiệp sử dụng.', extra = {}) {
    const form = new FormData();
    form.set('text', text);
    form.set('ratio', '16:9');
    form.set('slideCount', '5');
    form.set('tone', 'light');
    form.set('theme', 'ocean');
    form.set('aiImages', '0');
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    const r = await c.post('/api/presentations', undefined, { form });
    if (r.status !== 202) throw new Error(`create: ${r.status} ${JSON.stringify(r.json)}`);
    const id = r.json.data.id;
    return waitStatus(c, id, ['outline']);
  }

  async function buildDeck(c, id) {
    const cur = (await c.get(`/api/presentations/${id}`)).json.data;
    const r = await c.post(`/api/presentations/${id}/build`, { outlineVersion: cur.outlineVersion });
    if (r.status !== 202) throw new Error(`build: ${r.status} ${JSON.stringify(r.json)}`);
    return waitStatus(c, id, ['ready']);
  }

  /** Bài sẵn sàng (dàn ý → dựng). */
  async function readyDeck(c, text) {
    const o = await createOutline(c, text);
    return buildDeck(c, o.id);
  }

  async function close() {
    if (front) await new Promise((resolve) => {
      front.closeAllConnections?.();
      front.close(() => resolve());
    });
    await new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    });
    await container.browser.close().catch(() => {});
    await container.hasher.close().catch(() => {});
    container.sessionStore.close?.();
    await ai.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  }

  return { base, directBase, pool: db.pool, ai, cfg, loginNew, container, svc: container.services, admin, newUser, makeClient: () => makeClient(base), waitStatus, createOutline, buildDeck, readyDeck, dir, close };
}

/**
 * Gắn before/after cho 1 tệp test: dựng DB tạm rồi app trong CÙNG 1 hook (các hook before gốc của node:test chạy song song,
 * tách 2 hook thì app có thể dựng trước khi DB xong). Không dựng được → test FAIL (gate yêu cầu skipped 0).
 * Trả getter: app() — đối tượng của startHttpApp.
 */
export function useHttpApp(config, { before, after }, opts) {
  let db = null;
  let app = null;
  before(async () => {
    try {
      db = await setupTestDb(config);
    } catch (err) {
      throw new Error(`Không dựng được database test (${err.code || err.message}). Cấu hình IT_DB_* — xem test/integration/README.md`);
    }
    app = await startHttpApp(config, db, opts);
  });
  after(async () => {
    try {
      await app?.close();
    } finally {
      await db?.teardown();
    }
  });
  return () => app;
}
