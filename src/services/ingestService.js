// Thu thập nội dung nguồn cho AI: nhiều tệp tải lên (tổng ≤ MAX_UPLOAD_MB), đường link tài liệu
// (kể cả Google Slides/Docs/Sheets/Drive) hoặc văn bản nhập tay.
// Kết quả: { pieces: [{label,text}], media: [{kind:'pdf'|'audio', name, size, mime, path?|buffer?}], images: [{buffer,name,hint}] }
//   pieces = văn bản đọc được ngay; media = PDF/ghi âm để Gemini đọc (OCR) / nghe; ảnh chưa chuẩn hoá.
// An toàn: nhận diện loại tệp bằng magic bytes; giới hạn zip-bomb; mọi link đi qua safeFetch (chặn SSRF).
import { open, readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { sniff, IMAGE_TYPES, AUDIO_TYPES, AUDIO_MIME } from '../lib/fileType.js';
import { safeFetch, assertPublicUrl } from '../lib/safeFetch.js';
import { badRequest, tooLarge, unprocessable, HttpError } from '../lib/httpError.js';

const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED = 400 * 1048576;
const MEDIA_RE = /\.(png|jpe?g|gif|webp)$/i;
const SUPPORTED_KINDS = new Set(['pdf', 'zip', 'text', ...IMAGE_TYPES, ...AUDIO_TYPES]);

const unsupported = (name) =>
  new HttpError(415, 'UNSUPPORTED_FILE', `${name ? `Tệp "${name}": định dạng` : 'Định dạng'} chưa hỗ trợ. Dùng PPTX, DOCX, PDF, TXT/MD, ảnh PNG/JPEG/WebP hoặc ghi âm MP3/M4A/WAV/OGG/FLAC/AAC/WebM.`);

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

/** Đọc 1 tệp đã nằm trong bộ nhớ (từ link, hoặc tệp tải lên sau khi đọc vào RAM). */
export async function readBuffer(buffer, name, limits, kind = sniff(buffer)) {
  const label = name || 'tài liệu';
  if (kind === 'pdf') return { pieces: [], images: [], media: [{ kind: 'pdf', name: label, size: buffer.length, mime: 'application/pdf', buffer }] };
  if (AUDIO_TYPES.has(kind)) return { pieces: [], images: [], media: [{ kind: 'audio', name: label, size: buffer.length, mime: AUDIO_MIME[kind], buffer }] };
  if (kind === 'zip') {
    const zip = await openZip(buffer);
    let doc;
    if (zip.file('ppt/presentation.xml')) doc = await readPptx(zip);
    else if (zip.file('word/document.xml')) doc = await readDocx(zip);
    else throw unsupported(name);
    return { pieces: doc.text ? [{ label, text: doc.text }] : [], images: doc.images.map((im) => ({ ...im, hint: `${im.hint} (${label})` })), media: [] };
  }
  if (IMAGE_TYPES.has(kind)) return { pieces: [], media: [], images: [{ name: label, hint: `ảnh tải lên "${label}"`, buffer }] };
  if (kind === 'text') {
    const raw = buffer.toString('utf8');
    const text = /^\s*<(!doctype html|html)/i.test(raw) ? htmlToText(raw).text : raw;
    return { pieces: text.trim() ? [{ label, text: clip(text, limits.maxTextChars) }] : [], images: [], media: [] };
  }
  throw unsupported(name);
}

const EMPTY = () => ({ pieces: [], media: [], images: [] });
function merge(into, part) {
  into.pieces.push(...part.pieces);
  into.media.push(...part.media);
  into.images.push(...part.images);
  return into;
}

async function readHead(path) {
  const fh = await open(path, 'r');
  try {
    const buf = Buffer.alloc(16384);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

/** Tệp tải lên (multer ghi ra đĩa): PDF/ghi âm giữ trên đĩa (gửi cho AI theo luồng), loại khác đọc vào RAM. */
async function readUploaded(file, limits) {
  if (file.kind === 'pdf' || AUDIO_TYPES.has(file.kind)) {
    return { pieces: [], images: [], media: [{ kind: file.kind === 'pdf' ? 'pdf' : 'audio', name: file.name, size: file.size, mime: file.kind === 'pdf' ? 'application/pdf' : AUDIO_MIME[file.kind], path: file.path }] };
  }
  return readBuffer(await readFile(file.path), file.name, limits, file.kind);
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

// Tên hiển thị cho tài liệu tải từ link (dùng làm nhãn tư liệu cho AI).
const title0 = (url) => {
  if (G_SLIDES.test(url)) return 'Google Slides';
  if (G_DOCS.test(url)) return 'Google Docs';
  if (G_SHEETS.test(url)) return 'Google Sheets';
  return decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || new URL(url).hostname;
};

async function fetchDocument(url, limits, googleApiKey) {
  const candidates = googleCandidates(url, googleApiKey) || [url];
  let lastErr = null;
  for (const candidate of candidates) {
    try {
      // Cùng trần tổng tư liệu với tệp tải lên (Google Slides nhiều ảnh xuất PPTX dễ vượt 50 MB); xuất tệp lớn có thể chậm.
      const res = await safeFetch(candidate, { timeoutMs: 300000, maxBytes: limits.maxUploadMb * 1048576 });
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
        return { pieces: [{ label: title || url, text: clip(text, limits.maxTextChars) }], media: [], images: [] };
      }
      return await readBuffer(res.body, title0(url), limits);
    } catch (err) {
      if (err instanceof HttpError && err.code !== 'SOURCE_FORBIDDEN' && err.code !== 'SOURCE_ERROR') throw err;
      lastErr = err instanceof HttpError ? err : unprocessable('Không tải được tài liệu từ đường link', 'SOURCE_FETCH_FAILED');
    }
  }
  throw lastErr || unprocessable('Không tải được tài liệu từ đường link', 'SOURCE_FETCH_FAILED');
}

/**
 * Kiểm tra nhanh đầu vào (trước khi trả 202) — lỗi rõ ràng trả ngay cho người dùng.
 * files: tệp multer trên đĩa ({ path, originalname, size }). Trả thêm `files` đã nhận diện loại để job dùng lại.
 */
export async function precheckSource({ files, url, text }, limits) {
  const list = Array.isArray(files) ? files : [];
  const given = [list.length ? list : null, url, text].filter((v) => v !== undefined && v !== null && v !== '').length;
  if (given !== 1) throw badRequest('Chọn đúng 1 loại nguồn: tệp tài liệu, đường link hoặc nội dung nhập tay', 'SOURCE_REQUIRED');
  if (list.length) {
    if (list.length > limits.maxUploadFiles) throw badRequest(`Tối đa ${limits.maxUploadFiles} tệp mỗi lần tạo`, 'TOO_MANY_FILES');
    const total = list.reduce((n, f) => n + (f.size || 0), 0);
    if (total > limits.maxUploadMb * 1048576) throw tooLarge(`Tổng dung lượng tệp tối đa ${limits.maxUploadMb} MB`, 'UPLOAD_TOO_LARGE');
    const checked = [];
    for (const f of list) {
      const name = String(f.originalname || 'tệp tải lên').slice(0, 200);
      if (!f.size) throw badRequest(`Tệp "${name}" rỗng`, 'EMPTY_FILE');
      const kind = sniff(await readHead(f.path));
      if (!SUPPORTED_KINDS.has(kind)) throw unsupported(name);
      checked.push({ path: f.path, name, size: f.size, kind });
    }
    const names = checked.map((f) => f.name);
    const label = names.length === 1 ? names[0] : `${names.length} tệp: ${names.join(', ')}`;
    return { sourceKind: 'file', sourceLabel: label.slice(0, 300), files: checked };
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

/** Thu thập nội dung đầy đủ (chạy nền). files = kết quả `precheckSource().files`. */
export async function ingestSource({ files, url, text }, { limits, googleApiKey }) {
  if (files?.length) {
    const out = EMPTY();
    for (const f of files) merge(out, await readUploaded(f, limits));
    return out;
  }
  if (url) return fetchDocument(assertPublicUrl(String(url).trim()).toString(), limits, googleApiKey);
  return { pieces: [{ label: 'Nội dung nhập tay', text: clip(String(text).trim(), limits.maxTextChars) }], media: [], images: [] };
}

/**
 * Ghép nhiều tư liệu văn bản trong giới hạn `max` ký tự, chia công bằng (water-filling):
 * tư liệu ngắn giữ nguyên, phần dư dồn cho tư liệu dài — không để 1 tệp dài "nuốt" hết tệp khác.
 */
export function fitPieces(pieces, max) {
  const list = pieces.filter((p) => p.text && p.text.trim());
  if (!list.length) return '';
  const CUT = '\n…(đã cắt bớt phần cuối do tổng tư liệu quá dài)';
  const header = (p, i) => (list.length > 1 ? `=== Tư liệu ${i + 1}: ${p.label} ===\n` : '');
  // Trừ trước phần đầu mục + ghi chú cắt để tổng không vượt max.
  let left = Math.max(0, max - list.reduce((n, p, i) => n + header(p, i).length + CUT.length + 2, 0));
  const alloc = list.map(() => 0);
  let open = list.map((_, i) => i);
  // Mỗi vòng chia đều phần còn lại cho các tư liệu chưa đủ; mỗi vòng `left` giảm hoặc `open` co lại → luôn dừng.
  while (open.length && left > 0) {
    const share = Math.max(1, Math.floor(left / open.length));
    const next = [];
    for (const i of open) {
      const give = Math.min(list[i].text.length - alloc[i], share, left);
      alloc[i] += give;
      left -= give;
      if (alloc[i] < list[i].text.length) next.push(i);
    }
    open = next;
  }
  return list.map((p, i) => header(p, i) + (alloc[i] < p.text.length ? p.text.slice(0, alloc[i]) + CUT : p.text)).join('\n\n');
}
