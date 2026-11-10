// Trần số lượt TẢI VIDEO LÊN cùng lúc (CT-005): mỗi lượt giữ 1 tệp tạm tới 200 MB trên đĩa + ffprobe/ffmpeg sau đó, nên không để số lượt
// tăng theo số người dùng. Giữ chỗ ĐỒNG BỘ trước khi multer nhận dữ liệu; trả chỗ khi response xong hoặc kết nối đứt (client ngắt giữa chừng).
// Lưu ý: đếm trong bộ nhớ → đúng khi chạy 1 bản sao ứng dụng (như Semaphore) — xem memory-bank/09-technical-traps.md.
import { HttpError } from './httpError.js';

export const UPLOAD_BUSY_MESSAGE = 'Máy chủ đang xử lý nhiều video, vui lòng thử lại sau ít phút';

export function createUploadSlots(max) {
  let used = 0;
  const held = new WeakSet();

  /** Giữ chỗ cho request này (lần gọi thứ 2 trên cùng request không tốn thêm chỗ). false = đã đầy. */
  function take(req, res) {
    if (held.has(req)) return true;
    if (used >= max) return false;
    used += 1;
    held.add(req);
    let freed = false;
    // 'close' của response bắn đúng 1 lần cả khi xong lẫn khi socket đứt/ client ngắt.
    res.once('close', () => {
      if (freed) return;
      freed = true;
      used -= 1;
    });
    return true;
  }

  const busy = (res) => {
    res.set('Retry-After', '60');
    return new HttpError(503, 'UPLOAD_BUSY', UPLOAD_BUSY_MESSAGE);
  };

  return {
    take,
    /** Middleware: đặt TRƯỚC multer. */
    hold: (req, res, next) => (take(req, res) ? next() : next(busy(res))),
    /** Dùng trong fileFilter của multer: giữ chỗ khi gặp tệp video đầu tiên của request. */
    holdFor: (req, res) => (take(req, res) ? null : busy(res)),
    stats: () => ({ used, max }),
  };
}
