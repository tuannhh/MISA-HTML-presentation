// Bản xuất (PDF/HTML) chờ tải. Dựng xong → ghi ra thư mục tạm, cấp mã tải ngẫu nhiên gắn với người + bài, sống TTL ngắn.
// Giao diện tải bằng GET thường (Content-Disposition: attachment) thay vì fetch → blob: trình quản lý tải (IDM…) chặn phản hồi
// fetch rồi tự tải lại → trình duyệt lưu blob rỗng 0 KB. Tải GET thường thì IDM (nếu có) nhận tải, không thì trình duyệt tự lưu
// — chỉ 1 tệp. IDM tải lại cùng URL (kèm cookie, chia nhiều luồng Range) → phải phục vụ lại được nhiều lần trong TTL mà không dựng lại.
// Chỉ 1 instance (memory-bank 07): sổ mã giữ trong RAM, tệp nằm ở tempDir; khởi động lại thì mã cũ hết hiệu lực, tệp bị dọn.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { logger } from '../lib/logger.js';

export const EXPORT_TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
const FILE_RE = /^export-[A-Za-z0-9_-]{32}\.(pdf|html)$/;
const TYPES = { pdf: 'application/pdf', html: 'text/html; charset=utf-8' };

/**
 * @param {{ dir: string, ttlMs?: number, maxPerUser?: number, maxEntries?: number, now?: () => number }} o
 *   ttlMs: hạn kể từ lần dùng gần nhất (IDM có thể tạm dừng/tiếp tục); maxPerUser/maxEntries: trần số bản giữ trên đĩa.
 */
export function createExportStore({ dir, ttlMs = 15 * 60_000, maxPerUser = 4, maxEntries = 200, now = Date.now }) {
  const entries = new Map(); // token → { userId, presentationId, file, title, ext, bytes, expiresAt }

  const drop = (token) => {
    const e = entries.get(token);
    if (!e) return;
    entries.delete(token);
    rm(e.file, { force: true, maxRetries: 3, retryDelay: 100 }).catch((err) => logger.warn('export_file_remove_failed', { err: { message: err.message } }));
  };

  function sweep() {
    const t = now();
    for (const [token, e] of entries) if (e.expiresAt <= t) drop(token);
  }

  return {
    async init() {
      await mkdir(dir, { recursive: true });
    },

    // Chỉ server gọi khi khởi động (không gọi từ script/tiến trình phụ dùng chung container — sẽ xoá tệp server đang phục vụ):
    // xoá bản xuất sót từ lần chạy trước (sổ mã trong RAM đã mất nên không ai tải được nữa).
    async purgeLeftovers() {
      let removed = 0;
      for (const name of await readdir(dir).catch(() => [])) {
        if (!FILE_RE.test(name)) continue;
        await rm(path.join(dir, name), { force: true }).catch(() => {});
        removed += 1;
      }
      if (removed) logger.info('export_leftovers_removed', { removed });
    },

    /** Ghi bản xuất → { token, bytes, expiresAt }. data: Buffer | Uint8Array | string; title: tiêu đề bài (tên tệp do route dựng). */
    async put({ userId, presentationId, data, title, ext }) {
      if (!TYPES[ext]) throw new Error(`định dạng xuất không hỗ trợ: ${ext}`);
      sweep();
      // Trần theo người + tổng: bỏ bản cũ nhất (Map giữ thứ tự chèn) trước khi ghi bản mới.
      const mine = [...entries].filter(([, e]) => e.userId === userId);
      for (const [token] of mine.slice(0, Math.max(0, mine.length - maxPerUser + 1))) drop(token);
      for (const [token] of [...entries].slice(0, Math.max(0, entries.size - maxEntries + 1))) drop(token);
      const token = randomBytes(24).toString('base64url');
      const file = path.join(dir, `export-${token}.${ext}`);
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      await writeFile(file, buf);
      const expiresAt = now() + ttlMs;
      entries.set(token, { userId, presentationId, file, title, ext, bytes: buf.length, expiresAt });
      return { token, bytes: buf.length, expiresAt };
    },

    /** Lấy bản xuất để phục vụ: sai người/sai bài/hết hạn → null (không tiết lộ mã có tồn tại hay không). Mỗi lần dùng gia hạn TTL. */
    get(token, { userId, presentationId }) {
      if (!EXPORT_TOKEN_RE.test(String(token))) return null;
      const e = entries.get(token);
      if (!e) return null;
      if (e.expiresAt <= now()) {
        drop(token);
        return null;
      }
      if (e.userId !== userId || e.presentationId !== presentationId) return null;
      e.expiresAt = now() + ttlMs;
      return { file: e.file, title: e.title, ext: e.ext, bytes: e.bytes, type: TYPES[e.ext] };
    },

    sweep,
    size: () => entries.size,
  };
}
