// Đưa tư liệu nặng (PDF, ghi âm) tới Gemini. Hai chế độ:
//  - trực tiếp: tổng tư liệu nhỏ → đính kèm ngay vào lượt dựng bài (AI vừa đọc/nghe vừa dựng, chất lượng tốt nhất);
//  - hai bước: tư liệu lớn → mỗi tệp (PDF cắt theo cụm trang) được AI chuyển thành văn bản trước, lượt dựng bài chỉ đọc văn bản.
// Vận chuyển: tệp nhỏ gửi inline (base64), tệp lớn qua Files API (giới hạn request inline ~20 MB). Tệp đã tải lên luôn được xoá.
// Agent Platform (gemini.supportsFiles = false) không có Files API: mọi tệp inline, mỗi request ≤ AGENT_INLINE_MAX; WAV lớn cắt đoạn.
import { openAsBlob } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
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
// Agent Platform: trần dữ liệu inline của 1 request (đo được nhận 150 MB, giữ thấp để base64 + JSON không chiếm nhiều trăm MB RAM
// mỗi lượt khi chạy song song EXTRACT_CONCURRENCY lượt). Cụm PDF (≤ PDF_CHUNK_BYTES) luôn lọt.
export const AGENT_INLINE_MAX = 48 * MB;

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

// WAV PCM → các đoạn ≤ maxBytes, cắt đúng ranh giới khung mẫu, mỗi đoạn có header riêng. Chỉ đọc header lúc chia; dữ liệu đoạn
// đọc khi tới lượt (load) để không giữ cả tệp trăm MB trong RAM. Không nhận dạng được → null.
export async function wavSegments(m, maxBytes) {
  const fh = m.buffer ? null : await open(m.path, 'r');
  const read = async (pos, len) => {
    if (!fh) return m.buffer.subarray(pos, pos + len);
    const b = Buffer.alloc(len);
    const { bytesRead } = await fh.read(b, 0, len, pos);
    return b.subarray(0, bytesRead);
  };
  try {
    const head = await read(0, 12);
    if (head.length < 12 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return null;
    let pos = 12;
    let fmt = null;
    let data = null;
    while (pos + 8 <= m.size && !data) {
      const ch = await read(pos, 8);
      if (ch.length < 8) break;
      const id = ch.toString('ascii', 0, 4);
      const size = ch.readUInt32LE(4);
      if (id === 'fmt ') fmt = await read(pos + 8, Math.min(size, 64));
      else if (id === 'data') data = { offset: pos + 8, size: Math.min(size, m.size - pos - 8) };
      pos += 8 + size + (size % 2);
    }
    if (!fmt || fmt.length < 16 || !data) return null;
    const blockAlign = fmt.readUInt16LE(12);
    const byteRate = fmt.readUInt32LE(8);
    if (!blockAlign || !byteRate) return null;
    const fmtChunk = Buffer.concat([Buffer.from('fmt '), Buffer.alloc(4), fmt.subarray(0, 16)]);
    fmtChunk.writeUInt32LE(16, 4);
    const per = Math.max(blockAlign, Math.floor((maxBytes - 64) / blockAlign) * blockAlign);
    const out = [];
    for (let off = 0; off < data.size; off += per) {
      const len = Math.min(per, data.size - off);
      out.push({
        fromSec: off / byteRate,
        toSec: (off + len) / byteRate,
        size: 44 + len,
        load: async () => {
          const f = m.buffer ? null : await open(m.path, 'r');
          try {
            const body = Buffer.alloc(len);
            if (f) await f.read(body, 0, len, data.offset + off);
            else m.buffer.copy(body, 0, data.offset + off, data.offset + off + len);
            const riff = Buffer.alloc(12);
            riff.write('RIFF', 0, 'ascii');
            riff.writeUInt32LE(4 + fmtChunk.length + 8 + len, 4);
            riff.write('WAVE', 8, 'ascii');
            const dh = Buffer.alloc(8);
            dh.write('data', 0, 'ascii');
            dh.writeUInt32LE(len, 4);
            return Buffer.concat([riff, fmtChunk, dh, body]);
          } finally {
            await f?.close();
          }
        },
      });
    }
    return out;
  } finally {
    await fh?.close();
  }
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

// Chạy fn trên từng phần tử, tối đa `limit` lượt đồng thời. Có lỗi → không khởi động việc mới, CHỜ các lượt đang chạy kết thúc
// rồi mới ném lỗi đầu tiên (để bước dọn dẹp của người gọi thấy đủ tài nguyên đã tạo, không bỏ sót).
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failure = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failure ||= { err };
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure.err;
  return results;
}

/**
 * @param media [{ kind:'pdf'|'audio', name, size, mime, path?|buffer? }]
 * @returns {{ direct: [{kind,name,part}], pieces: [{label,text}], cleanup: () => Promise<void> }}
 */
export async function prepareMedia(media, { gemini }) {
  const uploaded = [];
  const cleanup = async () => {
    // Mỗi tệp xoá độc lập: 1 lần xoá lỗi không làm bỏ sót các tệp còn lại.
    await Promise.allSettled(uploaded.splice(0).map((name) => gemini.deleteFile(name)));
  };
  if (!media.length) return { direct: [], pieces: [], cleanup };

  const filesApi = gemini.supportsFiles !== false;
  // Phần tử gửi cho Gemini: inline khi `inline` = true (hoặc nền tảng không có Files API), không thì tải lên Files API (ghi nhận để xoá sau).
  async function toPart({ buffer, path, size, mime, name, load }, inline) {
    if (load) return { part: { inlineData: { mimeType: mime, data: (await load()).toString('base64') } } };
    if (inline || !filesApi) return { part: { inlineData: { mimeType: mime, data: (buffer || (await readFile(path))).toString('base64') } } };
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
    // Không có Files API: lượt dựng bài chỉ mang được tư liệu inline ≤ AGENT_INLINE_MAX, vượt thì chuyển văn bản trước.
    const inlineFits = filesApi || info.reduce((a, m) => a + m.size, 0) <= AGENT_INLINE_MAX;

    if (tokens <= DIRECT_TOKEN_BUDGET && !tooBigPdf && inlineFits) {
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
        if (filesApi || m.size <= AGENT_INLINE_MAX) {
          jobs.push({ kind: 'audio', label: `Bản chuyển thể ghi âm "${m.name}"`, src: m });
          continue;
        }
        const segs = m.mime === 'audio/wav' ? await wavSegments(m, AGENT_INLINE_MAX) : null;
        if (!segs) {
          throw unprocessable(`Tệp ghi âm "${m.name}" quá lớn để AI xử lý (tối đa ${AGENT_INLINE_MAX / MB} MB mỗi tệp; riêng WAV được tự chia) — hãy nén sang MP3/M4A hoặc chia nhỏ`, 'AUDIO_TOO_LARGE');
        }
        segs.forEach((g, k) => {
          const range = ` (phần ${k + 1}/${segs.length}, ${clock(g.fromSec)}–${clock(g.toSec)})`;
          jobs.push({ kind: 'audio', label: `Bản chuyển thể ghi âm "${m.name}"${range}`, src: { size: g.size, mime: 'audio/wav', name: `${m.name}${range}`, load: g.load } });
        });
        continue;
      }
      const chunks = m.pages ? await splitPdf(m.buffer, m.pages) : [{ buffer: m.buffer, from: 1, to: null }];
      if (!filesApi && chunks.some((c) => c.buffer.length > AGENT_INLINE_MAX)) {
        throw unprocessable(`PDF "${m.name}" có trang quá lớn hoặc không tách được trang để AI đọc (tối đa ${AGENT_INLINE_MAX / MB} MB mỗi phần) — hãy nén/xuất lại PDF`, 'PDF_TOO_LARGE');
      }
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
