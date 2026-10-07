// Chia sẻ theo người + phiên bản handoff.
//  - Chủ bài mời người dùng khác (theo email) với quyền 'viewer' (chỉ xem) hoặc 'editor' (chỉnh sửa); đổi quyền, gỡ.
//  - Lần đầu chia sẻ (mời người / bật công khai) → chụp BẢN GỐC (presentation_versions kind='baseline', 1 bản/bài).
//  - Chủ bài và người sửa "handoff" bản đang lưu mà họ thấy ổn — tối đa MAX_HANDOFFS bản; đủ thì phải xoá bớt.
//  - Chỉ chủ bài khôi phục: chọn 1 bản handoff, không chọn → về bản gốc.
// Quyền trên bài lấy từ presentationService (owned / editable) — service này không tự đọc bảng presentations.
import { randomUUID } from 'node:crypto';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../lib/httpError.js';
import { isUuid } from '../repositories/tenantScope.js';

export const MAX_HANDOFFS = 5;
export const MAX_SHARES_PER_DECK = 100;
export const SHARE_ROLES = Object.freeze(['viewer', 'editor']);
const NOTE_MAX = 200;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const shareDto = (r) => ({ userId: r.user_id, email: r.email, displayName: r.display_name, role: r.role, active: r.status === 'active', createdAt: r.created_at, updatedAt: r.updated_at });

function cleanRole(role) {
  if (!SHARE_ROLES.includes(role)) throw badRequest('Quyền không hợp lệ (chỉ xem hoặc chỉnh sửa)', 'INVALID_ROLE');
  return role;
}

export function createSharingService({ repos, decks, audit }) {
  const { shares, versions, users } = repos;

  /* ---------------- mời người ---------------- */
  async function listShares(user, id) {
    const deck = await decks.owned(user, id);
    return { shares: (await shares.listForPresentation(deck.id)).map(shareDto), visibility: deck.visibility, max: MAX_SHARES_PER_DECK };
  }

  async function addShare(user, id, body, ip) {
    const deck = await decks.owned(user, id);
    if (deck.status !== 'ready') throw conflict('Chỉ chia sẻ được bài trình bày đã dựng xong', 'NOT_READY');
    const role = cleanRole(body.role);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 190) throw badRequest('Email không hợp lệ', 'INVALID_EMAIL');
    if (email === String(user.email).toLowerCase()) throw badRequest('Bạn đã là chủ bài này', 'SELF_SHARE');
    const target = await users.findActiveByEmail(email);
    if (!target) throw notFound('Không tìm thấy người dùng đang hoạt động với email này', 'USER_NOT_FOUND');
    const existing = await shares.find(deck.id, target.id);
    if (!existing && (await shares.count(deck.id)) >= MAX_SHARES_PER_DECK) {
      throw unprocessable(`Mỗi bài chia sẻ tối đa ${MAX_SHARES_PER_DECK} người`, 'TOO_MANY_SHARES');
    }
    await shares.upsert(deck.id, target.id, role, user.id);
    // Lần đầu chia sẻ → bản gốc để khôi phục (gọi lại không ghi đè).
    await versions.ensureBaseline(deck.id, user.id);
    await audit.record({ actorId: user.id, action: existing ? 'presentation.share_update' : 'presentation.share_add', targetType: 'presentation', targetId: deck.id, ip, meta: { user: target.id, role } });
    return { share: shareDto(await shares.find(deck.id, target.id)), created: !existing };
  }

  async function updateShare(user, id, userId, body, ip) {
    const deck = await decks.owned(user, id);
    const role = cleanRole(body.role);
    if (!(await shares.updateRole(deck.id, userId, role))) throw notFound('Người này chưa được chia sẻ bài', 'SHARE_NOT_FOUND');
    await audit.record({ actorId: user.id, action: 'presentation.share_update', targetType: 'presentation', targetId: deck.id, ip, meta: { user: userId, role } });
    return { share: shareDto(await shares.find(deck.id, userId)) };
  }

  async function removeShare(user, id, userId, ip) {
    const deck = await decks.owned(user, id);
    if (!(await shares.remove(deck.id, userId))) throw notFound('Người này chưa được chia sẻ bài', 'SHARE_NOT_FOUND');
    await audit.record({ actorId: user.id, action: 'presentation.share_remove', targetType: 'presentation', targetId: deck.id, ip, meta: { user: userId } });
  }

  /* ---------------- phiên bản: bản gốc + handoff ---------------- */
  async function versionsView(user, deck) {
    const isOwner = deck.access_role === 'owner';
    const rows = await versions.list(deck.id);
    const items = rows.map((v) => ({
      id: v.id,
      kind: v.kind,
      title: v.title,
      ratio: v.ratio,
      specVersion: v.spec_version,
      slideCount: v.slide_count,
      note: v.note || '',
      createdBy: v.created_by ? { id: v.created_by, name: v.creator_name || 'Người dùng đã xoá' } : null,
      createdAt: v.created_at,
      isCurrent: v.spec_version === deck.spec_version,
      // Bản gốc là mốc cố định; handoff: chủ bài xoá mọi bản, người sửa chỉ xoá bản mình chốt.
      canDelete: v.kind === 'handoff' && (isOwner || v.created_by === user.id),
    }));
    const handoffs = items.filter((v) => v.kind === 'handoff').length;
    return { items, handoffs, max: MAX_HANDOFFS, canRestore: isOwner, specVersion: deck.spec_version };
  }

  async function listVersions(user, id) {
    return versionsView(user, await decks.editable(user, id));
  }

  async function handoff(user, id, body, ip) {
    const deck = await decks.editable(user, id);
    if (!Number.isInteger(body.specVersion)) throw badRequest('Thiếu specVersion', 'VERSION_REQUIRED');
    const note = String(body.note ?? '').trim();
    if (note.length > NOTE_MAX) throw badRequest(`Ghi chú tối đa ${NOTE_MAX} ký tự`, 'NOTE_TOO_LONG');
    const res = await versions.createHandoff({ id: randomUUID(), presentationId: deck.id, expectedVersion: body.specVersion, note, createdBy: user.id, max: MAX_HANDOFFS });
    if (res.error === 'NOT_FOUND') throw notFound('Không tìm thấy bài trình bày');
    if (res.error === 'VERSION_CONFLICT') throw conflict('Bài vừa được lưu thay đổi mới. Tải lại để handoff đúng bản đang có.', 'VERSION_CONFLICT');
    if (res.error === 'DUPLICATE') throw conflict('Phiên bản này đã được handoff rồi', 'HANDOFF_EXISTS');
    if (res.error === 'LIMIT') throw conflict(`Đã đủ ${MAX_HANDOFFS} bản handoff. Xoá bớt một bản trước khi handoff bản mới.`, 'HANDOFF_LIMIT');
    await audit.record({ actorId: user.id, action: 'presentation.handoff', targetType: 'presentation', targetId: deck.id, ip, meta: { version: res.id, specVersion: body.specVersion } });
    return versionsView(user, deck);
  }

  async function removeVersion(user, id, versionId, ip) {
    const deck = await decks.editable(user, id);
    const v = await versions.find(deck.id, versionId);
    if (!v) throw notFound('Không tìm thấy phiên bản');
    if (v.kind === 'baseline') throw badRequest('Không thể xoá bản gốc — đây là mốc khôi phục mặc định', 'BASELINE_LOCKED');
    if (deck.access_role !== 'owner' && v.created_by !== user.id) throw forbidden('Chỉ chủ bài hoặc người đã handoff bản này được xoá', 'NOT_VERSION_OWNER');
    if (!(await versions.removeHandoff(deck.id, versionId))) throw notFound('Không tìm thấy phiên bản');
    await audit.record({ actorId: user.id, action: 'presentation.handoff_remove', targetType: 'presentation', targetId: deck.id, ip, meta: { version: versionId } });
    return versionsView(user, deck);
  }

  // versionId bỏ trống → khôi phục về bản gốc (lần đầu chia sẻ).
  async function restore(user, id, body, ip) {
    const deck = await decks.owned(user, id);
    const versionId = body.versionId ?? null;
    if (versionId !== null && !isUuid(versionId)) throw badRequest('Mã phiên bản không hợp lệ', 'INVALID_ID');
    const snap = versionId ? await versions.find(deck.id, versionId) : await versions.findBaseline(deck.id);
    if (!snap) {
      if (versionId) throw notFound('Không tìm thấy phiên bản');
      throw conflict('Bài chưa có bản gốc (chưa từng chia sẻ). Hãy chọn một bản handoff để khôi phục.', 'NO_BASELINE');
    }
    return decks.restoreSnapshot(user, deck.id, snap, body.specVersion, ip);
  }

  return { listShares, addShare, updateShare, removeShare, listVersions, handoff, removeVersion, restore };
}
