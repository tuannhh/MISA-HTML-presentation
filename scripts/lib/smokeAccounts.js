// Quy ước email của tài khoản do smoke test tạo: smoke-<vai>-<stamp>@misa.com.vn.
// Dùng chung cho test/smoke/provision.mjs (tạo) và scripts/smoke-cleanup.js (dọn) → script dọn chỉ chạm đúng tài khoản smoke.
export const STAMP_RE = /^[a-z0-9]{4,16}$/;
const ROLE_RE = /^[a-z]{1,12}$/;
const SMOKE_EMAIL_RE = /^smoke-([a-z]{1,12})-([a-z0-9]{4,16})@misa\.com\.vn$/;

export function smokeEmail(role, stamp) {
  if (!ROLE_RE.test(role) || !STAMP_RE.test(stamp)) throw new Error(`vai/stamp smoke không hợp lệ: ${role}/${stamp}`);
  return `smoke-${role}-${stamp}@misa.com.vn`;
}

/** Email có đúng là tài khoản smoke (và thuộc lần chạy `stamp`, nếu truyền) không. */
export function isSmokeEmail(email, stamp = null) {
  const m = SMOKE_EMAIL_RE.exec(String(email || ''));
  return Boolean(m) && (!stamp || m[2] === stamp);
}
