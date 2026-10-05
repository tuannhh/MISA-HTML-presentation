// Nhận diện loại tệp bằng magic bytes — không tin phần mở rộng hay Content-Type client tự khai.
export function sniff(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  const b = buffer;
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  // Office đời cũ (.doc/.xls/.ppt — Compound File Binary): nhận diện để báo cách lưu lại thay vì "định dạng lạ".
  if (b.length >= 8 && b.readUInt32BE(0) === 0xd0cf11e0 && b.readUInt32BE(4) === 0xa1b11ae1) return 'ole';
  // Ảnh HEIC/AVIF cũng là hộp "ftyp" như MP4 → phải xét trước ghi âm.
  const iso = sniffIsoImage(b);
  if (iso) return iso;
  // UTF-16 có BOM (Excel "Unicode Text"/CSV UTF-16): BOM FF FE trùng 11 bit đồng bộ khung MP3 → xét trước ghi âm.
  if (looksLikeUtf16(b)) return 'text';
  const audio = sniffAudio(b);
  if (audio) return audio;
  if (looksLikeText(b) || looksLikeLegacyText(b)) return 'text';
  return 'unknown';
}

// AVIF giải mã được bằng sharp; HEIC (ảnh iPhone, nén HEVC) thì không → trình duyệt tự đổi sang JPEG trước khi gửi.
export const IMAGE_TYPES = new Set(['png', 'jpeg', 'gif', 'webp', 'avif']);

// Ảnh dạng ISO-BMFF: major brand (byte 8–12) + các compatible brand (từ byte 16) trong hộp ftyp.
function sniffIsoImage(b) {
  if (b.length < 16 || b.toString('ascii', 4, 8) !== 'ftyp') return null;
  const end = Math.min(b.readUInt32BE(0), b.length, 128);
  const brands = [b.toString('ascii', 8, 12)];
  for (let o = 16; o + 4 <= end; o += 4) brands.push(b.toString('ascii', o, o + 4));
  if (brands.some((x) => x === 'avif' || x === 'avis')) return 'avif';
  if (brands.some((x) => /^(heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1)$/.test(x))) return 'heic';
  return null;
}

// Ghi âm (và tệp ghi hình MP4/WebM — AI nghe phần tiếng). MIME là loại Gemini nhận (đã kiểm chứng với API thật).
export const AUDIO_MIME = Object.freeze({
  mp3: 'audio/mp3', aac: 'audio/aac', wav: 'audio/wav', aiff: 'audio/aiff', ogg: 'audio/ogg', flac: 'audio/flac', mp4: 'audio/mp4', webm: 'audio/webm',
});
export const AUDIO_TYPES = new Set(Object.keys(AUDIO_MIME));

function sniffAudio(b) {
  const ascii = (from, to) => (b.length >= to ? b.toString('ascii', from, to) : '');
  if (ascii(0, 3) === 'ID3') return 'mp3';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'wav';
  if (ascii(0, 4) === 'FORM' && /^AIF[FC]$/.test(ascii(8, 12))) return 'aiff';
  if (ascii(0, 4) === 'OggS') return 'ogg';
  if (ascii(0, 4) === 'fLaC') return 'flac';
  if (ascii(4, 8) === 'ftyp') return 'mp4'; // m4a, mp4 (ghi âm điện thoại, ghi hình cuộc họp)
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  // Khung MPEG không có thẻ ID3: 11 bit đồng bộ. Layer = 00 là AAC (ADTS), khác 00 là MP3.
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return (b[1] & 0x06) === 0 ? 'aac' : 'mp3';
  return null;
}

// BOM UTF-16 + phần đầu giải mã ra chữ (không ký tự điều khiển lạ) — khung MP3 thật thì ra rác.
function looksLikeUtf16(b) {
  const le = b[0] === 0xff && b[1] === 0xfe;
  if (!le && !(b[0] === 0xfe && b[1] === 0xff)) return false;
  const n = Math.min(b.length - 2, 2048) & ~1;
  if (n < 2) return false;
  const sample = Buffer.from(b.subarray(2, 2 + n));
  const text = (le ? sample : sample.swap16()).toString('utf16le');
  let bad = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if ((c < 32 && c !== 9 && c !== 10 && c !== 13) || (c >= 0xfff0 && c !== 0xfeff) || (c >= 0xd800 && c <= 0xdfff)) bad += 1;
  }
  return bad / text.length < 0.02;
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 16384));
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample.subarray(0, trimToCharBoundary(sample)));
    return true;
  } catch {
    return false;
  }
}

// Văn bản mã cũ 1 byte (CSV/TXT xuất từ Excel Windows tiếng Việt = Windows-1258): không có byte 0/ký tự điều khiển lạ.
function looksLikeLegacyText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 16384));
  let high = 0;
  for (const c of sample) {
    if (c < 9 || (c > 13 && c < 32) || c === 127) return false;
    if (c >= 128) high += 1;
  }
  return high / sample.length < 0.3;
}

/** Giải mã tệp văn bản: UTF-8 (± BOM), UTF-16 có BOM, hoặc Windows-1258 (tiếng Việt) khi không phải UTF-8 hợp lệ. */
export function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const be = Buffer.from(buffer.subarray(2, 2 + ((buffer.length - 2) & ~1)));
    return be.swap16().toString('utf16le');
  }
  const body = buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(body);
  } catch {
    // Windows-1258 ghép dấu thanh bằng ký tự tổ hợp → chuẩn hoá NFC để chữ hiển thị/so khớp đúng.
    return new TextDecoder('windows-1258').decode(body).normalize('NFC');
  }
}

// Không cắt giữa 1 ký tự UTF-8 nhiều byte khi lấy mẫu.
function trimToCharBoundary(sample) {
  let end = sample.length;
  let back = 0;
  while (back < 4 && end - back - 1 >= 0 && (sample[end - back - 1] & 0xc0) === 0x80) back += 1;
  if (back < 4 && end - back - 1 >= 0 && (sample[end - back - 1] & 0xc0) === 0xc0) return end - back - 1;
  return end;
}

// Video gắn vào slide: MP4/MOV (ISO BMFF, bỏ loại chỉ có tiếng M4A/M4B/M4P) hoặc WebM. null = không phải video hỗ trợ.
export const VIDEO_MIME = Object.freeze({ mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' });
export function sniffVideo(b) {
  if (!b || b.length < 12) return null;
  if (b.toString('ascii', 4, 8) === 'ftyp') {
    if (sniffIsoImage(b)) return null; // ảnh HEIC/AVIF, không phải video
    const brand = b.toString('ascii', 8, 12);
    if (/^M4[ABP] $/.test(brand)) return null;
    return brand === 'qt  ' ? 'mov' : 'mp4';
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // EBML: DocType "webm" (Matroska .mkv thường không phát được trên trình duyệt).
    return b.subarray(0, 64).includes(Buffer.from('webm')) ? 'webm' : null;
  }
  return null;
}
