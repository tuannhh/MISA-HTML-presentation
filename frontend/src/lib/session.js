// Trạng thái phiên đăng nhập dùng chung cho desktop và mobile (chỉ dữ liệu, không UI).
import { reactive } from 'vue';
import { get, post, setCsrf } from './api.js';

export const session = reactive({ loaded: false, user: null, config: { selfRegistration: true, allowedEmailDomains: [] } });

export async function loadSession() {
  const [me, cfg] = await Promise.all([get('/api/auth/me'), get('/api/auth/config').catch(() => null)]);
  setCsrf(me.data.csrfToken);
  session.user = me.data.user;
  if (cfg) session.config = cfg.data;
  session.loaded = true;
}

export async function login(email, password) {
  const res = await post('/api/auth/login', { email, password });
  session.user = res.data.user;
  return res.data.user;
}

export async function register(payload) {
  const res = await post('/api/auth/register', payload);
  session.user = res.data.user;
  return res.data.user;
}

export async function logout() {
  await post('/api/auth/logout').catch(() => {});
  session.user = null;
  setCsrf('');
}

export async function changePassword(currentPassword, newPassword) {
  const res = await post('/api/auth/change-password', { currentPassword, newPassword });
  session.user = res.data.user;
}

export const isAdmin = () => session.user?.role === 'admin';
