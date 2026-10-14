// Thu thập nội dung nguồn cho AI: nhiều tệp tải lên (tổng ≤ MAX_UPLOAD_MB), đường link tài liệu
// (kể cả Google Slides/Docs/Sheets/Drive) hoặc văn bản nhập tay.
// Kết quả: { pieces: [{label,text}], media: [{kind:'pdf'|'audio', name, size, mime, path?|buffer?}], images: [{buffer,name,hint}],
//            docs: [{ name, ext:'pptx'|'docx'|'odp'|'odt', buffer }] }
//   pieces = văn bản đọc được ngay; media = PDF/ghi âm để Gemini đọc (OCR) / nghe; ảnh chưa chuẩn hoá;
//   docs = tài liệu trình bày/văn bản Office gốc — render thành trang (LibreOffice) để cắt sơ đồ, ảnh giao diện (visualService).
// An toàn: nhận diện loại tệp bằng magic bytes; giới hạn zip-bomb; mọi link đi qua safeFetch (chặn SSRF).
import { open, readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { sniff, sniffVideo, decodeText, IMAGE_TYPES, AUDIO_TYPES, AUDIO_MIME } from '../lib/fileType.js';
import { safeFetch, assertPublicUrl } from '../lib/safeFetch.js';
import { isDriveFolderLink, driveFolderRef, fetchDriveFolder, DRIVE_HINT } from './driveFolder.js';
import { badRequest, tooLarge, unprocessable, HttpError } from '../lib/httpError.js';
import { safeHref } from '../../shared/deck/rich.js';
import { decodeEntities } from '../lib/html.js';
import { pageMeta, findPageImages, fetchImages, isFacebook, webImageHint } from './webSource.js';

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

const decodeXml = decodeEntities;

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

/* ---------------- liên kết trong tư liệu → "[nhãn](URL)" ngay trong chữ (AI thấy và giữ lại; xem src/lib/mdLinks.js) ---------------- */
const xmlEsc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Bảng Id → URL ngoài (chỉ http(s)/mailto/tel hợp lệ) từ tệp .rels của Office.
function externalRels(relXml) {
  const map = new Map();
  for (const m of String(relXml || '').matchAll(/<Relationship\b[^>]*>/g)) {
    if (!/TargetMode="External"/.test(m[0])) continue;
    const id = attr(m[0], 'Id');
    const url = safeHref(attr(m[0], 'Target'));
    if (id && url) map.set(id, url);
  }
  return map;
}
// Ghép các đoạn liền nhau cùng URL ("[MI](u)[SA](u)" → "[MISA](u)") — Office hay tách 1 liên kết thành nhiều run.
export const mergeLinks = (text) => {
  let out = text;
  for (let i = 0; i < 20; i += 1) {
    const next = out.replace(/\[([^[\]\n]*)\]\(([^()\s]+)\)\[([^[\]\n]*)\]\(\2\)/g, '[$1$3]($2)');
    if (next === out) break;
    out = next;
  }
  return out;
};

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
    let xml = await zip.file(name).async('string');
    const relFile = zip.file(`ppt/slides/_rels/slide${numOf(name)}.xml.rels`);
    const links = externalRels(relFile ? await relFile.async('string') : '');
    if (links.size) {
      xml = xml.replace(/<a:r>([\s\S]*?)<\/a:r>/g, (run, inner) => {
        const id = (inner.match(/<a:hlinkClick\b[^>]*\br:id="([^"]+)"/) || [])[1];
        const url = id && links.get(id);
        return url ? run.replace(/<a:t>([\s\S]*?)<\/a:t>/, (_t, txt) => (txt.trim() ? `<a:t>[${txt}](${xmlEsc(url)})</a:t>` : _t)) : run;
      });
    }
    const lines = paragraphs(xml, 'a:p', 'a:t').map((p) => mergeLinks(p.text));
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
  let xml = await zip.file('word/document.xml').async('string');
  const links = externalRels(await zip.file('word/_rels/document.xml.rels')?.async('string'));
  if (links.size) {
    xml = xml.replace(/<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>/g, (all, attrs, inner) => {
      const url = links.get((attrs.match(/\br:id="([^"]+)"/) || [])[1]);
      return url && /<w:t\b/.test(inner) ? `<w:r><w:t>[</w:t></w:r>${inner}<w:r><w:t>](${xmlEsc(url)})</w:t></w:r>` : all;
    });
  }
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

export function htmlToText(html, baseUrl) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const body = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    // Liên kết có nhãn chữ → "[nhãn](URL)" (đường dẫn tương đối tính theo trang); bỏ liên kết nội bộ (#…), javascript:…
    .replace(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a>/gi, (all, h1, h2, inner) => {
      const label = decodeXml(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().replace(/[[\]]/g, '');
      const href = decodeXml(h1 ?? h2 ?? '').trim();
      let url = null;
      try {
        url = href.startsWith('#') ? null : safeHref(new URL(href, baseUrl || undefined).href);
      } catch {
        url = null;
      }
      return label && url && label.length <= 160 ? ` [${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}](${url.replace(/&/g, '&amp;')}) ` : inner;
    })
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
    let ext = '';
    if (zip.file('ppt/presentation.xml')) {
      doc = await readPptx(zip);
      ext = 'pptx';
    } else if (zip.file('word/document.xml')) {
      doc = await readDocx(zip);
      ext = 'docx';
    } else if (zip.file('xl/workbook.xml')) doc = await readXlsx(zip);
    else if (zip.file('content.xml') && zip.file('mimetype')) {
      doc = await readOdf(zip);
      const mt = await zip.file('mimetype').async('string');
      ext = /opendocument\.presentation/.test(mt) ? 'odp' : /opendocument\.text/.test(mt) ? 'odt' : '';
    } else throw unsupported(name);
    // Slide/văn bản: giữ tệp gốc để render trang → cắt sơ đồ vẽ bằng hình khối/SmartArt + ảnh giao diện (ảnh nhúng không thấy được).
    return { pieces: doc.text ? [{ label, text: doc.text }] : [], images: doc.images.map((im) => ({ ...im, hint: `${im.hint} (${label})` })), media: [], docs: ext ? [{ name: label, ext, buffer }] : [] };
  }
  // standalone: ảnh tải lên riêng lẻ (không nằm trong tài liệu) — visualService xem cả ảnh để cắt/vẽ lại sơ đồ, giao diện.
  if (IMAGE_TYPES.has(kind)) return { pieces: [], media: [], images: [{ name: label, hint: `ảnh tải lên "${label}"`, buffer, standalone: true }] };
  if (kind === 'text') {
    const raw = decodeText(buffer);
    const text = /^\s*<(!doctype html|html)/i.test(raw) ? htmlToText(raw).text : raw;
    // CSV/TSV: báo cho AI đây là bảng dữ liệu thô (dòng đầu thường là tên cột) → phân tích, không chép nguyên.
    const table = /\.(csv|tsv)$/i.test(label) || /csv/i.test(label) ? `${label} — bảng dữ liệu, dòng đầu là tên cột` : label;
    return { pieces: text.trim() ? [{ label: table, text: clip(text, limits.maxTextChars) }] : [], images: [], media: [] };
  }
  throw unsupported(name, kind);
}

const EMPTY = () => ({ pieces: [], media: [], images: [], docs: [] });
function merge(into, part) {
  into.pieces.push(...part.pieces);
  into.media.push(...part.media);
  into.images.push(...part.images);
  into.docs.push(...(part.docs || []));
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

/**
 * Trang web → chữ (kèm mô tả og:description khi thân trang chưa có) + danh sách ẢNH ỨNG VIÊN của nội dung chính (chưa tải —
 * ingestLinks chia hạn mức ảnh giữa các link rồi mới tải). Facebook (không đăng nhập): thân trang là khung đăng nhập → chỉ dùng
 * tiêu đề + mô tả + ảnh og của bài đăng/trang công khai.
 */
export function readWebPage(html, pageUrl, limits) {
  const meta = pageMeta(html);
  const fb = isFacebook(pageUrl);
  const { title, text } = htmlToText(html, pageUrl);
  const body = fb ? meta.title || '' : text;
  const desc = meta.description && !body.includes(meta.description.slice(0, 80)) ? meta.description : '';
  const full = [desc ? `Mô tả trang: ${desc}` : '', body].filter(Boolean).join('\n').trim();
  const candidates = (limits.maxLinkImages ?? 24) > 0 ? findPageImages(html, pageUrl, { ogOnly: fb }) : [];
  if (fb && !desc && !candidates.length) {
    throw unprocessable('Bài đăng Facebook chưa công khai hoặc phải đăng nhập mới xem được. Hãy dùng bài đăng/trang ở chế độ Công khai.', 'SOURCE_FORBIDDEN');
  }
  if (full.length < 40 && !candidates.length) throw unprocessable('Trang web không có đủ nội dung văn bản để tạo bài trình bày', 'SOURCE_EMPTY');
  const label = (meta.title || title || pageUrl).slice(0, 200);
  return { pieces: full ? [{ label, text: clip(full, limits.maxTextChars) }] : [], media: [], images: [], web: { pageUrl, title: label, candidates } };
}

/**
 * Thư mục Google Drive: tải các tệp trong thư mục (driveFolder.js) rồi đọc từng tệp như tệp tải lên. Tệp hỏng / không đọc được
 * → bỏ qua tệp đó (thư mục thường lẫn tệp khác loại); không đọc được tệp nào → báo lỗi.
 */
async function readDriveFolder(url, limits, apiKey, fetchImpl) {
  const folder = await fetchDriveFolder(url, { apiKey, limits, fetch: fetchImpl });
  const out = EMPTY();
  let read = 0;
  for (const f of folder.files) {
    let part;
    try {
      part = await readBuffer(f.buffer, f.name, limits);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      continue;
    }
    // Ảnh lẻ trong thư mục: như ảnh tải lên (AI xem cả ảnh để cắt/vẽ lại sơ đồ), ghi rõ nguồn để AI chọn ảnh hợp nội dung.
    const hint = `ảnh trong thư mục Google Drive "${folder.name}" — tệp "${f.name}"`;
    merge(out, { ...part, images: part.images.map((im) => (im.standalone ? { ...im, hint } : im)) });
    read += 1;
  }
  if (!read) throw unprocessable(`Không đọc được tệp nào trong thư mục Google Drive. ${DRIVE_HINT}`, 'SOURCE_EMPTY');
  return out;
}

async function fetchDocument(url, limits, googleApiKey, fetchImpl = safeFetch) {
  if (isDriveFolderLink(url)) return readDriveFolder(url, limits, googleApiKey, fetchImpl);
  const candidates = googleCandidates(url, googleApiKey) || [url];
  let lastErr = null;
  for (const candidate of candidates) {
    try {
      // Cùng trần tổng tư liệu với tệp tải lên (Google Slides nhiều ảnh xuất PPTX dễ vượt 50 MB); xuất tệp lớn có thể chậm.
      const res = await fetchImpl(candidate, { timeoutMs: 300000, maxBytes: limits.maxUploadMb * 1048576 });
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
      // Trang web: đường dẫn tương đối (liên kết, ảnh) tính theo địa chỉ cuối cùng sau chuyển hướng.
      if (ct.includes('text/html')) return readWebPage(res.body.toString('utf8'), String(res.finalUrl || candidate), limits);
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
 * driveFolders: máy chủ có khoá Google (GOOGLE_API_KEY) → nhận link thư mục Google Drive; không có → báo dán link từng tệp.
 */
export async function precheckSource({ files, url, urls, text }, limits, { driveFolders = false } = {}) {
  const list = Array.isArray(files) ? files : [];
  // Link: `urls` (lặp lại được — tối đa MAX_SOURCE_LINKS) và/hoặc `url` (1 link, client cũ); ô trống bỏ qua.
  const rawLinks = [...(Array.isArray(urls) ? urls : [urls]), url].map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);
  const given = [list.length ? list : null, rawLinks.length ? rawLinks : null, text].filter((v) => v !== undefined && v !== null && v !== '').length;
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
  if (rawLinks.length) {
    const max = limits.maxSourceLinks ?? 5;
    const seen = new Set();
    const links = [];
    for (const [i, raw] of rawLinks.entries()) {
      let u;
      try {
        u = assertPublicUrl(raw);
      } catch (err) {
        throw rawLinks.length > 1 && err instanceof HttpError ? new HttpError(err.status, err.code, `Link ${i + 1}: ${err.message}`) : err;
      }
      u.hash = '';
      if (isDriveFolderLink(u.toString())) {
        const at = rawLinks.length > 1 ? `Link ${i + 1}: ` : '';
        if (!driveFolders) throw badRequest(`${at}Máy chủ chưa bật đọc thư mục Google Drive — hãy dán link của từng tệp trong thư mục`, 'UNSUPPORTED_LINK');
        if (!driveFolderRef(u.toString())) throw badRequest(`${at}Link thư mục Google Drive không hợp lệ — hãy mở thư mục rồi sao chép lại link`, 'INVALID_URL');
      }
      if (!seen.has(u.toString())) {
        seen.add(u.toString());
        links.push(u.toString());
      }
    }
    if (links.length > max) throw badRequest(`Tối đa ${max} đường link mỗi lần tạo`, 'TOO_MANY_LINKS');
    const label = links.length === 1 ? links[0] : `${links.length} link: ${links.map((l) => new URL(l).hostname.replace(/^www\./, '')).join(', ')}`;
    return { sourceKind: 'url', sourceLabel: label.slice(0, 300), urls: links };
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

/** Thu thập nội dung đầy đủ (chạy nền). files = kết quả `precheckSource().files`, urls = `precheckSource().urls`. */
export async function ingestSource({ files, url, urls, text }, { limits, googleApiKey, fetch: fetchImpl = safeFetch }) {
  if (files?.length) {
    const out = EMPTY();
    for (const f of files) merge(out, await readUploaded(f, limits));
    return out;
  }
  const links = urls?.length ? urls : url ? [url] : [];
  if (links.length) return ingestLinks(links, { limits, googleApiKey, fetchImpl });
  return { pieces: [{ label: 'Nội dung nhập tay', text: clip(String(text).trim(), limits.maxTextChars) }], media: [], images: [] };
}

// Chia `budget` cho các phần theo nhu cầu `wants` (water-filling): phần ít ảnh lấy đủ, phần dư dồn cho trang nhiều ảnh.
export function shareBudget(wants, budget) {
  const got = wants.map(() => 0);
  let left = budget;
  let open = wants.map((_, i) => i).filter((i) => wants[i] > 0);
  while (open.length && left > 0) {
    const share = Math.max(1, Math.floor(left / open.length));
    const next = [];
    for (const i of open) {
      const give = Math.min(wants[i] - got[i], share, left);
      got[i] += give;
      left -= give;
      if (got[i] < wants[i]) next.push(i);
    }
    open = next;
  }
  return got;
}

// Xen kẽ ảnh của các link (link 1 ảnh 1, link 2 ảnh 1, …): AI chỉ xem trước ~30 ảnh đầu → mỗi link đều có ảnh được xem.
const interleave = (lists) => {
  const out = [];
  for (let k = 0; lists.some((l) => k < l.length); k += 1) for (const l of lists) if (k < l.length) out.push(l[k]);
  return out;
};

/**
 * Nhiều link (≤ MAX_SOURCE_LINKS): đọc lần lượt từng link (1 link lỗi → báo rõ link nào, dừng — không âm thầm bỏ tư liệu), rồi
 * tải ảnh trong các trang web: tổng ≤ MAX_LINK_IMAGES ảnh, chia công bằng giữa các trang, phần thiếu (trang ít ảnh đạt chuẩn)
 * nhường trang khác ở lượt 2; cả lượt tải ảnh ≤ 90 giây.
 */
async function ingestLinks(links, { limits, googleApiKey, fetchImpl }) {
  const parts = [];
  for (const [i, link] of links.entries()) {
    try {
      parts.push(await fetchDocument(assertPublicUrl(String(link).trim()).toString(), limits, googleApiKey, fetchImpl));
    } catch (err) {
      if (!(links.length > 1 && err instanceof HttpError)) throw err;
      const host = URL.canParse(link) ? ` (${new URL(link).hostname})` : '';
      throw new HttpError(err.status, err.code, `Link ${i + 1}${host}: ${err.message}`);
    }
  }
  const pages = parts.filter((p) => p.web?.candidates.length);
  const budget = Math.min(limits.maxLinkImages ?? 24, limits.maxImagesPerDeck ?? 60);
  if (pages.length && budget > 0) {
    const deadline = Date.now() + 90000;
    const maxBytes = Math.min(limits.maxImageUploadMb ?? 15, 15) * 1048576;
    const state = pages.map(() => ({ images: [], next: 0 }));
    let quotas = shareBudget(pages.map((p) => p.web.candidates.length), budget);
    for (let pass = 0; pass < 2; pass += 1) {
      for (const [k, p] of pages.entries()) {
        const s = state[k];
        if (quotas[k] <= s.images.length || s.next >= p.web.candidates.length) continue;
        const got = await fetchImages(p.web.candidates, { fetch: fetchImpl, referer: p.web.pageUrl, max: quotas[k] - s.images.length, start: s.next, maxBytes, deadline });
        s.images.push(...got.images);
        s.next = got.next;
      }
      // Lượt 2: hạn mức còn dư (trang thiếu ảnh đạt chuẩn) chia cho các trang còn ứng viên chưa thử.
      const spare = budget - state.reduce((n, s) => n + s.images.length, 0);
      if (spare <= 0) break;
      const extra = shareBudget(pages.map((p, k) => p.web.candidates.length - state[k].next), spare);
      quotas = state.map((s, k) => s.images.length + extra[k]);
    }
    pages.forEach((p, k) => {
      p.images = state[k].images.map((im) => ({ name: im.name, hint: webImageHint(p.web.title, im), buffer: im.buffer }));
    });
  }
  const out = EMPTY();
  for (const p of parts) {
    out.pieces.push(...p.pieces);
    out.media.push(...p.media);
    out.docs.push(...(p.docs || []));
  }
  out.images = interleave(parts.map((p) => p.images));
  return out;
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
