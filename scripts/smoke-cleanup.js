// Dọn tài khoản do smoke test tạo (email smoke-<vai>-<stamp>@misa.com.vn — scripts/lib/smokeAccounts.js) cùng bài, mẫu, tệp của họ.
// Chỉ chạm tài khoản khớp đúng quy ước email smoke; không bao giờ chạm tài khoản thật.
// Dùng (Docker): docker compose exec -T app node scripts/smoke-cleanup.js <stamp>  — dọn 1 lần chạy (smoke tự gọi trong finally)
//                docker compose exec -T app node scripts/smoke-cleanup.js --list   — liệt kê tài khoản smoke còn sót
//                docker compose exec -T app node scripts/smoke-cleanup.js --all    — dọn mọi tài khoản smoke còn sót
import { loadConfig } from '../src/config/index.js';
import { createPool, verifyTables } from '../src/db/pool.js';
import { createUserRepository } from '../src/repositories/userRepository.js';
import { createAuditRepository } from '../src/repositories/auditRepository.js';
import { createLocalStorage, tenantPrefix } from '../src/services/storageService.js';
import { STAMP_RE, isSmokeEmail } from './lib/smokeAccounts.js';

const arg = process.argv[2] || '';
if (arg !== '--list' && arg !== '--all' && !STAMP_RE.test(arg)) {
  console.error('Cách dùng: node scripts/smoke-cleanup.js <stamp> | --list | --all');
  process.exit(2);
}
const stamp = STAMP_RE.test(arg) ? arg : null;
const config = loadConfig();
const pool = createPool(config.db);
try {
  await verifyTables(pool);
  const users = createUserRepository(pool);
  const audit = createAuditRepository(pool);
  const storage = createLocalStorage(config.storage);
  const targets = (await users.listByEmailPrefix('smoke-')).filter((u) => isSmokeEmail(u.email, stamp));
  if (arg === '--list') {
    for (const u of targets) console.log(`${u.email}\t${u.role}\t${new Date(u.created_at).toISOString()}`);
    console.log(`Còn ${targets.length} tài khoản smoke.`);
  } else {
    for (const u of targets) {
      // Xoá tài khoản trước (vô hiệu đăng nhập ngay), tệp sau; tệp sót chỉ tốn đĩa, không còn ai truy cập được.
      await users.deleteById(u.id);
      await storage.removePrefix(tenantPrefix(u.id)).catch((err) => console.error(`Không xoá được tệp của ${u.email}: ${err.message}`));
      await audit.record({ action: 'admin.smoke_cleanup', targetType: 'user', targetId: u.id, meta: { email: u.email } });
    }
    console.log(`Đã dọn ${targets.length} tài khoản smoke${stamp ? ` (lần chạy ${stamp})` : ''}.`);
  }
} finally {
  await pool.end();
}
