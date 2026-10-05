// /api/auth — đăng ký, đăng nhập, đăng xuất, thông tin phiên, CSRF token, đổi mật khẩu.
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { ensureCsrfToken } from '../middleware/security.js';
import { publicUser } from '../services/authService.js';
import { ok, pick } from '../lib/validate.js';

// Tạo phiên mới khi đăng nhập (chống session fixation) và gắn version để thu hồi được.
function establishSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.uid = user.id;
      req.session.sv = user.session_version;
      ensureCsrfToken(req);
      return req.session.save((e) => (e ? reject(e) : resolve()));
    });
  });
}

export function authRoutes({ auth, users, limits }) {
  const r = Router();

  r.get('/config', (_req, res) => ok(res, auth.publicConfig()));

  r.get('/csrf', (req, res) => ok(res, { token: ensureCsrfToken(req) }));

  r.get('/me', (req, res) => ok(res, req.user ? { user: publicUser(req.user), csrfToken: ensureCsrfToken(req) } : { user: null, csrfToken: ensureCsrfToken(req) }));

  r.post('/register', limits.register, async (req, res) => {
    const body = pick(req.body, ['email', 'password', 'displayName']);
    const user = await auth.register(body, req.ip);
    await establishSession(req, user);
    ok(res, { user: publicUser(user), csrfToken: req.session.csrf }, null, 201);
  });

  r.post('/login', limits.login, async (req, res) => {
    const body = pick(req.body, ['email', 'password']);
    const user = await auth.login(body, req.ip);
    await establishSession(req, user);
    ok(res, { user: publicUser(user), csrfToken: req.session.csrf });
  });

  r.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('mp.sid');
      return ok(res, { loggedOut: true });
    });
  });

  r.post('/change-password', requireAuth({ allowMustChange: true }), async (req, res) => {
    const body = pick(req.body, ['currentPassword', 'newPassword']);
    await auth.changePassword(req.user.id, body, req.ip);
    const fresh = await users.findById(req.user.id);
    await establishSession(req, fresh);
    ok(res, { user: publicUser(fresh), csrfToken: req.session.csrf });
  });

  return r;
}
