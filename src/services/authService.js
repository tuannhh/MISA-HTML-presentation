// Xác thực: đăng ký (giới hạn domain email), đăng nhập, đổi mật khẩu, quản trị tài khoản.
// Mỗi người dùng = 1 tenant. Không tiết lộ email tồn tại hay không khi đăng nhập sai.
import { randomUUID, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/httpError.js';

const EMAIL_RE = /^[^\s@]{1,64}@[a-z0-9.-]{1,180}\.[a-z]{2,}$/i;
// Hash giả để so sánh khi email không tồn tại → thời gian phản hồi như nhau (chống dò tài khoản).
let dummyHash = null;
const getDummyHash = (rounds) => (dummyHash ??= bcrypt.hashSync(randomUUID(), rounds));

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function checkPasswordPolicy(pw) {
  const p = String(pw || '');
  if (p.length < 10 || p.length > 128) return 'Mật khẩu dài 10–128 ký tự';
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

export function createAuthService({ config, repos, audit }) {
  const { users } = repos;
  const rounds = config.auth.bcryptRounds;

  function domainAllowed(email) {
    const domains = config.auth.allowedEmailDomains;
    if (!domains.length) return true;
    const d = email.split('@')[1] || '';
    return domains.includes(d);
  }

  function validateEmail(email) {
    if (!EMAIL_RE.test(email) || email.length > 190) throw badRequest('Email không hợp lệ', 'INVALID_EMAIL');
  }

  function validateName(name) {
    const n = String(name || '').trim();
    if (n.length < 2 || n.length > 120) throw badRequest('Họ tên từ 2 đến 120 ký tự', 'INVALID_NAME');
    return n;
  }

  return {
    publicConfig() {
      return { selfRegistration: config.auth.selfRegistration, allowedEmailDomains: config.auth.allowedEmailDomains };
    },

    async register({ email, password, displayName }, ip) {
      if (!config.auth.selfRegistration) throw forbidden('Hệ thống không mở đăng ký tự do. Liên hệ quản trị viên để được cấp tài khoản.', 'REGISTRATION_CLOSED');
      const e = normalizeEmail(email);
      validateEmail(e);
      if (!domainAllowed(e)) throw forbidden(`Chỉ chấp nhận email thuộc: ${config.auth.allowedEmailDomains.map((d) => `@${d}`).join(', ')}`, 'EMAIL_DOMAIN_NOT_ALLOWED');
      const name = validateName(displayName);
      const policy = checkPasswordPolicy(password);
      if (policy) throw badRequest(policy, 'WEAK_PASSWORD');
      if (await users.findByEmailWithHash(e)) throw conflict('Email này đã được đăng ký', 'EMAIL_TAKEN');
      const id = randomUUID();
      try {
        await users.create({ id, email: e, displayName: name, passwordHash: await bcrypt.hash(password, rounds) });
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw conflict('Email này đã được đăng ký', 'EMAIL_TAKEN');
        throw err;
      }
      await audit.record({ actorId: id, action: 'auth.register', targetType: 'user', targetId: id, ip });
      return users.findById(id);
    },

    async login({ email, password }, ip) {
      const e = normalizeEmail(email);
      const u = e ? await users.findByEmailWithHash(e) : null;
      const ok = await bcrypt.compare(String(password || ''), u ? u.password_hash : getDummyHash(rounds));
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
      if (!(await bcrypt.compare(String(currentPassword || ''), u.password_hash))) throw badRequest('Mật khẩu hiện tại không đúng', 'WRONG_PASSWORD');
      const policy = checkPasswordPolicy(newPassword);
      if (policy) throw badRequest(policy, 'WEAK_PASSWORD');
      if (await bcrypt.compare(String(newPassword), u.password_hash)) throw badRequest('Mật khẩu mới phải khác mật khẩu cũ', 'SAME_PASSWORD');
      const version = await users.updatePassword(userId, await bcrypt.hash(newPassword, rounds), false);
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
      await users.create({ id, email: e, displayName: name, passwordHash: await bcrypt.hash(temp, rounds), role: r, mustChangePassword: true });
      await audit.record({ actorId: actor.id, action: 'admin.user_create', targetType: 'user', targetId: id, ip, meta: { role: r } });
      return { user: publicUser(await users.findById(id)), temporaryPassword: temp };
    },

    async adminUpdate(actor, id, { role, status }, ip) {
      const target = await users.findById(id);
      if (!target) throw notFound('Không tìm thấy người dùng');
      if (role !== undefined && !['user', 'admin'].includes(role)) throw badRequest('Vai trò không hợp lệ', 'INVALID_ROLE');
      if (status !== undefined && !['active', 'disabled'].includes(status)) throw badRequest('Trạng thái không hợp lệ', 'INVALID_STATUS');
      if (id === actor.id && (status === 'disabled' || role === 'user')) throw badRequest('Không thể tự khoá hoặc tự hạ quyền chính mình', 'SELF_LOCKOUT');
      const losingAdmin = target.role === 'admin' && target.status === 'active' && (role === 'user' || status === 'disabled');
      if (losingAdmin && (await users.countActiveAdmins(id)) === 0) throw conflict('Hệ thống cần ít nhất 1 quản trị viên đang hoạt động', 'LAST_ADMIN');
      await users.updateAdminFields(id, { role, status });
      await audit.record({ actorId: actor.id, action: 'admin.user_update', targetType: 'user', targetId: id, ip, meta: { role, status } });
      return publicUser(await users.findById(id));
    },

    async adminResetPassword(actor, id, ip) {
      const target = await users.findById(id);
      if (!target) throw notFound('Không tìm thấy người dùng');
      const temp = generateTempPassword();
      await users.updatePassword(id, await bcrypt.hash(temp, rounds), true);
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
        await users.updatePassword(existing.id, await bcrypt.hash(temp, rounds), true);
        return { id: existing.id, temporaryPassword: temp, created: false };
      }
      const id = randomUUID();
      await users.create({ id, email: e, displayName: validateName(displayName || 'Quản trị viên'), passwordHash: await bcrypt.hash(temp, rounds), role: 'admin', mustChangePassword: true });
      return { id, temporaryPassword: temp, created: true };
    },
  };
}
