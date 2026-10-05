// Ghi nhật ký kiểm toán. Lỗi ghi log không được làm hỏng thao tác chính → chỉ cảnh báo.
import { logger } from '../lib/logger.js';

export function createAuditRepository(pool) {
  return {
    async record({ actorId = null, action, targetType = null, targetId = null, result = 'success', ip = null, meta = null }) {
      try {
        await pool.execute(
          'INSERT INTO audit_logs (actor_id, action, target_type, target_id, result, ip, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [actorId, action, targetType, targetId, result, ip ? String(ip).slice(0, 64) : null, meta ? JSON.stringify(meta) : null],
        );
      } catch (err) {
        logger.warn('audit_write_failed', { action, err });
      }
    },
  };
}
