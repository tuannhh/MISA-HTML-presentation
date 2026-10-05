/* MISA Presentation — engine chuyển động (chạy trong trang bài trình bày, script cổ điển, không phụ thuộc thư viện).
   Kiểu Remotion: mỗi khung hình f (30fps) → spring/interpolate → transform/opacity. Không dùng CSS animation
   để có thể "tua" tới khung cuối khi chụp thumbnail / in PDF.
   Chế độ: present (mặc định) · still (?still&slide=N — 1 slide, khung cuối) · print (mọi slide, khung cuối).
   API cho trình duyệt tự động: window.__deck = { count, ready, goto(i, frame) }.
   Nhúng trong khung xem trước: nhận postMessage {type:'deck:goto', index}, gửi {type:'deck:slide', index, count}
   và {type:'deck:video', provider, id|src, title} khi bấm video (khung sandbox không phát được YouTube → ứng dụng mở lớp phát).
   Mẫu nền chuyển động: window.DeckBg (shared/deck/backgrounds.js, được ghép trước engine). */
(function () {
  'use strict';
  var deck = document.getElementById('deck');
  if (!deck) return;
  var W = +deck.getAttribute('data-w') || 2560;
  var H = +deck.getAttribute('data-h') || 1440;
  var FPS = 30;
  var qs = new URLSearchParams(location.search);
  var DM = deck.getAttribute('data-mode');
  var MODE = DM === 'print' ? 'print' : DM === 'still' || qs.has('still') || qs.has('export') ? 'still' : 'present';
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
  function fitAll() { slides.forEach(fitSlide); }

  /* ---------- timeline từng slide ---------- */
  var nf = new Intl.NumberFormat('vi-VN');
  function buildTimelines() {
    return slides.map(function (slide) {
      var map = new Map();
      function get(el) { if (!map.has(el)) map.set(el, { el: el, an: null, lp: null }); return map.get(el); }
      slide.querySelectorAll('[data-a]').forEach(function (el) {
        var a = el.getAttribute('data-a');
        var d = +(el.getAttribute('data-d') || 0);
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

  function render(i, f, t) {
    if (t === undefined) t = f / FPS;
    var list = timelines[i] || [];
    for (var n = 0; n < list.length; n++) {
      var it = list[n], el = it.el, tf = '', op = null, fl = null, s, A = it.an;
      if (A) {
        var lf = f - A.d;
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
  var bgName = deck.getAttribute('data-bg') || 'network';
  if (cx && bgName !== 'none' && window.DeckBg) {
    cv.width = CW; cv.height = CH;
    var cs = getComputedStyle(document.documentElement);
    var node = rgbVar(cs, '--node', '160,220,255'), edge = rgbVar(cs, '--edge', '46,230,214');
    painter = window.DeckBg.create(cx, {
      name: bgName, width: CW, height: CH, node: node, edge: edge,
      accent: rgbVar(cs, '--accent', edge), accent2: rgbVar(cs, '--accent-2', node),
      light: document.documentElement.getAttribute('data-tone') === 'light', seed: 7,
    });
  }
  function drawBg(t) { if (painter) painter.draw(t); }

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
    try { window.parent.postMessage({ type: 'deck:slide', index: cur, count: N }, '*'); } catch (e) { /* bỏ qua */ }
  }
  function show(i, instant) {
    frozen = null;
    i = clamp(i, 0, N - 1);
    var prevEl = slides[cur];
    if (i !== cur && prevEl) { prevEl.classList.remove('on'); prevEl.classList.add('off'); prevEl.setAttribute('aria-hidden', 'true'); setTimeout(function () { prevEl.classList.remove('off'); }, 700); }
    cur = i; t0 = performance.now() - (instant ? FINAL / FPS * 1000 : 0);
    render(cur, instant ? FINAL : 0);
    slides[cur].classList.add('on'); slides[cur].removeAttribute('aria-hidden');
    if (countEl) countEl.textContent = pad(cur + 1) + ' / ' + pad(N);
    if (barEl) barEl.style.width = ((cur + 1) / N * 100) + '%';
    if (!EMBED) { try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) { /* bỏ qua */ } }
    notify();
  }
  function next() { show(cur + 1); }
  function prev() { show(cur - 1); }

  var readyResolve; var ready = new Promise(function (r) { readyResolve = r; });
  window.__deck = {
    count: N, ready: ready,
    goto: function (i, frame) {
      slides.forEach(function (s, k) { s.style.transition = 'none'; s.classList.toggle('on', k === i); s.classList.remove('off'); });
      cur = clamp(i, 0, N - 1); frozen = frame === undefined ? FINAL : frame; render(cur, frozen, 0); drawBg(0);
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
      if (painter) { try { painter.draw(0); deck.style.setProperty('--bgimg', 'url(' + cv.toDataURL('image/png') + ')'); } catch (e) { /* bỏ qua */ } }
      slides.forEach(function (s, i) { s.removeAttribute('aria-hidden'); render(i, FINAL, 0); });
      readyResolve(); return;
    }
    if (MODE === 'still') {
      document.body.classList.add('still');
      fit(); addEventListener('resize', fit);
      var si = clamp((+qs.get('slide') || 1) - 1, 0, N - 1);
      window.__deck.goto(si, +(qs.get('frame') || FINAL));
      readyResolve(); return;
    }

    if (EMBED) document.body.classList.add('embed');
    fit(); addEventListener('resize', fit);
    var h = parseInt((location.hash || '').slice(1), 10);
    show(isNaN(h) ? 0 : h - 1, REDUCE);
    (function loop(now) {
      if (frozen === null) {
        var f = REDUCE ? FINAL : (now - t0) / 1000 * FPS;
        render(cur, f, REDUCE ? 0 : now / 1000);
        drawBg(REDUCE ? 0 : now / 1000);
      }
      requestAnimationFrame(loop);
    })(performance.now());

    addEventListener('keydown', function (e) {
      var k = e.key;
      if (ov) { if (k === 'Escape') closeVideo(); return; }
      // Enter/Space trên nút phát video → để nút nhận lệnh bấm, không chuyển trang.
      if ((k === 'Enter' || k === ' ') && e.target && e.target.closest && e.target.closest('.vplay')) return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].indexOf(k) >= 0) { e.preventDefault(); next(); }
      else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].indexOf(k) >= 0) { e.preventDefault(); prev(); }
      else if (k === 'Home') show(0); else if (k === 'End') show(N - 1);
      else if (k === 'r' || k === 'R') show(cur);
      else if (k === 'f' || k === 'F') toggleFs();
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
      var fig = e.target && e.target.closest ? e.target.closest('.vid') : null;
      if (fig) { e.stopPropagation(); playVideo(fig); return; }
      if (e.clientX < innerWidth * .3) prev(); else next();
    });
    var tx = null;
    addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    addEventListener('touchend', function (e) { if (tx === null || ov) return; var dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) { if (dx < 0) next(); else prev(); } tx = null; });
    var idle; function wake() { document.body.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { document.body.classList.add('idle'); }, 2500); }
    addEventListener('mousemove', wake); wake();
    setTimeout(function () { var hn = document.getElementById('hint'); if (hn) hn.style.opacity = '0'; }, 4500);
    addEventListener('message', function (e) {
      var d = e.data;
      if (!d || typeof d !== 'object' || d.type !== 'deck:goto') return;
      var idx = Number(d.index);
      if (Number.isInteger(idx)) show(idx, !!d.instant);
    });
    readyResolve();
  }

  // Chờ font tải xong mới đo/co chữ (tối đa 2,5 giây).
  var started = false;
  function go() { if (started) return; started = true; start(); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go);
  setTimeout(go, 2500);
})();
