// Bàn soát chữ (đo trên trang đã dựng, không dùng AI): chạy TRONG trang của trình duyệt (browserService.lintDeck → page.evaluate),
// trả lỗi dàn chữ nhìn thấy được của từng trang — chữ rơi 1 từ xuống dòng cuối, chữ tràn/bị cắt khỏi khung, hình/biểu tượng/huy hiệu đè lên chữ,
// chữ phải co quá nhỏ. presentationService dùng điểm này để chọn kiểu trình bày (fitPass) và sửa tự động.
// lintInPage phải tự chứa (được tuần tự hoá sang trang) — không tham chiếu biến ngoài hàm.

export const LINT_KINDS = Object.freeze(['orphan', 'clip', 'spill', 'overlap', 'tiny']);
// Trọng số trừ điểm (điểm trang = hệ số co chữ k − tổng phạt): lỗi che/cắt chữ nặng hơn lỗi thẩm mỹ.
// 0.25: trang chữ nguyên cỡ (k = 1) mà có lỗi che/cắt chữ vẫn rơi dưới ngưỡng FIT_TIGHT → được thử kiểu trình bày khác.
export const LINT_WEIGHT = Object.freeze({ orphan: 0.04, clip: 0.25, spill: 0.25, overlap: 0.25, tiny: 0 });

/** Điểm 1 trang: k (1 = chữ nguyên cỡ) trừ phạt theo lỗi; cao hơn = tốt hơn. */
export function lintScore(r) {
  const k = Number(r?.k) || 1;
  const pen = (r?.issues || []).reduce((n, x) => n + (LINT_WEIGHT[x.kind] || 0), 0);
  return Math.round((k - Math.min(pen, 0.6)) * 1000) / 1000;
}

/** Gộp số lỗi theo loại của cả bài (ghi log). */
export function lintTotals(list) {
  const out = {};
  for (const r of list || []) for (const x of r.issues || []) out[x.kind] = (out[x.kind] || 0) + 1;
  return out;
}

const HARD = new Set(['clip', 'spill', 'overlap']);
/**
 * Sửa tự động lỗi che/cắt chữ còn lại sau khi đã thử các kiểu trình bày (không dùng AI, chỉ GỠ phần tử trang trí gây lỗi — không đụng nội dung):
 * huy hiệu "mục then chốt" tràn/đè chữ → bỏ huy hiệu của trang; hình trong hộp câu chốt đè chữ → câu chốt về dạng dải (không hình).
 * Trả số trang đã sửa.
 */
export function lintFixes(spec, lint) {
  let fixed = 0;
  (lint || []).forEach((r, i) => {
    const s = spec?.slides?.[i];
    const hard = (r?.issues || []).filter((x) => HARD.has(x.kind));
    if (!s || !hard.length) return;
    let did = false;
    if (hard.some((x) => x.at === 'fbadge' || x.with === 'fbadge')) {
      for (const key of ['items', 'steps']) {
        for (const it of s[key] || []) {
          if (it.badge) {
            delete it.badge;
            did = true;
          }
        }
      }
    }
    if (hard.some((x) => x.with === 'cq-art') && s.callout?.style === 'quote') {
      s.callout.style = 'band';
      if (s.image?.frame === 'art') delete s.image;
      did = true;
    }
    if (did) fixed += 1;
  });
  return fixed;
}

/* eslint-disable no-undef */
export async function lintInPage() {
  const slides = Array.from(document.querySelectorAll('#deck .slide'));
  const HEAD = '.title, .cv-title, .sec-t, .cl-t, h3, h4, .co-t, .qt-text, .sub, .st-hero p';
  const TEXT = `${HEAD}, p, li, .label, .tag, .chip, .ilab, .fbadge, .kicker, .co-s, .cv-cap, .im-cap, figcaption, blockquote`;
  const ART = 'img, .ib, .ic, .co-ic, .cq-mk, .fbadge, .num, .cn, .ps-n, .arr, .vs, .hub';
  const BOX = '.panel, .card, .callout, .fbadge, .chip, .tag, .label, .bi, .crow, .col';
  const vis = (el) => {
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  // Dòng chữ thật của 1 phần tử: mỗi từ 1 khung → gom theo dòng (cùng toạ độ y).
  const lines = (el) => {
    const out = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const re = /\S+/g;
      for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        const r = range.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const last = out[out.length - 1];
        const mid = r.top + r.height / 2;
        if (last && mid > last.top && mid < last.bottom) {
          last.words.push(m[0]);
          last.left = Math.min(last.left, r.left);
          last.right = Math.max(last.right, r.right);
          last.top = Math.min(last.top, r.top);
          last.bottom = Math.max(last.bottom, r.bottom);
        } else out.push({ words: [m[0]], left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
    }
    return out;
  };
  const cut = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const nameOf = (el) => (el.className && String(el.className).split(' ')[0]) || (el.parentElement && el.parentElement.className && String(el.parentElement.className).split(' ')[0]) || el.tagName.toLowerCase();
  const inter = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const result = [];
  document.body.classList.add('still');
  for (let i = 0; i < slides.length; i += 1) {
    const s = slides[i];
    window.__deck.goto(i);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const k = Number(s.style.getPropertyValue('--k')) || 1;
    const sr = s.getBoundingClientRect();
    const unit = sr.width / 1920 || 1;
    const tol = 3 * unit;
    const issues = [];
    const push = (kind, el, extra) => issues.length < 12 && issues.push({ kind, at: nameOf(el), text: cut(el.textContent), ...(extra ? { with: extra } : {}) });
    const texts = Array.from(s.querySelectorAll(TEXT)).filter((el) => el.textContent.trim() && vis(el) && !el.closest('.fe'));
    const inked = [];
    for (const el of texts) {
      // Phần tử chữ lồng trong phần tử chữ khác (p trong blockquote…) chỉ tính phần tử trong cùng.
      if (el.querySelector(TEXT)) continue;
      const ls = lines(el);
      if (!ls.length) continue;
      const box = { left: Math.min(...ls.map((l) => l.left)), right: Math.max(...ls.map((l) => l.right)), top: ls[0].top, bottom: ls[ls.length - 1].bottom };
      inked.push({ el, box, ls });
      // Rơi chữ: dòng cuối chỉ 1 từ ngắn, hoặc ngắn hơn hẳn các dòng trên ở tiêu đề.
      if (ls.length >= 2) {
        const last = ls[ls.length - 1];
        const widest = Math.max(...ls.slice(0, -1).map((l) => l.right - l.left));
        const head = el.matches(HEAD);
        const lone = last.words.length === 1 && last.words[0].length <= 9;
        if ((head && lone) || (!head && lone && last.right - last.left < widest * 0.12)) push('orphan', el);
      }
      // Bị cắt: khung chữ có overflow ẩn mà nội dung vượt khung.
      const cs = getComputedStyle(el);
      if (cs.overflow !== 'visible' && (el.scrollWidth > el.clientWidth + 2 || el.scrollHeight > el.clientHeight + 2)) push('clip', el);
      // Tràn khỏi hình chứa nó (thẻ, hộp, huy hiệu, nhãn) hoặc khỏi trang.
      const host = el.matches(BOX) ? el : el.closest(BOX);
      const hr = host ? host.getBoundingClientRect() : null;
      if (hr && hr.width && (box.left < hr.left - tol || box.right > hr.right + tol || box.top < hr.top - tol || box.bottom > hr.bottom + tol)) push('spill', el);
      else if (box.left < sr.left - tol || box.right > sr.right + tol || box.top < sr.top - tol || box.bottom > sr.bottom + tol) push('spill', el, 'slide');
    }
    // Hình / biểu tượng / huy hiệu / logo đè lên dòng chữ của phần tử khác.
    const arts = Array.from(s.querySelectorAll(ART)).filter((el) => vis(el) && !el.closest('.fe') && !el.closest('.bleed, .acc-bg'));
    const logo = s.querySelector('.logo, .lg') || document.querySelector('.deck-logo');
    if (logo && vis(logo)) arts.push(logo);
    for (const a of arts) {
      const ar = a.getBoundingClientRect();
      if (ar.width < 8 * unit || ar.height < 8 * unit) continue;
      for (const t of inked) {
        if (a === t.el || a.contains(t.el) || t.el.contains(a)) continue;
        if (inter(ar, t.box) < 40 * unit * unit) continue;
        const hit = t.ls.some((l) => inter(ar, l) > Math.min(60 * unit * unit, (l.right - l.left) * (l.bottom - l.top) * 0.15));
        if (hit) {
          push('overlap', t.el, nameOf(a));
          break;
        }
      }
    }
    if (k < 0.6) issues.push({ kind: 'tiny', at: 'slide', text: '' });
    result.push({ k, issues });
  }
  return result;
}
