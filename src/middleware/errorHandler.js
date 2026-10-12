// Chuẩn lỗi duy nhất: { error: { code, message, details? } }. Lỗi không lường trước → 500 thông điệp chung,
// chi tiết chỉ ghi log phía server (kèm requestId để tra cứu).
import multer from 'multer';
import { HttpError } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';

// Thông điệp mysql2 khi pool.queueLimit đầy (thư viện không gắn mã lỗi).
const DB_POOL_QUEUE_FULL = 'Queue limit reached.';

export function notFoundApi(_req, _res, next) {
  next(new HttpError(404, 'ROUTE_NOT_FOUND', 'Không tìm thấy chức năng yêu cầu'));
}

export function errorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let e = err;
    if (err instanceof multer.MulterError) {
      e = err.code === 'LIMIT_FILE_SIZE'
        ? new HttpError(413, 'FILE_TOO_LARGE', 'Tệp vượt quá dung lượng cho phép')
        : err.code === 'LIMIT_FILE_COUNT'
          ? new HttpError(400, 'TOO_MANY_FILES', 'Số tệp vượt quá giới hạn cho phép')
          : new HttpError(400, 'UPLOAD_ERROR', 'Tệp tải lên không hợp lệ');
    } else if (err?.type === 'entity.too.large') {
      e = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn');
    } else if (err?.type === 'entity.parse.failed') {
      e = new HttpError(400, 'INVALID_JSON', 'Dữ liệu gửi lên không đúng định dạng JSON');
    } else if (err?.message === DB_POOL_QUEUE_FULL) {
      // mysql2: hàng chờ kết nối DB đầy (queueLimit) — quá tải tạm thời, không phải lỗi logic → 503 + Retry-After để client thử lại.
      e = new HttpError(503, 'SERVER_BUSY', 'Hệ thống đang quá tải, vui lòng thử lại sau ít giây');
    }
    if (!(e instanceof HttpError)) {
      logger.error('unhandled_error', { requestId: req.id, method: req.method, path: req.path, err });
      e = new HttpError(500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.');
    } else if (e.status >= 500) {
      logger.warn('server_error', { requestId: req.id, code: e.code, path: req.path });
    }
    if (res.headersSent) return res.end();
    // Quá tải / quá hạn mức: báo client khi nào thử lại (hàng đợi AI đầy → 30 giây; hạn mức → giữ giá trị express-rate-limit đã đặt).
    if ((e.status === 503 || e.status === 429) && !res.get('Retry-After')) res.set('Retry-After', e.status === 503 ? '30' : '60');
    const body = { error: { code: e.code, message: e.message } };
    if (e.details && e.status < 500) body.error.details = e.details;
    if (!config.isProd && e.status === 500 && err?.message) body.error.debug = err.message;
    return res.status(e.status).json(body);
  };
}
