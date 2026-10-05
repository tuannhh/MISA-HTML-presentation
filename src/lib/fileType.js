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
  const audio = sniffAudio(b);
  if (audio) return audio;
  if (looksLikeText(b)) return 'text';
  return 'unknown';
}

export const IMAGE_TYPES = new Set(['png', 'jpeg', 'gif', 'webp']);

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

// Không cắt giữa 1 ký tự UTF-8 nhiều byte khi lấy mẫu.
function trimToCharBoundary(sample) {
  let end = sample.length;
  let back = 0;
  while (back < 4 && end - back - 1 >= 0 && (sample[end - back - 1] & 0xc0) === 0x80) back += 1;
  if (back < 4 && end - back - 1 >= 0 && (sample[end - back - 1] & 0xc0) === 0xc0) return end - back - 1;
  return end;
}
