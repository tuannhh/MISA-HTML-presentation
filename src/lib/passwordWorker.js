// Luồng phụ băm/so mật khẩu (dùng bởi passwordHasher.js). bcrypt tốn ~200 ms CPU/lần với 12 vòng — chạy trên luồng chính
// làm mọi request khác đứng chờ; ở đây chạy đồng bộ trong worker, luồng chính chỉ nhận kết quả.
import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

parentPort.on('message', ({ id, op, password, hash, rounds }) => {
  try {
    const result = op === 'hash' ? bcrypt.hashSync(password, rounds) : bcrypt.compareSync(password, hash);
    parentPort.postMessage({ id, result });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
