// Xác thực: đăng ký (giới hạn domain email), đăng nhập, đổi mật khẩu, quản trị tài khoản.
// Mỗi người dùng = 1 tenant. Không tiết lộ email tồn tại hay không khi đăng nhập sai.
import { randomUUID, randomInt } from 'node:crypto';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/httpError.js';

const EMAIL_RE = /^[^\s@]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,}$/i;
import { createPasswordHasher } from '../lib/passwordHasher.js';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function checkPasswordPolicy(pw) {
  const p = String(pw || '');
  if (p.length < 10 || p.length > 128) return 'Mật khẩu dài 10–128 ký tự';
  // bcrypt chỉ xét 72 byte đầu: mật khẩu dài hơn sẽ bị cắt lặng lẽ (2 mật khẩu khác đuôi cùng được chấp nhận). Tiếng Việt có dấu tốn 2–3 byte/ký tự.
  if (Buffer.byteLength(p, 'utf8') > 72) return 'Mật khẩu tối đa 72 byte (khoảng 70 ký tự không dấu, ít hơn nếu có dấu tiếng Việt)';
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return 'Mật khẩu phải có cả chữ và số';
  return null;
}

export function generateTempPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 14; i += 1) s += alphabet[randomInt(alphabet.length)];
  return `${s}7a`;
}

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    status: u.status,
    mustChangePassword: !!u.must_change_password,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
  };
}

// hasher: băm/so bcrypt trên worker_threads (không chặn luồng chính) — container truyền vào để đóng khi tắt máy chủ.
export function createAuthService({ config, repos, audit, hasher = createPasswordHasher({ threads: config.auth.hashThreads }) }) {
  const { users } = repos;
  const rounds = config.auth.bcryptRounds;
  // Hash giả để so sánh khi email không tồn tại → thời gian phản hồi như nhau (chống dò tài khoản). Lỗi → lần sau tạo lại.
  let dummyHash = null;
  const getDummyHash = () => (dummyHash ??= hasher.hash(randomUUID(), rounds).catch((err) => {
    dummyHash = null;
    throw err;
  }));

  function validateEmail(email) {
    if (!EMAIL_RE.test(email) || email.length > 190) throw badRequest('Email không hợp lệ', 'INVALID_EMAIL');
  }

  function validateName(name) {
    const n = String(name || '').trim();
    if (n.length < 2 || n.length > 120) throw badRequest('Họ tên từ 2 đến 120 ký tự', 'INVALID_NAME');
    return n;
  }

  return {
    async login({ email, password }, ip) {
      const e = normalizeEmail(email);
      const u = e ? await users.findByEmailWithHash(e) : null;
      const ok = await hasher.compare(String(password || ''), u ? u.password_hash : await getDummyHash());
      if (!u || !ok) {
        await audit.record({ actorId: u?.id || null, action: 'auth.login', result: 'failure', ip, meta: { reason: 'bad_credentials' } });
        throw unauthorized('Email hoặc mật khẩu không đúng', 'INVALID_CREDENTIALS');
      }
      if (u.status !== 'active') {
        await audit.record({ actorId: u.id, action: 'auth.login', result: 'failure', ip, meta: { reason: 'disabled' } });
        throw forbidden('Tài khoản đã bị khoá. Liên hệ quản trị viên.', 'ACCOUNT_DISABLED');
      }
      await users.touchLogin(u.id);
      await audit.record({ actorId: u.id, action: 'auth.login', ip });
      delete u.password_hash;
      return u;
    },

    async changePassword(userId, { currentPassword, newPassword }, ip) {
      const u = await users.findByIdWithHash(userId);
      if (!u) throw unauthorized();
      if (!(await hasher.compare(String(currentPassword || ''), u.password_hash))) throw badRequest('Mật khẩu hiện tại không đúng', 'WRONG_PASSWORD');
      const policy = checkPasswordPolicy(newPassword);
      if (policy) throw badRequest(policy, 'WEAK_PASSWORD');
      if (await hasher.compare(String(newPassword), u.password_hash)) throw badRequest('Mật khẩu mới phải khác mật khẩu cũ', 'SAME_PASSWORD');
      const version = await users.updatePassword(userId, await hasher.hash(newPassword, rounds), false);
      await audit.record({ actorId: userId, action: 'auth.change_password', targetType: 'user', targetId: userId, ip });
      return version;
    },

    /* ---------- quản trị ---------- */
    async adminList({ q, page, pageSize }) {
      const res = await users.list({ q: q ? String(q).trim().slice(0, 100) : '', limit: pageSize, offset: (page - 1) * pageSize });
      return { rows: res.rows.map(publicUser), total: res.total };
    },

    async adminCreate(actor, { email, displayName, role }, ip) {
      const e = normalizeEmail(email);
      validateEmail(e);
      const name = validateName(displayName);
      const r = role === 'admin' ? 'admin' : 'user';
      if (await users.findByEmailWithHash(e)) throw conflict('Email này đã được đăng ký', 'EMAIL_TAKEN');
      const temp = generateTempPassword();
      const id = randomUUID();
      await users.create({ id, email: e, displayName: name, passwordHash: await hasher.hash(temp, rounds), role: r, mustChangePassword: true });
      await audit.record({ actorId: actor.id, action: 'admin.user_create', targetType: 'user', targetId: id, ip, meta: { role: r } });
      return { user: publicUser(await users.findById(id)), temporaryPassword: temp };
    },

    async adminUpdate(actor, id, { role, status }, ip) {
      const target = await users.findById(id);
      if (!target) throw notFound('Không tìm thấy người dùng');
      if (role !== undefined && !['user', 'admin'].includes(role)) throw badRequest('Vai trò không hợp lệ', 'INVALID_ROLE');
      if (status !== undefined && !['active', 'disabled'].includes(status)) throw badRequest('Trạng thái không hợp lệ', 'INVALID_STATUS');
      if (id === actor.id && (status === 'disabled' || role === 'user')) throw badRequest('Không thể tự khoá hoặc tự hạ quyền chính mình', 'SELF_LOCKOUT');
      // Kiểm "còn ít nhất 1 quản trị viên" và ghi nằm chung 1 giao dịch có khoá (2 quản trị viên hạ quyền nhau cùng lúc không làm hết admin).
      const res = await users.updateAdminFieldsGuarded(id, { role, status });
      if (res.error === 'LAST_ADMIN') throw conflict('Hệ thống cần ít nhất 1 quản trị viên đang hoạt động', 'LAST_ADMIN');
      if (res.error) throw notFound('Không tìm thấy người dùng');
      await audit.record({ actorId: actor.id, action: 'admin.user_update', targetType: 'user', targetId: id, ip, meta: { role, status } });
      return publicUser(await users.findById(id));
    },

    async adminResetPassword(actor, id, ip) {
      const target = await users.findById(id);
      if (!target) throw notFound('Không tìm thấy người dùng');
      const temp = generateTempPassword();
      await users.updatePassword(id, await hasher.hash(temp, rounds), true);
      await audit.record({ actorId: actor.id, action: 'admin.user_reset_password', targetType: 'user', targetId: id, ip });
      return { temporaryPassword: temp };
    },

    async createAdmin({ email, displayName }) {
      const e = normalizeEmail(email);
      validateEmail(e);
      const existing = await users.findByEmailWithHash(e);
      const temp = generateTempPassword();
      if (existing) {
        await users.updateAdminFields(existing.id, { role: 'admin', status: 'active' });
        await users.updatePassword(existing.id, await hasher.hash(temp, rounds), true);
        return { id: existing.id, temporaryPassword: temp, created: false };
      }
      const id = randomUUID();
      await users.create({ id, email: e, displayName: validateName(displayName || 'Quản trị viên'), passwordHash: await hasher.hash(temp, rounds), role: 'admin', mustChangePassword: true });
      return { id, temporaryPassword: temp, created: true };
    },
  };
}
