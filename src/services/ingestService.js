// Thu thập nội dung nguồn cho AI: tệp tải lên, đường link tài liệu (kể cả Google Slides/Docs/Sheets/Drive) hoặc văn bản nhập tay.
// Kết quả: { sourceKind, sourceLabel, text, pdf?, images: [{buffer,name,hint}] } — ảnh chưa chuẩn hoá.
// An toàn: nhận diện loại tệp bằng magic bytes; giới hạn zip-bomb; mọi link đi qua safeFetch (chặn SSRF).
import JSZip from 'jszip';
import { sniff, IMAGE_TYPES } from '../lib/fileType.js';
import { safeFetch, assertPublicUrl } from '../lib/safeFetch.js';
import { badRequest, tooLarge, unprocessable, HttpError } from '../lib/httpError.js';

const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED = 400 * 1048576;
const MAX_PDF_FOR_MODEL = 18 * 1048576;
const MEDIA_RE = /\.(png|jpe?g|gif|webp)$/i;

const unsupported = () => new HttpError(415, 'UNSUPPORTED_FILE', 'Định dạng chưa hỗ trợ. Dùng PPTX, DOCX, PDF, TXT/MD hoặc ảnh PNG/JPEG/WebP.');

function decodeXml(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

// Ghép chữ trong từng đoạn (<a:p>/<w:p>) — giữ ranh giới đoạn để AI hiểu cấu trúc.
function paragraphs(xml, pTag, tTag) {
  const out = [];
  const pRe = new RegExp(`<${pTag}[\\s>][\\s\\S]*?</${pTag}>`, 'g');
  const tRe = new RegExp(`<${tTag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tTag}>`, 'g');
  for (const p of xml.match(pRe) || []) {
    let line = '';
    for (const m of p.matchAll(tRe)) line += decodeXml(m[1]);
    line = line.replace(/\s+/g, ' ').trim();
    if (line) out.push({ xml: p, text: line });
  }
  return out;
}

async function openZip(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
  } catch {
    throw unprocessable('Không mở được tệp nén (tệp hỏng?)', 'BAD_ARCHIVE');
  }
  const names = Object.keys(zip.files);
  if (names.length > MAX_ZIP_ENTRIES) throw unprocessable('Tệp có quá nhiều thành phần', 'BAD_ARCHIVE');
  let total = 0;
  for (const n of names) total += zip.files[n]._data?.uncompressedSize || 0;
  if (total > MAX_ZIP_UNCOMPRESSED) throw unprocessable('Tệp giải nén quá lớn', 'BAD_ARCHIVE');
  return zip;
}

const numOf = (name) => Number((name.match(/(\d+)\.xml$/) || [])[1] || 0);

async function readPptx(zip) {
  const slideNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => numOf(a) - numOf(b));
  const parts = [];
  const images = [];
  const used = new Set();
  for (const [i, name] of slideNames.entries()) {
    const xml = await zip.file(name).async('string');
    const lines = paragraphs(xml, 'a:p', 'a:t').map((p) => p.text);
    const notesName = `ppt/notesSlides/notesSlide${numOf(name)}.xml`;
    let notes = '';
    if (zip.file(notesName)) notes = paragraphs(await zip.file(notesName).async('string'), 'a:p', 'a:t').map((p) => p.text).filter((t) => !/^\d+$/.test(t)).join(' ');
    parts.push(`--- Trang ${i + 1} ---\n${lines.join('\n')}${notes ? `\n[Ghi chú: ${notes}]` : ''}`);
    const rels = zip.file(`ppt/slides/_rels/slide${numOf(name)}.xml.rels`);
    if (rels) {
      const relXml = await rels.async('string');
      for (const m of relXml.matchAll(/Target="([^"]+)"/g)) {
        const target = m[1].replace(/^\.\.\//, 'ppt/');
        if (MEDIA_RE.test(target) && zip.file(target) && !used.has(target)) {
          used.add(target);
          images.push({ name: target.split('/').pop(), hint: `trang ${i + 1} của tài liệu gốc`, buffer: await zip.file(target).async('nodebuffer') });
        }
      }
    }
  }
  return { text: parts.join('\n\n'), images };
}

async function readDocx(zip) {
  const xml = await zip.file('word/document.xml').async('string');
  const lines = paragraphs(xml, 'w:p', 'w:t').map((p) => {
    const style = (p.xml.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    const level = /heading\s*(\d)|^(?:Heading|Title)(\d?)$/i.exec(style);
    if (/^title$/i.test(style)) return `# ${p.text}`;
    if (level) return `${'#'.repeat(Math.min(4, Number(level[1] || level[2] || 1) + 1))} ${p.text}`;
    return p.text;
  });
  const images = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/media\//.test(n) && MEDIA_RE.test(n)).sort()) {
    images.push({ name: name.split('/').pop(), hint: 'ảnh trong tài liệu gốc', buffer: await zip.file(name).async('nodebuffer') });
  }
  return { text: lines.join('\n'), images };
}

export function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decodeXml(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title: decodeXml(title).trim(), text };
}

function clip(text, max) {
  return text.length > max ? `${text.slice(0, max)}\n…(đã cắt bớt phần cuối do tài liệu quá dài)` : text;
}

/** Đọc 1 tệp (từ upload hoặc tải về từ link). */
export async function readDocument(buffer, filename, limits) {
  const kind = sniff(buffer);
  if (kind === 'pdf') {
    if (buffer.length > MAX_PDF_FOR_MODEL) throw tooLarge('PDF quá lớn để AI đọc (tối đa 18 MB). Hãy tách nhỏ tài liệu.');
    return { text: '', pdf: buffer, images: [] };
  }
  if (kind === 'zip') {
    const zip = await openZip(buffer);
    if (zip.file('ppt/presentation.xml')) return readPptx(zip);
    if (zip.file('word/document.xml')) return readDocx(zip);
    throw unsupported();
  }
  if (IMAGE_TYPES.has(kind)) return { text: '', images: [{ name: filename || 'image', hint: 'ảnh người dùng tải lên', buffer }] };
  if (kind === 'text') {
    const raw = buffer.toString('utf8');
    if (/^\s*<(!doctype html|html)/i.test(raw)) return { text: clip(htmlToText(raw).text, limits.maxTextChars), images: [] };
    return { text: clip(raw, limits.maxTextChars), images: [] };
  }
  throw unsupported();
}

/* ---------------- link ---------------- */
const G_SLIDES = /^https:\/\/docs\.google\.com\/presentation\/d\/([\w-]{10,})/;
const G_DOCS = /^https:\/\/docs\.google\.com\/document\/d\/([\w-]{10,})/;
const G_SHEETS = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]{10,})/;
const G_DRIVE = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/;

const DRIVE_MIME = {
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
};

function googleCandidates(url, apiKey) {
  let m;
  const drive = (id, fmt) =>
    apiKey ? [`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(DRIVE_MIME[fmt])}&key=${encodeURIComponent(apiKey)}`] : [];
  if ((m = G_SLIDES.exec(url))) return [`https://docs.google.com/presentation/d/${m[1]}/export/pptx`, ...drive(m[1], 'pptx')];
  if ((m = G_DOCS.exec(url))) return [`https://docs.google.com/document/d/${m[1]}/export?format=docx`, ...drive(m[1], 'docx')];
  if ((m = G_SHEETS.exec(url))) return [`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`, ...drive(m[1], 'csv')];
  if ((m = G_DRIVE.exec(url))) {
    const alt = apiKey ? [`https://www.googleapis.com/drive/v3/files/${m[1]}?alt=media&key=${encodeURIComponent(apiKey)}`] : [];
    return [`https://drive.google.com/uc?export=download&id=${m[1]}`, ...alt];
  }
  return null;
}

async function fetchDocument(url, limits, googleApiKey) {
  const candidates = googleCandidates(url, googleApiKey) || [url];
  let lastErr = null;
  for (const candidate of candidates) {
    try {
      const res = await safeFetch(candidate, { timeoutMs: 45000, maxBytes: limits.maxUploadMb * 1048576 });
      if (res.status >= 400) {
        lastErr = res.status === 401 || res.status === 403 || res.status === 404
          ? unprocessable('Không truy cập được tài liệu. Hãy đặt chia sẻ "Bất kỳ ai có đường liên kết" rồi thử lại.', 'SOURCE_FORBIDDEN')
          : unprocessable(`Máy chủ nguồn trả lỗi ${res.status}`, 'SOURCE_ERROR');
        continue;
      }
      const ct = (res.contentType || '').toLowerCase();
      // Google trả trang đăng nhập HTML khi tài liệu không công khai.
      if (candidates.length > 1 && ct.includes('text/html')) {
        lastErr = unprocessable('Tài liệu Google chưa được chia sẻ công khai. Hãy đặt "Bất kỳ ai có đường liên kết – Người xem".', 'SOURCE_FORBIDDEN');
        continue;
      }
      if (ct.includes('text/html')) {
        const { title, text } = htmlToText(res.body.toString('utf8'));
        if (text.length < 40) throw unprocessable('Trang web không có đủ nội dung văn bản để tạo bài trình bày', 'SOURCE_EMPTY');
        return { title, text: clip(text, limits.maxTextChars), images: [] };
      }
      return await readDocument(res.body, '', limits);
    } catch (err) {
      if (err instanceof HttpError && err.code !== 'SOURCE_FORBIDDEN' && err.code !== 'SOURCE_ERROR') throw err;
      lastErr = err instanceof HttpError ? err : unprocessable('Không tải được tài liệu từ đường link', 'SOURCE_FETCH_FAILED');
    }
  }
  throw lastErr || unprocessable('Không tải được tài liệu từ đường link', 'SOURCE_FETCH_FAILED');
}

/** Kiểm tra nhanh đầu vào (đồng bộ, trước khi trả 202) — lỗi rõ ràng trả ngay cho người dùng. */
export function precheckSource({ file, url, text }, limits) {
  const given = [file, url, text].filter((v) => v !== undefined && v !== null && v !== '').length;
  if (given !== 1) throw badRequest('Chọn đúng 1 nguồn: tệp tài liệu, đường link hoặc nội dung nhập tay', 'SOURCE_REQUIRED');
  if (file) {
    const kind = sniff(file.buffer);
    if (!['pdf', 'zip', 'text'].includes(kind) && !IMAGE_TYPES.has(kind)) throw unsupported();
    return { sourceKind: 'file', sourceLabel: String(file.originalname || 'tệp tải lên').slice(0, 300) };
  }
  if (url) {
    const u = assertPublicUrl(String(url).trim());
    return { sourceKind: 'url', sourceLabel: u.toString().slice(0, 300) };
  }
  const t = String(text).trim();
  if (t.length < 20) throw badRequest('Nội dung quá ngắn — nhập ít nhất 20 ký tự', 'TEXT_TOO_SHORT');
  if (t.length > limits.maxTextChars) throw tooLarge(`Nội dung tối đa ${limits.maxTextChars.toLocaleString('vi-VN')} ký tự`);
  return { sourceKind: 'text', sourceLabel: t.slice(0, 80).replace(/\s+/g, ' ') };
}

/** Thu thập nội dung đầy đủ (chạy nền). */
export async function ingestSource({ file, url, text }, { limits, googleApiKey }) {
  if (file) return readDocument(file.buffer, file.originalname, limits);
  if (url) return fetchDocument(assertPublicUrl(String(url).trim()).toString(), limits, googleApiKey);
  return { text: clip(String(text).trim(), limits.maxTextChars), images: [] };
}
