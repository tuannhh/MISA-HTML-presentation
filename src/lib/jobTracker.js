// Theo dõi job AI trong hàng đợi (roadmap B — giao diện hàng đợi): đã nhận → đang chờ (vị trí) → đang xử lý, kèm thời gian
// chờ/xử lý ĐO ĐƯỢC (trung bình trượt các job gần nhất) để ước lượng. Chỉ trong bộ nhớ của 1 tiến trình (cùng giả định 1 instance
// với Semaphore); khởi động lại → mất thông tin, giao diện hiện trạng thái chung (bài vẫn được recoverStale xử lý như cũ).
const SAMPLE = 20;

export function createJobTracker({ concurrency, now = () => Date.now() }) {
  const jobs = new Map(); // id bài → { kind, queuedAt, startedAt }
  const samples = { run: { outline: [], build: [] }, wait: [] };
  const push = (arr, v) => {
    arr.push(v);
    if (arr.length > SAMPLE) arr.shift();
  };
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const sec = (ms) => (ms == null ? null : Math.round(ms / 1000));

  return {
    /** Ghi nhận job vào hàng NGAY lúc gọi; trả task bọc lại để truyền cho Semaphore/vé (đánh dấu bắt đầu/kết thúc). */
    wrap(id, kind, task) {
      const job = { kind, queuedAt: now(), startedAt: null };
      jobs.set(id, job);
      return async () => {
        job.startedAt = now();
        push(samples.wait, job.startedAt - job.queuedAt);
        try {
          return await task();
        } finally {
          push(samples.run[kind] || (samples.run[kind] = []), now() - job.startedAt);
          if (jobs.get(id) === job) jobs.delete(id);
        }
      };
    },

    /** Trạng thái job của 1 bài cho giao diện; null khi không có job (đã xong, hoặc tiến trình vừa khởi động lại). */
    info(id) {
      const job = jobs.get(id);
      if (!job) return null;
      const t = now();
      const runAvg = avg(samples.run[job.kind] || []);
      if (job.startedAt != null) {
        const elapsed = t - job.startedAt;
        return { state: 'running', kind: job.kind, waitedSec: sec(job.startedAt - job.queuedAt), elapsedSec: sec(elapsed), etaSec: runAvg == null ? null : Math.max(0, sec(runAvg - elapsed)), sampleSize: (samples.run[job.kind] || []).length };
      }
      // Hàng FIFO: vị trí = số job đang chờ vào trước + 1.
      let position = 1;
      for (const other of jobs.values()) if (other.startedAt == null && other.queuedAt < job.queuedAt) position += 1;
      const anyAvg = runAvg ?? avg([...samples.run.outline, ...samples.run.build]);
      // Bắt đầu sau ≈ số "lượt" phía trước × thời gian 1 job; xong sau thêm 1 job.
      const startIn = anyAvg == null ? null : Math.ceil(position / Math.max(1, concurrency)) * anyAvg;
      return { state: 'waiting', kind: job.kind, position, waitedSec: sec(t - job.queuedAt), startInSec: sec(startIn), etaSec: startIn == null || runAvg == null ? sec(startIn) : sec(startIn + runAvg), sampleSize: (samples.run[job.kind] || []).length };
    },

    /** Số đo cho /api/health/ready (giám sát): thời gian xử lý/chờ trung bình, job chờ lâu nhất. */
    stats() {
      const t = now();
      let oldestWait = 0;
      let longestRun = 0;
      for (const j of jobs.values()) {
        if (j.startedAt != null) longestRun = Math.max(longestRun, t - j.startedAt);
        else oldestWait = Math.max(oldestWait, t - j.queuedAt);
      }
      return { avgOutlineSec: sec(avg(samples.run.outline)), avgBuildSec: sec(avg(samples.run.build)), avgWaitSec: sec(avg(samples.wait)), oldestWaitSec: sec(oldestWait), longestRunSec: sec(longestRun) };
    },
  };
}
