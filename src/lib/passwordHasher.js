// Băm/so mật khẩu bcrypt trên nhóm worker_threads cố định (không thêm thư viện, định dạng hash $2a$/$2b$ giữ nguyên).
// Lý do: bcryptjs thuần JS — đo trong container 12 vòng ≈ 210 ms/lần; 8 lần đăng nhập cùng lúc làm luồng chính đứng ~0,8 giây,
// mọi request khác (mở bài, lưu…) chờ theo. Worker chạy song song trên nhiều nhân, luồng chính không bị chặn.
// Worker bị unref: không giữ tiến trình sống khi tắt; worker chết giữa chừng → việc đang làm báo lỗi, worker mới thay thế.
import { Worker } from 'node:worker_threads';

const WORKER_URL = new URL('./passwordWorker.js', import.meta.url);

export function createPasswordHasher({ threads = 2 } = {}) {
  const size = Math.max(1, Math.floor(threads));
  const slots = [];
  const queue = [];
  const pending = new Map();
  let seq = 0;
  let closed = false;

  function spawn() {
    const w = new Worker(WORKER_URL);
    w.unref();
    const slot = { worker: w, busy: null };
    w.on('message', ({ id, result, error }) => {
      const job = pending.get(id);
      pending.delete(id);
      slot.busy = null;
      if (job) (error ? job.reject(new Error(error)) : job.resolve(result));
      pump();
    });
    w.on('error', (err) => fail(slot, err));
    w.on('exit', (code) => fail(slot, new Error(`password worker thoát (mã ${code})`)));
    return slot;
  }

  function fail(slot, err) {
    const i = slots.indexOf(slot);
    if (i < 0) return;
    slots.splice(i, 1);
    if (slot.busy != null) {
      const job = pending.get(slot.busy);
      pending.delete(slot.busy);
      job?.reject(err);
    }
    if (!closed) pump();
  }

  function pump() {
    while (queue.length) {
      let slot = slots.find((s) => s.busy == null);
      if (!slot && slots.length < size) {
        slot = spawn();
        slots.push(slot);
      }
      if (!slot) return;
      const job = queue.shift();
      slot.busy = job.msg.id;
      pending.set(job.msg.id, job);
      slot.worker.postMessage(job.msg);
    }
  }

  function run(msg) {
    if (closed) return Promise.reject(new Error('password hasher đã đóng'));
    return new Promise((resolve, reject) => {
      seq += 1;
      queue.push({ msg: { ...msg, id: seq }, resolve, reject });
      pump();
    });
  }

  return {
    hash: (password, rounds) => run({ op: 'hash', password: String(password), rounds }),
    compare: (password, hash) => run({ op: 'compare', password: String(password), hash: String(hash) }),
    async close() {
      closed = true;
      for (const job of queue.splice(0)) job.reject(new Error('password hasher đã đóng'));
      await Promise.all(slots.splice(0).map((s) => s.worker.terminate()));
    },
  };
}
