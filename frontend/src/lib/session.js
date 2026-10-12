// Trạng thái phiên đăng nhập dùng chung cho desktop và mobile (chỉ dữ liệu, không UI).
import { reactive } from 'vue';
import { get, post, setCsrf } from './api.js';

export const session = reactive({ loaded: false, user: null });

export async function loadSession() {
  const me = await get('/api/auth/me');
  setCsrf(me.data.csrfToken);
  session.user = me.data.user;
  session.loaded = true;
}

export async function login(email, password) {
  const res = await post('/api/auth/login', { email, password });
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
