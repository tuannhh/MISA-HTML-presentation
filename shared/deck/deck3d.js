/* MISA Presentation — hiệu ứng 3D (three.js, MIT): 4 mẫu nền 3D + logo nổi khối.
   Dùng chung: đóng gói IIFE (scripts/build-deck3d.mjs → window.Deck3D) cho trang bài trình bày; giao diện import trực tiếp
   (ô xem trước mẫu nền). Bất biến giống backgrounds.js: hình học sinh MỘT lần bằng PRNG có seed, draw(t) chỉ phụ thuộc
   (opts, t, con trỏ) → khung tĩnh (thumbnail/PDF) luôn giống nhau. Không có WebGL → hàm tạo trả null, engine dùng nền 2D
   tương ứng (FALLBACK_2D) và ảnh logo phẳng. */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Color, BufferGeometry, Float32BufferAttribute, Points, LineSegments,
  ShaderMaterial, AdditiveBlending, NormalBlending, Mesh, PlaneGeometry, Texture, LinearFilter, NoColorSpace,
} from 'three';

import { NAMES_3D, LABELS_3D, FALLBACK_2D, LOGO_MOTIONS } from './bg3d.js';

export { NAMES_3D, LABELS_3D, FALLBACK_2D, LOGO_MOTIONS };
const MOTIONS = Object.keys(LOGO_MOTIONS);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => (r() + r() + r() - 1.5) / 1.5;
// 'r,g,b' (0–255) → Color (giữ đúng màu sRGB như nền 2D).
function col(rgb, fb) {
  const p = String(rgb || fb).split(',').map((x) => +x);
  return new Color().setRGB((p[0] || 0) / 255, (p[1] || 0) / 255, (p[2] || 0) / 255, 'srgb');
}

function makeRenderer(canvas, w, h, keep) {
  let r;
  try {
    r = new WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: !!keep, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  if (!r.getContext()) return null;
  r.setPixelRatio(1);
  r.setSize(w, h, false);
  r.setClearColor(0x000000, 0);
  return r;
}

/* ---- vật liệu dùng chung: điểm tròn mềm + đường có độ mờ theo khoảng cách (sương) ---- */
const PT_VS = `
attribute vec3 color; attribute float size; attribute float alpha;
uniform float uScale; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
  gl_PointSize = size * uScale / max(0.1, -mv.z); vC = color; vA = alpha; }`;
const PT_FS = `
uniform float uOpacity; varying vec3 vC; varying float vA;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;
  float a = smoothstep(0.25, 0.0, r); gl_FragColor = vec4(vC, a * vA * uOpacity); }`;
const LN_VS = `
attribute vec3 color; uniform float uNear; uniform float uFar; varying vec3 vC; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
  vC = color; vA = 1.0 - smoothstep(uNear, uFar, -mv.z); }`;
const LN_FS = `
uniform float uOpacity; varying vec3 vC; varying float vA;
void main(){ gl_FragColor = vec4(vC, vA * uOpacity); }`;

function pointsMat(opacity, light, scale) {
  return new ShaderMaterial({
    vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false,
    blending: light ? NormalBlending : AdditiveBlending, uniforms: { uOpacity: { value: opacity }, uScale: { value: scale } },
  });
}
function lineMat(opacity, light, near = 0, far = 1e4) {
  return new ShaderMaterial({
    vertexShader: LN_VS, fragmentShader: LN_FS, transparent: true, depthWrite: false,
    blending: light ? NormalBlending : AdditiveBlending, uniforms: { uOpacity: { value: opacity }, uNear: { value: near }, uFar: { value: far } },
  });
}
function geo(pos, colors, extra = {}) {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  if (colors) g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  for (const [k, v] of Object.entries(extra)) g.setAttribute(k, new Float32BufferAttribute(v, 1));
  return g;
}
const push3 = (a, c) => a.push(c.r, c.g, c.b);

/* ---------------- mẫu nền ---------------- */
// Địa cầu chấm + cung kết nối có xung sáng chạy dọc (gợi mạng lưới toàn cầu). Đặt lệch phải để nhường chỗ chữ.
function globe(o, r) {
  const scene = new Scene();
  const g = new Group();
  scene.add(g);
  const R = 3.3;
  const pos = [], cl = [], sz = [], al = [];
  const n = 2200;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, rr = Math.sqrt(1 - y * y), th = i * 2.399963;
    pos.push(Math.cos(th) * rr * R, y * R, Math.sin(th) * rr * R);
    push3(cl, r() < 0.12 ? o.c.accent : o.c.node);
    sz.push(0.05 + r() * 0.05); al.push(0.45 + r() * 0.55);
  }
  g.add(new Points(geo(pos, cl, { size: sz, alpha: al }), pointsMat(o.light ? 0.75 : 0.85, o.light, o.ptScale)));
  // Vòng xích đạo + 2 kinh tuyến mờ.
  const ring = [], rc = [];
  const circle = (fn) => { for (let k = 0; k < 96; k++) { const a = (k / 96) * Math.PI * 2, b = ((k + 1) / 96) * Math.PI * 2; ring.push(...fn(a), ...fn(b)); push3(rc, o.c.edge); push3(rc, o.c.edge); } };
  circle((a) => [Math.cos(a) * R * 1.002, 0, Math.sin(a) * R * 1.002]);
  circle((a) => [Math.cos(a) * R * 1.002, Math.sin(a) * R * 1.002, 0]);
  circle((a) => [0, Math.sin(a) * R * 1.002, Math.cos(a) * R * 1.002]);
  g.add(new LineSegments(geo(ring, rc), lineMat(o.light ? 0.25 : 0.22, o.light)));
  // Cung nối giữa các điểm ngẫu nhiên trên mặt cầu (Bezier bậc 2 nâng giữa cung).
  const arcs = [];
  const ap = [], ac = [];
  const onS = () => { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [Math.cos(th) * s * R, u * R, Math.sin(th) * s * R]; };
  for (let k = 0; k < 16; k++) {
    const a = onS(), b = onS();
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const ml = Math.hypot(...m) || 1, lift = R * (1.25 + r() * 0.35);
    const c = m.map((v) => (v / ml) * lift);
    const pts = [];
    for (let s = 0; s <= 40; s++) { const t = s / 40, u = 1 - t; pts.push([0, 1, 2].map((d) => u * u * a[d] + 2 * u * t * c[d] + t * t * b[d])); }
    for (let s = 0; s < 40; s++) { ap.push(...pts[s], ...pts[s + 1]); push3(ac, k % 3 ? o.c.edge : o.c.accent2); push3(ac, k % 3 ? o.c.edge : o.c.accent2); }
    arcs.push({ pts, ph: r(), sp: 0.12 + r() * 0.12 });
  }
  g.add(new LineSegments(geo(ap, ac), lineMat(o.light ? 0.5 : 0.45, o.light)));
  const pp = new Float32Array(arcs.length * 3);
  const pg = geo(Array.from(pp), arcs.map(() => [o.c.accent.r, o.c.accent.g, o.c.accent.b]).flat(), { size: arcs.map(() => 0.22), alpha: arcs.map(() => 1) });
  g.add(new Points(pg, pointsMat(1, o.light, o.ptScale)));
  g.position.set(3.1, -0.9, 0);
  g.rotation.z = 0.32;
  const cam = new PerspectiveCamera(38, o.aspect, 0.1, 100);
  cam.position.set(0, 0, 11);
  return {
    scene, cam,
    update(t, p) {
      g.rotation.y = t * 0.07;
      const at = pg.getAttribute('position');
      arcs.forEach((a, k) => {
        const u = (a.ph + t * a.sp) % 1, f = u * 40, i0 = Math.floor(f), w = f - i0, A = a.pts[i0], B = a.pts[Math.min(40, i0 + 1)];
        at.setXYZ(k, A[0] + (B[0] - A[0]) * w, A[1] + (B[1] - A[1]) * w, A[2] + (B[2] - A[2]) * w);
      });
      at.needsUpdate = true;
      cam.position.set(p.x * 0.7, p.y * 0.45, 11);
      cam.lookAt(0, 0, 0);
    },
  };
}

// Địa hình lưới dây chạy về phía chân trời (đồi sóng theo hàm sin xác định), đỉnh cao đổi sang màu nhấn.
function terrain(o) {
  const scene = new Scene();
  const NX = 64, NZ = 56, X0 = -34, X1 = 34, Z0 = -64, Z1 = 4;
  const hAt = (x, z) => {
    const v = Math.sin(x * 0.21 + z * 0.05) * 0.9 + Math.sin(x * 0.07 - z * 0.13) * 1.3 + Math.sin(x * 0.43 + z * 0.31) * 0.35;
    const valley = Math.min(1, Math.abs(x) / 9); // thung lũng giữa → khoảng trống cho nội dung
    return Math.max(-0.4, v) * (0.25 + valley * 1.15);
  };
  const segs = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) { if (i < NX - 1) segs.push([i, j, i + 1, j]); if (j < NZ - 1) segs.push([i, j, i, j + 1]); }
  const pos = new Float32Array(segs.length * 6), cl = new Float32Array(segs.length * 6);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(cl, 3));
  scene.add(new LineSegments(g, lineMat(0.5, o.light, 3, 44)));
  const dz = (Z1 - Z0) / (NZ - 1), dx = (X1 - X0) / (NX - 1);
  const tmp = new Color();
  // Mặt trời mờ ở chân trời.
  const sun = new Points(geo([0, 3, -60], [o.c.accent2.r, o.c.accent2.g, o.c.accent2.b], { size: [60], alpha: [0.5] }), pointsMat(o.light ? 0.35 : 0.5, o.light, o.ptScale));
  scene.add(sun);
  const cam = new PerspectiveCamera(55, o.aspect, 0.1, 200);
  return {
    scene, cam,
    update(t, p) {
      // Lưới dịch về phía người xem trong phạm vi 1 ô (lặp liền mạch); độ cao lấy theo toạ độ địa hình z − quãng đã đi.
      const run = t * 1.6, off = run % dz;
      const P = g.getAttribute('position'), C = g.getAttribute('color');
      const vx = (i) => X0 + i * dx, vz = (j) => Z0 + j * dz + off;
      segs.forEach((s, k) => {
        for (let e = 0; e < 2; e++) {
          const x = vx(s[e * 2]), z = vz(s[e * 2 + 1]), y = hAt(x, z - run);
          P.setXYZ(k * 2 + e, x, y, z);
          tmp.copy(o.c.edge).lerp(o.c.accent, Math.min(1, Math.max(0, (y - 0.6) / 1.4)));
          C.setXYZ(k * 2 + e, tmp.r, tmp.g, tmp.b);
        }
      });
      P.needsUpdate = true; C.needsUpdate = true;
      // Máy quay thấp, hơi ngước lên → chân trời nằm ở 2/3 dưới khung, phần trên (tiêu đề) thoáng.
      cam.position.set(p.x * 1.2, 2.2 + p.y * 0.5, 7);
      cam.lookAt(0, 6.2, -24);
    },
  };
}

// Thiên hà xoắn ốc 3 nhánh + nền sao, nghiêng và quay chậm.
function galaxy(o, r) {
  const scene = new Scene();
  const g = new Group();
  scene.add(g);
  const pos = [], cl = [], sz = [], al = [];
  const tmp = new Color();
  const RMAX = 7;
  for (let i = 0; i < 7000; i++) {
    const rad = Math.pow(r(), 1.55) * RMAX, arm = i % 3;
    const ang = (arm / 3) * Math.PI * 2 + rad * 0.85;
    const sp = 0.32 * (0.35 + rad / RMAX);
    pos.push(Math.cos(ang) * rad + gauss(r) * sp * 1.6, gauss(r) * 0.28 * (1 - rad / (RMAX * 1.2)), Math.sin(ang) * rad + gauss(r) * sp * 1.6);
    tmp.copy(o.c.accent).lerp(i % 5 ? o.c.node : o.c.accent2, Math.min(1, rad / (RMAX * 0.7)));
    push3(cl, tmp);
    sz.push(0.04 + r() * 0.07); al.push(0.4 + r() * 0.6);
  }
  g.add(new Points(geo(pos, cl, { size: sz, alpha: al }), pointsMat(o.light ? 0.7 : 0.9, o.light, o.ptScale)));
  const sp = [], sc = [], ss = [], sa = [];
  for (let i = 0; i < 700; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = 28 + r() * 10;
    sp.push(Math.cos(th) * s * R, u * R, Math.sin(th) * s * R);
    push3(sc, o.c.node); ss.push(0.08 + r() * 0.12); sa.push(0.2 + r() * 0.5);
  }
  const stars = new Points(geo(sp, sc, { size: ss, alpha: sa }), pointsMat(o.light ? 0.5 : 0.8, o.light, o.ptScale));
  scene.add(stars);
  g.rotation.x = 1.05;
  g.position.set(2.4, -0.4, 0);
  const cam = new PerspectiveCamera(45, o.aspect, 0.1, 200);
  return {
    scene, cam,
    update(t, p) {
      g.rotation.z = -t * 0.045;
      stars.rotation.y = t * 0.006;
      cam.position.set(p.x * 0.9, 0.6 + p.y * 0.6, 12);
      cam.lookAt(0.8, 0, 0);
    },
  };
}

// Thành phố khối dây (toà nhà cao thấp), cửa sổ nhấp nháy và xung dữ liệu chạy dọc phố; máy quay bay vòng chậm.
function city(o, r) {
  const scene = new Scene();
  const N = 15, S = 2.2;
  const lp = [], lc = [], wp = [], wc = [], ws = [], wa = [], winPh = [];
  const tmp = new Color();
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (r() < 0.16) continue;
    const x = (i - (N - 1) / 2) * S, z = (j - (N - 1) / 2) * S;
    const d = Math.hypot(x, z) / (N * S * 0.5);
    const h = 0.4 + Math.pow(r(), 2.2) * 6 * (1.15 - d) + (d < 0.25 ? 2.5 * r() : 0);
    const w = 0.55 + r() * 0.35, q = (w * S) / 2;
    const c = [[x - q, z - q], [x + q, z - q], [x + q, z + q], [x - q, z + q]];
    tmp.copy(o.c.edge).lerp(o.c.accent, Math.min(1, h / 7));
    for (let k = 0; k < 4; k++) {
      const a = c[k], b = c[(k + 1) % 4];
      lp.push(a[0], 0, a[1], b[0], 0, b[1], a[0], h, a[1], b[0], h, b[1], a[0], 0, a[1], a[0], h, a[1]);
      for (let m = 0; m < 6; m++) push3(lc, tmp);
    }
    // Cửa sổ: vài điểm sáng trên 2 mặt nhìn về máy quay.
    const nw = Math.min(10, Math.floor(h * 1.6));
    for (let k = 0; k < nw; k++) {
      const side = r() < 0.5, u = (r() - 0.5) * 2 * q * 0.8, y = 0.25 + r() * (h - 0.4);
      wp.push(side ? x + u : x + q + 0.01, y, side ? z + q + 0.01 : z + u);
      push3(wc, r() < 0.3 ? o.c.accent2 : o.c.node); ws.push(0.08 + r() * 0.06); wa.push(1); winPh.push(r() * 10);
    }
  }
  scene.add(new LineSegments(geo(lp, lc), lineMat(o.light ? 0.55 : 0.5, o.light, 10, 60)));
  const wg = geo(wp, wc, { size: ws, alpha: wa });
  scene.add(new Points(wg, pointsMat(o.light ? 0.8 : 1, o.light, o.ptScale)));
  // Lưới phố + xung dữ liệu.
  const gp = [], gc = [], L = (N / 2) * S;
  for (let k = 0; k <= N; k++) { const v = (k - N / 2) * S; gp.push(-L, 0, v, L, 0, v, v, 0, -L, v, 0, L); for (let m = 0; m < 4; m++) push3(gc, o.c.node); }
  scene.add(new LineSegments(geo(gp, gc), lineMat(o.light ? 0.18 : 0.14, o.light, 10, 60)));
  const pulses = Array.from({ length: 18 }, (_, k) => ({ lane: (Math.floor(r() * (N + 1)) - N / 2) * S, ax: k % 2, ph: r(), sp: 0.05 + r() * 0.06 }));
  const pg = geo(new Array(pulses.length * 3).fill(0), pulses.map(() => [o.c.accent.r, o.c.accent.g, o.c.accent.b]).flat(), { size: pulses.map(() => 0.3), alpha: pulses.map(() => 1) });
  scene.add(new Points(pg, pointsMat(1, o.light, o.ptScale)));
  const cam = new PerspectiveCamera(42, o.aspect, 0.1, 200);
  return {
    scene, cam,
    update(t, p) {
      const A = wg.getAttribute('alpha');
      for (let k = 0; k < winPh.length; k++) A.setX(k, 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.9 + winPh[k] * 3)));
      A.needsUpdate = true;
      const P = pg.getAttribute('position');
      pulses.forEach((q, k) => { const u = ((q.ph + t * q.sp) % 1) * 2 * L - L; if (q.ax) P.setXYZ(k, u, 0.05, q.lane); else P.setXYZ(k, q.lane, 0.05, u); });
      P.needsUpdate = true;
      const a = 0.6 + t * 0.035 + p.x * 0.15;
      cam.position.set(Math.cos(a) * 27, 13 + p.y * 2, Math.sin(a) * 27);
      cam.lookAt(-3, 1.5, 0);
    },
  };
}

const SCENES = { globe3d: globe, terrain3d: terrain, galaxy3d: galaxy, city3d: city };

/**
 * Nền 3D lên canvas (WebGL riêng). opts: { name, width, height, node, edge, accent, accent2 ('r,g,b'), light, seed, still }
 * @returns {{ draw(t), setPointer(x,y), canvas, dispose() } | null}  null = không có WebGL / tên lạ.
 */
export function createBg3D(canvas, opts) {
  const make = SCENES[opts.name];
  if (!make) return null;
  const w = Math.max(2, Math.round(opts.width)), h = Math.max(2, Math.round(opts.height));
  const renderer = makeRenderer(canvas, w, h, opts.still);
  if (!renderer) return null;
  const c = { node: col(opts.node, '160,220,255'), edge: col(opts.edge, '46,230,214'), accent: col(opts.accent || opts.edge, '46,230,214'), accent2: col(opts.accent2 || opts.node, '160,220,255') };
  const S = make({ c, light: !!opts.light, aspect: w / h, ptScale: h * 0.9 }, rng(opts.seed || 7));
  const p = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  return {
    canvas,
    setPointer(x, y) { target.x = x; target.y = y; },
    draw(t) {
      p.x += (target.x - p.x) * 0.06; p.y += (target.y - p.y) * 0.06;
      S.update(t || 0, p);
      renderer.render(S.scene, S.cam);
    },
    dispose() {
      S.scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* bỏ qua */ }
    },
  };
}

/* ---------------- logo nổi khối ---------------- */
const LG_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const LG_FS = `
uniform sampler2D map; uniform float uShade; uniform float uFront; uniform float uPhase; uniform vec3 uTint; varying vec2 vUv;
void main(){ vec4 c = texture2D(map, vUv); if (c.a < 0.45) discard;
  vec3 col = uFront > 0.5 ? c.rgb : mix(c.rgb, uTint, 0.12) * uShade;
  if (uFront > 0.5) { float b = vUv.x * 0.9 + (1.0 - vUv.y) * 0.45 - uPhase; col += vec3(0.55 * exp(-b * b * 55.0)); }
  gl_FragColor = vec4(col, 1.0); }`;

/**
 * Logo nổi khối từ ảnh (PNG nền trong suốt cho kết quả đẹp nhất): xếp chồng các lớp ảnh theo chiều sâu, lớp sau tối dần
 * thành "thành khối", lớp trước có vệt sáng quét qua. Xoay trong ±50° (không lật ra mặt sau).
 * opts: { width, height, motion: 'swing'|'float'|'turn', depth: 0.1–1, tint 'r,g,b', still }
 * @returns {{ draw(t), setPointer(x,y), canvas, dispose() } | null}  null = không có WebGL / ảnh khác nguồn (không đọc được điểm ảnh).
 */
export function createLogo3D(canvas, img, opts) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  // Chuẩn hoá ảnh qua canvas 2D (tối đa 1024px) — đồng thời kiểm tra ảnh không "bẩn" CORS.
  const k = Math.min(1, 1024 / Math.max(iw, ih));
  const src = document.createElement('canvas');
  src.width = Math.max(1, Math.round(iw * k)); src.height = Math.max(1, Math.round(ih * k));
  const sx = src.getContext('2d');
  try {
    sx.drawImage(img, 0, 0, src.width, src.height);
    sx.getImageData(0, 0, 1, 1);
  } catch {
    return null;
  }
  const w = Math.max(2, Math.round(opts.width)), h = Math.max(2, Math.round(opts.height));
  const renderer = makeRenderer(canvas, w, h, opts.still);
  if (!renderer) return null;
  const tex = new Texture(src);
  tex.colorSpace = NoColorSpace; tex.minFilter = LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const scene = new Scene();
  const g = new Group();
  scene.add(g);
  const ar = src.width / src.height;
  const pw = ar >= 1 ? 2 : 2 * ar, ph = ar >= 1 ? 2 / ar : 2;
  const depth = Math.min(1, Math.max(0.1, +opts.depth || 0.5));
  const thick = Math.max(pw, ph) * 0.16 * depth;
  const layers = 40;
  const plane = new PlaneGeometry(pw, ph);
  const tint = col(opts.tint, '40,48,72');
  const mats = [];
  let front = null;
  for (let i = 0; i < layers; i++) {
    const f = i === layers - 1;
    const m = new ShaderMaterial({
      vertexShader: LG_VS, fragmentShader: LG_FS,
      uniforms: { map: { value: tex }, uShade: { value: 0.45 + 0.3 * (i / (layers - 1)) }, uFront: { value: f ? 1 : 0 }, uPhase: { value: -1 }, uTint: { value: tint } },
    });
    mats.push(m);
    const mesh = new Mesh(plane, m);
    mesh.position.z = -thick / 2 + (thick * i) / (layers - 1);
    g.add(mesh);
    if (f) front = m;
  }
  const cam = new PerspectiveCamera(30, w / h, 0.1, 100);
  // Lùi máy quay đủ xa để logo (kể cả khi nghiêng) nằm trọn khung phần tử.
  const fitH = Math.max(ph, pw / (w / h)) * 1.18;
  cam.position.set(0, 0, fitH / 2 / Math.tan((15 * Math.PI) / 180) + thick);
  cam.lookAt(0, 0, 0);
  const motion = MOTIONS.includes(opts.motion) ? opts.motion : 'swing';
  const p = { x: 0, y: 0 }, target = { x: 0, y: 0 };
  return {
    canvas,
    setPointer(x, y) { target.x = x; target.y = y; },
    draw(t) {
      t = t || 0;
      p.x += (target.x - p.x) * 0.08; p.y += (target.y - p.y) * 0.08;
      let ry, rx, y = 0;
      if (motion === 'turn') { ry = Math.sin(t * 0.45) * 0.87; rx = Math.sin(t * 0.3) * 0.06; }
      else if (motion === 'float') { ry = Math.sin(t * 0.55) * 0.32; rx = Math.sin(t * 0.8 + 1) * 0.1; y = Math.sin(t * 1.3) * ph * 0.035; }
      else { ry = Math.sin(t * 0.95) * 0.6; rx = Math.sin(t * 0.6 + 1) * 0.1; }
      g.rotation.set(rx - p.y * 0.18, ry + p.x * 0.3, 0);
      g.position.y = y;
      front.uniforms.uPhase.value = ((t * 0.32) % 1.9) - 0.45;
      renderer.render(scene, cam);
    },
    dispose() {
      plane.dispose(); mats.forEach((m) => m.dispose()); tex.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch { /* bỏ qua */ }
    },
  };
}
