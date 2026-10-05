// Helper DUY NHẤT sinh điều kiện cách ly tenant. Mọi truy vấn dữ liệu nghiệp vụ "của tôi" phải đi qua đây —
// không endpoint/repository nào tự viết điều kiện lọc tenant riêng (dễ sót).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertTenantId(tenantId) {
  if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
    // Lỗi lập trình: thiếu tenant → dừng ngay thay vì chạy truy vấn không lọc.
    throw new Error('tenantId không hợp lệ — truy vấn bị chặn để tránh lộ dữ liệu giữa các tenant');
  }
  return tenantId;
}

export function tenantClause(tenantId, alias = '') {
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  return { sql: `${col} = ?`, params: [assertTenantId(tenantId)] };
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}
