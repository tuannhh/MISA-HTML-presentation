// Lớp lưu trữ file trừu tượng. Hiện tại: thư mục cục bộ (Docker volume /data/storage).
// Đổi sang S3/MinIO sau này: viết adapter cùng giao diện { put, get, remove, removePrefix } — không sửa service khác.
// Khoá (key) luôn do server sinh từ UUID; vẫn kiểm tra đường dẫn nằm trong thư mục gốc để chặn path traversal.
import { mkdir, readFile, rm, writeFile, rename, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { logger } from '../lib/logger.js';

const KEY_RE = /^[a-z0-9][a-z0-9/_.-]{0,250}$/i;

export function createLocalStorage({ privateDir, tempDir, tempTtlMinutes, uploadDir }) {
  function resolveKey(key) {
    if (!KEY_RE.test(key) || key.includes('..')) throw new Error(`storage key không hợp lệ: ${key}`);
    const full = path.resolve(privateDir, key);
    if (!full.startsWith(path.resolve(privateDir) + path.sep)) throw new Error('storage key thoát khỏi thư mục gốc');
    return full;
  }

  return {
    async init() {
      await mkdir(privateDir, { recursive: true });
      await mkdir(tempDir, { recursive: true });
      if (uploadDir) await mkdir(uploadDir, { recursive: true });
    },

    // Ghi nguyên tử: ghi file tạm rồi rename → không bao giờ để lại file ghi dở khi mất điện.
    async put(key, buffer) {
      const full = resolveKey(key);
      await mkdir(path.dirname(full), { recursive: true });
      const tmp = `${full}.${randomUUID()}.part`;
      await writeFile(tmp, buffer);
      await rename(tmp, full);
    },

    async get(key) {
      return readFile(resolveKey(key));
    },

    async remove(key) {
      await rm(resolveKey(key), { force: true });
    },

    async removePrefix(prefix) {
      await rm(resolveKey(prefix.replace(/\/+$/, '')), { recursive: true, force: true });
    },

    // Dọn file tạm quá hạn (export PDF/HTML dở dang, *.part sót lại).
    async cleanupTemp() {
      const cutoff = Date.now() - tempTtlMinutes * 60000;
      let removed = 0;
      for (const name of await readdir(tempDir).catch(() => [])) {
        const full = path.join(tempDir, name);
        const st = await stat(full).catch(() => null);
        if (st && st.mtimeMs < cutoff) {
          await rm(full, { recursive: true, force: true });
          removed += 1;
        }
      }
      if (removed) logger.info('temp_cleanup', { removed });
    },

    // Tệp nguồn tải lên (multer ghi thẳng vào uploadDir). Job tự xoá khi xong; hàm này dọn phần sót lại:
    // khi khởi động (olderThanMs = 0, mọi job cũ đã bị recoverStale đánh failed) và định kỳ với ngưỡng dài.
    async cleanupUploads(olderThanMs) {
      if (!uploadDir) return;
      const cutoff = Date.now() - olderThanMs;
      let removed = 0;
      for (const name of await readdir(uploadDir).catch(() => [])) {
        const full = path.join(uploadDir, name);
        const st = await stat(full).catch(() => null);
        if (st && st.mtimeMs <= cutoff) {
          await rm(full, { recursive: true, force: true });
          removed += 1;
        }
      }
      if (removed) logger.info('upload_cleanup', { removed });
    },
  };
}

export const assetKey = (tenantId, presentationId, assetId, ext = 'webp') => `tenants/${tenantId}/presentations/${presentationId}/${assetId}.${ext}`;
export const presentationPrefix = (tenantId, presentationId) => `tenants/${tenantId}/presentations/${presentationId}`;
export const tenantPrefix = (tenantId) => `tenants/${tenantId}`;
