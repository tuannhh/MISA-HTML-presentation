// Nhập bài trình bày HTML thiết kế ở công cụ khác (1 tệp tự chứa: ảnh/phông/video nhúng base64).
// 2 cách (người dùng chọn):
//  - design: GIỮ NGUYÊN THIẾT KẾ — mỗi trang chụp thành ảnh nền nguyên trang (trang tự do), video nhúng đặt lại đúng vị trí và phát được;
//    chữ không sửa được nhưng chèn thêm chữ/ảnh/hình lên trên được.
//  - edit: CHUYỂN THÀNH BÀI SỬA ĐƯỢC — lấy chữ từng trang (đánh dấu "--- Trang N ---"), ảnh, video → dàn ý AI như tư liệu khác
//    (mặc định giữ nguyên nội dung + số trang).
// An toàn: HTML lạ chỉ chạy trong Chromium headless của máy chủ với MỌI request mạng bị chặn trừ data:/blob: (browserService) —
// không đọc được tệp máy chủ, không gọi ra ngoài; tài nguyên ở link ngoài sẽ không hiện (báo người dùng dùng tệp tự chứa).
// Khối dữ liệu lớn (video base64) được tách khỏi HTML trước khi nạp trình duyệt (đỡ RAM/thời gian), lưu thẳng thành video của bài.
import { sniffVideo, sniff, IMAGE_TYPES } from '../lib/fileType.js';

const B64 = new Uint8Array(256);
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=') B64[ch.charCodeAt(0)] = 1;
const isB64 = (c) => B64[c] === 1 || c === 10 || c === 13; // cho phép xuống dòng trong khối base64
const MIN_SCRIPT_BLOB = 64 * 1024;
const JS_TYPES = /^(|text\/javascript|application\/javascript|module|application\/json|importmap|application\/ld\+json|text\/ecmascript)$/i;
export const MAX_IMPORT_SLIDES = 60;
// HTML sau khi tách video còn nặng hơn mức này → không nạp trình duyệt (ảnh nhúng quá nhiều).
export const MAX_LIGHT_HTML = 80 * 1048576;

/** Tệp văn bản là trang HTML (bỏ BOM, khoảng trắng, chú thích đầu tệp). */
export function looksLikeHtml(head) {
  const s = (Buffer.isBuffer(head) ? head.toString('utf8', 0, Math.min(head.length, 8192)) : String(head || '')).replace(/^﻿/, '');
  return /^\s*(<!--[\s\S]*?-->\s*)*<(!doctype\s+html|html|head|meta|body)\b/i.test(s);
}

function decodeB64(buf, a, b) {
  return Buffer.from(buf.toString('latin1', a, b).replace(/[\r\n]/g, ''), 'base64');
}

/**
 * Tách video nhúng khỏi HTML: (1) <script type="application/octet-stream" id="…">BASE64</script> (kiểu bài HTML tự đóng gói video),
 * (2) URI data:video/…;base64,… trong thuộc tính. Duyệt tuyến tính trên Buffer (không regex trên chuỗi trăm MB).
 * @returns {{ html: string, videos: Array<{ ref: string, buffer: Buffer, type: 'mp4'|'mov'|'webm' }>, skipped: number }}
 */
export function stripHeavyMedia(buf, { maxVideos = 10, maxVideoBytes = 150 * 1048576 } = {}) {
  const cuts = []; // [start, end, replacement]
  const videos = [];
  let skipped = 0;
  const take = (ref, a, b) => {
    const head = decodeB64(buf, a, Math.min(b, a + 64));
    const type = sniffVideo(head);
    if (!type) return false;
    const bytes = Math.floor(((b - a) * 3) / 4);
    if (videos.length >= maxVideos || bytes > maxVideoBytes) skipped += 1;
    else videos.push({ ref, buffer: decodeB64(buf, a, b), type });
    return true;
  };
  // (1) khối <script> chứa dữ liệu
  let p = 0;
  for (;;) {
    p = buf.indexOf('<script', p, 'latin1');
    if (p < 0) break;
    const tagEnd = buf.indexOf('>', p, 'latin1');
    if (tagEnd < 0) break;
    const tag = buf.toString('latin1', p, tagEnd + 1);
    const end = buf.indexOf('</script', tagEnd, 'latin1');
    if (end < 0) break;
    const type = (tag.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || '';
    if (end - tagEnd > MIN_SCRIPT_BLOB && !JS_TYPES.test(type)) {
      let a = tagEnd + 1;
      while (a < end && (buf[a] === 32 || buf[a] === 10 || buf[a] === 13 || buf[a] === 9)) a += 1;
      let b = end;
      while (b > a && !B64[buf[b - 1]]) b -= 1;
      let pure = true;
      for (let i = a; i < b && pure; i += 4096) if (!isB64(buf[i])) pure = false;
      const id = (tag.match(/\bid\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || `blob-${cuts.length + 1}`;
      if (pure && take(id.slice(0, 80), a, b)) cuts.push([tagEnd + 1, end, '']);
    }
    p = end + 8;
  }
  // (2) data:video/…;base64,…
  p = 0;
  for (;;) {
    p = buf.indexOf('data:video/', p, 'latin1');
    if (p < 0) break;
    const comma = buf.indexOf(';base64,', p, 'latin1');
    if (comma < 0 || comma - p > 60) {
      p += 11;
      continue;
    }
    const a = comma + 8;
    let b = a;
    while (b < buf.length && B64[buf[b]]) b += 1;
    const ref = `impvid-${videos.length + skipped + 1}`;
    if (b - a > 1024 && take(ref, a, b)) cuts.push([p, b, `data:,${ref}`]);
    p = b;
  }
  cuts.sort((x, y) => x[0] - y[0]);
  const parts = [];
  let at = 0;
  for (const [a, b, rep] of cuts) {
    if (a < at) continue;
    parts.push(buf.subarray(at, a), Buffer.from(rep, 'latin1'));
    at = b;
  }
  parts.push(buf.subarray(at));
  return { html: Buffer.concat(parts).toString('utf8').replace(/^﻿/, ''), videos, skipped };
}

/** Ảnh data:image/…;base64 → Buffer (chỉ loại ảnh raster đọc được). */
export function decodeDataImage(uri) {
  const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(uri || ''));
  if (!m) return null;
  const buf = Buffer.from(m[1], 'base64');
  return IMAGE_TYPES.has(sniff(buf)) ? buf : null;
}

/**
 * Gán video đã tách vào trang: tham chiếu thấy trong trang (mã khối/URI) → trang đó; mã khối kết thúc bằng số N (vd. "dv-5")
 * và trang N có khung video → trang N; còn lại → trang có khung video chưa có video, theo thứ tự.
 * @param {Array<{ videoRefs: string[], vbox: object|null }>} slides
 * @returns {Map<number, Array<{ ref, buffer, type }>>} chỉ số trang (0) → video
 */
export function assignVideos(slides, videos) {
  const out = new Map();
  const put = (i, v) => out.set(i, [...(out.get(i) || []), v]);
  const left = [];
  for (const v of videos) {
    const i = slides.findIndex((s) => (s.videoRefs || []).includes(v.ref));
    if (i >= 0) put(i, v);
    else left.push(v);
  }
  const rest = [];
  for (const v of left) {
    const n = Number((/(\d+)$/.exec(v.ref) || [])[1]);
    if (Number.isInteger(n) && n >= 1 && n <= slides.length && slides[n - 1].vbox && !out.has(n - 1)) put(n - 1, v);
    else rest.push(v);
  }
  for (const v of rest) {
    const i = slides.findIndex((s, k) => s.vbox && !out.has(k));
    put(i >= 0 ? i : slides.length - 1, v);
  }
  return out;
}

const r2 = (v) => Math.round(v * 100) / 100;
const clampBox = (b) => {
  const x = Math.max(0, Math.min(98, b.x));
  const y = Math.max(0, Math.min(98, b.y));
  return { x: r2(x), y: r2(y), w: r2(Math.max(2, Math.min(100 - x, b.w))), h: r2(Math.max(2, Math.min(100 - y, b.h))) };
};

/**
 * Trang tự do "giữ nguyên thiết kế": ảnh chụp trang phủ kín (đứng yên, không bo góc) + video đặt đúng khung video của trang.
 * @param {{ title: string, notes?: string, shotAsset: string, fit: 'cover'|'contain', videos: Array<{ asset: string, title: string, box: object|null }> }} s
 */
export function designSlide(s, newId) {
  const elements = [
    { id: newId(), type: 'image', x: 0, y: 0, w: 100, h: 100, radius: 'none', still: true, image: { asset: s.shotAsset, alt: s.title || '', caption: '', fit: s.fit } },
  ];
  s.videos.forEach((v, k) => {
    const box = v.box ? clampBox(v.box) : clampBox({ x: 20 + k * 3, y: 18 + k * 3, w: 60, h: 60 });
    elements.push({ id: newId(), type: 'video', ...box, video: { provider: 'file', asset: v.asset, poster: null, title: v.title || '', caption: '' } });
  });
  return { layout: 'free', title: s.title || '', notes: s.notes || '', hide: ['glow', 'grid', 'bg', 'ft'], elements };
}

/** Chữ từng trang cho dàn ý AI (chế độ chuyển thành bài sửa được) — mỗi trang 1 khối "--- Trang N ---". */
export function slidesText(slides) {
  return slides
    .map((s, i) => {
      const title = String(s.title || '').trim();
      let body = String(s.text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (title && body.startsWith(title)) body = body.slice(title.length).trim();
      return `--- Trang ${i + 1} ---\n${[title, body].filter(Boolean).join('\n')}${s.notes ? `\n[Ghi chú: ${s.notes}]` : ''}`;
    })
    .join('\n\n');
}
