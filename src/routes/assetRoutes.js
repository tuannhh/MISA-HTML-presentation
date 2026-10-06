// /api/assets/:id — trả ảnh/video. Quyền: chữ ký URL hợp lệ (khung xem trước) hoặc người dùng có quyền đọc bài trình bày.
// Video phát theo Range (tua được) bằng res.sendFile.
import { Router } from 'express';
import { uuidParam } from '../lib/validate.js';

export function assetRoutes({ service }) {
  const r = Router();
  r.get('/:id', uuidParam('id'), async (req, res) => {
    const { exp, sig } = req.query;
    const signed = typeof sig === 'string';
    const { buffer, path, mime } = await service.readAsset(req.user || null, req.params.id, { exp, sig: signed ? sig : null });
    res.set({
      'Content-Type': mime,
      'Cache-Control': signed ? 'private, max-age=3600' : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      // Cho phép trang xem trước (sandbox, origin null) hiển thị ảnh.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    // URL có chữ ký (khung xem trước) → cho đọc điểm ảnh qua CORS: logo 3D (WebGL) trong khung sandbox origin null tải ảnh với
    // crossorigin="anonymous". Chữ ký vẫn là điều kiện truy cập; không gửi kèm cookie (không có Allow-Credentials).
    if (signed) res.set('Access-Control-Allow-Origin', '*');
    if (!path) return res.send(buffer);
    return new Promise((resolve, reject) => {
      res.sendFile(path, { acceptRanges: true, cacheControl: false, lastModified: true, dotfiles: 'deny' }, (err) => (err && !res.headersSent ? reject(err) : resolve()));
    });
  });
  return r;
}
