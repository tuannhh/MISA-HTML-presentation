// Form đăng nhập / đăng ký / đổi mật khẩu — validate phía giao diện khớp chính sách server (10–128 ký tự, có chữ và số).
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { session, login, register, changePassword } from '@/lib/session.js';
import { safeNext } from '@/router.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function passwordProblem(p) {
  if (!p) return 'Nhập mật khẩu';
  if (p.length < 10) return 'Mật khẩu tối thiểu 10 ký tự';
  if (p.length > 128) return 'Mật khẩu tối đa 128 ký tự';
  if (!/[A-Za-zÀ-ỹ]/.test(p) || !/\d/.test(p)) return 'Mật khẩu cần có cả chữ và số';
  return '';
}

function domainProblem(email) {
  const domains = session.config.allowedEmailDomains || [];
  if (!domains.length) return '';
  const d = email.split('@')[1]?.toLowerCase();
  return domains.includes(d) ? '' : `Chỉ chấp nhận email thuộc: ${domains.map((x) => '@' + x).join(', ')}`;
}

function clear(errors) {
  for (const k of Object.keys(errors)) delete errors[k];
}

function useAfterAuth() {
  const route = useRoute();
  const router = useRouter();
  return (user) => router.replace(user.mustChangePassword ? '/change-password' : safeNext(route.query.next));
}

export function useLoginForm() {
  const form = reactive({ email: '', password: '' });
  const errors = reactive({});
  const submitting = ref(false);
  const formError = ref('');
  const after = useAfterAuth();

  async function submit() {
    clear(errors);
    formError.value = '';
    form.email = form.email.trim();
    if (!EMAIL_RE.test(form.email)) errors.email = 'Nhập email hợp lệ';
    if (!form.password) errors.password = 'Nhập mật khẩu';
    if (Object.keys(errors).length) return;
    submitting.value = true;
    try {
      after(await login(form.email, form.password));
    } catch (err) {
      formError.value = err.message;
    } finally {
      submitting.value = false;
    }
  }
  return { form, errors, submitting, formError, submit };
}

export function useRegisterForm() {
  const form = reactive({ displayName: '', email: '', password: '', confirm: '' });
  const errors = reactive({});
  const submitting = ref(false);
  const formError = ref('');
  const after = useAfterAuth();

  async function submit() {
    clear(errors);
    formError.value = '';
    form.email = form.email.trim();
    form.displayName = form.displayName.trim();
    if (form.displayName.length < 2) errors.displayName = 'Nhập họ tên (tối thiểu 2 ký tự)';
    else if (form.displayName.length > 120) errors.displayName = 'Họ tên tối đa 120 ký tự';
    if (!EMAIL_RE.test(form.email)) errors.email = 'Nhập email hợp lệ';
    else if (domainProblem(form.email)) errors.email = domainProblem(form.email);
    const pw = passwordProblem(form.password);
    if (pw) errors.password = pw;
    if (form.confirm !== form.password) errors.confirm = 'Mật khẩu nhập lại không khớp';
    if (Object.keys(errors).length) return;
    submitting.value = true;
    try {
      after(await register({ email: form.email, password: form.password, displayName: form.displayName }));
    } catch (err) {
      if (err.code === 'EMAIL_TAKEN') errors.email = err.message;
      else formError.value = err.message;
    } finally {
      submitting.value = false;
    }
  }
  return { form, errors, submitting, formError, submit };
}

export function useChangePasswordForm() {
  const form = reactive({ currentPassword: '', newPassword: '', confirm: '' });
  const errors = reactive({});
  const submitting = ref(false);
  const formError = ref('');
  const done = ref(false);
  const router = useRouter();

  async function submit() {
    clear(errors);
    formError.value = '';
    if (!form.currentPassword) errors.currentPassword = 'Nhập mật khẩu hiện tại';
    const pw = passwordProblem(form.newPassword);
    if (pw) errors.newPassword = pw;
    else if (form.newPassword === form.currentPassword) errors.newPassword = 'Mật khẩu mới phải khác mật khẩu hiện tại';
    if (form.confirm !== form.newPassword) errors.confirm = 'Mật khẩu nhập lại không khớp';
    if (Object.keys(errors).length) return;
    submitting.value = true;
    try {
      await changePassword(form.currentPassword, form.newPassword);
      done.value = true;
      router.replace('/decks');
    } catch (err) {
      if (err.code === 'WRONG_PASSWORD') errors.currentPassword = err.message;
      else formError.value = err.message;
    } finally {
      submitting.value = false;
    }
  }
  return { form, errors, submitting, formError, done, submit };
}
