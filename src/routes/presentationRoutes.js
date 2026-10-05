// /api/presentations — danh sách (của tôi / công khai), tạo bằng AI, xem, sửa, xoá, nhân bản, ảnh, xem trước, xuất.
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { deckCsp } from '../middleware/security.js';
import { ok, pick, paging, uuidParam } from '../lib/validate.js';

// Tên file tải về: bỏ ký tự cấm, kèm filename* UTF-8 để giữ tiếng Việt.
function disposition(title, ext) {
  const base = String(title || 'bai-trinh-bay').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'bai-trinh-bay';
  const ascii = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\x20-\x7e]/g, '_');
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(base)}.${ext}`;
}

export function presentationRoutes({ service, config, limits }) {
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.limits.maxUploadMb * 1048576, files: 1, fields: 20, fieldSize: config.limits.maxTextChars * 4 } });
  const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.limits.maxImageUploadMb * 1048576, files: 1, fields: 5 } });
  const auth = requireAuth();
  const id = uuidParam('id');

  r.get('/', auth, async (req, res) => {
    const { page, pageSize } = paging(req.query, { maxPageSize: 48, defaultPageSize: 24 });
    const scope = req.query.scope === 'public' ? 'public' : 'mine';
    const { rows, total } = await service.list(req.user, { scope, q: req.query.q, page, pageSize });
    ok(res, rows, { page, pageSize, total, hasNext: page * pageSize < total });
  });

  r.post('/', auth, limits.generate, upload.single('file'), async (req, res) => {
    const body = pick(req.body, ['url', 'text', 'ratio', 'slideCount', 'instructions', 'title']);
    const result = await service.create(req.user, { ...body, file: req.file || null }, req.ip);
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

  r.post('/:id/assets', auth, id, imageUpload.single('file'), async (req, res) => ok(res, await service.addAsset(req.user, req.params.id, req.file), null, 201));

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
