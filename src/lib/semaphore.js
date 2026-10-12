// Giới hạn số tác vụ nặng chạy đồng thời trong 1 tiến trình (sinh AI, render PDF).
// Lưu ý: chỉ đúng khi chạy 1 bản sao ứng dụng — xem memory-bank/09-technical-traps.md.
export class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
    this.reserved = 0;
  }

  get pending() {
    return this.queue.length;
  }

  // Giữ chỗ ĐỒNG BỘ (không await) trước các bước ghi DB/audit: tổng đang chạy + đang chờ + đã giữ chỗ ≤ max + maxPending.
  // Nhiều yêu cầu cùng lúc không thể cùng thấy "còn chỗ". Trả vé { run(task), release() } hoặc null khi đầy;
  // vé phải được run hoặc release đúng 1 lần (lỗi trước khi vào hàng → release để trả chỗ).
  reserve(maxPending) {
    if (this.active + this.queue.length + this.reserved >= this.max + maxPending) return null;
    this.reserved += 1;
    let used = false;
    const take = () => {
      if (used) return false;
      used = true;
      this.reserved -= 1;
      return true;
    };
    return {
      run: (task) => {
        if (!take()) throw new Error('vé hàng đợi đã dùng');
        return this.run(task);
      },
      release: () => {
        take();
      },
    };
  }

  async run(task) {
    // Vào hàng chờ / nhận chỗ chạy ngay trong phần đồng bộ của lời gọi → vé chuyển thành job không hở khoảng đếm.
    if (this.active >= this.max) await new Promise((resolve) => this.queue.push(resolve));
    else this.active += 1;
    try {
      return await task();
    } finally {
      // Chuyển thẳng chỗ chạy cho job đang chờ (active giữ nguyên) → không có khoảnh khắc đếm thiếu.
      const next = this.queue.shift();
      if (next) next();
      else this.active -= 1;
    }
  }
}
