// Trang công khai của bài đã xuất bản — PHÂN LUỒNG THEO DOMAIN: mọi request có Host = PUBLISH_BASE_URL đi vào đây và
// KẾT THÚC ở đây (không bao giờ tới giao diện/API nội bộ, không phiên đăng nhập, không IP_ALLOWLIST). Request tới domain nội bộ
// không bao giờ thấy trang xuất bản.
//  - Chặn lập chỉ mục (công cụ nội bộ): robots.txt Disallow toàn bộ + X-Robots-Tag noindex trên MỌI phản hồi.
//  - Thân thiện CDN (mặc định có CDN phía trước): trang HTML lưu đệm ngắn (gỡ xuất bản có hiệu lực sau tối đa vài phút nếu CDN
//    chưa purge), ETag theo revision; media URL chứa revision nên bất biến → lưu đệm 1 năm.
import { Router } from 'express';
import { parsePublicPath } from '../lib/slug.js';
import { logger } from '../lib/logger.js';

export const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
export const PAGE_CACHE = 'public, max-age=60, s-maxage=300, stale-while-revalidate=60';
export const MISS_CACHE = 'public, max-age=30, s-maxage=60';
export const MEDIA_CACHE = 'public, max-age=31536000, immutable';

// CSP trang xuất bản: chỉ script/style có nonce (lưu cùng bản xuất bản — trang tĩnh nên nonce cố định theo revision,
// HTML do renderer sinh với mọi dữ liệu đã esc()); media chỉ từ chính domain; YouTube phát trong khung nocookie; không gọi mạng.
export function publishedCsp(nonce) {
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    'frame-src https://www.youtube-nocookie.com',
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

const NOT_FOUND_HTML = '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Không tìm thấy</title></head><body style="font-family:system-ui,sans-serif;margin:15vh auto;max-width:32rem;padding:0 16px;color:#1f2937"><h1 style="font-size:1.25rem">Không tìm thấy bài trình bày</h1><p>Liên kết không đúng hoặc bài đã ngừng xuất bản.</p></body></html>';

export function isPublishHost(config, req) {
  return Boolean(config.publish.host) && req.hostname?.toLowerCase() === config.publish.host;
}

export function publicSiteRoutes({ publications }) {
  const r = Router();

  r.use((_req, res, next) => {
    res.set('X-Robots-Tag', NOINDEX);
    // helmet đặt no-store/CSP của ứng dụng — ở domain công khai thay bằng giá trị riêng từng route.
    res.removeHeader('Content-Security-Policy');
    next();
  });

  r.get('/robots.txt', (_req, res) => {
    res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
    res.send('User-agent: *\nDisallow: /\n');
  });

  // Media của bản xuất bản: chỉ revision ĐANG công khai. res.sendFile hỗ trợ Range (tua video).
  r.get('/m/:code/:rev/:file', async (req, res, next) => {
    try {
      const file = req.params.code.length === 8 ? await publications.mediaPath(req.params.code, req.params.rev, req.params.file) : null;
      if (!file) return notFound(res);
      res.set({ 'Cache-Control': MEDIA_CACHE, 'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'same-origin' });
      return res.sendFile(file, { dotfiles: 'deny', etag: true, lastModified: false, cacheControl: false }, (err) => {
        if (err && !res.headersSent) notFound(res);
      });
    } catch (err) {
      return next(err);
    }
  });

  r.get(/^\/[^/]+\/?$/, async (req, res, next) => {
    try {
      const parsed = parsePublicPath(req.path);
      if (!parsed) return notFound(res);
      const result = await publications.page(parsed.slug, parsed.code);
      if (!result) return notFound(res);
      if (result.redirect) {
        res.set('Cache-Control', 'public, max-age=300');
        return res.redirect(301, result.redirect);
      }
      const etag = `"${result.pub.revision}"`;
      res.set({
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': publishedCsp(result.pub.csp_nonce),
        // YouTube cần Referer (thiếu → lỗi 153 trong khung phát).
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cache-Control': PAGE_CACHE,
        ETag: etag,
      });
      if (req.fresh) return res.status(304).end();
      return res.send(result.html);
    } catch (err) {
      return next(err);
    }
  });

  r.use((req, res) => notFound(res));

  // Lỗi bất ngờ: không lộ chi tiết, không cho CDN lưu đệm.
  // eslint-disable-next-line no-unused-vars
  r.use((err, req, res, _next) => {
    logger.error('publish_site_error', { p: req.path, err: err.message });
    if (res.headersSent) return res.end();
    res.status(500).set({ 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
    return res.send('Lỗi máy chủ');
  });

  return r;
}

function notFound(res) {
  res.status(404).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': MISS_CACHE, 'Content-Security-Policy': "default-src 'none'; style-src-attr 'unsafe-inline'" });
  return res.send(NOT_FOUND_HTML);
}
