// F08: nhóm tác vụ song song phải CHỜ mọi tác vụ đang chạy kết thúc rồi mới báo lỗi — nếu không, bước dọn (xoá tệp đã tải lên Gemini)
// chạy trước khi các lượt còn lại tải xong và chúng bị bỏ sót (rò tệp ở dịch vụ ngoài).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../../src/services/mediaService.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('F08: một tác vụ lỗi → các tác vụ đang chạy vẫn hoàn tất TRƯỚC khi pool báo lỗi; không bắt đầu tác vụ mới', async () => {
  const finished = [];
  const started = [];
  await assert.rejects(
    pool([0, 1, 2, 3, 4], 3, async (n) => {
      started.push(n);
      if (n === 0) throw new Error('lỗi tải lên');
      await sleep(40);
      finished.push(n);
      return n;
    }),
    /lỗi tải lên/,
  );
  assert.deepEqual(finished.sort(), [1, 2], 'hai tác vụ đang bay phải xong trước khi báo lỗi');
  assert.ok(!started.includes(3) && !started.includes(4), 'không khởi động thêm việc sau khi đã lỗi');
});

test('pool: thành công → giữ đúng thứ tự kết quả và giới hạn đồng thời', async () => {
  let active = 0;
  let peak = 0;
  const out = await pool([5, 4, 3, 2, 1], 2, async (n) => {
    active += 1;
    peak = Math.max(peak, active);
    await sleep(n * 3);
    active -= 1;
    return n * 10;
  });
  assert.deepEqual(out, [50, 40, 30, 20, 10]);
  assert.ok(peak <= 2);
});
