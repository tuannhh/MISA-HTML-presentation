// Tách nền logo để đặt lên slide (nền tối/sáng bất kỳ). Service thuần: không HTTP, không DB.
// Hai cách:
// - "color": logo trên nền trắng/đơn sắc (phổ biến nhất) — loang từ viền theo màu nền, làm mềm biên
//   bằng ước lượng độ phủ (alpha) và khử màu nền ở biên để không bị viền trắng trên slide tối.
// - "ai": nền phức tạp (ảnh chụp, gradient) — phân đoạn bằng U²-Net-p (ONNX, chạy CPU), tinh chỉnh biên
//   theo màu nền cục bộ.
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import sharp from 'sharp';

const MAX_PIXELS = 60_000_000;
const MAX_SIDE = 1600; // logo không cần lớn hơn; giữ thời gian xử lý thấp
const DEFAULT_TOLERANCE = 10; // ΔE76 — đủ nuốt nhiễu JPEG trên nền phẳng, chưa ăn vào màu nhạt của logo
const DEFAULT_MODEL_PATH = fileURLToPath(new URL('../../models/u2netp.onnx', import.meta.url));
const AI_SIZE = 320; // kích thước vào của U²-Net-p (theo rembg)
const AI_MEAN = [0.485, 0.456, 0.406];
const AI_STD = [0.229, 0.224, 0.225];

const NOTE_ALREADY_TRANSPARENT = 'Ảnh đã có nền trong suốt';
const NOTE_NO_AI = 'Không có mô hình AI, đã dùng tách theo màu nền';
const NOTE_NOTHING_LEFT = 'Không tìm thấy nội dung tách khỏi nền, đã giữ nguyên ảnh';
const NOTE_NO_BG = 'Không nhận ra màu nền, đã giữ nguyên ảnh';
const NOTE_AI_EMPTY = 'AI không nhận ra logo trong ảnh, đã dùng tách theo màu nền';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- AI runtime (nạp lười, dùng chung)

let ortModule = null;
let ortFailed = false;
const brokenModels = new Set(); // model nạp lỗi → không thử lại mỗi lần gọi
const runners = new Map(); // modelPath → worker giữ phiên suy luận

function loadOrt() {
  if (ortModule || ortFailed) return ortModule;
  // Bản Linux của onnxruntime-node có telemetry 1DS gửi về Microsoft (mobile.events.data.microsoft.com) và ghi
  // ~/.cache/Microsoft/DeveloperTools/.onnxruntime. Ứng dụng nội bộ không gửi dữ liệu ra ngoài → tắt trước khi
  // nạp thư viện (biến môi trường cấp tiến trình, worker suy luận dùng chung). Chỉ ghi, không đọc cấu hình.
  process.env.ORT_DISABLE_TELEMETRY = '1';
  try {
    ortModule = require('onnxruntime-node');
  } catch {
    ortFailed = true; // thiếu binary nền tảng → dùng tách theo màu, không làm hỏng luồng tải logo
  }
  return ortModule;
}

export function aiAvailable(modelPath = DEFAULT_MODEL_PATH) {
  if (brokenModels.has(modelPath)) return false;
  try {
    if (!existsSync(modelPath) || statSync(modelPath).size < 1024) return false;
  } catch {
    return false;
  }
  return loadOrt() !== null;
}

// session.run của onnxruntime-node chạy đồng bộ trên luồng gọi (~0,3 s với U²-Net-p) → nếu chạy ở luồng chính
// sẽ chặn mọi request khác của Express. Vì vậy giữ MỘT phiên trong một worker thread sống lâu: tạo lười ở lần gọi
// đầu (nạp model ~0,1 s), các lần sau chỉ suy luận. 2 luồng intra-op để không chiếm hết CPU khi đang render slide.
// Mã worker không dùng require/import trực tiếp: chuỗi eval có thể bị chạy dưới dạng CommonJS hoặc ESM tuỳ cờ
// --input-type của tiến trình cha; process.getBuiltinModule chạy được ở cả hai.
const WORKER_SRC = `
const { parentPort, workerData } = process.getBuiltinModule('node:worker_threads');
const ort = process.getBuiltinModule('node:module').createRequire(workerData.ortPath)(workerData.ortPath);
const ready = ort.InferenceSession.create(workerData.modelPath, {
  intraOpNumThreads: 2, interOpNumThreads: 1, executionMode: 'sequential', graphOptimizationLevel: 'all',
});
ready.catch(() => {});
parentPort.on('message', async ({ id, input, dims }) => {
  let session;
  try { session = await ready; } catch (err) {
    parentPort.postMessage({ id, error: String((err && err.message) || err), fatal: true });
    return;
  }
  try {
    const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', input, dims) });
    const pred = Float32Array.from(out[session.outputNames[0]].data);
    parentPort.postMessage({ id, pred }, [pred.buffer]);
  } catch (err) {
    parentPort.postMessage({ id, error: String((err && err.message) || err) });
  }
});
`;

function getRunner(modelPath) {
  const existing = runners.get(modelPath);
  if (existing) return existing;
  if (!loadOrt()) throw new Error('onnxruntime-node không nạp được');
  const worker = new Worker(WORKER_SRC, {
    eval: true,
    execArgv: [], // không kế thừa cờ của tiến trình cha (--watch, --env-file, --test…) vốn không dành cho worker
    workerData: { ortPath: require.resolve('onnxruntime-node'), modelPath },
  });
  const pending = new Map();
  let seq = 0;
  const fail = (err) => {
    if (runners.get(modelPath) === runner) runners.delete(modelPath);
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  worker.on('message', ({ id, pred, error, fatal }) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    // Rảnh thì unref: worker không giữ tiến trình sống (tắt server/test không bị treo).
    if (!pending.size) worker.unref();
    if (fatal) {
      brokenModels.add(modelPath);
      fail(new Error(error));
      worker.terminate().catch(() => {});
    }
    if (error) p.reject(new Error(error));
    else p.resolve(pred);
  });
  worker.on('error', fail);
  worker.on('exit', () => fail(new Error('Worker suy luận AI đã dừng')));
  worker.unref();
  const runner = {
    run(input) {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        worker.ref(); // đang chờ kết quả → giữ tiến trình sống
        worker.postMessage({ id, input, dims: [1, 3, AI_SIZE, AI_SIZE] }, [input.buffer]);
      });
    },
  };
  runners.set(modelPath, runner);
  return runner;
}

// ---------------------------------------------------------------- màu: sRGB → Lab (ΔE76)

const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const labF = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

function toLab(r, g, b) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const fx = labF((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047);
  const fy = labF(0.2126729 * R + 0.7151522 * G + 0.072175 * B);
  const fz = labF((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Khoảng cách cảm nhận từng pixel tới màu nền; pixel vốn trong suốt coi như nền.
function distanceMap(px, n, bg) {
  const [L0, a0, b0] = toLab(bg[0], bg[1], bg[2]);
  const dist = new Float32Array(n);
  let lastKey = -1;
  let lastD = 0;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    if (px[o + 3] < 16) continue;
    const r = px[o], g = px[o + 1], b = px[o + 2];
    const key = (r << 16) | (g << 8) | b;
    if (key !== lastKey) {
      // logo có nhiều vùng phẳng → ghi nhớ màu liền trước tránh tính lại Lab
      const [L, A, B] = toLab(r, g, b);
      lastD = Math.sqrt((L - L0) ** 2 + (A - a0) ** 2 + (B - b0) ** 2);
      lastKey = key;
    }
    dist[i] = lastD;
  }
  return dist;
}

// ---------------------------------------------------------------- tiện ích ảnh

async function decode(input) {
  if (!(input instanceof Uint8Array) || input.length === 0) throw new Error('Dữ liệu ảnh logo không hợp lệ');
  try {
    const { data, info } = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error', animated: false })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .toColourspace('srgb')
      .ensureAlpha()
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 4) throw new Error(`Số kênh màu không hỗ trợ: ${info.channels}`);
    return { px: data, w: info.width, h: info.height };
  } catch (err) {
    throw new Error('Không đọc được ảnh logo (tệp hỏng hoặc không phải ảnh)', { cause: err });
  }
}

// Chỉ số pixel trên dải viền dày `width` px (không trùng lặp).
function borderRing(w, h, width) {
  const t = Math.max(1, Math.min(width, Math.floor(Math.min(w, h) / 2) || 1));
  const out = [];
  for (let y = 0; y < h; y++) {
    const edgeRow = y < t || y >= h - t;
    for (let x = 0; x < w; x++) {
      if (edgeRow || x < t || x >= w - t) out.push(y * w + x);
    }
  }
  return Int32Array.from(out);
}

// Màu nền = cụm chiếm ưu thế trên viền (histogram 4 bit/kênh), tinh chỉnh bằng trung bình dịch chuyển
// để không lệch khi màu nền nằm sát ranh giới ô histogram hoặc có nhiễu JPEG.
function estimateBackground(px, ring) {
  const counts = new Uint32Array(4096);
  for (const i of ring) {
    const o = i * 4;
    if (px[o + 3] < 16) continue;
    counts[((px[o] >> 4) << 8) | ((px[o + 1] >> 4) << 4) | (px[o + 2] >> 4)]++;
  }
  let best = 0;
  for (let k = 1; k < 4096; k++) if (counts[k] > counts[best]) best = k;
  if (counts[best] === 0) return null;
  let c = [((best >> 8) << 4) + 8, (((best >> 4) & 15) << 4) + 8, ((best & 15) << 4) + 8];
  for (let iter = 0; iter < 4; iter++) {
    let sr = 0, sg = 0, sb = 0, m = 0;
    for (const i of ring) {
      const o = i * 4;
      if (px[o + 3] < 16) continue;
      const dr = px[o] - c[0], dg = px[o + 1] - c[1], db = px[o + 2] - c[2];
      if (dr * dr + dg * dg + db * db <= 24 * 24) {
        sr += px[o]; sg += px[o + 1]; sb += px[o + 2]; m++;
      }
    }
    if (!m) break;
    c = [sr / m, sg / m, sb / m];
  }
  return c.map((v) => Math.round(v));
}

// Biến đổi khoảng cách chamfer 3-4 (đơn vị 1/3 px). edge = giá trị gán cho láng giềng ngoài ảnh:
// 0 → mép ảnh là "ngoài vùng"; INF → mép ảnh không tính (vd. logo chạm mép không phải biên thật).
const CH_INF = 0xffff - 8;
function chamfer(mask, w, h, edge) {
  const d = new Uint16Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? CH_INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0, i = y * w; x < w; x++, i++) {
      let v = d[i];
      if (v === 0) continue;
      const l = x > 0 ? d[i - 1] : edge;
      if (l + 3 < v) v = l + 3;
      if (y > 0) {
        const u = d[i - w];
        if (u + 3 < v) v = u + 3;
        const ul = x > 0 ? d[i - w - 1] : edge;
        if (ul + 4 < v) v = ul + 4;
        const ur = x < w - 1 ? d[i - w + 1] : edge;
        if (ur + 4 < v) v = ur + 4;
      } else if (edge + 3 < v) v = edge + 3;
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1, i = y * w + w - 1; x >= 0; x--, i--) {
      let v = d[i];
      if (v === 0) continue;
      const r = x < w - 1 ? d[i + 1] : edge;
      if (r + 3 < v) v = r + 3;
      if (y < h - 1) {
        const dn = d[i + w];
        if (dn + 3 < v) v = dn + 3;
        const dr = x < w - 1 ? d[i + w + 1] : edge;
        if (dr + 4 < v) v = dr + 4;
        const dl = x > 0 ? d[i + w - 1] : edge;
        if (dl + 4 < v) v = dl + 4;
      } else if (edge + 3 < v) v = edge + 3;
      d[i] = v;
    }
  }
  return d;
}

// Gán nhãn thành phần liên thông (BFS lặp, hàng đợi Int32Array — không đệ quy để không tràn stack).
// onVisit(i, label) cho phép thu thập số liệu phụ trong cùng lượt duyệt.
function labelComponents(mask, w, h, eight, queue, onVisit) {
  const labels = new Int32Array(w * h);
  const comps = [{ area: 0, x0: 0, y0: 0, x1: 0, y1: 0 }]; // nhãn 0 = không thuộc thành phần nào
  let n = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || labels[s]) continue;
    n++;
    const c = { area: 0, x0: w, y0: h, x1: 0, y1: 0 };
    let head = 0, tail = 0;
    labels[s] = n;
    queue[tail++] = s;
    while (head < tail) {
      const i = queue[head++];
      const y = (i / w) | 0;
      const x = i - y * w;
      c.area++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      if (onVisit) onVisit(i, n, x, y);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx === 0 && dy === 0) || (!eight && dx !== 0 && dy !== 0)) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (mask[j] && !labels[j]) {
            labels[j] = n;
            queue[tail++] = j;
          }
        }
      }
    }
    comps.push(c);
  }
  return { labels, comps };
}

// Pixel biên là pha trộn c = a·F + (1−a)·B. Tìm F trong lân cận (pixel ứng viên "đậm" hơn c, nằm gần tia B→c)
// rồi suy ra a bằng phép chiếu. Chọn F xa nền nhất trên tia (thuần màu logo nhất) rồi lấy trung bình cụm màu
// quanh nó — một pixel cực trị do nhiễu JPEG sẽ làm a thấp giả và viền tối. Logo nhiều màu vẫn đúng vì màu
// khác hướng bị loại bởi sai số vuông góc.
function projectAlpha(px, i, w, h, br, bg, bb, cand, radius, out) {
  const o = i * 4;
  const ur = px[o] - br, ug = px[o + 1] - bg, ub = px[o + 2] - bb;
  const uu = ur * ur + ug * ug + ub * ub;
  const y = (i / w) | 0;
  const x = i - y * w;
  let bestA = 2;
  let bestJ = -1;
  const ya = Math.max(0, y - radius), yb = Math.min(h - 1, y + radius);
  const xa = Math.max(0, x - radius), xb = Math.min(w - 1, x + radius);
  for (let yy = ya; yy <= yb; yy++) {
    for (let xx = xa, j = yy * w + xa; xx <= xb; xx++, j++) {
      if (!cand[j] || j === i) continue;
      const p = j * 4;
      const vr = px[p] - br, vg = px[p + 1] - bg, vb = px[p + 2] - bb;
      const vv = vr * vr + vg * vg + vb * vb;
      if (vv <= uu || vv < 400) continue; // ứng viên phải "đậm" hơn c và đủ tương phản với nền
      const a = (ur * vr + ug * vg + ub * vb) / vv;
      if (a <= 0 || a >= bestA) continue;
      const er = ur - a * vr, eg = ug - a * vg, eb = ub - a * vb;
      const tol = 0.15 * Math.sqrt(vv) + 10;
      if (er * er + eg * eg + eb * eb > tol * tol) continue;
      bestA = a;
      bestJ = j;
    }
  }
  if (bestJ < 0) return false;
  const q = bestJ * 4;
  const fr0 = px[q], fg0 = px[q + 1], fb0 = px[q + 2];
  let sr = 0, sg = 0, sb = 0, m = 0;
  for (let yy = ya; yy <= yb; yy++) {
    for (let xx = xa, j = yy * w + xa; xx <= xb; xx++, j++) {
      if (!cand[j]) continue;
      const p = j * 4;
      const dr = px[p] - fr0, dg = px[p + 1] - fg0, db = px[p + 2] - fb0;
      if (dr * dr + dg * dg + db * db > 28 * 28) continue;
      sr += px[p]; sg += px[p + 1]; sb += px[p + 2]; m++;
    }
  }
  const fr = sr / m, fgr = sg / m, fb = sb / m;
  const vr = fr - br, vg = fgr - bg, vb = fb - bb;
  const vv = vr * vr + vg * vg + vb * vb;
  out.a = Math.min(1, Math.max(0, (ur * vr + ug * vg + ub * vb) / vv));
  out.r = fr; out.g = fgr; out.b = fb;
  return true;
}

// Khử màu nền đã trộn ở biên: c = (c_obs − (1−a)·B)/a. Ở alpha thấp phép chia khuếch đại nhiễu nên pha dần
// về màu tham chiếu F (khi có): kết quả = c + (1−a)·(F − B).
function decontaminate(px, i, a, br, bg, bb, ref) {
  const o = i * 4;
  const inv = 1 - a;
  for (let c = 0; c < 3; c++) {
    const base = c === 0 ? br : c === 1 ? bg : bb;
    let u = (px[o + c] - inv * base) / a;
    if (ref) u = (c === 0 ? ref.r : c === 1 ? ref.g : ref.b) * inv + u * a;
    px[o + c] = u < 0 ? 0 : u > 255 ? 255 : Math.round(u);
  }
}

const snapAlpha = (a) => (a >= 0.92 ? 1 : a <= 0.04 ? 0 : a);

// ---------------------------------------------------------------- tách theo màu nền

function colorCutout(img, bgColor, T, inner) {
  const { px, w, h } = img;
  const n = w * h;
  const [br, bgc, bb] = bgColor;
  const dist = distanceMap(px, n, bgColor);
  const queue = new Int32Array(n);
  const removed = new Uint8Array(n);

  // 1) Loang 4 hướng từ mọi pixel viền giống màu nền (4 hướng để không rò qua nét chéo mảnh).
  let head = 0, tail = 0;
  const seed = (i) => {
    if (!removed[i] && dist[i] <= T) {
      removed[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++];
    const y = (i / w) | 0;
    const x = i - y * w;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }

  // 2) Thành phần "đậm" (khác nền) liên thông 8 hướng: số liệu cho lọc hạt nhiễu và xét lỗ bên trong.
  const fg = new Uint8Array(n);
  let holeCount = 0;
  for (let i = 0; i < n; i++) {
    if (removed[i]) continue;
    if (dist[i] > T) fg[i] = 1;
    else holeCount++;
  }
  const maxDist = [0];
  const touchesBg = [0];
  const fgLab = labelComponents(fg, w, h, true, queue, (i, lab, x, y) => {
    if (maxDist.length <= lab) { maxDist.push(0); touchesBg.push(0); }
    if (dist[i] > maxDist[lab]) maxDist[lab] = dist[i];
    if (!touchesBg[lab]) {
      if ((x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (y > 0 && removed[i - w]) || (y < h - 1 && removed[i + w])) touchesBg[lab] = 1;
    }
  });

  // Hạt nhiễu nằm giữa nền (nhiễu/loang màu JPEG): cụm rất nhỏ bất kể màu, hoặc cụm nhỏ mà nhạt (gần màu nền).
  // Ngưỡng tính theo diện tích ảnh — chi tiết thật của logo (chấm chữ i…) lớn hơn nhiều.
  const speck = Math.max(8, Math.round(n * 5e-6));
  const speckle = new Uint8Array(fgLab.comps.length);
  let anySpeck = false;
  for (let k = 1; k < fgLab.comps.length; k++) {
    const area = fgLab.comps[k].area;
    if (touchesBg[k] && (area <= speck || (area <= 3 * speck && maxDist[k] <= 2.5 * T))) { speckle[k] = 1; anySpeck = true; }
  }
  if (anySpeck) for (let i = 0; i < n; i++) if (speckle[fgLab.labels[i]]) removed[i] = 1;

  // 3) Lỗ kín cùng màu nền (lòng chữ O, A, B…) mà phép loang từ viền không tới được.
  let pinholes = null;
  if (holeCount && inner !== 'keep') pinholes = removeInnerHoles({ w, h, n, removed, fg, dist, T, inner, queue, fgLab, speck });

  // 4) Biên mềm: pixel còn lại cách vùng đã xoá ≤ 3 px được ước lượng alpha + khử màu nền.
  const alpha = new Uint8Array(n);
  const kept = new Uint8Array(n);
  let keptCount = 0;
  for (let i = 0; i < n; i++) if (!removed[i]) { kept[i] = 1; keptCount++; }
  const dt = chamfer(kept, w, h, CH_INF);
  const res = { a: 1, r: 0, g: 0, b: 0 };
  for (let i = 0; i < n; i++) {
    if (!kept[i]) continue;
    if (dt[i] > 10) { alpha[i] = 255; continue; }
    let a;
    let ref = null;
    if (projectAlpha(px, i, w, h, br, bgc, bb, kept, 3, res)) {
      a = res.a;
      ref = res;
    } else {
      // Không có màu logo đậm hơn quanh đây: pixel nhạt sát nền → dốc alpha theo khoảng cách màu.
      a = dist[i] >= 2.5 * T ? 1 : Math.max(0, (dist[i] - T) / (1.5 * T));
    }
    a = snapAlpha(a);
    alpha[i] = Math.round(a * 255);
    if (a > 0 && a < 1) decontaminate(px, i, a, br, bgc, bb, ref);
  }
  if (pinholes) fillPinholes(px, w, h, pinholes);
  return { alpha, keptCount };
}

// inner: 'remove' = xoá mọi lỗ cùng màu nền; 'auto' = chỉ xoá lỗ nhỏ nằm trong nét mảnh (lòng chữ),
// giữ chữ trắng đục lỗ trong khối màu đặc (chữ trắng trên hộp đỏ).
function removeInnerHoles({ w, h, n, removed, fg, dist, T, inner, queue, fgLab, speck }) {
  const holeMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!removed[i] && dist[i] <= T) holeMask[i] = 1;
  if (inner === 'remove') {
    for (let i = 0; i < n; i++) if (holeMask[i]) removed[i] = 1;
    return;
  }
  const contacts = [null];
  const holes = labelComponents(holeMask, w, h, false, queue, (i, lab, x, y) => {
    if (contacts.length <= lab) contacts.push(new Map());
    const m = contacts[lab];
    const touch = (j) => {
      const l = fgLab.labels[j];
      if (l) m.set(l, (m.get(l) || 0) + 1);
    };
    if (x > 0 && !holeMask[i - 1]) touch(i - 1);
    if (x < w - 1 && !holeMask[i + 1]) touch(i + 1);
    if (y > 0 && !holeMask[i - w]) touch(i - w);
    if (y < h - 1 && !holeMask[i + w]) touch(i + w);
  });
  // Độ dày nét (bán kính vòng tròn nội tiếp lớn nhất) của lỗ và của thành phần bao quanh.
  const fgDt = chamfer(fg, w, h, 0);
  const holeDt = chamfer(holeMask, w, h, 0);
  const fgMaxDt = new Uint16Array(fgLab.comps.length);
  const holeMaxDt = new Uint16Array(holes.comps.length);
  for (let i = 0; i < n; i++) {
    const f = fgLab.labels[i];
    if (f && fgDt[i] > fgMaxDt[f]) fgMaxDt[f] = fgDt[i];
    const hl = holes.labels[i];
    if (hl && holeDt[i] > holeMaxDt[hl]) holeMaxDt[hl] = holeDt[i];
  }
  // Thành phần bao của từng lỗ + "đảo" bên trong lỗ (vd. lòng đỏ bên trong chữ O trắng đục lỗ).
  const enclOf = new Int32Array(holes.comps.length);
  const container = new Uint8Array(fgLab.comps.length);
  for (let k = 1; k < holes.comps.length; k++) {
    const hc = holes.comps[k];
    let encl = 0, best = -1;
    for (const [l, cnt] of contacts[k]) {
      const c = fgLab.comps[l];
      const inside = c.x0 <= hc.x0 && c.x1 >= hc.x1 && c.y0 <= hc.y0 && c.y1 >= hc.y1;
      const score = cnt + (inside ? 1e9 : 0);
      if (score > best) { best = score; encl = l; }
    }
    enclOf[k] = encl;
    if (!encl) continue;
    const minIsland = Math.max(12, 0.02 * hc.area);
    for (const l of contacts[k].keys()) {
      if (l !== encl && fgLab.comps[l].area >= minIsland) container[encl] = 1;
    }
  }
  const drop = new Uint8Array(holes.comps.length);
  const pin = new Uint8Array(holes.comps.length); // lỗ li ti do nhiễu JPEG trong nét → tô màu nét
  let any = false, anyPin = false;
  for (let k = 1; k < holes.comps.length; k++) {
    const hc = holes.comps[k];
    const encl = enclOf[k];
    // Lỗ lớn = vùng nền chủ ý; khối có lỗ chứa đảo = chữ trắng đục lỗ (B, O, A…) → giữ mọi lỗ của khối đó cho
    // đồng nhất (không xoá "K" trong khi giữ "BOO"). Ngưỡng 6% (không phải 2%): logo chữ cắt sát mép có lòng
    // chữ O chiếm 2–4% diện tích ảnh; vùng trắng lớn có nội dung bên trong đã được giữ nhờ quy tắc "đảo".
    if (!encl || hc.area > 0.06 * n || container[encl]) continue;
    if (hc.area <= speck) { pin[k] = 1; anyPin = true; continue; }
    const c = fgLab.comps[encl];
    const fill = c.area / ((c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1));
    const ratio = holeMaxDt[k] / Math.max(1, fgMaxDt[encl]);
    // Lòng chữ: lỗ "dày" xấp xỉ nét chữ bao quanh. Chữ trắng trong khối đặc: nét chữ mảnh hơn nhiều so với
    // phần khối còn lại (ratio nhỏ) và khối có độ phủ hộp bao cao.
    const counter = ratio >= 0.6 || (ratio >= 0.45 && fill < 0.75) || (fill < 0.3 && ratio > 0.2);
    if (counter) { drop[k] = 1; any = true; }
  }
  if (any) for (let i = 0; i < n; i++) if (drop[holes.labels[i]]) removed[i] = 1;
  if (!anyPin) return null;
  const list = [];
  for (let i = 0; i < n; i++) if (pin[holes.labels[i]]) list.push(i);
  return { list, mask: holeMask };
}

// Lỗ li ti (1–vài px sáng giữa nét chữ do JPEG): lấy màu trung bình các pixel nét xung quanh.
function fillPinholes(px, w, h, { list, mask }) {
  for (const i of list) {
    const y = (i / w) | 0;
    const x = i - y * w;
    let sr = 0, sg = 0, sb = 0, m = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(h - 1, y + 2); yy++) {
      for (let xx = Math.max(0, x - 2); xx <= Math.min(w - 1, x + 2); xx++) {
        const j = yy * w + xx;
        if (mask[j]) continue;
        sr += px[j * 4]; sg += px[j * 4 + 1]; sb += px[j * 4 + 2]; m++;
      }
    }
    if (!m) continue;
    px[i * 4] = Math.round(sr / m); px[i * 4 + 1] = Math.round(sg / m); px[i * 4 + 2] = Math.round(sb / m);
  }
}

// ---------------------------------------------------------------- tách bằng AI (U²-Net-p)

async function aiCutout(img, bgColor, modelPath) {
  const { px, w, h } = img;
  const n = w * h;

  // Tiền xử lý như rembg: RGB 320×320 (Lanczos), chia cho giá trị pixel lớn nhất, chuẩn hoá mean/std, NCHW.
  const flat = { r: bgColor?.[0] ?? 255, g: bgColor?.[1] ?? 255, b: bgColor?.[2] ?? 255 };
  const small = await sharp(px, { raw: { width: w, height: h, channels: 4 } })
    .flatten({ background: flat })
    .resize(AI_SIZE, AI_SIZE, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer();
  const plane = AI_SIZE * AI_SIZE;
  let maxV = 1e-6;
  for (let i = 0; i < small.length; i++) if (small[i] > maxV) maxV = small[i];
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) input[c * plane + i] = (small[i * 3 + c] / maxV - AI_MEAN[c]) / AI_STD[c];
  }
  const pred = await getRunner(modelPath).run(input);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < plane; i++) {
    if (pred[i] < lo) lo = pred[i];
    if (pred[i] > hi) hi = pred[i];
  }
  const span = hi - lo || 1;
  const mask8 = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) mask8[i] = Math.round(((pred[i] - lo) / span) * 255);
  const { data: big, info } = await sharp(mask8, { raw: { width: AI_SIZE, height: AI_SIZE, channels: 1 } })
    .resize(w, h, { fit: 'fill', kernel: 'linear' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  // Đường cong ngưỡng nhẹ: bỏ quầng mờ của mặt nạ, làm đặc lõi chủ thể.
  const alpha = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const m = big[i * ch] / 255;
    const s = Math.min(1, Math.max(0, (m - 0.15) / 0.7));
    alpha[i] = Math.round(s * s * (3 - 2 * s) * 255);
  }

  // Màu nền cục bộ (lưới ô 16 px, lấy trung bình pixel chắc chắn là nền) — nền gradient/ảnh không đồng màu.
  const S = 16;
  const gw = Math.ceil(w / S), gh = Math.ceil(h / S);
  const sum = new Float64Array(gw * gh * 3);
  const cnt = new Uint32Array(gw * gh);
  for (let y = 0; y < h; y++) {
    for (let x = 0, i = y * w; x < w; x++, i++) {
      if (alpha[i] > 8) continue;
      const g = ((y / S) | 0) * gw + ((x / S) | 0);
      sum[g * 3] += px[i * 4]; sum[g * 3 + 1] += px[i * 4 + 1]; sum[g * 3 + 2] += px[i * 4 + 2];
      cnt[g]++;
    }
  }
  const grid = fillGrid(sum, cnt, gw, gh, bgColor);

  // Biên: mặt nạ 320 px phóng to bị nhoè vài px. Ước lượng lại alpha bằng phép chiếu giữa màu nền cục bộ và
  // màu chủ thể gần nhất; pixel vùng nhoè mà trùng màu nền cục bộ thì bỏ hẳn (hết viền mờ quanh logo).
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (alpha[i] === 255) cand[i] = 1;
  const gridLab = new Float32Array(grid.length);
  for (let g = 0; g < grid.length; g += 3) {
    const [L, A, B] = toLab(Math.round(grid[g]), Math.round(grid[g + 1]), Math.round(grid[g + 2]));
    gridLab[g] = L; gridLab[g + 1] = A; gridLab[g + 2] = B;
  }
  const radius = Math.min(10, Math.max(4, Math.round((Math.max(w, h) / AI_SIZE) * 2)));
  const T = DEFAULT_TOLERANCE;
  const res = { a: 1, r: 0, g: 0, b: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0, i = y * w; x < w; x++, i++) {
      const a0 = alpha[i];
      if (a0 === 0 || a0 === 255) continue;
      const g = (((y / S) | 0) * gw + ((x / S) | 0)) * 3;
      const br = grid[g], bgc = grid[g + 1], bb = grid[g + 2];
      const [L, A, B] = toLab(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      const dB = Math.sqrt((L - gridLab[g]) ** 2 + (A - gridLab[g + 1]) ** 2 + (B - gridLab[g + 2]) ** 2);
      let a = a0 / 255;
      let ref = null;
      if (projectAlpha(px, i, w, h, br, bgc, bb, cand, radius, res)) {
        // Màu khác nền mà phép chiếu lệch xa mặt nạ → có thể chủ thể trùng màu nền: không tin hoàn toàn.
        a = dB <= T ? res.a : Math.min(Math.max(res.a, a - 0.5), a + 0.5);
        ref = res;
      } else if (dB <= T) {
        a = 0;
      } else if (dB <= 2.5 * T) {
        a = Math.min(a, (dB - T) / (1.5 * T));
      }
      a = snapAlpha(a);
      alpha[i] = Math.round(a * 255);
      if (a > 0 && a < 1) decontaminate(px, i, a, br, bgc, bb, ref);
    }
  }
  return { alpha };
}

// Ô lưới không có pixel nền → lấy ô lân cận gần nhất (loang theo lưới), không có gì → màu nền viền.
function fillGrid(sum, cnt, gw, gh, fallback) {
  const out = new Float32Array(gw * gh * 3);
  const done = new Uint8Array(gw * gh);
  let frontier = [];
  for (let g = 0; g < gw * gh; g++) {
    if (!cnt[g]) continue;
    for (let c = 0; c < 3; c++) out[g * 3 + c] = sum[g * 3 + c] / cnt[g];
    done[g] = 1;
    frontier.push(g);
  }
  if (!frontier.length) {
    const fb = fallback || [255, 255, 255];
    for (let g = 0; g < gw * gh; g++) for (let c = 0; c < 3; c++) out[g * 3 + c] = fb[c];
    return out;
  }
  while (frontier.length) {
    const next = [];
    for (const g of frontier) {
      const gx = g % gw, gy = (g / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx, ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const k = ny * gw + nx;
        if (done[k]) continue;
        done[k] = 1;
        for (let c = 0; c < 3; c++) out[k * 3 + c] = out[g * 3 + c];
        next.push(k);
      }
    }
    frontier = next;
  }
  return out;
}

// ---------------------------------------------------------------- xuất ảnh

// Cắt lề trong suốt (chừa 2 px) và mã hoá WebP lossless giữ alpha.
async function encode(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0, o = y * w * 4 + 3; x < w; x++, o += 4) {
      if (px[o] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  let img = sharp(px, { raw: { width: w, height: h, channels: 4 } });
  let ow = w, oh = h;
  if (x1 >= 0) {
    const left = Math.max(0, x0 - 2), top = Math.max(0, y0 - 2);
    ow = Math.min(w - 1, x1 + 2) - left + 1;
    oh = Math.min(h - 1, y1 + 2) - top + 1;
    if (ow !== w || oh !== h) img = img.extract({ left, top, width: ow, height: oh });
  }
  const buffer = await img.webp({ lossless: true, effort: 3 }).toBuffer();
  return { buffer, width: ow, height: oh };
}

function applyAlpha(px, alpha) {
  for (let i = 0, o = 3; i < alpha.length; i++, o += 4) {
    const a = (px[o] * alpha[i] + 127) / 255;
    // RGB dưới pixel trong suốt không hiển thị → đưa về 0 cho WebP nén gọn.
    if (a < 3) { px[o] = 0; px[o - 1] = 0; px[o - 2] = 0; px[o - 3] = 0; } else px[o] = a | 0;
  }
}

// ---------------------------------------------------------------- API

const MODES = new Set(['auto', 'color', 'ai']);
const INNERS = new Set(['auto', 'keep', 'remove']);

export async function removeBackground(input, opts = {}) {
  const mode = MODES.has(opts.mode) ? opts.mode : 'auto';
  const inner = INNERS.has(opts.inner) ? opts.inner : 'auto';
  const T = Number.isFinite(opts.tolerance) ? Math.min(60, Math.max(2, opts.tolerance)) : DEFAULT_TOLERANCE;
  const modelPath = typeof opts.modelPath === 'string' && opts.modelPath ? opts.modelPath : DEFAULT_MODEL_PATH;

  const img = await decode(input);
  const { px, w, h } = img;
  const ring = borderRing(w, h, 2);

  // Ảnh đã có nền trong suốt (PNG logo chuẩn) → chỉ cắt lề.
  let clear = 0;
  for (const i of ring) if (px[i * 4 + 3] < 16) clear++;
  if (clear >= 0.6 * ring.length) {
    return { ...(await encode(px, w, h)), method: 'none', note: NOTE_ALREADY_TRANSPARENT };
  }

  const bg = estimateBackground(px, ring);
  if (!bg) return { ...(await encode(px, w, h)), method: 'none', note: NOTE_NO_BG };

  let method = mode;
  let note;
  if (mode === 'auto') {
    // Viền đồng màu → tách theo màu (nhanh, biên sắc). Logo cắt sát mép vẫn tính là đồng màu nếu phần viền
    // khác màu nền là màu logo rõ ràng chứ không phải dải chuyển màu (gradient/ảnh chụp).
    const [L0, a0, b0] = toLab(bg[0], bg[1], bg[2]);
    let near = 0, ambiguous = 0, opaque = 0;
    for (const i of ring) {
      const o = i * 4;
      if (px[o + 3] < 16) { near++; opaque++; continue; }
      opaque++;
      const [L, A, B] = toLab(px[o], px[o + 1], px[o + 2]);
      const d = Math.sqrt((L - L0) ** 2 + (A - a0) ** 2 + (B - b0) ** 2);
      if (d <= T) near++;
      else if (d <= 2.5 * T) ambiguous++;
    }
    const fracBg = near / opaque;
    const fracAmb = ambiguous / opaque;
    const uniform = fracBg >= 0.88 || (fracBg >= 0.55 && fracAmb <= 0.06);
    method = uniform ? 'color' : 'ai';
  }
  if (method === 'ai' && !aiAvailable(modelPath)) {
    method = 'color';
    note = NOTE_NO_AI;
  }

  let alpha;
  if (method === 'ai') {
    try {
      // aiCutout sửa px tại chỗ (khử màu biên) → chạy trên bản sao để còn đường lùi về tách theo màu.
      const work = { px: Buffer.from(px), w, h };
      ({ alpha } = await aiCutout(work, bg, modelPath));
      let solid = 0;
      for (let i = 0; i < alpha.length; i++) if (alpha[i] >= 128) solid++;
      if (solid >= Math.max(16, 0.002 * alpha.length)) work.px.copy(px);
      else {
        // Mặt nạ gần như rỗng (không có vật thể nổi bật) → kết quả trong suốt hoàn toàn vô dụng.
        method = 'color';
        note = NOTE_AI_EMPTY;
      }
    } catch {
      method = 'color';
      note = NOTE_NO_AI;
    }
  }
  if (method === 'color') {
    const r = colorCutout(img, bg, T, inner);
    if (r.keptCount === 0) {
      // Ảnh một màu: không còn gì sau khi xoá nền → trả nguyên ảnh thay vì ảnh rỗng.
      const fresh = await decode(input);
      return { ...(await encode(fresh.px, w, h)), method: 'none', note: NOTE_NOTHING_LEFT };
    }
    alpha = r.alpha;
  }
  applyAlpha(px, alpha);
  const out = await encode(px, w, h);
  return note ? { ...out, method, note } : { ...out, method };
}
