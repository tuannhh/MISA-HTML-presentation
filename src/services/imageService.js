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

// Chỉnh sửa ảnh (thông số đã qua cleanImageEdit): lật → xoay (góc bất kỳ, nền trong suốt) → cắt theo tỷ lệ 0–1 của ảnh đã
// xoay (khớp toạ độ của Cropper.js ở trình duyệt) → sáng/tối → độ rực màu → tương phản (công thức bộ lọc CSS) → WebP ≤ 1920px.
export async function applyImageEdit(buffer, e, { maxSide = 1920, quality = 86 } = {}) {
  try {
    // Lật ở lượt riêng TRƯỚC khi xoay: sharp luôn xoay góc 90° trước rồi mới lật (bất kể thứ tự gọi), còn trình chỉnh sửa
    // phía trình duyệt (cropper) lật theo trục ảnh gốc rồi mới xoay → tách lượt để kết quả khớp đúng bản xem trước.
    let input = buffer;
    if (e.flipH || e.flipV) {
      let f = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
      if (e.flipH) f = f.flop();
      if (e.flipV) f = f.flip();
      input = await f.png({ compressionLevel: 1 }).toBuffer();
    }
    let img = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' });
    if (e.rotate) img = img.rotate(e.rotate, { background: { r: 255, g: 255, b: 255, alpha: 0 } });
    const step = await img.png({ compressionLevel: 1 }).toBuffer({ resolveWithObject: true });
    let pipe = sharp(step.data, { limitInputPixels: MAX_PIXELS });
    if (e.crop) {
      const W = step.info.width;
      const H = step.info.height;
      const left = Math.min(W - 1, Math.max(0, Math.round(e.crop.x * W)));
      const top = Math.min(H - 1, Math.max(0, Math.round(e.crop.y * H)));
      const width = Math.max(1, Math.min(W - left, Math.round(e.crop.w * W)));
      const height = Math.max(1, Math.min(H - top, Math.round(e.crop.h * H)));
      pipe = pipe.extract({ left, top, width, height });
    }
    // Màu: đúng công thức bộ lọc CSS mà trình chỉnh sửa dùng để xem trước (brightness → saturate → contrast, kẹp 0–255 sau
    // mỗi bước) để ảnh lưu ra khớp bản xem trước. Không dùng modulate() của sharp (nhân độ sáng trong không gian LCh → lệch màu).
    if (e.brightness || e.saturation || e.contrast) pipe = await colorPass(pipe, e);
    const { data, info } = await pipe
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height, mime: 'image/webp', bytes: data.length };
  } catch {
    throw unprocessable('Không chỉnh sửa được ảnh này', 'IMAGE_EDIT_FAILED');
  }
}

// Mỗi bước 1 lượt (sharp chỉ giữ 1 phép linear/lượt và tự sắp thứ tự các phép trong 1 lượt) — ảnh trung gian dạng raw.
async function colorPass(pipe, e) {
  const steps = [];
  if (e.brightness) {
    const b = Math.max(0, 1 + e.brightness / 100);
    steps.push((p) => p.linear([b, b, b], [0, 0, 0]));
  }
  if (e.saturation) {
    const s = Math.max(0, 1 + e.saturation / 100);
    // Ma trận saturate() của Filter Effects (W3C), áp trên giá trị sRGB như trình duyệt.
    steps.push((p) => p.recomb([
      [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
      [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
      [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
    ]));
  }
  if (e.contrast) {
    // Tương phản quanh mức xám giữa (128): out = a·in + 128(1 − a); chỉ kênh màu, giữ kênh alpha.
    const a = Math.max(0.05, 1 + e.contrast / 100);
    steps.push((p) => p.linear([a, a, a], [128 * (1 - a), 128 * (1 - a), 128 * (1 - a)]));
  }
  let cur = pipe;
  for (const step of steps) {
    const { data, info } = await step(cur).raw().toBuffer({ resolveWithObject: true });
    cur = sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
  }
  return cur;
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
