// EXPORT-08: trình duyệt không khởi động được → 503 RENDER_UNAVAILABLE (không phải 500 chung); lần sau vẫn thử khởi động lại.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserService } from '../../src/services/browserService.js';

test('không có Chromium → 503 RENDER_UNAVAILABLE, gọi lại vẫn báo đúng mã (không kẹt promise lỗi)', async () => {
  const b = createBrowserService({ chromePath: '/khong/co/chromium' });
  for (let i = 0; i < 2; i += 1) {
    await assert.rejects(b.pdf('<html></html>', { width: 100, height: 100 }), (err) => err.status === 503 && err.code === 'RENDER_UNAVAILABLE');
  }
  await b.close();
});

test('sau close() không mở lại trình duyệt: việc nền còn sót nhận 503, không sinh Chromium mồ côi giữ tiến trình', async () => {
  const b = createBrowserService({});
  await b.close();
  await assert.rejects(b.pdf('<html></html>', { width: 100, height: 100 }), (err) => err.status === 503 && err.code === 'RENDER_UNAVAILABLE');
});
