// Gemini giả (REST) cho test tích hợp HTTP và đo tải (roadmap B): ứng dụng chạy THẬT, chỉ đổi GEMINI_BASE_URL sang máy chủ này.
// Không tốn hạn mức, kết quả xác định; điều khiển được độ trễ + lỗi (429/500/treo) để thử hàng đợi, retry, timeout.
//
// Trong test:  const ai = await startFakeGemini();  … config.gemini.baseUrl = ai.baseUrl;  ai.set({ delayMs: 50, fail: '429' });
// Chạy riêng:  node test/helpers/fakeGemini.mjs --port 4010 --delay 20000 --jitter 10000
//              (đổi kịch bản lúc đang chạy: POST /__control {"delayMs":…,"fail":"429"|"500"|"hang"|null,"failRate":0.3})
//
// Phân loại yêu cầu theo nội dung prompt của geminiService: dàn ý (BƯỚC 1), dựng bài (<dan_y>), tạo ảnh (responseModalities IMAGE),
// tìm ảnh giao diện (box_2d), chép tư liệu (còn lại, không có responseSchema).
import http from 'node:http';
import { deflateSync } from 'node:zlib';

// Dàn ý mẫu: tiêu đề cố ý "Viết Hoa Từng Chữ" (kiểm tra bước đổi về viết hoa đầu câu), đủ bố cục chữ/số/quy trình.
export function fakeOutline(title = 'Giới Thiệu Nền Tảng MISA AMIS') {
  return {
    sourceType: 'document',
    imageKinds: [],
    title,
    theme: 'ocean',
    footer: 'MISA · Kiểm thử',
    slides: [
      { layout: 'cover', title, subtitle: 'Nền tảng quản trị doanh nghiệp hợp nhất', points: [], images: [], notes: 'Mở đầu.' },
      { layout: 'stats', title: 'Kết Quả Nổi Bật', subtitle: '', points: ['250.000 — Doanh nghiệp sử dụng', '62% — Giảm thời gian lập báo cáo', '3,5 lần — Tốc độ phê duyệt'], images: [], notes: 'Số liệu.' },
      { layout: 'process', title: 'Lộ Trình Triển Khai', subtitle: '', points: ['Khảo sát: 2 tuần', 'Thiết lập: 4 tuần', 'Chuyển dữ liệu: 4 tuần', 'Đào tạo: 4 tuần'], images: [], notes: 'Các bước.' },
      { layout: 'comparison', title: 'Cách Làm Cũ Và Mới', subtitle: '', points: ['Cách cũ: Nhập liệu thủ công', 'Cách cũ: Số liệu chậm', 'Cách mới: Tự động hoá', 'Cách mới: Số liệu tức thời'], images: [], notes: 'So sánh.' },
      { layout: 'closing', title: 'Cảm Ơn Quý Khách', subtitle: '', points: ['Bắt đầu chuyển đổi số ngay hôm nay'], images: [], notes: 'Kết.' },
    ],
  };
}

// Kết quả dựng bài theo đúng số trang dàn ý (ref Sn) — bố cục giữ theo dàn ý, AI chỉ góp kicker/icon.
function fakeDesign(slideCount) {
  const slides = [];
  for (let i = 1; i <= slideCount; i += 1) slides.push({ ref: `S${i}`, kicker: 'Tổng Quan Giải Pháp', icon: 'chart', notes: 'Gợi ý lời nói.' });
  return { slides };
}

// PNG 1×1 hợp lệ (không phụ thuộc sharp) — cho ảnh AI.
function tinyPng() {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(36, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((64 * 3 + 1) * 36, 0x55);
  for (let y = 0; y < 36; y += 1) raw[y * (64 * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = tinyPng().toString('base64');

const textReply = (obj) => ({
  candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 100, totalTokenCount: 200 },
});

function classify(body) {
  const sys = (body?.systemInstruction?.parts || []).map((p) => p.text || '').join('');
  const user = (body?.contents || []).flatMap((c) => c.parts || []).map((p) => p.text || '').join('\n');
  if (body?.generationConfig?.responseModalities?.includes('IMAGE')) return { kind: 'image' };
  if (user.includes('<dan_y>')) {
    const n = Number(/Dàn ý gồm (\d+) trang/.exec(user)?.[1] || 5);
    return { kind: 'design', n };
  }
  if (sys.includes('BƯỚC 1')) return { kind: 'outline', user };
  if (body?.generationConfig?.responseSchema?.properties?.shots) return { kind: 'visuals' };
  return { kind: 'extract' };
}

export async function startFakeGemini({ port = 0, host = '127.0.0.1', delayMs = 0, jitterMs = 0 } = {}) {
  const state = { delayMs, jitterMs, fail: null, failRate: 1, hang: false };
  const stats = { total: 0, byKind: {}, inflight: 0, maxInflight: 0, failed: 0 };
  const hanging = new Set();

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const send = (status, obj, headers = {}) => {
        if (res.writableEnded) return;
        res.writeHead(status, { 'content-type': 'application/json', ...headers });
        res.end(JSON.stringify(obj));
      };
      const url = new URL(req.url, 'http://x');
      if (url.pathname === '/__control' && req.method === 'POST') {
        Object.assign(state, JSON.parse(Buffer.concat(chunks).toString() || '{}'));
        return send(200, { state, stats });
      }
      if (url.pathname === '/__stats') return send(200, { state, stats });
      // Files API (resumable): start → upload URL → file ACTIVE; xoá tệp → 200.
      if (url.pathname.includes('/upload/') && req.headers['x-goog-upload-command'] === 'start') {
        return send(200, {}, { 'x-goog-upload-url': `http://${req.headers.host}/__upload/${Date.now()}` });
      }
      if (url.pathname.startsWith('/__upload/')) return send(200, { file: { name: `files/f${Date.now()}`, uri: 'https://fake/files/x', mimeType: 'application/pdf', state: 'ACTIVE' } });
      if (req.method === 'DELETE') return send(200, {});
      if (!/:generateContent$/.test(url.pathname)) return send(404, { error: { status: 'NOT_FOUND', message: 'fake' } });

      let body = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        return send(400, { error: { status: 'INVALID_ARGUMENT', message: 'bad json' } });
      }
      const c = classify(body);
      stats.total += 1;
      stats.byKind[c.kind] = (stats.byKind[c.kind] || 0) + 1;
      stats.inflight += 1;
      stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);
      res.on('close', () => {
        stats.inflight -= 1;
      });
      if (state.fail === 'hang') {
        hanging.add(res);
        return undefined;
      }
      const wait = state.delayMs + Math.random() * state.jitterMs;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (state.fail && Math.random() < state.failRate) {
        stats.failed += 1;
        const status = state.fail === '429' ? 429 : 500;
        return send(status, { error: { status: status === 429 ? 'RESOURCE_EXHAUSTED' : 'INTERNAL', message: 'fake failure' } });
      }
      if (c.kind === 'image') return send(200, { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: PNG } }] }, finishReason: 'STOP' }] });
      if (c.kind === 'design') return send(200, textReply(fakeDesign(c.n)));
      if (c.kind === 'outline') {
        // Lấy dòng đầu của chữ người dùng làm tên bài (≤ 8 từ) để mỗi bài khác nhau, vẫn "Viết Hoa Từng Chữ".
        const first = /<tai_lieu_nguon>\s*([^\n]+)/.exec(c.user)?.[1] || '';
        const words = first.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 6);
        const title = words.length >= 2 ? words.map((w) => w[0].toLocaleUpperCase('vi') + w.slice(1)).join(' ') : undefined;
        return send(200, textReply(fakeOutline(title)));
      }
      if (c.kind === 'visuals') return send(200, textReply({ shots: [] }));
      return send(200, textReply('Nội dung tư liệu đã chép (giả lập).'));
    });
  });
  await new Promise((resolve) => server.listen(port, host, resolve));
  const addr = server.address();
  return {
    baseUrl: `http://${host}:${addr.port}/v1beta`,
    port: addr.port,
    stats,
    set: (patch) => Object.assign(state, patch),
    release: () => {
      for (const r of hanging) r.destroy();
      hanging.clear();
    },
    close: () =>
      new Promise((resolve) => {
        for (const r of hanging) r.destroy();
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

// Chạy độc lập (đo tải): node test/helpers/fakeGemini.mjs --port 4010 --delay 20000 --jitter 10000 [--host 0.0.0.0]
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^\/?/, '/')}` || process.argv[1]?.endsWith('fakeGemini.mjs')) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const ai = await startFakeGemini({ port: Number(arg('port', 4010)), host: arg('host', '127.0.0.1'), delayMs: Number(arg('delay', 0)), jitterMs: Number(arg('jitter', 0)) });
  console.log(`fake gemini: ${ai.baseUrl}`);
}
