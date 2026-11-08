// Thư mục sắp xếp bài: tên, độ sâu tối đa, không vòng lặp cha–con, số lượng, chuyển bài, lọc danh sách — repository giả giữ cây trong bộ nhớ.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFolderService, MAX_DEPTH } from '../../src/services/folderService.js';

const U = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function world() {
  const rows = [];
  const decks = [{ id: 'd0000000-0000-4000-8000-000000000001', tenant: U, folder: null }, { id: 'd0000000-0000-4000-8000-000000000002', tenant: OTHER, folder: null }];
  const own = (t) => rows.filter((r) => r.tenant_id === t);
  const folders = {
    async allOwned(t) { return own(t); },
    async deckCounts(t) { const m = new Map(); for (const d of decks) if (d.tenant === t && d.folder) m.set(d.folder, (m.get(d.folder) || 0) + 1); return m; },
    async findOwned(t, id) { return own(t).find((r) => r.id === id) || null; },
    async create(t, f, check) { check(own(t)); rows.push({ id: f.id, tenant_id: t, parent_id: f.parentId, name: f.name }); },
    async update(t, id, fields, check) {
      const r = own(t).find((x) => x.id === id);
      if (!r) return 0;
      check(own(t));
      if (fields.name !== undefined) r.name = fields.name;
      if (fields.parentId !== undefined) r.parent_id = fields.parentId;
      return 1;
    },
    async remove(t, id) {
      const me = own(t).find((x) => x.id === id);
      if (!me) return null;
      for (const r of own(t)) if (r.parent_id === id) r.parent_id = me.parent_id;
      let moved = 0;
      for (const d of decks) if (d.tenant === t && d.folder === id) { d.folder = me.parent_id; moved++; }
      rows.splice(rows.indexOf(me), 1);
      return { moved, parentId: me.parent_id };
    },
    async moveDecks(t, ids, folderId) {
      if (folderId && !own(t).some((r) => r.id === folderId)) return -1;
      let n = 0;
      for (const d of decks) if (d.tenant === t && ids.includes(d.id)) { d.folder = folderId; n++; }
      return n;
    },
  };
  const svc = createFolderService({ repos: { folders }, audit: { async record() {} } });
  return { svc, rows, decks };
}

test('thư mục: tạo lồng nhau tới MAX_DEPTH cấp, cấp tiếp theo bị từ chối (TOO_DEEP); tên rỗng/quá dài bị từ chối', async () => {
  const { svc } = world();
  let parent = null;
  for (let i = 0; i < MAX_DEPTH; i++) parent = (await svc.create({ id: U }, { name: `Cấp ${i + 1}`, parentId: parent?.id })).id && (await svc.list({ id: U })).at(-1);
  await assert.rejects(svc.create({ id: U }, { name: 'Quá sâu', parentId: parent.id }), (e) => e.code === 'TOO_DEEP');
  await assert.rejects(svc.create({ id: U }, { name: '   ' }), (e) => e.code === 'INVALID_NAME');
  await assert.rejects(svc.create({ id: U }, { name: 'x'.repeat(121) }), (e) => e.code === 'INVALID_NAME');
});

test('thư mục: không chuyển vào chính nó / thư mục con (FOLDER_CYCLE); không dùng thư mục của người khác làm cha', async () => {
  const { svc } = world();
  const a = await svc.create({ id: U }, { name: 'A' });
  const b = await svc.create({ id: U }, { name: 'B', parentId: a.id });
  await assert.rejects(svc.update({ id: U }, a.id, { parentId: b.id }), (e) => e.code === 'FOLDER_CYCLE');
  await assert.rejects(svc.update({ id: U }, a.id, { parentId: a.id }), (e) => e.code === 'FOLDER_CYCLE');
  const x = await svc.create({ id: OTHER }, { name: 'Của người khác' });
  await assert.rejects(svc.create({ id: U }, { name: 'C', parentId: x.id }), (e) => e.status === 404);
  await assert.rejects(svc.update({ id: U }, x.id, { name: 'Đổi' }), (e) => e.status === 404);
  // Lên gốc + đổi tên được.
  const moved = await svc.update({ id: U }, b.id, { parentId: null, name: 'B mới' });
  assert.equal(moved.parentId, null);
  assert.equal(moved.name, 'B mới');
});

test('thư mục: chuyển cây con vượt độ sâu bị từ chối', async () => {
  const { svc } = world();
  let deep = null;
  for (let i = 0; i < MAX_DEPTH - 1; i++) deep = await svc.create({ id: U }, { name: `D${i}`, parentId: deep?.id });
  const t = await svc.create({ id: U }, { name: 'T' });
  await svc.create({ id: U }, { name: 'T con', parentId: t.id });
  // deep đang ở cấp MAX_DEPTH-1; T cao 2 cấp → đặt vào deep = cấp MAX_DEPTH+1.
  await assert.rejects(svc.update({ id: U }, t.id, { parentId: deep.id }), (e) => e.code === 'TOO_DEEP');
});

test('thư mục: chuyển bài chỉ áp bài của mình; xoá thư mục đưa bài + thư mục con lên cha', async () => {
  const { svc, decks, rows } = world();
  const a = await svc.create({ id: U }, { name: 'A' });
  const b = await svc.create({ id: U }, { name: 'B', parentId: a.id });
  const r = await svc.moveDecks({ id: U }, { ids: decks.map((d) => d.id), folderId: b.id });
  assert.equal(r.moved, 1, 'bài của người khác bị bỏ qua');
  assert.equal(decks[1].folder, null);
  assert.equal((await svc.list({ id: U })).find((f) => f.id === b.id).decks, 1);
  await assert.rejects(svc.moveDecks({ id: U }, { ids: ['khong-hop-le'], folderId: null }), (e) => e.code === 'INVALID_IDS');
  await svc.create({ id: U }, { name: 'B con', parentId: b.id });
  const res = await svc.remove({ id: U }, b.id);
  assert.deepEqual(res, { moved: 1, parentId: a.id });
  assert.equal(decks[0].folder, a.id);
  assert.equal(rows.find((x) => x.name === 'B con').parent_id, a.id);
});

test('thư mục: bộ lọc danh sách — all/root/thư mục của mình; thư mục người khác → 404', async () => {
  const { svc } = world();
  const a = await svc.create({ id: U }, { name: 'A' });
  const x = await svc.create({ id: OTHER }, { name: 'X' });
  assert.deepEqual(await svc.resolveFilter({ id: U }, undefined), { mode: 'all' });
  assert.deepEqual(await svc.resolveFilter({ id: U }, 'root'), { mode: 'root' });
  assert.deepEqual(await svc.resolveFilter({ id: U }, a.id), { mode: 'folder', id: a.id });
  await assert.rejects(svc.resolveFilter({ id: U }, x.id), (e) => e.status === 404);
});
