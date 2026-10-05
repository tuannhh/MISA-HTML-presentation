// Kiểm thử tách nền logo: ảnh tổng hợp từ SVG bằng sharp. Hình kiểm tra vẽ bằng shape (không phụ thuộc font máy)
// để toạ độ điểm dò cố định; chữ chỉ thêm cho giống logo thật, không dùng để khẳng định.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { removeBackground, aiAvailable } from '../../src/services/cutoutService.js';

const svgPng = (body, w, h, bg = '#ffffff') =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    ${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}${body}</svg>`)).png().toBuffer();

async function decodeOut(result) {
  const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, result.width);
  assert.equal(info.height, result.height);
  // Hộp bao phần đục (alpha > 128) — đổi toạ độ ảnh vào → ảnh ra (ảnh ra đã bị cắt lề).
  let x0 = info.width, y0 = info.height;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (y < y0) y0 = y; }
    }
  }
  return {
    w: info.width,
    h: info.height,
    at(x, y) {
      const o = (y * info.width + x) * 4;
      return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] };
    },
    // inX0/inY0: góc trên-trái phần đục trong ảnh vào (biết trước từ hình vẽ).
    mapper(inX0, inY0) {
      return (x, y) => this.at(x - inX0 + x0, y - inY0 + y0);
    },
    data,
  };
}

// Logo chữ: chấm tròn cam (vật thể đặc), vòng "O" xanh đậm (lòng chữ nhỏ) và "B" vuông (2 lòng chữ).
// Phần đục bắt đầu tại (60, 110) — mép trái/trên của chấm tròn.
const TEXT_LOGO = `
  <circle cx="150" cy="200" r="90" fill="#F28C28"/>
  <circle cx="330" cy="200" r="45" fill="none" stroke="#1F3B73" stroke-width="20"/>
  <path fill="#1F3B73" fill-rule="evenodd" d="M400 120h100v160h-100z M425 145v50h50v-50z M425 210v45h50v-45z"/>
  <text x="540" y="250" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="140" fill="#1F3B73">MISA</text>`;
// Vẽ chữ SVG (librsvg + fontconfig) mất ~0,5 s mỗi lần → vẽ một lần, dùng lại cho các test.
let textLogoPng;
const textLogo = () => (textLogoPng ??= svgPng(TEXT_LOGO, 1000, 400));

// Khối đỏ có chữ trắng đục lỗ (vòng O trắng có lòng đỏ, thanh I, L) + khối thứ hai chỉ có thanh trắng mảnh.
// Phần đục bắt đầu tại (100, 100).
const BOX_LOGO = `
  <rect x="100" y="100" width="520" height="200" rx="30" fill="#D7263D"/>
  <circle cx="220" cy="200" r="55" fill="none" stroke="#ffffff" stroke-width="22"/>
  <rect x="320" y="140" width="24" height="120" fill="#ffffff"/>
  <path fill="#ffffff" d="M400 140h24v96h60v24h-84z"/>
  <rect x="680" y="120" width="220" height="160" rx="16" fill="#0057B8"/>
  <rect x="700" y="190" width="180" height="20" fill="#ffffff"/>`;
const boxLogo = () => svgPng(BOX_LOGO, 1000, 400);

async function noisyJpeg(png) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(data[i] + (rnd() + rnd() + rnd() - 1.5) * 8)));
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
}

const gradientLogo = () => svgPng(`
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B5876"/><stop offset="1" stop-color="#4E4376"/></linearGradient>
  <radialGradient id="l" cx="0.2" cy="0.2" r="0.6"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#l)"/>
  <circle cx="450" cy="300" r="190" fill="#F5A623"/><circle cx="450" cy="300" r="150" fill="#ffffff"/>
  <rect x="380" y="260" width="140" height="80" fill="#C0392B"/>`, 900, 600, null);

test('color: nền trắng → góc trong suốt, vật thể đặc giữ nguyên, lòng chữ bị khoét (inner auto)', async () => {
  const r = await removeBackground(await textLogo());
  assert.equal(r.method, 'color');
  assert.equal(r.note, undefined);
  const out = await decodeOut(r);
  const p = out.mapper(60, 110);
  assert.equal(out.at(0, 0).a, 0, 'góc trên-trái');
  assert.equal(out.at(out.w - 1, out.h - 1).a, 0, 'góc dưới-phải');
  assert.equal(p(150, 200).a, 255, 'tâm chấm tròn cam');
  assert.equal(p(330, 200).a, 0, 'lòng vòng O');
  assert.equal(p(450, 170).a, 0, 'lòng trên của B');
  assert.equal(p(450, 232).a, 0, 'lòng dưới của B');
  assert.equal(p(330, 145).a, 255, 'nét vòng O');
  assert.equal(p(412, 200).a, 255, 'nét đứng của B');
  // Cắt lề: không còn lề trắng 60 px bên trái/trên.
  assert.ok(r.width < 1000 - 60 && r.height <= 190, `kích thước sau cắt ${r.width}x${r.height}`);
});

test('color: biên không bị quầng trắng (đã khử màu nền ở pixel bán trong suốt)', async () => {
  const r = await removeBackground(await svgPng('<circle cx="200" cy="150" r="80" fill="none" stroke="#1F3B73" stroke-width="16"/>', 400, 300));
  const out = await decodeOut(r);
  let semi = 0;
  for (let i = 0; i < out.data.length; i += 4) {
    const a = out.data[i + 3];
    if (a === 0 || a === 255) continue;
    semi++;
    const lum = 0.2126 * out.data[i] + 0.7152 * out.data[i + 1] + 0.0722 * out.data[i + 2];
    assert.ok(lum < 110, `pixel biên còn sáng (lum ${lum.toFixed(0)}) → sẽ thành viền trắng trên slide tối`);
  }
  assert.ok(semi > 50, 'phải có biên mềm (khử răng cưa), không cắt cứng');
});

test('color: chữ trắng đục lỗ trong khối màu đặc được GIỮ (inner auto), inner remove thì xoá', async () => {
  const input = await boxLogo();
  const out = await decodeOut(await removeBackground(input));
  const p = out.mapper(100, 100);
  const ring = p(220, 145); // trên nét vòng O trắng
  assert.equal(ring.a, 255, 'vòng O trắng');
  assert.ok(ring.r > 230 && ring.g > 230 && ring.b > 230, 'vòng O vẫn màu trắng');
  assert.equal(p(220, 200).a, 255, 'lòng đỏ bên trong vòng O');
  assert.equal(p(332, 200).a, 255, 'thanh I trắng');
  assert.equal(p(412, 200).a, 255, 'chữ L trắng');
  assert.equal(p(790, 200).a, 255, 'thanh trắng mảnh trong khối xanh');
  assert.equal(p(150, 120).a, 255, 'khối đỏ');

  const removed = await decodeOut(await removeBackground(input, { inner: 'remove' }));
  const q = removed.mapper(100, 100);
  assert.equal(q(332, 200).a, 0, 'inner remove xoá cả chữ đục lỗ');
  assert.equal(q(150, 120).a, 255, 'khối đỏ vẫn giữ');
});

test('color: inner keep giữ nguyên lòng chữ', async () => {
  const out = await decodeOut(await removeBackground(await textLogo(), { inner: 'keep' }));
  const p = out.mapper(60, 110);
  assert.equal(p(330, 200).a, 255);
  assert.equal(p(150, 200).a, 255);
});

test('color: ảnh JPEG có nhiễu — vẫn sạch nền, không sót hạt, lòng chữ vẫn khoét', async () => {
  const r = await removeBackground(await noisyJpeg(await textLogo()));
  assert.equal(r.method, 'color');
  const out = await decodeOut(r);
  const p = out.mapper(60, 110);
  assert.equal(out.at(0, 0).a, 0);
  assert.equal(out.at(out.w - 1, out.h - 1).a, 0);
  assert.equal(p(150, 200).a, 255);
  assert.ok(p(330, 200).a < 16, 'lòng vòng O');
  assert.ok(p(450, 170).a < 16, 'lòng B');
  // Không có hạt đục giữa vùng nền: dải dọc giữa chấm tròn và vòng O (x 245..268 ảnh vào) phải trong suốt.
  for (let y = 115; y < 290; y++) for (let x = 245; x <= 268; x++) assert.ok(p(x, y).a < 40, `hạt nhiễu tại ${x},${y}`);
});

test('none: PNG đã trong suốt → chỉ cắt lề', async () => {
  const r = await removeBackground(await svgPng('<rect x="120" y="60" width="360" height="180" rx="30" fill="#2E86DE"/>', 600, 300, null));
  assert.equal(r.method, 'none');
  assert.equal(r.note, 'Ảnh đã có nền trong suốt');
  assert.ok(r.width >= 360 && r.width <= 366 && r.height >= 180 && r.height <= 186, `${r.width}x${r.height}`);
});

test('auto: logo cắt sát mép (chữ chạm viền) vẫn chọn tách theo màu', async () => {
  const r = await removeBackground(await svgPng(
    '<rect x="0" y="20" width="60" height="140" fill="#7A1FA2"/><circle cx="200" cy="90" r="70" fill="none" stroke="#7A1FA2" stroke-width="30"/><rect x="320" y="0" width="40" height="180" fill="#7A1FA2"/>', 400, 180));
  assert.equal(r.method, 'color');
});

test('ai không có mô hình → lùi về tách theo màu kèm ghi chú', async () => {
  const r = await removeBackground(await gradientLogo(), { mode: 'ai', modelPath: '/khong-ton-tai/u2netp.onnx' });
  assert.equal(r.method, 'color');
  assert.equal(r.note, 'Không có mô hình AI, đã dùng tách theo màu nền');
  const auto = await removeBackground(await gradientLogo(), { modelPath: '/khong-ton-tai/u2netp.onnx' });
  assert.equal(auto.method, 'color');
  assert.equal(auto.note, 'Không có mô hình AI, đã dùng tách theo màu nền');
});

test('ảnh hỏng → Error rõ ràng', async () => {
  await assert.rejects(removeBackground(Buffer.from('không phải ảnh')), /Không đọc được ảnh logo/);
  await assert.rejects(removeBackground(Buffer.alloc(0)), /không hợp lệ/);
});

test('hiệu năng: logo 1000×400 tách theo màu đủ nhanh', async () => {
  const input = await textLogo();
  await removeBackground(input); // làm nóng JIT + sharp
  const t = performance.now();
  await removeBackground(input);
  const ms = performance.now() - t;
  // Mục tiêu ≤ 300 ms; nới ngưỡng cho máy CI chậm/đang tải để test không chập chờn.
  assert.ok(ms < 1000, `mất ${ms.toFixed(0)} ms`);
});

test('ai: nền gradient → U²-Net tách chủ thể, tâm đục, góc trong suốt', { skip: !aiAvailable() && 'không có models/u2netp.onnx hoặc onnxruntime-node' }, async () => {
  const input = await gradientLogo();
  const auto = await removeBackground(input);
  assert.equal(auto.method, 'ai', 'auto chọn AI khi viền không đồng màu');
  const r = await removeBackground(input, { mode: 'ai' });
  assert.equal(r.method, 'ai');
  const out = await decodeOut(r);
  assert.ok(out.at(out.w >> 1, out.h >> 1).a > 240, 'tâm chủ thể đục');
  assert.ok(out.at(0, 0).a < 16 && out.at(out.w - 1, out.h - 1).a < 16, 'góc xa trong suốt');
  // Huy hiệu tròn r=190 → ảnh ra xấp xỉ 380 px mỗi cạnh (cắt lề sát chủ thể, không còn nền gradient).
  assert.ok(r.width < 440 && r.height < 440, `${r.width}x${r.height}`);
});
