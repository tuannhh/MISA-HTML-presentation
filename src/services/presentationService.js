// Nghiệp vụ bài trình bày: tạo bằng AI (chạy nền), sửa có khoá lạc quan, chia sẻ, nhân bản, ảnh, xem trước, xuất HTML/PDF.
// Cách ly tenant: mọi thao tác ghi dùng *Owned(tenantId,…); đọc dùng findReadable (của tôi hoặc công khai).
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { logger } from '../lib/logger.js';
import { Semaphore } from '../lib/semaphore.js';
import { badRequest, conflict, notFound, unavailable, unprocessable, HttpError } from '../lib/httpError.js';
import { normalizeSpec, collectAssetIds, dropForeignAssets, capSlides, themeForTone } from './specService.js';
import { precheckSource, ingestSource, fitPieces } from './ingestService.js';
import { prepareMedia } from './mediaService.js';
import { TONE_THEMES } from '../../shared/deck/render.js';
import { normalizeImage, normalizeExtractedImages, previewForModel } from './imageService.js';
import { mapModelDeck } from './geminiService.js';
import { renderDeck, deckSize } from './renderService.js';
import { assetKey, presentationPrefix } from './storageService.js';
import sharp from 'sharp';

const MAX_PENDING_JOBS = 20;
// Ảnh xem trước gửi AI đủ lớn để đọc chữ trong ảnh (OCR), có trần tổng dung lượng để request không vượt ~20 MB.
const MODEL_IMAGE_PREVIEWS = 30;
const MODEL_PREVIEW_SIDE = 1280;
const MODEL_PREVIEW_BYTES = 6 * 1048576;
// "Tự động": AI tự chọn số trang theo lượng nội dung, không vượt mức này.
export const AUTO_MAX_SLIDES = 25;

// Tệp nguồn tải lên chỉ cần tới khi AI xử lý xong.
const removeUploads = (files) => Promise.all((files || []).map((f) => rm(f.path, { force: true }).catch(() => {})));

export function createPresentationService({ config, repos, storage, gemini, browser, signer, audit }) {
  const { presentations, assets } = repos;
  const genQueue = new Semaphore(config.limits.generationConcurrency);
  const thumbTimers = new Map();

  /* ---------------- tạo bằng AI ---------------- */
  // input.files: tệp multer trên đĩa — từ đây service chịu trách nhiệm xoá (lỗi kiểm tra → xoá ngay; job xong → xoá).
  async function create(user, input, ip) {
    const ratio = config.ratios.includes(input.ratio) ? input.ratio : '16:9';
    const autoSlides = String(input.slideCount ?? 'auto').trim().toLowerCase() === 'auto';
    const slideCount = autoSlides ? null : Math.min(40, Math.max(3, Number.parseInt(input.slideCount, 10) || 12));
    const tone = input.tone === 'light' ? 'light' : 'dark';
    const instructions = String(input.instructions || '').trim().slice(0, 2000);
    let src;
    try {
      src = await precheckSource({ files: input.files, url: input.url, text: input.text }, config.limits);
      if (genQueue.pending >= MAX_PENDING_JOBS) throw unavailable('Hệ thống đang xử lý nhiều yêu cầu, vui lòng thử lại sau ít phút', 'QUEUE_FULL');
    } catch (err) {
      await removeUploads(input.files);
      throw err;
    }

    const id = randomUUID();
    const firstName = src.files?.length === 1 ? src.files[0].name.replace(/\.[a-z0-9]+$/i, '') : '';
    const title = String(input.title || '').trim().slice(0, 200) || firstName || 'Bài trình bày mới';
    try {
      await presentations.createForTenant(user.id, { id, title, ratio, sourceKind: src.sourceKind, sourceLabel: src.sourceLabel, instructions, status: 'generating' });
      await audit.record({ actorId: user.id, action: 'presentation.create', targetType: 'presentation', targetId: id, ip, meta: { source: src.sourceKind, files: src.files?.length || 0, ratio, slideCount: slideCount ?? 'auto', tone } });
    } catch (err) {
      await removeUploads(input.files);
      throw err;
    }

    // Chạy nền; client theo dõi trạng thái bằng GET /api/presentations/:id.
    const job = { url: input.url, text: input.text, files: src.files, title: input.title, ratio, slideCount, autoSlides, tone, instructions, sourceLabel: src.sourceLabel };
    genQueue
      .run(() => generate(user.id, id, job))
      .catch((err) => logger.error('generation_unhandled', { id, err }))
      .finally(() => removeUploads(src.files));
    return { id, status: 'generating' };
  }

  async function generate(tenantId, id, input) {
    const started = Date.now();
    try {
      const source = await ingestSource(input, { limits: config.limits, googleApiKey: config.google.apiKey });
      if (!source.pieces.length && !source.media.length && !source.images.length) throw unprocessable('Không tìm thấy nội dung trong tài liệu', 'SOURCE_EMPTY');
      const images = await normalizeExtractedImages(source.images, { max: config.limits.maxImagesPerDeck });
      const assetIds = [];
      for (const img of images) {
        const assetId = randomUUID();
        const key = assetKey(tenantId, id, assetId);
        await storage.put(key, img.buffer);
        await assets.create(tenantId, { id: assetId, presentationId: id, kind: 'image', mime: img.mime, bytes: img.bytes, width: img.width, height: img.height, storageKey: key, originalName: img.name });
        assetIds.push(assetId);
      }
      const modelImages = [];
      let previewBytes = 0;
      for (const [i, img] of images.entries()) {
        let preview = null;
        if (i < MODEL_IMAGE_PREVIEWS && previewBytes < MODEL_PREVIEW_BYTES) {
          preview = await previewForModel(img.buffer, { side: MODEL_PREVIEW_SIDE });
          previewBytes += preview.length;
        }
        modelImages.push({ hint: img.hint, width: img.width, height: img.height, preview });
      }
      // PDF/ghi âm: đính kèm trực tiếp hoặc chuyển thành văn bản trước (tư liệu lớn) — xem mediaService.
      const media = await prepareMedia(source.media, { gemini });
      let raw;
      try {
        const text = fitPieces([...source.pieces, ...media.pieces], config.limits.maxSourceChars);
        raw = await gemini.generateDeck({
          text, media: media.direct, images: modelImages, slideCount: input.slideCount, autoSlides: input.autoSlides, maxSlides: AUTO_MAX_SLIDES,
          tone: input.tone, instructions: input.instructions, ratio: input.ratio, sourceLabel: input.sourceLabel,
        });
      } finally {
        await media.cleanup();
      }
      const { spec } = normalizeSpec(mapModelDeck(raw, assetIds));
      if (!spec.slides.length) throw unprocessable('AI không tạo được trang nào từ tài liệu này', 'AI_EMPTY');
      capSlides(spec, input.autoSlides ? AUTO_MAX_SLIDES : input.slideCount);
      spec.theme = themeForTone(spec.theme, input.tone, TONE_THEMES);
      dropForeignAssets(spec, new Set(assetIds));
      await presentations.setGenerationResult(tenantId, id, { status: 'ready', spec, title: input.title ? null : spec.title });
      logger.info('generation_ready', { id, slides: spec.slides.length, images: assetIds.length, ms: Date.now() - started });
      scheduleThumbnail(tenantId, id, 0);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Đã xảy ra lỗi khi tạo bài trình bày. Vui lòng thử lại.';
      if (!(err instanceof HttpError)) logger.error('generation_failed', { id, err });
      else logger.warn('generation_failed', { id, code: err.code });
      await presentations.setGenerationResult(tenantId, id, { status: 'failed', errorMessage: msg }).catch(() => {});
    }
  }

  /* ---------------- đọc ---------------- */
  function toDto(row, viewerId) {
    return {
      id: row.id,
      title: row.title,
      ratio: row.ratio,
      visibility: row.visibility,
      status: row.status,
      sourceKind: row.source_kind,
      sourceLabel: row.source_kind === 'text' ? null : row.source_label,
      specVersion: row.spec_version,
      slideCount: row.slide_count,
      thumbnailUrl: row.thumbnail_asset_id ? `/api/assets/${row.thumbnail_asset_id}?v=${new Date(row.updated_at).getTime()}` : null,
      errorMessage: row.error_message,
      isOwner: row.tenant_id === viewerId,
      authorName: row.author_name ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      publishedAt: row.published_at,
    };
  }

  async function list(user, { scope, q, page, pageSize }) {
    const limit = pageSize;
    const offset = (page - 1) * pageSize;
    const query = q ? String(q).trim().slice(0, 100) : '';
    const res = scope === 'public' ? await presentations.listPublic({ q: query, limit, offset }) : await presentations.listOwned(user.id, { q: query, limit, offset });
    return { rows: res.rows.map((r) => toDto(r, user.id)), total: res.total };
  }

  async function readable(user, id) {
    const row = await presentations.findReadable(user.id, id);
    if (!row) throw notFound('Không tìm thấy bài trình bày');
    return row;
  }

  async function owned(user, id) {
    const row = await presentations.findOwned(user.id, id);
    if (!row) throw notFound('Không tìm thấy bài trình bày');
    return row;
  }

  async function get(user, id) {
    const row = await readable(user, id);
    const dto = toDto(row, user.id);
    dto.spec = row.spec;
    if (dto.isOwner) {
      const own = await presentations.findOwned(user.id, id);
      dto.instructions = own?.instructions || '';
      const imgs = await assets.listOwnedForPresentation(user.id, id);
      dto.assets = imgs.map((a) => ({ id: a.id, url: signer.url(a.id), width: a.width, height: a.height, name: a.original_name }));
    }
    return dto;
  }

  /* ---------------- sửa ---------------- */
  async function update(user, id, body, ip) {
    const row = await owned(user, id);
    const fields = {};
    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (!t || t.length > 200) throw badRequest('Tên bài trình bày từ 1 đến 200 ký tự', 'INVALID_TITLE');
      fields.title = t;
    }
    if (body.ratio !== undefined) {
      if (!config.ratios.includes(body.ratio)) throw badRequest('Tỷ lệ khung hình không hợp lệ', 'INVALID_RATIO');
      fields.ratio = body.ratio;
    }
    if (body.visibility !== undefined) {
      if (!['private', 'public'].includes(body.visibility)) throw badRequest('Chế độ chia sẻ không hợp lệ', 'INVALID_VISIBILITY');
      if (body.visibility === 'public' && row.status !== 'ready') throw conflict('Chỉ công khai được bài trình bày đã tạo xong', 'NOT_READY');
      fields.visibility = body.visibility;
    }
    let expected;
    if (body.spec !== undefined) {
      if (row.status !== 'ready') throw conflict('Bài trình bày chưa tạo xong, chưa thể chỉnh sửa', 'NOT_READY');
      if (!Number.isInteger(body.specVersion)) throw badRequest('Thiếu specVersion', 'VERSION_REQUIRED');
      const { spec, errors } = normalizeSpec(body.spec, { strict: true });
      if (errors.length) throw unprocessable('Nội dung chưa hợp lệ', 'INVALID_SPEC', errors);
      const allowed = new Set((await assets.listOwnedForPresentation(user.id, id)).map((a) => a.id));
      for (const aid of collectAssetIds(spec)) if (!allowed.has(aid)) throw unprocessable('Ảnh không thuộc bài trình bày này', 'FOREIGN_ASSET');
      fields.spec = spec;
      expected = body.specVersion;
    }
    const affected = await presentations.updateOwned(user.id, id, fields, expected);
    if (!affected) throw conflict('Bài trình bày đã được sửa ở nơi khác. Tải lại để lấy bản mới nhất.', 'VERSION_CONFLICT');
    if (fields.visibility && fields.visibility !== row.visibility) {
      await audit.record({ actorId: user.id, action: 'presentation.visibility', targetType: 'presentation', targetId: id, ip, meta: { to: fields.visibility } });
    }
    if (fields.spec || fields.ratio) scheduleThumbnail(user.id, id);
    return get(user, id);
  }

  async function remove(user, id, ip) {
    await owned(user, id);
    const affected = await presentations.deleteOwned(user.id, id);
    if (!affected) throw notFound('Không tìm thấy bài trình bày');
    await storage.removePrefix(presentationPrefix(user.id, id)).catch((err) => logger.warn('storage_cleanup_failed', { id, err }));
    await audit.record({ actorId: user.id, action: 'presentation.delete', targetType: 'presentation', targetId: id, ip });
  }

  // Nhân bản: được phép với bài của mình hoặc bài công khai của người khác → bản sao luôn private, thuộc người nhân bản.
  async function duplicate(user, id, ip) {
    const src = await readable(user, id);
    if (src.status !== 'ready') throw conflict('Chỉ nhân bản được bài trình bày đã tạo xong', 'NOT_READY');
    const newId = randomUUID();
    const map = new Map();
    const srcAssets = await assets.listForPresentation(id, 'image');
    await presentations.createForTenant(user.id, { id: newId, title: `${src.title} (bản sao)`.slice(0, 200), ratio: src.ratio, sourceKind: 'copy', sourceLabel: src.title, status: 'ready', spec: src.spec });
    for (const a of srcAssets) {
      const nid = randomUUID();
      const key = assetKey(user.id, newId, nid);
      await storage.put(key, await storage.get(a.storage_key));
      await assets.create(user.id, { id: nid, presentationId: newId, kind: 'image', mime: a.mime, bytes: a.bytes, width: a.width, height: a.height, storageKey: key, originalName: a.original_name });
      map.set(a.id, nid);
    }
    const spec = structuredClone(src.spec);
    for (const s of spec.slides) {
      if (s.image?.asset) s.image.asset = map.get(s.image.asset) || null;
      for (const im of s.images || []) if (im.asset) im.asset = map.get(im.asset) || null;
    }
    await presentations.updateOwned(user.id, newId, { spec });
    await audit.record({ actorId: user.id, action: 'presentation.duplicate', targetType: 'presentation', targetId: newId, ip, meta: { from: id } });
    scheduleThumbnail(user.id, newId, 0);
    return get(user, newId);
  }

  /* ---------------- ảnh ---------------- */
  async function addAsset(user, id, file) {
    const row = await owned(user, id);
    if (!file) throw badRequest('Chưa chọn ảnh', 'FILE_REQUIRED');
    if ((await assets.countForPresentation(row.id)) >= config.limits.maxImagesPerDeck + 40) throw unprocessable('Bài trình bày đã có quá nhiều ảnh', 'TOO_MANY_ASSETS');
    const img = await normalizeImage(file.buffer);
    const assetId = randomUUID();
    const key = assetKey(user.id, id, assetId);
    await storage.put(key, img.buffer);
    await assets.create(user.id, { id: assetId, presentationId: id, kind: 'image', mime: img.mime, bytes: img.bytes, width: img.width, height: img.height, storageKey: key, originalName: String(file.originalname || '').slice(0, 255) });
    return { id: assetId, url: signer.url(assetId), width: img.width, height: img.height, name: file.originalname || null };
  }

  // Ảnh: cho phép nếu chữ ký hợp lệ (khung xem trước sandbox) hoặc người dùng có quyền đọc.
  async function readAsset(user, assetId, { exp, sig }) {
    let row = null;
    if (sig && signer.verify(assetId, exp, sig)) row = await assets.findById(assetId);
    else if (user) row = await assets.findReadable(user.id, assetId);
    if (!row) throw notFound('Không tìm thấy ảnh');
    return { buffer: await storage.get(row.storage_key), mime: row.mime };
  }

  /* ---------------- render / xuất ---------------- */
  async function inlineAssetResolver(presentationId) {
    const map = new Map();
    for (const a of await assets.listForPresentation(presentationId, 'image')) {
      map.set(a.id, `data:${a.mime};base64,${(await storage.get(a.storage_key)).toString('base64')}`);
    }
    return (aid) => map.get(aid) || null;
  }

  async function preview(user, id, nonce) {
    const row = await readable(user, id);
    if (row.status !== 'ready') throw conflict('Bài trình bày chưa sẵn sàng', 'NOT_READY');
    const known = new Set((await assets.listForPresentation(id, 'image')).map((a) => a.id));
    return renderDeck(row.spec, { ratio: row.ratio, mode: 'present', nonce, assetUrl: (aid) => (known.has(aid) ? signer.url(aid) : null) });
  }

  async function exportHtml(user, id, ip) {
    const row = await readable(user, id);
    if (row.status !== 'ready') throw conflict('Bài trình bày chưa sẵn sàng', 'NOT_READY');
    const html = renderDeck(row.spec, { ratio: row.ratio, mode: 'present', embedFont: true, assetUrl: await inlineAssetResolver(id) });
    await audit.record({ actorId: user.id, action: 'presentation.export_html', targetType: 'presentation', targetId: id, ip });
    return { html, title: row.title };
  }

  async function exportPdf(user, id, ip) {
    const row = await readable(user, id);
    if (row.status !== 'ready') throw conflict('Bài trình bày chưa sẵn sàng', 'NOT_READY');
    const html = renderDeck(row.spec, { ratio: row.ratio, mode: 'print', embedFont: true, assetUrl: await inlineAssetResolver(id) });
    const pdf = await browser.pdf(html, deckSize(row.ratio));
    await audit.record({ actorId: user.id, action: 'presentation.export_pdf', targetType: 'presentation', targetId: id, ip });
    return { pdf, title: row.title };
  }

  /* ---------------- thumbnail (nền, gộp nhiều lần lưu liên tiếp) ---------------- */
  function scheduleThumbnail(tenantId, id, delayMs = 4000) {
    clearTimeout(thumbTimers.get(id));
    const t = setTimeout(() => {
      thumbTimers.delete(id);
      makeThumbnail(tenantId, id).catch((err) => logger.warn('thumbnail_failed', { id, err: err.message }));
    }, delayMs);
    t.unref();
    thumbTimers.set(id, t);
  }

  async function makeThumbnail(tenantId, id) {
    const row = await presentations.findOwned(tenantId, id);
    if (!row || row.status !== 'ready' || !row.spec?.slides?.length) return;
    const one = { ...row.spec, slides: [row.spec.slides[0]] };
    const html = renderDeck(one, { ratio: row.ratio, mode: 'present', embedFont: true, assetUrl: await inlineAssetResolver(id) });
    const { width, height } = deckSize(row.ratio);
    const [png] = await browser.screenshotSlides(html, { width, height, indices: [0] });
    const webp = await sharp(png).resize({ width: 960 }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
    const assetId = randomUUID();
    const key = assetKey(tenantId, id, assetId);
    await storage.put(key, webp.data);
    await assets.create(tenantId, { id: assetId, presentationId: id, kind: 'thumbnail', mime: 'image/webp', bytes: webp.data.length, width: webp.info.width, height: webp.info.height, storageKey: key });
    const old = row.thumbnail_asset_id;
    await presentations.setThumbnail(tenantId, id, assetId);
    if (old) {
      const oldRow = await assets.findById(old);
      await assets.deleteOwned(tenantId, old);
      if (oldRow) await storage.remove(oldRow.storage_key).catch(() => {});
    }
  }

  async function recoverStale() {
    const n = await presentations.failStaleGenerating();
    if (n) logger.warn('stale_generations_failed', { count: n });
  }

  return { create, list, get, update, remove, duplicate, addAsset, readAsset, preview, exportHtml, exportPdf, recoverStale, queueStats: () => ({ pending: genQueue.pending }) };
}
