// Kiểm thử thư viện nền động shared/deck/backgrounds.js: API, xác định (cùng t → cùng hình), thật sự chuyển động,
// 'network' trùng khớp thuật toán cũ của engine.js, và ràng buộc để chèn inline được vào <script> cổ điển.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

await import('../../shared/deck/backgrounds.js');
const { DeckBg } = globalThis;
const SRC = readFileSync(new URL('../../shared/deck/backgrounds.js', import.meta.url), 'utf8');

const DARK = { node: '160,220,255', edge: '46,230,214', accent: '46,230,214', accent2: '77,141,255' };
const LIGHT = { node: '29,78,216', edge: '15,23,42', accent: '29,78,216', accent2: '15,23,42', light: true };

// Context 2D giả: ghi lại mọi lệnh + mọi gán thuộc tính. Chỉ có các phương thức canvas thật → gọi nhầm tên
// (không tồn tại trên trình duyệt) sẽ ném lỗi ngay trong test thay vì âm thầm hỏng trên trang.
const METHODS = ['beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'rect', 'quadraticCurveTo', 'bezierCurveTo',
  'stroke', 'fill', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'save', 'restore', 'translate', 'rotate', 'scale',
  'setTransform', 'resetTransform', 'setLineDash'];
function fakeCtx(width = 1280, height = 720) {
  const log = [];
  const num = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : typeof v === 'object' && v ? '[obj]' : v);
  const gradient = (kind) => (...args) => { log.push([kind, ...args.map(num)]); return { addColorStop: (o, c) => log.push(['stop', num(o), c]) }; };
  const api = {
    canvas: { width, height },
    createLinearGradient: gradient('linear'),
    createRadialGradient: gradient('radial'),
    measureText: () => ({ width: 10 }),
  };
  for (const m of METHODS) api[m] = (...args) => { log.push([m, ...args.map(num)]); };
  const props = {};
  const ctx = new Proxy(api, {
    get: (t, k) => (k in t ? t[k] : props[k]),
    set: (t, k, v) => { props[k] = v; log.push(['=', k, num(v)]); return true; },
  });
  return { ctx, log };
}
function render(name, t, extra = {}) {
  const { ctx, log } = fakeCtx(extra.width, extra.height);
  DeckBg.create(ctx, { name, width: 1280, height: 720, ...DARK, ...extra }).draw(t);
  return log;
}

test('NAMES: 10 tên duy nhất, đúng thứ tự, khớp khoá LABELS', () => {
  assert.deepEqual(DeckBg.NAMES, ['network', 'circuit', 'grid', 'matrix', 'waves', 'hex', 'dots', 'orbits', 'particles', 'radar']);
  assert.equal(new Set(DeckBg.NAMES).size, 10);
  assert.deepEqual(Object.keys(DeckBg.LABELS).sort(), [...DeckBg.NAMES].sort());
  for (const n of DeckBg.NAMES) assert.ok(typeof DeckBg.LABELS[n] === 'string' && DeckBg.LABELS[n].length > 0);
});

test('mọi nền vẽ được ở nhiều t, mọi tỷ lệ canvas, tông sáng/tối mà không ném lỗi', () => {
  const sizes = [[1280, 720], [960, 720], [1440, 720], [2160, 720]];
  for (const name of DeckBg.NAMES) for (const [width, height] of sizes) for (const theme of [DARK, LIGHT]) {
    const { ctx, log } = fakeCtx(width, height);
    const bg = DeckBg.create(ctx, { name, width, height, ...theme });
    assert.equal(bg.name, name);
    for (const t of [0, 0.016, 1.5, 4, 37.2, 1234.5, -3, NaN]) bg.draw(t);
    assert.ok(log.some((c) => c[0] === 'clearRect'), `${name} phải xoá khung trước khi vẽ`);
    assert.ok(log.length > 20, `${name} ${width}×${height} vẽ quá ít`);
  }
});

test('xác định: cùng t → cùng chuỗi lệnh vẽ trên hai instance mới; t khác → hình khác (có chuyển động)', () => {
  for (const name of DeckBg.NAMES) {
    for (const extra of [{}, LIGHT, { width: 2160, height: 720 }]) {
      assert.deepEqual(render(name, 3.2, extra), render(name, 3.2, extra), `${name} không xác định`);
    }
    assert.notDeepEqual(render(name, 0), render(name, 5), `${name} không chuyển động giữa t=0 và t=5`);
  }
});

test('không tích luỹ trạng thái: vẽ t=7 sau một loạt khung khác cho kết quả y hệt vẽ t=7 ngay từ đầu', () => {
  for (const name of DeckBg.NAMES) {
    const a = fakeCtx(); const bgA = DeckBg.create(a.ctx, { name, width: 1280, height: 720, ...DARK });
    for (const t of [0, 2, 9.5, 1, 30]) bgA.draw(t);
    a.log.length = 0; bgA.draw(7);
    // Bản mới: bỏ các lệnh lúc create() (tạo gradient) để chỉ so phần vẽ khung.
    const b = fakeCtx(); const bgB = DeckBg.create(b.ctx, { name, width: 1280, height: 720, ...DARK });
    b.log.length = 0; bgB.draw(7);
    assert.deepEqual(a.log, b.log, `${name} phụ thuộc khung trước`);
  }
});

test('khung t = 0 của mọi nền đã có nội dung (dùng cho thumbnail/PDF)', () => {
  for (const name of DeckBg.NAMES) {
    const log = render(name, 0);
    const marks = log.filter((c) => ['stroke', 'fill', 'fillText', 'fillRect'].includes(c[0])).length;
    assert.ok(marks >= 3, `${name} gần như trống ở t=0`);
  }
});

test('tên lạ / thiếu → network; màu sai định dạng → màu mặc định', () => {
  for (const name of [undefined, '', 'nope', '__proto__', 'constructor', 'toString']) {
    const { ctx } = fakeCtx();
    assert.equal(DeckBg.create(ctx, { name, width: 1280, height: 720 }).name, 'network');
  }
  assert.deepEqual(render('nope', 2.5), render('network', 2.5));
  const log = render('network', 1, { edge: 'red);background:url(x)' });
  assert.ok(log.every((c) => c[0] !== '=' || typeof c[2] !== 'string' || !c[2].includes('url(')));
});

test("'network' trùng khớp từng lệnh với thuật toán cũ trong engine.js (deck đã có không đổi diện mạo)", () => {
  // Bản sao nguyên văn drawBg cũ (seed 7, Park–Miller, count = 64·W/2560 với W = bề rộng deck = 2 × canvas).
  function legacy(cx, W, H, node, edge) {
    const CW = Math.round(W / 2), CH = Math.round(H / 2), nodes = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const count = Math.round(64 * W / 2560);
    for (let q = 0; q < count; q++) nodes.push({ x: rnd() * CW, y: rnd() * CH, ax: 20 + rnd() * 50, ay: 20 + rnd() * 40, sp: .05 + rnd() * .12, ph: rnd() * 6.28, r: .8 + rnd() * 1.6 });
    return (t) => {
      cx.clearRect(0, 0, CW, CH);
      const P = nodes.map((n) => [n.x + Math.sin(t * n.sp + n.ph) * n.ax, n.y + Math.cos(t * n.sp * .8 + n.ph) * n.ay, n.r]);
      cx.lineWidth = .6;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150) { cx.strokeStyle = 'rgba(' + edge + ',' + ((1 - d / 150) * .16).toFixed(3) + ')'; cx.beginPath(); cx.moveTo(P[i][0], P[i][1]); cx.lineTo(P[j][0], P[j][1]); cx.stroke(); }
      }
      cx.fillStyle = 'rgba(' + node + ',.5)';
      for (let k = 0; k < P.length; k++) { cx.beginPath(); cx.arc(P[k][0], P[k][1], P[k][2], 0, 6.283); cx.fill(); }
    };
  }
  for (const [W, H] of [[2560, 1440], [1920, 1440], [2880, 1440], [4320, 1440]]) {
    for (const [node, edge] of [['160, 220, 255', '46, 230, 214'], ['29, 78, 216', '15, 23, 42']]) {
      const a = fakeCtx(W / 2, H / 2), b = fakeCtx(W / 2, H / 2);
      const ref = legacy(a.ctx, W, H, node, edge);
      const bg = DeckBg.create(b.ctx, { name: 'network', width: W / 2, height: H / 2, node, edge });
      for (const t of [0, 3.7, 61.25]) { ref(t); bg.draw(t); }
      assert.deepEqual(b.log, a.log, `network lệch thuật toán cũ ở ${W}×${H}`);
    }
  }
});

test('tệp chèn inline được: không có </script, không import/export, không nguồn ngẫu nhiên/thời gian', () => {
  assert.ok(!/<\/script/i.test(SRC));
  assert.ok(!/^\s*(import|export)\b/m.test(SRC));
  assert.ok(!SRC.includes('Math.random'));
  assert.ok(!/\bDate\b|performance\.now/.test(SRC));
  assert.ok(!/shadowBlur|getImageData/.test(SRC), 'không dùng hiệu ứng/đọc điểm ảnh đắt mỗi khung');
});
