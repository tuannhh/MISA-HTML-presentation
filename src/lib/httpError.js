// Lỗi nghiệp vụ có mã HTTP + mã lỗi ổn định + thông điệp tiếng Việt an toàn để trả cho client.
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, code = 'BAD_REQUEST', details) => new HttpError(400, code, message, details);
export const unauthorized = (message = 'Bạn cần đăng nhập để tiếp tục', code = 'UNAUTHENTICATED') =>
  new HttpError(401, code, message);
export const forbidden = (message = 'Bạn không có quyền thực hiện thao tác này', code = 'FORBIDDEN') =>
  new HttpError(403, code, message);
// Dùng 404 cho cả "không tồn tại" lẫn "không thuộc quyền" để không lộ sự tồn tại của dữ liệu tenant khác.
export const notFound = (message = 'Không tìm thấy dữ liệu', code = 'NOT_FOUND') => new HttpError(404, code, message);
export const conflict = (message, code = 'CONFLICT') => new HttpError(409, code, message);
export const tooLarge = (message, code = 'PAYLOAD_TOO_LARGE') => new HttpError(413, code, message);
export const unprocessable = (message, code = 'UNPROCESSABLE', details) => new HttpError(422, code, message, details);
export const unavailable = (message, code = 'SERVICE_UNAVAILABLE') => new HttpError(503, code, message);
