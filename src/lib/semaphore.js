// Giới hạn số tác vụ nặng chạy đồng thời trong 1 tiến trình (sinh AI, render PDF).
// Lưu ý: chỉ đúng khi chạy 1 bản sao ứng dụng — xem memory-bank/09-technical-traps.md.
export class Semaphore {
  constructor(max) {
    this.max = max;
    this.active = 0;
    this.queue = [];
  }

  get pending() {
    return this.queue.length;
  }

  async run(task) {
    if (this.active >= this.max) {
      await new Promise((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
