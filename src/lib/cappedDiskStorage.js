// Lưu tệp multipart ra đĩa (tên do server sinh = UUID) và ĐẾM BYTE THỰC NHẬN của cả request: vượt `maxBytes` → 413 UPLOAD_TOO_LARGE,
// tệp đang ghi dở bị xoá (multer tự gọi _removeFile cho các tệp đã nhận xong). Content-Length chỉ là kiểm tra sớm — request chunked
// không có header đó, và giới hạn từng tệp của multer không chặn được "nhiều tệp, mỗi tệp vừa dưới trần".
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream';
import { tooLarge } from './httpError.js';

export function cappedDiskStorage({ destination, maxBytes, message = 'Tổng dung lượng tệp tải lên vượt giới hạn cho phép' }) {
  return {
    _handleFile(req, file, cb) {
      const filename = randomUUID();
      const path = join(destination, filename);
      const total = (req._uploadTotal ||= { bytes: 0 });
      const out = createWriteStream(path);
      const counter = new Transform({
        transform(chunk, _enc, done) {
          total.bytes += chunk.length;
          if (total.bytes > maxBytes) return done(tooLarge(message, 'UPLOAD_TOO_LARGE'));
          return done(null, chunk);
        },
      });
      pipeline(file.stream, counter, out, (err) => {
        if (err) {
          unlink(path).catch(() => {});
          return cb(err);
        }
        return cb(null, { destination, filename, path, size: out.bytesWritten });
      });
    },
    _removeFile(_req, file, cb) {
      unlink(file.path).then(() => cb(null), (err) => cb(err?.code === 'ENOENT' ? null : err));
    },
  };
}
