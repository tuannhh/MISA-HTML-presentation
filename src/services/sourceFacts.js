// Dữ kiện của tư liệu nguồn để ĐỐI CHIẾU kết quả AI (không gửi lại cho AI ngoài danh sách liên kết):
//  - corpus: chữ của mọi tư liệu (văn bản, Office, trang web, bản chuyển thể ghi âm, chữ trong PDF qua poppler `pdftotext`)
//  - links : liên kết có trong tư liệu [{ label, url }] — "[nhãn](URL)" do bộ đọc chèn, URL viết trần, liên kết trong PDF (/URI)
// Dùng để: AI chỉ được gắn liên kết có trong nguồn; số điện thoại/email/website trên trang Liên hệ phải có trong nguồn
// (outlineService.verifyOutlineFacts). Lỗi đọc PDF không làm hỏng lượt tạo bài (chỉ thiếu dữ kiện PDF đó).
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { safeHref } from '../../shared/deck/rich.js';
import { linksIn } from '../../shared/deck/mdLinks.js';
import { logger } from '../lib/logger.js';
import { toolEnv } from './visualService.js';

const run = promisify(execFile);
export const MAX_SOURCE_LINKS = 60;
const PDF_TEXT_MAX = 2_000_000; // ký tự chữ PDF tối đa giữ lại để đối chiếu
const BARE_URL = /https?:\/\/[^\s<>"'()[\]]+/gi;

/** Liên kết trong chữ: "[nhãn](URL)" + URL viết trần (nhãn = URL). Bỏ trùng theo URL, giữ nhãn đầu tiên. */
export function linksFromText(text, into = new Map()) {
  const t = String(text ?? '');
  for (const l of linksIn(t)) if (!into.has(l.url)) into.set(l.url, l);
  for (const raw of t.match(BARE_URL) || []) {
    const url = safeHref(raw.replace(/[.,;:!?]+$/, ''));
    if (url && !into.has(url)) into.set(url, { label: url, url });
  }
  return into;
}

/** Liên kết trong tệp PDF: chú thích liên kết dạng "/URI (https://…)" (đối tượng không nén — đa số PDF xuất từ Office/trình duyệt). */
export function pdfUris(buffer, into = new Map()) {
  const s = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : '';
  for (const m of s.matchAll(/\/URI\s*\(((?:\\\)|[^)]){4,500})\)/g)) {
    const url = safeHref(m[1].replace(/\\([()\\])/g, '$1'));
    if (url && !into.has(url)) into.set(url, { label: url, url });
  }
  return into;
}

// Chữ trong PDF (poppler pdftotext, tối đa 60 trang). Môi trường tối thiểu như các công cụ xử lý tệp người dùng khác.
async function pdfText(file, { bin, timeoutMs }) {
  try {
    const { stdout } = await run(bin, ['-q', '-enc', 'UTF-8', '-l', '60', file, '-'], { env: toolEnv(), timeout: timeoutMs, maxBuffer: 16 * 1048576, windowsHide: true });
    return String(stdout).slice(0, PDF_TEXT_MAX);
  } catch (err) {
    logger.warn('source_pdf_text_failed', { code: err?.code === 'ENOENT' ? 'pdftotext_missing' : err?.code || 'error' });
    return '';
  }
}

/**
 * @param {{ pieces: Array<{text:string}>, media: Array<{kind:string, path?:string, buffer?:Buffer}> }} source  kết quả ingestSource
 * @param {{ pdftotext?: string, tempDir: string, timeoutMs?: number, extraTexts?: string[] }} o  extraTexts = bản chuyển thể ghi âm/PDF lớn
 * @returns {Promise<{ corpus: string, links: Array<{label:string,url:string}> }>}
 */
export async function collectSourceFacts(source, { pdftotext = 'pdftotext', tempDir, timeoutMs = 30000, extraTexts = [] } = {}) {
  const texts = [...(source.pieces || []).map((p) => p.text), ...extraTexts];
  const links = new Map();
  for (const m of source.media || []) {
    if (m.kind !== 'pdf') continue;
    let tmp = null;
    try {
      const buf = m.buffer || (m.path ? await readFile(m.path) : null);
      if (!buf) continue;
      pdfUris(buf, links);
      let file = m.path;
      if (!file) {
        tmp = path.join(tempDir, `facts-${randomUUID()}.pdf`);
        await writeFile(tmp, buf);
        file = tmp;
      }
      texts.push(await pdfText(file, { bin: pdftotext, timeoutMs }));
    } catch (err) {
      logger.warn('source_facts_pdf_failed', { err: err.message });
    } finally {
      if (tmp) await rm(tmp, { force: true }).catch(() => {});
    }
  }
  for (const t of texts) linksFromText(t, links);
  return { corpus: texts.filter(Boolean).join('\n'), links: [...links.values()].slice(0, MAX_SOURCE_LINKS) };
}
