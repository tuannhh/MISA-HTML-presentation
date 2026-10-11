// Bản giả của frontend/src/lib/api.js: mọi lời gọi đi qua globalThis.__fakeApi(method, path, body) do test đặt.
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
const call = (method) => (path, body) => globalThis.__fakeApi(method, path, body);
export const get = call('GET');
export const post = call('POST');
export const patch = call('PATCH');
export const del = call('DELETE');
export const postForm = call('POST');
export const uploadForm = call('POST');
export const download = async () => {};
export const api = (method, path, o) => globalThis.__fakeApi(method, path, o?.body);
export const setCsrf = () => {};
