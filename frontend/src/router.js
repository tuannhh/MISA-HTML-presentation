// Định tuyến: mỗi route khai báo 2 composition riêng — meta.desktop và meta.mobile (MDS: không co desktop thành mobile).
// Thứ tự kiểm tra: phiên → đổi mật khẩu bắt buộc → quyền admin (403 vẫn render trong shell của bề mặt hiện tại).
import { createRouter, createWebHistory } from 'vue-router';
import { defineAsyncComponent, h } from 'vue';
import { session, loadSession, isAdmin } from './lib/session.js';

const lazy = (loader) => defineAsyncComponent(loader);
const pair = (d, m) => ({ desktop: lazy(d), mobile: lazy(m) });
// RouterView cần component; nội dung thật do App.vue chọn theo bề mặt.
const Holder = { render: () => h('div') };

const routes = [
  { path: '/', redirect: '/decks' },
  { path: '/login', component: Holder, meta: { guest: true, title: 'Đăng nhập', ...pair(() => import('./desktop/LoginPage.vue'), () => import('./mobile/LoginPage.vue')) } },
  { path: '/register', component: Holder, meta: { guest: true, title: 'Đăng ký', ...pair(() => import('./desktop/RegisterPage.vue'), () => import('./mobile/RegisterPage.vue')) } },
  { path: '/change-password', component: Holder, meta: { auth: true, allowMustChange: true, title: 'Đổi mật khẩu', ...pair(() => import('./desktop/ChangePasswordPage.vue'), () => import('./mobile/ChangePasswordPage.vue')) } },
  { path: '/decks', component: Holder, meta: { auth: true, nav: 'mine', title: 'Bài của tôi', ...pair(() => import('./desktop/DecksPage.vue'), () => import('./mobile/DecksPage.vue')) } },
  { path: '/public', component: Holder, meta: { auth: true, nav: 'public', title: 'Thư viện công khai', ...pair(() => import('./desktop/DecksPage.vue'), () => import('./mobile/DecksPage.vue')) } },
  { path: '/create', component: Holder, meta: { auth: true, nav: 'create', title: 'Tạo bài trình bày', ...pair(() => import('./desktop/CreatePage.vue'), () => import('./mobile/CreatePage.vue')) } },
  { path: '/p/:id/edit', component: Holder, meta: { auth: true, nav: 'mine', title: 'Chỉnh sửa', ...pair(() => import('./desktop/EditorPage.vue'), () => import('./mobile/EditorPage.vue')) } },
  { path: '/p/:id/view', component: Holder, meta: { auth: true, nav: 'public', title: 'Trình chiếu', ...pair(() => import('./desktop/ViewerPage.vue'), () => import('./mobile/ViewerPage.vue')) } },
  { path: '/account', component: Holder, meta: { auth: true, nav: 'account', title: 'Tài khoản', ...pair(() => import('./desktop/AccountPage.vue'), () => import('./mobile/AccountPage.vue')) } },
  { path: '/admin/users', component: Holder, meta: { auth: true, admin: true, nav: 'admin', title: 'Quản trị người dùng', ...pair(() => import('./desktop/AdminUsersPage.vue'), () => import('./mobile/AdminUsersPage.vue')) } },
  { path: '/403', component: Holder, meta: { auth: true, title: 'Không có quyền', ...pair(() => import('./desktop/ForbiddenPage.vue'), () => import('./mobile/ForbiddenPage.vue')) } },
  { path: '/:pathMatch(.*)*', component: Holder, meta: { title: 'Không tìm thấy trang', ...pair(() => import('./desktop/NotFoundPage.vue'), () => import('./mobile/NotFoundPage.vue')) } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

// Chỉ chấp nhận đường dẫn nội bộ cho ?next= (chống open redirect).
export const safeNext = (v) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : '/decks');

router.beforeEach(async (to) => {
  if (!session.loaded) {
    try {
      await loadSession();
    } catch {
      session.loaded = true; // máy chủ lỗi → để trang tự báo lỗi khi gọi API
    }
  }
  const user = session.user;
  if (to.meta.guest && user) return user.mustChangePassword ? '/change-password' : '/decks';
  if (to.meta.auth && !user) return { path: '/login', query: to.fullPath !== '/decks' ? { next: to.fullPath } : {} };
  if (user?.mustChangePassword && to.meta.auth && !to.meta.allowMustChange) return '/change-password';
  if (to.meta.admin && !isAdmin()) return { path: '/403', replace: true };
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · MISA Presentation` : 'MISA Presentation';
});

// API trả 401 (phiên hết hạn/bị thu hồi) → về đăng nhập, giữ đường dẫn hiện tại.
window.addEventListener('mp:unauthorized', () => {
  session.user = null;
  const cur = router.currentRoute.value;
  if (cur.meta.auth) router.replace({ path: '/login', query: { next: cur.fullPath } });
});
