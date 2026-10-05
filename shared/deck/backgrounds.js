/* MISA Presentation — 10 nền động chủ đề công nghệ cho canvas #bg của bài trình bày.
   Một tệp dùng ở 3 nơi: chèn inline vào <script> cổ điển của trang deck, Vite import để xem trước trong bộ chọn,
   Node import trong unit test → viết IIFE thuần, không import/export, không phụ thuộc; gắn vào window/globalThis.DeckBg.
   Bất biến: hình vẽ chỉ phụ thuộc (opts, t). Hình học sinh MỘT lần bằng PRNG có seed trong create(); draw(t) tính mọi
   vị trí trực tiếp từ t, không tích luỹ trạng thái giữa các khung — vì deck nhảy tới t bất kỳ và "đóng băng" ở t = 0
   khi chụp thumbnail, nên khung t = 0 của mọi mẫu phải đầy đủ (không mờ dần từ rỗng).
   Nền nằm sau chữ: nét mảnh, alpha thấp (đa số ≤ .18), chuyển động chậm, gom nét theo mức alpha; không đổ bóng mờ,
   không đọc điểm ảnh mỗi khung → ~≤ 4 ms/khung ở 1280×720.
   API: DeckBg.NAMES, DeckBg.LABELS, DeckBg.create(ctx, { name, width, height, node, edge, accent, accent2, light, seed })
        → { name, draw(t) } (t tính bằng giây). Màu dạng chuỗi "r,g,b". */
(function (g) {
  'use strict';

  var TAU = Math.PI * 2;
  var NAMES = ['network', 'circuit', 'grid', 'matrix', 'waves', 'hex', 'dots', 'orbits', 'particles', 'radar'];
  var LABELS = {
    network: 'Mạng lưới', circuit: 'Mạch điện tử', grid: 'Lưới phối cảnh', matrix: 'Mưa nhị phân', waves: 'Sóng dữ liệu',
    hex: 'Tổ ong lục giác', dots: 'Ma trận điểm', orbits: 'Quỹ đạo', particles: 'Dòng hạt', radar: 'Radar'
  };
  // Font hệ thống đơn cách: deck chỉ nhúng Inter, mà chữ số 0/1 cần bề rộng đều để cột thẳng hàng.
  var MONO = '500 13px ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

  /* ---------- tiện ích ---------- */
  // Park–Miller y hệt engine cũ: seed 7 phải sinh đúng dãy số cũ để nền 'network' của deck đã có không đổi.
  function mkRnd(seed) {
    var s = Math.floor(Math.abs(seed)) % 2147483647 || 7;
    return function () { return (s = (s * 16807) % 2147483647) / 2147483647; };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pmod(a, m) { return ((a % m) + m) % m; }
  function rgba(c, a) { return 'rgba(' + c + ',' + clamp(a, 0, 1).toFixed(3) + ')'; }
  // Băm số nguyên → [0,1): chọn chữ số/nhịp theo (cột, hàng, nhịp) mà không phải lưu trạng thái.
  function hash01(a, b, c) {
    var h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1103515245);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function colorOf(v, fb) {
    var s = typeof v === 'string' ? v.trim() : '';
    return /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(s) ? s : fb;
  }
  // Seed riêng cho từng mẫu để đổi seed không làm các mẫu "cùng nhịp" với nhau.
  function rndFor(o, salt) { return mkRnd(o.seed * 7919 + salt); }

  /* ---------- 1. Mạng lưới: chép nguyên thuật toán cũ trong engine.js (deck đã có phải trông y hệt) ---------- */
  function network(ctx, o) {
    var CW = o.w, CH = o.h, node = o.node, edge = o.edge, nodes = [];
    var rnd = mkRnd(o.seed);
    var count = Math.round(64 * (CW * 2) / 2560); // engine cũ tính theo bề rộng deck = 2 × canvas
    for (var q = 0; q < count; q++) nodes.push({ x: rnd() * CW, y: rnd() * CH, ax: 20 + rnd() * 50, ay: 20 + rnd() * 40, sp: .05 + rnd() * .12, ph: rnd() * 6.28, r: .8 + rnd() * 1.6 });
    return function (t) {
      ctx.clearRect(0, 0, CW, CH);
      var P = nodes.map(function (n) { return [n.x + Math.sin(t * n.sp + n.ph) * n.ax, n.y + Math.cos(t * n.sp * .8 + n.ph) * n.ay, n.r]; });
      ctx.lineWidth = .6;
      for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
        var dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1], d = Math.sqrt(dx * dx + dy * dy);
        if (d < 150) { ctx.strokeStyle = 'rgba(' + edge + ',' + ((1 - d / 150) * .16).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(P[i][0], P[i][1]); ctx.lineTo(P[j][0], P[j][1]); ctx.stroke(); }
      }
      ctx.fillStyle = 'rgba(' + node + ',.5)';
      for (var k = 0; k < P.length; k++) { ctx.beginPath(); ctx.arc(P[k][0], P[k][1], P[k][2], 0, 6.283); ctx.fill(); }
    };
  }

  /* ---------- 2. Mạch điện tử: đường mạch trực giao vát 45°, bus song song, chip, via, xung sáng chạy dọc ---------- */
  function circuit(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 101), L = o.light;
    var G = 24, cols = Math.floor(W / G), rows = Math.floor(H / G);
    var ox = (W - cols * G) / 2, oy = (H - rows * G) / 2;
    var DX = [1, 1, 0, -1, -1, -1, 0, 1], DY = [0, 1, 1, 1, 0, -1, -1, -1];
    var used = {}, nUsed = 0, traces = [], chips = [], vias = [];
    function mark(k) { if (!used[k]) { used[k] = 1; nUsed++; } }
    function inGrid(x, y) { return x >= -1 && y >= -1 && x <= cols + 1 && y <= rows + 1; }
    // Ô đánh dấu theo toạ độ ×2 để giữ cả trung điểm bước chéo: chặn hai đường chéo cắt nhau hình chữ X.
    function walk(x, y, segs, taken) {
      var pts = [[x, y]], cells = [x * 2 + ',' + y * 2];
      for (var i = 0; i < segs.length; i++) {
        var d = segs[i][0];
        for (var s = 0; s < segs[i][1]; s++) {
          if (d & 1) cells.push((x * 2 + DX[d]) + ',' + (y * 2 + DY[d]));
          x += DX[d]; y += DY[d];
          if (!inGrid(x, y)) return null;
          cells.push(x * 2 + ',' + y * 2);
        }
        pts.push([x, y]);
      }
      for (var c = 0; c < cells.length; c++) if (used[cells[c]] || taken[cells[c]]) return null;
      for (c = 0; c < cells.length; c++) taken[cells[c]] = 1;
      return pts;
    }
    // Kế hoạch đường: thẳng → vát 45° → thẳng (bậc), đường đơn được phép rẽ hẳn 90° qua hai lần vát.
    function plan(d, turn) {
      var segs = [[d, 2 + (rnd() * 6 | 0)]], n = rnd() < .55 ? 1 : 2;
      for (var j = 0; j < n; j++) {
        var side = rnd() < .5 ? 1 : 7;
        segs.push([(d + side) % 8, 1 + (rnd() * 3 | 0)]);
        if (turn && rnd() < .6) d = (d + side * 2) % 8;
        segs.push([d, 2 + (rnd() * 7 | 0)]);
      }
      return segs;
    }
    // Bó k đường song song (bus) dịch vuông góc 1 ô. Bus chỉ đi "bậc" (về lại hướng cũ) nên dịch song song không chồng nét.
    function bundle(sx, sy, d, k, lead) {
      var base = plan(d, k === 1), p = (d + 2) % 8, taken = {}, lines = [];
      for (var i = 0; i < k; i++) {
        var e0 = lead ? 0 : (rnd() * 3 | 0), e1 = rnd() * 3 | 0;
        var segs = base.map(function (s) { return [s[0], s[1]]; });
        segs[0][1] += e0; segs[segs.length - 1][1] += e1;
        var pts = walk(sx + DX[p] * i - DX[d] * e0, sy + DY[p] * i - DY[d] * e0, segs, taken);
        if (!pts) return false;
        lines.push(pts);
      }
      for (var key in taken) mark(key);
      lines.forEach(function (pts) {
        var xy = [];
        if (lead) xy.push(ox + pts[0][0] * G - DX[d] * (G / 2 + 3), oy + pts[0][1] * G - DY[d] * (G / 2 + 3));
        else vias.push(ox + pts[0][0] * G, oy + pts[0][1] * G);
        pts.forEach(function (q) { xy.push(ox + q[0] * G, oy + q[1] * G); });
        vias.push(xy[xy.length - 2], xy[xy.length - 1]);
        addTrace(xy);
      });
      return true;
    }
    function addTrace(xy) {
      var cum = [0], len = 0;
      for (var i = 2; i < xy.length; i += 2) { len += Math.hypot(xy[i] - xy[i - 2], xy[i + 1] - xy[i - 1]); cum.push(len); }
      var tr = { xy: xy, cum: cum, len: len, pulse: rnd() < .55 };
      tr.sp = 34 + rnd() * 56; tr.per = len + 60 + rnd() * (len + 140); tr.ph = rnd() * tr.per;
      traces.push(tr);
    }
    function chip(x0, y0, w, h) {
      var x1 = x0 + w - 1, y1 = y0 + h - 1, x, y;
      for (x = x0 - 2; x <= x1 + 2; x++) for (y = y0 - 2; y <= y1 + 2; y++) if (used[x * 2 + ',' + y * 2]) return false;
      for (x = x0 - 1; x <= x1 + 1; x++) for (y = y0 - 1; y <= y1 + 1; y++) { mark(x * 2 + ',' + y * 2); mark((x * 2 + 1) + ',' + (y * 2 + 1)); mark((x * 2 - 1) + ',' + (y * 2 + 1)); }
      chips.push({ x: ox + x0 * G - G / 2 + 3, y: oy + y0 * G - G / 2 + 3, w: w * G - 6, h: h * G - 6 });
      // Chân chip: bus đi ra từ hai cạnh (đôi khi cả cạnh trên/dưới). Ô xuất phát nằm trong lề chip nên mở tạm.
      var sides = [[x1 + 1, y0, 0, h], [x0 - 1, y1, 4, h]];
      if (rnd() < .6) sides.push([x0, y0 - 1, 6, w]); else sides.push([x1, y1 + 1, 2, w]);
      sides.forEach(function (s) {
        var p = (s[2] + 2) % 8, i, ks = [];
        for (i = 0; i < s[3]; i++) ks.push((s[0] + DX[p] * i) * 2 + ',' + (s[1] + DY[p] * i) * 2);
        ks.forEach(function (k) { if (used[k]) { delete used[k]; nUsed--; } });
        for (var a = 0; a < 6; a++) if (bundle(s[0], s[1], s[2], s[3], true)) return;
        ks.forEach(mark);
      });
      return true;
    }
    var nChip = Math.max(1, Math.round(W / 700)), tries;
    for (tries = 0; chips.length < nChip && tries < 60; tries++) {
      var cw = 3 + (rnd() * 3 | 0), chh = 2 + (rnd() * 2 | 0);
      chip(3 + (rnd() * Math.max(1, cols - cw - 6) | 0), 3 + (rnd() * Math.max(1, rows - chh - 6) | 0), cw, chh);
    }
    var target = (cols + 3) * (rows + 3) * .4;
    for (tries = 0; tries < 1400 && nUsed < target; tries++) {
      var k = rnd() < .3 ? 1 : 2 + (rnd() * 4 | 0);
      var dir = rnd() < .65 ? (rnd() < .5 ? 0 : 4) : (rnd() < .5 ? 2 : 6);
      bundle((rnd() * (cols + 3) | 0) - 1, (rnd() * (rows + 3) | 0) - 1, dir, k, false);
    }

    var sTrace = rgba(o.edge, L ? .13 : .14), sChip = rgba(o.edge, L ? .2 : .22), sChipFill = rgba(o.edge, L ? .03 : .035);
    var sVia = rgba(o.node, L ? .26 : .3), sViaCore = rgba(o.node, L ? .3 : .38);
    var sPulse = [rgba(o.accent, .1), rgba(o.accent, .22), rgba(o.accent, .42)], sHead = rgba(o.accent, L ? .55 : .6);
    var TAIL = 14;
    // Thêm đoạn con [s0, s1] (theo chiều dài cung) của đường mạch vào path hiện tại.
    function sub(tr, s0, s1) {
      s0 = Math.max(0, s0); s1 = Math.min(tr.len, s1);
      if (s1 <= s0) return;
      var xy = tr.xy, cum = tr.cum, first = true;
      for (var i = 0; i < cum.length - 1; i++) {
        var l0 = cum[i], l1 = cum[i + 1];
        if (l1 < s0 || l0 > s1 || l1 === l0) continue;
        var a = (Math.max(s0, l0) - l0) / (l1 - l0), b = (Math.min(s1, l1) - l0) / (l1 - l0);
        var x0 = xy[i * 2], y0 = xy[i * 2 + 1], dx = xy[i * 2 + 2] - x0, dy = xy[i * 2 + 3] - y0;
        if (first) { ctx.moveTo(x0 + dx * a, y0 + dy * a); first = false; }
        ctx.lineTo(x0 + dx * b, y0 + dy * b);
      }
    }
    function at(tr, s) {
      var xy = tr.xy, cum = tr.cum;
      for (var i = 0; i < cum.length - 1; i++) if (s <= cum[i + 1]) {
        var f = (s - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
        return [xy[i * 2] + (xy[i * 2 + 2] - xy[i * 2]) * f, xy[i * 2 + 1] + (xy[i * 2 + 3] - xy[i * 2 + 1]) * f];
      }
      return [xy[xy.length - 2], xy[xy.length - 1]];
    }

    return function (t) {
      var i, j, tr, s;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 1;
      ctx.strokeStyle = sTrace; ctx.beginPath();
      for (i = 0; i < traces.length; i++) {
        var xy = traces[i].xy;
        ctx.moveTo(xy[0], xy[1]);
        for (j = 2; j < xy.length; j += 2) ctx.lineTo(xy[j], xy[j + 1]);
      }
      ctx.stroke();
      ctx.fillStyle = sChipFill; ctx.strokeStyle = sChip; ctx.beginPath();
      for (i = 0; i < chips.length; i++) ctx.rect(chips[i].x, chips[i].y, chips[i].w, chips[i].h);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = sChip; ctx.beginPath(); // chấm đánh dấu chân số 1
      for (i = 0; i < chips.length; i++) { ctx.moveTo(chips[i].x + 9, chips[i].y + 7); ctx.arc(chips[i].x + 7, chips[i].y + 7, 2, 0, TAU); }
      ctx.fill();
      ctx.strokeStyle = sVia; ctx.beginPath();
      for (i = 0; i < vias.length; i += 2) { ctx.moveTo(vias[i] + 3, vias[i + 1]); ctx.arc(vias[i], vias[i + 1], 3, 0, TAU); }
      ctx.stroke();
      ctx.fillStyle = sViaCore; ctx.beginPath();
      for (i = 0; i < vias.length; i += 2) { ctx.moveTo(vias[i] + 1.1, vias[i + 1]); ctx.arc(vias[i], vias[i + 1], 1.1, 0, TAU); }
      ctx.fill();
      // Xung: vị trí = hàm tuần hoàn của t → nhảy tới t bất kỳ vẫn đúng; t = 0 các xung đã nằm rải rác trên mạch.
      ctx.lineWidth = 1.6;
      for (var piece = 0; piece < 3; piece++) {
        ctx.strokeStyle = sPulse[piece]; ctx.beginPath();
        for (i = 0; i < traces.length; i++) {
          tr = traces[i]; if (!tr.pulse) continue;
          s = pmod(t * tr.sp + tr.ph, tr.per);
          if (s - 3 * TAIL < tr.len) sub(tr, s - (3 - piece) * TAIL, s - (2 - piece) * TAIL);
        }
        ctx.stroke();
      }
      ctx.fillStyle = sHead; ctx.beginPath();
      for (i = 0; i < traces.length; i++) {
        tr = traces[i]; if (!tr.pulse) continue;
        s = pmod(t * tr.sp + tr.ph, tr.per);
        if (s > tr.len) continue;
        var p = at(tr, s);
        ctx.moveTo(p[0] + 1.8, p[1]); ctx.arc(p[0], p[1], 1.8, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    };
  }

  /* ---------- 3. Lưới phối cảnh: mặt sàn lưới chạy về phía người xem + vạch chân trời phát sáng ---------- */
  function grid(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 202), L = o.light;
    var cx = W / 2, hy = Math.round(H * .58), D = H - hy, a = L ? .17 : .19;
    var hg = ctx.createLinearGradient(0, 0, W, 0); // vạch chân trời mờ dần về hai mép
    hg.addColorStop(0, rgba(o.accent, 0)); hg.addColorStop(.5, rgba(o.accent, L ? .34 : .45)); hg.addColorStop(1, rgba(o.accent, 0));
    // Mờ dần về chân trời bằng các bậc alpha đặc thay cho gradient: nét/khối tô gradient đắt gấp ~5 lần khi canvas
    // rasterize bằng CPU, còn bậc alpha chênh nhau rất nhỏ nên mắt không thấy ranh giới.
    var EV = [.025, .06, .12, .22, .38, .62, 1], sV = [];
    for (var i = 0; i < EV.length - 1; i++) sV.push(rgba(o.edge, a * Math.pow((EV[i] + EV[i + 1]) / 2, .85)));
    var GH = [], sGlow = rgba(o.accent, L ? .0045 : .0072);
    for (var gk = 0; gk < 11; gk++) GH.push(Math.round(112 * Math.pow(.76, gk))); // 11 bậc rất nhỏ → không lộ mép dải
    var SP = 64, nV = Math.ceil(W * 1.25 / SP), sStar = rgba(o.node, 1);
    var stars = [];
    for (i = 0; i < Math.round(W / 1280 * 42); i++) stars.push({ x: rnd() * W, y: rnd() * (hy - 40), r: .6 + rnd() * .9, w: .25 + rnd() * .55, p: rnd() * TAU });
    return function (t) {
      var i, k, e;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = sGlow; // quầng sáng chân trời: các dải chồng nhau → đậm dần về vạch
      for (k = 0; k < GH.length; k++) ctx.fillRect(0, hy - GH[k], W, GH[k] + 3);
      // Sao/điểm dữ liệu nhấp nháy chậm phía trên chân trời (alpha là hàm sin của t, không có trạng thái).
      ctx.fillStyle = sStar;
      for (i = 0; i < stars.length; i++) {
        var st = stars[i], q = .5 + .5 * Math.sin(t * st.w + st.p);
        ctx.globalAlpha = (L ? .08 : .06) + (L ? .2 : .26) * q * q * q;
        ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Đường dọc hội tụ về điểm tụ, chia đoạn theo độ sâu, đoạn càng xa càng mờ.
      ctx.lineWidth = 1;
      for (k = 0; k < sV.length; k++) {
        ctx.strokeStyle = sV[k]; ctx.beginPath();
        for (i = -nV; i <= nV; i++) {
          var dx = i * SP;
          ctx.moveTo(cx + dx * EV[k], hy + D * EV[k]); ctx.lineTo(cx + dx * EV[k + 1], hy + D * EV[k + 1]);
        }
        ctx.stroke();
      }
      // Đường ngang: độ sâu z giảm đều theo t (tuần hoàn 1 ô) → sàn trôi về phía người xem, nối tiếp liền mạch.
      var u = pmod(t * .3, 1);
      for (i = 0; i < 90; i++) {
        e = 1 / (1 + (i + 1 - u) * .36);
        if (e < .028) break;
        var y = hy + D * e;
        if (y > H + 1) continue;
        ctx.strokeStyle = rgba(o.edge, a * Math.pow(e, 1.05)); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.strokeStyle = hg; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(W, hy); ctx.stroke();
      ctx.restore();
    };
  }

  /* ---------- 4. Mưa nhị phân: cột chữ số 0/1 rơi thưa, đầu cột sáng hơn ---------- */
  function matrix(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 303), L = o.light;
    var CWD = 20, LH = 18, ncol = Math.floor(W / CWD), nrow = Math.ceil(H / LH) + 1;
    var x0 = (W - (ncol - 1) * CWD) / 2, streams = [];
    for (var c = 0; c < ncol; c++) {
      if (rnd() > .3) continue;
      for (var m = rnd() < .25 ? 2 : 1; m > 0; m--) {
        var len = 6 + (rnd() * 13 | 0);
        streams.push({ c: c, x: x0 + c * CWD, sp: 1.6 + rnd() * 2.8, len: len, per: nrow + len + 3 + rnd() * nrow, ph: rnd() * 999 });
      }
    }
    var trailA = L ? .26 : .24, headA = L ? .5 : .55, sTrail = rgba(o.edge, 1), sHead = rgba(o.accent, 1);
    function glyph(c, r, t) { // chữ số đổi thưa thớt, mỗi ô lệch nhịp riêng để không đổi đồng loạt
      return hash01(c, r, Math.floor(t * .45 + hash01(c, r, 7) * 9)) < .5 ? '0' : '1';
    }
    return function (t) {
      var i, r, s, h, top;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.font = MONO; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = sTrail;
      for (i = 0; i < streams.length; i++) {
        s = streams[i]; h = pmod(t * s.sp + s.ph, s.per); top = Math.floor(h) - s.len;
        for (r = Math.min(Math.floor(h) - 1, nrow - 1); r > top && r >= 0; r--) {
          var d = h - r;
          ctx.globalAlpha = trailA * Math.pow(1 - d / (s.len + 1), 1.4);
          ctx.fillText(glyph(s.c, r, t), s.x, r * LH + LH / 2);
        }
      }
      ctx.fillStyle = sHead;
      for (i = 0; i < streams.length; i++) {
        s = streams[i]; h = pmod(t * s.sp + s.ph, s.per); r = Math.floor(h);
        if (r >= nrow) continue;
        ctx.globalAlpha = headA * clamp((h - r) * 2.5, .3, 1); // ô đầu mới hiện sáng dần nhanh, tránh nháy
        ctx.fillText(glyph(s.c, r, t), s.x, r * LH + LH / 2);
      }
      ctx.restore();
    };
  }

  /* ---------- 5. Sóng dữ liệu: dải lụa nhiều sợi uốn lượn, xoắn nhẹ, gói dữ liệu chạy dọc sợi ---------- */
  function waves(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 404), L = o.light, STEP = 8;
    function ribbon(cy, amp, spread, n, col, aEdge, aIn, nPk) {
      var rb = {
        cy: cy * H, A: [amp, amp * .5, amp * .22], S: spread, n: n, col: col,
        K: [TAU / (1100 + rnd() * 500), TAU / (480 + rnd() * 200), TAU / (230 + rnd() * 80)],
        V: [.2 + rnd() * .1, -(.27 + rnd() * .12), .38 + rnd() * .15], P: [rnd() * TAU, rnd() * TAU, rnd() * TAU],
        tk: TAU / (760 + rnd() * 380), tv: .16 + rnd() * .1, tp: rnd() * TAU, styles: [], pk: []
      };
      for (var i = 0; i < n; i++) { var e = Math.abs(2 * i / (n - 1) - 1); rb.styles.push(rgba(col, aIn + (aEdge - aIn) * e * e * e)); }
      for (i = 0; i < nPk; i++) rb.pk.push({ u: rnd() < .6 ? (rnd() < .5 ? 0 : 1) : rnd(), x0: rnd() * (W + 300), v: 45 + rnd() * 75 });
      return rb;
    }
    var nPk = Math.round(W / 1280 * 5);
    var ribs = [ribbon(.66, 46, 84, 18, o.accent, L ? .19 : .2, L ? .07 : .065, nPk + 1), ribbon(.33, 34, 56, 12, o.accent2, L ? .15 : .17, .05, nPk)];
    var NP = Math.ceil((W + 40) / STEP) + 1, base = new Float64Array(NP), twa = new Float64Array(NP);
    var sDot = rgba(o.node, L ? .55 : .6), sTail = rgba(o.node, L ? .2 : .24);
    function yAt(rb, x, u, t) {
      var b = rb.cy + rb.A[0] * Math.sin(x * rb.K[0] + t * rb.V[0] + rb.P[0]) + rb.A[1] * Math.sin(x * rb.K[1] + t * rb.V[1] + rb.P[1]) + rb.A[2] * Math.sin(x * rb.K[2] + t * rb.V[2] + rb.P[2]);
      return b + (u - .5) * rb.S * Math.sin(x * rb.tk + t * rb.tv + rb.tp + u * .9);
    }
    return function (t) {
      var r, i, k, x, rb;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      for (r = 0; r < ribs.length; r++) {
        rb = ribs[r];
        for (k = 0; k < NP; k++) { // phần chung của mọi sợi trong dải: tính một lần mỗi cột x
          x = -20 + k * STEP;
          base[k] = rb.cy + rb.A[0] * Math.sin(x * rb.K[0] + t * rb.V[0] + rb.P[0]) + rb.A[1] * Math.sin(x * rb.K[1] + t * rb.V[1] + rb.P[1]) + rb.A[2] * Math.sin(x * rb.K[2] + t * rb.V[2] + rb.P[2]);
          twa[k] = x * rb.tk + t * rb.tv + rb.tp;
        }
        for (i = 0; i < rb.n; i++) {
          var u = i / (rb.n - 1), off = (u - .5) * rb.S, ph = u * .9;
          ctx.strokeStyle = rb.styles[i]; ctx.beginPath();
          for (k = 0; k < NP; k++) { var y = base[k] + off * Math.sin(twa[k] + ph); if (k) ctx.lineTo(-20 + k * STEP, y); else ctx.moveTo(-20, y); }
          ctx.stroke();
        }
      }
      // Gói dữ liệu: chạy trái → phải theo t (tuần hoàn), vệt ngắn phía sau.
      ctx.lineWidth = 1.4; ctx.strokeStyle = sTail; ctx.beginPath();
      for (r = 0; r < ribs.length; r++) for (i = 0; i < ribs[r].pk.length; i++) {
        var pk = ribs[r].pk[i], hx = pmod(pk.x0 + t * pk.v, W + 300) - 150;
        ctx.moveTo(hx - 34, yAt(ribs[r], hx - 34, pk.u, t));
        for (k = 1; k <= 4; k++) ctx.lineTo(hx - 34 + k * 8.5, yAt(ribs[r], hx - 34 + k * 8.5, pk.u, t));
      }
      ctx.stroke();
      ctx.fillStyle = sDot; ctx.beginPath();
      for (r = 0; r < ribs.length; r++) for (i = 0; i < ribs[r].pk.length; i++) {
        pk = ribs[r].pk[i]; hx = pmod(pk.x0 + t * pk.v, W + 300) - 150;
        var hy = yAt(ribs[r], hx, pk.u, t);
        ctx.moveTo(hx + 2, hy); ctx.arc(hx, hy, 2, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    };
  }

  /* ---------- 6. Tổ ong lục giác: ô lục giác mảnh, dải sáng quét chéo và vài ô nhấp nháy ---------- */
  function hex(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 505), L = o.light;
    var R = 30, HW = R * 1.5, HH = Math.sqrt(3) * R, ri = R - 3;
    var VX = [], VY = [];
    for (var v = 0; v < 6; v++) { VX.push(Math.cos(v * TAU / 6) * ri); VY.push(Math.sin(v * TAU / 6) * ri); }
    var p1 = rnd() * TAU, p2 = rnd() * TAU, cells = [], baseB = [[], [], []];
    for (var c = -1; c <= Math.ceil(W / HW) + 1; c++) for (var r = -1; r <= Math.ceil(H / HH) + 1; r++) {
      var x = c * HW, y = r * HH + (c & 1 ? HH / 2 : 0);
      // Độ đậm nền thay đổi theo vùng (sóng chậm theo không gian) để lưới không đều tăm tắp như giấy kẻ.
      var m = .5 + .25 * Math.sin(x * .0043 + p1 + Math.sin(y * .0061 + p2)) + .25 * Math.sin(y * .0052 - x * .0021 + p2) + (rnd() - .5) * .3;
      if (m < .12) continue;
      var cell = { x: x, y: y, lit: rnd() < .5, tw: rnd() < .07 ? { w: .35 + rnd() * .5, p: rnd() * TAU } : null };
      cells.push(cell); baseB[m < .45 ? 0 : m < .75 ? 1 : 2].push(cell);
    }
    var sBase = [rgba(o.edge, .045), rgba(o.edge, .075), rgba(o.edge, .11)];
    var NL = 5, lvF = [], lvS = [], lv = [];
    for (var b = 0; b < NL; b++) { var f = (b + 1) / NL; lvF.push(rgba(o.accent, .075 * f)); lvS.push(rgba(o.accent, (L ? .36 : .34) * f)); lv.push([]); }
    // Hướng quét chéo cố định; bước sóng 640 px → luôn có 2–3 dải trong khung ở mọi thời điểm (kể cả t = 0).
    var dx = .82, dy = .57, LAM = 640, SPD = 34;
    function path(list) { for (var i = 0; i < list.length; i++) { var q = list[i]; ctx.moveTo(q.x + VX[0], q.y + VY[0]); for (var k = 1; k < 6; k++) ctx.lineTo(q.x + VX[k], q.y + VY[k]); ctx.closePath(); } }
    return function (t) {
      var i, b;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1; ctx.lineJoin = 'round';
      for (b = 0; b < 3; b++) { ctx.strokeStyle = sBase[b]; ctx.beginPath(); path(baseB[b]); ctx.stroke(); }
      for (b = 0; b < NL; b++) lv[b].length = 0;
      for (i = 0; i < cells.length; i++) {
        var q = cells[i], I = 0;
        if (q.lit) { var w = .5 + .5 * Math.cos(TAU * ((q.x * dx + q.y * dy) - t * SPD) / LAM); w *= w; w *= w; I = w * w * w; }
        if (q.tw) { var s = .5 + .5 * Math.sin(t * q.tw.w + q.tw.p); s = s * s * s * s; if (s > I) I = s; }
        if (I > .1) lv[Math.min(NL - 1, Math.floor(I * NL))].push(q);
      }
      for (b = 0; b < NL; b++) {
        if (!lv[b].length) continue;
        ctx.beginPath(); path(lv[b]);
        ctx.fillStyle = lvF[b]; ctx.fill(); ctx.strokeStyle = lvS[b]; ctx.stroke();
      }
      ctx.restore();
    };
  }

  /* ---------- 7. Ma trận điểm: lưới chấm LED, vòng gợn sóng lan ra từ vài tâm trôi chậm ---------- */
  function dots(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 606), L = o.light;
    // Lưới so le (hàng lẻ lệch nửa bước, hàng cách S·√3/2): vòng tròn hiện ra tròn đều, lưới vuông làm vòng thành ô vuông.
    var S = 20, RS = S * .866, nx = Math.floor(W / S) + 2, ny = Math.floor(H / RS) + 1, N = nx * ny;
    var x0 = (W - (nx - 1) * S) / 2, y0 = (H - (ny - 1) * RS) / 2;
    var X = new Float32Array(N), Y = new Float32Array(N), i, b;
    for (i = 0; i < N; i++) { var row = Math.floor(i / nx); X[i] = x0 + (i % nx) * S + (row & 1 ? S / 2 : 0); Y[i] = y0 + row * RS; }
    // Số tâm theo bề rộng; mỗi tâm trôi trong "làn" ngang riêng để các cụm gợn không dồn về một chỗ.
    var NS = Math.max(3, Math.round(W / 1280 * 4)), src = [];
    for (i = 0; i < NS; i++) src.push({ lx: (i + .5) / NS, ax: .4 / NS, fx: .04 + rnd() * .035, fy: .045 + rnd() * .04, px: rnd() * TAU, py: rnd() * TAU, ph: rnd() * TAU });
    var NB = 8, RAD = [], STY = [], bk = [], cnt = new Int32Array(NB);
    for (b = 0; b < NB; b++) {
      var f = b / (NB - 1);
      RAD.push(.75 + 1.5 * f);
      STY.push(rgba(b > 4 ? o.accent : o.node, (L ? .085 : .075) + (L ? .4 : .42) * Math.pow(f, 1.5)));
      bk.push(new Int32Array(N));
    }
    var K = TAU / 130, OM = 1.5, R0 = 1 / 190, sx = new Float64Array(NS), sy = new Float64Array(NS);
    return function (t) {
      var c;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      for (c = 0; c < NS; c++) {
        sx[c] = W * (src[c].lx + src[c].ax * Math.sin(t * src[c].fx + src[c].px));
        sy[c] = H * (.5 + .32 * Math.sin(t * src[c].fy + src[c].py));
      }
      for (b = 0; b < NB; b++) cnt[b] = 0;
      for (i = 0; i < N; i++) {
        var v = 0;
        for (c = 0; c < NS; c++) {
          var ddx = X[i] - sx[c], ddy = Y[i] - sy[c], d2 = ddx * ddx + ddy * ddy;
          // Gợn chỉ sống trong bán kính ~400 px: vòng quá lớn trông như sọc thẳng, và bỏ qua phần xa cho nhanh.
          if (d2 > 160000) continue;
          var d = Math.sqrt(d2), w = .5 + .5 * Math.cos(d * K - t * OM + src[c].ph);
          w *= w; // đỉnh hẹp hơn đáy nhưng vẫn mượt → vòng sóng mềm, không vỡ thành bậc
          v += w * Math.exp(-d * R0) * (1 - Math.exp(-d * .03)); // tắt sát tâm để không thành chấm sáng to
        }
        b = Math.min(NB - 1, Math.floor(clamp(v * 1.7, 0, .999) * NB));
        bk[b][cnt[b]++] = i;
      }
      for (b = 0; b < NB; b++) {
        if (!cnt[b]) continue;
        var rr = RAD[b], arr = bk[b];
        ctx.fillStyle = STY[b]; ctx.beginPath();
        for (var j = 0; j < cnt[b]; j++) { var k = arr[j]; ctx.moveTo(X[k] + rr, Y[k]); ctx.arc(X[k], Y[k], rr, 0, TAU); }
        ctx.fill();
      }
      ctx.restore();
    };
  }

  /* ---------- 8. Quỹ đạo: elip đồng tâm nghiêng (nửa sau mờ hơn tạo chiều sâu), vệ tinh kèm vệt sáng ---------- */
  function orbits(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 707), L = o.light;
    var cx = W * .64, cy = H * .54, rot = -.34, FL = .4;
    var cr = Math.cos(rot), sr = Math.sin(rot), rings = [];
    var RS = [.15, .26, .39, .54, .71, .9, 1.12];
    for (var i = 0; i < RS.length; i++) {
      var rx = RS[i] * H * 1.05, sats = [], ns = i === 0 ? 1 : 1 + (rnd() < .45 ? 1 : 0);
      for (var j = 0; j < ns; j++) sats.push({ a0: rnd() * TAU, s: 1.6 + rnd() * 1.2 });
      rings.push({ rx: rx, ry: rx * FL, w: .5 * Math.pow(140 / rx, 1.1), dash: i % 3 === 1, ticks: i === 3, sats: sats, a: (L ? .13 : .14) - i * .008 });
    }
    var halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70);
    halo.addColorStop(0, rgba(o.accent, L ? .1 : .16)); halo.addColorStop(1, rgba(o.accent, 0));
    var sNode = rgba(o.node, L ? .55 : .6), sTick = rgba(o.edge, L ? .14 : .15);
    var TR = [rgba(o.accent, .36), rgba(o.accent, .22), rgba(o.accent, .12), rgba(o.accent, .05)];
    function pt(rg, a) { var ex = rg.rx * Math.cos(a), ey = rg.ry * Math.sin(a); return [cx + ex * cr - ey * sr, cy + ex * sr + ey * cr]; }
    return function (t) {
      var i, rg, k;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      for (i = 0; i < rings.length; i++) {
        rg = rings[i];
        if (rg.dash) { ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 7; }
        // Nửa sau (sin < 0, phía trên sau khi nghiêng) mờ hơn → cảm giác mặt phẳng quỹ đạo có chiều sâu.
        ctx.strokeStyle = rgba(o.edge, rg.a * .5); ctx.beginPath(); ctx.ellipse(cx, cy, rg.rx, rg.ry, rot, Math.PI, TAU); ctx.stroke();
        ctx.strokeStyle = rgba(o.edge, rg.a); ctx.beginPath(); ctx.ellipse(cx, cy, rg.rx, rg.ry, rot, 0, Math.PI); ctx.stroke();
        if (rg.dash) ctx.setLineDash([]);
        if (rg.ticks) { // vạch chia kiểu mặt đồng hồ HUD, xoay rất chậm
          ctx.strokeStyle = sTick; ctx.beginPath();
          for (k = 0; k < 96; k++) {
            var a = k * TAU / 96 + t * .025, p = pt(rg, a), ext = k % 8 === 0 ? 1.06 : 1.025;
            var q = pt({ rx: rg.rx * ext, ry: rg.ry * ext }, a);
            ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
          }
          ctx.stroke();
        }
      }
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, TAU); ctx.fill();
      ctx.fillStyle = sNode; ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = rgba(o.node, L ? .22 : .25); ctx.beginPath(); ctx.arc(cx, cy, 9, 0, TAU); ctx.stroke();
      // Vệ tinh: góc = góc đầu + ω·t (vòng trong nhanh hơn), vệt = cung elip phía sau chia 4 mức mờ.
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (k = 0; k < 4; k++) {
        ctx.strokeStyle = TR[k]; ctx.beginPath();
        for (i = 0; i < rings.length; i++) {
          rg = rings[i];
          var span = Math.min(.55, 90 / rg.rx) / 4;
          for (var s = 0; s < rg.sats.length; s++) {
            var th = rg.sats[s].a0 + t * rg.w;
            var e0 = th - span * (k + 1), e1 = th - span * k, ps = pt(rg, e0);
            ctx.moveTo(ps[0], ps[1]); ctx.ellipse(cx, cy, rg.rx, rg.ry, rot, e0, e1);
          }
        }
        ctx.stroke();
      }
      ctx.fillStyle = sNode;
      for (i = 0; i < rings.length; i++) {
        rg = rings[i];
        for (s = 0; s < rg.sats.length; s++) {
          var th2 = rg.sats[s].a0 + t * rg.w, d = .5 + .5 * Math.sin(th2), ps2 = pt(rg, th2);
          ctx.globalAlpha = .45 + .55 * d; // phía trước to và sáng hơn
          ctx.beginPath(); ctx.arc(ps2[0], ps2[1], rg.sats[s].s * (.7 + .5 * d), 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    };
  }

  /* ---------- 9. Dòng hạt: hạt trôi theo trường dòng chảy, vệt đuôi ngắn; vị trí là hàm dạng đóng của t ---------- */
  function particles(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 808), L = o.light;
    var M = 220, J = 6, n = Math.round(W / 1280 * 150), SLOPE = .12, ps = [];
    var F = { k1: TAU / 560, k2: TAU / 300, q1: .0035, q2: .006, A1: 44, A2: 19, w1: .11, w2: -.16, p1: rnd() * TAU, p2: rnd() * TAU };
    for (var i = 0; i < n; i++) {
      var near = rnd() < .35;
      ps.push({ near: near, x0: rnd() * (W + M), y0: -.12 * H + rnd() * (H * 1.24 + W * SLOPE), v: near ? 34 + rnd() * 30 : 16 + rnd() * 20, len: near ? 70 + rnd() * 50 : 34 + rnd() * 30 });
    }
    var PX = new Float32Array(n * (J + 1)), PY = new Float32Array(n * (J + 1));
    var LAY = [{ near: false, a: .2, w: .9, r: 1, ad: L ? .32 : .34 }, { near: true, a: L ? .32 : .34, w: 1.3, r: 1.6, ad: L ? .5 : .55 }];
    LAY.forEach(function (ly) {
      ly.seg = []; for (var j = 0; j < J; j++) ly.seg.push(rgba(j < 2 ? o.accent : o.edge, ly.a * Math.pow(1 - j / J, 1.5)));
      ly.dot = rgba(o.node, ly.ad);
    });
    // Đường dòng: y = y0 − x·dốc + tổng sin của (x, y0, t). Phụ thuộc mượt vào y0 → các hạt lân cận đi cùng luồng.
    function fy(x, y0, t) { return y0 - x * SLOPE + F.A1 * Math.sin(x * F.k1 + y0 * F.q1 + t * F.w1 + F.p1) + F.A2 * Math.sin(x * F.k2 - y0 * F.q2 + t * F.w2 + F.p2); }
    return function (t) {
      var i, j, p, b, ly;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      for (i = 0; i < n; i++) {
        p = ps[i]; var hx = pmod(p.x0 + t * p.v, W + M) - M / 2;
        for (j = 0; j <= J; j++) { var x = hx - j * p.len / J; PX[i * (J + 1) + j] = x; PY[i * (J + 1) + j] = fy(x, p.y0, t); }
      }
      ctx.lineCap = 'round';
      for (var l = 0; l < 2; l++) {
        ly = LAY[l]; ctx.lineWidth = ly.w;
        for (j = 0; j < J; j++) { // gom cùng một đoạn đuôi của mọi hạt vào một nét → 2 × J lệnh stroke mỗi khung
          ctx.strokeStyle = ly.seg[j]; ctx.beginPath();
          for (i = 0; i < n; i++) {
            if (ps[i].near !== ly.near) continue;
            b = i * (J + 1) + j; ctx.moveTo(PX[b], PY[b]); ctx.lineTo(PX[b + 1], PY[b + 1]);
          }
          ctx.stroke();
        }
        ctx.fillStyle = ly.dot; ctx.beginPath();
        for (i = 0; i < n; i++) {
          if (ps[i].near !== ly.near) continue;
          b = i * (J + 1); ctx.moveTo(PX[b] + ly.r, PY[b]); ctx.arc(PX[b], PY[b], ly.r, 0, TAU);
        }
        ctx.fill();
      }
      ctx.restore();
    };
  }

  /* ---------- 10. Radar: vòng tròn đồng tâm, vạch chia, tia quét kèm vệt quạt mờ, mục tiêu loé khi tia quét qua ---------- */
  function radar(ctx, o) {
    var W = o.w, H = o.h, rnd = rndFor(o, 909), L = o.light;
    var cx = W * .7, cy = H * .58, R = H * .74, OM = TAU / 8, A0 = -Math.PI * .3, WEDGE = 1.15, NS = 26;
    var blips = [];
    for (var i = 0, nb = Math.round(22 + W / 1280 * 6); i < nb; i++) {
      var rr = R * (.14 + .82 * Math.sqrt(rnd())), th = rnd() * TAU;
      blips.push({ x: cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr, th: th, s: .8 + rnd() * .7 });
    }
    var sRing = rgba(o.edge, .1), sRingO = rgba(o.edge, .17), sAxis = rgba(o.edge, .06);
    var sTick = rgba(o.edge, .16), sSweep = rgba(o.accent, L ? .4 : .45), sBlip = rgba(o.accent, 1);
    var wedge = [];
    for (i = 0; i < NS; i++) { var f = 1 - i / NS; wedge.push(rgba(o.accent, (L ? .07 : .085) * f * f)); }
    return function (t) {
      var k, a;
      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      ctx.strokeStyle = sRing; ctx.beginPath();
      for (k = 1; k < 6; k++) { ctx.moveTo(cx + R * k / 6, cy); ctx.arc(cx, cy, R * k / 6, 0, TAU); }
      ctx.stroke();
      ctx.strokeStyle = sRingO; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = sAxis; ctx.beginPath();
      for (k = 0; k < 4; k++) { a = k * Math.PI / 4; ctx.moveTo(cx - Math.cos(a) * R, cy - Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
      ctx.stroke();
      ctx.strokeStyle = sTick; ctx.beginPath();
      for (k = 0; k < 120; k++) {
        a = k * TAU / 120; var l = k % 10 === 0 ? 14 : k % 5 === 0 ? 8 : 4;
        ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l));
      }
      ctx.stroke();
      // Tia quét: góc = A0 + ω·t; quạt mờ phía sau ghép từ NS hình quạt mảnh (không cần conic gradient).
      var A = A0 + t * OM, ds = WEDGE / NS;
      for (k = 0; k < NS; k++) {
        ctx.fillStyle = wedge[k]; ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, A - (k + 1) * ds, A - k * ds + .002); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = sSweep; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(A) * R, cy + Math.sin(A) * R); ctx.stroke();
      // Mục tiêu: độ sáng giảm theo góc đã quét qua kể từ lần chạm gần nhất → hoàn toàn suy ra từ t.
      ctx.fillStyle = sBlip; ctx.strokeStyle = sBlip; ctx.lineWidth = 1;
      for (k = 0; k < blips.length; k++) {
        var bp = blips[k], dl = pmod(A - bp.th, TAU), e = Math.exp(-dl * 1.1);
        ctx.globalAlpha = (L ? .14 : .12) + .5 * e;
        ctx.beginPath(); ctx.arc(bp.x, bp.y, (1.3 + 1.3 * e) * bp.s, 0, TAU); ctx.fill();
        if (dl < 1.4) { // vòng "ping" lan ra rồi tắt
          ctx.globalAlpha = .34 * (1 - dl / 1.4);
          ctx.beginPath(); ctx.arc(bp.x, bp.y, 3 + dl * 12, 0, TAU); ctx.stroke();
        }
      }
      ctx.restore();
    };
  }

  var BUILD = { network: network, circuit: circuit, grid: grid, matrix: matrix, waves: waves, hex: hex, dots: dots, orbits: orbits, particles: particles, radar: radar };

  function create(ctx, opts) {
    opts = opts || {};
    var cv = ctx && ctx.canvas;
    var seed = Math.floor(+opts.seed);
    var o = {
      name: BUILD.hasOwnProperty(opts.name) ? opts.name : 'network',
      w: Math.max(1, Math.round(+opts.width || (cv && cv.width) || 1280)),
      h: Math.max(1, Math.round(+opts.height || (cv && cv.height) || 720)),
      node: colorOf(opts.node, '160,220,255'), edge: colorOf(opts.edge, '46,230,214'),
      light: !!opts.light, seed: seed > 0 ? seed : 7
    };
    o.accent = colorOf(opts.accent, o.edge); o.accent2 = colorOf(opts.accent2, o.node);
    var draw = BUILD[o.name](ctx, o);
    return { name: o.name, draw: function (t) { t = +t; draw(isFinite(t) ? t : 0); } };
  }

  g.DeckBg = { NAMES: NAMES.slice(), LABELS: LABELS, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
