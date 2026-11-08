// Video tải lên: đọc thông số (ffprobe), chụp ảnh bìa, nén lại (ffmpeg) để trình chiếu không phải chờ tải lâu.
// Chỉ đọc tệp cục bộ đã qua kiểm tra chữ ký tệp (MP4/MOV/WebM): -protocol_whitelist file (không mở giao thức mạng), -nostdin,
// giới hạn thời gian chạy (giết tiến trình khi quá hạn). Bộ tách MOV mặc định không theo "dref" sang tệp khác (enable_drefs=0).
// Thiếu ffmpeg (máy dev chưa cài) → available() = false, mọi bước tối ưu bỏ qua, video vẫn dùng bản gốc.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';

const run = promisify(execFile);

// Codec trình duyệt phổ biến (Chrome/Edge/Safari/Firefox) đều phát được trong <video>.
const WEB_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const WEB_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis']);
export const MAX_SIDE = 1920; // cạnh dài tối đa sau khi nén (Full HD) — đủ nét cho máy chiếu / màn hình phòng họp
export const SHRINK = 0.9; // bản nén phải nhỏ hơn ≤ 90% bản gốc mới thay (trừ khi bản gốc trình duyệt không phát được)

/** Đổi kết quả ffprobe (JSON) → thông số gọn. */
export function parseProbe(json) {
  const streams = Array.isArray(json?.streams) ? json.streams : [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  const rot = Number(v?.tags?.rotate ?? v?.side_data_list?.find?.((d) => d.rotation !== undefined)?.rotation ?? 0) || 0;
  let width = Number(v?.width) || 0;
  let height = Number(v?.height) || 0;
  // Video quay dọc trên điện thoại: khung lưu ngang + cờ xoay 90° → kích thước hiển thị là đảo lại.
  if (Math.abs(rot) % 180 === 90) [width, height] = [height, width];
  const duration = Number(json?.format?.duration ?? v?.duration) || 0;
  return {
    duration,
    width,
    height,
    vcodec: v ? String(v.codec_name || '') : '',
    acodec: a ? String(a.codec_name || '') : '',
    pixFmt: v ? String(v.pix_fmt || '') : '',
    format: String(json?.format?.format_name || ''),
    bitrate: Number(json?.format?.bit_rate) || 0,
  };
}

/** Trình duyệt phát thẳng được không (không cần chuyển mã): MP4/WebM + codec web + 8-bit 4:2:0. MOV (QuickTime) luôn chuyển. */
export function isWebPlayable(info, type) {
  if (!info.vcodec || !WEB_VIDEO.has(info.vcodec)) return false;
  if (info.acodec && !WEB_AUDIO.has(info.acodec)) return false;
  if (type === 'mov') return false;
  if (info.pixFmt && !/^yuv(j)?420p$/.test(info.pixFmt)) return false;
  return true;
}

/**
 * Quyết định sau khi nén: 'replace' (dùng bản nén) | 'keep' (giữ bản gốc).
 * Bản gốc không phát được trên trình duyệt (HEVC/ProRes/MOV…) → luôn thay; còn lại chỉ thay khi nhỏ hơn rõ rệt.
 */
export function decide({ info, type, origBytes, newBytes }) {
  if (!newBytes) return 'keep';
  if (!isWebPlayable(info, type)) return 'replace';
  return newBytes <= origBytes * SHRINK ? 'replace' : 'keep';
}

/** Tham số ffmpeg nén về H.264/AAC MP4, cạnh dài ≤ MAX_SIDE (giữ tỷ lệ, không phóng to), moov đầu tệp (phát khi chưa tải hết). */
export function transcodeArgs(input, output, { crf = 24, preset = 'veryfast', threads = 2, hasAudio = true } = {}) {
  const scale = `scale='if(gte(iw,ih),min(${MAX_SIDE},iw),-2)':'if(gte(iw,ih),-2,min(${MAX_SIDE},ih))'`;
  return [
    '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-protocol_whitelist', 'file',
    '-i', input,
    '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0?'] : []),
    '-map_metadata', '-1',
    '-vf', `${scale},format=yuv420p`,
    '-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-profile:v', 'high', '-level:v', '4.1',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
    '-movflags', '+faststart',
    '-max_muxing_queue_size', '1024',
    '-threads', String(threads),
    '-f', 'mp4', output,
  ];
}

/** Chỉ đóng gói lại (không nén) — MP4 đã gọn nhưng chỉ mục (moov) nằm cuối tệp → chuyển lên đầu để phát ngay. */
export function remuxArgs(input, output) {
  return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file', '-i', input, '-map', '0', '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', output];
}

/** Ảnh bìa: 1 khung hình (giây thứ `at`) → JPEG ra stdout. */
export function posterArgs(input, at) {
  return ['-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file', '-ss', String(at), '-i', input, '-frames:v', '1', '-vf', `scale='min(1280,iw)':-2`, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '3', 'pipe:1'];
}

/**
 * MP4/MOV: chỉ mục 'moov' nằm sau dữ liệu 'mdat' → trình duyệt phải tải gần hết tệp mới phát. Đọc tiêu đề các hộp cấp 1
 * (8–16 byte mỗi hộp), không đọc nội dung. Trả true khi cần chuyển moov lên đầu.
 */
export async function moovAtEnd(fh, size) {
  let pos = 0;
  const head = Buffer.alloc(16);
  for (let n = 0; n < 64 && pos + 8 <= size; n += 1) {
    const { bytesRead } = await fh.read(head, 0, 16, pos);
    if (bytesRead < 8) break;
    let len = head.readUInt32BE(0);
    const type = head.toString('latin1', 4, 8);
    if (len === 1 && bytesRead >= 16) len = Number(head.readBigUInt64BE(8));
    else if (len === 0) len = size - pos;
    if (type === 'moov') return false;
    if (type === 'mdat') return true;
    if (len < 8) break;
    pos += len;
  }
  return false;
}

export function createVideoService({ config, logger, exec = run }) {
  const c = config.video;
  let avail = null;

  /** ffmpeg + ffprobe có chạy được không (kiểm 1 lần, nhớ kết quả). */
  function available() {
    if (!c.transcode) return Promise.resolve(false);
    if (!avail) {
      avail = Promise.all([exec(c.ffmpeg, ['-version'], { timeout: 10000 }), exec(c.ffprobe, ['-version'], { timeout: 10000 })])
        .then(() => true)
        .catch((err) => {
          logger.warn('ffmpeg_unavailable', { err: err.code || err.message });
          return false;
        });
    }
    return avail;
  }

  async function probe(file) {
    const { stdout } = await exec(c.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_format', '-show_streams', file], {
      timeout: 30000,
      maxBuffer: 4 << 20,
    });
    return parseProbe(JSON.parse(stdout));
  }

  async function poster(file, duration) {
    // Giây 1 (bỏ khung đen mở đầu); video ngắn hơn 3 giây → 1/3 thời lượng.
    const at = duration > 3 ? 1 : Math.max(0, Math.round((duration / 3) * 100) / 100);
    const { stdout } = await exec(c.ffmpeg, posterArgs(file, at), { timeout: 30000, maxBuffer: 16 << 20, encoding: 'buffer' });
    return stdout && stdout.length ? stdout : null;
  }

  async function transcode(input, output, { hasAudio, duration }) {
    // Hạn chạy theo thời lượng (máy chủ 1 instance: tối đa ~2× thời lượng, ít nhất 2 phút, không quá trần cấu hình).
    const timeout = Math.min(c.timeoutMs, Math.max(120000, Math.round(duration * 2000) + 60000));
    await exec(c.ffmpeg, transcodeArgs(input, output, { crf: c.crf, preset: c.preset, threads: c.threads, hasAudio }), { timeout, killSignal: 'SIGKILL', maxBuffer: 1 << 20 });
    return (await stat(output)).size;
  }

  async function remux(input, output) {
    await exec(c.ffmpeg, remuxArgs(input, output), { timeout: 300000, killSignal: 'SIGKILL', maxBuffer: 1 << 20 });
    return (await stat(output)).size;
  }

  return { available, probe, poster, transcode, remux };
}
