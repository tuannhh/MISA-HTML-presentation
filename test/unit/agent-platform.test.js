// Gemini Enterprise Agent Platform (Vertex AI cũ): token từ file khoá service account, URL theo project/location, Bearer thay khoá API,
// 401 → xin token mới, không có Files API (tệp inline, WAV lớn cắt đoạn), cấu hình sai → dừng khởi động.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServiceAccountTokens, loadServiceAccount } from '../../src/lib/googleAuth.js';
import { createGeminiService } from '../../src/services/geminiService.js';
import { prepareMedia, wavSegments, AGENT_INLINE_MAX } from '../../src/services/mediaService.js';
import { loadConfig } from '../../src/config/index.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = {
  type: 'service_account',
  project_id: 'du-an-thu',
  private_key_id: 'kid1',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  client_email: 'sa@du-an-thu.iam.gserviceaccount.com',
  token_uri: 'https://oauth2.example.test/token',
};
const dir = mkdtempSync(path.join(tmpdir(), 'mp-sa-'));
const keyFile = path.join(dir, 'sa.json');
writeFileSync(keyFile, JSON.stringify(SA));

test('token: JWT RS256 đúng chữ ký/claim, giữ token tới gần hạn, nhiều lời gọi cùng lúc chỉ xin 1 lần, invalidate → xin lại', async () => {
  let t = 1_000_000_000_000;
  const calls = [];
  const fetchImpl = async (url, init) => {
    const assertion = new URLSearchParams(init.body).get('assertion');
    calls.push({ url, assertion });
    await new Promise((r) => setTimeout(r, 5));
    return new Response(JSON.stringify({ access_token: `tok${calls.length}`, expires_in: 3600 }), { status: 200 });
  };
  const tokens = createServiceAccountTokens(loadServiceAccount(keyFile), { fetchImpl, now: () => t });
  const got = await Promise.all([tokens.getToken(), tokens.getToken(), tokens.getToken()]);
  assert.deepEqual(got, ['tok1', 'tok1', 'tok1']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, SA.token_uri);
  const [h, c, sig] = calls[0].assertion.split('.');
  assert.equal(createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url')), true);
  const claim = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claim.iss, SA.client_email);
  assert.equal(claim.aud, SA.token_uri);
  assert.match(claim.scope, /cloud-platform/);
  t += 50 * 60000; // còn 10 phút → vẫn dùng
  assert.equal(await tokens.getToken(), 'tok1');
  t += 6 * 60000; // còn < 5 phút → làm mới
  assert.equal(await tokens.getToken(), 'tok2');
  tokens.invalidate();
  assert.equal(await tokens.getToken(), 'tok3');
});

test('token lỗi (invalid_grant) → Error chung, lần sau thử lại được', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n += 1;
    return n === 1
      ? new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }), { status: 400 })
      : new Response(JSON.stringify({ access_token: 'ok', expires_in: 3600 }), { status: 200 });
  };
  const tokens = createServiceAccountTokens(SA, { fetchImpl });
  await assert.rejects(tokens.getToken(), /google_token_failed/);
  assert.equal(await tokens.getToken(), 'ok');
});

test('file khoá: không tồn tại / không phải JSON / không phải service account → thông điệp rõ, không lộ nội dung', () => {
  assert.throws(() => loadServiceAccount(path.join(dir, 'khong-co.json')), /Không đọc được file khoá.*ENOENT/);
  const bad = path.join(dir, 'bad.json');
  writeFileSync(bad, '{khong phai json');
  assert.throws(() => loadServiceAccount(bad), /không phải JSON/);
  const user = path.join(dir, 'user.json');
  writeFileSync(user, JSON.stringify({ type: 'authorized_user', private_key: 'BI-MAT' }));
  assert.throws(() => loadServiceAccount(user), (e) => /service account/.test(e.message) && !e.message.includes('BI-MAT'));
});

function withEnv(patch, fn) {
  const keep = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: 'development', SESSION_SECRET: 'x'.repeat(40), GEMINI_API_KEY: '' }, patch);
    return fn();
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
}

test('cấu hình agent-platform: thiếu biến, file sai, project lệch → dừng khởi động; đủ → nạp được, không cần GEMINI_API_KEY', () => {
  const base = { GEMINI_PROVIDER: 'agent-platform', GOOGLE_APPLICATION_CREDENTIALS: keyFile, GOOGLE_CLOUD_PROJECT: 'du-an-thu', GOOGLE_CLOUD_LOCATION: 'global' };
  withEnv(base, () => {
    const g = loadConfig().gemini;
    assert.equal(g.provider, 'agent-platform');
    assert.equal(g.location, 'global');
  });
  withEnv({ ...base, GOOGLE_APPLICATION_CREDENTIALS: '' }, () => assert.throws(() => loadConfig(), /Thiếu GOOGLE_APPLICATION_CREDENTIALS/));
  withEnv({ ...base, GOOGLE_CLOUD_PROJECT: 'du-an-khac' }, () => assert.throws(() => loadConfig(), /khác GOOGLE_CLOUD_PROJECT/));
  withEnv({ ...base, GOOGLE_APPLICATION_CREDENTIALS: path.join(dir, 'khong-co.json') }, () => assert.throws(() => loadConfig(), /Không đọc được file khoá/));
  withEnv({ ...base, GEMINI_PROVIDER: 'vertex' }, () => assert.throws(() => loadConfig(), /GEMINI_PROVIDER không hợp lệ/));
  withEnv({ GEMINI_PROVIDER: 'developer-api' }, () => assert.throws(() => loadConfig(), /Thiếu GEMINI_API_KEY/));
});

test('gọi model: URL projects/…/locations/…/publishers/google/models, header Bearer (không x-goog-api-key), 401 → token mới rồi thử lại', async () => {
  const seen = [];
  let first = true;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      seen.push({ url: req.url, auth: req.headers.authorization, key: req.headers['x-goog-api-key'] });
      if (first) {
        first = false;
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Xin chào' }] }, finishReason: 'STOP' }] }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  let n = 0;
  const tokens = { getToken: async () => `tok${n}`, invalidate: () => { n += 1; } };
  const g = createGeminiService({ provider: 'agent-platform', project: 'du-an-thu', location: 'asia-southeast1', model: 'gemini-x', baseUrl: 'https://khong-dung.example/v1beta', timeoutMs: 5000, agentBaseUrl: `http://127.0.0.1:${server.address().port}/v1`, tokens });
  try {
    assert.equal(g.supportsFiles, false);
    const text = await g.extractMedia({ kind: 'pdf', part: { inlineData: { mimeType: 'application/pdf', data: 'AA==' } }, label: 'a.pdf' });
    assert.equal(text, 'Xin chào');
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, '/v1/projects/du-an-thu/locations/asia-southeast1/publishers/google/models/gemini-x:generateContent');
    assert.deepEqual(seen.map((s) => s.auth), ['Bearer tok0', 'Bearer tok1']);
    assert.ok(seen.every((s) => !s.key), 'không gửi khoá API');
    await assert.rejects(g.uploadFile({ blob: new Blob(['x']), size: 1, mime: 'application/pdf' }), /Files API/);
    await g.deleteFile('files/x'); // không làm gì, không lỗi
  } finally {
    server.close();
  }
});

function wav(seconds, rate = 8000) {
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) b.writeInt16LE((i * 7) % 30000, 44 + i * 2);
  return b;
}

test('wavSegments: cắt đúng khung mẫu, mỗi đoạn là WAV hợp lệ, ghép lại đủ dữ liệu gốc (đọc từ tệp, không nạp cả tệp)', async () => {
  const buf = wav(10);
  const p = path.join(dir, 'a.wav');
  writeFileSync(p, buf);
  const segs = await wavSegments({ path: p, size: buf.length }, 50_000);
  assert.ok(segs.length > 1);
  const parts = await Promise.all(segs.map((s) => s.load()));
  for (const b of parts) {
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.readUInt32LE(4), b.length - 8);
    assert.equal(b.readUInt32LE(40), b.length - 44);
    assert.equal((b.length - 44) % 2, 0);
    assert.ok(b.length <= 50_000);
  }
  assert.ok(Buffer.concat(parts.map((b) => b.subarray(44))).equals(buf.subarray(44)));
  assert.equal(segs[0].fromSec, 0);
  assert.ok(Math.abs(segs.at(-1).toSec - 10) < 0.01);
  assert.equal(await wavSegments({ buffer: Buffer.from('khong phai wav'), size: 14 }, 1000), null);
});

test('prepareMedia không có Files API: mọi tệp inline, không gọi uploadFile; ghi âm nén quá trần → 422 rõ ràng', async () => {
  const gemini = {
    supportsFiles: false,
    uploadFile: async () => assert.fail('không được gọi Files API'),
    deleteFile: async () => {},
    extractMedia: async ({ label }) => `chép: ${label}`,
  };
  // 20 MB (vượt INLINE_TOTAL 8 MB của đường Files API) vẫn đi thẳng vào lượt dựng bài, inline.
  const mid = { kind: 'audio', name: 'hop.mp3', size: 20 * 1048576, mime: 'audio/mpeg', buffer: Buffer.alloc(20 * 1048576) };
  const a = await prepareMedia([mid], { gemini });
  assert.ok(a.direct[0].part.inlineData);
  // 40 MB: quá ngân sách token → chuyển văn bản trước, vẫn inline.
  const big = { kind: 'audio', name: 'dai.mp3', size: 40 * 1048576, mime: 'audio/mpeg', buffer: Buffer.alloc(40 * 1048576) };
  const r = await prepareMedia([big], { gemini });
  assert.deepEqual(r.pieces.map((x) => x.text), ['chép: Bản chuyển thể ghi âm "dai.mp3"']);
  await assert.rejects(
    prepareMedia([{ kind: 'audio', name: 'dai.mp3', size: AGENT_INLINE_MAX + 1, mime: 'audio/mpeg', path: path.join(dir, 'khong-doc.mp3') }], { gemini }),
    (e) => e.status === 422 && e.code === 'AUDIO_TOO_LARGE',
  );
  const small = { kind: 'audio', name: 'ngan.wav', size: 1000, mime: 'audio/wav', buffer: wav(1).subarray(0, 1000) };
  const d = await prepareMedia([small], { gemini });
  assert.ok(d.direct[0].part.inlineData, 'tư liệu nhỏ đi thẳng vào lượt dựng bài, inline');
});
