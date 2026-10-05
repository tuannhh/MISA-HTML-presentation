// Chọn bề mặt giao diện: 'mobile' (native mini-app) hoặc 'desktop'.
// Quy tắc MDS: chọn theo host/container — KHÔNG theo user-agent, KHÔNG theo vai trò người dùng.
//  1. Chạy trong host MISA AMIS (bridge window.MISAAmisHost hoặc ?host=amis) → luôn mobile, kể cả tablet rộng.
//  2. Ép thủ công để kiểm thử: ?surface=mobile|desktop (ghi nhớ trong phiên tab).
//  3. Trình duyệt thường: container < 1024px → mobile; ngược lại desktop.
import { ref } from 'vue';

const MOBILE_MAX = 1024;

function hostIsAmis() {
  try {
    if (window.MISAAmisHost) return true;
    const q = new URLSearchParams(location.search);
    if (q.get('host') === 'amis') sessionStorage.setItem('mp.host', 'amis');
    return sessionStorage.getItem('mp.host') === 'amis';
  } catch {
    return false;
  }
}

function forced() {
  try {
    const q = new URLSearchParams(location.search).get('surface');
    if (q === 'mobile' || q === 'desktop') sessionStorage.setItem('mp.surface', q);
    return sessionStorage.getItem('mp.surface');
  } catch {
    return null;
  }
}

function compute() {
  if (hostIsAmis()) return 'mobile';
  const f = forced();
  if (f) return f;
  return document.documentElement.clientWidth < MOBILE_MAX ? 'mobile' : 'desktop';
}

export const surface = ref(compute());

let t;
window.addEventListener('resize', () => {
  clearTimeout(t);
  t = setTimeout(() => {
    surface.value = compute();
  }, 150);
});

// Back ở màn gốc mini-app: gọi adapter host (nếu có) thay vì đoán URL.
export function exitToHost() {
  if (window.MISAAmisHost?.close) window.MISAAmisHost.close();
  else history.length > 1 ? history.back() : (location.href = '/');
}
