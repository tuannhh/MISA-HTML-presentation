// Access token Google Cloud từ file khoá service account (Application Default Credentials dạng file — GOOGLE_APPLICATION_CREDENTIALS),
// không thêm thư viện: JWT RS256 ký bằng node:crypto → đổi lấy token ở token_uri (OAuth 2.0 JWT bearer). Token giữ trong RAM,
// làm mới trước khi hết hạn 5 phút; nhiều lời gọi cùng lúc chỉ xin 1 lần. KHÔNG log khoá, token hay nội dung file.
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { logger } from './logger.js';

const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const REFRESH_EARLY_MS = 5 * 60000;

/**
 * Đọc + kiểm file khoá. Lỗi → Error có thông điệp tiếng Việt (không chứa nội dung khoá) — dùng cho fail-fast lúc khởi động.
 * @returns {{ project_id, client_email, private_key, private_key_id, token_uri }}
 */
export function loadServiceAccount(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`Không đọc được file khoá GOOGLE_APPLICATION_CREDENTIALS (${err.code || 'lỗi đọc tệp'})`);
  }
  let sa;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error('File khoá GOOGLE_APPLICATION_CREDENTIALS không phải JSON hợp lệ');
  }
  if (sa?.type !== 'service_account') throw new Error('File khoá GOOGLE_APPLICATION_CREDENTIALS không phải khoá service account (type ≠ service_account)');
  for (const k of ['project_id', 'client_email', 'private_key', 'token_uri']) {
    if (!sa[k] || typeof sa[k] !== 'string') throw new Error(`File khoá GOOGLE_APPLICATION_CREDENTIALS thiếu trường ${k}`);
  }
  return sa;
}

export function createServiceAccountTokens(sa, { fetchImpl = fetch, now = Date.now } = {}) {
  let cached = null; // { token, expiresAt }
  let inflight = null;

  async function fetchToken() {
    const iat = Math.floor(now() / 1000);
    const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const unsigned = `${enc({ alg: 'RS256', typ: 'JWT', ...(sa.private_key_id ? { kid: sa.private_key_id } : {}) })}.${enc({ iss: sa.client_email, scope: SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
    let res;
    try {
      res = await fetchImpl(sa.token_uri, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }),
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      logger.warn('google_token_network_error', { err: err.message });
      throw new Error('google_token_network_error');
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.access_token) {
      // invalid_grant: khoá bị thu hồi/xoá hoặc đồng hồ máy chủ lệch (xem docs/RUNBOOK.md).
      logger.warn('google_token_failed', { status: res.status, error: json?.error, description: String(json?.error_description || '').slice(0, 200) });
      throw new Error('google_token_failed');
    }
    return { token: json.access_token, expiresAt: now() + Number(json.expires_in || 3600) * 1000 };
  }

  return {
    async getToken() {
      if (cached && now() < cached.expiresAt - REFRESH_EARLY_MS) return cached.token;
      inflight ??= fetchToken().then(
        (t) => {
          cached = t;
          inflight = null;
          return t.token;
        },
        (err) => {
          inflight = null;
          throw err;
        },
      );
      return inflight;
    },
    /** Google trả 401 (token bị thu hồi sớm) → bỏ token đang giữ, lần sau xin mới. */
    invalidate() {
      cached = null;
    },
  };
}
