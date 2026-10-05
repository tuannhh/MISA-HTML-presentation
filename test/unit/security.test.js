// Kiểm thử các lớp bảo vệ: SSRF, nhận diện tệp bằng magic bytes, cách ly tenant, URL ảnh có chữ ký.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockedAddress, assertPublicUrl } from '../../src/lib/safeFetch.js';
import { sniff } from '../../src/lib/fileType.js';
import { tenantClause, assertTenantId, isUuid } from '../../src/repositories/tenantScope.js';
import { createUrlSigner } from '../../src/lib/signedUrl.js';

test('SSRF: chặn địa chỉ nội bộ, loopback, metadata, IPv4-mapped', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.5', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'not-an-ip']) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '142.250.72.14', '2001:4860:4860::8888']) assert.equal(isBlockedAddress(ip), false, ip);
});

test('SSRF: chỉ nhận http/https cổng chuẩn, không thông tin đăng nhập, không IP nội bộ', () => {
  for (const bad of ['file:///etc/passwd', 'ftp://example.com/a', 'http://user:pw@example.com/', 'http://example.com:8080/', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data', 'khong phai url']) {
    assert.throws(() => assertPublicUrl(bad), (e) => e.status === 400, bad);
  }
  assert.doesNotThrow(() => assertPublicUrl('https://docs.google.com/presentation/d/abc/edit'));
});

test('magic bytes: không tin phần mở rộng', () => {
  assert.equal(sniff(Buffer.from('%PDF-1.7\n')), 'pdf');
  assert.equal(sniff(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0])), 'zip');
  assert.equal(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), 'png');
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'webp');
  assert.equal(sniff(Buffer.from('Xin chào, đây là văn bản UTF-8.')), 'text');
  assert.equal(sniff(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03])), 'unknown'); // tệp .exe
  assert.equal(sniff(Buffer.alloc(2)), 'unknown');
});

test('tenantClause: luôn sinh điều kiện tenant, thiếu/sai tenant → dừng truy vấn', () => {
  const t = '0b6f1c1e-5a0b-4c7e-9d36-1f1e2a3b4c5d';
  assert.deepEqual(tenantClause(t), { sql: 'tenant_id = ?', params: [t] });
  assert.deepEqual(tenantClause(t, 'p'), { sql: 'p.tenant_id = ?', params: [t] });
  for (const bad of [undefined, null, '', '1 OR 1=1', 42, {}]) assert.throws(() => assertTenantId(bad));
  assert.equal(isUuid(t), true);
  assert.equal(isUuid(`${t}' --`), false);
});

test('URL ảnh có chữ ký: đúng id + còn hạn mới hợp lệ', () => {
  const s = createUrlSigner('khoa-bi-mat-thu-nghiem-du-dai-32-ky-tu');
  const id = '0b6f1c1e-5a0b-4c7e-9d36-1f1e2a3b4c5d';
  const u = new URL(s.url(id), 'http://x');
  const exp = u.searchParams.get('exp');
  const sig = u.searchParams.get('sig');
  assert.equal(s.verify(id, exp, sig), true);
  assert.equal(s.verify('1b6f1c1e-5a0b-4c7e-9d36-1f1e2a3b4c5d', exp, sig), false, 'chữ ký không dùng được cho ảnh khác');
  assert.equal(s.verify(id, String(Number(exp) + 3600), sig), false, 'không tự kéo dài hạn');
  assert.equal(s.verify(id, '1000', sig), false, 'hết hạn');
  assert.equal(createUrlSigner('khoa-khac-hoan-toan-cung-du-dai-32-ky-tu').verify(id, exp, sig), false);
});
