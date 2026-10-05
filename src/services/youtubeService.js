// Link YouTube → mã video + ảnh bìa 16:9 + tiêu đề. Chỉ gọi tới máy chủ YouTube cố định qua safeFetch
// (chặn SSRF, giới hạn dung lượng); người dùng chỉ cung cấp mã video đã kiểm tra định dạng.
import sharp from 'sharp';
import { safeFetch } from '../lib/safeFetch.js';
import { badRequest, unprocessable, HttpError } from '../lib/httpError.js';
import { YOUTUBE_ID_RE } from './specService.js';
import { logger } from '../lib/logger.js';

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const PATH_RE = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/;

/** Mã video 11 ký tự từ mọi dạng link YouTube phổ biến (hoặc chính mã video). Không nhận ra → null. */
export function parseYouTubeId(input) {
  const raw = String(input || '').trim();
  if (YOUTUBE_ID_RE.test(raw)) return raw;
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  let id = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') id = url.pathname.split('/')[1] || null;
  else if (HOSTS.has(host)) id = url.pathname === '/watch' ? url.searchParams.get('v') : PATH_RE.exec(url.pathname)?.[1] || null;
  return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

// Ảnh bìa: maxres (1280×720, có thể không tồn tại) → sd/hq (4:3 có viền đen) cắt giữa về 16:9.
const THUMBS = ['maxresdefault', 'sddefault', 'hqdefault'];

async function fetchThumb(id) {
  for (const name of THUMBS) {
    try {
      const res = await safeFetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { timeoutMs: 10000, maxBytes: 4 * 1048576, maxRedirects: 2 });
      if (res.status !== 200) continue;
      const meta = await sharp(res.body).metadata();
      // YouTube trả ảnh xám 120×90 khi không có bản maxres.
      if (!meta.width || meta.width < 320) continue;
      const w = meta.width;
      const h = Math.min(meta.height, Math.round((w * 9) / 16));
      const top = Math.max(0, Math.round((meta.height - h) / 2));
      const { data, info } = await sharp(res.body)
        .extract({ left: 0, top, width: w, height: h })
        .resize({ width: 1280, height: 720, fit: 'cover', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      return { buffer: data, width: info.width, height: info.height, mime: 'image/webp', bytes: data.length };
    } catch (err) {
      logger.warn('youtube_thumb_failed', { id, name, err: err.message });
    }
  }
  return null;
}

// Tiêu đề + kiểm tra video cho phép nhúng (oEmbed: 401/403 = chủ kênh tắt nhúng, 404 = không tồn tại/riêng tư).
async function fetchInfo(id) {
  try {
    const res = await safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`, { timeoutMs: 10000, maxBytes: 256 * 1024, maxRedirects: 2 });
    if (res.status === 404 || res.status === 400) throw unprocessable('Không tìm thấy video YouTube (video đã bị xoá hoặc ở chế độ riêng tư)', 'YOUTUBE_NOT_FOUND');
    if (res.status === 401 || res.status === 403) throw unprocessable('Video này không cho phép phát nhúng ngoài YouTube', 'YOUTUBE_NOT_EMBEDDABLE');
    if (res.status !== 200) return { title: '' };
    const json = JSON.parse(res.body.toString('utf8'));
    return { title: String(json.title || '').slice(0, 200), author: String(json.author_name || '').slice(0, 120) };
  } catch (err) {
    if (err instanceof HttpError && err.code.startsWith('YOUTUBE_')) throw err;
    // Mạng chập chờn: vẫn cho gắn video (chỉ thiếu tiêu đề).
    logger.warn('youtube_oembed_failed', { id, err: err.message });
    return { title: '' };
  }
}

export async function resolveYouTube(input) {
  const id = parseYouTubeId(input);
  if (!id) throw badRequest('Link YouTube không hợp lệ', 'INVALID_YOUTUBE_URL');
  const info = await fetchInfo(id);
  const thumb = await fetchThumb(id);
  return { id, title: info.title, author: info.author || '', thumb };
}
