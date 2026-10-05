// Nạp người dùng từ phiên cho mỗi request; phiên bị vô hiệu khi session_version đổi (đổi mật khẩu/khoá tài khoản).
import { unauthorized, forbidden } from '../lib/httpError.js';

export function loadUser(users) {
  return async (req, _res, next) => {
    try {
      const uid = req.session?.uid;
      if (!uid) return next();
      const u = await users.findById(uid);
      if (!u || u.status !== 'active' || u.session_version !== req.session.sv) {
        req.session.uid = null;
        return next();
      }
      req.user = u;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export function requireAuth({ allowMustChange = false } = {}) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (req.user.must_change_password && !allowMustChange) {
      return next(forbidden('Bạn cần đổi mật khẩu tạm trước khi tiếp tục', 'MUST_CHANGE_PASSWORD'));
    }
    return next();
  };
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'admin') return next(forbidden('Chỉ quản trị viên được thực hiện thao tác này', 'ADMIN_ONLY'));
  return next();
}
