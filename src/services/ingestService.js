// Thu thập nội dung nguồn cho AI: nhiều tệp tải lên (tổng ≤ MAX_UPLOAD_MB), đường link tài liệu
// (kể cả Google Slides/Docs/Sheets/Drive) hoặc văn bản nhập tay.
// Kết quả: { pieces: [{label,text}], media: [{kind:'pdf'|'audio', name, size, mime, path?|buffer?}], images: [{buffer,name,hint}] }
//   pieces = văn bản đọc được ngay; media = PDF/ghi âm để Gemini đọc (OCR) / nghe; ảnh chưa chuẩn hoá.
// An toàn: nhận diện loại tệp bằng magic bytes; giới hạn zip-bomb; mọi link đi qua safeFetch (chặn SSRF).
import { open, readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { sniff, sniffVideo, decodeText, IMAGE_TYPES, AUDIO_TYPES, AUDIO_MIME } from '../lib/fileType.js';
import { safeFetch, assertPublicUrl } from '../lib/safeFetch.js';
import { badRequest, tooLarge, unprocessable, HttpError } from '../lib/httpError.js';

const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_UNCOMPRESSED = 400 * 1048576;
const MEDIA_RE = /\.(png|jpe?g|gif|webp)$/i;
const SUPPORTED_KINDS = new Set(['pdf', 'zip', 'text', ...IMAGE_TYPES, ...AUDIO_TYPES]);

const SUPPORTED_HINT = 'Dùng PPTX, DOCX, XLSX, PDF, CSV, TXT/MD, ảnh PNG/JPEG/WebP hoặc ghi âm MP3/M4A/WAV/OGG/FLAC/AAC/WebM.';
// Loại tệp nhận ra được nhưng chưa đọc được → hướng dẫn cụ thể cách chuyển đổi.
const KIND_HINT = {
  ole: 'là định dạng Office đời cũ (.doc/.xls/.ppt). Mở bằng Word/Excel/PowerPoint, chọn Lưu thành .docx/.xlsx/.pptx rồi tải lại.',
  heic: 'là ảnh HEIC (iPhone) chưa đọc được. Hãy chuyển sang JPEG/PNG (trên Mac: mở bằng Xem trước → Xuất → JPEG) rồi tải lại.',
};
const unsupported = (name, kind) =>
  new HttpError(
    415,
    'UNSUPPORTED_FILE',
    KIND_HINT[kind] ? `${name ? `Tệp "${name}"` : 'Tệp'} ${KIND_HINT[kind]}` : `${name ? `Tệp "${name}": định dạng` : 'Định dạng'} chưa hỗ trợ. ${SUPPORTED_HINT}`,
  );

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

// Bảng → hàng markdown "| a | b |" (giữ quan hệ hàng–cột của số liệu; tách từng đoạn thì AI mất cấu trúc bảng).
const cell = (v) => String(v).replace(/\|/g, '/').replace(/\s+/g, ' ').trim().slice(0, 200);
const mdRow = (cells) => `| ${cells.map(cell).join(' | ')} |`;

function docxTable(xml) {
  const rows = [];
  for (const tr of xml.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || []) {
    const cells = (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || []).map((tc) => paragraphs(tc, 'w:p', 'w:t').map((p) => p.text).join(' / '));
    if (cells.some(Boolean)) rows.push(mdRow(cells));
  }
  return rows.join('\n');
}

async function readDocx(zip) {
  const xml = await zip.file('word/document.xml').async('string');
  const lines = [];
  for (const block of xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g) || []) {
    if (block.startsWith('<w:tbl>')) {
      const t = docxTable(block);
      if (t) lines.push(t);
      continue;
    }
    const p = paragraphs(block, 'w:p', 'w:t')[0];
    if (!p) continue;
    const style = (p.xml.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
    const level = /heading\s*(\d)|^(?:Heading|Title)(\d?)$/i.exec(style);
    if (/^title$/i.test(style)) lines.push(`# ${p.text}`);
    else if (level) lines.push(`${'#'.repeat(Math.min(4, Number(level[1] || level[2] || 1) + 1))} ${p.text}`);
    else lines.push(p.text);
  }
  const images = [];
  for (const name of Object.keys(zip.files).filter((n) => /^word\/media\//.test(n) && MEDIA_RE.test(n)).sort()) {
    images.push({ name: name.split('/').pop(), hint: 'ảnh trong tài liệu gốc', buffer: await zip.file(name).async('nodebuffer') });
  }
  return { text: lines.join('\n'), images };
}

/* ---------------- bảng tính (dữ liệu thô) ---------------- */
const XLSX_MAX_ROWS = 400;
const XLSX_MAX_COLS = 40;
const attr = (tag, name) => decodeXml((tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1] || '');
const colIndex = (ref) => [...String(ref).replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// Kiểu hiển thị của ô theo định dạng số (styles.xml): ngày → dd/mm/yyyy, phần trăm → 12,5% (AI đọc số thô dễ hiểu sai).
function numberFormats(stylesXml) {
  if (!stylesXml) return [];
  const custom = new Map([...stylesXml.matchAll(/<numFmt\b[^>]*>/g)].map((m) => [Number(attr(m[0], 'numFmtId')), attr(m[0], 'formatCode')]));
  const xfs = (stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/) || [''])[0];
  return [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    if (id === 9 || id === 10 || code.includes('%')) return 'pct';
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmyh]/i.test(code)) return 'date';
    return '';
  });
}

function formatCell(raw, kind) {
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n)) return raw;
  if (kind === 'pct') return `${Number((n * 100).toPrecision(10)).toLocaleString('vi-VN')}%`;
  if (kind === 'date' && n > 0 && n < 2958466) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
    const p2 = (v) => String(v).padStart(2, '0');
    const time = n % 1 ? ` ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : '';
    return n < 1 ? time.trim() : `${p2(d.getUTCDate())}/${p2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}${time}`;
  }
  return String(Number(n.toPrecision(12)));
}

function tableText(title, rows) {
  const width = Math.min(XLSX_MAX_COLS, Math.max(0, ...rows.map((r) => r.length)));
  const kept = rows.slice(0, XLSX_MAX_ROWS).map((r) => mdRow(Array.from({ length: width }, (_, i) => r[i] ?? '')));
  const more = rows.length > XLSX_MAX_ROWS ? `\n…(còn ${rows.length - XLSX_MAX_ROWS} dòng, đã lược)` : '';
  return `## ${title} (${rows.length} dòng × ${width} cột)\n${kept.join('\n')}${more}`;
}

async function readXlsx(zip) {
  const strings = [];
  const ss = await zip.file('xl/sharedStrings.xml')?.async('string');
  for (const si of ss?.match(/<si>[\s\S]*?<\/si>/g) || []) strings.push(decodeXml([...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')));
  const formats = numberFormats(await zip.file('xl/styles.xml')?.async('string'));
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const parts = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const t = target.get(attr(m[0], 'r:id')) || '';
    const path = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`;
    const xml = await zip.file(path)?.async('string');
    if (!xml) continue;
    const rows = [];
    for (const row of xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || []) {
      if (rows.length > XLSX_MAX_ROWS) {
        rows.push([]);
        continue;
      }
      const cells = [];
      for (const c of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const tag = `<c${c[1]}>`;
        const ref = attr(tag, 'r');
        const col = ref ? colIndex(ref) : cells.length; // vài phần mềm bỏ thuộc tính r → ô liền kề
        const type = attr(tag, 't');
        const inner = c[2] || '';
        const v = decodeXml((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
        let val;
        if (type === 's') val = strings[Number(v)] ?? '';
        else if (type === 'inlineStr') val = decodeXml([...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
        else if (type === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'str' || type === 'e') val = v;
        else val = formatCell(v, formats[Number(attr(tag, 's')) || 0]);
        if (col >= 0 && col < XLSX_MAX_COLS) cells[col] = String(val).trim();
      }
      if (cells.some(Boolean)) rows.push(Array.from(cells, (x) => x ?? ''));
    }
    if (rows.length) parts.push(tableText(`Bảng tính "${attr(m[0], 'name')}"${attr(m[0], 'state') === 'hidden' ? ' (ẩn)' : ''}`, rows));
  }
  return { text: parts.join('\n\n'), images: [] };
}

// OpenDocument (LibreOffice: .odt/.odp/.ods): chữ nằm trong content.xml; bảng tính → bảng markdown.
async function readOdf(zip) {
  const xml = (await zip.file('content.xml')?.async('string')) || '';
  const text = (frag) => decodeXml(frag.replace(/<text:(?:s|tab|line-break)\b[^>]*\/>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const mime = ((await zip.file('mimetype')?.async('string')) || '').trim();
  if (mime.endsWith('spreadsheet')) {
    const parts = [];
    for (const tb of xml.match(/<table:table\b[\s\S]*?<\/table:table>/g) || []) {
      const rows = [];
      for (const tr of tb.match(/<table:table-row\b[\s\S]*?<\/table:table-row>/g) || []) {
        if (rows.length > XLSX_MAX_ROWS) break;
        const cells = [];
        for (const tc of tr.matchAll(/<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
          const rep = Math.min(XLSX_MAX_COLS, Number(attr(`<c${tc[1]}>`, 'table:number-columns-repeated')) || 1);
          const v = text(tc[2] || '');
          for (let k = 0; k < rep && cells.length < XLSX_MAX_COLS; k += 1) cells.push(v);
        }
        while (cells.length && !cells[cells.length - 1]) cells.pop();
        if (cells.some(Boolean)) rows.push(cells);
      }
      if (rows.length) parts.push(tableText(`Bảng tính "${attr(tb.slice(0, 300), 'table:name')}"`, rows));
    }
    return { text: parts.join('\n\n'), images: [] };
  }
  const lines = (xml.match(/<text:(?:p|h)\b[\s\S]*?<\/text:(?:p|h)>/g) || []).map((p) => (p.startsWith('<text:h') ? `## ${text(p)}` : text(p))).filter((l) => l.replace(/^## /, ''));
  const images = [];
  for (const name of Object.keys(zip.files).filter((n) => /^Pictures\//.test(n) && MEDIA_RE.test(n)).sort()) {
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
    else if (zip.file('xl/workbook.xml')) doc = await readXlsx(zip);
    else if (zip.file('content.xml') && zip.file('mimetype')) doc = await readOdf(zip);
    else throw unsupported(name);
    return { pieces: doc.text ? [{ label, text: doc.text }] : [], images: doc.images.map((im) => ({ ...im, hint: `${im.hint} (${label})` })), media: [] };
  }
  if (IMAGE_TYPES.has(kind)) return { pieces: [], media: [], images: [{ name: label, hint: `ảnh tải lên "${label}"`, buffer }] };
  if (kind === 'text') {
    const raw = decodeText(buffer);
    const text = /^\s*<(!doctype html|html)/i.test(raw) ? htmlToText(raw).text : raw;
    // CSV/TSV: báo cho AI đây là bảng dữ liệu thô (dòng đầu thường là tên cột) → phân tích, không chép nguyên.
    const table = /\.(csv|tsv)$/i.test(label) || /csv/i.test(label) ? `${label} — bảng dữ liệu, dòng đầu là tên cột` : label;
    return { pieces: text.trim() ? [{ label: table, text: clip(text, limits.maxTextChars) }] : [], images: [], media: [] };
  }
  throw unsupported(name, kind);
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
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function googleCandidates(url, apiKey) {
  let m;
  const drive = (id, fmt) =>
    apiKey ? [`https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(DRIVE_MIME[fmt])}&key=${encodeURIComponent(apiKey)}`] : [];
  if ((m = G_SLIDES.exec(url))) return [`https://docs.google.com/presentation/d/${m[1]}/export/pptx`, ...drive(m[1], 'pptx')];
  if ((m = G_DOCS.exec(url))) return [`https://docs.google.com/document/d/${m[1]}/export?format=docx`, ...drive(m[1], 'docx')];
  // xlsx giữ mọi trang tính (csv chỉ xuất trang đầu).
  if ((m = G_SHEETS.exec(url))) return [`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`, ...drive(m[1], 'xlsx')];
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
      const name = String(f.originalname || 'tệp tải lên').normalize('NFC').slice(0, 200); // tên tệp trên Mac thường ở dạng NFD
      if (!f.size) throw badRequest(`Tệp "${name}" rỗng`, 'EMPTY_FILE');
      const kind = sniff(await readHead(f.path));
      if (!SUPPORTED_KINDS.has(kind)) throw unsupported(name, kind);
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

/**
 * Ảnh/video người dùng gửi kèm khi tạo bài — KHÔNG phải tư liệu để đọc mà là media BẮT BUỘC đưa vào bài.
 * Kiểm tra loại (magic bytes), kích thước từng tệp, số lượng; ghép ảnh bìa video (tên "poster-<vị trí trong media>.jpg",
 * do trình duyệt chụp — không có thì bỏ qua).
 * @returns {{ images: Array<{path,name,size}>, videos: Array<{path,name,size,type,poster:string|null}> }}
 */
export async function precheckMedia(media, posters, limits) {
  const list = Array.isArray(media) ? media : [];
  const out = { images: [], videos: [] };
  if (!list.length) return out;
  if (list.length > limits.maxCreateMedia) throw badRequest(`Tối đa ${limits.maxCreateMedia} ảnh/video gửi kèm mỗi lần tạo`, 'TOO_MANY_FILES');
  const posterAt = new Map();
  for (const p of Array.isArray(posters) ? posters : []) {
    const m = /^poster-(\d{1,3})\.jpe?g$/i.exec(String(p.originalname || ''));
    if (m && p.size && p.size <= limits.maxImageUploadMb * 1048576) posterAt.set(Number(m[1]), p.path);
  }
  for (const [i, f] of list.entries()) {
    const name = String(f.originalname || 'tệp media').normalize('NFC').slice(0, 200);
    if (!f.size) throw badRequest(`Tệp "${name}" rỗng`, 'EMPTY_FILE');
    const head = await readHead(f.path);
    const kind = sniff(head);
    if (IMAGE_TYPES.has(kind)) {
      if (f.size > limits.maxImageUploadMb * 1048576) throw tooLarge(`Ảnh "${name}" vượt ${limits.maxImageUploadMb} MB`, 'FILE_TOO_LARGE');
      out.images.push({ path: f.path, name, size: f.size });
      continue;
    }
    const video = sniffVideo(head);
    if (video) {
      if (f.size > limits.maxVideoMb * 1048576) throw tooLarge(`Video "${name}" vượt ${limits.maxVideoMb} MB`, 'FILE_TOO_LARGE');
      out.videos.push({ path: f.path, name, size: f.size, type: video, poster: posterAt.get(i) || null });
      continue;
    }
    if (kind === 'heic') throw unsupported(name, kind);
    throw new HttpError(415, 'UNSUPPORTED_FILE', `"${name}": chỉ gửi kèm ảnh (PNG, JPEG, WebP, GIF, AVIF) hoặc video (MP4, MOV, WebM)`);
  }
  if (out.videos.length > limits.maxVideosPerDeck) throw badRequest(`Tối đa ${limits.maxVideosPerDeck} video mỗi bài trình bày`, 'TOO_MANY_FILES');
  return out;
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
