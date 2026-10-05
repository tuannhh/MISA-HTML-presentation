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
  if (!IMAGE_TYPES.has(kind)) throw unprocessable('Tệp không phải ảnh PNG/JPEG/GIF/WebP hợp lệ', 'INVALID_IMAGE');
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
      out.push({ ...img, name: item.name, hint: item.hint || '' });
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
