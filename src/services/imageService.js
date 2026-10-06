// Chuẩn hoá ảnh: giải mã bằng sharp (đồng thời xác thực là ảnh thật), xoay theo EXIF, bỏ metadata,
// thu về tối đa 1920px, nén WebP. Ảnh quá nhỏ (icon, bullet) bị bỏ qua khi trích từ tài liệu.
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { sniff, IMAGE_TYPES } from '../lib/fileType.js';
import { unprocessable } from '../lib/httpError.js';

sharp.cache(false);
sharp.concurrency(2);

const MAX_PIXELS = 60_000_000;

export async function normalizeImage(buffer, { maxSide = 1920, quality = 82 } = {}) {
  const kind = sniff(buffer);
  if (kind === 'heic') throw unprocessable('Ảnh HEIC (iPhone) chưa đọc được — hãy chuyển sang JPEG/PNG rồi tải lại', 'INVALID_IMAGE');
  if (!IMAGE_TYPES.has(kind)) throw unprocessable('Tệp không phải ảnh PNG/JPEG/GIF/WebP/AVIF hợp lệ', 'INVALID_IMAGE');
  try {
    const img = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false });
    const { data, info } = await img
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, mime: 'image/webp', bytes: data.length };
  } catch {
    throw unprocessable('Không đọc được ảnh (tệp hỏng hoặc quá lớn)', 'INVALID_IMAGE');
  }
}

// Ảnh trích từ tài liệu: bỏ ảnh lỗi/quá nhỏ/trùng lặp thay vì làm hỏng cả lượt tạo.
export async function normalizeExtractedImages(list, { max, minSide = 96 }) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    if (out.length >= max) break;
    const hash = createHash('sha1').update(item.buffer).digest('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    try {
      const meta = await sharp(item.buffer, { limitInputPixels: MAX_PIXELS }).metadata();
      if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < minSide) continue;
      const img = await normalizeImage(item.buffer);
      out.push({ ...img, name: item.name, hint: item.hint || '', ...(item.ui ? { ui: item.ui } : {}) });
    } catch {
      // ảnh không đọc được (EMF/WMF/hỏng) → bỏ qua
    }
  }
  return out;
}

// Bản thu nhỏ gửi cho AI xem: đủ lớn để đọc chữ trong ảnh chụp tài liệu (OCR) nhưng vẫn tiết kiệm token.
export async function previewForModel(buffer, { side = 640 } = {}) {
  return sharp(buffer).resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
}

/**
 * Chỉ số thị giác để phân biệt ảnh chụp thật với đồ hoạ (slide, infographic, ảnh chụp màn hình) — lớp dự phòng cho AI:
 * - sharp: tỷ lệ cặp điểm ảnh liền kề chênh màu rất mạnh (> 80) — chữ, viền, khối màu phẳng của đồ hoạ; ảnh chụp gần như 0.
 * - top8: tỷ phần diện tích của 8 màu phổ biến nhất (lượng tử 5 bit) — nền/khối màu đồng nhất của đồ hoạ.
 * Đo trên bản thu nhỏ 192px (rẻ, không phụ thuộc độ phân giải gốc).
 */
export async function imageTraits(buffer) {
  const { data, info } = await sharp(buffer).resize(192, 192, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const bins = new Map();
  let edges = 0;
  let pairs = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      bins.set(k, (bins.get(k) || 0) + 1);
      if (x + 1 < w) {
        pairs += 1;
        if (Math.max(Math.abs(data[i] - data[i + 3]), Math.abs(data[i + 1] - data[i + 4]), Math.abs(data[i + 2] - data[i + 5])) > 80) edges += 1;
      }
    }
  }
  const top8 = [...bins.values()].sort((a, b) => b - a).slice(0, 8).reduce((n, v) => n + v, 0) / (w * h);
  return { sharp: pairs ? edges / pairs : 0, top8 };
}

// Ngưỡng hiệu chỉnh trên mẫu thật (ảnh chụp: sharp ≈ 0–0,001; slide/infographic: 0,026–0,066). Cố ý thận trọng:
// bỏ sót 1 ảnh thật chỉ mất 1 lần tự gắn (người dùng vẫn gắn tay được), gắn nhầm infographic thì hỏng trang.
export const looksLikePhoto = (t) => !!t && t.sharp < 0.012 && t.top8 < 0.4;
export const looksLikeGraphic = (t) => !!t && t.sharp >= 0.05 && t.top8 >= 0.45;
