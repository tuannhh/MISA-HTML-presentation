// Chia sẻ theo người + phiên bản handoff (sharingService) với repository giả — kiểm tra quyền và luật nghiệp vụ.
// SQL thật (khoá dòng khi handoff, bản gốc duy nhất) được kiểm ở smoke test trên MySQL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSharingService, MAX_HANDOFFS } from '../../src/services/sharingService.js';
import { accessRole } from '../../src/repositories/presentationRepository.js';
import { forbidden, notFound } from '../../src/lib/httpError.js';

const OWNER = { id: '11111111-1111-4111-8111-111111111111', email: 'chu@misa.com.vn' };
const EDITOR = { id: '22222222-2222-4222-8222-222222222222', email: 'sua@misa.com.vn' };
const VIEWER = { id: '33333333-3333-4333-8333-333333333333', email: 'xem@misa.com.vn' };
const DECK = '44444444-4444-4444-8444-444444444444';

function world() {
  const deck = { id: DECK, tenant_id: OWNER.id, status: 'ready', visibility: 'private', spec_version: 3 };
  const users = [OWNER, EDITOR, VIEWER].map((u) => ({ id: u.id, email: u.email, display_name: u.email.split('@')[0] }));
  const shares = [];
  const versions = [];
  const restored = [];
  const role = (u) => (u.id === OWNER.id ? 'owner' : shares.find((s) => s.user_id === u.id)?.role === 'editor' ? 'editor' : shares.some((s) => s.user_id === u.id) ? 'viewer' : null);
  const decks = {
    async owned(u) {
      if (u.id !== OWNER.id) throw notFound('Không tìm thấy bài trình bày');
      return { ...deck, access_role: 'owner' };
    },
    async editable(u) {
      const r = role(u);
      if (!r) throw notFound('Không tìm thấy bài trình bày');
      if (r === 'viewer') throw forbidden('Bạn chỉ có quyền xem bài này', 'VIEW_ONLY');
      return { ...deck, access_role: r };
    },
    async restoreSnapshot(u, id, snap, expected) {
      if (expected !== deck.spec_version) throw Object.assign(new Error('conflict'), { status: 409, code: 'VERSION_CONFLICT' });
      restored.push(snap.id);
      deck.spec_version += 1;
      return { id, specVersion: deck.spec_version };
    },
  };
  const join = (s) => ({ ...s, ...users.find((u) => u.id === s.user_id), status: 'active' });
  const repos = {
    users: { findActiveByEmail: async (e) => users.find((u) => u.email === e) || null },
    shares: {
      listForPresentation: async () => shares.map(join),
      find: async (_p, uid) => (shares.find((s) => s.user_id === uid) ? join(shares.find((s) => s.user_id === uid)) : null),
      count: async () => shares.length,
      upsert: async (_p, uid, r) => {
        const s = shares.find((x) => x.user_id === uid);
        if (s) s.role = r;
        else shares.push({ user_id: uid, role: r, created_at: new Date(), updated_at: new Date() });
      },
      updateRole: async (_p, uid, r) => {
        const s = shares.find((x) => x.user_id === uid);
        if (!s) return 0;
        s.role = r;
        return 1;
      },
      remove: async (_p, uid) => {
        const i = shares.findIndex((x) => x.user_id === uid);
        if (i < 0) return 0;
        shares.splice(i, 1);
        return 1;
      },
    },
    versions: {
      ensureBaseline: async (_p, by) => {
        if (versions.some((v) => v.kind === 'baseline')) return false;
        versions.push({ id: 'base', kind: 'baseline', spec_version: deck.spec_version, created_by: by, created_at: new Date(), spec: { slides: [{}] } });
        return true;
      },
      list: async () => [...versions],
      find: async (_p, id) => versions.find((v) => v.id === id) || null,
      findBaseline: async () => versions.find((v) => v.kind === 'baseline') || null,
      createHandoff: async ({ id, expectedVersion, createdBy, max }) => {
        if (expectedVersion !== deck.spec_version) return { error: 'VERSION_CONFLICT' };
        const hs = versions.filter((v) => v.kind === 'handoff');
        if (hs.some((v) => v.spec_version === expectedVersion)) return { error: 'DUPLICATE' };
        if (hs.length >= max) return { error: 'LIMIT' };
        versions.push({ id, kind: 'handoff', spec_version: expectedVersion, created_by: createdBy, created_at: new Date() });
        return { id };
      },
      removeHandoff: async (_p, id) => {
        const i = versions.findIndex((v) => v.id === id && v.kind === 'handoff');
        if (i < 0) return 0;
        versions.splice(i, 1);
        return 1;
      },
    },
  };
  const svc = createSharingService({ repos, decks, audit: { record: async () => {} } });
  return { svc, deck, shares, versions, restored };
}

test('accessRole: chủ bài / được mời sửa / còn lại chỉ xem', () => {
  assert.equal(accessRole({ tenant_id: OWNER.id, share_role: 'editor' }, OWNER.id), 'owner');
  assert.equal(accessRole({ tenant_id: OWNER.id, share_role: 'editor' }, EDITOR.id), 'editor');
  assert.equal(accessRole({ tenant_id: OWNER.id, share_role: 'viewer' }, VIEWER.id), 'viewer');
  // Bài công khai, không được mời → chỉ xem.
  assert.equal(accessRole({ tenant_id: OWNER.id, share_role: null }, VIEWER.id), 'viewer');
});

test('mời người: chỉ chủ bài; email phải là tài khoản đang hoạt động; lần đầu chia sẻ tạo bản gốc', async () => {
  const w = world();
  await assert.rejects(w.svc.addShare(OWNER, DECK, { email: 'sua@misa.com.vn', role: 'owner' }), { code: 'INVALID_ROLE' });
  await assert.rejects(w.svc.addShare(OWNER, DECK, { email: 'khong-co@misa.com.vn', role: 'editor' }), { code: 'USER_NOT_FOUND' });
  await assert.rejects(w.svc.addShare(OWNER, DECK, { email: 'CHU@misa.com.vn', role: 'editor' }), { code: 'SELF_SHARE' });
  const r = await w.svc.addShare(OWNER, DECK, { email: ' Sua@MISA.com.vn ', role: 'editor' });
  assert.equal(r.created, true);
  assert.equal(r.share.role, 'editor');
  assert.equal(w.versions.filter((v) => v.kind === 'baseline').length, 1);
  // Mời lại cùng người = đổi quyền, không tạo bản gốc thứ 2.
  const again = await w.svc.addShare(OWNER, DECK, { email: 'sua@misa.com.vn', role: 'viewer' });
  assert.equal(again.created, false);
  assert.equal(w.versions.filter((v) => v.kind === 'baseline').length, 1);
  // Người không phải chủ bài không quản lý được danh sách chia sẻ.
  await assert.rejects(w.svc.addShare(EDITOR, DECK, { email: 'xem@misa.com.vn', role: 'viewer' }), { status: 404 });
  await assert.rejects(w.svc.listShares(EDITOR, DECK), { status: 404 });
  await assert.rejects(w.svc.removeShare(OWNER, DECK, VIEWER.id), { code: 'SHARE_NOT_FOUND' });
});

test(`handoff: chủ bài + người sửa chốt được; người xem bị chặn; tối đa ${MAX_HANDOFFS} bản, trùng phiên bản → 409`, async () => {
  const w = world();
  w.shares.push({ user_id: EDITOR.id, role: 'editor' }, { user_id: VIEWER.id, role: 'viewer' });
  await assert.rejects(w.svc.handoff(VIEWER, DECK, { specVersion: 3 }), { status: 403, code: 'VIEW_ONLY' });
  await assert.rejects(w.svc.handoff(EDITOR, DECK, {}), { code: 'VERSION_REQUIRED' });
  await assert.rejects(w.svc.handoff(EDITOR, DECK, { specVersion: 2 }), { code: 'VERSION_CONFLICT' });
  await assert.rejects(w.svc.handoff(EDITOR, DECK, { specVersion: 3, note: 'x'.repeat(201) }), { code: 'NOTE_TOO_LONG' });
  let view = await w.svc.handoff(EDITOR, DECK, { specVersion: 3, note: 'Bản duyệt nội dung' });
  assert.equal(view.handoffs, 1);
  assert.equal(view.canRestore, false);
  await assert.rejects(w.svc.handoff(OWNER, DECK, { specVersion: 3 }), { code: 'HANDOFF_EXISTS' });
  for (let i = 0; i < MAX_HANDOFFS - 1; i += 1) {
    w.deck.spec_version += 1;
    view = await w.svc.handoff(i % 2 ? OWNER : EDITOR, DECK, { specVersion: w.deck.spec_version });
  }
  assert.equal(view.handoffs, MAX_HANDOFFS);
  w.deck.spec_version += 1;
  await assert.rejects(w.svc.handoff(OWNER, DECK, { specVersion: w.deck.spec_version }), { code: 'HANDOFF_LIMIT' });
});

test('xoá handoff: chủ bài xoá mọi bản, người sửa chỉ xoá bản mình chốt; bản gốc không xoá được', async () => {
  const w = world();
  w.shares.push({ user_id: EDITOR.id, role: 'editor' });
  await w.svc.addShare(OWNER, DECK, { email: 'xem@misa.com.vn', role: 'viewer' });
  await w.svc.handoff(OWNER, DECK, { specVersion: 3 });
  const ownerVersion = w.versions.find((v) => v.kind === 'handoff').id;
  w.deck.spec_version = 4;
  const view = await w.svc.handoff(EDITOR, DECK, { specVersion: 4 });
  const editorVersion = view.items.find((v) => v.kind === 'handoff' && v.createdBy.id === EDITOR.id);
  assert.equal(editorVersion.canDelete, true);
  assert.equal(view.items.find((v) => v.id === ownerVersion).canDelete, false);
  assert.equal(view.items.find((v) => v.kind === 'baseline').canDelete, false);
  await assert.rejects(w.svc.removeVersion(EDITOR, DECK, ownerVersion), { code: 'NOT_VERSION_OWNER' });
  await assert.rejects(w.svc.removeVersion(OWNER, DECK, 'base'), { code: 'BASELINE_LOCKED' });
  await w.svc.removeVersion(EDITOR, DECK, editorVersion.id);
  await w.svc.removeVersion(OWNER, DECK, ownerVersion);
  assert.equal(w.versions.filter((v) => v.kind === 'handoff').length, 0);
});

test('khôi phục: chỉ chủ bài; không chọn bản → về bản gốc; chưa từng chia sẻ → báo cần chọn bản handoff', async () => {
  const w = world();
  w.shares.push({ user_id: EDITOR.id, role: 'editor' });
  await assert.rejects(w.svc.restore(OWNER, DECK, { specVersion: 3 }), { code: 'NO_BASELINE' });
  await w.svc.handoff(EDITOR, DECK, { specVersion: 3 });
  const hid = w.versions.find((v) => v.kind === 'handoff').id;
  await assert.rejects(w.svc.restore(EDITOR, DECK, { specVersion: 3 }), { status: 404 });
  await assert.rejects(w.svc.restore(OWNER, DECK, { versionId: 'khong-phai-uuid', specVersion: 3 }), { code: 'INVALID_ID' });
  await w.svc.restore(OWNER, DECK, { versionId: hid, specVersion: 3 });
  assert.deepEqual(w.restored, [hid]);
  await w.svc.addShare(OWNER, DECK, { email: 'xem@misa.com.vn', role: 'viewer' });
  await w.svc.restore(OWNER, DECK, { specVersion: 4 });
  assert.deepEqual(w.restored, [hid, 'base']);
  // Phiên bản cũ (có người vừa lưu) → 409, không ghi đè mù.
  await assert.rejects(w.svc.restore(OWNER, DECK, { specVersion: 4 }), { code: 'VERSION_CONFLICT' });
});
