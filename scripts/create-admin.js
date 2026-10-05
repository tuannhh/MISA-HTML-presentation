// Tạo (hoặc cấp lại) tài khoản quản trị đầu tiên. In mật khẩu tạm 1 lần duy nhất; bắt buộc đổi khi đăng nhập.
// Dùng: npm run create-admin -- admin@misa.com.vn "Họ tên"
//   Docker: docker compose exec app node scripts/create-admin.js admin@misa.com.vn "Họ tên"
import { loadConfig } from '../src/config/index.js';
import { createPool, verifyTables } from '../src/db/pool.js';
import { createUserRepository } from '../src/repositories/userRepository.js';
import { createAuditRepository } from '../src/repositories/auditRepository.js';
import { createAuthService } from '../src/services/authService.js';

const [email, displayName] = process.argv.slice(2);
if (!email) {
  console.error('Cách dùng: node scripts/create-admin.js <email> ["Họ tên"]');
  process.exit(2);
}
const config = loadConfig();
const pool = createPool(config.db);
try {
  await verifyTables(pool);
  const repos = { users: createUserRepository(pool) };
  const audit = createAuditRepository(pool);
  const auth = createAuthService({ config, repos, audit });
  const res = await auth.createAdmin({ email, displayName });
  await audit.record({ actorId: null, action: 'admin.bootstrap', targetType: 'user', targetId: res.id, meta: { created: res.created } });
  console.log(res.created ? 'Đã tạo tài khoản quản trị.' : 'Tài khoản đã tồn tại — đã cấp quyền quản trị và đặt lại mật khẩu.');
  console.log(`Email: ${email}`);
  console.log(`Mật khẩu tạm (chỉ hiển thị 1 lần, đổi ngay khi đăng nhập): ${res.temporaryPassword}`);
} finally {
  await pool.end();
}
