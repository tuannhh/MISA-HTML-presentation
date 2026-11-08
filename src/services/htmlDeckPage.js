// Mã chạy TRONG trang HTML lạ (Chromium headless, mạng bị chặn) khi nhập bài trình bày — puppeteer tuần tự hoá từng hàm
// (toString) nên mỗi hàm phải tự chứa, không dùng biến ngoài. Dùng bởi browserService.inspectHtmlDeck:
//   PAGE_SETUP → (cách 1) bấm phím → như người trình chiếu: PAGE_VISIBLE / PAGE_SETTLE / PAGE_READ từng trang, chụp trạng thái
//   cuối (đã hiện hết các bước); (cách 2, bài không điều khiển được bằng phím) PAGE_FORCE ép hiện từng trang rồi PAGE_READ.

/** Chuẩn bị: chờ phông, tìm danh sách trang, ẩn thanh điều khiển/gợi ý của công cụ cũ. → { count, total, title } */
export async function PAGE_SETUP(maxSlides) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, wait(4000)]);
  } catch (e) { /* bỏ qua */ }
  await wait(600);
  const top = (list, sel) => list.filter((el) => !el.parentElement || !el.parentElement.closest(sel));
  let slides = [...document.querySelectorAll('.reveal .slides section')].filter((s) => !s.querySelector('section'));
  if (!slides.length) {
    for (const sel of ['section.slide', '.slide', '[data-slide]', '.swiper-slide', '.page', 'section']) {
      const l = top([...document.querySelectorAll(sel)], sel);
      if (l.length >= 2 || (l.length === 1 && sel !== 'section' && sel !== '.page')) { slides = l; break; }
    }
  }
  if (!slides.length) slides = [document.body];
  const total = slides.length;
  slides = slides.slice(0, maxSlides);
  const st = document.createElement('style');
  st.textContent = [
    '[data-imp-off]{display:none!important}',
    '[data-imp-on]{visibility:visible!important;opacity:1!important}',
    '[data-imp-chrome]{display:none!important}',
    'html.imp-plain [data-imp-cur],html.imp-plain [data-imp-cur] *{text-transform:none!important}',
    'html,body{scroll-behavior:auto!important}*{caret-color:transparent!important}',
  ].join('\n');
  document.head.appendChild(st);
  // Thanh điều khiển/tiến độ/gợi ý phím của công cụ cũ (ngoài các trang): theo tên lớp/mã, hoặc phần tử cố định nhỏ.
  const inSlide = (el) => slides.some((s) => s === el || s.contains(el) || el.contains(s));
  const CHROME = 'button,[class*="nav"],[id*="nav"],[class*="control"],[id*="control"],[id*="hud"],[class*="hud"],[class*="progress"],[id*="progress"],[class*="toolbar"],[id*="toolbar"],[id*="toast"],[class*="toast"],[class*="hint"],[id*="hint"],[class*="help"],[id*="help"],[class*="counter"],[id*="count"],[class*="pager"]';
  const mark = () => {
    for (const el of document.querySelectorAll(CHROME)) if (!inSlide(el)) el.setAttribute('data-imp-chrome', '');
    for (const el of document.body.querySelectorAll('*')) {
      if (el.hasAttribute('data-imp-chrome') || inSlide(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      const b = el.getBoundingClientRect();
      if (b.width * b.height > 0 && b.width * b.height < innerWidth * innerHeight * 0.12) el.setAttribute('data-imp-chrome', '');
    }
  };
  mark();
  window.__imp = { slides, images: [], seen: new Map(), mark };
  return { count: slides.length, total, title: (document.title || '').trim().slice(0, 200) };
}

/** Chỉ số trang đang hiện (diện tích nhìn thấy lớn nhất), -1 nếu không xác định. */
export function PAGE_VISIBLE() {
  const S = window.__imp;
  let best = -1;
  let area = innerWidth * innerHeight * 0.15;
  S.slides.forEach((s, i) => {
    const cs = getComputedStyle(s);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.5) return;
    const b = s.getBoundingClientRect();
    const w = Math.min(innerWidth, b.right) - Math.max(0, b.left);
    const h = Math.min(innerHeight, b.bottom) - Math.max(0, b.top);
    if (w > 0 && h > 0 && w * h > area) { area = w * h; best = i; }
  });
  return best;
}

/** Chờ trang ổn định: chạy xong mọi hiệu ứng (Web Animations/CSS), kể cả hiệu ứng có độ trễ. */
export async function PAGE_SETTLE(ms) {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (t) => new Promise((r) => setTimeout(r, t));
  const finish = () => {
    for (const a of document.getAnimations ? document.getAnimations() : []) {
      try {
        const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : null;
        if (t && t.iterations === Infinity) continue;
        a.finish();
      } catch (e) { /* bỏ qua */ }
    }
  };
  await frame();
  await wait(ms);
  finish();
  await frame();
  finish();
  await wait(40);
}

/** Cách 2: ép hiện trang i (ẩn trang khác, bật lớp "đang hiện" phổ biến, hiện phần tử đang ẩn chờ hiệu ứng). */
export function PAGE_FORCE(i) {
  const S = window.__imp;
  const ACT = ['active', 'on', 'present', 'current', 'is-active', 'visible', 'show', 'shown', 'in', 'enter', 'swiper-slide-active'];
  const OFF = ['past', 'future', 'prev', 'next', 'hidden', 'out', 'leave', 'is-hidden'];
  const cur = S.slides[i];
  S.slides.forEach((s, j) => {
    if (j === i) {
      s.removeAttribute('data-imp-off');
      s.setAttribute('data-imp-on', '');
      ACT.forEach((c) => s.classList.add(c));
      OFF.forEach((c) => s.classList.remove(c));
      s.removeAttribute('hidden');
      let p = s.parentElement; // reveal.js: chồng trang dọc chứa trang hiện tại cũng phải "present"
      while (p && p !== document.body) { if (p.tagName === 'SECTION') { p.classList.add('present'); p.classList.remove('past', 'future'); } p = p.parentElement; }
    } else if (!s.contains(cur)) {
      s.setAttribute('data-imp-off', '');
      s.removeAttribute('data-imp-on');
      ACT.forEach((c) => s.classList.remove(c));
    }
  });
  try { cur.scrollIntoView({ block: 'start' }); } catch (e) { /* bỏ qua */ }
  if (cur === document.body) scrollTo(0, 0);
  // Phần tử ẩn chờ hiệu ứng do JS kích hoạt (opacity 0) → hiện ra ở trạng thái cuối.
  for (const el of cur.querySelectorAll('*')) {
    if (el.hasAttribute('data-imp-chrome')) continue;
    const cs = getComputedStyle(el);
    if (Number(cs.opacity) < 0.05 && cs.display !== 'none') { el.style.setProperty('opacity', '1', 'important'); el.style.setProperty('transform', 'none', 'important'); }
  }
}

/** Dấu vân tay chữ của trang i (số đếm chạy bằng JS còn đổi → chưa ổn định). */
export function PAGE_SIG(i) {
  const cur = window.__imp.slides[i];
  return cur ? (cur.innerText || '').slice(0, 4000) : '';
}

/** Đọc nội dung trang i đang hiện: vùng chụp, tiêu đề, chữ (bỏ biến đổi IN HOA của CSS), ghi chú, ảnh nhúng, khung video. */
export async function PAGE_READ(i, refs) {
  const S = window.__imp;
  S.mark();
  const cur = S.slides[i];
  const vw = innerWidth;
  const vh = innerHeight;
  const r = cur.getBoundingClientRect();
  const x0 = Math.max(0, r.left);
  const y0 = Math.max(0, r.top);
  const x1 = Math.min(vw, r.right);
  const y1 = Math.min(vh, r.bottom);
  const usable = cur !== document.body && x1 - x0 >= vw * 0.4 && y1 - y0 >= vh * 0.4;
  const clip = usable ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : { x: 0, y: 0, width: vw, height: vh };
  const area = clip.width * clip.height;
  const rel = (b) => ({ x: ((b.left - clip.x) / clip.width) * 100, y: ((b.top - clip.y) / clip.height) * 100, w: (b.width / clip.width) * 100, h: (b.height / clip.height) * 100 });
  const visible = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 4 && b.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05; };
  const imgs = [];
  const addSrc = async (src, el) => {
    if (!src || /^data:image\/svg/i.test(src)) return;
    let uri = src;
    if (src.startsWith('blob:')) {
      try {
        const blob = await (await fetch(src)).blob();
        uri = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = () => res(''); fr.readAsDataURL(blob); });
      } catch (e) { return; }
    }
    if (!/^data:image\//i.test(uri)) return;
    const b = el.getBoundingClientRect();
    if (b.width * b.height < area * 0.02) return;
    let k = S.seen.get(uri);
    if (k === undefined) { k = S.images.length; S.images.push(uri); S.seen.set(uri, k); }
    if (!imgs.includes(k)) imgs.push(k);
  };
  for (const im of cur.querySelectorAll('img')) if (visible(im)) await addSrc(im.currentSrc || im.src, im);
  let n = 0;
  for (const el of [cur, ...cur.querySelectorAll('*')]) {
    if (++n > 4000) break;
    const bg = getComputedStyle(el).backgroundImage;
    if (bg && bg.indexOf('url("data:image/') >= 0 && visible(el)) {
      const m = /url\("(data:image\/[^"]+)"\)/.exec(bg);
      if (m) await addSrc(m[1], el);
    }
  }
  const videoRefs = [];
  const html = cur === document.body ? '' : cur.outerHTML.length < 4e6 ? cur.outerHTML : '';
  for (const v of cur.querySelectorAll('video, video source')) {
    const m = /impvid-\d+/.exec(v.getAttribute('src') || '');
    if (m && !videoRefs.includes(m[0])) videoRefs.push(m[0]);
  }
  for (const ref of refs) if (html && !videoRefs.includes(ref) && (html.includes(`"${ref}"`) || html.includes(`'${ref}'`) || html.includes(`#${ref}`))) videoRefs.push(ref);
  let vbox = null;
  let vEl = null;
  let best = 0;
  for (const el of cur.querySelectorAll('video, iframe, [class*="video"], [class*="vframe"], [class*="vid"], [data-video]')) {
    if (!visible(el)) continue;
    const b = el.getBoundingClientRect();
    const a = b.width * b.height;
    if (a > best && a >= area * 0.04 && a <= area * 0.98) { best = a; vbox = rel(b); vEl = el; }
  }
  const notesEl = cur.querySelector('aside.notes, .notes, [data-notes]');
  const notes = (notesEl ? notesEl.textContent : cur.getAttribute('data-notes') || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (notesEl) notesEl.setAttribute('data-imp-chrome', '');
  // Chữ gốc (không theo text-transform: uppercase của CSS) — bật tạm lớp imp-plain khi đọc.
  // Chữ trong khung video (gợi ý "bấm để phát" của công cụ cũ khi video chưa nạp) không phải nội dung trang → ẩn tạm khi đọc.
  const vDisp = vEl ? vEl.style.getPropertyValue('display') : '';
  if (vEl) vEl.style.setProperty('display', 'none', 'important');
  cur.setAttribute('data-imp-cur', '');
  document.documentElement.classList.add('imp-plain');
  const head = cur.querySelector('h1, h2, h3, [class*="title"]');
  const title = (cur.getAttribute('data-title') || (head ? head.innerText : '') || cur.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const text = (cur.innerText || '').replace(/ /g, ' ').trim().slice(0, 6000);
  document.documentElement.classList.remove('imp-plain');
  cur.removeAttribute('data-imp-cur');
  if (vEl) { if (vDisp) vEl.style.setProperty('display', vDisp); else vEl.style.removeProperty('display'); }
  const ratio = clip.width / clip.height;
  return { title, text, notes, images: imgs, videoRefs, vbox, clip, fit: Math.abs(ratio - vw / vh) / (vw / vh) > 0.02 ? 'contain' : 'cover' };
}
