// Quản trị người dùng (chỉ admin) — dùng chung desktop/mobile. Mật khẩu tạm chỉ hiển thị 1 lần, không lưu ở client.
import { ref, reactive } from 'vue';
import { get, post, patch } from '@/lib/api.js';

export const ROLE_LABEL = { admin: 'Quản trị viên', user: 'Người dùng' };
export const ROLE_OPTIONS = [
  { label: 'Người dùng', value: 'user' },
  { label: 'Quản trị viên', value: 'admin' },
];
export const STATUS_LABEL = { active: 'Đang hoạt động', disabled: 'Đã khoá' };

export function useAdminUsers() {
  const rows = ref([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = 20;
  const hasNext = ref(false);
  const q = ref('');
  const loading = ref(false);
  const error = ref(null);
  const busy = reactive({});
  let t;

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      const params = new URLSearchParams({ page: String(page.value), pageSize: String(pageSize) });
      if (q.value.trim()) params.set('q', q.value.trim());
      const res = await get(`/api/admin/users?${params}`);
      rows.value = res.data;
      total.value = res.meta.total;
      hasNext.value = res.meta.hasNext;
    } catch (err) {
      error.value = err;
    } finally {
      loading.value = false;
    }
  }

  function search(v) {
    q.value = v ?? '';
    clearTimeout(t);
    t = setTimeout(() => {
      page.value = 1;
      load();
    }, 300);
  }

  async function run(id, fn) {
    busy[id] = true;
    try {
      return await fn();
    } finally {
      delete busy[id];
    }
  }

  // → { user, temporaryPassword }
  async function create(payload) {
    const res = await post('/api/admin/users', payload);
    page.value = 1;
    await load();
    return res.data;
  }

  const update = (u, fields) =>
    run(u.id, async () => {
      const res = await patch(`/api/admin/users/${u.id}`, fields);
      Object.assign(u, res.data);
    });

  // → { temporaryPassword }
  const resetPassword = (u) => run(u.id, async () => (await post(`/api/admin/users/${u.id}/reset-password`)).data);

  return { rows, total, page, pageSize, hasNext, q, loading, error, busy, load, search, create, update, resetPassword };
}

export function emptyNewUser() {
  return reactive({ email: '', displayName: '', role: 'user' });
}

export function validateNewUser(f) {
  const e = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Nhập email hợp lệ';
  const n = f.displayName.trim();
  if (n.length < 2 || n.length > 120) e.displayName = 'Họ tên từ 2 đến 120 ký tự';
  return e;
}
