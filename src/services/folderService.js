// Thư mục sắp xếp bài trình bày: mỗi người có cây thư mục riêng, lồng nhau tối đa MAX_DEPTH cấp.
//  - Chỉ chứa bài CỦA CHÍNH người dùng (bài được chia sẻ/công khai không xếp vào thư mục của người khác).
//  - Xoá thư mục không xoá bài: thư mục con + bài chuyển lên thư mục cha.
//  - Đổi cây (tạo/chuyển) kiểm tra trên cây đã khoá trong transaction: không vòng lặp, không quá sâu, không quá nhiều thư mục.
import { randomUUID } from 'node:crypto';
import { badRequest, notFound, unprocessable } from '../lib/httpError.js';
import { isUuid } from '../repositories/tenantScope.js';

export const MAX_DEPTH = 5;
export const MAX_FOLDERS = 300;
export const MAX_MOVE = 100;
const NAME_MAX = 120;

// Cấp của thư mục (gốc = 1) và chiều cao cây con (chỉ nó = 1) trên danh sách phẳng.
function levelOf(rows, id) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  let n = 0;
  for (let cur = byId.get(id); cur && n <= rows.length; cur = byId.get(cur.parent_id)) n++;
  return n;
}
function heightOf(rows, id) {
  const kids = rows.filter((r) => r.parent_id === id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => heightOf(rows, k.id))) : 0);
}
function isInside(rows, id, ancestorId) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (let cur = byId.get(id); cur; cur = byId.get(cur.parent_id)) if (cur.id === ancestorId) return true;
  return false;
}

export function createFolderService({ repos, audit }) {
  const { folders } = repos;

  function cleanName(v) {
    const name = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > NAME_MAX) throw badRequest(`Tên thư mục từ 1 đến ${NAME_MAX} ký tự`, 'INVALID_NAME');
    return name;
  }
  function cleanParent(v) {
    if (v === null || v === undefined || v === '') return null;
    if (!isUuid(String(v))) throw badRequest('Thư mục cha không hợp lệ', 'INVALID_PARENT');
    return String(v).toLowerCase();
  }
  const dto = (r, counts) => ({ id: r.id, parentId: r.parent_id, name: r.name, decks: counts?.get(r.id) || 0, createdAt: r.created_at, updatedAt: r.updated_at });

  async function list(user) {
    const [rows, counts] = await Promise.all([folders.allOwned(user.id), folders.deckCounts(user.id)]);
    return rows.map((r) => dto(r, counts));
  }

  async function create(user, body, ip) {
    const name = cleanName(body.name);
    const parentId = cleanParent(body.parentId);
    const id = randomUUID();
    await folders.create(user.id, { id, name, parentId }, (rows) => {
      if (rows.length >= MAX_FOLDERS) throw unprocessable(`Mỗi người tối đa ${MAX_FOLDERS} thư mục`, 'TOO_MANY_FOLDERS');
      if (parentId && !rows.some((r) => r.id === parentId)) throw notFound('Không tìm thấy thư mục cha', 'PARENT_NOT_FOUND');
      if (parentId && levelOf(rows, parentId) + 1 > MAX_DEPTH) throw unprocessable(`Thư mục lồng tối đa ${MAX_DEPTH} cấp`, 'TOO_DEEP');
    });
    await audit.record({ actorId: user.id, action: 'folder.create', targetType: 'folder', targetId: id, ip, meta: { parentId } });
    return dto(await folders.findOwned(user.id, id));
  }

  // Đổi tên và/hoặc chuyển sang thư mục cha khác (parentId null = lên gốc).
  async function update(user, id, body, ip) {
    const fields = {};
    if (body.name !== undefined) fields.name = cleanName(body.name);
    if (body.parentId !== undefined) fields.parentId = cleanParent(body.parentId);
    const n = await folders.update(user.id, id, fields, (rows) => {
      const to = fields.parentId;
      if (!to) return;
      if (!rows.some((r) => r.id === to)) throw notFound('Không tìm thấy thư mục đích', 'PARENT_NOT_FOUND');
      if (to === id || isInside(rows, to, id)) throw unprocessable('Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó', 'FOLDER_CYCLE');
      if (levelOf(rows, to) + heightOf(rows, id) > MAX_DEPTH) throw unprocessable(`Thư mục lồng tối đa ${MAX_DEPTH} cấp`, 'TOO_DEEP');
    });
    if (!n) throw notFound('Không tìm thấy thư mục');
    if (fields.parentId !== undefined) await audit.record({ actorId: user.id, action: 'folder.move', targetType: 'folder', targetId: id, ip, meta: { parentId: fields.parentId } });
    return dto(await folders.findOwned(user.id, id));
  }

  async function remove(user, id, ip) {
    const res = await folders.remove(user.id, id);
    if (!res) throw notFound('Không tìm thấy thư mục');
    await audit.record({ actorId: user.id, action: 'folder.delete', targetType: 'folder', targetId: id, ip, meta: res });
    return res;
  }

  // Chuyển bài của mình vào thư mục (folderId null = bỏ khỏi thư mục). Bài không phải của mình bị bỏ qua (không lộ tồn tại).
  async function moveDecks(user, body, ip) {
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map((x) => String(x).toLowerCase()))];
    if (!ids.length || ids.length > MAX_MOVE || !ids.every(isUuid)) throw badRequest(`Chọn từ 1 đến ${MAX_MOVE} bài hợp lệ`, 'INVALID_IDS');
    const folderId = cleanParent(body.folderId);
    const moved = await folders.moveDecks(user.id, ids, folderId);
    if (moved < 0) throw notFound('Không tìm thấy thư mục đích', 'FOLDER_NOT_FOUND');
    await audit.record({ actorId: user.id, action: 'folder.move_decks', targetType: 'folder', targetId: folderId, ip, meta: { count: moved } });
    return { moved, folderId };
  }

  // Lọc danh sách "Bài của tôi": 'all' (mặc định) | 'root' (chưa xếp) | mã thư mục của mình (không phải → 404).
  async function resolveFilter(user, v) {
    if (v === undefined || v === null || v === '' || v === 'all') return { mode: 'all' };
    if (v === 'root') return { mode: 'root' };
    if (!isUuid(String(v)) || !(await folders.findOwned(user.id, String(v).toLowerCase()))) throw notFound('Không tìm thấy thư mục');
    return { mode: 'folder', id: String(v).toLowerCase() };
  }

  return { list, create, update, remove, moveDecks, resolveFilter };
}
