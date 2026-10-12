// Chuẩn bị dữ liệu đo tải (roadmap B) trên stack đo tải riêng (deploy/loadtest): admin → N người dùng (cấp qua API như production,
// đổi mật khẩu tạm) → mỗi người 1 bài đã dựng (AI giả, độ trễ 0 trong lúc chuẩn bị). Ghi danh sách tài khoản ra tệp NGOÀI repo.
//   node test/load/provision.mjs --base http://localhost:8093 --users 500 --out <thư-mục-tạm>/load-users.json [--project mp-load]
// Chỉ chạy trên stack đo tải: từ chối nếu cổng không phải app của compose project chỉ định.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('base', 'http://localhost:8093');
const N = Number(arg('users', 500));
const OUT = arg('out');
const PROJECT = arg('project', 'mp-load');
const AI = arg('ai', 'http://127.0.0.1:4010');
const PAR = Number(arg('parallel', 8));
if (!OUT) throw new Error('Thiếu --out <tệp json ngoài repo>');

const compose = ['compose', '-p', PROJECT, '-f', 'docker-compose.yml', '-f', 'deploy/loadtest/docker-compose.loadtest.yml'];
const port = /:(\d+)\s*$/.exec(execFileSync('docker', [...compose, 'port', 'app', '3000'], { encoding: 'utf8' }).trim())?.[1];
if (!port || new URL(BASE).port !== port) throw new Error(`BASE ${BASE} không phải app của project ${PROJECT} (cổng ${port}) — dừng`);

export function client(base) {
  let cookie = '';
  let csrf = '';
  async function req(method, p, body, form) {
    const headers = { cookie };
    if (method !== 'GET') headers['x-csrf-token'] = csrf;
    let payload = form;
    if (!form && body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + p, { method, headers, body: payload });
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    const json = await res.json().catch(() => null);
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    if (json?.data?.token) csrf = json.data.token;
    return { status: res.status, json };
  }
  return { req, init: () => req('GET', '/api/auth/csrf') };
}

const pw = () => `${randomBytes(12).toString('base64url')}Aa1`;
async function loginChange(email, temp) {
  const c = client(BASE);
  await c.init();
  let r = await c.req('POST', '/api/auth/login', { email, password: temp });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status}`);
  const password = pw();
  r = await c.req('POST', '/api/auth/change-password', { currentPassword: temp, newPassword: password });
  if (r.status !== 200) throw new Error(`đổi mật khẩu ${email}: ${r.status}`);
  return { c, password };
}

async function pool(items, n, fn) {
  let k = 0;
  const out = [];
  await Promise.all(Array.from({ length: n }, async () => {
    while (k < items.length) {
      const i = k++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

const stamp = Date.now().toString(36);
const adminEmail = `load-admin-${stamp}@load.test`;
const created = execFileSync('docker', [...compose, 'exec', '-T', 'app', 'node', 'scripts/create-admin.js', adminEmail, 'Quản trị đo tải'], { encoding: 'utf8' });
const temp = /Mật khẩu tạm[^:]*:\s*(\S+)/.exec(created)?.[1];
if (!temp) throw new Error('không đọc được mật khẩu tạm của admin');
const admin = (await loginChange(adminEmail, temp)).c;
await fetch(`${AI}/__control`, { method: 'POST', body: JSON.stringify({ delayMs: 0, jitterMs: 0, fail: null }) });

const t0 = Date.now();
const users = await pool(Array.from({ length: N }, (_, i) => i), PAR, async (i) => {
  const email = `load-${String(i).padStart(3, '0')}-${stamp}@load.test`;
  const r = await admin.req('POST', '/api/admin/users', { email, displayName: `Người đo tải ${i}` });
  if (r.status !== 201) throw new Error(`tạo user ${i}: ${r.status} ${JSON.stringify(r.json)}`);
  const { c, password } = await loginChange(email, r.json.data.temporaryPassword);
  // 1 bài đã dựng / người (đợi khi hàng đầy: 503 → thử lại).
  let id;
  for (;;) {
    const f = new FormData();
    f.set('text', `Kế hoạch kinh doanh ${i} của phòng bán hàng MISA\nDoanh thu mục tiêu tăng ${10 + (i % 30)}%.`);
    f.set('slideCount', '5');
    f.set('aiImages', '0');
    const res = await c.req('POST', '/api/presentations', undefined, f);
    if (res.status === 202) {
      id = res.json.data.id;
      break;
    }
    if (res.status !== 503) throw new Error(`tạo bài ${i}: ${res.status}`);
    await new Promise((r2) => setTimeout(r2, 500));
  }
  const wait = async (want) => {
    for (;;) {
      const d = (await c.req('GET', `/api/presentations/${id}`)).json.data;
      if (d.status === want) return d;
      if (d.status === 'failed') throw new Error(`bài ${id} failed`);
      await new Promise((r2) => setTimeout(r2, 200));
    }
  };
  const o = await wait('outline');
  for (;;) {
    const b = await c.req('POST', `/api/presentations/${id}/build`, { outlineVersion: o.outlineVersion });
    if (b.status === 202) break;
    if (b.status !== 503) throw new Error(`dựng bài ${i}: ${b.status}`);
    await new Promise((r2) => setTimeout(r2, 500));
  }
  await wait('ready');
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${N} người dùng sẵn sàng (${Math.round((Date.now() - t0) / 1000)} giây)`);
  return { email, password, deckId: id };
});
writeFileSync(OUT, JSON.stringify({ base: BASE, stamp, users }, null, 0));
console.log(`Xong: ${users.length} người dùng + ${users.length} bài trong ${Math.round((Date.now() - t0) / 1000)} giây → ${OUT}`);
