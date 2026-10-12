// Hàng việc nền GỘP theo khoá, chạy LẦN LƯỢT (1 việc/lúc): đặt lại khoá đang chờ chỉ cập nhật dữ liệu, không thêm lượt.
// Bộ nhớ chỉ giữ khoá + dữ liệu nhỏ (không giữ kết quả trung gian lớn) → không phình theo số lần gọi. Dùng cho ảnh bìa.
export function createCoalescingQueue(worker, { onError } = {}) {
  const dirty = new Map();
  let running = false;

  async function drain() {
    if (running) return;
    running = true;
    try {
      while (dirty.size) {
        const [key, value] = dirty.entries().next().value;
        dirty.delete(key);
        try {
          await worker(key, value);
        } catch (err) {
          onError?.(key, err);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    push(key, value) {
      dirty.set(key, value);
      drain();
    },
    get pending() {
      return dirty.size;
    },
    get running() {
      return running;
    },
  };
}
