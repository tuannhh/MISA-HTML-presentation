// /api/presentations — danh sách (của tôi / công khai), tạo dàn ý bằng AI, lưu dàn ý, dựng bài, xem, sửa, xoá, nhân bản,
// media (ảnh, logo + tách nền, video, YouTube), xem trước, xuất.
import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { deckCsp } from '../middleware/security.js';
import { ok, pick, paging, uuidParam } from '../lib/validate.js';
import { tooLarge } from '../lib/httpError.js';

// Tên file tải về: bỏ ký tự cấm, kèm filename* UTF-8 để giữ tiếng Việt.
function disposition(title, ext) {
  const base = String(title || 'bai-trinh-bay').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'bai-trinh-bay';
  const ascii = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(base)}.${ext}`;
}

export function presentationRoutes({ service, config, limits }) {
  const r = Router();
  // Tệp nguồn: ghi thẳng ra đĩa (tổng tới MAX_UPLOAD_MB, không giữ trong RAM); tên tệp do server sinh (UUID).
  const maxSourceBytes = config.limits.maxUploadMb * 1048576;
  // Trình duyệt gửi tên tệp dạng UTF-8 thô; multer mặc định giải mã latin1 → "Báo cáo.pptx" thành "BÃ¡o cÃ¡o.pptx".
  const UTF8_NAMES = { defParamCharset: 'utf8' };
  const upload = multer({
    ...UTF8_NAMES,
    storage: multer.diskStorage({ destination: config.storage.uploadDir, filename: (_req, _file, cb) => cb(null, randomUUID()) }),
    limits: { fileSize: maxSourceBytes, files: config.limits.maxUploadFiles + config.limits.maxCreateMedia + config.limits.maxVideosPerDeck, fields: 20, fieldSize: config.limits.maxTextChars * 4 },
  }).fields([
    { name: 'files', maxCount: config.limits.maxUploadFiles },
    { name: 'file', maxCount: 1 },
    // Ảnh/video gửi kèm (bắt buộc đưa vào bài) + ảnh bìa video do trình duyệt chụp ("poster-<vị trí>.jpg").
    { name: 'media', maxCount: config.limits.maxCreateMedia },
    { name: 'posters', maxCount: config.limits.maxVideosPerDeck },
  ]);
  // Chặn sớm theo Content-Length (trước khi nhận dữ liệu) — multer chỉ giới hạn được từng tệp, không giới hạn tổng.
  // Phần dư 4 MB cho ranh giới multipart + các trường văn bản.
  const capSourceBody = (req, _res, next) => {
    const len = Number(req.headers['content-length']);
    if (Number.isFinite(len) && len > maxSourceBytes + 4 * 1048576) return next(tooLarge(`Tổng dung lượng tệp tối đa ${config.limits.maxUploadMb} MB`, 'UPLOAD_TOO_LARGE'));
    return next();
  };
  const imageUpload = multer({ ...UTF8_NAMES, storage: multer.memoryStorage(), limits: { fileSize: config.limits.maxImageUploadMb * 1048576, files: 1, fields: 5 } });
  // Video gắn slide: ghi ra đĩa (tới MAX_VIDEO_MB), kèm ảnh bìa chụp ở trình duyệt (tuỳ chọn).
  const maxVideoBytes = config.limits.maxVideoMb * 1048576;
  const videoUpload = multer({
    ...UTF8_NAMES,
    storage: multer.diskStorage({ destination: config.storage.uploadDir, filename: (_req, _file, cb) => cb(null, randomUUID()) }),
    limits: { fileSize: maxVideoBytes, files: 2, fields: 5 },
  }).fields([{ name: 'file', maxCount: 1 }, { name: 'poster', maxCount: 1 }]);
  const capVideoBody = (req, _res, next) => {
    const len = Number(req.headers['content-length']);
    if (Number.isFinite(len) && len > maxVideoBytes + 20 * 1048576) return next(tooLarge(`Video tối đa ${config.limits.maxVideoMb} MB`, 'UPLOAD_TOO_LARGE'));
    return next();
  };
  const auth = requireAuth();
  const id = uuidParam('id');

  r.get('/', auth, async (req, res) => {
    const { page, pageSize } = paging(req.query, { maxPageSize: 48, defaultPageSize: 24 });
    const scope = req.query.scope === 'public' ? 'public' : 'mine';
    const { rows, total } = await service.list(req.user, { scope, q: req.query.q, page, pageSize });
    ok(res, rows, { page, pageSize, total, hasNext: page * pageSize < total });
  });

  r.post('/', auth, limits.generate, capSourceBody, upload, async (req, res) => {
    const body = pick(req.body, ['url', 'text', 'ratio', 'slideCount', 'tone', 'theme', 'primary', 'secondary', 'instructions', 'title']);
    // 'file' (1 tệp) giữ cho client cũ; giao diện mới gửi 'files' (nhiều tệp).
    const files = [...(req.files?.files || []), ...(req.files?.file || [])];
    const result = await service.create(req.user, { ...body, files, media: req.files?.media || [], posters: req.files?.posters || [] }, req.ip);
    ok(res, result, null, 202);
  });

  r.get('/:id', auth, id, async (req, res) => ok(res, await service.get(req.user, req.params.id)));

  r.patch('/:id', auth, id, async (req, res) => {
    const body = pick(req.body, ['title', 'ratio', 'visibility', 'spec', 'specVersion']);
    ok(res, await service.update(req.user, req.params.id, body, req.ip));
  });

  r.delete('/:id', auth, id, async (req, res) => {
    await service.remove(req.user, req.params.id, req.ip);
    ok(res, { deleted: true });
  });

  r.post('/:id/duplicate', auth, id, async (req, res) => ok(res, await service.duplicate(req.user, req.params.id, req.ip), null, 201));

  // Bước duyệt dàn ý: lưu (khoá lạc quan outlineVersion) và dựng bài (có thể gửi kèm dàn ý để lưu + dựng 1 lần).
  r.put('/:id/outline', auth, id, async (req, res) => {
    const body = pick(req.body, ['outline', 'outlineVersion']);
    ok(res, await service.saveOutline(req.user, req.params.id, body));
  });

  r.post('/:id/build', auth, id, limits.build, async (req, res) => {
    const body = pick(req.body, ['outline', 'outlineVersion']);
    ok(res, await service.build(req.user, req.params.id, body, req.ip), null, 202);
  });

  r.post('/:id/assets', auth, id, imageUpload.single('file'), async (req, res) => ok(res, await service.addAsset(req.user, req.params.id, req.file), null, 201));

  r.post('/:id/logo', auth, id, imageUpload.single('file'), async (req, res) => ok(res, await service.addLogo(req.user, req.params.id, req.file), null, 201));

  r.post('/:id/logo/:assetId/cutout', auth, id, uuidParam('assetId'), limits.media, async (req, res) => {
    const body = pick(req.body, ['mode']);
    ok(res, await service.cutoutLogo(req.user, req.params.id, req.params.assetId, body), null, 201);
  });

  r.post('/:id/videos', auth, id, limits.media, capVideoBody, videoUpload, async (req, res) => {
    const file = req.files?.file?.[0] || null;
    const poster = req.files?.poster?.[0] || null;
    ok(res, await service.addVideo(req.user, req.params.id, file, poster), null, 201);
  });

  r.post('/:id/youtube', auth, id, limits.media, async (req, res) => {
    const body = pick(req.body, ['url']);
    ok(res, await service.addYouTube(req.user, req.params.id, body), null, 201);
  });

  // Trang trình chiếu: HTML do renderer sinh, chạy trong CSP sandbox (origin null) + nonce.
  r.get('/:id/preview', auth, id, async (req, res) => {
    const nonce = randomBytes(16).toString('base64');
    const html = await service.preview(req.user, req.params.id, nonce);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.set({
      'Content-Security-Policy': deckCsp(nonce, origin),
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    });
    res.send(html);
  });

  r.get('/:id/export.html', auth, id, async (req, res) => {
    const { html, title } = await service.exportHtml(req.user, req.params.id, req.ip);
    res.set({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': disposition(title, 'html'), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.send(html);
  });

  r.get('/:id/export.pdf', auth, id, limits.exportPdf, async (req, res) => {
    const { pdf, title } = await service.exportPdf(req.user, req.params.id, req.ip);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': disposition(title, 'pdf'), 'Cache-Control': 'no-store' });
    res.send(Buffer.from(pdf));
  });

  return r;
}
