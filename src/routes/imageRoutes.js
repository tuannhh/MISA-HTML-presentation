// /api/images — tìm ảnh trên Internet theo từ khoá (Pixabay). Ảnh chỉ thành asset khi người dùng chọn
// (POST /api/presentations/:id/images/import).
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ok } from '../lib/validate.js';

export function imageRoutes({ service, limits }) {
  const r = Router();
  r.get('/search', requireAuth(), limits.imageSearch, async (req, res) => {
    const result = await service.searchImages(req.user, { q: req.query.q, page: req.query.page, orientation: req.query.orientation });
    ok(res, result.hits, { page: result.page, total: result.total, hasNext: result.hasNext, source: 'pixabay' });
  });
  return r;
}
