/* MISA Presentation — engine chuyển động (chạy trong trang bài trình bày, script cổ điển, không phụ thuộc thư viện).
   Kiểu Remotion: mỗi khung hình f (30fps) → spring/interpolate → transform/opacity. Không dùng CSS animation
   để có thể "tua" tới khung cuối khi chụp thumbnail / in PDF.
   Chế độ: present (mặc định) · still (?still&slide=N — 1 slide, khung cuối) · print (mọi slide, khung cuối).
   API cho trình duyệt tự động: window.__deck = { count, ready, goto(i, frame) }.
   Nhúng trong khung xem trước: nhận postMessage {type:'deck:goto', index}, gửi {type:'deck:slide', index, count}
   và {type:'deck:video', provider, id|src, title} khi bấm video (khung sandbox không phát được YouTube → ứng dụng mở lớp phát).
   Mẫu nền chuyển động: window.DeckBg (shared/deck/backgrounds.js, được ghép trước engine).
   Chế độ edit (data-mode="edit", chỉ khung xem trước của trình soạn thảo): khung cuối tĩnh, sửa chữ trực tiếp (data-e →
   contenteditable, gửi {type:'deck:edit'}), bấm ảnh/video để đổi ({type:'deck:media'}), chọn/kéo/đổi kích thước phần tử trang
   tự do ({type:'deck:select'|'deck:geom'|'deck:el'}), Ctrl/Cmd+S ({type:'deck:save'}), nhận {type:'deck:render'} để dựng lại slide từ bản nháp chưa lưu. */
(function () {
  'use strict';
  var deck = document.getElementById('deck');
  if (!deck) return;
  var W = +deck.getAttribute('data-w') || 2560;
  var H = +deck.getAttribute('data-h') || 1440;
  var FPS = 30;
  var qs = new URLSearchParams(location.search);
  var DM = deck.getAttribute('data-mode');
  var MODE = DM === 'print' ? 'print' : DM === 'edit' ? 'edit' : DM === 'still' || qs.has('still') || qs.has('export') ? 'still' : 'present';
  // Nonce của chính script này — dùng cho thẻ style tạo động ở chế độ edit (CSP chỉ cho style có nonce).
  var NONCE = (document.currentScript && document.currentScript.nonce) || '';
  var frozen = null; // khung hình bị khoá bởi __deck.goto (chụp ảnh) — vòng lặp present sẽ không ghi đè
  var EMBED = window.parent !== window;
  var REDUCE = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var slides = Array.prototype.slice.call(deck.querySelectorAll('.slide'));
  var N = slides.length;
  var FINAL = 9000;

  function clamp(v, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.min(b, Math.max(a, v)); }
  function easeInOut(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function spring(f, damping, stiffness) {
    if (f <= 0) return 0;
    var t = f / FPS, w0 = Math.sqrt(stiffness), z = damping / (2 * Math.sqrt(stiffness));
    if (z < 1) { var wd = w0 * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + (z * w0 / wd) * Math.sin(wd * t)); }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  }

  /* ---------- tách từ cho tiêu đề chạy chữ ---------- */
  function splitWords(root) {
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(p));
            else { var s = document.createElement('span'); s.className = 'w'; s.textContent = p; frag.appendChild(s); }
          });
          n.parentNode.replaceChild(frag, n);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    })(root);
  }

  /* ---------- tự co chữ khi tràn (giảm --k của slide) ---------- */
  function overflowing(el) { return el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2; }
  function fitSlide(s) {
    var boxes = s.querySelectorAll('.body');
    var k = 1;
    s.style.setProperty('--k', '1');
    // Chỉ đo vùng .body (mọi layout đều bọc nội dung trong .body); đồ hoạ trang trí tràn mép không tính.
    var check = function () {
      for (var i = 0; i < boxes.length; i++) if (overflowing(boxes[i])) return true;
      return false;
    };
    while (k > 0.5 && check()) { k = Math.round((k - 0.04) * 100) / 100; s.style.setProperty('--k', String(k)); }
  }
  // Trang tự do: chữ/bảng tràn khung phần tử → co hệ số --fk của riêng phần tử đó (tối thiểu 0,4).
  function fitFree(fe) {
    if (!fe.classList.contains('fe-text') && !fe.classList.contains('fe-table')) return;
    var k = 1;
    fe.style.setProperty('--fk', '1');
    while (k > 0.4 && fe.scrollHeight > fe.clientHeight + 2) { k = Math.round((k - 0.05) * 100) / 100; fe.style.setProperty('--fk', String(k)); }
  }
  function fitSlideAll(s) { fitSlide(s); Array.prototype.forEach.call(s.querySelectorAll('.fe'), fitFree); }
  function fitAll() { slides.forEach(fitSlideAll); }

  /* ---------- timeline từng slide ---------- */
  var nf = new Intl.NumberFormat('vi-VN');
  function buildTimelines() {
    return slides.map(function (slide) {
      var map = new Map();
      function get(el) { if (!map.has(el)) map.set(el, { el: el, an: null, lp: null }); return map.get(el); }
      slide.querySelectorAll('[data-a]').forEach(function (el) {
        var a = el.getAttribute('data-a');
        var d = +(el.getAttribute('data-d') || 0);
        // Chế độ sửa: giữ nguyên DOM chữ (không tách từ, không đếm số) để contenteditable sửa đúng nội dung.
        if (MODE === 'edit' && (a === 'words' || a === 'count')) return;
        if (a === 'words') {
          splitWords(el);
          var st = +(el.getAttribute('data-s') || 3);
          el.querySelectorAll('.w').forEach(function (w, i) { get(w).an = { a: 'word', d: d + i * st }; });
          return;
        }
        var an = { a: a, d: d, dur: +(el.getAttribute('data-dur') || 24), dist: +(el.getAttribute('data-dist') || 70) };
        if (a === 'draw') { el.style.strokeDasharray = '1 1'; }
        if (a === 'bar' || a === 'grow' || a === 'ring') { an.to = +(el.getAttribute('data-to') || 100); }
        if (a === 'count') {
          an.to = +(el.getAttribute('data-to') || 0); an.dec = +(el.getAttribute('data-dec') || 0); an.dur = +(el.getAttribute('data-dur') || 48);
          an.fmt = new Intl.NumberFormat('vi-VN', { minimumFractionDigits: an.dec, maximumFractionDigits: an.dec }); an.last = null;
        }
        get(el).an = an;
      });
      slide.querySelectorAll('[data-loop]').forEach(function (el) {
        get(el).lp = { k: el.getAttribute('data-loop'), p: +(el.getAttribute('data-p') || 10), amp: +(el.getAttribute('data-amp') || 10), ph: +(el.getAttribute('data-ph') || 0), dir: +(el.getAttribute('data-dir') || 1) };
      });
      return Array.from(map.values());
    });
  }
  var timelines = [];

  /* ---------- trình chiếu từng ý (data-build trên slide) + phóng to khi bấm ---------- */
  // Đơn vị nội dung theo bố cục (khối ngoài cùng, không tính tiêu đề/trang tự do). Thứ tự = thứ tự trong trang.
  var UNIT = '.ag-i,.tile,.path-i,.bi,.card,.crow,.stat,.st-hero,.st-row,.st-bar,.st-ring,.pola,.gal>.media,.tl-step,.tz-i,.ps,.tlv-i,.chev-i,.stair,.col';
  // Phần tử phóng to được khi bấm (video không — bấm video để phát).
  var ZOOM = '.card,.stat,.st-hero,.st-row,.st-ring,.st-bar,.col,.ps,.stair,.tl-step,.tz-i,.chev-i,.tile,.crow,.panel.bi,.pola,figure.media:not(.vid),.fe-image,.fe-table';
  var BUILDS = { step: 1, dim: 1, tour: 1 };
  var STEPS = [], SF = []; // STEPS[i] = { mode, units[], max } · SF[i][k] = khung bắt đầu của ý k (null = theo nhịp gốc)
  function outer(list, sl) { return list.filter(function (el) { var p = el.parentElement && el.parentElement.closest(UNIT); return !p || !sl.contains(p); }); }
  function buildSteps() {
    STEPS = slides.map(function (sl, i) {
      var b = sl.getAttribute('data-build');
      var units = [];
      if (BUILDS[b] && !sl.classList.contains('L-free')) {
        units = outer(Array.prototype.filter.call(sl.querySelectorAll(UNIT), function (el) { return !el.closest('.head,.free'); }), sl);
      }
      units = units.concat(Array.prototype.slice.call(sl.querySelectorAll('.fe[data-step]')));
      if (!units.length) return null;
      var mode = BUILDS[b] ? b : 'step';
      units.forEach(function (u, k) { u.setAttribute('data-u', String(k + 1)); });
      // Gắn ý cho từng phần tử chuyển động + khung trễ nhỏ nhất của ý (để ý hiện ngay khi bấm).
      var minD = {};
      (timelines[i] || []).forEach(function (it) {
        for (var k = 0; k < units.length; k++) if (units[k].contains(it.el)) { it.u = k + 1; break; }
        if (it.u && it.an) minD[it.u] = Math.min(minD[it.u] === undefined ? 1e9 : minD[it.u], it.an.d);
      });
      (timelines[i] || []).forEach(function (it) { if (it.u) it.m = minD[it.u] || 0; });
      return { mode: mode, units: units, max: mode === 'tour' ? units.length + 1 : units.length };
    });
  }
  function markZoom() {
    slides.forEach(function (sl) {
      Array.prototype.forEach.call(sl.querySelectorAll(ZOOM), function (el) {
        if (el.closest('.vid') || el.querySelector('.vid')) return;
        var w = el.offsetWidth, h = el.offsetHeight;
        if (w > 0 && h > 0 && Math.min(0.82 * W / w, 0.8 * H / h, 3) >= 1.15) el.setAttribute('data-z', '');
      });
    });
  }

  function render(i, f, t) {
    if (t === undefined) t = f / FPS;
    var list = timelines[i] || [];
    for (var n = 0; n < list.length; n++) {
      var it = list[n], el = it.el, tf = '', op = null, fl = null, s, A = it.an;
      if (A) {
        var lf = f - A.d;
        // Ý hiện khi bấm: tính thời gian từ lúc bấm (giữ khoảng trễ tương đối giữa các phần trong cùng ý).
        if (it.u && SF[i]) { var sf = SF[i][it.u]; if (sf !== undefined && sf !== null) lf = f - sf - (A.d - it.m); }
        switch (A.a) {
          case 'up': case 'down': case 'left': case 'right': {
            s = spring(lf, 15, 120);
            var dx = A.a === 'left' ? -A.dist : A.a === 'right' ? A.dist : 0;
            var dy = A.a === 'up' ? A.dist : A.a === 'down' ? -A.dist : 0;
            op = clamp(s * 1.3); if (s < 0.999) tf += 'translate(' + (dx * (1 - s)).toFixed(2) + 'px,' + (dy * (1 - s)).toFixed(2) + 'px) ';
            break;
          }
          case 'word':
            s = spring(lf, 14, 150); op = clamp(s * 1.4); if (s < 0.999) tf += 'translateY(' + ((1 - s) * 46).toFixed(2) + 'px) ';
            fl = (1 - clamp(s)) > .02 ? 'blur(' + ((1 - clamp(s)) * 12).toFixed(1) + 'px)' : 'none'; break;
          case 'pop': s = spring(lf, 11, 160); op = clamp(s * 1.6); if (Math.abs(1 - s) > 0.001) tf += 'scale(' + (.55 + .45 * s).toFixed(4) + ') '; break;
          case 'zoom':
            s = spring(lf, 22, 80); op = clamp(s * 1.2); if (Math.abs(1 - s) > 0.001) tf += 'scale(' + (1.22 - .22 * s).toFixed(4) + ') ';
            fl = (1 - clamp(s)) > .02 ? 'blur(' + ((1 - clamp(s)) * 18).toFixed(1) + 'px)' : 'none'; break;
          case 'fade': op = easeOut(clamp(lf / A.dur)); break;
          case 'draw': { var p = easeInOut(clamp(lf / A.dur)); el.style.strokeDashoffset = String(1 - p); op = lf > 0 ? 1 : 0; break; }
          case 'bar': s = spring(lf, 24, 60); el.style.width = (A.to * clamp(s, 0, 1.05)).toFixed(2) + '%'; break;
          // Cột dọc (biểu đồ cột) mọc từ đáy.
          case 'grow': s = spring(lf, 24, 60); el.style.height = (A.to * clamp(s, 0, 1.05)).toFixed(2) + '%'; break;
          // Vòng tiến độ: vòng tròn pathLength=100, stroke-dasharray "P 100" → dashoffset P → 0 vẽ dần cung P%.
          case 'ring': { var q = easeInOut(clamp(lf / A.dur)); el.style.strokeDashoffset = (A.to * (1 - q)).toFixed(2); break; }
          case 'count': {
            var v = A.to * easeOut(clamp(lf / A.dur));
            var txt = A.fmt.format(Math.abs(v - A.to) < 1e-9 ? A.to : v);
            if (txt !== A.last) { el.textContent = txt; A.last = txt; }
            op = lf > -6 ? 1 : 0; break;
          }
        }
      }
      var L = it.lp;
      if (L) {
        var u = t / L.p;
        switch (L.k) {
          case 'spin': tf += 'rotate(' + ((u * 360 * L.dir) % 360).toFixed(2) + 'deg) '; break;
          case 'float': tf += 'translateY(' + (Math.sin(u * 2 * Math.PI + L.ph) * L.amp).toFixed(2) + 'px) '; break;
          case 'pulse': tf += 'scale(' + (1 + Math.sin(u * 2 * Math.PI + L.ph) * L.amp / 100).toFixed(4) + ') '; break;
          case 'kb': tf += 'scale(' + (1.04 + Math.sin(u * 2 * Math.PI + L.ph) * 0.04).toFixed(4) + ') '; break;
          case 'dash': el.style.strokeDashoffset = (-t * L.amp).toFixed(1); break;
        }
      }
      if (tf !== it.tf) { el.style.transform = tf; it.tf = tf; }
      if (op !== null) el.style.opacity = op.toFixed(3);
      if (fl !== null && fl !== it.fl) { el.style.filter = fl; it.fl = fl; }
    }
  }

  /* ---------- nền chuyển động (mẫu theo data-bg, vẽ xác định theo thời gian t) ---------- */
  var cv = document.getElementById('bg');
  var cx = cv && cv.getContext ? cv.getContext('2d') : null;
  var CW = Math.round(W / 2), CH = Math.round(H / 2), painter = null;
  function rgbVar(cs, name, fb) {
    var v = (cs.getPropertyValue(name) || '').trim();
    var m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(','); }
    m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (m) return m[1].split(',').slice(0, 3).map(function (x) { return x.trim(); }).join(',');
    return /^\d+\s*,\s*\d+\s*,\s*\d+$/.test(v) ? v : fb;
  }
  // Nền 3D (gói window.Deck3D, WebGL) vẽ trên canvas riêng #bg3d; không có WebGL/gói 3D → mẫu 2D tương ứng (khớp FALLBACK_2D trong bg3d.js).
  var FALLBACK_2D = { globe3d: 'orbits', terrain3d: 'waves', galaxy3d: 'particles', city3d: 'grid' };
  var cv3 = null, bg3 = null, ptr = { x: 0, y: 0 };
  function drop3d() {
    if (bg3) { try { bg3.dispose(); } catch (e) { /* bỏ qua */ } bg3 = null; }
    if (cv3 && cv3.parentNode) cv3.parentNode.removeChild(cv3);
    cv3 = null;
  }
  function setupPainter() {
    painter = null;
    drop3d();
    var bgName = deck.getAttribute('data-bg') || 'network';
    if (cx) { cv.width = CW; cv.height = CH; cx.clearRect(0, 0, CW, CH); }
    if (bgName === 'none') return;
    var cs = getComputedStyle(document.documentElement);
    var node = rgbVar(cs, '--node', '160,220,255'), edge = rgbVar(cs, '--edge', '46,230,214');
    var o = {
      name: bgName, width: CW, height: CH, node: node, edge: edge,
      accent: rgbVar(cs, '--accent', edge), accent2: rgbVar(cs, '--accent-2', node),
      light: document.documentElement.getAttribute('data-tone') === 'light', seed: 7, still: MODE !== 'present',
    };
    if (FALLBACK_2D[bgName]) {
      if (window.Deck3D) {
        cv3 = document.createElement('canvas');
        cv3.id = 'bg3d'; cv3.setAttribute('aria-hidden', 'true');
        cv.parentNode.insertBefore(cv3, cv.nextSibling);
        try { bg3 = window.Deck3D.createBg3D(cv3, o); } catch (e) { bg3 = null; }
        if (bg3) { painter = bg3; return; }
        drop3d();
      }
      o.name = FALLBACK_2D[bgName];
    }
    if (!cx || !window.DeckBg) return;
    painter = window.DeckBg.create(cx, o);
  }
  setupPainter();
  function drawBg(t) { if (painter) painter.draw(t); }
  // Ảnh tĩnh của nền (in PDF): canvas đang vẽ (3D hoặc 2D).
  function bgSnapshot() { return (bg3 ? cv3 : cv).toDataURL('image/png'); }

  /* ---------- logo nổi khối (phần tử .fe-logo3d): WebGL riêng cho từng logo của slide đang chiếu ---------- */
  var logos = []; // { el, inst, slide }
  function imgReady(img, cb) {
    if (img.complete && img.naturalWidth) { cb(); return; }
    img.addEventListener('load', cb, { once: true });
  }
  function makeLogo(fe, still, cb) {
    var img = fe.querySelector('img');
    if (!img || !window.Deck3D) { cb(null); return; }
    imgReady(img, function () {
      var fig = img.parentNode, c = document.createElement('canvas');
      c.className = 'l3d-cv'; c.setAttribute('aria-hidden', 'true');
      var w = fe.offsetWidth || 400, h = fe.offsetHeight || 400;
      var inst = null;
      try {
        inst = window.Deck3D.createLogo3D(c, img, { width: w, height: h, motion: fe.getAttribute('data-motion'), depth: +fe.getAttribute('data-depth') || 0.5, tint: rgbVar(getComputedStyle(document.documentElement), '--bg1', '20,24,40'), still: still });
      } catch (e) { inst = null; }
      if (!inst) { cb(null); return; }
      fig.appendChild(c); fig.classList.add('on3d');
      cb(inst, c, fig);
    });
  }
  function startLogos(i) {
    var sl = slides[i];
    if (!sl || !window.Deck3D) return;
    Array.prototype.forEach.call(sl.querySelectorAll('.fe-logo3d'), function (fe) {
      if (logos.some(function (l) { return l.el === fe; })) return;
      var rec = { el: fe, inst: null, slide: sl, dead: false };
      logos.push(rec);
      var still = MODE !== 'present' || frozen !== null;
      makeLogo(fe, still, function (inst, c, fig) {
        if (!inst) return;
        if (rec.dead) { inst.dispose(); if (c.parentNode) c.parentNode.removeChild(c); fig.classList.remove('on3d'); return; }
        rec.inst = inst; rec.c = c; rec.fig = fig;
        inst.setPointer(ptr.x, ptr.y);
        if (still) inst.draw(1.4); // khung tĩnh (thumbnail): góc nghiêng đẹp
      });
    });
  }
  function stopLogos(sl) {
    logos = logos.filter(function (l) {
      if (sl && l.slide !== sl) return true;
      l.dead = true;
      if (l.inst) { l.inst.dispose(); if (l.c.parentNode) l.c.parentNode.removeChild(l.c); l.fig.classList.remove('on3d'); }
      return false;
    });
  }
  function drawLogos(t) { for (var k = 0; k < logos.length; k++) if (logos[k].inst && logos[k].slide === slides[cur]) logos[k].inst.draw(t); }
  // In PDF: mỗi logo vẽ 1 khung nghiêng đẹp → thay ảnh bằng ảnh chụp (rồi giải phóng WebGL), lần lượt từng logo.
  function printLogos(done) {
    var list = window.Deck3D ? Array.prototype.slice.call(deck.querySelectorAll('.fe-logo3d')) : [];
    (function nextLogo() {
      var fe = list.shift();
      if (!fe) { done(); return; }
      var finished = false;
      var fin = function () { if (!finished) { finished = true; nextLogo(); } };
      setTimeout(fin, 4000); // ảnh lỗi/không tải được → không treo bản in
      var img = fe.querySelector('img');
      if (!img) { fin(); return; }
      makeLogo(fe, true, function (inst, c, fig) {
        if (!inst) { fin(); return; }
        try { inst.draw(1.4); img.src = c.toDataURL('image/png'); } catch (e) { /* giữ ảnh phẳng */ }
        inst.dispose(); if (c.parentNode) c.parentNode.removeChild(c); fig.classList.remove('on3d');
        imgReady(img, fin);
      });
    })();
  }

  /* ---------- video: bấm ảnh bìa → phát toàn màn hình, tự phát ---------- */
  var ov = null, blobs = {};
  function embedUrl(key) {
    if (blobs[key]) return blobs[key];
    var el = document.getElementById(key);
    if (!el) return null;
    var bin = atob((el.textContent || '').replace(/\s+/g, ''));
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    blobs[key] = URL.createObjectURL(new Blob([u8], { type: el.getAttribute('data-mime') || 'video/mp4' }));
    return blobs[key];
  }
  function closeVideo() {
    if (!ov) return;
    var o = ov; ov = null;
    try { if (document.fullscreenElement === o) document.exitFullscreen(); } catch (e) { /* bỏ qua */ }
    if (o.parentNode) o.parentNode.removeChild(o);
  }
  function playVideo(fig) {
    var vp = fig.getAttribute('data-vp');
    var title = fig.getAttribute('data-title') || 'Video';
    var yt = fig.getAttribute('data-vid') || '';
    if (vp === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(yt)) return;
    if (vp !== 'youtube' && vp !== 'file') return;
    if (EMBED) {
      try { window.parent.postMessage({ type: 'deck:video', provider: vp, id: vp === 'youtube' ? yt : undefined, src: vp === 'file' ? fig.getAttribute('data-src') : undefined, title: title }, '*'); } catch (e) { /* bỏ qua */ }
      return;
    }
    closeVideo();
    ov = document.createElement('div');
    ov.id = 'vov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', title);
    var box = document.createElement('div'); box.className = 'vframe'; ov.appendChild(box);
    var x = document.createElement('button'); x.type = 'button'; x.className = 'vx'; x.setAttribute('aria-label', 'Đóng video'); x.textContent = '×'; ov.appendChild(x);
    x.addEventListener('click', function (e) { e.stopPropagation(); closeVideo(); });
    ov.addEventListener('click', function (e) { e.stopPropagation(); if (e.target === ov) closeVideo(); });
    if (vp === 'youtube') {
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube-nocookie.com/embed/' + yt + '?autoplay=1&rel=0&playsinline=1';
      f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.setAttribute('allowfullscreen', ''); f.title = title;
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      box.appendChild(f);
      // Mở tệp HTML trực tiếp (file://) YouTube có thể từ chối nhúng → luôn có đường mở sang YouTube.
      var a = document.createElement('a'); a.className = 'vyt'; a.target = '_blank'; a.rel = 'noopener';
      a.href = 'https://www.youtube.com/watch?v=' + yt; a.textContent = 'Không phát được? Mở trên YouTube ↗'; ov.appendChild(a);
    } else {
      var v = document.createElement('video');
      v.controls = true; v.autoplay = true; v.playsInline = true;
      box.appendChild(v);
      var key = fig.getAttribute('data-embed');
      setTimeout(function () {
        v.src = key ? embedUrl(key) : fig.getAttribute('data-src') || '';
        var pr = v.play(); if (pr && pr.catch) pr.catch(function () { /* trình duyệt chặn tự phát → còn nút phát */ });
      }, 0);
    }
    document.body.appendChild(ov);
    // Phải gọi ngay trong sự kiện bấm (trình duyệt chỉ cho toàn màn hình khi có thao tác người dùng).
    try { var r = ov.requestFullscreen && ov.requestFullscreen(); if (r && r.catch) r.catch(function () {}); } catch (e) { /* khung chặn → vẫn phủ kín cửa sổ */ }
  }
  document.addEventListener('fullscreenchange', function () { if (ov && !document.fullscreenElement && ov.getAttribute('data-fs')) closeVideo(); else if (ov && document.fullscreenElement === ov) ov.setAttribute('data-fs', '1'); });

  /* ---------- điều hướng ---------- */
  var cur = 0, t0 = performance.now();
  var countEl = document.getElementById('count'), barEl = document.querySelector('#bar i');
  function fit() { deck.style.setProperty('--s', String(Math.min(innerWidth / W, innerHeight / H))); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function notify() {
    if (!EMBED) return;
    var st = STEPS[cur];
    try { window.parent.postMessage({ type: 'deck:slide', index: cur, count: N, step: st ? pos : 0, steps: st ? st.max : 0 }, '*'); } catch (e) { /* bỏ qua */ }
  }

  /* phóng to "máy quay": dịch + phóng cả slide (thuộc tính translate/scale độc lập, không đụng transform của engine) */
  var Z = { el: null, z: 1, x: 0, y: 0, tour: false };
  function unzoomSlide(sl) { sl.style.translate = ''; sl.style.scale = ''; sl.classList.remove('zoomed'); Array.prototype.forEach.call(sl.querySelectorAll('.zt'), function (e) { e.classList.remove('zt'); }); }
  function zoomOut(instant) {
    var sl = slides[cur];
    if (!Z.el || !sl) { Z = { el: null, z: 1, x: 0, y: 0, tour: false }; return; }
    if (instant) sl.style.transition = 'none';
    unzoomSlide(sl);
    if (instant) { void sl.offsetWidth; sl.style.transition = ''; }
    Z = { el: null, z: 1, x: 0, y: 0, tour: false };
  }
  // force (đi lần lượt): vẫn làm nổi phần tử khi nó đã đủ lớn (không phóng).
  function zoomTo(el, force) {
    var sl = slides[cur];
    if (!sl || !el || !sl.contains(el)) return false;
    var d = deck.getBoundingClientRect(), s = d.width / W, r = el.getBoundingClientRect();
    // Góc phóng ĐANG hiển thị (giữa chừng chuyển tiếp, getComputedStyle trả giá trị nội suy hiện tại).
    var cs = getComputedStyle(sl), z0 = parseFloat(cs.scale) || 1, tr = String(cs.translate || '').split(' ');
    var x0 = parseFloat(tr[0]) || 0, y0 = parseFloat(tr[1]) || 0;
    var w = el.offsetWidth || r.width / (s * z0), h = el.offsetHeight || r.height / (s * z0);
    var px = W / 2 + ((r.left + r.width / 2 - d.left) / s - W / 2 - x0) / z0;
    var py = H / 2 + ((r.top + r.height / 2 - d.top) / s - H / 2 - y0) / z0;
    var z = Math.min(0.82 * W / w, 0.8 * H / h, 3);
    if (!force && z < 1.15) return false;
    z = Math.max(1, z);
    var mx = (z - 1) * W / 2, my = (z - 1) * H / 2;
    var x = clamp(-z * (px - W / 2), -mx, mx), y = clamp(-z * (py - H / 2), -my, my);
    Array.prototype.forEach.call(sl.querySelectorAll('.zt'), function (e) { e.classList.remove('zt'); });
    el.classList.add('zt'); sl.classList.add('zoomed');
    sl.style.translate = x.toFixed(1) + 'px ' + y.toFixed(1) + 'px'; sl.style.scale = z.toFixed(4);
    Z = { el: el, z: z, x: x, y: y, tour: !!force };
    return true;
  }

  /* trạng thái từng ý của slide hiện tại: pos = số bước đã đi (0…max) */
  var pos = 0;
  function nowFrame() { return REDUCE ? -FINAL : (performance.now() - t0) / 1000 * FPS; }
  function applySteps(st, back) {
    var fr = SF[cur] = [];
    if (st.mode === 'tour') {
      st.units.forEach(function (u) { u.removeAttribute('data-wait'); u.removeAttribute('data-past'); });
      return;
    }
    st.units.forEach(function (u, k) {
      if (back) { fr[k + 1] = null; u.removeAttribute('data-wait'); } else u.setAttribute('data-wait', '');
      if (st.mode === 'dim' && back && k < st.units.length - 1) u.setAttribute('data-past', ''); else u.removeAttribute('data-past');
    });
  }
  // Đi 1 bước trong slide; trả false khi đã hết bước (→ sang slide).
  function stepBy(dir) {
    var st = STEPS[cur];
    if (!st || MODE !== 'present') return false;
    var to = pos + dir;
    if (to < 0 || to > st.max) return false;
    if (st.mode === 'tour') {
      pos = to;
      if (pos >= 1 && pos <= st.units.length) zoomTo(st.units[pos - 1], true); else zoomOut();
    } else if (dir > 0) {
      var u = st.units[to - 1];
      SF[cur][to] = nowFrame(); u.removeAttribute('data-wait');
      if (st.mode === 'dim') st.units.forEach(function (x, k) { if (k < to - 1) x.setAttribute('data-past', ''); else x.removeAttribute('data-past'); });
      pos = to;
    } else {
      var v = st.units[pos - 1];
      v.setAttribute('data-wait', ''); SF[cur][pos] = undefined;
      pos = to;
      if (st.mode === 'dim') st.units.forEach(function (x, k) { if (k < pos - 1) x.setAttribute('data-past', ''); else x.removeAttribute('data-past'); });
    }
    notify();
    return true;
  }

  function show(i, instant, back) {
    frozen = null;
    i = clamp(i, 0, N - 1);
    var prevEl = slides[cur];
    // Slide cũ mờ dần cùng góc phóng hiện tại rồi mới trả về (không giật).
    if (Z.el && prevEl) { var zs = prevEl; Z = { el: null, z: 1, x: 0, y: 0, tour: false }; if (i === cur) unzoomSlide(zs); else setTimeout(function () { if (zs !== slides[cur]) unzoomSlide(zs); }, 700); }
    if (i !== cur && prevEl) {
      prevEl.classList.remove('on'); prevEl.classList.add('off'); prevEl.setAttribute('aria-hidden', 'true');
      setTimeout(function () { prevEl.classList.remove('off'); if (prevEl !== slides[cur]) stopLogos(prevEl); }, 700);
    }
    cur = i; t0 = performance.now() - (instant ? FINAL / FPS * 1000 : 0);
    var st = MODE === 'present' ? STEPS[cur] : null;
    pos = st && back ? st.max : 0;
    if (st) applySteps(st, back);
    else SF[cur] = null;
    render(cur, instant ? FINAL : 0);
    slides[cur].classList.add('on'); slides[cur].removeAttribute('aria-hidden');
    if (MODE === 'present') startLogos(cur);
    if (countEl) countEl.textContent = pad(cur + 1) + ' / ' + pad(N);
    if (barEl) barEl.style.width = ((cur + 1) / N * 100) + '%';
    if (!EMBED) { try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) { /* bỏ qua */ } }
    notify();
  }
  // Trước/Sau: phóng to (bấm) → thu về trước; còn ý chưa hiện → hiện ý tiếp; hết → sang slide.
  function next() {
    if (Z.el && !Z.tour) { zoomOut(); return; }
    if (stepBy(1)) return;
    if (cur < N - 1) show(cur + 1);
  }
  function prev() {
    if (Z.el && !Z.tour) { zoomOut(); return; }
    if (stepBy(-1)) return;
    if (cur > 0) show(cur - 1, false, true);
  }

  var readyResolve; var ready = new Promise(function (r) { readyResolve = r; });
  window.__deck = {
    count: N, ready: ready,
    goto: function (i, frame) {
      slides.forEach(function (s, k) { s.style.transition = 'none'; s.classList.toggle('on', k === i); s.classList.remove('off'); });
      cur = clamp(i, 0, N - 1); frozen = frame === undefined ? FINAL : frame;
      // Chụp ảnh (thumbnail): trang hiện ĐỦ mọi ý, không phóng, không mờ.
      if (Z.el) { unzoomSlide(slides[cur]); Z = { el: null, z: 1, x: 0, y: 0, tour: false }; }
      var st = STEPS[cur];
      if (st) { pos = st.max; applySteps(st, true); st.units.forEach(function (u) { u.removeAttribute('data-past'); }); }
      render(cur, frozen, 0); drawBg(0);
      stopLogos(); startLogos(cur);
    },
  };

  function start() {
    if (!N) { readyResolve(); return; }
    fitAll();
    timelines = buildTimelines();
    slides.forEach(function (s) { s.setAttribute('aria-hidden', 'true'); });

    if (MODE === 'print') {
      document.body.classList.add('print');
      // Nền chuyển động không in được → 1 khung tĩnh làm ảnh nền cho từng trang PDF.
      if (painter) { try { painter.draw(0); deck.style.setProperty('--bgimg', 'url(' + bgSnapshot() + ')'); } catch (e) { /* bỏ qua */ } }
      drop3d();
      slides.forEach(function (s, i) { s.removeAttribute('aria-hidden'); render(i, FINAL, 0); });
      printLogos(readyResolve); return;
    }
    if (MODE === 'edit') { startEdit(); return; }
    if (MODE === 'still') {
      document.body.classList.add('still');
      fit(); addEventListener('resize', fit);
      var si = clamp((+qs.get('slide') || 1) - 1, 0, N - 1);
      window.__deck.goto(si, +(qs.get('frame') || FINAL));
      readyResolve(); return;
    }

    if (EMBED) document.body.classList.add('embed');
    fit(); addEventListener('resize', fit);
    buildSteps(); markZoom();
    var h = parseInt((location.hash || '').slice(1), 10);
    show(isNaN(h) ? 0 : h - 1, REDUCE);
    (function loop(now) {
      if (frozen === null) {
        var f = REDUCE ? FINAL : (now - t0) / 1000 * FPS;
        render(cur, f, REDUCE ? 0 : now / 1000);
        drawBg(REDUCE ? 0 : now / 1000);
        drawLogos(REDUCE ? 1.4 : now / 1000);
      }
      requestAnimationFrame(loop);
    })(performance.now());

    function toggleBlack() { document.body.classList.toggle('black'); }
    addEventListener('keydown', function (e) {
      var k = e.key;
      if (ov) { if (k === 'Escape') closeVideo(); return; }
      // Enter/Space trên nút phát video → để nút nhận lệnh bấm, không chuyển trang.
      if ((k === 'Enter' || k === ' ') && e.target && e.target.closest && e.target.closest('.vplay')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Màn đen (bút trình chiếu: phím "." hoặc B) — bấm phím bất kỳ để quay lại.
      if (document.body.classList.contains('black')) { e.preventDefault(); toggleBlack(); return; }
      if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].indexOf(k) >= 0) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].indexOf(k) >= 0) { e.preventDefault(); prev(); }
      else if (k === 'Home') show(0); else if (k === 'End') show(N - 1);
      else if (k === 'r' || k === 'R') show(cur);
      else if (k === 'f' || k === 'F') toggleFs();
      else if (k === 'F5') { e.preventDefault(); if (!document.fullscreenElement) toggleFs(); }
      else if (k === '.' || k === 'b' || k === 'B') { e.preventDefault(); toggleBlack(); }
      else if (k === 'Escape' && Z.el) { e.preventDefault(); zoomOut(); }
    });
    function toggleFs() {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else { var r = document.documentElement.requestFullscreen(); if (r && r.catch) r.catch(function () {}); }
      } catch (err) { /* khung nhúng có thể chặn toàn màn hình */ }
    }
    var b;
    if ((b = document.getElementById('next'))) b.addEventListener('click', function (e) { e.stopPropagation(); next(); });
    if ((b = document.getElementById('prev'))) b.addEventListener('click', function (e) { e.stopPropagation(); prev(); });
    if ((b = document.getElementById('fs'))) b.addEventListener('click', function (e) { e.stopPropagation(); toggleFs(); });
    document.getElementById('stage').addEventListener('click', function (e) {
      if (document.body.classList.contains('black')) { toggleBlack(); return; }
      var fig = e.target && e.target.closest ? e.target.closest('.vid') : null;
      if (fig) { e.stopPropagation(); playVideo(fig); return; }
      // Bấm vào khối nội dung → phóng to; đang phóng → bấm khối khác chuyển sang khối đó, bấm chỗ khác thu về.
      var z = e.target && e.target.closest ? e.target.closest('[data-z]') : null;
      if (z && (!slides[cur].contains(z) || z.closest('[data-wait]'))) z = null;
      if (Z.el) { if (!(z && z !== Z.el && zoomTo(z))) zoomOut(); return; }
      if (z && zoomTo(z)) return;
      if (e.clientX < innerWidth * .3) prev(); else next();
    });
    var tx = null;
    addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    addEventListener('touchend', function (e) { if (tx === null || ov) return; var dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) { if (dx < 0) next(); else prev(); } tx = null; });
    // Thị sai theo con trỏ cho nền/logo 3D (−1…1 quanh tâm màn hình).
    addEventListener('pointermove', function (e) {
      ptr.x = clamp((e.clientX / innerWidth) * 2 - 1, -1, 1); ptr.y = clamp(1 - (e.clientY / innerHeight) * 2, -1, 1);
      if (bg3) bg3.setPointer(ptr.x, ptr.y);
      logos.forEach(function (l) { if (l.inst) l.inst.setPointer(ptr.x, ptr.y); });
    });
    var idle; function wake() { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 2500); }
    addEventListener('mousemove', wake); wake();
    setTimeout(function () { var hn = document.getElementById('hint'); if (hn) hn.style.opacity = '0'; }, 4500);
    addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'deck:goto') { var idx = Number(d.index); if (Number.isInteger(idx)) show(idx, !!d.instant); }
      // Nút Trước/Sau và bút trình chiếu bên ngoài khung → đi theo từng ý như phím trong khung.
      else if (d.type === 'deck:step') { if (d.dir === 1) next(); else if (d.dir === -1) prev(); }
      else if (d.type === 'deck:cmd') { if (d.cmd === 'black') toggleBlack(); else if (d.cmd === 'esc' && Z.el) { zoomOut(); } }
    });
    readyResolve();
  }

  /* ---------- chế độ sửa trực tiếp (trình soạn thảo) ---------- */
  // Mọi thay đổi gửi về ứng dụng (cửa sổ cha) để cập nhật bản nháp; ứng dụng dựng lại slide và gửi 'deck:render'.
  // An toàn: chỉ nhận lệnh từ window.parent; HTML trong 'deck:render' do renderer dùng chung của ứng dụng sinh (mọi chuỗi đã
  // escape) và trang chạy trong sandbox origin null + CSP nonce (không chạy được script/handler chèn vào).
  var PT = (function () { var d = document.createElement('div'); try { d.contentEditable = 'plaintext-only'; } catch (e) { /* trình duyệt cũ */ } return d.contentEditable === 'plaintext-only'; })();
  var selFe = null, drag = null, pending = null, liveCss = null, lastCss = '', cache = [], guides = [];
  function post(msg) { try { window.parent.postMessage(msg, '*'); } catch (e) { /* bỏ qua */ } }
  function slideIndex(el) { return slides.indexOf(el && el.closest ? el.closest('.slide') : null); }
  function edEl(t) { return t && t.closest ? t.closest('[data-e]') : null; }
  // plaintext-only: trình duyệt không tự chèn định dạng (dán/kéo thả HTML) — định dạng chỉ qua thanh công cụ (span.rt dựng lại từ mô hình).
  function editable(el) { el.contentEditable = PT ? 'plaintext-only' : 'true'; el.spellcheck = false; }
  function bindEditables(root) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-e]'), function (el) { if (!el.closest('.fe')) editable(el); });
  }
  // Chữ thuần (trường số liệu/chân trang có data-pl, hoặc để đếm độ dài).
  function textOf(el) {
    var t = (el.innerText || el.textContent || '').replace(/ /g, ' ').replace(/\r/g, '');
    if (!el.hasAttribute('data-ml')) return t.replace(/\s*\n+\s*/g, ' ');
    return t.replace(/\n$/, '');
  }

  /* ---- chữ có định dạng (cùng cú pháp với shared/deck/rich.js): ⟦màu,b,n⟧chữ⟦/⟧, xuống dòng = \n ---- */
  // Mô hình = mảng ký tự {t, c, b, n}; đọc từ DOM, sửa theo vị trí, dựng lại DOM (chỉ text node, span, br — không innerHTML).
  var RC = { text: 'var(--text)', accent: 'var(--accent)', 'accent-2': 'var(--accent-2)', amber: 'var(--amber)', mint: 'var(--mint)', coral: 'var(--coral)', violet: 'var(--violet)', muted: 'var(--muted)', white: '#FFFFFF', dark: '#111111' };
  var HEXC = /^#[0-9a-f]{6}$/i;
  function okColor(c) { return c && (Object.prototype.hasOwnProperty.call(RC, c) || HEXC.test(c)) ? c : null; }
  function isRich(el) { return !!el && !el.hasAttribute('data-pl'); }
  var NOFMT = { c: null, b: false, n: false };
  // Đọc DOM → ký tự. Khối (div/p do trình duyệt chèn) = xuống dòng trước nó; <br> = xuống dòng.
  function domChars(root) {
    var out = [];
    (function walk(node, f) {
      Array.prototype.forEach.call(node.childNodes, function (n, i) {
        if (n.nodeType === 3) {
          var t = n.nodeValue.replace(/ /g, ' ').replace(/\r/g, '').replace(/[⟦⟧]/g, '');
          for (var k = 0; k < t.length; k++) out.push({ t: t[k], c: f.c, b: f.b, n: f.n && t[k] !== '\n' });
        } else if (n.nodeType === 1) {
          if (n.tagName === 'BR') { out.push({ t: '\n', c: null, b: false, n: false }); return; }
          if (n.classList && n.classList.contains('fe-h')) return;
          var block = /^(DIV|P)$/.test(n.tagName);
          if (block && i > 0 && out.length && out[out.length - 1].t !== '\n') out.push({ t: '\n', c: null, b: false, n: false });
          var g = { c: f.c, b: f.b, n: f.n };
          if (n.classList && n.classList.contains('rt')) {
            g.c = okColor(n.getAttribute('data-rc')) || f.c;
            if (n.hasAttribute('data-rb')) g.b = true;
            if (n.hasAttribute('data-rn')) g.n = true;
          }
          walk(n, g);
        }
      });
    })(root, NOFMT);
    return out;
  }
  function trimTail(chars) { if (chars.length && chars[chars.length - 1].t === '\n') chars.pop(); return chars; }
  function keyOf(x) { return [x.c || '', x.b ? 'b' : '', x.n ? 'n' : ''].filter(Boolean).join(','); }
  function serialize(chars) {
    var out = '', run = '', buf = '';
    function flush() { if (!buf) return; out += run ? '⟦' + run + '⟧' + buf + '⟦/⟧' : buf; buf = ''; }
    chars.forEach(function (x) { var k = keyOf(x); if (k !== run) { flush(); run = k; } buf += x.t; });
    flush();
    return out;
  }
  // Dựng lại DOM từ ký tự (thêm <br> cuối để dòng trống cuối hiện được khi đang gõ).
  function buildDom(el, chars) {
    while (el.firstChild) el.removeChild(el.firstChild);
    var i = 0;
    while (i < chars.length) {
      var k = keyOf(chars[i]), j = i;
      while (j < chars.length && keyOf(chars[j]) === k) j++;
      var host = el;
      if (k) {
        var x = chars[i], sp = document.createElement('span');
        sp.className = 'rt';
        if (x.c) { sp.setAttribute('data-rc', x.c); sp.style.color = RC[x.c] || x.c; }
        if (x.b) { sp.setAttribute('data-rb', ''); sp.style.fontWeight = '800'; }
        if (x.n) { sp.setAttribute('data-rn', ''); sp.style.whiteSpace = 'nowrap'; }
        el.appendChild(sp); host = sp;
      }
      var txt = '';
      for (var m = i; m < j; m++) {
        if (chars[m].t === '\n') { if (txt) host.appendChild(document.createTextNode(txt)); txt = ''; host.appendChild(document.createElement('br')); }
        else txt += chars[m].t;
      }
      if (txt) host.appendChild(document.createTextNode(txt));
      i = j;
    }
    if (chars.length && chars[chars.length - 1].t === '\n') el.appendChild(document.createElement('br'));
  }
  function valueOf(el) { return isRich(el) ? serialize(trimTail(domChars(el))) : textOf(el); }
  function lenOf(el) { return isRich(el) ? trimTail(domChars(el)).length : textOf(el).length; }
  // Vị trí (theo ký tự của mô hình) của 1 điểm DOM trong el.
  function offsetAt(el, node, off) {
    try {
      var r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, off);
      var box = document.createElement('div'); box.appendChild(r.cloneContents());
      return domChars(box).length;
    } catch (e) { return 0; }
  }
  function selRange(el) {
    var sl = getSelection();
    if (!sl || !sl.rangeCount) return null;
    var r = sl.getRangeAt(0);
    if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    var a = offsetAt(el, r.startContainer, r.startOffset), b = offsetAt(el, r.endContainer, r.endOffset);
    return { s: Math.min(a, b), e: Math.max(a, b) };
  }
  // Điểm DOM ứng với vị trí ký tự idx (ưu tiên cuối text node phía trước → chữ gõ tiếp nhận định dạng đứng trước).
  function pointAt(el, idx) {
    var pos = 0, found = null;
    (function walk(node) {
      for (var i = 0; i < node.childNodes.length && !found; i++) {
        var n = node.childNodes[i];
        if (n.nodeType === 3) { if (idx <= pos + n.nodeValue.length) { found = { node: n, off: idx - pos }; return; } pos += n.nodeValue.length; }
        else if (n.tagName === 'BR') { if (idx <= pos) { found = { node: node, off: i }; return; } pos += 1; }
        else walk(n);
      }
    })(el);
    return found || { node: el, off: el.childNodes.length };
  }
  function setSel(el, s, e) {
    var a = pointAt(el, s), b = pointAt(el, e === undefined ? s : e);
    var r = document.createRange();
    try { r.setStart(a.node, a.off); r.setEnd(b.node, b.off); } catch (err) { return; }
    var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r);
  }
  function sendEdit(el, final) {
    post({ type: 'deck:edit', index: slideIndex(el), path: el.getAttribute('data-e'), value: valueOf(el), final: !!final });
  }
  // Chèn chữ (Enter, dán) theo mô hình — không phụ thuộc cách từng trình duyệt tự chèn <div>/<br>.
  function insertText(el, text) {
    var r = selRange(el) || { s: 0, e: 0 };
    var chars = domChars(el);
    var max = +(el.getAttribute('data-max') || 0);
    text = String(text || '').replace(/\r\n?/g, '\n');
    if (!el.hasAttribute('data-ml')) text = text.replace(/\s*\n+\s*/g, ' ');
    if (max) text = text.slice(0, Math.max(0, max - (trimTail(domChars(el)).length - (r.e - r.s))));
    if (!text && r.e === r.s) return;
    var f = chars[r.s - 1] || chars[r.e] || NOFMT;
    if (f.t === '\n') f = NOFMT;
    var add = text.split('').map(function (t) { return { t: t, c: f.c, b: f.b, n: f.n && t !== '\n' }; });
    chars.splice.apply(chars, [r.s, r.e - r.s].concat(add));
    buildDom(el, chars);
    setSel(el, r.s + add.length);
    sendEdit(el, false);
    var fe = el.closest('.fe'); if (fe) fitFree(fe);
    placeToolbar();
  }

  /* ---- thanh định dạng nổi (chỉ ở trường chữ có định dạng đang sửa) ---- */
  var tb = null, tbEl = null, tbSel = null, tbInp = null;
  var TB_COLORS = ['text', 'accent', 'accent-2', 'amber', 'mint', 'coral', 'muted', 'white', 'dark'];
  var TB_NAMES = { text: 'Màu chữ mặc định', accent: 'Màu nhấn', 'accent-2': 'Màu nhấn phụ', amber: 'Màu pha', mint: 'Xanh lá', coral: 'Đỏ', muted: 'Xám', white: 'Trắng', dark: 'Đen' };
  function tbBtn(label, title, cmd, cls) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tb-b' + (cls ? ' ' + cls : ''); b.textContent = label; b.title = title;
    b.setAttribute('aria-label', title); b.setAttribute('data-cmd', cmd);
    return b;
  }
  function sep() { var i = document.createElement('i'); i.className = 'tb-sep'; return i; }
  function paintSwatches() {
    if (!tb) return;
    var cs = getComputedStyle(document.documentElement);
    Array.prototype.forEach.call(tb.querySelectorAll('.tb-sw'), function (b) {
      var c = b.getAttribute('data-cmd').slice(2), css = RC[c];
      var v = css.indexOf('var(') === 0 ? cs.getPropertyValue(css.slice(4, -1)).trim() : css;
      b.style.setProperty('--sw', v || '#888');
    });
  }
  function buildToolbar() {
    tb = document.createElement('div');
    tb.id = 'rtb'; tb.setAttribute('role', 'toolbar'); tb.setAttribute('aria-label', 'Định dạng chữ');
    TB_COLORS.forEach(function (c) { tb.appendChild(tbBtn('', TB_NAMES[c], 'c:' + c, 'tb-sw')); });
    var pick = document.createElement('label');
    pick.className = 'tb-b tb-pick'; pick.title = 'Màu tuỳ chọn (mã màu thương hiệu)';
    tbInp = document.createElement('input');
    tbInp.type = 'color'; tbInp.value = '#2563eb'; tbInp.setAttribute('aria-label', 'Màu tuỳ chọn');
    tbInp.addEventListener('input', function () { applyFmt({ c: tbInp.value.toUpperCase() }, true); });
    tbInp.addEventListener('change', function () { applyFmt({ c: tbInp.value.toUpperCase() }, false); });
    pick.appendChild(tbInp); tb.appendChild(pick);
    tb.appendChild(sep());
    tb.appendChild(tbBtn('B', 'Chữ đậm', 'b', 'tb-bold'));
    tb.appendChild(tbBtn('AA', 'VIẾT HOA TOÀN BỘ', 'u:upper'));
    tb.appendChild(tbBtn('aa', 'viết thường', 'u:lower'));
    tb.appendChild(tbBtn('Aa', 'Viết Hoa Đầu Mỗi Từ', 'u:title'));
    tb.appendChild(sep());
    tb.appendChild(tbBtn('⟷', 'Giữ liền cụm từ (không ngắt xuống dòng giữa cụm)', 'n'));
    tb.appendChild(tbBtn('⌫', 'Xoá định dạng', 'clear'));
    var hint = document.createElement('span'); hint.className = 'tb-hint'; hint.textContent = 'Bôi chữ để áp riêng · Enter xuống dòng';
    tb.appendChild(hint);
    // Giữ vùng chọn trong ô đang sửa khi bấm thanh công cụ (nút không lấy focus) — trừ ô chọn màu (cần mở bảng màu).
    tb.addEventListener('pointerdown', function (e) {
      if (!tbEl) return;
      tbSel = selRange(tbEl) || tbSel;
      if (!e.target.closest('.tb-pick')) e.preventDefault();
    });
    tb.addEventListener('click', function (e) {
      var b = e.target.closest('[data-cmd]');
      if (!b || !tbEl) return;
      e.preventDefault();
      var cmd = b.getAttribute('data-cmd');
      if (cmd.indexOf('c:') === 0) applyFmt({ c: cmd === 'c:text' ? null : cmd.slice(2) });
      else if (cmd === 'b') applyFmt({ b: 'toggle' });
      else if (cmd === 'n') applyFmt({ n: 'toggle' });
      else if (cmd.indexOf('u:') === 0) applyFmt({ upper: cmd.slice(2) });
      else if (cmd === 'clear') applyFmt({ c: null, b: false, n: false });
    });
    document.body.appendChild(tb);
    paintSwatches();
  }
  // Áp định dạng cho đoạn đang bôi; không bôi gì → cả ô. keepOpen = đang kéo bảng chọn màu (không trả focus về ô).
  function applyFmt(p, keepOpen) {
    var el = tbEl;
    if (!el) return;
    var chars = trimTail(domChars(el));
    var r = tbSel && tbSel.e > tbSel.s ? { s: tbSel.s, e: Math.min(tbSel.e, chars.length) } : { s: 0, e: chars.length };
    var seg = chars.slice(r.s, r.e).filter(function (x) { return x.t !== '\n'; });
    if (p.b === 'toggle') p.b = !seg.every(function (x) { return x.b; });
    if (p.n === 'toggle') p.n = !seg.every(function (x) { return x.n; });
    for (var i = r.s; i < r.e; i++) {
      var x = chars[i], prev = i === 0 ? ' ' : chars[i - 1].t;
      if ('c' in p) x.c = okColor(p.c);
      if ('b' in p) x.b = !!p.b;
      if ('n' in p) x.n = !!p.n && x.t !== '\n';
      // Giữ đúng 1 ký tự/vị trí (vd. 'ß' viết hoa thành 'SS' → lấy ký tự đầu) để vùng chọn không lệch.
      var u = p.upper === 'upper' ? x.t.toLocaleUpperCase('vi') : p.upper === 'lower' ? x.t.toLocaleLowerCase('vi')
        : p.upper === 'title' ? (/\s/.test(prev) ? x.t.toLocaleUpperCase('vi') : x.t.toLocaleLowerCase('vi')) : x.t;
      x.t = u.length === 1 ? u : x.t;
    }
    buildDom(el, chars);
    sendEdit(el, false);
    if (!keepOpen) { el.focus(); setSel(el, r.s, r.e); tbSel = r; }
    var fe = el.closest('.fe'); if (fe) fitFree(fe);
    placeToolbar();
  }
  function placeToolbar() {
    if (!tb || !tbEl) return;
    var r = tbEl.getBoundingClientRect(), h = tb.offsetHeight || 40, w = tb.offsetWidth || 420;
    var top = r.top - h - 10;
    if (top < 6) top = Math.min(innerHeight - h - 6, r.bottom + 10);
    tb.style.top = Math.max(6, top) + 'px';
    tb.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left)) + 'px';
  }
  function showToolbar(el) {
    if (!isRich(el)) { hideToolbar(); return; }
    if (!tb) buildToolbar();
    else paintSwatches();
    tbEl = el; tbSel = null; tb.classList.add('on'); placeToolbar();
  }
  function hideToolbar() { tbEl = null; tbSel = null; if (tb) tb.classList.remove('on'); }

  function caretAt(x, y) {
    var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (!r && document.caretPositionFromPoint) { var p = document.caretPositionFromPoint(x, y); if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); } }
    if (r) { var sl = getSelection(); sl.removeAllRanges(); sl.addRange(r); }
  }
  function mediaMsg(m) {
    var r = m.getBoundingClientRect();
    post({ type: 'deck:media', index: slideIndex(m), path: m.getAttribute('data-m'), kind: m.classList.contains('vid') || !!m.closest('.fe-video') ? 'video' : 'image', w: Math.round(r.width), h: Math.round(r.height) });
  }

  /* chọn / kéo / đổi kích thước phần tử trang tự do (toạ độ %) */
  function clearHandles() {
    Array.prototype.forEach.call(deck.querySelectorAll('.fe-h'), function (h) { h.parentNode.removeChild(h); });
    Array.prototype.forEach.call(deck.querySelectorAll('.fe.sel'), function (f) { f.classList.remove('sel'); });
  }
  function selectFe(fe, notifyApp) {
    clearHandles();
    selFe = fe || null;
    if (selFe) {
      selFe.classList.add('sel');
      ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].forEach(function (h) { var d = document.createElement('i'); d.className = 'fe-h'; d.setAttribute('data-h', h); selFe.appendChild(d); });
    }
    if (notifyApp) post({ type: 'deck:select', index: selFe ? slideIndex(selFe) : cur, id: selFe ? selFe.getAttribute('data-el') : null });
  }
  function rectOf(fe) { return { x: parseFloat(fe.style.left) || 0, y: parseFloat(fe.style.top) || 0, w: parseFloat(fe.style.width) || 10, h: parseFloat(fe.style.height) || 10 }; }
  function applyRect(fe, r) { fe.style.left = r.x + '%'; fe.style.top = r.y + '%'; fe.style.width = r.w + '%'; fe.style.height = r.h + '%'; }
  var r2 = function (v) { return Math.round(v * 100) / 100; };
  function sendGeom(fe) { var r = rectOf(fe); post({ type: 'deck:geom', index: slideIndex(fe), id: fe.getAttribute('data-el'), x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h) }); }
  function clearGuides() { guides.forEach(function (g) { if (g.parentNode) g.parentNode.removeChild(g); }); guides = []; }
  function guide(slide, axis, at) {
    var g = document.createElement('div'); g.className = 'fe-guide ' + axis;
    if (axis === 'v') g.style.left = at + '%'; else g.style.top = at + '%';
    slide.appendChild(g); guides.push(g);
  }
  // Hút về mép/giữa trang và mép/giữa phần tử khác (ngưỡng 0,8%) — kéo thả căn thẳng hàng dễ hơn.
  function snapAxis(edges, lines) {
    var best = null;
    edges.forEach(function (e) { lines.forEach(function (l) { var d = l - e.v; if (Math.abs(d) <= 0.8 && (!best || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: l }; }); });
    return best;
  }
  function onDown(e) {
    if (e.button !== 0) return;
    var t = e.target;
    if (t.closest('[contenteditable]')) return;
    var fe = t.closest('.fe');
    if (!fe) { if (selFe && !t.closest('[data-m]')) selectFe(null, true); return; }
    e.preventDefault();
    try { window.focus(); } catch (err) { /* bỏ qua */ }
    if (selFe !== fe) selectFe(fe, true);
    var h = t.closest('.fe-h');
    var slide = fe.closest('.slide');
    var others = Array.prototype.filter.call(slide.querySelectorAll('.fe'), function (o) { return o !== fe; }).map(rectOf);
    var xs = [0, 50, 100], ys = [0, 50, 100];
    others.forEach(function (o) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); });
    drag = { fe: fe, slide: slide, h: h ? h.getAttribute('data-h') : '', x0: e.clientX, y0: e.clientY, r0: rectOf(fe), moved: false, xs: xs, ys: ys, id: e.pointerId };
    try { fe.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  }
  function onMove(e) {
    if (!drag) return;
    var box = deck.getBoundingClientRect();
    var dx = (e.clientX - drag.x0) / box.width * 100, dy = (e.clientY - drag.y0) / box.height * 100;
    if (!drag.moved && Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 4) return;
    drag.moved = true;
    var r = { x: drag.r0.x, y: drag.r0.y, w: drag.r0.w, h: drag.r0.h }, hd = drag.h;
    clearGuides();
    if (!hd) {
      r.x += dx; r.y += dy;
      var sx = snapAxis([{ v: r.x }, { v: r.x + r.w / 2 }, { v: r.x + r.w }], drag.xs);
      var sy = snapAxis([{ v: r.y }, { v: r.y + r.h / 2 }, { v: r.y + r.h }], drag.ys);
      if (sx && !e.altKey) { r.x += sx.d; guide(drag.slide, 'v', sx.at); }
      if (sy && !e.altKey) { r.y += sy.d; guide(drag.slide, 'h', sy.at); }
    } else {
      if (hd.indexOf('e') >= 0) r.w = Math.max(2, drag.r0.w + dx);
      if (hd.indexOf('s') >= 0) r.h = Math.max(2, drag.r0.h + dy);
      if (hd.indexOf('w') >= 0) { r.w = Math.max(2, drag.r0.w - dx); r.x = drag.r0.x + drag.r0.w - r.w; }
      if (hd.indexOf('n') >= 0) { r.h = Math.max(2, drag.r0.h - dy); r.y = drag.r0.y + drag.r0.h - r.h; }
      // Kéo góc + Shift: giữ tỷ lệ khung (ảnh không méo).
      if (e.shiftKey && hd.length === 2) {
        var k = drag.r0.h / drag.r0.w, nh = r.w * k;
        if (hd.indexOf('n') >= 0) r.y = drag.r0.y + drag.r0.h - nh;
        r.h = nh;
      }
      if (!e.altKey) {
        if (hd.indexOf('e') >= 0) { var se = snapAxis([{ v: r.x + r.w }], drag.xs); if (se) { r.w += se.d; guide(drag.slide, 'v', se.at); } }
        if (hd.indexOf('s') >= 0) { var ss = snapAxis([{ v: r.y + r.h }], drag.ys); if (ss) { r.h += ss.d; guide(drag.slide, 'h', ss.at); } }
      }
    }
    applyRect(drag.fe, { x: r2(r.x), y: r2(r.y), w: r2(r.w), h: r2(r.h) });
    if (hd) fitFree(drag.fe);
  }
  function onUp() {
    if (!drag) return;
    var d = drag; drag = null;
    clearGuides();
    if (d.moved) sendGeom(d.fe);
  }
  function startEditFree(el, x, y) {
    editable(el);
    el.focus();
    if (x !== undefined) caretAt(x, y);
  }

  /* dựng lại slide từ bản nháp (ứng dụng gửi) */
  function applyRender(d) {
    // Hoãn khi người dùng ĐANG gõ trong khung. Kiểm tra cả document.hasFocus(): bấm sang bảng bên ngoài thì activeElement
    // của khung vẫn trỏ vào ô cũ → nếu chỉ xét activeElement, mọi lần dựng lại sau đó bị hoãn mãi.
    var a = document.activeElement;
    if (a && a.isContentEditable && deck.contains(a) && document.hasFocus()) { pending = d; return; }
    // Đang chọn màu trên thanh định dạng (focus ở ô màu) → chờ, không thay slide dưới tay người dùng.
    if (tbEl && tb && tb.contains(a)) { pending = d; return; }
    pending = null;
    if (typeof d.css === 'string' && d.css !== lastCss) {
      if (!liveCss) { liveCss = document.createElement('style'); if (NONCE) liveCss.nonce = NONCE; document.head.appendChild(liveCss); }
      liveCss.textContent = d.css; lastCss = d.css;
    }
    var root = document.documentElement, bgBefore = deck.getAttribute('data-bg') + '|' + root.getAttribute('data-deck-theme') + '|' + lastCss.length;
    if (d.attrs && typeof d.attrs === 'object') {
      if (d.attrs.theme) root.setAttribute('data-deck-theme', String(d.attrs.theme));
      if (d.attrs.tone) root.setAttribute('data-tone', String(d.attrs.tone));
      if (d.attrs.font) root.setAttribute('data-font', String(d.attrs.font));
      if (d.attrs.style) root.setAttribute('data-style', String(d.attrs.style));
      if (d.attrs.bg) deck.setAttribute('data-bg', String(d.attrs.bg));
    }
    if (bgBefore !== deck.getAttribute('data-bg') + '|' + root.getAttribute('data-deck-theme') + '|' + lastCss.length) { setupPainter(); drawBg(0); }
    var list = Array.isArray(d.slides) ? d.slides : [];
    var selId = selFe ? selFe.getAttribute('data-el') : null;
    var changed = [];
    var tpl = document.createElement('template');
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i] !== 'string' || (cache[i] === list[i] && slides[i])) continue;
      tpl.innerHTML = list[i];
      var node = tpl.content.firstElementChild;
      if (!node || !node.classList.contains('slide')) continue;
      if (slides[i]) deck.replaceChild(node, slides[i]); else deck.appendChild(node);
      slides[i] = node; cache[i] = list[i]; changed.push(node);
    }
    while (slides.length > list.length) { var old = slides.pop(); if (old.parentNode) old.parentNode.removeChild(old); }
    cache.length = list.length;
    N = slides.length; window.__deck.count = N;
    timelines = buildTimelines();
    changed.forEach(function (sl) { sl.setAttribute('aria-hidden', 'true'); bindEditables(sl); fitSlideAll(sl); });
    slides.forEach(function (sl, k) { render(k, FINAL, 0); });
    var idx = Number.isInteger(d.index) ? d.index : cur;
    if (changed.length || idx !== cur) show(clamp(idx, 0, Math.max(0, N - 1)), true);
    selFe = null;
    if (tbEl && !deck.contains(tbEl)) hideToolbar();
    if (selId) { var again = slides[cur] && slides[cur].querySelector('.fe[data-el="' + selId.replace(/[^a-z0-9-]/gi, '') + '"]'); if (again) selectFe(again, false); }
  }

  function startEdit() {
    document.body.classList.add('edit', 'embed');
    fit(); addEventListener('resize', fit);
    slides.forEach(function (s, i) { s.setAttribute('aria-hidden', 'true'); render(i, FINAL, 0); });
    drawBg(0);
    bindEditables(deck);
    show(0, true);

    deck.addEventListener('beforeinput', function (e) {
      var el = edEl(e.target); if (!el) return;
      var it = e.inputType || '';
      // Xuống dòng: tự chèn theo mô hình (trường 1 dòng: bỏ qua). Lệnh định dạng của trình duyệt (Ctrl+B/I/U…) bị chặn —
      // định dạng chỉ qua thanh công cụ để luôn lưu được.
      if (it === 'insertParagraph' || it === 'insertLineBreak') { e.preventDefault(); if (el.hasAttribute('data-ml')) insertText(el, '\n'); return; }
      if (it.indexOf('format') === 0) { e.preventDefault(); return; }
      var max = +(el.getAttribute('data-max') || 0);
      if (max && it.indexOf('insert') === 0) {
        var add = e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
        var cur0 = String(getSelection() || '').length;
        if (lenOf(el) - cur0 + add.length > max) e.preventDefault();
      }
    });
    deck.addEventListener('input', function (e) { var el = edEl(e.target); if (!el) return; sendEdit(el, false); var fe = el.closest('.fe'); if (fe) fitFree(fe); placeToolbar(); });
    deck.addEventListener('paste', function (e) {
      var el = edEl(e.target); if (!el) return;
      e.preventDefault();
      insertText(el, e.clipboardData ? e.clipboardData.getData('text/plain') : '');
    });
    deck.addEventListener('focusin', function (e) {
      var el = edEl(e.target); if (!el) return;
      // Số liệu: sửa trên giá trị thô (270000), không phải chuỗi đã định dạng (270.000).
      if (el.hasAttribute('data-raw') && tbEl !== el) el.textContent = el.getAttribute('data-raw');
      showToolbar(el);
    });
    // Kết thúc sửa 1 ô: gửi bản cuối, co chữ, áp lệnh dựng lại đã hoãn.
    function finishEdit(el) {
      sendEdit(el, true);
      if (el.hasAttribute('data-raw')) el.setAttribute('data-raw', textOf(el));
      if (el.closest('.fe')) el.removeAttribute('contenteditable');
      hideToolbar();
      var s = el.closest('.slide'); if (s) fitSlide(s);
      // Lệnh dựng lại bị hoãn trong lúc gõ → áp dụng sau khi rời ô (chờ sự kiện focus kế tiếp xử lý xong).
      setTimeout(function () { if (pending) applyRender(pending); }, 0);
    }
    deck.addEventListener('focusout', function (e) {
      var el = edEl(e.target); if (!el) return;
      // Chuyển sang thanh định dạng (ô chọn màu) → vẫn đang sửa ô này.
      if (e.relatedTarget && tb && tb.contains(e.relatedTarget)) return;
      finishEdit(el);
    });
    // Rời ô chọn màu sang chỗ khác (không quay lại ô chữ) → kết thúc sửa.
    document.addEventListener('focusout', function (e) {
      if (!tb || !tb.contains(e.target) || !tbEl) return;
      var el = tbEl;
      setTimeout(function () { var a = document.activeElement; if (tbEl === el && a !== el && !(tb && tb.contains(a))) finishEdit(el); }, 0);
    });
    addEventListener('resize', placeToolbar);
    addEventListener('keydown', function (e) {
      var el = edEl(e.target);
      // Ctrl/Cmd+S trong khung → nhờ ứng dụng lưu (gửi nốt nội dung đang gõ trước).
      if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (el && el.isContentEditable) sendEdit(el, true);
        post({ type: 'deck:save' });
        return;
      }
      if (el && el.isContentEditable) {
        if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
        else if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault();
          // Trường nhiều dòng: Enter = xuống dòng; trường 1 dòng (nhãn, số liệu…): Enter = xong.
          if (el.hasAttribute('data-ml')) insertText(el, '\n'); else el.blur();
        } else if ((e.key === 'b' || e.key === 'B') && (e.metaKey || e.ctrlKey) && tbEl === el) { e.preventDefault(); tbSel = selRange(el); applyFmt({ b: 'toggle' }); }
        return;
      }
      if (!selFe) return;
      var k = e.key, step = e.shiftKey ? 2 : 0.25, r = rectOf(selFe);
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
        e.preventDefault();
        if (k === 'ArrowLeft') r.x -= step; else if (k === 'ArrowRight') r.x += step; else if (k === 'ArrowUp') r.y -= step; else r.y += step;
        applyRect(selFe, { x: r2(r.x), y: r2(r.y), w: r.w, h: r.h }); sendGeom(selFe);
      } else if (k === 'Delete' || k === 'Backspace') {
        e.preventDefault(); post({ type: 'deck:el', action: 'remove', index: slideIndex(selFe), id: selFe.getAttribute('data-el') });
      } else if ((k === 'd' || k === 'D') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); post({ type: 'deck:el', action: 'duplicate', index: slideIndex(selFe), id: selFe.getAttribute('data-el') });
      } else if (k === 'Escape') selectFe(null, true);
    });
    deck.addEventListener('pointerdown', onDown);
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onUp);
    deck.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[contenteditable]') || t.closest('.fe')) return;
      var m = t.closest('[data-m]');
      if (m) { e.preventDefault(); mediaMsg(m); }
    });
    deck.addEventListener('dblclick', function (e) {
      var fe = e.target.closest('.fe'); if (!fe) return;
      // Khi kéo, con trỏ bị "bắt" vào khối .fe (setPointerCapture) → e.target là chính khối, không phải chữ/ảnh bên trong
      // → lấy phần tử thật dưới con trỏ.
      var t = document.elementFromPoint(e.clientX, e.clientY);
      if (!t || !fe.contains(t)) t = e.target;
      var m = t.closest('[data-m]') || fe.querySelector('[data-m]');
      if (m) { mediaMsg(m); return; }
      var el = edEl(t) || fe.querySelector('[data-e]');
      if (el) startEditFree(el, e.clientX, e.clientY);
    });
    addEventListener('message', function (e) {
      if (e.source !== window.parent) return;
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'deck:goto') { var idx = Number(d.index); if (Number.isInteger(idx) && idx !== cur) { selectFe(null, false); show(idx, true); } }
      else if (d.type === 'deck:render') applyRender(d);
      else if (d.type === 'deck:select') {
        var id = String(d.id || '').replace(/[^a-z0-9-]/gi, '');
        var fe = id && slides[cur] ? slides[cur].querySelector('.fe[data-el="' + id + '"]') : null;
        selectFe(fe, false);
        if (fe && d.edit) { var t = fe.querySelector('[data-e]'); if (t) startEditFree(t); }
      }
    });
    post({ type: 'deck:ready', count: N });
    readyResolve();
  }

  // Chờ font tải xong mới đo/co chữ (tối đa 2,5 giây).
  var started = false;
  function go() { if (started) return; started = true; start(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
  setTimeout(go, 2500);
})();
