// CT-003: 3 đường tạo asset video (editor, tạo bài kèm video, nhập bài HTML) dùng chung phép kiểm tệp hỏng và không để lại tệp/asset rác.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';

process.env.NODE_ENV = 'test';
const config = loadConfig();
const dir = mkdtempSync(join(tmpdir(), 'vingest-'));
const USER = { id: 'u1' };
const DECK = 'd0000000-0000-4000-8000-000000000001';

// MP4 giả: hộp ftyp ở đầu (sniffVideo nhận). Byte 9 = 0xff đánh dấu "hỏng" cho ffprobe giả.
const mp4 = (broken = false, n = 3000) => {
  const b = Buffer.alloc(n, 7);
  b.writeUInt32BE(24, 0);
  b.write('ftypisom', 4, 'latin1');
  if (broken) b[9] = 0xff;
  return b;
};
const isBroken = (buf) => buf[9] === 0xff;
let seq = 0;
const tmpFile = (name, buf, mimetype = 'video/mp4') => {
  const p = join(dir, `${(seq += 1)}-${name}`);
  writeFileSync(p, buf);
  return { path: p, originalname: name, name, size: buf.length, mimetype, type: 'mp4', buffer: buf };
};

function rig({ ffmpeg = true } = {}) {
  const store = new Map(); // khoá kho → Buffer
  const created = [];
  const enqueued = [];
  const results = [];
  const storage = {
    put: async (k, b) => store.set(k, b),
    putFile: async (k, p) => store.set(k, readFileSync(p)),
    remove: async (k) => store.delete(k),
    pathOf: (k) => `mem:${k}`,
  };
  const videos = {
    inspect: async (p) => {
      if (!ffmpeg) return { info: null, poster: null };
      const buf = p.startsWith('mem:') ? store.get(p.slice(4)) : readFileSync(p);
      return isBroken(buf) ? { info: null, poster: null, broken: true } : { info: { width: 640, height: 360, vcodec: 'h264' }, poster: null };
    },
    enqueue: (id) => enqueued.push(id),
    resume: async () => 0,
    stats: () => ({}),
  };
  const deckRow = { id: DECK, tenant_id: 'T1', status: 'ready', access_role: 'owner', spec: { slides: [] } };
  const presentations = {
    findReadable: async () => deckRow,
    findOwned: async () => null,
    createForTenant: async (_t, row) => (results.push(['create', row.id]), 1),
    setGenerationResult: async (_t, _id, r) => results.push(['done', r.status, r.errorMessage]),
    setOutlineResult: async (...a) => results.push(['outline', a]),
  };
  const assets = {
    create: async (_t, row) => created.push(row),
    countForPresentation: async () => 0,
    listMediaForPresentation: async () => created.map((r) => ({ id: r.id })),
    listOwnedForPresentation: async () => [],
  };
  const png = sharp({ create: { width: 64, height: 36, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const browser = {
    inspectHtmlDeck: async (_html, { refs }) => ({ slides: [{ title: 'Trang 1', text: 'chữ', notes: '', images: [], videoRefs: refs, vbox: { x: 10, y: 10, w: 50, h: 50 }, shot: await png, fit: 'cover' }], images: [], title: 'Bài HTML', total: 1, mode: 'keys', videos: [] }),
  };
  const svc = createPresentationService({
    config, repos: { presentations, assets, versions: {} }, storage, gemini: {}, browser, signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {}, videos,
  });
  return { svc, store, created, enqueued, results };
}
const videoAssets = (r) => r.created.filter((a) => a.kind === 'video');
const waitFor = async (fn, ms = 4000) => {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('quá thời gian chờ job nền');
    await new Promise((x) => setTimeout(x, 15));
  }
};

test('editor (addVideo): MP4 hỏng → 422 INVALID_VIDEO, không ghi kho, không tạo asset, không xếp hàng nén', async () => {
  const r = rig();
  await assert.rejects(r.svc.addVideo(USER, DECK, tmpFile('hong.mp4', mp4(true)), null), (e) => e.status === 422 && e.code === 'INVALID_VIDEO');
  assert.equal(r.store.size, 0);
  assert.deepEqual(r.created, []);
  assert.deepEqual(r.enqueued, []);
});

test('editor (addVideo): video hợp lệ vẫn qua — có asset, tệp trong kho, xếp hàng nén', async () => {
  const r = rig();
  const out = await r.svc.addVideo(USER, DECK, tmpFile('tot.mp4', mp4()), null);
  assert.equal(out.video.provider, 'file');
  assert.equal(videoAssets(r).length, 1);
  assert.equal(r.store.size, 1);
  assert.deepEqual(r.enqueued, [out.video.asset]);
  assert.equal(videoAssets(r)[0].processState, 'pending');
});

test('thiếu ffmpeg: vẫn lưu video (như trước), không nén', async () => {
  const r = rig({ ffmpeg: false });
  const out = await r.svc.addVideo(USER, DECK, tmpFile('tot.mp4', mp4()), null);
  assert.equal(videoAssets(r).length, 1);
  assert.equal(videoAssets(r)[0].processState, null);
  assert.deepEqual(r.enqueued, []);
  assert.ok(out.video.asset);
});

test('lỗi DB sau khi ghi kho → xoá tệp vừa ghi (không để rác)', async () => {
  const r = rig();
  const svc2 = createPresentationService({
    config,
    repos: {
      presentations: { findReadable: async () => ({ id: DECK, tenant_id: 'T1', status: 'ready', access_role: 'owner' }) },
      assets: { countForPresentation: async () => 0, create: async () => { throw new Error('ECONNRESET'); } },
      versions: {},
    },
    storage: { put: async (k, b) => r.store.set(k, b), putFile: async (k, p) => r.store.set(k, readFileSync(p)), remove: async (k) => r.store.delete(k), pathOf: (k) => k },
    gemini: {}, browser: {}, signer: {}, audit: { async record() {} }, stock: {},
    videos: { inspect: async () => ({ info: { width: 1, height: 1 }, poster: null }), enqueue() {}, stats: () => ({}) },
  });
  await assert.rejects(svc2.addVideo(USER, DECK, tmpFile('tot.mp4', mp4()), null), /ECONNRESET/);
  assert.equal(r.store.size, 0, 'tệp đã ghi bị xoá lại');
});

test('tạo bài kèm video hỏng → 422 INVALID_VIDEO ngay lúc nhận (chưa tạo bài, chưa vào hàng), xoá tệp tạm', async () => {
  const r = rig();
  const bad = tmpFile('hong.mp4', mp4(true));
  await assert.rejects(
    r.svc.create(USER, { text: 'Nội dung đủ dài để làm tư liệu. '.repeat(20), media: [bad], posters: [], files: [] }, '127.0.0.1'),
    (e) => e.status === 422 && e.code === 'INVALID_VIDEO',
  );
  assert.deepEqual(r.results, [], 'chưa tạo bài');
  assert.equal(existsSync(bad.path), false, 'tệp tạm bị xoá');
  assert.equal(r.store.size, 0);
});

test('nhập HTML giữ nguyên thiết kế: video hỏng bị bỏ riêng, bài vẫn nhập; video tốt vẫn lưu', async () => {
  const r = rig();
  const b64 = (b) => b.toString('base64');
  const html = `<!doctype html><html><body><section>Trang</section><script type="application/octet-stream" id="dv-1">${b64(mp4(false, 70000))}</script><script type="application/octet-stream" id="dv-2">${b64(mp4(true, 70000))}</script></body></html>`;
  const file = tmpFile('bai.html', Buffer.from(html), 'text/html');
  await r.svc.create(USER, { htmlMode: 'design', files: [file], media: [], posters: [], text: '' }, '127.0.0.1');
  await waitFor(() => r.results.some((x) => x[0] === 'done'));
  const done = r.results.find((x) => x[0] === 'done');
  assert.equal(done[1], 'ready', `nhập phải thành công (lỗi: ${done[2]})`);
  assert.equal(videoAssets(r).length, 1, 'chỉ video tốt thành asset');
  assert.equal([...r.store.keys()].filter((k) => /\.mp4$/.test(k)).length, 1, 'video hỏng không để lại tệp trong kho');
});
