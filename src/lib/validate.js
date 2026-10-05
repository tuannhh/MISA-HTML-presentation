// Helper kiểm tra đầu vào dùng chung cho tầng route.
import { badRequest } from './httpError.js';
import { isUuid } from '../repositories/tenantScope.js';

// Chỉ lấy các trường được phép (chống mass-assignment).
export function pick(body, keys) {
  const src = body && typeof body === 'object' ? body : {};
  const out = {};
  for (const k of keys) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
  return out;
}

export function paging(query, { maxPageSize = 50, defaultPageSize = 20 } = {}) {
  const page = Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1));
  const pageSize = Math.max(1, Math.min(maxPageSize, Number.parseInt(query.pageSize, 10) || defaultPageSize));
  return { page, pageSize };
}

export function uuidParam(name = 'id') {
  return (req, _res, next) => {
    if (!isUuid(req.params[name])) return next(badRequest('Mã không hợp lệ', 'INVALID_ID'));
    req.params[name] = req.params[name].toLowerCase();
    return next();
  };
}

export const ok = (res, data, meta, status = 200) => res.status(status).json(meta ? { data, meta } : { data });
