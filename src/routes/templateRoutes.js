// /api/templates — mẫu thiết kế / bộ nhận diện thương hiệu: danh sách (của tôi + công khai), lưu từ bài, đổi tên / chia sẻ, xoá,
// ảnh của mẫu (xem trước). Áp mẫu vào bài: POST /api/presentations/:id/templates/:templateId/apply (presentationRoutes).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ok, pick, uuidParam } from '../lib/validate.js';

export function templateRoutes({ service, limits }) {
  const r = Router();
  const auth = requireAuth();

  r.get('/', auth, async (req, res) => ok(res, await service.list(req.user)));

  r.post('/', auth, limits.media, async (req, res) => {
    const body = pick(req.body, ['name', 'presentationId', 'design']);
    ok(res, await service.create(req.user, body, req.ip), null, 201);
  });

  r.get('/assets/:id', auth, uuidParam('id'), async (req, res) => {
    const { buffer, mime } = await service.readAsset(req.user, req.params.id);
    res.set({ 'Content-Type': mime, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    res.send(buffer);
  });

  r.patch('/:id', auth, uuidParam('id'), async (req, res) => {
    const body = pick(req.body, ['name', 'visibility']);
    ok(res, await service.update(req.user, req.params.id, body, req.ip));
  });

  r.delete('/:id', auth, uuidParam('id'), async (req, res) => {
    await service.remove(req.user, req.params.id, req.ip);
    ok(res, { deleted: true });
  });

  return r;
}
