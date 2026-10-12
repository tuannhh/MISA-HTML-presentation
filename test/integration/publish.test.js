// Xuất bản ra domain công khai — MySQL thật + storage tạm:
// xuất bản / cập nhật (giữ mã, đổi revision, xoá revision cũ) / đổi tên (slug mới, link cũ 301) / gỡ / xuất bản lại cùng mã;
// HTML công khai không chứa URL nội bộ (API, URL ký); chỉ chủ bài; tắt khi chưa có domain; khoá tài khoản → trang ngừng hiện;
// xoá bài → xoá bản xuất bản; xuất bản đồng thời → 1 revision còn lại; bài bị sửa giữa chừng → PUBLISH_STALE, không đổi trang.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig } from '../../src/config/index.js';
import { createContainer } from '../../src/container.js';
import { assetKey } from '../../src/services/storageService.js';
import { useTestDb } from './helpers/testDb.mjs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const config = loadConfig();
const it = useTestDb(config, { before, after });

const PUBLIC = 'https://pub.example.test';

async function setup({ baseUrl = PUBLIC } = {}) {
  const pool = it.db().pool;
  const dir = await mkdtemp(path.join(tmpdir(), 'mp-pub-'));
  const cfg = {
    ...config,
    publish: { baseUrl, host: baseUrl ? new URL(baseUrl).hostname : '' },
    storage: { ...config.storage, root: dir, privateDir: path.join(dir, 'private'), tempDir: path.join(dir, 'temp'), uploadDir: path.join(dir, 'uploads') },
  };
  const { services, storage } = await createContainer(cfg, pool, { gemini: {}, browser: { async close() {} }, stock: {} });
  const mkUser = async (tag) => {
    const u = { id: randomUUID(), email: `pub-${tag}-${randomUUID().slice(0, 8)}@it.test`, role: 'user' };
    await pool.execute('INSERT INTO users (id, email, display_name, password_hash) VALUES (?, ?, ?, ?)', [u.id, u.email, tag, 'x'.repeat(60)]);
    return u;
  };
  let n = 0;
  // Bài sẵn sàng có 1 ảnh đang dùng + 1 ảnh thừa trong thư viện (không được chép ra trang công khai).
  const mkDeck = async (owner, title = 'Giới thiệu AMIS tổng thể') => {
    const id = randomUUID();
    const used = randomUUID();
    const unused = randomUUID();
    const spec = { title, slides: [{ id: 's1', layout: 'image', title: 'Ảnh', image: { asset: used } }, { id: 's2', layout: 'bullets', title: 'Ý chính', items: [{ text: 'Một' }] }] };
    n += 1;
    await pool.execute("INSERT INTO presentations (id, tenant_id, short_code, title, source_kind, status, spec, slide_count) VALUES (?, ?, ?, ?, 'text', 'ready', ?, 2)", [id, owner.id, `pb${String(n).padStart(2, '0')}${randomUUID().slice(0, 4)}`, title, JSON.stringify(spec)]);
    for (const a of [used, unused]) {
      const key = assetKey(owner.id, id, a);
      await storage.put(key, Buffer.from(`RIFF....WEBP-${a}`));
      await pool.execute("INSERT INTO assets (id, tenant_id, presentation_id, kind, mime, bytes, width, height, storage_key) VALUES (?, ?, ?, 'image', 'image/webp', 20, 640, 360, ?)", [a, owner.id, id, key]);
    }
    return { id, used, unused, spec };
  };
  const pubDir = (owner, id) => path.join(dir, 'private', 'tenants', owner.id, 'presentations', id, 'published');
  const revisions = async (owner, id) => readdir(pubDir(owner, id)).catch(() => []);
  const urlParts = (url) => {
    const m = /^https:\/\/pub\.example\.test\/([a-z0-9-]+)-([a-z0-9]{8})$/.exec(url);
    assert.ok(m, url);
    return { slug: m[1], code: m[2] };
  };
  return { pool, svc: services.publications, decks: services.presentations, sharing: services.sharing, mkUser, mkDeck, revisions, urlParts, cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}

test('Publish: xuất bản → trang tĩnh trên domain công khai, chỉ media đang dùng, không URL nội bộ; cập nhật giữ mã; đổi tên → 301', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const deck = await s.mkDeck(owner);
    assert.deepEqual(await s.svc.status(owner, deck.id), { enabled: true, published: false, url: null, publishedAt: null, outdated: false });

    const first = await s.svc.publish(owner, deck.id, '127.0.0.1');
    assert.equal(first.published, true);
    const { slug, code } = s.urlParts(first.url);
    assert.equal(slug, 'gioi-thieu-amis-tong-the');
    assert.equal(first.outdated, false);

    const page = await s.svc.page(slug, code);
    const html = page.html.toString('utf8');
    assert.match(html, new RegExp(`nonce="${page.pub.csp_nonce.replace(/[+/=]/g, (c) => `\\${c}`)}"`), 'script/style mang nonce đã lưu');
    assert.ok(html.includes(`/m/${code}/${page.pub.revision}/${deck.used}.webp`), 'ảnh trỏ tới media của bản xuất bản');
    assert.ok(!html.includes(deck.unused), 'ảnh thừa không xuất hiện');
    // URL ký nội bộ có dạng ?exp=…&sig=… (không dò chuỗi "sig=" trần: nonce base64 ngẫu nhiên có thể tình cờ chứa).
    for (const internal of ['/api/', '&sig=', '?exp=', '/deck-assets/', 'tenants/', owner.id]) assert.ok(!html.includes(internal), `HTML công khai lộ "${internal}"`);
    const revs = await s.revisions(owner, deck.id);
    assert.deepEqual(revs, [page.pub.revision]);
    assert.ok(await s.svc.mediaPath(code, page.pub.revision, `${deck.used}.webp`));
    assert.equal(await s.svc.mediaPath(code, page.pub.revision, `${deck.unused}.webp`).then((p) => stat(p)).catch(() => null), null, 'ảnh thừa không được chép');
    assert.equal(await s.svc.mediaPath(code, page.pub.revision, '../../x.webp'), null);

    // Sửa bài → bản công khai chưa đổi, báo "outdated"; cập nhật → cùng mã, revision mới, revision cũ bị xoá.
    const row = await s.decks.get(owner, deck.id);
    await s.decks.update(owner, deck.id, { title: 'Tên mới của bài', spec: { ...deck.spec, title: 'Tên mới của bài' }, specVersion: row.specVersion }, null);
    assert.equal((await s.svc.status(owner, deck.id)).outdated, true);
    assert.equal((await s.svc.page(slug, code)).pub.revision, page.pub.revision, 'trang công khai vẫn là ảnh chụp cũ');
    const second = await s.svc.publish(owner, deck.id, null);
    const p2 = s.urlParts(second.url);
    assert.equal(p2.code, code, 'mã giữ nguyên');
    assert.equal(p2.slug, 'ten-moi-cua-bai');
    assert.equal(second.outdated, false);
    assert.deepEqual(await s.svc.page(slug, code), { redirect: `/ten-moi-cua-bai-${code}` }, 'link cũ chuyển hướng');
    const cur = await s.svc.page(p2.slug, code);
    assert.notEqual(cur.pub.revision, page.pub.revision);
    assert.deepEqual(await s.revisions(owner, deck.id), [cur.pub.revision], 'revision cũ đã xoá');
    assert.equal(await s.svc.mediaPath(code, page.pub.revision, `${deck.used}.webp`), null, 'media revision cũ không còn phục vụ');

    // Gỡ → 404, tệp bị xoá; xuất bản lại → cùng mã.
    const off = await s.svc.unpublish(owner, deck.id, null);
    assert.equal(off.published, false);
    assert.equal(await s.svc.page(p2.slug, code), null);
    assert.deepEqual(await s.revisions(owner, deck.id), []);
    assert.equal((await s.svc.unpublish(owner, deck.id, null)).published, false, 'gỡ 2 lần không lỗi');
    const again = await s.svc.publish(owner, deck.id, null);
    assert.equal(s.urlParts(again.url).code, code, 'xuất bản lại dùng lại link');

    const [audits] = await s.pool.execute("SELECT action FROM audit_logs WHERE target_id = ? AND action LIKE 'presentation.%publish' ORDER BY id", [deck.id]);
    assert.deepEqual(audits.map((a) => a.action), ['presentation.publish', 'presentation.republish', 'presentation.unpublish', 'presentation.republish']);
  } finally {
    await s.cleanup();
  }
});

test('Publish: chỉ chủ bài; người được mời sửa/xem không xuất bản/gỡ được', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const editor = await s.mkUser('editor');
    const stranger = await s.mkUser('stranger');
    const deck = await s.mkDeck(owner);
    await s.sharing.addShare(owner, deck.id, { email: editor.email, role: 'editor' }, null);
    for (const u of [editor, stranger]) {
      await assert.rejects(s.svc.publish(u, deck.id, null), (e) => e.status === 404, u.email);
      await assert.rejects(s.svc.status(u, deck.id), (e) => e.status === 404);
    }
    await s.svc.publish(owner, deck.id, null);
    await assert.rejects(s.svc.unpublish(editor, deck.id, null), (e) => e.status === 404);
    assert.equal((await s.svc.status(owner, deck.id)).published, true);
  } finally {
    await s.cleanup();
  }
});

test('Publish: chưa đặt domain công khai → 503 PUBLISH_DISABLED, không ghi gì', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup({ baseUrl: '' });
  try {
    const owner = await s.mkUser('owner');
    const deck = await s.mkDeck(owner);
    await assert.rejects(s.svc.publish(owner, deck.id, null), (e) => e.status === 503 && e.code === 'PUBLISH_DISABLED');
    assert.equal((await s.svc.status(owner, deck.id)).enabled, false);
    const [[{ n }]] = await s.pool.execute('SELECT COUNT(*) AS n FROM publications WHERE presentation_id = ?', [deck.id]);
    assert.equal(Number(n), 0);
  } finally {
    await s.cleanup();
  }
});

test('Publish: khoá tài khoản chủ bài → trang ngừng hiện; xoá bài → xoá bản xuất bản + tệp', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const deck = await s.mkDeck(owner);
    const { slug, code } = s.urlParts((await s.svc.publish(owner, deck.id, null)).url);
    await s.pool.execute("UPDATE users SET status = 'disabled' WHERE id = ?", [owner.id]);
    assert.equal(await s.svc.page(slug, code), null);
    await s.pool.execute("UPDATE users SET status = 'active' WHERE id = ?", [owner.id]);
    assert.ok((await s.svc.page(slug, code)).html);
    await s.decks.remove(owner, deck.id, null);
    assert.equal(await s.svc.page(slug, code), null);
    const [[{ n }]] = await s.pool.execute('SELECT COUNT(*) AS n FROM publications WHERE code = ?', [code]);
    assert.equal(Number(n), 0);
    assert.deepEqual(await s.revisions(owner, deck.id), []);
  } finally {
    await s.cleanup();
  }
});

test('Publish: 6 lần xuất bản đồng thời → 1 mã, đúng 1 revision còn lại và khớp DB', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const deck = await s.mkDeck(owner);
    await s.svc.publish(owner, deck.id, null);
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => s.svc.publish(owner, deck.id, null)));
    assert.ok(res.every((r) => r.status === 'fulfilled'), JSON.stringify(res.find((r) => r.status === 'rejected')?.reason?.message));
    assert.equal(new Set(res.map((r) => r.value.url)).size, 1);
    const [[pub]] = await s.pool.execute('SELECT revision FROM publications WHERE presentation_id = ?', [deck.id]);
    assert.deepEqual(await s.revisions(owner, deck.id), [pub.revision]);
  } finally {
    await s.cleanup();
  }
});

test('Publish: 6 lần xuất bản LẦN ĐẦU đồng thời → 1 mã; HTML còn lại trỏ media theo đúng mã đó (ảnh không 404)', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const deck = await s.mkDeck(owner);
    const res = await Promise.allSettled(Array.from({ length: 6 }, () => s.svc.publish(owner, deck.id, null)));
    assert.ok(res.every((r) => r.status === 'fulfilled'), JSON.stringify(res.find((r) => r.status === 'rejected')?.reason?.message));
    const { slug, code } = s.urlParts(res[0].value.url);
    assert.equal(new Set(res.map((r) => r.value.url)).size, 1);
    const page = await s.svc.page(slug, code);
    const html = page.html.toString('utf8');
    assert.ok(html.includes(`/m/${code}/${page.pub.revision}/${deck.used}.webp`), 'HTML trỏ media theo mã đang dùng');
    assert.ok(await s.svc.mediaPath(code, page.pub.revision, `${deck.used}.webp`).then((p) => stat(p)), 'tệp media phục vụ được');
    assert.deepEqual(await s.revisions(owner, deck.id), [page.pub.revision]);
  } finally {
    await s.cleanup();
  }
});

test('Publish: bài bị sửa trong lúc dựng → PUBLISH_STALE, trang công khai giữ nguyên, không sót tệp', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const deck = await s.mkDeck(owner);
    const { slug, code } = s.urlParts((await s.svc.publish(owner, deck.id, null)).url);
    const before = (await s.svc.page(slug, code)).pub.revision;
    // Chen 1 lần lưu nội dung ngay sau khi dựng HTML xong (trước khi ghi DB).
    const orig = s.decks.renderForPublish;
    s.decks.renderForPublish = async (...args) => {
      const out = await orig(...args);
      await s.pool.execute('UPDATE presentations SET spec_version = spec_version + 1 WHERE id = ?', [deck.id]);
      return out;
    };
    try {
      await assert.rejects(s.svc.publish(owner, deck.id, null), (e) => e.code === 'PUBLISH_STALE');
    } finally {
      s.decks.renderForPublish = orig;
    }
    assert.equal((await s.svc.page(slug, code)).pub.revision, before);
    assert.deepEqual(await s.revisions(owner, deck.id), [before], 'thư mục revision dựng dở đã xoá');
  } finally {
    await s.cleanup();
  }
});

test('Publish: admin thấy danh sách trang đang công khai và gỡ được', { timeout: 60000 }, async (t) => {
  if (it.skipIfNoDb(t)) return;
  const s = await setup();
  try {
    const owner = await s.mkUser('owner');
    const admin = await s.mkUser('admin');
    const deck = await s.mkDeck(owner, 'Bài vi phạm');
    const priv = await s.mkDeck(owner, 'Bài riêng tư');
    const { slug, code } = s.urlParts((await s.svc.publish(owner, deck.id, null)).url);
    const { rows, total } = await s.svc.adminList({ q: 'vi phạm', page: 1, pageSize: 20 });
    assert.equal(total, 1);
    assert.equal(rows[0].url, `${PUBLIC}/${slug}-${code}`);
    assert.equal(rows[0].owner.email, owner.email);
    assert.ok(!(await s.svc.adminList({ q: 'riêng tư', page: 1, pageSize: 20 })).total, 'bài chưa xuất bản không hiện với admin');
    await s.svc.adminUnpublish(admin, deck.id, null);
    assert.equal(await s.svc.page(slug, code), null);
    await assert.rejects(s.svc.adminUnpublish(admin, priv.id, null), (e) => e.status === 404);
  } finally {
    await s.cleanup();
  }
});
