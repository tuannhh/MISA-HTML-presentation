// Đợt 4 — video: link Vimeo (nhận dạng, oEmbed giả lập), tuỳ chọn trình chiếu + căn/cỡ (shared/deck/video.js), chuẩn hoá spec,
// renderer, tham số ffmpeg an toàn, quyết định thay tệp, chỉ mục moov, hàng nén chạy nền (giả lập kho + ffmpeg), CSP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeSpec } from '../../src/services/specService.js';
import { renderDeckHtml } from '../../shared/deck/render.js';
import { cleanVideoOpts, videoFlags, videoBoxAttr } from '../../shared/deck/video.js';
import { parseVimeo, resolveVimeo } from '../../src/services/vimeoService.js';
import { parseYouTubeId } from '../../src/services/youtubeService.js';
import { parseProbe, isWebPlayable, decide, transcodeArgs, remuxArgs, posterArgs, moovAtEnd, MAX_SIDE } from '../../src/services/videoService.js';
import { createVideoOptimizer } from '../../src/services/videoOptimizer.js';
import { deckCsp } from '../../src/middleware/security.js';
import { publishedCsp } from '../../src/routes/publicSiteRoutes.js';

const A = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const html = (spec, meta = {}) =>
  renderDeckHtml(spec, { ratio: '16:9', mode: 'present', assetUrl: (id) => `/a/${id}`, assetMeta: (id) => meta[id] || null, css: '', engineJs: '' });
const deck = (video, layout = 'image') => normalizeSpec({ title: 'T', slides: [{ layout, title: 'Video', video }] }, { strict: false }).spec;

test('parseVimeo: các dạng link phổ biến + mã riêng tư; link lạ → null', () => {
  assert.deepEqual(parseVimeo('https://vimeo.com/76979871'), { id: '76979871', hash: '' });
  assert.deepEqual(parseVimeo('vimeo.com/76979871/8272103f6e?share=copy'), { id: '76979871', hash: '8272103f6e' });
  assert.deepEqual(parseVimeo('https://player.vimeo.com/video/76979871?h=8272103F6E&badge=0'), { id: '76979871', hash: '8272103f6e' });
  assert.deepEqual(parseVimeo('https://vimeo.com/channels/staffpicks/123456789'), { id: '123456789', hash: '' });
  assert.deepEqual(parseVimeo('https://vimeo.com/groups/abc/videos/123456789'), { id: '123456789', hash: '' });
  assert.deepEqual(parseVimeo('https://vimeo.com/showcase/9999/video/123456789'), { id: '123456789', hash: '' });
  assert.deepEqual(parseVimeo('123456789'), { id: '123456789', hash: '' });
  for (const bad of ['https://evil.com/76979871', 'https://vimeo.com.evil.com/76979871', 'javascript:alert(1)', 'https://vimeo.com/about', 'ftp://vimeo.com/76979871', '']) {
    assert.equal(parseVimeo(bad), null, bad);
  }
  // Link Vimeo không bị nhầm thành YouTube và ngược lại.
  assert.equal(parseYouTubeId('https://vimeo.com/76979871'), null);
  assert.equal(parseVimeo('https://youtu.be/dQw4w9WgXcQ'), null);
});

test('resolveVimeo: oEmbed 404/403 báo rõ; ảnh bìa chỉ tải từ i.vimeocdn.com', async () => {
  const calls = [];
  const fake = (status, body) => async (url) => (calls.push(url), { status, body: Buffer.from(JSON.stringify(body)) });
  await assert.rejects(resolveVimeo('https://vimeo.com/76979871', { fetch: fake(404, {}) }), (e) => e.code === 'VIMEO_NOT_FOUND');
  await assert.rejects(resolveVimeo('https://vimeo.com/76979871', { fetch: fake(403, {}) }), (e) => e.code === 'VIMEO_NOT_EMBEDDABLE');
  await assert.rejects(resolveVimeo('https://evil.com/1', { fetch: fake(200, {}) }), (e) => e.code === 'INVALID_VIMEO_URL');
  calls.length = 0;
  const r = await resolveVimeo('https://vimeo.com/76979871/8272103f6e', { fetch: fake(200, { title: 'Phim giới thiệu', thumbnail_url: 'https://attacker.example/x.jpg' }) });
  assert.deepEqual({ id: r.id, hash: r.hash, title: r.title, thumb: r.thumb }, { id: '76979871', hash: '8272103f6e', title: 'Phim giới thiệu', thumb: null });
  assert.equal(calls.length, 1, 'không tải ảnh từ tên miền lạ');
  assert.match(calls[0], /^https:\/\/vimeo\.com\/api\/oembed\.json\?width=1280&url=https%3A%2F%2Fvimeo\.com%2F76979871%2F8272103f6e$/);
  // Mạng lỗi khi đọc oEmbed → vẫn gắn được (thiếu tên + ảnh bìa).
  const off = await resolveVimeo('https://vimeo.com/76979871', { fetch: async () => { throw new Error('ECONNRESET'); } });
  assert.equal(off.title, '');
});

test('cleanVideoOpts: chỉ lưu khác mặc định, kẹp cỡ, bỏ rác', () => {
  assert.deepEqual(cleanVideoOpts({ autoplay: true, fullscreen: false, muted: true, align: 'left', size: 64.6 }), { autoplay: true, fullscreen: false, muted: true, align: 'left', size: 65 });
  assert.deepEqual(cleanVideoOpts({ autoplay: 'yes', fullscreen: true, muted: 1, align: 'center', size: 100 }), {});
  assert.deepEqual(cleanVideoOpts({ align: 'top', size: 10 }), {});
  assert.deepEqual(cleanVideoOpts({ size: '__proto__' }), {});
  assert.deepEqual(cleanVideoOpts(null), {});
  assert.equal(videoFlags({ autoplay: true, fullscreen: false, muted: true }), ' data-auto="" data-inline="" data-muted=""');
  assert.equal(videoFlags({}), '');
  assert.equal(videoBoxAttr({ align: 'right', size: 50 }), ' data-va="r" style="--vz:0.50"');
  assert.equal(videoBoxAttr({ align: 'x', size: '50;color:red' }), '');
});

test('specService: Vimeo (+ mã riêng tư) và tuỳ chọn đi qua chuẩn hoá; nguồn sai bị bỏ', () => {
  const v = deck({ provider: 'vimeo', id: '76979871', hash: 'ABCDEF12', poster: A, title: 'x', autoplay: true, fullscreen: false, align: 'right', size: 70, evil: 1 }).slides[0].video;
  assert.deepEqual(v, { provider: 'vimeo', id: '76979871', hash: 'abcdef12', poster: A, title: 'x', caption: '', autoplay: true, fullscreen: false, align: 'right', size: 70 });
  assert.equal(deck({ provider: 'vimeo', id: '12ab' }).slides[0].video, null);
  assert.equal(deck({ provider: 'vimeo', id: '76979871', hash: 'zz<script>' }).slides[0].video.hash, undefined);
  assert.equal(deck({ provider: 'dailymotion', id: 'x' }).slides[0].video, null);
  const strict = normalizeSpec({ title: 'T', slides: [{ layout: 'image', title: 'V', video: { provider: 'vimeo', id: 'abc' } }] }, { strict: true });
  assert.ok(strict.errors.some((e) => /video không hợp lệ/.test(e)));
  // Tệp tải lên giữ tuỳ chọn.
  assert.deepEqual(deck({ provider: 'file', asset: A, muted: true }).slides[0].video, { provider: 'file', asset: A, poster: null, title: '', caption: '', muted: true });
});

test('renderer: Vimeo có data-vp/vid/vh + nhãn; cờ trình chiếu, căn/cỡ ô; tỷ lệ theo kích thước video tải lên', () => {
  const vm = html(deck({ provider: 'vimeo', id: '76979871', hash: 'abcdef12', title: 'Giới thiệu', autoplay: true, align: 'left', size: 60 }));
  assert.match(vm, /<div class="vbox" data-va="l" style="--vz:0.60"/);
  assert.match(vm, /<figure class="media vid" data-vp="vimeo" data-vid="76979871" data-vh="abcdef12" data-auto=""/);
  assert.match(vm, /<span class="vbadge vb-vimeo">Vimeo<\/span>/);
  // Video quay dọc (1080×1920): khung theo tỷ lệ thật, không ép 16:9.
  const tall = html(deck({ provider: 'file', asset: A, fullscreen: false }), { [A]: { width: 1080, height: 1920 } });
  assert.match(tall, /data-vp="file" data-src="\/a\/11111111-1111-4111-8111-111111111111" data-inline="" style="--ar:0.5625"/);
  // Không có kích thước (video cũ) → 16:9 mặc định, không gắn style.
  assert.doesNotMatch(html(deck({ provider: 'file', asset: A })), /--ar:/);
  // Phần tử trang tự do: không áp căn/cỡ của ô bố cục (đã có toạ độ riêng).
  const free = normalizeSpec({ title: 'T', slides: [{ layout: 'free', title: 'F', elements: [{ type: 'video', x: 10, y: 10, w: 50, h: 50, video: { provider: 'youtube', id: 'dQw4w9WgXcQ', align: 'left', size: 50, autoplay: true } }] }] }, { strict: false }).spec;
  const fh = html(free);
  assert.match(fh, /<div class="vbox" data-a="fade"/);
  assert.match(fh, /data-vp="youtube" data-vid="dQw4w9WgXcQ" data-auto=""/);
});

test('ffmpeg: tham số an toàn (chỉ đọc tệp cục bộ, không stdin), H.264/AAC, moov đầu tệp, cạnh dài ≤ 1920', () => {
  const a = transcodeArgs('/in.mov', '/out.mp4', { crf: 24, preset: 'veryfast', threads: 2, hasAudio: true });
  const at = (k) => a[a.indexOf(k) + 1];
  assert.equal(a[0], '-nostdin');
  assert.equal(at('-protocol_whitelist'), 'file');
  assert.ok(a.indexOf('-protocol_whitelist') < a.indexOf('-i'), 'whitelist phải đứng trước -i');
  assert.equal(at('-c:v'), 'libx264');
  assert.equal(at('-crf'), '24');
  assert.equal(at('-c:a'), 'aac');
  assert.equal(at('-movflags'), '+faststart');
  assert.match(at('-vf'), new RegExp(`min\\(${MAX_SIDE},iw\\).*format=yuv420p`));
  assert.equal(a.at(-1), '/out.mp4');
  assert.ok(transcodeArgs('/i', '/o', { hasAudio: false }).includes('-an'));
  for (const args of [remuxArgs('/i', '/o'), posterArgs('/i', 1)]) {
    assert.equal(args[0], '-nostdin');
    assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'file');
  }
});

test('parseProbe / isWebPlayable / decide: video dọc xoay 90°, MOV & HEVC luôn chuyển mã, còn lại chỉ thay khi nhỏ hơn rõ', () => {
  const info = parseProbe({ format: { duration: '12.5', format_name: 'mov,mp4' }, streams: [{ codec_type: 'video', codec_name: 'hevc', width: 1920, height: 1080, pix_fmt: 'yuv420p10le', tags: { rotate: '90' } }, { codec_type: 'audio', codec_name: 'aac' }] });
  assert.deepEqual([info.width, info.height, info.duration, info.vcodec], [1080, 1920, 12.5, 'hevc']);
  assert.equal(isWebPlayable(info, 'mp4'), false);
  assert.equal(decide({ info, type: 'mp4', origBytes: 100, newBytes: 150 }), 'replace');
  const h264 = { vcodec: 'h264', acodec: 'aac', pixFmt: 'yuv420p' };
  assert.equal(isWebPlayable(h264, 'mp4'), true);
  assert.equal(isWebPlayable(h264, 'mov'), false);
  assert.equal(decide({ info: h264, type: 'mp4', origBytes: 100, newBytes: 95 }), 'keep');
  assert.equal(decide({ info: h264, type: 'mp4', origBytes: 100, newBytes: 60 }), 'replace');
  assert.equal(decide({ info: h264, type: 'mov', origBytes: 100, newBytes: 120 }), 'replace');
  assert.equal(decide({ info: h264, type: 'mp4', origBytes: 100, newBytes: 0 }), 'keep');
  assert.equal(isWebPlayable({ vcodec: 'h264', acodec: 'pcm_s16le', pixFmt: 'yuv420p' }, 'mp4'), false);
  // Ảnh bìa đính kèm (attached_pic) không phải luồng hình.
  assert.equal(parseProbe({ streams: [{ codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } }] }).vcodec, '');
});

test('moovAtEnd: đọc tiêu đề hộp cấp 1 — moov sau mdat → cần đóng gói lại', async () => {
  const box = (type, len) => {
    const b = Buffer.alloc(len);
    b.writeUInt32BE(len, 0);
    b.write(type, 4, 'latin1');
    return b;
  };
  const fh = (buf) => ({ read: async (dst, off, len, pos) => ({ bytesRead: buf.copy(dst, off, pos, Math.min(buf.length, pos + len)) }) });
  const late = Buffer.concat([box('ftyp', 24), box('mdat', 1000), box('moov', 200)]);
  const fast = Buffer.concat([box('ftyp', 24), box('moov', 200), box('mdat', 1000)]);
  assert.equal(await moovAtEnd(fh(late), late.length), true);
  assert.equal(await moovAtEnd(fh(fast), fast.length), false);
  assert.equal(await moovAtEnd(fh(Buffer.alloc(4)), 4), false);
});

// Kho asset + ffmpeg giả lập cho hàng nén.
function rig({ probe, transcodeBytes = 40, replaceRows = 1, fail = null, pathOf = (k) => `/data/${k}` } = {}) {
  const row = { id: A, kind: 'video', tenant_id: 'T', presentation_id: P, storage_key: `tenants/T/presentations/${P}/${A}.mov`, bytes: 100, width: null, height: null, process_state: 'pending' };
  const log = { states: [], replaced: null, removed: [], put: [] };
  const assets = {
    findById: async () => row,
    setProcessState: async (_id, st) => log.states.push(st),
    setVideoSize: async (_id, w, h) => Object.assign(row, { width: w, height: h }),
    replaceVideoFile: async (_id, from, f) => ((log.replaced = { from, ...f }), replaceRows),
    listVideoJobs: async () => [row],
  };
  const storage = { pathOf, putFile: async (k) => log.put.push(k), remove: async (k) => log.removed.push(k) };
  const video = {
    available: async () => true,
    probe: async () => probe || { duration: 10, width: 3840, height: 2160, vcodec: 'hevc', acodec: 'aac', pixFmt: 'yuv420p' },
    poster: async () => Buffer.from('jpg'),
    transcode: async () => {
      if (fail) throw fail;
      return transcodeBytes;
    },
    remux: async () => 90,
  };
  const logger = { info() {}, warn() {}, error() {} };
  return { row, log, opt: createVideoOptimizer({ assets, storage, video, logger, tmpDir: '/tmp-test-video' }) };
}
// Hàng nén chạy nền: đợi tới khi job xong (opt.stats() hết việc), tối đa 2 giây — không dựa vào khoảng chờ cố định.
const settle = async (opt) => {
  for (let i = 0; i < 200; i += 1) {
    await new Promise((r) => setTimeout(r, 10));
    const st = opt.stats();
    if (!st.active && !st.pending) return;
  }
};

test('hàng nén: thay bằng bản nén (khoá mới), xoá tệp cũ, trạng thái pending → running → done', async () => {
  const { opt, log } = rig();
  opt.enqueue(A);
  opt.enqueue(A); // trùng → bỏ qua
  await settle(opt);
  assert.deepEqual(log.states, ['running', 'done']);
  assert.equal(log.replaced.mime, 'video/mp4');
  assert.match(log.replaced.storageKey, new RegExp(`/${A}-[0-9a-f]{8}\\.mp4$`));
  assert.deepEqual(log.removed, [`tenants/T/presentations/${P}/${A}.mov`]);
});

test('hàng nén: MP4 web đã gọn → giữ gốc (skipped); video bị xoá giữa chừng → bỏ bản nén; lỗi ffmpeg → failed, giữ gốc', async () => {
  // MP4 thật (tạm) có moov trước mdat → không cần đóng gói lại → giữ gốc.
  const dir = await mkdtemp(path.join(tmpdir(), 'vid-'));
  const mp4 = path.join(dir, 'a.mp4');
  const hdr = (type, len) => Buffer.concat([Buffer.from([0, 0, 0, len]), Buffer.from(type, 'latin1'), Buffer.alloc(len - 8)]);
  await writeFile(mp4, Buffer.concat([hdr('ftyp', 16), hdr('moov', 40), hdr('mdat', 44)]));
  const keep = rig({ probe: { duration: 5, width: 1280, height: 720, vcodec: 'h264', acodec: 'aac', pixFmt: 'yuv420p' }, transcodeBytes: 99, pathOf: () => mp4 });
  keep.row.storage_key = keep.row.storage_key.replace('.mov', '.mp4');
  keep.opt.enqueue(A);
  await settle(keep.opt);
  assert.equal(keep.log.replaced, null);
  assert.deepEqual(keep.log.states, ['running', 'skipped']);
  await rm(dir, { recursive: true, force: true });

  const gone = rig({ replaceRows: 0 });
  gone.opt.enqueue(A);
  await settle(gone.opt);
  assert.equal(gone.log.removed.length, 1);
  assert.match(gone.log.removed[0], /-[0-9a-f]{8}\.mp4$/, 'xoá bản nén, không xoá tệp đang dùng');
  assert.deepEqual(gone.log.states, ['running']);

  const bad = rig({ fail: Object.assign(new Error('x'), { killed: true }) });
  bad.opt.enqueue(A);
  await settle(bad.opt);
  assert.deepEqual(bad.log.states, ['running', 'failed']);
  assert.equal(bad.log.replaced, null);
});

test('hàng nén: khởi động lại → nén tiếp video còn dở; inspect báo tệp hỏng', async () => {
  const { opt, log } = rig();
  assert.equal(await opt.resume(), 1);
  await settle(opt);
  assert.deepEqual(log.states, ['running', 'done']);
  const broken = createVideoOptimizer({ assets: {}, storage: {}, logger: { warn() {} }, tmpDir: '/x', video: { available: async () => true, probe: async () => { throw new Error('Invalid data'); } } });
  assert.equal((await broken.inspect('/x.mp4')).broken, true);
  const none = createVideoOptimizer({ assets: {}, storage: {}, logger: {}, tmpDir: '/x', video: { available: async () => false } });
  assert.deepEqual(await none.inspect('/x.mp4', { wantPoster: true }), { info: null, poster: null });
});

test('CSP: khung chiếu cho phát video tải lên trong khung; trang xuất bản nhúng được Vimeo', () => {
  assert.match(deckCsp('n', 'https://app.example'), /media-src 'self' https:\/\/app\.example blob:/);
  assert.match(publishedCsp('n'), /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com/);
});
