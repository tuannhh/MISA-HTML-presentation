// Lớp gọi API duy nhất của giao diện: gắn CSRF token, chuẩn hoá lỗi { code, message }, không tự nuốt lỗi.
let csrfToken = '';

export function setCsrf(token) {
  if (token) csrfToken = token;
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function ensureCsrf() {
  if (csrfToken) return;
  const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const json = await res.json().catch(() => null);
  setCsrf(json?.data?.token);
}

export async function api(method, path, { body, form, signal, retryCsrf = true } = {}) {
  const headers = { accept: 'application/json' };
  if (method !== 'GET') {
    await ensureCsrf();
    headers['x-csrf-token'] = csrfToken;
  }
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, credentials: 'same-origin', signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.');
  }
  const json = await res.json().catch(() => null);
  if (json?.data?.csrfToken) setCsrf(json.data.csrfToken);
  if (!res.ok) {
    const e = json?.error || {};
    // Token CSRF hết hạn (phiên mới) → lấy lại 1 lần rồi thử lại.
    if (e.code === 'CSRF_INVALID' && retryCsrf) {
      csrfToken = '';
      return api(method, path, { body, form, signal, retryCsrf: false });
    }
    if (res.status === 401) window.dispatchEvent(new CustomEvent('mp:unauthorized'));
    throw new ApiError(res.status, e.code || 'HTTP_ERROR', e.message || `Lỗi ${res.status}`, e.details);
  }
  return json;
}

export const get = (path, opts) => api('GET', path, opts);
export const post = (path, body, opts) => api('POST', path, { ...opts, body });
export const patch = (path, body, opts) => api('PATCH', path, { ...opts, body });
export const put = (path, body, opts) => api('PUT', path, { ...opts, body });
export const del = (path, opts) => api('DELETE', path, opts);
export const postForm = (path, form, opts) => api('POST', path, { ...opts, form });

/**
 * Gửi multipart có báo tiến trình tải lên (fetch chưa hỗ trợ upload progress) — dùng cho tệp nguồn lớn (tới vài trăm MB).
 * Cùng quy ước với api(): CSRF, chuẩn hoá lỗi ApiError, thử lại 1 lần khi CSRF hết hạn.
 */
export async function uploadForm(path, form, { onProgress, retryCsrf = true } = {}) {
  await ensureCsrf();
  const { status, json } = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('x-csrf-token', csrfToken);
    xhr.responseType = 'json';
    if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => resolve({ status: xhr.status, json: xhr.response });
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK', 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.'));
    xhr.send(form);
  });
  if (json?.data?.csrfToken) setCsrf(json.data.csrfToken);
  if (status >= 200 && status < 300) return json;
  const e = json?.error || {};
  if (e.code === 'CSRF_INVALID' && retryCsrf) {
    csrfToken = '';
    return uploadForm(path, form, { onProgress, retryCsrf: false });
  }
  if (status === 401) window.dispatchEvent(new CustomEvent('mp:unauthorized'));
  // 413 không kèm JSON = proxy phía trước (Nginx) chặn trước khi tới ứng dụng (client_max_body_size thấp hơn MAX_UPLOAD_MB).
  const fallback = status === 413 ? 'Tổng dung lượng tệp vượt giới hạn máy chủ cho phép' : `Lỗi ${status}`;
  throw new ApiError(status, e.code || (status === 413 ? 'UPLOAD_TOO_LARGE' : 'HTTP_ERROR'), e.message || fallback, e.details);
}

// Tải file (HTML/PDF) bằng fetch để giữ cookie + báo lỗi tiếng Việt thay vì trang lỗi trình duyệt.
export async function download(path, fallbackName) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new ApiError(res.status, json?.error?.code || 'HTTP_ERROR', json?.error?.message || `Lỗi ${res.status}`);
  }
  const blob = await res.blob();
  const cd = res.headers.get('content-disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
