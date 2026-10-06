// Tìm ảnh trên Internet theo từ khoá — Pixabay API (ảnh miễn phí bản quyền, dùng thương mại không cần ghi nguồn).
// Điều khoản Pixabay: kết quả tìm kiếm phải được lưu đệm 24 giờ; không hotlink vĩnh viễn → khi người dùng chọn ảnh,
// máy chủ tải ảnh về thành asset của bài (ảnh xem trước trong ô tìm kiếm thì hiển thị trực tiếp từ Pixabay).
// Khoá API chỉ nằm ở máy chủ; URL tải ảnh lấy lại từ API theo mã ảnh (không nhận URL do client gửi → không SSRF).
import { logger } from '../lib/logger.js';
import { HttpError, unavailable, notFound, unprocessable } from '../lib/httpError.js';

const CACHE_TTL_MS = 24 * 3600 * 1000;
const CACHE_MAX = 500;
const PER_PAGE = 24;
const MAX_IMAGE_BYTES = 15 * 1048576;
// Ảnh trả về từ API chỉ được tải từ máy chủ của Pixabay.
const IMAGE_HOSTS = new Set(['pixabay.com', 'cdn.pixabay.com']);

export const STOCK_IMAGE_HOSTS = Object.freeze(['https://pixabay.com', 'https://cdn.pixabay.com']);

export function createStockImageService({ apiKey, baseUrl }, { fetchImpl = fetch } = {}) {
  const cache = new Map();

  function remember(key, value) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { at: Date.now(), value });
    return value;
  }
  function recall(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return hit.value;
  }

  async function api(params) {
    if (!apiKey) throw unavailable('Chức năng tìm ảnh chưa được cấu hình (thiếu khoá Pixabay)', 'STOCK_NOT_CONFIGURED');
    const url = new URL(baseUrl);
    url.search = new URLSearchParams({ key: apiKey, safesearch: 'true', ...params }).toString();
    let res;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    } catch (err) {
      logger.warn('pixabay_network_error', { err: err.message });
      throw unavailable('Không kết nối được dịch vụ tìm ảnh, vui lòng thử lại', 'STOCK_UNAVAILABLE');
    }
    if (res.status === 429) throw new HttpError(429, 'STOCK_QUOTA', 'Dịch vụ tìm ảnh đang quá tải, vui lòng thử lại sau ít phút');
    if (!res.ok) {
      logger.warn('pixabay_http_error', { status: res.status });
      throw unavailable('Dịch vụ tìm ảnh tạm thời lỗi, vui lòng thử lại', 'STOCK_UNAVAILABLE');
    }
    return res.json();
  }

  const toHit = (h) => ({
    id: Number(h.id),
    preview: h.webformatURL || h.previewURL,
    thumb: h.previewURL,
    width: Number(h.imageWidth) || null,
    height: Number(h.imageHeight) || null,
    tags: String(h.tags || '').slice(0, 200),
    author: String(h.user || '').slice(0, 80),
    pageUrl: String(h.pageURL || ''),
  });

  return {
    configured: !!apiKey,

    /** Tìm ảnh (tiếng Việt hoặc tiếng Anh). orientation: all | horizontal | vertical. */
    async search({ q, page = 1, orientation = 'all' }) {
      const query = String(q || '').trim().replace(/\s+/g, ' ').slice(0, 100);
      if (!query) return { hits: [], total: 0, page: 1, hasNext: false };
      const p = Math.min(20, Math.max(1, Number.parseInt(page, 10) || 1));
      const o = ['horizontal', 'vertical'].includes(orientation) ? orientation : 'all';
      const key = `${query.toLowerCase()}|${p}|${o}`;
      const hit = recall(key);
      if (hit) return hit;
      // Có dấu tiếng Việt → tìm theo tiếng Việt (Pixabay tự dịch thẻ); còn lại để mặc định tiếng Anh.
      const lang = /[^\x00-\x7f]/.test(query) ? 'vi' : 'en';
      const json = await api({ q: query, lang, image_type: 'photo', orientation: o, per_page: String(PER_PAGE), page: String(p) });
      const hits = (Array.isArray(json?.hits) ? json.hits : []).filter((h) => h && h.id && (h.webformatURL || h.previewURL)).map(toHit);
      const total = Math.min(Number(json?.totalHits) || 0, 500);
      return remember(key, { hits, total, page: p, hasNext: p * PER_PAGE < total });
    },

    /** Tải ảnh gốc (≤1280px) theo mã ảnh Pixabay → { buffer, name, tags }. */
    async fetchImage(id) {
      const n = Number.parseInt(id, 10);
      if (!Number.isInteger(n) || n <= 0) throw notFound('Không tìm thấy ảnh');
      const json = await api({ id: String(n) });
      const h = Array.isArray(json?.hits) ? json.hits[0] : null;
      const src = h?.largeImageURL || h?.webformatURL;
      if (!src) throw notFound('Không tìm thấy ảnh');
      let url;
      try {
        url = new URL(src);
      } catch {
        throw unprocessable('Không tải được ảnh', 'STOCK_FETCH_FAILED');
      }
      if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname)) throw unprocessable('Không tải được ảnh', 'STOCK_FETCH_FAILED');
      let res;
      try {
        res = await fetchImpl(url, { signal: AbortSignal.timeout(30000), redirect: 'error' });
      } catch {
        throw unavailable('Không tải được ảnh, vui lòng thử lại', 'STOCK_FETCH_FAILED');
      }
      if (!res.ok) throw unavailable('Không tải được ảnh, vui lòng thử lại', 'STOCK_FETCH_FAILED');
      const len = Number(res.headers.get('content-length'));
      if (Number.isFinite(len) && len > MAX_IMAGE_BYTES) throw unprocessable('Ảnh quá lớn', 'STOCK_FETCH_FAILED');
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_IMAGE_BYTES) throw unprocessable('Ảnh quá lớn', 'STOCK_FETCH_FAILED');
      return { buffer, name: `pixabay-${n}`, tags: String(h.tags || '').slice(0, 200) };
    },
  };
}
