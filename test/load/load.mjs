// Đo tải 500 người có thời gian nghĩ (roadmap B — LOAD-01/02/04/08) trên stack đo tải riêng (deploy/loadtest, AI giả).
//   node test/load/load.mjs --users <tệp provision.mjs> [--vus 500] [--ramp 300] [--steady 900] [--think 10]
//        [--burst 100] [--fault 120] [--out <tệp kết quả .json>] [--project mp-load]
// Kịch bản mỗi người ảo (VU): đăng nhập → lặp {nghĩ 0,5–1,5 × think giây → 1 thao tác theo trọng số}:
//   danh sách 30% · mở bài 25% · xem trước 15% · lưu (PATCH spec) 18% · xuất HTML 1% · xuất PDF 0,2% · tạo bài AI 0,3% (dàn ý → dựng,
//   hỏi trạng thái 3 giây/lần như giao diện) — còn lại: đọc danh sách mẫu/thông tin tài khoản.
// Giữa pha ổn định: (1) burst — `burst` người cùng bấm "Tạo bài"; (2) lỗi AI — Gemini trả 429 trong `fault` giây rồi hồi phục;
// (3) 20 client chậm tải HTML xuất. Lấy mẫu 10 giây/lần: /api/health/ready (hàng đợi), docker stats (CPU/RAM app + MySQL).
import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const data = JSON.parse(readFileSync(arg('users'), 'utf8'));
const BASE = data.base;
const VUS = Math.min(Number(arg('vus', 500)), data.users.length);
const RAMP = Number(arg('ramp', 300)) * 1000;
const STEADY = Number(arg('steady', 900)) * 1000;
const THINK = Number(arg('think', 10)) * 1000;
const BURST = Number(arg('burst', 100));
const FAULT = Number(arg('fault', 120)) * 1000;
const AI = arg('ai', 'http://127.0.0.1:4010');
const PROJECT = arg('project', 'mp-load');
const OUT = arg('out', '');

const t0 = Date.now();
const END = t0 + RAMP + STEADY;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now() - t0;

/* ---------- số đo ---------- */
const ops = new Map(); // tên → { lat: [], status: {}, codes: {} }
function record(name, ms, status, code) {
  let o = ops.get(name);
  if (!o) ops.set(name, (o = { lat: [], status: {}, codes: {}, phase: { ramp: [], steady: [] } }));
  o.lat.push(ms);
  o.status[status] = (o.status[status] || 0) + 1;
  if (code) o.codes[code] = (o.codes[code] || 0) + 1;
}
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const jobs = { created: 0, queueFull: 0, buildQueueFull: 0, outlineSec: [], buildSec: [], firstPosition: [], failed: 0, done: 0, rateLimited: 0 };
const samples = [];

function client() {
  let cookie = '';
  let csrf = '';
  async function req(name, method, p, body, { form, slow = 0 } = {}) {
    const headers = { cookie };
    if (method !== 'GET') headers['x-csrf-token'] = csrf;
    let payload = form;
    if (!form && body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const start = performance.now();
    let res;
    try {
      res = await fetch(BASE + p, { method, headers, body: payload, signal: AbortSignal.timeout(180000) });
    } catch (err) {
      record(name, performance.now() - start, err.name === 'TimeoutError' ? 'timeout' : 'neterr');
      return { status: 0, json: null };
    }
    const set = res.headers.getSetCookie();
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    let json = null;
    if (slow) {
      // Client chậm: đọc từng mẩu, nghỉ giữa các lần đọc (giữ kết nối + bộ đệm phía máy chủ).
      const reader = res.body.getReader();
      for (;;) {
        const { done } = await reader.read();
        if (done) break;
        await sleep(slow);
      }
    } else if ((res.headers.get('content-type') || '').includes('json')) json = await res.json().catch(() => null);
    else await res.arrayBuffer();
    record(name, performance.now() - start, res.status, json?.error?.code);
    if (json?.data?.csrfToken) csrf = json.data.csrfToken;
    if (json?.data?.token) csrf = json.data.token;
    return { status: res.status, json };
  }
  return { req };
}

/* ---------- 1 người dùng ảo ---------- */
async function aiJob(c, i) {
  const f = new FormData();
  f.set('text', `Báo cáo kết quả kinh doanh tháng của nhóm ${i}\nDoanh thu tăng ${5 + (i % 20)}% so với cùng kỳ.`);
  f.set('slideCount', '5');
  f.set('aiImages', '0');
  const r = await c.req('create', 'POST', '/api/presentations', undefined, { form: f });
  if (r.status === 503) return void (jobs.queueFull += 1);
  if (r.status === 429) return void (jobs.rateLimited += 1);
  if (r.status !== 202) return;
  jobs.created += 1;
  const id = r.json.data.id;
  const started = Date.now();
  let first = true;
  const wait = async (want, limitMs) => {
    while (Date.now() - started < limitMs && Date.now() < END + 600000) {
      await sleep(3000);
      const d = (await c.req('poll', 'GET', `/api/presentations/${id}`)).json?.data;
      if (first && d?.queue?.state === 'waiting') {
        jobs.firstPosition.push(d.queue.position);
        first = false;
      }
      if (d?.status === want) return d;
      if (d?.status === 'failed' || (want === 'ready' && d?.status === 'outline')) return d;
    }
    return null;
  };
  const o = await wait('outline', 30 * 60000);
  if (o?.status !== 'outline') return void (jobs.failed += 1);
  jobs.outlineSec.push((Date.now() - started) / 1000);
  const b0 = Date.now();
  const b = await c.req('build', 'POST', `/api/presentations/${id}/build`, { outlineVersion: o.outlineVersion });
  if (b.status === 503) return void (jobs.buildQueueFull += 1);
  if (b.status !== 202) return;
  const d = await wait('ready', 30 * 60000);
  if (d?.status === 'ready') {
    jobs.done += 1;
    jobs.buildSec.push((Date.now() - b0) / 1000);
  } else jobs.failed += 1;
}

async function vu(u, i) {
  const c = client();
  await c.req('csrf', 'GET', '/api/auth/csrf');
  const l = await c.req('login', 'POST', '/api/auth/login', { email: u.email, password: u.password });
  if (l.status !== 200) return;
  while (Date.now() < END) {
    await sleep(THINK * (0.5 + Math.random()));
    if (Date.now() >= END) break;
    const x = Math.random() * 100;
    if (x < 30) await c.req('list', 'GET', '/api/presentations?page=1&pageSize=20');
    else if (x < 55) await c.req('open', 'GET', `/api/presentations/${u.deckId}`);
    else if (x < 70) await c.req('preview', 'GET', `/api/presentations/${u.deckId}/preview`);
    else if (x < 88) {
      const d = (await c.req('open', 'GET', `/api/presentations/${u.deckId}`)).json?.data;
      if (d?.spec) {
        d.spec.slides[1].title = `Kết quả cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`;
        await c.req('save', 'PATCH', `/api/presentations/${u.deckId}`, { spec: d.spec, specVersion: d.specVersion });
      }
    } else if (x < 89) await c.req('export_html', 'GET', `/api/presentations/${u.deckId}/export.html`);
    else if (x < 89.2) await c.req('export_pdf', 'GET', `/api/presentations/${u.deckId}/export.pdf`);
    else if (x < 89.5) await aiJob(c, i);
    else if (x < 95) await c.req('templates', 'GET', '/api/templates');
    else await c.req('me', 'GET', '/api/auth/me');
  }
}

/* ---------- lấy mẫu tài nguyên ---------- */
async function sampler() {
  while (Date.now() < END + 5000) {
    const s = { t: Math.round(now() / 1000) };
    try {
      s.queue = (await (await fetch(`${BASE}/api/health/ready`)).json()).data.queue;
    } catch {
      s.queue = null;
    }
    try {
      const { stdout } = await run('docker', ['stats', '--no-stream', '--format', '{{.Name}};{{.CPUPerc}};{{.MemUsage}}', `${PROJECT}-app-1`, `${PROJECT}-mysql-1`]);
      s.docker = stdout.trim().split('\n').map((l) => l.split(';'));
    } catch {
      s.docker = null;
    }
    samples.push(s);
    await sleep(10000);
  }
}

const control = (body) => fetch(`${AI}/__control`, { method: 'POST', body: JSON.stringify(body) }).catch(() => {});

/* ---------- chạy ---------- */
console.log(`Đo tải: ${VUS} VU, tăng dần ${RAMP / 1000}s, ổn định ${STEADY / 1000}s, nghĩ ~${THINK / 1000}s → ${BASE}`);
await control({ delayMs: 30000, jitterMs: 20000, fail: null });
const sampling = sampler();
const all = [];
for (let i = 0; i < VUS; i += 1) {
  all.push(vu(data.users[i], i));
  await sleep(RAMP / VUS);
}
console.log(`[${Math.round(now() / 1000)}s] đủ ${VUS} VU — pha ổn định`);

// Burst: BURST người cùng tạo bài (ngoài nhịp thường).
await sleep(Math.min(120000, STEADY / 4));
console.log(`[${Math.round(now() / 1000)}s] burst ${BURST} yêu cầu tạo bài cùng lúc`);
const burstRes = { accepted: 0, queueFull: 0, other: 0, ms: [] };
await Promise.all(data.users.slice(0, BURST).map(async (u, k) => {
  const c = client();
  await c.req('csrf', 'GET', '/api/auth/csrf');
  await c.req('login', 'POST', '/api/auth/login', { email: u.email, password: u.password });
  const f = new FormData();
  f.set('text', `Đề xuất dự án ${k}\nTiết kiệm 30% chi phí vận hành.`);
  f.set('slideCount', '5');
  f.set('aiImages', '0');
  const s = performance.now();
  const r = await c.req('burst_create', 'POST', '/api/presentations', undefined, { form: f });
  burstRes.ms.push(performance.now() - s);
  if (r.status === 202) burstRes.accepted += 1;
  else if (r.status === 503) burstRes.queueFull += 1;
  else burstRes.other += 1;
}));

// Client chậm tải HTML xuất (20 người, đọc 1 mẩu / 200 ms).
const slow = Promise.all(data.users.slice(BURST, BURST + 20).map(async (u) => {
  const c = client();
  await c.req('csrf', 'GET', '/api/auth/csrf');
  await c.req('login', 'POST', '/api/auth/login', { email: u.email, password: u.password });
  await c.req('export_html_slow', 'GET', `/api/presentations/${u.deckId}/export.html`, undefined, { slow: 200 });
}));

// Lỗi AI: 429 trong FAULT giây rồi hồi phục.
await sleep(Math.min(120000, STEADY / 4));
console.log(`[${Math.round(now() / 1000)}s] AI trả 429 trong ${FAULT / 1000}s`);
const faultAt = Math.round(now() / 1000);
await control({ fail: '429', failRate: 1 });
await sleep(FAULT);
await control({ fail: null });
console.log(`[${Math.round(now() / 1000)}s] AI hồi phục`);

await Promise.all(all);
await slow;
await sampling;

/* ---------- tổng hợp ---------- */
const table = [...ops].map(([name, o]) => {
  const n = o.lat.length;
  const errs = Object.entries(o.status).filter(([s]) => !(Number(s) >= 200 && Number(s) < 400)).reduce((a, [, v]) => a + v, 0);
  return { op: name, n, p50: Math.round(pct(o.lat, 50)), p95: Math.round(pct(o.lat, 95)), p99: Math.round(pct(o.lat, 99)), max: Math.round(Math.max(...o.lat)), errPct: +((100 * errs) / n).toFixed(2), status: o.status, codes: o.codes };
}).sort((a, b) => b.n - a.n);
const totalReq = table.reduce((a, r) => a + r.n, 0);
const memOf = (name) => samples.flatMap((s) => (s.docker || []).filter((d) => d[0].includes(name)).map((d) => d[2].split('/')[0].trim()));
const cpuOf = (name) => samples.flatMap((s) => (s.docker || []).filter((d) => d[0].includes(name)).map((d) => parseFloat(d[1])));
const result = {
  startedAt: new Date(t0).toISOString(),
  config: { vus: VUS, rampSec: RAMP / 1000, steadySec: STEADY / 1000, thinkSec: THINK / 1000, burst: BURST, faultSec: FAULT / 1000, faultAt },
  durationSec: Math.round(now() / 1000),
  totalRequests: totalReq,
  rps: +(totalReq / (now() / 1000)).toFixed(1),
  ops: table,
  jobs: {
    ...jobs,
    outlineSec: { n: jobs.outlineSec.length, p50: pct(jobs.outlineSec, 50), p95: pct(jobs.outlineSec, 95), max: Math.max(0, ...jobs.outlineSec) },
    buildSec: { n: jobs.buildSec.length, p50: pct(jobs.buildSec, 50), p95: pct(jobs.buildSec, 95), max: Math.max(0, ...jobs.buildSec) },
    firstPosition: { n: jobs.firstPosition.length, max: Math.max(0, ...jobs.firstPosition) },
  },
  burst: { ...burstRes, p95ms: Math.round(pct(burstRes.ms, 95)) },
  resources: {
    appCpuPctMax: Math.max(0, ...cpuOf('app')),
    appCpuPctAvg: +(cpuOf('app').reduce((a, b) => a + b, 0) / Math.max(1, cpuOf('app').length)).toFixed(1),
    appMem: { first: memOf('app')[0], last: memOf('app').at(-1), samples: memOf('app') },
    mysqlCpuPctMax: Math.max(0, ...cpuOf('mysql')),
    mysqlMem: { first: memOf('mysql')[0], last: memOf('mysql').at(-1) },
    queueMax: Math.max(0, ...samples.map((s) => (s.queue ? s.queue.active + s.queue.pending : 0))),
    oldestWaitSecMax: Math.max(0, ...samples.map((s) => s.queue?.oldestWaitSec || 0)),
  },
  samples,
};
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 1));
console.log(`\nTổng ${totalReq} request trong ${result.durationSec}s (${result.rps} req/s)`);
console.log('thao tác | số lượng | p50 | p95 | p99 | max (ms) | lỗi %');
for (const r of table) console.log(`${r.op} | ${r.n} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.errPct} ${Object.keys(r.codes).length ? JSON.stringify(r.codes) : ''}`);
console.log('Job AI:', JSON.stringify(result.jobs));
console.log('Burst:', JSON.stringify(result.burst));
console.log('Tài nguyên:', JSON.stringify({ ...result.resources, appMem: { first: result.resources.appMem.first, last: result.resources.appMem.last } }));
