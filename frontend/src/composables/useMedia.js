// Media của 1 bài trình bày (dùng chung trang dàn ý + trình soạn thảo, desktop + mobile):
// ảnh, logo (+ tách nền), video tải lên (+ ảnh bìa chụp ngay trên trình duyệt), video YouTube.
// assets: ref tới mảng asset của bài (cập nhật tại chỗ khi thêm mới).
import { postForm, post, get, uploadForm, ApiError } from '@/lib/api.js';
import { IMAGE_ACCEPT as IMG_ACCEPT, isImageFile, heicToJpeg } from '@/lib/fileKinds.js';

export const MAX_IMAGE_MB = 15;
export const MAX_VIDEO_MB = 150;
export const VIDEO_ACCEPT = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';
export const IMAGE_ACCEPT = IMG_ACCEPT;
export const LOGO_ACCEPT = `${IMG_ACCEPT},image/svg+xml,.svg`;
const MB = 1048576;

function once(el, ev, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    el.addEventListener(ev, () => { clearTimeout(t); resolve(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(t); reject(new Error('media error')); }, { once: true });
  });
}

// Ảnh bìa video: khung hình ở ~10% thời lượng (tối đa giây thứ 1). Trình duyệt không giải mã được (vd. MOV HEVC) → null.
export async function capturePoster(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    await once(v, 'loadedmetadata', 10000);
    if (!v.videoWidth || !v.videoHeight) return null;
    v.currentTime = Math.min(1, Number.isFinite(v.duration) ? v.duration * 0.1 : 0.1) || 0.1;
    await once(v, 'seeked', 10000);
    const w = Math.min(1280, v.videoWidth);
    const h = Math.round((w * v.videoHeight) / v.videoWidth);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.getContext('2d').drawImage(v, 0, 0, w, h);
    return await new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.86));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Logo SVG: máy chủ chỉ nhận ảnh raster → vẽ SVG ra PNG trong suốt ngay trên trình duyệt (<img> không chạy script trong SVG).
export async function rasterizeSvg(file, longSide = 1200) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const nw = img.naturalWidth || 300;
    const nh = img.naturalHeight || 300;
    const k = longSide / Math.max(nw, nh);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(nw * k));
    cv.height = Math.max(1, Math.round(nh * k));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas');
    return new File([blob], file.name.replace(/\.svg$/i, '.png'), { type: 'image/png' });
  } catch {
    throw new ApiError(0, 'INVALID_IMAGE', 'Không đọc được tệp SVG');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function useMedia(id, assets) {
  const push = (...list) => {
    const known = new Set((assets.value || []).map((a) => a.id));
    assets.value = [...(assets.value || []), ...list.filter((a) => a && !known.has(a.id))];
  };
  const byId = (aid) => (assets.value || []).find((a) => a.id === aid) || null;
  const assetUrl = (aid) => byId(aid)?.url || '';
  const ofKind = (...kinds) => (assets.value || []).filter((a) => kinds.includes(a.kind));

  // Ảnh: kiểm tra loại trước khi gửi (kéo-thả không lọc theo accept), HEIC → JPEG ngay trên trình duyệt.
  async function uploadImage(picked) {
    if (!isImageFile(picked)) throw new ApiError(0, 'INVALID_IMAGE', 'Chỉ nhận ảnh PNG, JPEG, WebP, GIF, AVIF hoặc HEIC');
    const file = await heicToJpeg(picked);
    if (file.size > MAX_IMAGE_MB * MB) throw new ApiError(0, 'FILE_TOO_LARGE', `Ảnh tối đa ${MAX_IMAGE_MB} MB`);
    const form = new FormData();
    form.set('file', file);
    const a = (await postForm(`/api/presentations/${id}/assets`, form)).data;
    push(a);
    return a;
  }

  async function uploadLogo(file) {
    const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
    if (!isSvg && !isImageFile(file)) throw new ApiError(0, 'INVALID_IMAGE', 'Logo phải là ảnh PNG, JPEG, WebP, SVG hoặc HEIC');
    const f = isSvg ? await rasterizeSvg(file) : await heicToJpeg(file);
    if (f.size > MAX_IMAGE_MB * MB) throw new ApiError(0, 'FILE_TOO_LARGE', `Logo tối đa ${MAX_IMAGE_MB} MB`);
    const form = new FormData();
    form.set('file', f, f.name);
    const a = (await postForm(`/api/presentations/${id}/logo`, form)).data;
    push(a);
    return a;
  }

  async function cutoutLogo(assetId, mode = 'auto') {
    const res = (await post(`/api/presentations/${id}/logo/${assetId}/cutout`, { mode })).data;
    push(res.asset);
    return res;
  }

  async function uploadVideo(file, { onProgress } = {}) {
    if (file.size > MAX_VIDEO_MB * MB) throw new ApiError(0, 'FILE_TOO_LARGE', `Video tối đa ${MAX_VIDEO_MB} MB`);
    const poster = await capturePoster(file);
    const form = new FormData();
    form.set('file', file, file.name);
    if (poster) form.set('poster', poster, 'poster.jpg');
    const res = (await uploadForm(`/api/presentations/${id}/videos`, form, { onProgress })).data;
    push(...res.assets);
    return res.video;
  }

  async function addYouTube(url) {
    const res = (await post(`/api/presentations/${id}/youtube`, { url })).data;
    push(...res.assets);
    return res.video;
  }

  // Ảnh AI (Nano Banana 2 Lite) theo mô tả → asset mới của bài; trả { asset, alt }.
  async function generateImage(prompt, aspect = '16:9') {
    const res = (await post(`/api/presentations/${id}/images/generate`, { prompt, aspect })).data;
    push(res.asset);
    return res;
  }

  // Tìm ảnh trên Internet (Pixabay) — chỉ là kết quả xem trước, chọn ảnh nào thì mới tải về thành asset (importStock).
  async function searchImages(q, { page = 1, orientation = '', signal } = {}) {
    const qs = new URLSearchParams({ q, page: String(page) });
    if (orientation) qs.set('orientation', orientation);
    const res = await get(`/api/images/search?${qs}`, { signal });
    return { hits: res.data || [], hasNext: !!res.meta?.hasNext, total: res.meta?.total || 0, page: res.meta?.page || page };
  }

  async function importStock(stockId) {
    const res = (await post(`/api/presentations/${id}/images/import`, { provider: 'pixabay', id: stockId })).data;
    push(res.asset);
    return res;
  }

  // Chỉnh sửa ảnh (cắt/xoay/lật/sáng/rực/tương phản) — máy chủ luôn áp lên ảnh gốc srcId; trả { asset, src, edit }.
  async function editImage(srcId, edit) {
    const res = (await post(`/api/presentations/${id}/assets/${srcId}/edit`, edit || {})).data;
    push(res.asset);
    return res;
  }

  return { byId, assetUrl, ofKind, uploadImage, uploadLogo, cutoutLogo, uploadVideo, addYouTube, generateImage, searchImages, importStock, editImage };
}

// Nguồn phát cho lớp video của ứng dụng (xem trước trong dàn ý / trình soạn thảo).
export function videoSource(video, media) {
  if (!video) return null;
  if (video.provider === 'youtube') return { provider: 'youtube', id: video.id, title: video.title };
  const url = media.assetUrl(video.asset);
  return url ? { provider: 'file', src: url, title: video.title } : null;
}

// Nhận link YouTube phía giao diện (kiểm tra sớm, máy chủ kiểm tra lại).
export function looksLikeYouTube(v) {
  return /(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(String(v || '')) || /^[A-Za-z0-9_-]{11}$/.test(String(v || '').trim());
}
