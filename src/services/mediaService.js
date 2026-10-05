// Đưa tư liệu nặng (PDF, ghi âm) tới Gemini. Hai chế độ:
//  - trực tiếp: tổng tư liệu nhỏ → đính kèm ngay vào lượt dựng bài (AI vừa đọc/nghe vừa dựng, chất lượng tốt nhất);
//  - hai bước: tư liệu lớn → mỗi tệp (PDF cắt theo cụm trang) được AI chuyển thành văn bản trước, lượt dựng bài chỉ đọc văn bản.
// Vận chuyển: tệp nhỏ gửi inline (base64), tệp lớn qua Files API (giới hạn request inline ~20 MB). Tệp đã tải lên luôn được xoá.
import { openAsBlob } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { logger } from '../lib/logger.js';
import { unprocessable } from '../lib/httpError.js';

const MB = 1048576;
// Ngân sách inline cho cả request (base64 phình ~33%, còn chỗ cho ảnh xem trước + văn bản).
const INLINE_TOTAL = 8 * MB;
// Lượt chuyển văn bản chỉ mang 1 tệp → được inline lớn hơn.
const INLINE_SINGLE = 14 * MB;
// Ước lượng token: ~32 token/giây ghi âm, ~560 token/trang PDF (ảnh trang + chữ).
const DIRECT_TOKEN_BUDGET = 120000;
const PDF_TOKENS_PER_PAGE = 560;
const AUDIO_TOKENS_PER_SEC = 32;
// Byte/giây giả định để đoán thời lượng (WAV/AIFF không nén; còn lại ~64 kbps — nhầm theo hướng an toàn = coi là dài hơn).
const AUDIO_BYTES_PER_SEC = { wav: 176400, aiff: 176400, flac: 88200 };
// Một cụm PDF cho bước chuyển văn bản: đủ nhỏ để AI chép lại trong giới hạn đầu ra và dưới trần 50 MB/tệp PDF của Gemini.
const PDF_CHUNK_PAGES = 100;
const PDF_CHUNK_BYTES = 45 * MB;
const EXTRACT_CONCURRENCY = 3;

const readItem = (m) => (m.buffer ? Promise.resolve(m.buffer) : readFile(m.path));

async function pdfPageCount(buffer) {
  try {
    return (await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })).getPageCount();
  } catch {
    return null; // PDF lạ/hỏng: để Gemini tự đọc nguyên tệp
  }
}

function audioSeconds(m) {
  const ext = Object.entries({ wav: 'audio/wav', aiff: 'audio/aiff', flac: 'audio/flac' }).find(([, mime]) => mime === m.mime)?.[0];
  return m.size / (AUDIO_BYTES_PER_SEC[ext] || 8000);
}

// Cắt PDF thành các cụm ≤ PDF_CHUNK_PAGES trang và ≤ PDF_CHUNK_BYTES (cụm vượt dung lượng thì chia đôi tiếp).
async function splitPdf(buffer, pages) {
  if (pages <= PDF_CHUNK_PAGES && buffer.length <= PDF_CHUNK_BYTES) return [{ buffer, from: 1, to: pages }];
  const src = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  const perChunk = Math.max(1, Math.min(PDF_CHUNK_PAGES, Math.floor((pages * PDF_CHUNK_BYTES) / buffer.length)));
  const out = [];
  async function build(from, to) {
    const doc = await PDFDocument.create();
    const idx = Array.from({ length: to - from + 1 }, (_, i) => from - 1 + i);
    for (const p of await doc.copyPages(src, idx)) doc.addPage(p);
    const bytes = Buffer.from(await doc.save());
    if (bytes.length > PDF_CHUNK_BYTES && to > from) {
      const mid = Math.floor((from + to) / 2);
      await build(from, mid);
      await build(mid + 1, to);
    } else {
      out.push({ buffer: bytes, from, to });
    }
  }
  for (let from = 1; from <= pages; from += perChunk) await build(from, Math.min(pages, from + perChunk - 1));
  return out;
}

async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * @param media [{ kind:'pdf'|'audio', name, size, mime, path?|buffer? }]
 * @returns {{ direct: [{kind,name,part}], pieces: [{label,text}], cleanup: () => Promise<void> }}
 */
export async function prepareMedia(media, { gemini }) {
  const uploaded = [];
  const cleanup = async () => {
    await Promise.all(uploaded.splice(0).map((name) => gemini.deleteFile(name)));
  };
  if (!media.length) return { direct: [], pieces: [], cleanup };

  // Phần tử gửi cho Gemini: inline khi `inline` = true, không thì tải lên Files API (ghi nhận để xoá sau).
  async function toPart({ buffer, path, size, mime, name }, inline) {
    if (inline) return { part: { inlineData: { mimeType: mime, data: (buffer || (await readFile(path))).toString('base64') } } };
    const blob = buffer ? new Blob([buffer], { type: mime }) : await openAsBlob(path, { type: mime });
    const file = await gemini.uploadFile({ blob, size, mime, displayName: name });
    uploaded.push(file.name);
    return { part: { fileData: { mimeType: file.mimeType, fileUri: file.uri } }, uploadedName: file.name };
  }

  try {
    // Ước lượng khối lượng để chọn chế độ.
    const info = [];
    let tokens = 0;
    for (const m of media) {
      if (m.kind === 'pdf') {
        const buffer = await readItem(m);
        const pages = await pdfPageCount(buffer);
        info.push({ ...m, buffer, pages });
        tokens += (pages || Math.ceil(m.size / 100000)) * PDF_TOKENS_PER_PAGE;
      } else {
        info.push(m);
        tokens += audioSeconds(m) * AUDIO_TOKENS_PER_SEC;
      }
    }
    const tooBigPdf = info.some((m) => m.kind === 'pdf' && (m.size > PDF_CHUNK_BYTES || (m.pages || 0) > PDF_CHUNK_PAGES * 3));

    if (tokens <= DIRECT_TOKEN_BUDGET && !tooBigPdf) {
      const direct = [];
      let inlineLeft = INLINE_TOTAL;
      for (const m of info) {
        const inline = m.size <= inlineLeft;
        if (inline) inlineLeft -= m.size;
        direct.push({ kind: m.kind, name: m.name, part: (await toPart(m, inline)).part });
      }
      logger.info('media_direct', { files: info.length, estimate: Math.round(tokens) });
      return { direct, pieces: [], cleanup };
    }

    // Hai bước: tách việc thành từng đơn vị (ghi âm nguyên tệp, PDF theo cụm trang) rồi chạy song song có giới hạn.
    const jobs = [];
    for (const m of info) {
      if (m.kind === 'audio') {
        jobs.push({ kind: 'audio', label: `Bản chuyển thể ghi âm "${m.name}"`, src: m });
        continue;
      }
      const chunks = m.pages ? await splitPdf(m.buffer, m.pages) : [{ buffer: m.buffer, from: 1, to: null }];
      for (const c of chunks) {
        const range = chunks.length > 1 ? ` (trang ${c.from}–${c.to})` : '';
        jobs.push({ kind: 'pdf', label: `PDF "${m.name}"${range}`, src: { buffer: c.buffer, size: c.buffer.length, mime: 'application/pdf', name: `${m.name}${range}` } });
      }
    }
    logger.info('media_two_step', { files: info.length, jobs: jobs.length, estimate: Math.round(tokens) });
    const pieces = await pool(jobs, EXTRACT_CONCURRENCY, async (job) => {
      const { part, uploadedName } = await toPart(job.src, job.src.size <= INLINE_SINGLE);
      const text = await gemini.extractMedia({ kind: job.kind, part, label: job.label });
      // Mỗi lượt chuyển thể độc lập → xoá tệp đã tải lên ngay, không giữ tới cuối.
      if (uploadedName) {
        uploaded.splice(uploaded.indexOf(uploadedName), 1);
        await gemini.deleteFile(uploadedName);
      }
      return { label: job.label, text };
    });
    return { direct: [], pieces, cleanup };
  } catch (err) {
    await cleanup();
    if (err?.message?.includes?.('encrypted')) throw unprocessable('PDF được đặt mật khẩu — hãy bỏ mật khẩu rồi tải lại', 'PDF_ENCRYPTED');
    throw err;
  }
}
