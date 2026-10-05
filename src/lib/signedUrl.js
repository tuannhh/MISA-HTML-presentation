// URL ảnh có chữ ký (HMAC) cho trang xem trước chạy trong sandbox (origin "null" → không gửi cookie).
// Chữ ký gắn với assetId + thời hạn; chỉ cấp cho người đã được kiểm tra quyền đọc bài trình bày.
import { createHmac, timingSafeEqual } from 'node:crypto';

export function createUrlSigner(secret, ttlSeconds = 2 * 3600) {
  const key = createHmac('sha256', secret).update('asset-url-v1').digest();
  const sign = (id, exp) => createHmac('sha256', key).update(`${id}.${exp}`).digest('base64url');
  return {
    url(assetId) {
      // Làm tròn thời hạn theo giờ để URL ổn định → trình duyệt dùng lại bộ nhớ đệm ảnh.
      const exp = Math.ceil((Date.now() / 1000 + ttlSeconds) / 3600) * 3600;
      return `/api/assets/${assetId}?exp=${exp}&sig=${sign(assetId, exp)}`;
    },
    verify(assetId, exp, sig) {
      const e = Number(exp);
      if (!Number.isInteger(e) || e < Date.now() / 1000 || typeof sig !== 'string') return false;
      const a = Buffer.from(sign(assetId, e));
      const b = Buffer.from(sig);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
