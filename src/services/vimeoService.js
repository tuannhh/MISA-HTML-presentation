// Link Vimeo → mã video (+ mã riêng tư của video "không công khai") + ảnh bìa 16:9 + tiêu đề.
// Chỉ gọi tới máy chủ Vimeo cố định qua safeFetch: oEmbed (vimeo.com) và ảnh bìa (i.vimeocdn.com — URL lấy từ oEmbed nhưng
// phải đúng tên miền này mới tải). Người dùng chỉ cung cấp mã số video + mã riêng tư đã kiểm định dạng.
import sharp from 'sharp';
import { safeFetch } from '../lib/safeFetch.js';
import { badRequest, unprocessable, HttpError } from '../lib/httpError.js';
import { VIMEO_ID_RE, VIMEO_HASH_RE } from './specService.js';
import { poster169 } from './youtubeService.js';
import { logger } from '../lib/logger.js';

const HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const THUMB_HOST = 'i.vimeocdn.com';

/** { id, hash } từ các dạng link Vimeo phổ biến; không nhận ra → null. */
export function parseVimeo(input) {
  const raw = String(input || '').trim();
  if (VIMEO_ID_RE.test(raw)) return { id: raw, hash: '' };
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !HOSTS.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  let id = '';
  let hash = '';
  if (url.hostname.toLowerCase() === 'player.vimeo.com') {
    // player.vimeo.com/video/<id>?h=<mã riêng tư>
    if (parts[0] === 'video') id = parts[1] || '';
  } else {
    // vimeo.com/<id>[/<mã riêng tư>] · /channels/<kênh>/<id> · /groups/<nhóm>/videos/<id> · /showcase|album/<x>/video/<id>
    const k = parts.findIndex((p) => VIMEO_ID_RE.test(p));
    if (k >= 0) {
      id = parts[k];
      if (k === 0 && parts[1] && VIMEO_HASH_RE.test(parts[1])) hash = parts[1];
    }
  }
  const h = url.searchParams.get('h');
  if (!hash && h && VIMEO_HASH_RE.test(h)) hash = h;
  return VIMEO_ID_RE.test(id) ? { id, hash: hash.toLowerCase() } : null;
}

const pageUrl = ({ id, hash }) => `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`;

async function fetchInfo(v, fetch) {
  let res;
  try {
    res = await fetch(`https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(pageUrl(v))}`, { timeoutMs: 10000, maxBytes: 256 * 1024, maxRedirects: 2 });
  } catch (err) {
    // Mạng chập chờn: vẫn cho gắn video (thiếu tiêu đề + ảnh bìa).
    logger.warn('vimeo_oembed_failed', { id: v.id, err: err.message });
    return { title: '', thumb: '' };
  }
  if (res.status === 404) throw unprocessable('Không tìm thấy video Vimeo (video đã bị xoá, riêng tư hoặc thiếu mã chia sẻ)', 'VIMEO_NOT_FOUND');
  if (res.status === 401 || res.status === 403) throw unprocessable('Video Vimeo này không cho phép nhúng ngoài Vimeo', 'VIMEO_NOT_EMBEDDABLE');
  if (res.status !== 200) return { title: '', thumb: '' };
  try {
    const json = JSON.parse(res.body.toString('utf8'));
    return { title: String(json.title || '').slice(0, 200), thumb: typeof json.thumbnail_url === 'string' ? json.thumbnail_url : '' };
  } catch {
    return { title: '', thumb: '' };
  }
}

async function fetchThumb(id, thumbUrl, fetch) {
  let url;
  try {
    url = new URL(thumbUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== THUMB_HOST) return null;
  try {
    const res = await fetch(url.href, { timeoutMs: 10000, maxBytes: 4 * 1048576, maxRedirects: 2 });
    if (res.status !== 200) return null;
    const meta = await sharp(res.body).metadata();
    if (!meta.width || meta.width < 200) return null;
    return await poster169(res.body, meta);
  } catch (err) {
    logger.warn('vimeo_thumb_failed', { id, err: err.message });
    return null;
  }
}

export async function resolveVimeo(input, { fetch = safeFetch } = {}) {
  const v = parseVimeo(input);
  if (!v) throw badRequest('Link Vimeo không hợp lệ', 'INVALID_VIMEO_URL');
  try {
    const info = await fetchInfo(v, fetch);
    const thumb = info.thumb ? await fetchThumb(v.id, info.thumb, fetch) : null;
    return { ...v, title: info.title, thumb };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw unprocessable('Chưa đọc được video Vimeo, vui lòng thử lại', 'VIMEO_FAILED');
  }
}
