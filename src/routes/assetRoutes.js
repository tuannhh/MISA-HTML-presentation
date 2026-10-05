// /api/assets/:id — trả ảnh. Quyền: chữ ký URL hợp lệ (khung xem trước) hoặc người dùng có quyền đọc bài trình bày.
import { Router } from 'express';
import { uuidParam } from '../lib/validate.js';

export function assetRoutes({ service }) {
  const r = Router();
  r.get('/:id', uuidParam('id'), async (req, res) => {
    const { exp, sig } = req.query;
    const signed = typeof sig === 'string';
    const { buffer, mime } = await service.readAsset(req.user || null, req.params.id, { exp, sig: signed ? sig : null });
    res.set({
      'Content-Type': mime,
      'Cache-Control': signed ? 'private, max-age=3600' : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // Cho phép trang xem trước (sandbox, origin null) hiển thị ảnh.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(buffer);
  });
  return r;
}
