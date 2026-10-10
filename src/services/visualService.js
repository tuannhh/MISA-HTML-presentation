// Nhận diện + cắt 2 loại hình MISA dùng nhiều nhất để đưa NGUYÊN VẸN vào bài: ẢNH GIAO DIỆN PHẦN MỀM và HÌNH HOẠ DẠNG SƠ ĐỒ.
// Không trích ảnh nhúng: slide sản phẩm hay dán ảnh chụp màn hình chồng lớp/nền trong suốt, còn sơ đồ thường VẼ bằng hình khối,
// SmartArt, mũi tên (không phải ảnh) → RENDER từng trang (PDF: poppler `pdftoppm`; PPTX/DOCX/ODP/ODT: LibreOffice → PDF trước)
// → AI xem cả trang, khoanh vùng + phân loại → cắt từ bản render độ phân giải cao, xén viền nền thừa, bỏ hình trùng.
// Lỗi ở bước này không làm hỏng lượt tạo bài (trả về những gì đã cắt được).
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import sharp from 'sharp';
import { logger } from '../lib/logger.js';

const run = promisify(execFile);
const RENDER_SIDE = 2000; // cạnh dài trang render (px) — đủ nét để cắt hình chiếm ~1/2 trang
const PREVIEW_SIDE = 1024; // ảnh trang gửi AI khoanh vùng
// Nới vùng cắt mỗi phía (tỷ lệ cạnh trang): AI hay khoanh sát quá, lẹm viền; sơ đồ hay có nhãn/mũi tên sát mép → nới rộng hơn,
// phần nền thừa được xén lại bằng trimEdges.
const PAD = { screenshot: 0.005, diagram: 0.02 };
const MIN_FRAC = { screenshot: 0.12, diagram: 0.1 }; // vùng hẹp hơn → hình nhỏ, không đáng đưa vào bài
const MAX_AREA = 0.9; // vùng gần cả trang → là cả slide, không phải 1 hình
export const VISUAL_DEVICES = Object.freeze(['web', 'mobile', 'tablet']);
export const DIAGRAM_TYPES = Object.freeze(['process', 'architecture', 'model', 'org', 'mindmap', 'ecosystem', 'other']);
const DIAGRAM_LABEL = { process: 'quy trình', architecture: 'kiến trúc', model: 'mô hình', org: 'tổ chức', mindmap: 'tư duy', ecosystem: 'hệ sinh thái', other: 'minh hoạ' };

/** Toạ độ AI [ymin, xmin, ymax, xmax] (0–1000) → vùng cắt điểm ảnh đã nới + kẹp trong trang; null nếu không hợp lệ/quá nhỏ/quá lớn. */
export function boxToRegion(box, width, height, kind = 'screenshot') {
  if (!Array.isArray(box) || box.length !== 4 || !box.every((v) => Number.isFinite(v))) return null;
  const [y0, x0, y1, x1] = box.map((v) => Math.min(1000, Math.max(0, v)) / 1000);
  const min = MIN_FRAC[kind] ?? MIN_FRAC.screenshot;
  const pad = PAD[kind] ?? PAD.screenshot;
  if (x1 - x0 < min || y1 - y0 < min || (x1 - x0) * (y1 - y0) > MAX_AREA) return null;
  const left = Math.max(0, Math.floor((x0 - pad) * width));
  const top = Math.max(0, Math.floor((y0 - pad) * height));
  const right = Math.min(width, Math.ceil((x1 + pad) * width));
  const bottom = Math.min(height, Math.ceil((y1 + pad) * height));
  return { left, top, width: right - left, height: bottom - top };
}

// Băm sai khác 64 bit (dHash 9×8) — gom hình lặp lại ở nhiều trang / ảnh nhúng trùng hình đã cắt.
export async function dHash(buffer) {
  const px = await sharp(buffer).resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer();
  let h = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) h = (h << 1n) | (px[y * 9 + x] > px[y * 9 + x + 1] ? 1n : 0n);
  return h;
}
export const hamming = (a, b) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};

/**
 * Xén dải nền đồng màu quanh hình (phần nới thêm khi cắt), chừa lại lề mỏng cho thoáng.
 * Chỉ xén khi phần còn lại đủ lớn (≥ 35% mỗi chiều) — AI khoanh lệch/hình có vùng nền nhạt liền nền trang thì giữ nguyên.
 */
async function trimEdges(buffer, margin) {
  try {
    const { info } = await sharp(buffer).trim({ threshold: 14 }).toBuffer({ resolveWithObject: true });
    const meta = await sharp(buffer).metadata();
    if (info.width < meta.width * 0.35 || info.height < meta.height * 0.35) return buffer;
    if (info.width >= meta.width - 2 && info.height >= meta.height - 2) return buffer;
    const left = Math.max(0, -(info.trimOffsetLeft || 0) - margin);
    const top = Math.max(0, -(info.trimOffsetTop || 0) - margin);
    const width = Math.min(meta.width - left, info.width + 2 * margin);
    const height = Math.min(meta.height - top, info.height + 2 * margin);
    return width > 0 && height > 0 ? await sharp(buffer).extract({ left, top, width, height }).toBuffer() : buffer;
  } catch {
    return buffer; // ảnh đồng màu hoàn toàn / lỗi xén → giữ nguyên
  }
}

async function renderPdfPages(pdfPath, dir, { bin, maxPages }) {
  const prefix = path.join(dir, 'p');
  await run(bin, ['-jpeg', '-jpegopt', 'quality=90', '-scale-to', String(RENDER_SIDE), '-f', '1', '-l', String(maxPages), pdfPath, prefix], { timeout: 180000, maxBuffer: 1 << 20 });
  const files = (await readdir(dir)).filter((f) => /^p-\d+\.jpg$/.test(f));
  return files.map((f) => ({ page: Number(/(\d+)/.exec(f)[1]), file: path.join(dir, f) })).sort((a, b) => a.page - b.page);
}

// Trường Word kéo nội dung từ ngoài (INCLUDEPICTURE/INCLUDETEXT/LINK/DDE) → bỏ trước khi LibreOffice mở.
const FIELD_RE = /\b(?:INCLUDEPICTURE|INCLUDETEXT|LINK|DDEAUTO|DDE|IMPORT)\b/i;
/**
 * An toàn trước khi đưa tệp người dùng cho LibreOffice: bỏ mọi quan hệ trỏ ra ngoài (ảnh/OLE/khung liên kết qua mạng hoặc tệp
 * trên máy chủ — chống SSRF/đọc tệp cục bộ), bỏ mã trường nhúng nội dung ngoài, bỏ macro (vbaProject). Trả về buffer mới.
 */
export async function sanitizeOffice(buffer) {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
  for (const name of Object.keys(zip.files)) {
    const f = zip.files[name];
    if (f.dir) continue;
    if (/vbaProject\.bin$|activeX/i.test(name)) {
      zip.remove(name);
      continue;
    }
    if (/\.rels$/i.test(name)) {
      const xml = await f.async('string');
      const clean = xml.replace(/<Relationship\b[^>]*TargetMode\s*=\s*"External"[^>]*\/>/gi, '');
      if (clean !== xml) zip.file(name, clean);
    } else if (/^word\/.*\.xml$/i.test(name)) {
      const xml = await f.async('string');
      const clean = xml
        .replace(/<w:instrText\b[^>]*>([^<]*)<\/w:instrText>/g, (m, t) => (FIELD_RE.test(t) ? '<w:instrText></w:instrText>' : m))
        .replace(/<w:fldSimple\b[^>]*w:instr="([^"]*)"[^>]*>/g, (m, t) => (FIELD_RE.test(t) ? m.replace(t, '') : m));
      if (clean !== xml) zip.file(name, clean);
    } else if (name === 'content.xml' || name === 'styles.xml') {
      // ODF: liên kết ngoài nằm thẳng trong xlink:href (ảnh/đối tượng) — chỉ giữ đường dẫn nội bộ của gói.
      const xml = await f.async('string');
      // Có scheme (http:, file:, smb:…), đường dẫn tuyệt đối hoặc UNC → bỏ.
      const clean = xml.replace(/xlink:href="(?:[a-z][a-z0-9+.-]*:|\/|\\)[^"]*"/gi, 'xlink:href=""');
      if (clean !== xml) zip.file(name, clean);
    }
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// LibreOffice dùng chung hồ sơ người dùng → chạy song song dễ treo/khoá: xếp hàng từng lượt chuyển.
let officeQueue = Promise.resolve();
function officeToPdf(src, dir, { soffice, timeoutMs }) {
  const job = officeQueue.then(async () => {
    const profile = pathToFileURL(path.join(dir, 'lo-profile')).href;
    await run(soffice, [`-env:UserInstallation=${profile}`, '--headless', '--norestore', '--nologo', '--nolockcheck', '--convert-to', 'pdf', '--outdir', dir, src], {
      timeout: timeoutMs,
      maxBuffer: 1 << 20,
      // Proxy chết: nếu còn sót liên kết ngoài thì LibreOffice cũng không tải được gì (chốt chặn thứ hai sau sanitizeOffice).
      env: { ...process.env, HOME: dir, http_proxy: 'http://127.0.0.1:9', https_proxy: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', HTTPS_PROXY: 'http://127.0.0.1:9', no_proxy: '' },
    });
    const pdf = path.join(dir, `${path.basename(src, path.extname(src))}.pdf`);
    await access(pdf).catch(() => {
      throw new Error('soffice_no_output');
    });
    return pdf;
  });
  officeQueue = job.catch(() => {});
  return job;
}

// Mô tả hình để AI dựng dàn ý nhận ra (prompt dàn ý: "ẢNH GIAO DIỆN PHẦN MỀM" → screenshot, "SƠ ĐỒ" → diagram).
function hintOf(v, docName) {
  const where = `trang ${v.page} của "${docName}"`;
  if (v.kind === 'diagram') return `SƠ ĐỒ ${DIAGRAM_LABEL[v.type] || 'minh hoạ'} cắt từ ${where}${v.title ? `: ${v.title}` : ''}`;
  return `ẢNH GIAO DIỆN PHẦN MỀM (${v.device}) cắt từ ${where}${v.title ? `: ${v.title}` : ''}`;
}

/**
 * @param docs [{ name, kind:'pdf'|'office', ext?, path?|buffer? }] — PDF / tài liệu Office trong tư liệu nguồn
 * @param o { gemini, bin (pdftoppm), soffice, office (bật render Office), tempDir, maxPages, maxShots, officeTimeoutMs }
 * @returns [{ buffer, name, hint, ui?: {device,page,title}, diagram?: {type,page,title} }] — chất lượng cao trước
 */
export async function extractVisuals(docs, { gemini, bin = 'pdftoppm', soffice = 'soffice', office = true, tempDir, maxPages = 40, maxShots = 24, officeTimeoutMs = 120000 }) {
  const out = [];
  const hashes = [];
  for (const doc of docs) {
    if (out.length >= maxShots) break;
    if (doc.kind === 'office' && !office) continue;
    const dir = path.join(tempDir, `visual-${randomUUID()}`);
    const started = Date.now();
    let step = 'render';
    try {
      await mkdir(dir, { recursive: true });
      let pdfPath = doc.path;
      if (doc.kind === 'office') {
        step = 'office';
        const src = path.join(dir, `src.${doc.ext}`);
        await writeFile(src, await sanitizeOffice(doc.buffer));
        pdfPath = await officeToPdf(src, dir, { soffice, timeoutMs: officeTimeoutMs });
        step = 'render';
      } else if (!pdfPath) {
        pdfPath = path.join(dir, 'src.pdf');
        await writeFile(pdfPath, doc.buffer);
      }
      const pages = await renderPdfPages(pdfPath, dir, { bin, maxPages });
      if (!pages.length) continue;
      for (const pg of pages) {
        pg.buffer = await readFile(pg.file);
        pg.preview = await sharp(pg.buffer).resize(PREVIEW_SIDE, PREVIEW_SIDE, { fit: 'inside' }).jpeg({ quality: 72 }).toBuffer();
      }
      step = 'locate';
      const res = await gemini.locateVisuals({ pages, label: doc.name });
      const byPage = new Map(pages.map((p) => [p.page, p]));
      const found = (Array.isArray(res?.shots) ? res.shots : [])
        .filter((s) => byPage.has(s?.page) && Number(s.quality) >= 2 && (s.kind === 'screenshot' || s.kind === 'diagram'))
        .sort((a, b) => b.quality - a.quality || a.page - b.page);
      let kept = 0;
      let diagrams = 0;
      for (const s of found) {
        if (out.length >= maxShots) break;
        const pg = byPage.get(s.page);
        const meta = await sharp(pg.buffer).metadata();
        const region = boxToRegion(s.box_2d, meta.width, meta.height, s.kind);
        if (!region) continue;
        let buffer = await sharp(pg.buffer).extract(region).png().toBuffer();
        if (s.kind === 'diagram') buffer = await trimEdges(buffer, Math.round(RENDER_SIDE * 0.008));
        buffer = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
        const h = await dHash(buffer);
        if (hashes.some((x) => hamming(x, h) <= 6)) continue;
        hashes.push(h);
        const title = String(s.title || '').trim().slice(0, 120);
        const v =
          s.kind === 'diagram'
            ? { kind: 'diagram', type: DIAGRAM_TYPES.includes(s.diagramType) ? s.diagramType : 'other', page: s.page, title }
            : { kind: 'screenshot', device: VISUAL_DEVICES.includes(s.device) ? s.device : 'web', page: s.page, title };
        const item = { buffer, name: `${doc.name} — trang ${s.page}`, hint: hintOf(v, doc.name), hash: h };
        if (v.kind === 'diagram') {
          item.diagram = { type: v.type, page: v.page, title };
          diagrams += 1;
        } else item.ui = { device: v.device, page: v.page, title };
        out.push(item);
        kept += 1;
      }
      logger.info('visual_shots', { kind: doc.kind, pages: pages.length, found: found.length, kept, diagrams, ms: Date.now() - started });
    } catch (err) {
      // thiếu pdftoppm/LibreOffice, tệp lỗi/có mật khẩu, AI lỗi… → bài vẫn tạo được, chỉ thiếu hình cắt
      const missing = err?.code === 'ENOENT' ? (step === 'office' ? 'soffice_missing' : 'pdftoppm_missing') : null;
      logger.warn('visual_shots_failed', { kind: doc.kind, step, err: missing || String(err?.message || err).slice(0, 200) });
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
  return out;
}

/**
 * Ảnh nhúng trong tài liệu trùng với hình đã cắt từ trang render → giữ 1 bản: ảnh gốc (nét hơn) nếu lớn hơn bản cắt, mang theo
 * nhãn giao diện/sơ đồ; ngược lại bỏ ảnh nhúng. Trả về { shots, images } đã gộp.
 */
export async function mergeEmbedded(shots, images, { maxDistance = 10 } = {}) {
  if (!shots.length || !images.length) return { shots, images, merged: 0 };
  const keep = [];
  let merged = 0;
  for (const im of images) {
    let h = null;
    let meta = null;
    try {
      h = await dHash(im.buffer);
      meta = await sharp(im.buffer).metadata();
    } catch {
      keep.push(im); // EMF/WMF/lỗi → để bước chuẩn hoá ảnh tự loại
      continue;
    }
    const twin = shots.find((s) => s.hash !== undefined && hamming(s.hash, h) <= maxDistance);
    if (!twin) {
      keep.push(im);
      continue;
    }
    merged += 1;
    const cut = await sharp(twin.buffer).metadata();
    // Ảnh gốc nét hơn bản cắt (≥ 1,3 lần) → dùng ảnh gốc làm nội dung của hình đã nhận diện.
    if (meta.width && cut.width && meta.width >= cut.width * 1.3 && !meta.hasAlpha) twin.buffer = im.buffer;
  }
  return { shots, images: keep, merged };
}
