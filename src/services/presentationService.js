// Nghiệp vụ bài trình bày — quy trình 2 bước:
//  1. Tạo: AI đọc tư liệu (chạy nền) → DÀN Ý từng trang (status outlining → outline).
//  2. Người dùng duyệt/sửa dàn ý, gắn media (ảnh, video, YouTube), chọn thiết kế (tông màu, nền, phông, logo)
//     → "Dựng bài": AI dựng giao diện theo đúng dàn ý (generating → ready; lỗi → quay lại outline, giữ công sức).
// Sau đó: sửa có khoá lạc quan, chia sẻ, nhân bản, media, xem trước, xuất HTML/PDF.
// Cách ly tenant: mọi thao tác ghi dùng *Owned(tenantId,…); đọc dùng findReadable (của tôi hoặc công khai).
import { randomUUID } from 'node:crypto';
import { open, readFile, rm } from 'node:fs/promises';
import { logger } from '../lib/logger.js';
import { Semaphore } from '../lib/semaphore.js';
import { badRequest, conflict, notFound, unavailable, unprocessable, HttpError } from '../lib/httpError.js';
import { sniffVideo, VIDEO_MIME } from '../lib/fileType.js';
import { normalizeSpec, collectAssetIds, dropForeignAssets, remapAssetIds, themeForTone } from './specService.js';
import { normalizeOutline, capOutline, composeDeckFromOutline, keepPhotoImages } from './outlineService.js';
import { precheckSource, ingestSource, fitPieces } from './ingestService.js';
import { prepareMedia } from './mediaService.js';
import { TONE_THEMES } from '../../shared/deck/render.js';
import { THEME_PRESETS, CUSTOM_THEME, normHex } from '../../shared/deck/palette.js';
import { DEFAULT_FONT } from '../../shared/deck/fonts.js';
import { normalizeImage, normalizeExtractedImages, previewForModel, imageTraits, looksLikePhoto, looksLikeGraphic } from './imageService.js';
import { mapModelDeck } from './geminiService.js';
import { artDirect } from '../../shared/deck/variants.js';
import { removeBackground } from './cutoutService.js';
import { resolveYouTube } from './youtubeService.js';
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
const MAX_LOGOS_PER_DECK = 30;
const MAX_POSTERS_PER_DECK = 60;
// Trạng thái cho phép thêm media: đang duyệt dàn ý hoặc đã dựng xong.
const MEDIA_STATUSES = new Set(['outline', 'ready']);
const IMAGE_KINDS = new Set(['image', 'poster', 'logo']);

// Tệp tải lên (multer ghi ra đĩa) chỉ cần tới khi xử lý xong.
const removeUploads = (files) => Promise.all((files || []).filter(Boolean).map((f) => rm(f.path, { force: true }).catch(() => {})));

async function readHead(filePath, n = 64) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

// Lựa chọn tông màu lúc tạo: tự động (AI chọn theo tông sáng/tối) | mẫu có sẵn | tuỳ chỉnh 2 màu.
export function parseThemeChoice(input) {
  const tone = input.tone === 'light' ? 'light' : 'dark';
  const theme = String(input.theme || 'auto').trim();
  if (theme === 'auto' || !theme) return { tone, theme: 'auto', palette: null };
  if (theme === CUSTOM_THEME) {
    const primary = normHex(input.primary);
    if (!primary) throw badRequest('Màu chính phải có dạng #RRGGBB', 'INVALID_COLOR');
    const secondary = input.secondary ? normHex(input.secondary) : primary;
    if (!secondary) throw badRequest('Màu phụ phải có dạng #RRGGBB', 'INVALID_COLOR');
    return { tone, theme, palette: { tone, primary, secondary } };
  }
  const preset = THEME_PRESETS[theme];
  if (!preset) throw badRequest('Tông màu không hợp lệ', 'INVALID_THEME');
  return { tone: preset.tone, theme, palette: null };
}

export function createPresentationService({ config, repos, storage, gemini, browser, signer, audit }) {
  const { presentations, assets } = repos;
  const genQueue = new Semaphore(config.limits.generationConcurrency);
  // Tách nền (đặc biệt mô hình AI) tốn CPU → xử lý lần lượt.
  const cutoutQueue = new Semaphore(1);
  const thumbTimers = new Map();

  /* ---------------- bước 1: tạo dàn ý bằng AI ---------------- */
  // input.files: tệp multer trên đĩa — từ đây service chịu trách nhiệm xoá (lỗi kiểm tra → xoá ngay; job xong → xoá).
  async function create(user, input, ip) {
    const ratio = config.ratios.includes(input.ratio) ? input.ratio : '16:9';
    const autoSlides = String(input.slideCount ?? 'auto').trim().toLowerCase() === 'auto';
    const slideCount = autoSlides ? null : Math.min(40, Math.max(3, Number.parseInt(input.slideCount, 10) || 12));
    const instructions = String(input.instructions || '').trim().slice(0, 2000);
    let src;
    let choice;
    try {
      choice = parseThemeChoice(input);
      src = await precheckSource({ files: input.files, url: input.url, text: input.text }, config.limits);
      if (genQueue.pending >= MAX_PENDING_JOBS) throw unavailable('Hệ thống đang xử lý nhiều yêu cầu, vui lòng thử lại sau ít phút', 'QUEUE_FULL');
    } catch (err) {
      await removeUploads(input.files);
      throw err;
    }
    const { tone } = choice;

    const id = randomUUID();
    const firstName = src.files?.length === 1 ? src.files[0].name.replace(/\.[a-z0-9]+$/i, '') : '';
    const title = String(input.title || '').trim().slice(0, 200) || firstName || 'Bài trình bày mới';
    try {
      await presentations.createForTenant(user.id, { id, title, ratio, sourceKind: src.sourceKind, sourceLabel: src.sourceLabel, instructions, status: 'outlining' });
      await audit.record({ actorId: user.id, action: 'presentation.create', targetType: 'presentation', targetId: id, ip, meta: { source: src.sourceKind, files: src.files?.length || 0, ratio, slideCount: slideCount ?? 'auto', tone, theme: choice.theme } });
    } catch (err) {
      await removeUploads(input.files);
      throw err;
    }

    // Chạy nền; client theo dõi trạng thái bằng GET /api/presentations/:id.
    const job = { url: input.url, text: input.text, files: src.files, title: input.title, ratio, slideCount, autoSlides, tone, choice, instructions, sourceLabel: src.sourceLabel };
    genQueue
      .run(() => generateOutline(user.id, id, job))
      .catch((err) => logger.error('outline_unhandled', { id, err }))
      .finally(() => removeUploads(src.files));
    return { id, status: 'outlining' };
  }

  async function generateOutline(tenantId, id, input) {
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
      const traits = [];
      let previewBytes = 0;
      for (const [i, img] of images.entries()) {
        let preview = null;
        if (i < MODEL_IMAGE_PREVIEWS && previewBytes < MODEL_PREVIEW_BYTES) {
          preview = await previewForModel(img.buffer, { side: MODEL_PREVIEW_SIDE });
          previewBytes += preview.length;
        }
        modelImages.push({ hint: img.hint, width: img.width, height: img.height, preview });
        traits.push(await imageTraits(img.buffer).catch(() => null));
      }
      // PDF/ghi âm: đính kèm trực tiếp hoặc chuyển thành văn bản trước (tư liệu lớn) — xem mediaService.
      const media = await prepareMedia(source.media, { gemini });
      let raw;
      try {
        const text = fitPieces([...source.pieces, ...media.pieces], config.limits.maxSourceChars);
        raw = await gemini.generateOutline({
          text, media: media.direct, images: modelImages, slideCount: input.slideCount, autoSlides: input.autoSlides, maxSlides: AUTO_MAX_SLIDES,
          tone: input.tone, instructions: input.instructions, ratio: input.ratio, sourceLabel: input.sourceLabel,
        });
      } finally {
        await media.cleanup();
      }
      const mapRef = (ref) => {
        const n = Number(String(ref || '').replace(/^IMG/i, ''));
        return Number.isInteger(n) && n >= 1 ? assetIds[n - 1] || null : null;
      };
      const { choice } = input;
      const theme = choice.theme === 'auto' ? themeForTone(raw?.theme, input.tone, TONE_THEMES) : choice.theme;
      const draft = {
        title: raw?.title,
        footer: raw?.footer,
        design: { theme, palette: choice.palette, background: 'network', font: { heading: DEFAULT_FONT, body: DEFAULT_FONT }, logo: null },
        slides: (Array.isArray(raw?.slides) ? raw.slides : []).map((s) => ({
          layout: s?.layout,
          title: s?.title,
          subtitle: s?.subtitle,
          points: s?.points,
          notes: s?.notes,
          images: (Array.isArray(s?.images) ? s.images : []).map((im) => ({ asset: mapRef(im?.ref), caption: im?.caption })).filter((im) => im.asset),
        })),
      };
      // Chỉ ảnh chụp thật được tự gắn vào trang: AI (đã xem ảnh) phân loại là chính; ảnh AI không được xem → chỉ nhận khi
      // chỉ số ảnh rất rõ là ảnh chụp; AI nói "photo" nhưng chỉ số rõ là đồ hoạ → bỏ (chốt chặn an toàn).
      const kindOf = new Map((Array.isArray(raw?.imageKinds) ? raw.imageKinds : []).map((k) => [mapRef(k?.ref), k?.kind]));
      const photo = new Set(
        assetIds.filter((aid, i) => (modelImages[i].preview ? kindOf.get(aid) === 'photo' && !looksLikeGraphic(traits[i]) : looksLikePhoto(traits[i]))),
      );
      const droppedImages = keepPhotoImages(draft.slides, (aid) => photo.has(aid));
      const { outline } = normalizeOutline(draft, { options: { tone: input.tone, autoSlides: input.autoSlides, slideCount: input.slideCount } });
      if (!outline.slides.length) throw unprocessable('AI không lập được dàn ý từ tài liệu này', 'AI_EMPTY');
      capOutline(outline, input.autoSlides ? AUTO_MAX_SLIDES : input.slideCount);
      await presentations.setOutlineResult(tenantId, id, { outline, title: input.title ? null : outline.title });
      const kinds = {};
      for (const k of kindOf.values()) if (k) kinds[k] = (kinds[k] || 0) + 1;
      logger.info('outline_ready', { id, slides: outline.slides.length, images: assetIds.length, photos: photo.size, droppedImages, kinds, sourceType: raw?.sourceType, ms: Date.now() - started });
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Đã xảy ra lỗi khi lập dàn ý. Vui lòng thử lại.';
      if (!(err instanceof HttpError)) logger.error('outline_failed', { id, err });
      else logger.warn('outline_failed', { id, code: err.code });
      await presentations.setGenerationResult(tenantId, id, { status: 'failed', errorMessage: msg }).catch(() => {});
    }
  }

  /* ---------------- bước 2: duyệt dàn ý → dựng bài ---------------- */
  // Mỗi tham chiếu media phải đúng loại: ô ảnh nhận ảnh (không nhận video), ô video nhận tệp video.
  function assertMedia(doc, rows) {
    const kind = new Map(rows.map((a) => [a.id, a.kind]));
    for (const aid of collectAssetIds(doc)) if (!kind.has(aid)) throw unprocessable('Tệp media không thuộc bài trình bày này', 'FOREIGN_ASSET');
    const img = (aid) => !aid || IMAGE_KINDS.has(kind.get(aid));
    for (const s of doc.slides) {
      if (!img(s.image?.asset) || !(s.images || []).every((im) => img(im.asset))) throw unprocessable('Ô ảnh chỉ nhận tệp ảnh', 'INVALID_MEDIA');
      if (s.video && (!img(s.video.poster) || (s.video.provider === 'file' && kind.get(s.video.asset) !== 'video'))) throw unprocessable('Video không hợp lệ', 'INVALID_MEDIA');
    }
    const lg = doc.logo || doc.design?.logo;
    if (lg && (!img(lg.asset) || !img(lg.cutout))) throw unprocessable('Logo phải là tệp ảnh', 'INVALID_MEDIA');
  }

  async function saveOutline(user, id, body) {
    const row = await owned(user, id);
    if (row.status !== 'outline') throw conflict('Bài trình bày không ở bước duyệt dàn ý', 'NOT_OUTLINE');
    if (!Number.isInteger(body.outlineVersion)) throw badRequest('Thiếu outlineVersion', 'VERSION_REQUIRED');
    // Tuỳ chọn tạo bài (tông, số trang) do server giữ, người dùng không sửa qua API.
    const { outline, errors } = normalizeOutline(body.outline, { strict: true, options: row.outline?.options });
    if (errors.length) throw unprocessable('Dàn ý chưa hợp lệ', 'INVALID_OUTLINE', errors);
    assertMedia(outline, await assets.listOwnedForPresentation(user.id, id));
    const affected = await presentations.saveOutlineOwned(user.id, id, { outline, title: outline.title }, body.outlineVersion);
    if (!affected) throw conflict('Dàn ý đã được sửa ở nơi khác. Tải lại để lấy bản mới nhất.', 'VERSION_CONFLICT');
    return get(user, id);
  }

  async function build(user, id, body, ip) {
    let expected = body.outlineVersion;
    if (body.outline !== undefined) expected = (await saveOutline(user, id, body)).outlineVersion;
    else {
      const row = await owned(user, id);
      if (row.status !== 'outline') throw conflict('Bài trình bày không ở bước duyệt dàn ý', 'NOT_OUTLINE');
      if (!Number.isInteger(expected)) throw badRequest('Thiếu outlineVersion', 'VERSION_REQUIRED');
    }
    if (genQueue.pending >= MAX_PENDING_JOBS) throw unavailable('Hệ thống đang xử lý nhiều yêu cầu, vui lòng thử lại sau ít phút', 'QUEUE_FULL');
    const affected = await presentations.startBuildOwned(user.id, id, expected);
    if (!affected) throw conflict('Dàn ý đã thay đổi hoặc bài đang được dựng. Tải lại để xem trạng thái mới nhất.', 'VERSION_CONFLICT');
    await audit.record({ actorId: user.id, action: 'presentation.build', targetType: 'presentation', targetId: id, ip });
    genQueue.run(() => buildDeck(user.id, id)).catch((err) => logger.error('build_unhandled', { id, err }));
    return { id, status: 'generating' };
  }

  async function buildDeck(tenantId, id) {
    const started = Date.now();
    try {
      const row = await presentations.findOwned(tenantId, id);
      if (!row?.outline) throw unprocessable('Không tìm thấy dàn ý', 'NOT_OUTLINE');
      const raw = await gemini.designDeck({ outline: row.outline, ratio: row.ratio, instructions: row.instructions });
      const { spec } = normalizeSpec(composeDeckFromOutline(row.outline, mapModelDeck(raw, []).slides));
      if (!spec.slides.length) throw unprocessable('AI không dựng được trang nào', 'AI_EMPTY');
      // Phong cách + biến thể từng trang chọn ngầm theo nội dung; hạt giống ngẫu nhiên → mỗi lần dựng một diện mạo khác.
      const [rw, rh] = String(row.ratio || '16:9').split(':').map(Number);
      artDirect(spec, { seed: randomUUID(), ratio: rw / rh || 16 / 9 });
      dropForeignAssets(spec, new Set((await assets.listMediaForPresentation(id)).map((a) => a.id)));
      await presentations.setGenerationResult(tenantId, id, { status: 'ready', spec, title: null });
      logger.info('build_ready', { id, slides: spec.slides.length, style: spec.style, ms: Date.now() - started });
      scheduleThumbnail(tenantId, id, 0);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Đã xảy ra lỗi khi dựng bài trình bày. Vui lòng bấm "Dựng bài" để thử lại.';
      if (!(err instanceof HttpError)) logger.error('build_failed', { id, err });
      else logger.warn('build_failed', { id, code: err.code });
      await presentations.buildFailed(tenantId, id, msg).catch(() => {});
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
      outlineVersion: row.outline_version ?? 0,
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

  const assetDto = (a) => ({ id: a.id, kind: a.kind, url: signer.url(a.id), width: a.width, height: a.height, name: a.original_name, mime: a.mime, bytes: a.bytes });

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
      dto.outline = own?.outline || null;
      dto.assets = (await assets.listOwnedForPresentation(user.id, id)).map(assetDto);
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
      assertMedia(spec, await assets.listOwnedForPresentation(user.id, id));
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
    const isOwner = src.tenant_id === user.id;
    const own = isOwner ? await presentations.findOwned(user.id, id) : null;
    const newId = randomUUID();
    // Media được sao chép sang mã mới: đổi mã trong spec/dàn ý trước khi ghi bản sao.
    const srcAssets = await assets.listMediaForPresentation(id);
    const map = new Map(srcAssets.map((a) => [a.id, randomUUID()]));
    const spec = remapAssetIds(structuredClone(src.spec), map);
    const outline = own?.outline ? remapAssetIds(structuredClone(own.outline), map) : null;
    await presentations.createCopy(user.id, { id: newId, title: `${src.title} (bản sao)`.slice(0, 200), ratio: src.ratio, sourceLabel: src.title, spec, outline });
    for (const a of srcAssets) {
      const nid = map.get(a.id);
      const key = assetKey(user.id, newId, nid, a.storage_key.split('.').pop());
      await storage.copy(a.storage_key, key);
      await assets.create(user.id, { id: nid, presentationId: newId, kind: a.kind, mime: a.mime, bytes: a.bytes, width: a.width, height: a.height, storageKey: key, originalName: a.original_name });
    }
    await audit.record({ actorId: user.id, action: 'presentation.duplicate', targetType: 'presentation', targetId: newId, ip, meta: { from: id } });
    scheduleThumbnail(user.id, newId, 0);
    return get(user, newId);
  }

  /* ---------------- media: ảnh, logo, video, YouTube ---------------- */
  async function mediaTarget(user, id) {
    const row = await owned(user, id);
    if (!MEDIA_STATUSES.has(row.status)) throw conflict('Chưa thể thêm media khi bài đang được AI xử lý', 'NOT_READY');
    return row;
  }

  async function storeImage(user, id, kind, img, name) {
    const assetId = randomUUID();
    const key = assetKey(user.id, id, assetId);
    await storage.put(key, img.buffer);
    const row = { id: assetId, kind, mime: img.mime, bytes: img.bytes, width: img.width, height: img.height, original_name: name || null };
    await assets.create(user.id, { id: assetId, presentationId: id, kind, mime: img.mime, bytes: img.bytes, width: img.width, height: img.height, storageKey: key, originalName: name || null });
    return assetDto(row);
  }

  async function addAsset(user, id, file) {
    await mediaTarget(user, id);
    if (!file) throw badRequest('Chưa chọn ảnh', 'FILE_REQUIRED');
    if ((await assets.countForPresentation(id, 'image')) >= config.limits.maxImagesPerDeck + 40) throw unprocessable('Bài trình bày đã có quá nhiều ảnh', 'TOO_MANY_ASSETS');
    const img = await normalizeImage(file.buffer);
    return storeImage(user, id, 'image', img, String(file.originalname || '').normalize('NFC').slice(0, 255));
  }

  // Logo: giữ nền trong suốt (WebP có alpha), chất lượng cao hơn ảnh thường để chữ trong logo sắc nét.
  async function addLogo(user, id, file) {
    await mediaTarget(user, id);
    if (!file) throw badRequest('Chưa chọn logo', 'FILE_REQUIRED');
    if ((await assets.countForPresentation(id, 'logo')) >= MAX_LOGOS_PER_DECK) throw unprocessable('Bài trình bày đã có quá nhiều logo', 'TOO_MANY_ASSETS');
    const img = await normalizeImage(file.buffer, { maxSide: 1200, quality: 92 });
    return storeImage(user, id, 'logo', img, String(file.originalname || '').normalize('NFC').slice(0, 255));
  }

  async function cutoutLogo(user, id, assetId, { mode } = {}) {
    await mediaTarget(user, id);
    const src = await assets.findOwnedInPresentation(user.id, id, assetId);
    if (!src || src.kind !== 'logo') throw notFound('Không tìm thấy logo');
    if (cutoutQueue.pending >= 5) throw unavailable('Hệ thống đang tách nền nhiều logo, vui lòng thử lại sau ít phút', 'QUEUE_FULL');
    const buffer = await storage.get(src.storage_key);
    const res = await cutoutQueue.run(() => removeBackground(buffer, { mode: ['auto', 'color', 'ai'].includes(mode) ? mode : 'auto' }));
    // Ảnh đã trong suốt sẵn / không nhận ra nền → dùng chính logo gốc.
    if (res.method === 'none') return { asset: assetDto(src), method: res.method, note: res.note || '' };
    const asset = await storeImage(user, id, 'logo', { buffer: res.buffer, width: res.width, height: res.height, mime: 'image/webp', bytes: res.buffer.length }, src.original_name ? `tach-nen-${src.original_name}`.slice(0, 255) : null);
    return { asset, method: res.method, note: res.note || '' };
  }

  // Video tải lên: multer đã ghi ra đĩa; poster (ảnh bìa, chụp ở trình duyệt) tuỳ chọn.
  async function addVideo(user, id, file, posterFile) {
    try {
      await mediaTarget(user, id);
      if (!file) throw badRequest('Chưa chọn video', 'FILE_REQUIRED');
      if ((await assets.countForPresentation(id, 'video')) >= config.limits.maxVideosPerDeck) throw unprocessable(`Mỗi bài trình bày tối đa ${config.limits.maxVideosPerDeck} video`, 'TOO_MANY_ASSETS');
      const type = sniffVideo(await readHead(file.path));
      if (!type) throw unprocessable('Chỉ hỗ trợ video MP4, MOV hoặc WebM', 'INVALID_VIDEO');
      const name = String(file.originalname || '').normalize('NFC').slice(0, 255);
      let poster = null;
      if (posterFile) {
        const img = await normalizeImage(await readFile(posterFile.path), { maxSide: 1280 }).catch(() => null);
        if (img) poster = await storeImage(user, id, 'poster', img, null);
      }
      const assetId = randomUUID();
      const key = assetKey(user.id, id, assetId, type);
      await storage.putFile(key, file.path);
      await assets.create(user.id, { id: assetId, presentationId: id, kind: 'video', mime: VIDEO_MIME[type], bytes: file.size, width: null, height: null, storageKey: key, originalName: name });
      const asset = assetDto({ id: assetId, kind: 'video', mime: VIDEO_MIME[type], bytes: file.size, width: null, height: null, original_name: name });
      return { video: { provider: 'file', asset: assetId, poster: poster?.id || null, title: name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200) }, assets: [asset, poster].filter(Boolean) };
    } finally {
      await removeUploads([file, posterFile]);
    }
  }

  async function addYouTube(user, id, { url }) {
    await mediaTarget(user, id);
    if ((await assets.countForPresentation(id, 'poster')) >= MAX_POSTERS_PER_DECK) throw unprocessable('Bài trình bày đã có quá nhiều video', 'TOO_MANY_ASSETS');
    const yt = await resolveYouTube(url);
    const poster = yt.thumb ? await storeImage(user, id, 'poster', yt.thumb, `youtube-${yt.id}`) : null;
    return { video: { provider: 'youtube', id: yt.id, poster: poster?.id || null, title: yt.title }, assets: [poster].filter(Boolean) };
  }

  // Tệp media: cho phép nếu chữ ký hợp lệ (khung xem trước sandbox) hoặc người dùng có quyền đọc.
  // Video trả đường dẫn tệp để route phát theo Range (tua được, không nạp cả tệp vào RAM).
  async function readAsset(user, assetId, { exp, sig }) {
    let row = null;
    if (sig && signer.verify(assetId, exp, sig)) row = await assets.findById(assetId);
    else if (user) row = await assets.findReadable(user.id, assetId);
    if (!row) throw notFound('Không tìm thấy tệp');
    if (row.kind === 'video') return { path: storage.pathOf(row.storage_key), mime: row.mime };
    return { buffer: await storage.get(row.storage_key), mime: row.mime };
  }

  /* ---------------- render / xuất ---------------- */
  // Nạp media của bài: preview dùng URL ký; xuất/PDF/thumbnail nhúng ảnh (data URI); xuất HTML nhúng cả video (nếu vừa trần).
  async function resolvers(presentationId, { inline = false, embedVideos = false } = {}) {
    const rows = await assets.listMediaForPresentation(presentationId);
    const meta = new Map(rows.map((a) => [a.id, a]));
    const urls = new Map();
    const embeds = [];
    const embedIds = new Map();
    let videoBytes = 0;
    const videoCap = config.limits.exportVideoMb * 1048576;
    for (const a of rows) {
      if (a.kind === 'video') {
        if (embedVideos && videoBytes + Number(a.bytes) <= videoCap) {
          videoBytes += Number(a.bytes);
          const eid = `vid-${a.id}`;
          embeds.push({ id: eid, mime: a.mime, b64: (await storage.get(a.storage_key)).toString('base64') });
          embedIds.set(a.id, eid);
        } else if (!inline) urls.set(a.id, signer.url(a.id));
        continue;
      }
      urls.set(a.id, inline ? `data:${a.mime};base64,${(await storage.get(a.storage_key)).toString('base64')}` : signer.url(a.id));
    }
    return {
      assetUrl: (aid) => urls.get(aid) || null,
      assetMeta: (aid) => (meta.has(aid) ? { width: meta.get(aid).width, height: meta.get(aid).height } : null),
      videoEmbed: (aid) => embedIds.get(aid) || null,
      embeds,
    };
  }

  async function preview(user, id, nonce) {
    const row = await readable(user, id);
    if (row.status !== 'ready') throw conflict('Bài trình bày chưa sẵn sàng', 'NOT_READY');
    return renderDeck(row.spec, { ratio: row.ratio, mode: 'present', nonce, ...(await resolvers(id)) });
  }

  async function exportHtml(user, id, ip) {
    const row = await readable(user, id);
    if (row.status !== 'ready') throw conflict('Bài trình bày chưa sẵn sàng', 'NOT_READY');
    const html = renderDeck(row.spec, { ratio: row.ratio, mode: 'present', embedFont: true, ...(await resolvers(id, { inline: true, embedVideos: true })) });
    await audit.record({ actorId: user.id, action: 'presentation.export_html', targetType: 'presentation', targetId: id, ip });
    return { html, title: row.title };
  }

  async function exportPdf(user, id, ip) {
    const row = await readable(user, id);
    if (row.status !== 'ready') throw conflict('Bài trình bày chưa sẵn sàng', 'NOT_READY');
    const html = renderDeck(row.spec, { ratio: row.ratio, mode: 'print', embedFont: true, ...(await resolvers(id, { inline: true })) });
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
    const html = renderDeck(one, { ratio: row.ratio, mode: 'present', embedFont: true, ...(await resolvers(id, { inline: true })) });
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
    if (n) logger.warn('stale_generations_recovered', { count: n });
  }

  return {
    create, list, get, update, remove, duplicate, saveOutline, build,
    addAsset, addLogo, cutoutLogo, addVideo, addYouTube, readAsset,
    preview, exportHtml, exportPdf, recoverStale, queueStats: () => ({ pending: genQueue.pending }),
  };
}
