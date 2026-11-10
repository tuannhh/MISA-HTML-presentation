// Trình duyệt headless (puppeteer-core + Chromium hệ thống) để chụp thumbnail, xuất PDF và đọc bài HTML nhập vào.
// An toàn (CT-001): trang chỉ cần nội dung tự chứa (data:/blob:) nên mạng bị chặn ở 3 lớp.
//  1. CẤP TIẾN TRÌNH — Chromium chạy với proxy chết (127.0.0.1:9, KHÔNG miễn trừ loopback) + tắt UDP của WebRTC: mọi kết nối
//     HTTP/WebSocket/EventSource của MỌI tab (kể cả tab con do window.open mở) đều thất bại; data:/blob: không đi qua proxy.
//  2. CHÍNH SÁCH TRANG — bài HTML lạ được chèn CSP <meta> ở đầu <head> (trang lạ không gỡ được), chạy trong BrowserContext riêng;
//     tab nào trang tự mở ra bị đóng ngay, hết việc thì đóng cả context.
//  3. CHẶN REQUEST của tab chính (puppeteer) — giữ như cũ.
// Lớp 1 không thay được chặn egress ở hạ tầng (docs/DEVOPS-NETWORK.md) — worker nhập HTML không mạng là việc của cổng production.
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { Semaphore } from '../lib/semaphore.js';
import { HttpError } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';
import { PAGE_SETUP, PAGE_VISIBLE, PAGE_SETTLE, PAGE_FORCE, PAGE_READ, PAGE_SIG } from './htmlDeckPage.js';
import { lintInPage } from './deckLint.js';

const CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

// Chính sách cho HTML lạ: chỉ nội dung tự chứa. Gửi đi (connect/frame/form/navigate) đều bị cấm vì default-src 'none'.
export const IMPORT_CSP = "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:";

/** Chèn <meta CSP> ngay sau thẻ mở <head> (không có thì sau <html>, rồi sau doctype, rồi đầu tệp — không đặt trước doctype để khỏi vào quirks mode). */
export function withImportCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${IMPORT_CSP}">`;
  const at = (re) => {
    const m = re.exec(html);
    return m ? m.index + m[0].length : -1;
  };
  const head = at(/<head(?:\s[^>]*)?>/i);
  if (head >= 0) return html.slice(0, head) + meta + html.slice(head);
  const root = at(/<html(?:\s[^>]*)?>/i);
  if (root >= 0) return `${html.slice(0, root)}<head>${meta}</head>${html.slice(root)}`;
  const doc = at(/<!doctype[^>]*>/i);
  if (doc >= 0) return `${html.slice(0, doc)}<head>${meta}</head>${html.slice(doc)}`;
  return `<head>${meta}</head>${html}`;
}

export function createBrowserService({ chromePath, concurrency = 2, noSandbox = false, timeoutMs = 120000 }) {
  const sem = new Semaphore(concurrency);
  let browserPromise = null;
  // Sau close() (tắt máy chủ) không mở lại Chromium: việc nền còn sót (thumbnail) gọi tới sẽ nhận lỗi thay vì
  // khởi động trình duyệt mới không ai đóng — tiến trình treo, không thoát được.
  let closed = false;

  function resolvePath() {
    if (chromePath) return chromePath;
    const found = CANDIDATES.find((p) => existsSync(p));
    if (!found) throw new Error('Không tìm thấy Chromium/Chrome — đặt biến CHROME_PATH');
    return found;
  }

  async function getBrowser() {
    if (closed) throw new Error('browser service đã đóng');
    if (!browserPromise) {
      const args = [
        '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio',
        // CT-001 lớp 1: proxy không tồn tại + không miễn trừ loopback → không tab nào ra được mạng; WebRTC không gửi UDP trực tiếp.
        '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      ];
      if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
      browserPromise = puppeteer.launch({ executablePath: resolvePath(), headless: true, args }).then((b) => {
        b.on('disconnected', () => {
          logger.warn('chromium_disconnected');
          browserPromise = null;
        });
        return b;
      });
      browserPromise.catch(() => {
        browserPromise = null;
      });
    }
    return browserPromise;
  }

  // Lỗi trình duyệt (không khởi động được, hết thời gian, tab bị đóng) → 503 có mã riêng thay vì 500 chung (EXPORT-08):
  // người dùng biết thử lại sau, giám sát đếm được theo mã; chi tiết chỉ ghi log.
  async function withPage(html, viewport, fn, { allowBlob = false, timeout = timeoutMs, isolated = false } = {}) {
    return sem.run(async () => {
      let browser;
      try {
        browser = await getBrowser();
      } catch (err) {
        logger.error('chromium_launch_failed', { err: err.message });
        throw new HttpError(503, 'RENDER_UNAVAILABLE', 'Máy chủ chưa xuất được bài lúc này, vui lòng thử lại sau ít phút');
      }
      // isolated (HTML lạ): context riêng — tab con do trang mở ra bị đóng ngay; hết việc/hết giờ đóng cả context (kéo theo mọi tab).
      const context = isolated ? await browser.createBrowserContext() : null;
      const onTarget = (t) => {
        if (t.type() === 'page' && t.opener()) t.page().then((p) => p?.close()).catch(() => {});
      };
      if (context) context.on('targetcreated', onTarget);
      const closeAll = () => (context ? context.close() : Promise.resolve()).catch(() => {});
      let page;
      try {
        page = await (context || browser).newPage();
      } catch (err) {
        await closeAll();
        logger.error('chromium_launch_failed', { err: err.message });
        throw new HttpError(503, 'RENDER_UNAVAILABLE', 'Máy chủ chưa xuất được bài lúc này, vui lòng thử lại sau ít phút');
      }
      const timer = setTimeout(() => {
        page.close().catch(() => {});
        closeAll();
      }, timeout);
      try {
        page.setDefaultTimeout(timeout);
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith('data:') || url === 'about:blank' || (allowBlob && url.startsWith('blob:'))) req.continue();
          else req.abort('blockedbyclient');
        });
        await page.setViewport(viewport);
        await page.setContent(isolated ? withImportCsp(html) : html, { waitUntil: 'load' });
        await page.evaluate(() => (window.__deck ? window.__deck.ready : null));
        return await fn(page);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        logger.warn('render_failed', { err: err.message });
        throw new HttpError(503, 'RENDER_FAILED', 'Xuất bài không thành công (quá thời gian hoặc trình duyệt lỗi), vui lòng thử lại');
      } finally {
        clearTimeout(timer);
        await page.close().catch(() => {});
        await closeAll();
      }
    });
  }

  return {
    // Số lượt đang chờ trình duyệt (xuất PDF đặt trần theo số này).
    get pending() {
      return sem.pending;
    },
    // Chụp các slide ở khung cuối (đầy đủ nội dung). indices: mảng chỉ số slide.
    async screenshotSlides(html, { width, height, indices, scale = 1 }) {
      return withPage(html, { width, height, deviceScaleFactor: scale }, async (page) => {
        const out = [];
        for (const i of indices) {
          await page.evaluate((idx) => {
            document.body.classList.add('still');
            document.getElementById('deck').style.setProperty('--s', '1');
            window.__deck.goto(idx);
          }, i);
          out.push(await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } }));
        }
        return out;
      });
    },

    // Hệ số co chữ (--k) engine đã chọn cho từng trang: 1 = vừa nguyên cỡ, càng nhỏ trang càng dày so với kiểu trình bày đang dùng.
    async measureFit(html, { width, height }) {
      return withPage(html, { width, height, deviceScaleFactor: 1 }, (page) =>
        page.evaluate(() => Array.from(document.querySelectorAll('#deck .slide'), (s) => Number(s.style.getPropertyValue('--k')) || 1)),
      );
    },

    // Bàn soát chữ (deckLint.lintInPage): lỗi dàn chữ nhìn thấy được của từng trang ở trạng thái đã hiện hết — [{ k, issues: [{ kind, at, text, with? }] }].
    async lintDeck(html, { width, height }) {
      return withPage(html, { width, height, deviceScaleFactor: 1 }, (page) => page.evaluate(lintInPage));
    },

    /**
     * Phân tích bài trình bày HTML thiết kế ở công cụ khác (đã tách video — htmlDeckService.stripHeavyMedia). Mạng bị chặn hết
     * (chỉ data:/blob:; 3 lớp ở đầu tệp) — script của trang chạy trong context riêng. Cách 1: bấm phím → như người trình chiếu, mỗi trang lấy trạng thái SAU
     * bước cuối (đã hiện hết nội dung bấm-mới-hiện); bài không điều khiển được bằng phím (hoặc dừng giữa chừng) → cách 2: ép hiện
     * từng trang còn lại. Mỗi trang: tiêu đề, chữ, ghi chú, ảnh nhúng, khung video, (shots) ảnh chụp.
     * tooMany: tổng số trang > maxSlides → không phân tích, trả { slides: [], total } để báo vượt giới hạn.
     * @returns {{ slides: Array<{ title, text, notes, images: number[], videoRefs: string[], vbox, shot: Buffer|null, fit }>, images: string[], title: string, total: number, mode: string }}
     */
    async inspectHtmlDeck(html, { width, height, shots = false, refs = [], maxSlides = 60, tooMany = false, settleMs = 260, maxSteps = 10, timeout = 300000 }) {
      return withPage(html, { width, height, deviceScaleFactor: 1 }, async (page) => {
        const info = await page.evaluate(PAGE_SETUP, maxSlides);
        // Quá số trang cho phép → trả ngay tổng số trang để báo người dùng (không phân tích/chụp từng trang).
        if (tooMany && info.total > maxSlides) return { slides: [], images: [], title: info.title, total: info.total, mode: 'none' };
        const out = new Array(info.count).fill(null);
        // Trang mới vào: chờ chữ ổn định (số đếm chạy bằng JS, chữ gõ dần…) — tối đa ~2,5 giây; số đếm liên tục (đồng hồ) thì thôi.
        const steady = async (i) => {
          let prev = await page.evaluate(PAGE_SIG, i);
          for (let k = 0; k < 7; k += 1) {
            await new Promise((r) => setTimeout(r, 350));
            const sig = await page.evaluate(PAGE_SIG, i);
            if (sig === prev) return;
            prev = sig;
          }
        };
        const capture = async (i, fresh = false) => {
          if (fresh) await steady(i);
          const s = await page.evaluate(PAGE_READ, i, refs);
          const shot = shots ? await page.screenshot({ type: 'jpeg', quality: 90, clip: s.clip }) : null;
          out[i] = { ...s, shot };
        };
        let mode = 'keys';
        await page.evaluate(PAGE_SETTLE, settleMs);
        let k = info.count > 1 ? await page.evaluate(PAGE_VISIBLE) : -1;
        if (k === 0) {
          await capture(0, true);
          let steps = 0;
          for (let presses = 0; presses < info.count * (maxSteps + 1); presses += 1) {
            await page.keyboard.press('ArrowRight');
            await page.evaluate(PAGE_SETTLE, settleMs);
            const v = await page.evaluate(PAGE_VISIBLE);
            if (v === k) {
              // Bước trong trang (hiện thêm nội dung) → chụp lại; trang cuối hết bước thì dừng.
              steps += 1;
              if (steps > maxSteps) break;
              await capture(k);
            } else if (v === k + 1) {
              k = v;
              steps = 0;
              await capture(k, true);
            } else break;
          }
        }
        const missing = out.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
        if (missing.length) {
          mode = missing.length === info.count ? 'force' : 'keys+force';
          for (const i of missing) {
            await page.evaluate(PAGE_FORCE, i);
            await page.evaluate(PAGE_SETTLE, settleMs);
            await capture(i, true);
          }
        }
        const images = await page.evaluate(() => window.__imp.images);
        return { slides: out, images, title: info.title, total: info.total, mode };
      }, { allowBlob: true, timeout, isolated: true });
    },

    // HTML phải render ở mode 'print' (mỗi slide 1 trang).
    async pdf(html, { width, height }) {
      return withPage(html, { width, height, deviceScaleFactor: 1 }, (page) =>
        page.pdf({ width: `${width}px`, height: `${height}px`, printBackground: true, preferCSSPageSize: false, timeout: timeoutMs }),
      );
    },

    async close() {
      closed = true;
      if (browserPromise) {
        const b = await browserPromise.catch(() => null);
        browserPromise = null;
        if (b) await b.close().catch(() => {});
      }
    },
  };
}
