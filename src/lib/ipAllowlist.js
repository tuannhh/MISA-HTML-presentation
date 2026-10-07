// Danh sách IP được phép truy cập ứng dụng (máy chủ đặt trong mạng MISA). Mỗi mục là 1 trong 3 dạng:
//   IP đơn        203.0.113.7 | 2001:db8::7
//   Dải CIDR      203.0.113.0/24 | 2001:db8::/32
//   Khoảng IP     203.0.113.10-203.0.113.50
// Dùng net.BlockList của Node (không thêm thư viện). IPv4-mapped IPv6 (::ffff:a.b.c.d — Node trả khi socket dual-stack)
// được quy về IPv4 trước khi so khớp.
import { BlockList, isIP } from 'node:net';

const MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

export function normalizeIp(ip) {
  const s = String(ip || '').trim();
  const m = MAPPED.exec(s);
  return m ? m[1] : s;
}

const family = (ip) => ({ 4: 'ipv4', 6: 'ipv6' })[isIP(ip)];

// Trả { errors } khi có mục sai — cấu hình gọi để fail-fast lúc khởi động; mục hợp lệ được nạp vào BlockList.
export function parseIpAllowlist(entries = []) {
  const list = new BlockList();
  const errors = [];
  for (const raw of entries) {
    const entry = String(raw).trim();
    if (!entry) continue;
    if (entry.includes('/')) {
      const [addr, bits, extra] = entry.split('/');
      const type = family(normalizeIp(addr));
      const prefix = /^\d{1,3}$/.test(bits || '') ? Number(bits) : NaN;
      if (!type || extra !== undefined || !(prefix >= 0 && prefix <= (type === 'ipv4' ? 32 : 128))) errors.push(entry);
      else list.addSubnet(normalizeIp(addr), prefix, type);
    } else if (entry.includes('-')) {
      const [a, b, extra] = entry.split('-').map((s) => normalizeIp(s));
      const type = family(a);
      try {
        if (!type || extra !== undefined || family(b) !== type) throw new Error();
        list.addRange(a, b, type); // ném lỗi khi đầu > cuối
      } catch {
        errors.push(entry);
      }
    } else {
      const ip = normalizeIp(entry);
      const type = family(ip);
      if (!type) errors.push(entry);
      else list.addAddress(ip, type);
    }
  }
  return { list, errors };
}

// Hàm kiểm tra IP; danh sách rỗng → null (không giới hạn). Mục sai → ném lỗi.
export function createIpMatcher(entries = []) {
  const items = entries.map((s) => String(s).trim()).filter(Boolean);
  if (!items.length) return null;
  const { list, errors } = parseIpAllowlist(items);
  if (errors.length) throw new Error(`IP_ALLOWLIST có mục không hợp lệ: ${errors.join(', ')}`);
  return (ip) => {
    const n = normalizeIp(ip);
    const type = family(n);
    return Boolean(type) && list.check(n, type);
  };
}
