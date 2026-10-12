// Xuất bản bài trình bày ra domain công khai (giống "Publish" của CMS) — ai có link đều xem được, kể cả ngoài MISA.
//  - Bản xuất bản là ẢNH CHỤP tĩnh: index.html + bản sao media đang dùng, nằm trong thư mục của bài
//    tenants/<t>/presentations/<id>/published/<revision>/ → xoá bài là xoá luôn; sửa bài KHÔNG đổi trang công khai
//    tới khi chủ bài bấm "Cập nhật bản xuất bản".
//  - URL: <PUBLISH_BASE_URL>/<slug>-<mã 8 ký tự>. Mã giữ nguyên qua các lần cập nhật/gỡ/xuất bản lại; đổi tên bài → slug mới,
//    link cũ chuyển hướng 301 (khoá thật là mã).
//  - Domain công khai do DevOps đặt (PUBLISH_BASE_URL); chưa đặt → tính năng tắt (503 PUBLISH_DISABLED).
import { randomBytes, randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';
import { publicSlug } from '../lib/slug.js';
import { notFound, conflict, unavailable } from '../lib/httpError.js';
import { presentationPrefix } from './storageService.js';
import { newShortCode } from './presentationService.js';

// Chỉ các loại media trình duyệt phát/hiển thị được; phần mở rộng quyết định Content-Type khi phục vụ tệp.
export const PUBLISH_MEDIA_EXT = Object.freeze({
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
});
export const MEDIA_FILE_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(webp|png|jpg|gif|mp4|webm|mov)$/;
export const REVISION_RE = /^[0-9a-f]{16}$/;

export const publishedDir = (tenantId, presentationId, revision) => `${presentationPrefix(tenantId, presentationId)}/published/${revision}`;

export function createPublicationService({ config, repos, storage, decks, audit }) {
  const { publications } = repos;
  const base = () => config.publish.baseUrl;

  function requireEnabled() {
    if (!base()) throw unavailable('Chưa cấu hình domain công khai để xuất bản (PUBLISH_BASE_URL) — liên hệ quản trị hệ thống', 'PUBLISH_DISABLED');
  }

  const urlOf = (pub) => (base() && pub ? `${base()}/${pub.slug}-${pub.code}` : null);

  function toDto(pub, deck) {
    const published = pub?.status === 'published';
    return {
      enabled: Boolean(base()),
      published,
      url: published ? urlOf(pub) : null,
      publishedAt: published ? pub.published_at : null,
      // Bài đã được sửa sau lần xuất bản → trang công khai đang hiện nội dung cũ.
      outdated: published && deck ? Number(pub.spec_version) !== Number(deck.spec_version) : false,
    };
  }

  async function status(user, id) {
    const deck = await decks.owned(user, id);
    return toDto(await publications.findForPresentation(user.id, id), deck);
  }

  async function removeRevision(tenantId, presentationId, revision) {
    if (!revision) return;
    await storage.removePrefix(publishedDir(tenantId, presentationId, revision)).catch((err) => logger.warn('publish_cleanup_failed', { presentationId, err: err.message }));
  }

  // Xuất bản lần đầu hoặc cập nhật bản xuất bản theo nội dung hiện tại.
  // Thứ tự: dựng HTML + chép media vào thư mục revision MỚI → ghi DB (khoá dòng bài, kiểm phiên bản) → xoá revision cũ.
  // Lỗi ở bất kỳ bước nào trước khi ghi DB → xoá thư mục mới; trang công khai cũ (nếu có) không bị ảnh hưởng.
  async function publish(user, id, ip, attempt = 0) {
    requireEnabled();
    const existing = await publications.findForPresentation(user.id, id);
    const revision = randomBytes(8).toString('hex');
    const nonce = randomBytes(16).toString('base64');
    const code = existing?.code || newShortCode();
    const mediaUrl = (a) => {
      const ext = PUBLISH_MEDIA_EXT[a.mime];
      return ext ? `/m/${code}/${revision}/${a.id}.${ext}` : null;
    };
    const { row, html, media } = await decks.renderForPublish(user, id, { mediaUrl, nonce });
    const dir = publishedDir(user.id, id, revision);
    let saved = null;
    try {
      for (const a of media) await storage.copy(a.storage_key, `${dir}/${a.id}.${PUBLISH_MEDIA_EXT[a.mime]}`);
      await storage.put(`${dir}/index.html`, Buffer.from(html, 'utf8'));
      const fields = { id: randomUUID(), slug: publicSlug(row.title), title: String(row.title || '').slice(0, 200), revision, nonce, specVersion: row.spec_version, publishedBy: user.id };
      saved = await publications.save(user.id, id, { ...fields, code });
      if (saved.error === 'NOT_FOUND') throw notFound('Không tìm thấy bài trình bày');
      if (saved.error === 'STALE') throw conflict('Bài vừa được sửa trong lúc xuất bản — bấm xuất bản lại để dùng nội dung mới nhất', 'PUBLISH_STALE');
      if (saved.error) throw conflict('Không tạo được mã xuất bản, vui lòng thử lại', 'PUBLISH_CODE');
    } catch (err) {
      await storage.removePrefix(dir).catch((e) => logger.warn('publish_cleanup_failed', { presentationId: id, err: e.message }));
      // HTML vừa dựng chứa mã trong URL media: mã mới trùng (DUP_CODE) hoặc lần xuất bản đầu song song đã chốt mã khác (CODE_CHANGED)
      // → dựng lại (lần sau đọc lại mã đã có / sinh mã mới).
      if (err.code === 'PUBLISH_CODE' && attempt < 4) return publish(user, id, ip, attempt + 1);
      throw err;
    }
    await removeRevision(user.id, id, saved.previousRevision);
    await audit.record({ actorId: user.id, action: saved.created ? 'presentation.publish' : 'presentation.republish', targetType: 'presentation', targetId: id, ip, meta: { code: saved.code, revision } });
    return toDto(await publications.findForPresentation(user.id, id), row);
  }

  async function unpublishRow(tenantId, presentationId) {
    const revision = await publications.unpublish(presentationId);
    await removeRevision(tenantId, presentationId, revision);
    return revision;
  }

  async function unpublish(user, id, ip) {
    const deck = await decks.owned(user, id);
    const revision = await unpublishRow(user.id, id);
    if (revision) await audit.record({ actorId: user.id, action: 'presentation.unpublish', targetType: 'presentation', targetId: id, ip });
    return toDto(await publications.findForPresentation(user.id, id), deck);
  }

  /* ---- quản trị: xem các trang đang công khai, gỡ khi vi phạm ---- */
  async function adminList({ q, page, pageSize }) {
    const { rows, total } = await publications.adminList({ q, page, pageSize });
    return {
      total,
      rows: rows.map((r) => ({ presentationId: r.presentation_id, title: r.title, url: urlOf(r), publishedAt: r.published_at, owner: { email: r.owner_email, displayName: r.owner_name, status: r.owner_status } })),
    };
  }

  async function adminUnpublish(admin, presentationId, ip) {
    const pub = await publications.findByPresentation(presentationId);
    if (!pub || pub.status !== 'published') throw notFound('Bài này không đang được xuất bản');
    await unpublishRow(pub.tenant_id, presentationId);
    await audit.record({ actorId: admin.id, action: 'admin.unpublish', targetType: 'presentation', targetId: presentationId, ip, meta: { code: pub.code } });
  }

  /* ---- trang công khai (router theo domain) ---- */
  // Trả { redirect } khi slug cũ/sai, { pub, html } khi đúng; null khi không có (404).
  async function page(slug, code) {
    const pub = await publications.findPublishedByCode(code);
    if (!pub) return null;
    if (pub.slug !== slug) return { redirect: `/${pub.slug}-${pub.code}` };
    let html;
    try {
      html = await storage.get(`${publishedDir(pub.tenant_id, pub.presentation_id, pub.revision)}/index.html`);
    } catch (err) {
      logger.warn('publish_page_missing', { code, err: err.message });
      return null;
    }
    return { pub, html };
  }

  // Đường dẫn tệp media của revision ĐANG công khai (revision cũ/đã gỡ → null).
  async function mediaPath(code, revision, file) {
    if (!REVISION_RE.test(revision) || !MEDIA_FILE_RE.test(file)) return null;
    const pub = await publications.findPublishedByCode(code);
    if (!pub || pub.revision !== revision) return null;
    return storage.pathOf(`${publishedDir(pub.tenant_id, pub.presentation_id, revision)}/${file}`);
  }

  return { status, publish, unpublish, adminList, adminUnpublish, page, mediaPath, urlOf };
}
