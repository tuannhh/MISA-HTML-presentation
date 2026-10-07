// Giới hạn truy cập theo IP nguồn (IP_ALLOWLIST) — áp cho TOÀN BỘ ứng dụng (API, giao diện, phông/gói 3D),
// trừ /api/health* để healthcheck của Docker/LB không phụ thuộc danh sách. Danh sách rỗng → không giới hạn.
// IP lấy từ req.ip: sau proxy phải đặt TRUST_PROXY đúng số lớp proxy (đặt dư → client giả được X-Forwarded-For).
import { createIpMatcher, normalizeIp } from '../lib/ipAllowlist.js';
import { logger } from '../lib/logger.js';

const EXEMPT = new Set(['/api/health', '/api/health/ready']);
const MESSAGE = 'Ứng dụng chỉ truy cập được từ mạng nội bộ MISA';
const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không có quyền truy cập</title></head><body><h1>Không có quyền truy cập</h1><p>${MESSAGE}. Vui lòng kết nối mạng công ty hoặc VPN rồi thử lại.</p></body></html>`;

export function ipAllowlist(entries) {
  const allowed = createIpMatcher(entries);
  if (!allowed) return (_req, _res, next) => next();
  const logged = new Map(); // ghi log mỗi IP bị chặn tối đa 1 lần/phút
  return (req, res, next) => {
    if (EXEMPT.has(req.path) || allowed(req.ip)) return next();
    const ip = normalizeIp(req.ip);
    const now = Date.now();
    if (!(now - (logged.get(ip) || 0) < 60000)) {
      if (logged.size > 5000) logged.clear();
      logged.set(ip, now);
      logger.warn('ip_blocked', { id: req.id, ip, m: req.method, p: req.path });
    }
    res.status(403).set('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/')) return res.json({ error: { code: 'IP_NOT_ALLOWED', message: MESSAGE } });
    return res.type('html').send(PAGE);
  };
}
