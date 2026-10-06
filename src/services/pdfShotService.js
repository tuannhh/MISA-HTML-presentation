// Cắt ảnh giao diện phần mềm từ PDF để đưa vào bài: slide sản phẩm thường dán ảnh chụp màn hình (có khi chồng lớp, có nền trong suốt)
// nên không trích ảnh nhúng mà RENDER từng trang (poppler `pdftoppm`) → AI khoanh vùng ảnh giao diện → cắt từ bản render độ phân giải cao.
// Ảnh cắt ra nằm trên nền trang gốc (nền sáng) nên hiển thị rõ trên mọi theme. Lỗi ở bước này không làm hỏng lượt tạo bài (trả []).
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { logger } from '../lib/logger.js';

const run = promisify(execFile);
const RENDER_SIDE = 2000; // cạnh dài trang render (px) — đủ nét để cắt ảnh giao diện chiếm ~1/2 trang
const PREVIEW_SIDE = 1024; // ảnh trang gửi AI khoanh vùng
const PAD = 0.005; // nới vùng cắt mỗi phía (tỷ lệ cạnh trang) — AI hay khoanh sát quá, lẹm viền
const MIN_FRAC = 0.12; // vùng nhỏ hơn 12% cạnh trang → ảnh nhỏ, không đáng đưa vào bài
const MAX_AREA = 0.9; // vùng gần cả trang → là cả slide, không phải ảnh giao diện

/** Toạ độ AI [ymin, xmin, ymax, xmax] (0–1000) → vùng cắt điểm ảnh đã nới + kẹp trong trang; null nếu không hợp lệ/quá nhỏ/quá lớn. */
export function boxToRegion(box, width, height) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => Number.isFinite(v))) return null;
  const [y0, x0, y1, x1] = box.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
  if (x1 - x0 < MIN_FRAC || y1 - y0 < MIN_FRAC || (x1 - x0) * (y1 - y0) > MAX_AREA) return null;
  const left = Math.max(0, Math.floor((x0 - PAD) * width));
  const top = Math.max(0, Math.floor((y0 - PAD) * height));
  const right = Math.min(width, Math.ceil((x1 + PAD) * width));
  const bottom = Math.min(height, Math.ceil((y1 + PAD) * height));
  return { left, top, width: right - left, height: bottom - top };
}

// Băm sai khác 64 bit (dHash 9×8) — gom ảnh giao diện lặp lại ở nhiều trang (vd. cùng màn hình chat ở bìa và trang tính năng).
async function dHash(buffer) {
  const px = await sharp(buffer).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return h;
}
const hamming = (a, b) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};

async function renderPages(pdfPath, dir, { bin, maxPages }) {
  const prefix = path.join(dir, 'p');
  await run(bin, ['-jpeg', '-jpegopt', 'quality=90', '-scale-to', String(RENDER_SIDE), '-f', '1', '-l', String(maxPages), pdfPath, prefix], { timeout: 180000, maxBuffer: 1 << 20 });
  const files = (await readdir(dir)).filter((f) => /^p-\d+\.jpg$/.test(f));
  return files.map((f) => ({ page: Number(/(\d+)/.exec(f)[1]), file: path.join(dir, f) })).sort((a, b) => a.page - b.page);
}

/**
 * @param pdfs [{ name, path?|buffer? }] — PDF trong tư liệu nguồn
 * @param o { gemini, bin, tempDir, maxPages, maxShots }
 * @returns [{ buffer, name, hint, ui: { device, page, title } }] — ảnh giao diện, chất lượng cao trước
 */
export async function extractPdfUiShots(pdfs, { gemini, bin = 'pdftoppm', tempDir, maxPages = 40, maxShots = 16 }) {
  const out = [];
  const hashes = [];
  for (const pdf of pdfs) {
    if (out.length >= maxShots) break;
    const dir = path.join(tempDir, `pdfshot-${randomUUID()}`);
    const started = Date.now();
    try {
      await mkdir(dir, { recursive: true });
      let src = pdf.path;
      if (!src) {
        src = path.join(dir, 'src.pdf');
        await writeFile(src, pdf.buffer);
      }
      const pages = await renderPages(src, dir, { bin, maxPages });
      if (!pages.length) continue;
      for (const pg of pages) {
        pg.buffer = await readFile(pg.file);
        pg.preview = await sharp(pg.buffer).resize(PREVIEW_SIDE, PREVIEW_SIDE, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer();
      }
      const res = await gemini.locateUiShots({ pages, label: pdf.name });
      const byPage = new Map(pages.map((p) => [p.page, p]));
      const found = (Array.isArray(res?.shots) ? res.shots : [])
        .filter((s) => byPage.has(s?.page) && Number(s.quality) >= 2)
        .sort((a, b) => b.quality - a.quality || a.page - b.page);
      let kept = 0;
      for (const s of found) {
        if (out.length >= maxShots) break;
        const pg = byPage.get(s.page);
        const meta = await sharp(pg.buffer).metadata();
        const region = boxToRegion(s.box_2d, meta.width, meta.height);
        if (!region) continue;
        const buffer = await sharp(pg.buffer).extract(region).jpeg({ quality: 92 }).toBuffer();
        const h = await dHash(buffer);
        if (hashes.some((x) => hamming(x, h) <= 6)) continue;
        hashes.push(h);
        const title = String(s.title || '').trim().slice(0, 120);
        const device = ['web', 'mobile', 'tablet'].includes(s.device) ? s.device : 'web';
        out.push({ buffer, name: `${pdf.name} — trang ${s.page}`, hint: `ẢNH GIAO DIỆN PHẦN MỀM (${device}) cắt từ trang ${s.page} của PDF "${pdf.name}"${title ? `: ${title}` : ''}`, ui: { device, page: s.page, title } });
        kept += 1;
      }
      logger.info('pdf_ui_shots', { pages: pages.length, found: found.length, kept, ms: Date.now() - started });
    } catch (err) {
      // thiếu pdftoppm, PDF lỗi/có mật khẩu, AI lỗi… → bài vẫn tạo được, chỉ thiếu ảnh giao diện
      logger.warn('pdf_ui_shots_failed', { err: err?.code === 'ENOENT' ? 'pdftoppm_missing' : String(err?.message || err).slice(0, 200) });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return out;
}
