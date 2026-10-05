// CSRF (token đồng bộ trong phiên, gửi qua header X-CSRF-Token) + kiểm tra Origin cho mọi request ghi,
// header bảo mật (helmet) và giới hạn tần suất.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
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
        'img-src': ["'self'", 'data:', 'blob:'],
        'font-src': ["'self'", 'data:'],
        'connect-src': ["'self'"],
        'frame-src': ["'self'"],
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

export function rateLimits() {
  const base = { standardHeaders: 'draft-7', legacyHeaders: false };
  return {
    api: rateLimit({ ...base, windowMs: 60_000, limit: 600, handler: limitHandler('Bạn thao tác quá nhanh, vui lòng thử lại sau', 'RATE_LIMITED') }),
    login: rateLimit({
      ...base,
      windowMs: 15 * 60_000,
      limit: 10,
      keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase().slice(0, 190)}`,
      handler: limitHandler('Đăng nhập sai quá nhiều lần, thử lại sau 15 phút', 'LOGIN_RATE_LIMITED'),
    }),
    register: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 10, handler: limitHandler('Quá nhiều lượt đăng ký, thử lại sau', 'RATE_LIMITED') }),
    generate: rateLimit({ ...base, windowMs: 60 * 60_000, limit: 30, keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip), handler: limitHandler('Bạn đã tạo quá nhiều bài trong 1 giờ, vui lòng thử lại sau', 'GENERATE_RATE_LIMITED') }),
    exportPdf: rateLimit({ ...base, windowMs: 10 * 60_000, limit: 20, keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip), handler: limitHandler('Bạn xuất PDF quá nhiều lần, thử lại sau ít phút', 'EXPORT_RATE_LIMITED') }),
  };
}
