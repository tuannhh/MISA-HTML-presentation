// Tải nội dung từ URL do người dùng cung cấp, chống SSRF:
// - chỉ http/https, cổng 80/443;
// - kiểm tra IP thật tại thời điểm kết nối (custom lookup) → chặn dải nội bộ/loopback/metadata,
//   chống cả DNS rebinding giữa bước kiểm tra và bước kết nối;
// - tự xử lý redirect (kiểm tra lại từng bước), giới hạn số lần, thời gian và dung lượng.
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { badRequest, tooLarge, HttpError } from './httpError.js';

const blockList = new net.BlockList();
[
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
].forEach(([a, p]) => blockList.addSubnet(a, p, 'ipv4'));
[
  ['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96],
  ['100::', 64],
].forEach(([a, p]) => blockList.addSubnet(a, p, 'ipv6'));

export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (family === 0) return true;
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blockList.check(mapped[1], 'ipv4');
    return blockList.check(address, 'ipv6');
  }
  return blockList.check(address, 'ipv4');
}

function guardedLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const bad = list.find((a) => isBlockedAddress(a.address));
    if (bad || list.length === 0) {
      const e = new Error('Địa chỉ đích thuộc mạng nội bộ, không được phép truy cập');
      e.code = 'SSRF_BLOCKED';
      return callback(e);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

export function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw badRequest('Đường link không hợp lệ', 'INVALID_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Chỉ hỗ trợ link http/https', 'INVALID_URL');
  if (url.username || url.password) throw badRequest('Link không được chứa thông tin đăng nhập', 'INVALID_URL');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (![80, 443].includes(port)) throw badRequest('Chỉ hỗ trợ cổng 80/443', 'INVALID_URL');
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && isBlockedAddress(url.hostname.replace(/^\[|\]$/g, ''))) {
    throw badRequest('Địa chỉ đích thuộc mạng nội bộ, không được phép truy cập', 'SSRF_BLOCKED');
  }
  return url;
}

function requestOnce(url, { timeoutMs, maxBytes, headers }) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        headers: { 'user-agent': 'MISA-Presentation/1.0 (+document-import)', 'accept-encoding': 'identity', ...headers },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: new URL(res.headers.location, url) });
        }
        const declared = Number(res.headers['content-length'] || 0);
        if (declared && declared > maxBytes) {
          res.destroy();
          return reject(tooLarge(`Tệp từ link vượt quá ${Math.round(maxBytes / 1048576)} MB`));
        }
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(tooLarge(`Tệp từ link vượt quá ${Math.round(maxBytes / 1048576)} MB`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          resolve({
            status,
            contentType: String(res.headers['content-type'] || ''),
            disposition: String(res.headers['content-disposition'] || ''),
            body: Buffer.concat(chunks),
            finalUrl: url,
          }),
        );
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new HttpError(504, 'FETCH_TIMEOUT', 'Hết thời gian tải nội dung từ link')));
    req.on('error', (err) => {
      if (err instanceof HttpError) return reject(err);
      if (err.code === 'SSRF_BLOCKED') return reject(badRequest(err.message, 'SSRF_BLOCKED'));
      if (err.code === 'ENOTFOUND') return reject(badRequest('Không tìm thấy tên miền của link', 'FETCH_FAILED'));
      return reject(new HttpError(502, 'FETCH_FAILED', 'Không tải được nội dung từ link'));
    });
    req.end();
  });
}

export async function safeFetch(raw, { timeoutMs = 30000, maxBytes = 50 * 1048576, maxRedirects = 5, headers = {} } = {}) {
  let url = assertPublicUrl(raw);
  for (let i = 0; i <= maxRedirects; i += 1) {
    const res = await requestOnce(url, { timeoutMs, maxBytes, headers });
    if (!res.redirect) return res;
    url = assertPublicUrl(res.redirect.toString());
  }
  throw badRequest('Link chuyển hướng quá nhiều lần', 'TOO_MANY_REDIRECTS');
}
