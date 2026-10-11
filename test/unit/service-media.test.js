// Hồi quy F01: media gửi kèm khi tạo bài + ảnh minh hoạ AI phải lưu vào ĐÚNG tenant/bài (asset + khoá tệp).
// Dùng repository/storage/AI giả; service thật chạy toàn bộ nhánh create → generateOutline → storeUserMedia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createPresentationService } from '../../src/services/presentationService.js';
import { loadConfig } from '../../src/config/index.js';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'a@misa.com.vn' };

async function pngFile(dir, name) {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 60, b: 60 } } }).png().toBuffer();
  const path = join(dir, name);
  writeFileSync(path, buffer);
  return { path, originalname: name, size: buffer.length, buffer };
}

function world() {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const config = loadConfig();
  process.env.NODE_ENV = prev;
  const created = [];
  const stored = [];
  const state = { outline: null, failed: null, rows: new Map() };
  const repos = {
    presentations: {
      async createForTenant(_t, row) { state.rows.set(row.id, { ...row, tenant_id: USER.id }); },
      async setOutlineResult(_t, id, r) { state.outline = r.outline; Object.assign(state.rows.get(id), { outline: r.outline, status: 'outline', outline_version: 1 }); },
      async setGenerationResult(_t, _id, r) { if (r.status === 'ready') state.spec = r.spec; else state.failed = r; },
      async findOwned(_t, id) { return state.rows.get(id) || null; },
      async startBuildOwned() { return 1; },
      async buildFailed(_t, _id, msg) { state.buildFailed = msg; },
    },
    assets: { async create(tenantId, row) { created.push({ tenantId, ...row }); }, async listMediaForPresentation() { return created.map((a) => ({ id: a.id, kind: a.kind })); } },
    versions: {},
  };
  const storage = { async put(key, buf) { stored.push({ key, bytes: buf.length }); }, async putFile(key) { stored.push({ key, bytes: 0 }); } };
  const gemini = {
    async generateOutline({ userImages }) {
      return { title: 'Bài thử', theme: 'ocean', slides: [{ layout: 'cover', title: 'Mở đầu', points: ['a'], images: userImages.map((_, i) => ({ ref: `UIMG${i + 1}` })) }, { layout: 'bullets', title: 'Nội dung', points: ['x', 'y'] }, { layout: 'closing', title: 'Cảm ơn', points: [] }] };
    },
    async designDeck() {
      return { slides: [{ ref: 'S1', layout: 'cover', title: 'Mở đầu', imagePrompt: 'a conference hall' }, { ref: 'S2', layout: 'bullets', title: 'Nội dung', items: [{ title: 'x' }, { title: 'y' }] }, { ref: 'S3', layout: 'closing', title: 'Cảm ơn' }] };
    },
    async generateImage() { return { buffer: await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336' } }).png().toBuffer() }; },
  };
  const audit = { async record() {} };
  const svc = createPresentationService({ config, repos, storage, gemini, browser: {}, signer: { url: (id) => `/a/${id}` }, audit, stock: {} });
  return { svc, created, stored, state, config };
}

async function until(fn, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('quá hạn chờ job');
}

test('F01: tạo bài kèm ảnh → ảnh lưu vào tenant + bài đúng, dàn ý lập được (không failed)', async () => {
  const { svc, created, stored, state } = world();
  const dir = mkdtempSync(join(tmpdir(), 'svc-media-'));
  const img = await pngFile(dir, 'anh-1.png');
  const r = await svc.create(USER, { text: 'Nội dung thử về hội nghị', media: [img], ratio: '16:9', slideCount: '5' }, '127.0.0.1');
  await until(() => state.outline || state.failed);
  assert.equal(state.failed, null, JSON.stringify(state.failed));
  assert.ok(state.outline.slides.length >= 3);
  const a = created.find((x) => x.kind === 'image');
  assert.ok(a, 'phải có asset ảnh');
  assert.equal(a.tenantId, USER.id);
  assert.equal(a.presentationId, r.id);
  assert.ok(a.storageKey.includes(USER.id) && a.storageKey.includes(r.id), a.storageKey);
  assert.ok(!stored.some((s) => /undefined/.test(s.key)), 'khoá tệp không chứa undefined');
});

test('F01: dựng bài với ảnh minh hoạ AI → ảnh được lưu vào tenant + bài đúng và gắn vào trang', async () => {
  const { svc, created, stored, state } = world();
  const r = await svc.create(USER, { text: 'Nội dung thử về hội nghị', ratio: '16:9', slideCount: '5', aiImages: '1' }, '127.0.0.1');
  await until(() => state.outline || state.failed);
  assert.equal(state.failed, null);
  state.rows.get(r.id).outline.options = { ...state.rows.get(r.id).outline.options, aiImages: true };
  await svc.build(USER, r.id, { outlineVersion: 1 }, '127.0.0.1');
  await until(() => state.spec || state.buildFailed);
  assert.equal(state.buildFailed, undefined, state.buildFailed);
  const a = created.find((x) => x.kind === 'image' && /^ai-minh-hoa/.test(x.originalName));
  assert.ok(a, 'phải có ảnh minh hoạ AI (không âm thầm bị bỏ)');
  assert.equal(a.tenantId, USER.id);
  assert.equal(a.presentationId, r.id);
  assert.ok(!stored.some((x) => /undefined/.test(x.key)));
  assert.equal(state.spec.slides[0].image?.asset, a.id);
});

// ---- F05: xuất/thumbnail chỉ nạp (base64) asset mà bài thực sự tham chiếu; xuất HTML có hàng đợi ----
function exportWorld(extra = {}) {
  const w = world();
  const A = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rows = [1, 2, 3].map((n) => ({ id: A(n), kind: 'image', mime: 'image/webp', bytes: 10, width: 100, height: 100, storage_key: `k/${n}` }));
  rows.push({ id: A(9), kind: 'video', mime: 'video/mp4', bytes: 5_000_000, width: null, height: null, storage_key: 'k/vid' });
  const spec = { title: 'T', slides: [{ id: 's1', layout: 'image', title: 'Trang 1', subtitle: '', items: [], image: { asset: A(1), alt: '', caption: '', fit: 'cover' } }, { id: 's2', layout: 'image', title: 'Trang 2', subtitle: '', items: [], image: { asset: A(2), alt: '', caption: '', fit: 'cover' } }] };
  const reads = [];
  const repos = {
    presentations: { async findReadable() { return { id: 'D1', tenant_id: USER.id, status: 'ready', title: 'T', ratio: '16:9', spec, access_role: 'owner' }; }, async findOwned() { return { id: 'D1', tenant_id: USER.id, status: 'ready', title: 'T', ratio: '16:9', spec, thumbnail_asset_id: null }; }, async setThumbnail() {} },
    assets: { async listMediaForPresentation() { return rows; }, async create() {}, async findById() { return null; }, async deleteOwned() {} },
    versions: {},
  };
  const storage = { async get(key) { reads.push(key); return Buffer.from('x'); }, async put() {}, async remove() {} };
  const browser = { async screenshotSlides() { return [await sharp({ create: { width: 64, height: 36, channels: 3, background: '#fff' } }).png().toBuffer()]; } };
  const svc = createPresentationService({ config: w.config, repos, storage, gemini: {}, browser, signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {}, ...extra });
  return { svc, reads, A };
}

test('F05: xuất HTML chỉ nạp ảnh/video mà bài dùng (ảnh + video thừa trong thư viện không bị đọc)', async () => {
  const { svc, reads, A } = exportWorld();
  const out = await svc.exportHtml(USER, 'D1', '127.0.0.1');
  assert.ok(out.html.length > 100);
  assert.deepEqual([...reads].sort(), ['k/1', 'k/2'], `chỉ đọc ảnh được dùng, thực tế đọc: ${reads}`);
  assert.ok(!out.html.includes(A(3)));
});

test('F05: thumbnail chỉ nạp ảnh của trang 1', async () => {
  const { svc, reads } = exportWorld();
  await svc.makeThumbnail(USER.id, 'D1');
  assert.deepEqual(reads, ['k/1'], `thumbnail chỉ cần ảnh trang 1, thực tế đọc: ${reads}`);
});

// ---- F09: nhân bản — lỗi giữa chừng không để lại bài "ready" thiếu media ----
function dupWorld({ failCopyAt = Infinity } = {}) {
  const A = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rows = [1, 2, 3].map((n) => ({ id: A(n), kind: 'image', mime: 'image/webp', bytes: 10, width: 10, height: 10, storage_key: `t/p/${n}.webp`, original_name: `a${n}` }));
  const spec = { title: 'T', slides: [{ id: 's1', layout: 'image', title: 'x', subtitle: '', items: [], image: { asset: A(1), alt: '', caption: '', fit: 'cover' } }] };
  const db = new Map();
  const made = [];
  let copies = 0;
  const repos = {
    presentations: {
      async findReadable() { return { id: 'D1', tenant_id: USER.id, status: 'ready', title: 'T', ratio: '16:9', spec, access_role: 'owner' }; },
      async findOwned(_t, id) { return db.get(id) || { id, tenant_id: USER.id, status: 'ready', title: 'T', ratio: '16:9', spec, outline: null }; },
      async createCopy(_t, p) { db.set(p.id, { id: p.id, tenant_id: USER.id, status: p.status || 'ready', title: p.title, ratio: p.ratio, spec: p.spec, source_kind: 'copy' }); },
      async markReady(_t, id) { const r = db.get(id); if (r) r.status = 'ready'; return r ? 1 : 0; },
      async deleteOwned(_t, id) { return db.delete(id) ? 1 : 0; },
      async findIdByCode() { return null; },
    },
    assets: { async listMediaForPresentation() { return rows; }, async create(_t, row) { made.push(row.id); }, async listForPresentation() { return rows; } },
    versions: {},
  };
  const storage = { async copy() { copies += 1; if (copies >= failCopyAt) throw new Error('đĩa đầy'); }, async removePrefix() {}, async get() { return Buffer.from('x'); }, async remove() {} };
  const w = world();
  const svc = createPresentationService({ config: w.config, repos, storage, gemini: {}, browser: {}, signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {} });
  return { svc, db, made };
}

test('F09: nhân bản lỗi khi sao chép media → không còn bài ready thiếu ảnh (bản dở bị dọn)', async () => {
  const { svc, db } = dupWorld({ failCopyAt: 2 });
  await assert.rejects(svc.duplicate(USER, 'D1', '127.0.0.1'), /đĩa đầy/);
  assert.deepEqual([...db.values()].filter((r) => r.status === 'ready'), [], 'không được để lại bản sao ready');
  assert.equal(db.size, 0, 'bản sao dở dang phải bị xoá');
});

test('F09: nhân bản thành công → bản sao ready, đủ media', async () => {
  const { svc, db, made } = dupWorld();
  await svc.duplicate(USER, 'D1', '127.0.0.1').catch(() => {});
  const copy = [...db.values()][0];
  assert.equal(copy?.status, 'ready');
  assert.equal(made.length, 3);
});

// ---- F12: người dùng phải đổi mật khẩu tạm không đọc được asset qua đường đăng nhập ----
test('F12: readAsset (không chữ ký) từ chối tài khoản đang phải đổi mật khẩu; tài khoản bình thường đọc được', async () => {
  const w = world();
  const repos = { presentations: {}, assets: { async findReadable() { return { id: 'x', kind: 'image', mime: 'image/webp', storage_key: 'k' }; }, async findById() { return null; } }, versions: {} };
  const storage = { async get() { return Buffer.from('img'); } };
  const svc = createPresentationService({ config: w.config, repos, storage, gemini: {}, browser: {}, signer: { url: () => '', verify: () => false }, audit: { async record() {} }, stock: {} });
  const id = 'a0000000-0000-4000-8000-000000000001';
  await assert.rejects(svc.readAsset({ ...USER, must_change_password: 1 }, id, { exp: null, sig: null }), { code: 'MUST_CHANGE_PASSWORD' });
  const ok = await svc.readAsset({ ...USER, must_change_password: 0 }, id, { exp: null, sig: null });
  assert.equal(ok.mime, 'image/webp');
});

// ---- Sơ đồ vẽ lại: ảnh gốc được giữ trong thư viện ảnh của bài (không đặt vào trang) để quay lại khi bản vẽ lại sai ----
test('redraw: sơ đồ được vẽ lại → ảnh gốc vẫn lưu làm asset của bài (không nằm trong dàn ý)', async () => {
  const w = world();
  const tempDir = mkdtempSync(join(tmpdir(), 'svc-tmp-'));
  const config = { ...w.config, storage: { ...w.config.storage, tempDir } };
  const created = [];
  const state = { outline: null, failed: null, rows: new Map() };
  const repos = {
    presentations: {
      async createForTenant(_t, row) { state.rows.set(row.id, { ...row, tenant_id: USER.id }); },
      async setOutlineResult(_t, id, r) { state.outline = r.outline; },
      async setGenerationResult(_t, _id, r) { state.failed = r; },
    },
    assets: { async create(tenantId, row) { created.push({ tenantId, ...row }); } },
    versions: {},
  };
  const dir = mkdtempSync(join(tmpdir(), 'svc-redraw-'));
  const buf = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#ffffff' } })
    .composite([{ input: await sharp({ create: { width: 700, height: 400, channels: 3, background: '#224488' } }).png().toBuffer(), left: 100, top: 100 }])
    .png().toBuffer();
  const path = join(dir, 'so-do.png');
  writeFileSync(path, buf);
  const gemini = {
    async locateVisuals() {
      return { shots: [{ page: 1, quality: 3, kind: 'diagram', diagramType: 'org', title: 'Sơ đồ tổ chức', box_2d: [0, 0, 1000, 1000], redraw: { type: 'org', root: 'Giám đốc', nodes: [{ title: 'Kinh doanh', items: [] }, { title: 'Kỹ thuật', items: [] }] } }] };
    },
    async generateOutline() {
      return { title: 'Bài thử', theme: 'ocean', slides: [{ layout: 'cover', title: 'Mở đầu', points: ['a'] }, { layout: 'bullets', title: 'Nội dung', points: ['x', 'y'] }, { layout: 'closing', title: 'Cảm ơn', points: [] }] };
    },
  };
  const svc = createPresentationService({ config, repos, storage: { async put() {} }, gemini, browser: {}, signer: { url: (id) => `/a/${id}` }, audit: { async record() {} }, stock: {} });
  await svc.create(USER, { files: [{ path, originalname: 'so-do.png', size: buf.length }], ratio: '16:9', slideCount: '5' }, '127.0.0.1');
  await until(() => state.outline || state.failed);
  assert.equal(state.failed, null, JSON.stringify(state.failed));
  const kept = created.filter((a) => /^Ảnh gốc sơ đồ/.test(a.originalName || ''));
  assert.equal(kept.length, 1, `phải giữ 1 ảnh gốc, tài sản: ${created.map((a) => a.originalName)}`);
  const used = JSON.stringify(state.outline);
  assert.ok(!used.includes(kept[0].id), 'ảnh gốc không được tự đặt vào trang');
});
