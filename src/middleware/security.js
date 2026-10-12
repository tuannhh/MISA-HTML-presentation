// CSRF (token đồng bộ trong phiên, gửi qua header X-CSRF-Token) + kiểm tra Origin cho mọi request ghi,
// header bảo mật (helmet) và giới hạn tần suất.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { forbidden, HttpError } from '../lib/httpError.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function ensureCsrfToken(req) {
  if (!req.session.csrf) req.session.csrf = randomBytes(32).toString('base64url');
  return req.session.csrf;
}

export function csrfProtection(config) {
  const allowed = new URL(config.appBaseUrl).origin;
  return (req, _res, next) => {
    if (SAFE.has(req.method)) return next();
    const origin = req.get('origin');
    if (origin && origin !== allowed && origin !== `${req.protocol}://${req.get('host')}`) {
      return next(forbidden('Yêu cầu không hợp lệ (nguồn gốc lạ)', 'BAD_ORIGIN'));
    }
    const sent = req.get('x-csrf-token') || '';
    const expected = req.session?.csrf || '';
    const a = Buffer.from(sent);
    const b = Buffer.from(expected);
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      return next(forbidden('Phiên làm việc đã hết hạn, vui lòng tải lại trang', 'CSRF_INVALID'));
    }
    return next();
  };
}

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        // Ảnh xem trước trong ô "Tìm ảnh" hiển thị trực tiếp từ Pixabay (chọn ảnh → máy chủ tải về thành asset).
        'img-src': ["'self'", 'data:', 'blob:', 'https://pixabay.com', 'https://cdn.pixabay.com'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        // Video tải lên (và ảnh bìa chụp từ video ở trình duyệt qua blob:); YouTube phát trong lớp phủ của ứng dụng.
        'media-src': ["'self'", 'blob:'],
        'frame-src': ["'self'", 'https://www.youtube-nocookie.com'],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' },
  });
}

// CSP riêng cho trang bài trình bày (xem trước): chạy trong sandbox (origin null), chỉ script/style có nonce,
// không được gọi mạng (connect-src none), chỉ nhúng được trong chính ứng dụng.
export function deckCsp(nonce, origin) {
  return [
    'sandbox allow-scripts allow-popups',
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' ${origin} data:`,
    `font-src 'self' ${origin} data:`,
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

const limitHandler = (message, code) => (_req, _res, next) => next(new HttpError(429, code, message));

// rate: { userPerMin } (config.rate). KHÔNG giới hạn theo IP: người dùng vào qua mạng/VPN MISA nên chung 1 IP,
// kiểm soát truy cập mạng do lớp mạng/VPN MISA đảm nhận (IP_ALLOWLIST là tuỳ chọn riêng, không phải hạn mức).
//  - api   : đặt SAU loadUser — chỉ đếm người đã đăng nhập, theo user.id. Yêu cầu chưa đăng nhập không đếm
//            (đăng nhập có hạn mức riêng bên dưới).
//  - login : đếm theo email (chống dò mật khẩu 1 tài khoản; đổi IP không né được).
//  - Các hạn mức nghiệp vụ đều đặt sau auth → luôn có req.user, khoá theo user.id.
export function rateLimits(rate = { userPerMin: 600 }) {
  const base = { standardHeaders: 'draft-7', legacyHeaders: false };
  const byUser = { keyGenerator: (req) => `u:${req.user.id}`, skip: (req) => !req.user };
  return {
    api: rateLimit({
      ...base,
      ...byUser,
      windowMs: 60_000,
      limit: rate.userPerMin,
      handler: limitHandler('Bạn thao tác quá nhanh, vui lòng thử lại sau', 'RATE_LIMITED'),
    }),
    login: rateLimit({
      ...base,
      windowMs: 15 * 60_000,
      limit: 10,
      keyGenerator: (req) => `e:${String(req.body?.email || '').trim().toLowerCase().slice(0, 190)}`,
      handler: limitHandler('Đăng nhập sai quá nhiều lần, thử lại sau 15 phút', 'LOGIN_RATE_LIMITED'),
    }),
    generate: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 30, ...byUser, handler: limitHandler('Bạn đã tạo quá nhiều bài trong 1 giờ, vui lòng thử lại sau', 'GENERATE_RATE_LIMITED') }),
    build: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 60, ...byUser, handler: limitHandler('Bạn đã dựng bài quá nhiều lần trong 1 giờ, vui lòng thử lại sau', 'BUILD_RATE_LIMITED') }),
    // Tải video, đọc link YouTube, tách nền logo — tốn băng thông/CPU hơn thao tác thường.
    // Mời người theo email: chặn dò email hàng loạt.
    // Xuất bản ra web: dựng HTML + chép media (tốn CPU/đĩa).
    publish: rateLimit({ ...base, windowMs: 10 * 60_000, limit: 30, ...byUser, handler: limitHandler('Bạn xuất bản quá nhiều lần, vui lòng thử lại sau ít phút', 'PUBLISH_RATE_LIMITED') }),
    share: rateLimit({ ...base, windowMs: 10 * 60_000, limit: 60, ...byUser, handler: limitHandler('Bạn chia sẻ quá nhanh, vui lòng thử lại sau ít phút', 'SHARE_RATE_LIMITED') }),
    media: rateLimit({ ...base, windowMs: 10 * 60_000, limit: 120, ...byUser, handler: limitHandler('Bạn thêm media quá nhanh, vui lòng thử lại sau ít phút', 'MEDIA_RATE_LIMITED') }),
    // Tạo ảnh AI tốn chi phí model → hạn mức riêng; tìm ảnh Pixabay (API giới hạn ~100 lượt/phút/khoá).
    aiImage: rateLimit({ ...base, windowMs: 10 * 60_000, limit: 40, ...byUser, handler: limitHandler('Bạn tạo ảnh AI quá nhanh, vui lòng thử lại sau ít phút', 'AI_IMAGE_RATE_LIMITED') }),
    imageSearch: rateLimit({ ...base, windowMs: 60_000, limit: 40, ...byUser, handler: limitHandler('Bạn tìm ảnh quá nhanh, vui lòng thử lại sau', 'SEARCH_RATE_LIMITED') }),
    exportPdf: rateLimit({ ...base, windowMs: 10 * 60_000, limit: 20, ...byUser, handler: limitHandler('Bạn xuất PDF quá nhiều lần, thử lại sau ít phút', 'EXPORT_RATE_LIMITED') }),
  };
}
