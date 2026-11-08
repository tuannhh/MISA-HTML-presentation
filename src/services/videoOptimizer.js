// Hàng nén video chạy nền: mỗi lúc 1 video (Semaphore 1 — không tranh CPU với tạo bài), trạng thái lưu ở assets.process_state
// để giao diện hiện "Đang tối ưu" và để khởi động lại vẫn nén tiếp. Tệp gốc được giữ nguyên cho tới khi bản nén ghi xong;
// đổi tệp bằng 1 câu UPDATE có điều kiện (storage_key cũ) → video bị xoá/thay giữa chừng thì bỏ bản nén, không ghi đè.
// Lưu ý: chỉ đúng khi chạy 1 bản sao ứng dụng (như Semaphore) — xem memory-bank/09-technical-traps.md.
import { randomUUID } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import path from 'node:path';
import { Semaphore } from '../lib/semaphore.js';
import { assetKey } from './storageService.js';
import { decide, moovAtEnd } from './videoService.js';

const extOf = (key) => (/\.([a-z0-9]+)$/i.exec(key)?.[1] || '').toLowerCase();

export function createVideoOptimizer({ assets, storage, video, logger, tmpDir }) {
  const queue = new Semaphore(1);
  const queued = new Set();

  /**
   * Ngay khi tải lên (đồng bộ, vài trăm ms): đọc thông số + chụp ảnh bìa nếu trình duyệt không gửi.
   * Tệp không đọc được bằng ffprobe = hỏng → ném lỗi để route trả 422. Thiếu ffmpeg → { info: null } (giữ hành vi cũ).
   */
  async function inspect(file, { wantPoster = false } = {}) {
    if (!(await video.available())) return { info: null, poster: null };
    let info;
    try {
      info = await video.probe(file);
    } catch (err) {
      logger.warn('video_probe_failed', { err: err.code || err.message });
      return { info: null, poster: null, broken: true };
    }
    if (!info.vcodec) return { info, poster: null, broken: true };
    let poster = null;
    if (wantPoster) poster = await video.poster(file, info.duration).catch((err) => (logger.warn('video_poster_failed', { err: err.code || err.message }), null));
    return { info, poster };
  }

  function enqueue(assetId) {
    if (queued.has(assetId)) return;
    queued.add(assetId);
    queue
      .run(() => optimize(assetId))
      .catch((err) => logger.error('video_optimize_crash', { assetId, err: err.message }))
      .finally(() => queued.delete(assetId));
  }

  async function optimize(assetId) {
    const row = await assets.findById(assetId);
    if (!row || row.kind !== 'video' || !['pending', 'running'].includes(row.process_state)) return;
    if (!(await video.available())) {
      await assets.setProcessState(assetId, 'skipped');
      return;
    }
    await assets.setProcessState(assetId, 'running');
    const started = Date.now();
    const src = storage.pathOf(row.storage_key);
    const type = extOf(row.storage_key);
    const out = path.join(tmpDir, `video-opt-${randomUUID()}.mp4`);
    let state = 'failed';
    try {
      const info = await video.probe(src);
      if (info.width && info.height && (info.width !== row.width || info.height !== row.height)) await assets.setVideoSize(assetId, info.width, info.height);
      let bytes = await video.transcode(src, out, { hasAudio: !!info.acodec, duration: info.duration });
      let choice = decide({ info, type, origBytes: Number(row.bytes), newBytes: bytes });
      let mode = 'transcode';
      // Bản nén không gọn hơn nhưng MP4 gốc để chỉ mục cuối tệp → chỉ đóng gói lại cho phát được ngay khi chưa tải hết.
      if (choice === 'keep' && type === 'mp4') {
        const fh = await open(src, 'r');
        const late = await moovAtEnd(fh, Number(row.bytes)).finally(() => fh.close());
        if (late) {
          bytes = await video.remux(src, out);
          choice = 'replace';
          mode = 'remux';
        }
      }
      if (choice === 'replace') {
        const after = await video.probe(out);
        // Khoá mới (không ghi đè tệp đang được phát theo Range): <asset>-<ngẫu nhiên>.mp4.
        const key = assetKey(row.tenant_id, row.presentation_id, `${assetId}-${randomUUID().slice(0, 8)}`, 'mp4');
        await storage.putFile(key, out);
        const changed = await assets.replaceVideoFile(assetId, row.storage_key, { storageKey: key, mime: 'video/mp4', bytes, width: after.width, height: after.height });
        if (changed) {
          await storage.remove(row.storage_key).catch(() => {});
          state = 'done';
        } else {
          await storage.remove(key).catch(() => {});
          state = null; // video đã bị xoá / thay bằng tệp khác giữa chừng
        }
        logger.info('video_optimized', { assetId, mode, from: Number(row.bytes), to: bytes, applied: !!changed, ms: Date.now() - started });
      } else {
        state = 'skipped';
        logger.info('video_optimize_skipped', { assetId, from: Number(row.bytes), to: bytes, ms: Date.now() - started });
      }
    } catch (err) {
      logger.warn('video_optimize_failed', { assetId, err: err.killed ? 'timeout' : err.code || err.message, ms: Date.now() - started });
    } finally {
      await rm(out, { force: true }).catch(() => {});
      if (state) await assets.setProcessState(assetId, state).catch(() => {});
    }
  }

  /** Khởi động: video còn dở (pending/running) → đưa lại vào hàng. */
  async function resume() {
    const rows = await assets.listVideoJobs();
    for (const r of rows) enqueue(r.id);
    return rows.length;
  }

  return { inspect, enqueue, resume, stats: () => ({ active: queue.active, pending: queue.pending }) };
}
