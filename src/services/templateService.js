// Mẫu thiết kế / bộ nhận diện thương hiệu dùng lại giữa các bài:
//  - Lưu: thiết kế hiện tại của 1 bài (tông màu, nền, phông, logo, ảnh thương hiệu: bìa, nền trang, mở đầu phần, trang kết,
//    dải đầu/chân trang) → mẫu riêng. Ảnh được SAO CHÉP sang kho của mẫu (xoá bài không làm hỏng mẫu).
//  - Áp: sao chép ảnh của mẫu sang asset của bài (bài luôn chỉ tham chiếu asset của chính nó — giữ nguyên mô hình cách ly
//    tenant và dropForeignAssets) → trả thiết kế đã đổi mã để giao diện ghép vào bản nháp; người dùng bấm Lưu như thường.
//  - Chia sẻ: riêng tư (chỉ chủ) / công khai (mọi người dùng áp được — ví dụ bộ nhận diện công ty, chiến dịch). Chỉ chủ sửa/xoá.
import { randomUUID } from 'node:crypto';
import { badRequest, notFound, conflict, unprocessable } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';
import { normalizeDesign, collectAssetIds, remapAssetIds } from './specService.js';
import { BRAND_SLOTS } from '../../shared/deck/render.js';

const MAX_TEMPLATES_PER_USER = 50;
const MAX_BRAND_PER_DECK = 120;
const MEDIA_STATUSES = new Set(['outline', 'ready']);
const IMAGE_KINDS = new Set(['image', 'poster', 'logo', 'brand']);
const NAME_MAX = 120;
const templatePrefix = (tenantId, templateId) => `tenants/${tenantId}/templates/${templateId}`;
const templateKey = (tenantId, templateId, assetId) => `${templatePrefix(tenantId, templateId)}/${assetId}.webp`;
const assetUrl = (id) => `/api/templates/assets/${id}`;

// Ảnh trong thiết kế (logo + bộ nhận diện) — dùng lại collectAssetIds của spec (bài không trang).
const designAssetIds = (design) => [...collectAssetIds({ slides: [], logo: design.logo, brand: design.brand })];

export function createTemplateService({ repos, storage, signer, audit }) {
  const { templates, assets, presentations } = repos;

  const dto = (row, files, userId) => ({
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    isOwner: row.tenant_id === userId,
    ownerName: row.tenant_id === userId ? null : row.owner_name || null,
    design: row.design,
    // Ảnh của mẫu để giao diện xem trước (mã asset của mẫu → URL; chỉ đọc được khi có quyền xem mẫu).
    assets: Object.fromEntries(files.map((a) => [a.id, { url: assetUrl(a.id), width: a.width, height: a.height, kind: a.kind }])),
    updatedAt: row.updated_at,
  });

  function cleanName(v) {
    const name = String(v ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length > NAME_MAX) throw badRequest(`Tên mẫu từ 1 đến ${NAME_MAX} ký tự`, 'INVALID_NAME');
    return name;
  }

  async function list(user) {
    const rows = await templates.listReadable(user.id);
    const files = await templates.listAssetsFor(rows.map((r) => r.id));
    const byTpl = new Map();
    for (const a of files) byTpl.set(a.template_id, [...(byTpl.get(a.template_id) || []), a]);
    return rows.map((r) => dto(r, byTpl.get(r.id) || [], user.id));
  }

  // Lưu thiết kế (đang chỉnh trên bài presentationId) thành mẫu mới.
  async function create(user, body, ip) {
    const name = cleanName(body.name);
    if (typeof body.presentationId !== 'string') throw badRequest('Thiếu bài trình bày nguồn', 'PRESENTATION_REQUIRED');
    const deck = await presentations.findOwned(user.id, body.presentationId);
    if (!deck) throw notFound('Không tìm thấy bài trình bày');
    const { design, errors } = normalizeDesign(body.design, { strict: true });
    if (errors.length) throw unprocessable('Thiết kế chưa hợp lệ', 'INVALID_DESIGN', errors);
    if ((await templates.countOwned(user.id)) >= MAX_TEMPLATES_PER_USER) throw unprocessable(`Mỗi người tối đa ${MAX_TEMPLATES_PER_USER} mẫu`, 'TOO_MANY_TEMPLATES');
    // Ảnh trong thiết kế phải là ảnh của chính bài này (không lấy được ảnh của người khác qua mã asset).
    const owned = new Map((await assets.listOwnedForPresentation(user.id, deck.id)).map((a) => [a.id, a]));
    const ids = designAssetIds(design);
    for (const aid of ids) {
      const a = owned.get(aid);
      if (!a) throw unprocessable('Ảnh trong thiết kế không thuộc bài trình bày này', 'FOREIGN_ASSET');
      if (!IMAGE_KINDS.has(a.kind)) throw unprocessable('Thiết kế chỉ nhận tệp ảnh', 'INVALID_MEDIA');
    }
    const id = randomUUID();
    const map = new Map(ids.map((aid) => [aid, randomUUID()]));
    const saved = remapAssetIds({ slides: [], logo: design.logo, brand: design.brand }, map);
    const tplDesign = { ...design, logo: saved.logo, brand: saved.brand };
    await templates.create(user.id, { id, name, design: tplDesign });
    try {
      for (const aid of ids) {
        const a = owned.get(aid);
        const nid = map.get(aid);
        const key = templateKey(user.id, id, nid);
        await storage.copy(a.storage_key, key);
        await templates.createAsset(user.id, { id: nid, templateId: id, kind: a.kind === 'logo' ? 'logo' : a.kind === 'brand' ? 'brand' : 'image', mime: a.mime, bytes: a.bytes, width: a.width, height: a.height, storageKey: key, originalName: a.original_name });
      }
    } catch (err) {
      // Lỗi giữa chừng → không để lại mẫu thiếu ảnh.
      await templates.deleteOwned(user.id, id).catch(() => {});
      await storage.removePrefix(templatePrefix(user.id, id)).catch(() => {});
      throw err;
    }
    await audit.record({ actorId: user.id, action: 'template.create', targetType: 'template', targetId: id, ip, meta: { from: deck.id, images: ids.length } });
    const row = await templates.findOwned(user.id, id);
    return dto(row, await templates.listAssets(id), user.id);
  }

  async function update(user, id, body, ip) {
    const row = await templates.findOwned(user.id, id);
    if (!row) throw notFound('Không tìm thấy mẫu');
    const fields = {};
    if (body.name !== undefined) fields.name = cleanName(body.name);
    if (body.visibility !== undefined) {
      if (!['private', 'public'].includes(body.visibility)) throw badRequest('Chế độ chia sẻ không hợp lệ', 'INVALID_VISIBILITY');
      fields.visibility = body.visibility;
    }
    if (!(await templates.updateOwned(user.id, id, fields))) throw notFound('Không tìm thấy mẫu');
    if (fields.visibility && fields.visibility !== row.visibility) {
      await audit.record({ actorId: user.id, action: 'template.visibility', targetType: 'template', targetId: id, ip, meta: { to: fields.visibility } });
    }
    const next = await templates.findOwned(user.id, id);
    return dto(next, await templates.listAssets(id), user.id);
  }

  async function remove(user, id, ip) {
    if (!(await templates.deleteOwned(user.id, id))) throw notFound('Không tìm thấy mẫu');
    await storage.removePrefix(templatePrefix(user.id, id)).catch((err) => logger.warn('storage_cleanup_failed', { id, err }));
    await audit.record({ actorId: user.id, action: 'template.delete', targetType: 'template', targetId: id, ip });
  }

  async function readAsset(user, assetId) {
    const row = await templates.findReadableAsset(user.id, assetId);
    if (!row) throw notFound('Không tìm thấy tệp');
    return { buffer: await storage.get(row.storage_key), mime: row.mime };
  }

  // Áp mẫu vào bài: sao chép ảnh của mẫu thành asset của bài → thiết kế đã đổi mã (giao diện ghép vào bản nháp rồi Lưu).
  async function apply(user, presentationId, templateId) {
    const deck = await presentations.findOwned(user.id, presentationId);
    if (!deck) throw notFound('Không tìm thấy bài trình bày');
    if (!MEDIA_STATUSES.has(deck.status)) throw conflict('Chưa thể áp mẫu khi bài đang được AI xử lý', 'NOT_READY');
    const tpl = await templates.findReadable(user.id, templateId);
    if (!tpl) throw notFound('Không tìm thấy mẫu');
    const files = await templates.listAssets(tpl.id);
    if ((await assets.countForPresentation(deck.id, 'brand')) + files.length > MAX_BRAND_PER_DECK) {
      throw unprocessable('Bài trình bày đã áp quá nhiều mẫu — hãy tạo bài mới hoặc dùng lại ảnh đã có', 'TOO_MANY_ASSETS');
    }
    const { design } = normalizeDesign(tpl.design);
    const map = new Map();
    const out = [];
    for (const f of files) {
      const nid = randomUUID();
      // Ảnh của mẫu nằm ở kho của người tạo mẫu; bản sao thuộc bài (và tenant) của người áp.
      const key = `tenants/${user.id}/presentations/${deck.id}/${nid}.webp`;
      await storage.copy(f.storage_key, key);
      const kind = f.kind === 'logo' ? 'logo' : 'brand';
      await assets.create(user.id, { id: nid, presentationId: deck.id, kind, mime: f.mime, bytes: f.bytes, width: f.width, height: f.height, storageKey: key, originalName: f.original_name });
      map.set(f.id, nid);
      out.push({ id: nid, kind, url: signer.url(nid), width: f.width, height: f.height, name: f.original_name, mime: f.mime, bytes: f.bytes });
    }
    const moved = remapAssetIds({ slides: [], logo: design.logo, brand: design.brand }, map);
    // Mã ảnh trong mẫu mà không có tệp (mẫu hỏng) → bỏ ô đó thay vì trỏ sai.
    if (moved.brand) for (const k of BRAND_SLOTS) if (moved.brand[k] && !out.some((a) => a.id === moved.brand[k])) moved.brand[k] = null;
    return { design: { ...design, logo: moved.logo, brand: moved.brand }, assets: out, name: tpl.name };
  }

  return { list, create, update, remove, readAsset, apply };
}
