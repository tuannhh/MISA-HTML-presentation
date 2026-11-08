// Chế độ "GIỮ NGUYÊN NỘI DUNG + SỐ TRANG" khi tạo bài: chia tư liệu theo đúng trang gốc, đánh dấu "--- Trang N ---" để AI chuyển
// MỖI trang nguồn thành ĐÚNG 1 trang, giữ nguyên văn. Đếm trang:
//   PPTX: số slide (bộ đọc đã đánh dấu sẵn) · PDF: số trang (chữ từng trang qua pdftotext, ngăn trang \f; PDF scan → AI đọc tệp)
//   DOCX/ODT/ODP: chuyển PDF (LibreOffice) rồi như PDF · bài HTML: số trang của bài (htmlDeckService)
//   văn bản nhập tay / TXT / MD: ngăn trang bằng dòng "---" (không có → không cố định số trang, AI chia theo mạch nhưng giữ nguyên câu chữ)
// Vượt KEEP_MAX_PAGES → từ chối (người dùng tách tài liệu hoặc chọn "AI biên tập lại").
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { SPEC_LIMITS } from '../../shared/deck/limits.js';
import { unprocessable } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';
import { officeToPdf, sanitizeOffice, toolEnv } from './visualService.js';
import { pdfPageCount } from './mediaService.js';

const run = promisify(execFile);
export const KEEP_MAX_PAGES = SPEC_LIMITS.outlineSlides;
const MARK = /^--- Trang \d+ ---$/gm;
// Dòng ngăn trang trong văn bản: "---" (3 gạch trở lên) đứng riêng 1 dòng.
const TEXT_BREAK = /^\s*-{3,}\s*$/m;
// PDF coi là "có chữ" khi ≥ 70% số trang có ít nhất 15 ký tự (ngược lại là bản scan → AI đọc tệp gốc).
const MIN_PAGE_CHARS = 15;
const TEXT_PAGE_SHARE = 0.7;

export const tooManyPages = (n) =>
  unprocessable(`Tài liệu có ${n} trang — vượt giới hạn ${KEEP_MAX_PAGES} trang khi giữ nguyên nội dung. Hãy tách tài liệu thành nhiều phần hoặc chọn "AI biên tập lại".`, 'TOO_MANY_PAGES');

/** Đánh dấu danh sách trang → "--- Trang 1 ---\n…\n\n--- Trang 2 ---\n…" (trang rỗng giữ chỗ để giữ đúng số trang). */
export const markPages = (pages) => pages.map((t, i) => `--- Trang ${i + 1} ---\n${String(t || '').trim() || '(trang không có chữ)'}`).join('\n\n');
export const countMarked = (text) => (String(text || '').match(MARK) || []).length;

/** Văn bản có dòng "---" ngăn trang → danh sách trang (bỏ đoạn rỗng); không có → null. */
export function splitTextPages(text) {
  const t = String(text || '');
  if (!TEXT_BREAK.test(t)) return null;
  const parts = t.split(/^\s*-{3,}\s*$/m).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

/** Chữ từng trang PDF (pdftotext, trang ngăn bằng \f). */
async function pdfPages(file, { bin, timeoutMs = 60000 }) {
  try {
    const { stdout } = await run(bin, ['-q', '-enc', 'UTF-8', '-l', String(KEEP_MAX_PAGES + 1), file, '-'], { env: toolEnv(), timeout: timeoutMs, maxBuffer: 32 * 1048576, windowsHide: true });
    const pages = String(stdout).split('\f');
    if (pages.length && !pages[pages.length - 1].trim()) pages.pop();
    return pages.map((p) => p.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
  } catch (err) {
    logger.warn('keep_pdf_text_failed', { code: err?.code === 'ENOENT' ? 'pdftotext_missing' : err?.code || 'error' });
    return null;
  }
}
const mostlyText = (pages) => pages.length > 0 && pages.filter((p) => p.length >= MIN_PAGE_CHARS).length >= pages.length * TEXT_PAGE_SHARE;

/** Đếm nhanh lúc tạo bài (trả lỗi ngay, chưa vào hàng chờ): PPTX, PDF (≤ 100 MB). Loại khác → null (đếm khi xử lý). */
export async function quickPageCount(file) {
  if (!file?.path || file.size > 100 * 1048576) return null;
  try {
    if (file.kind === 'pdf') return await pdfPageCount(await readFile(file.path));
    if (file.kind === 'zip') {
      const zip = await JSZip.loadAsync(await readFile(file.path), { checkCRC32: false });
      if (!zip.file('ppt/presentation.xml')) return null;
      return Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Chia tư liệu (kết quả ingestSource) theo trang gốc — sửa tại chỗ: thay chữ bằng bản đánh dấu trang; PDF có chữ → đánh dấu
 * `asText` (không đính kèm tệp cho AI nữa, vẫn dùng để cắt ảnh/lấy liên kết). Gọi cleanup() khi xong (xoá PDF tạm của Office).
 * @param {{ pieces, media, docs }} source
 * @param {{ extraPages?: number, pdftotext: string, soffice: string, office?: boolean, officeTimeoutMs: number, tempDir: string }} o
 * @returns {Promise<{ pages: number|null, cleanup: () => Promise<void> }>}
 */
export async function paginateSource(source, { extraPages = 0, pdftotext = 'pdftotext', soffice = 'soffice', office = true, officeTimeoutMs = 120000, tempDir }) {
  const dirs = [];
  const cleanup = async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }).catch(() => {})));
  };
  let known = extraPages;
  let unknown = false;
  // Tệp Office đã xử lý ở bước chuyển PDF (đã đếm trang hoặc không đếm được) — không đếm lại ở bước chữ.
  const handled = new Set();
  try {
    // Office (docx/odt/odp): chuyển PDF → chữ từng trang. PPTX: bộ đọc đã đánh dấu từng slide.
    for (const doc of source.docs || []) {
      const piece = source.pieces.find((x) => x.label === doc.name);
      if (doc.ext === 'pptx' && piece && countMarked(piece.text)) continue; // bộ đọc PPTX đã đánh dấu từng slide → đếm ở bước chữ
      handled.add(doc.name);
      // Không chuyển được sang PDF (tắt LibreOffice / lỗi tệp) → không cố định số trang, AI vẫn giữ nguyên câu chữ theo thứ tự.
      if (!office) {
        unknown = true;
        continue;
      }
      const dir = path.join(tempDir, `keep-${randomUUID()}`);
      dirs.push(dir);
      await mkdir(dir, { recursive: true });
      const src = path.join(dir, `src.${doc.ext}`);
      await writeFile(src, await sanitizeOffice(doc.buffer));
      let pdf;
      try {
        pdf = await officeToPdf(src, dir, { soffice, timeoutMs: officeTimeoutMs });
      } catch (err) {
        logger.warn('keep_office_pdf_failed', { ext: doc.ext, err: err.message });
        unknown = true;
        continue;
      }
      doc.pdfPath = pdf;
      const pages = await pdfPages(pdf, { bin: pdftotext });
      const n = (await pdfPageCount(await readFile(pdf))) ?? pages?.length ?? 0;
      if (n > KEEP_MAX_PAGES) throw tooManyPages(known + n);
      if (pages && piece && mostlyText(pages)) piece.text = markPages(pages.slice(0, n || pages.length));
      known += n;
    }
    // Văn bản (nhập tay, TXT/MD, trang web…): dòng "---" ngăn trang; không có → không cố định số trang.
    for (const p of source.pieces) {
      if (handled.has(p.label)) continue;
      const n = countMarked(p.text);
      if (n) {
        known += n;
        continue;
      }
      const parts = splitTextPages(p.text);
      if (parts) {
        p.text = markPages(parts);
        known += parts.length;
      } else unknown = true;
    }
    // PDF: chữ từng trang (có chữ) hoặc để AI đọc tệp (bản scan) — vẫn đếm đúng số trang.
    for (const m of source.media || []) {
      if (m.kind !== 'pdf') {
        unknown = true;
        continue;
      }
      const buf = m.buffer || (await readFile(m.path));
      const n = (await pdfPageCount(buf)) ?? 0;
      if (known + n > KEEP_MAX_PAGES) throw tooManyPages(known + n);
      let file = m.path;
      if (!file) {
        const dir = path.join(tempDir, `keep-${randomUUID()}`);
        dirs.push(dir);
        await mkdir(dir, { recursive: true });
        file = path.join(dir, 'src.pdf');
        await writeFile(file, buf);
      }
      const pages = await pdfPages(file, { bin: pdftotext });
      if (pages && mostlyText(pages)) {
        source.pieces.push({ label: m.name, text: markPages(pages.slice(0, n || pages.length)) });
        m.asText = true;
      } else m.pages = n;
      known += n;
    }
    if (known > KEEP_MAX_PAGES) throw tooManyPages(known);
    return { pages: known > 0 && !unknown ? known : null, known, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
