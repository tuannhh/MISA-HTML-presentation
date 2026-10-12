// Trình duyệt headless (puppeteer-core + Chromium hệ thống) để chụp thumbnail và xuất PDF.
// An toàn: trang chỉ được nạp HTML do renderer sinh; MỌI request mạng bị chặn trừ data:/about:blank
// (ảnh/font đã nhúng base64) → không thể dùng Chromium làm bàn đạp SSRF.
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { Semaphore } from '../lib/semaphore.js';
import { HttpError } from '../lib/httpError.js';
import { logger } from '../lib/logger.js';

const CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

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
      const args = ['--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio'];
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
  async function withPage(html, viewport, fn) {
    return sem.run(async () => {
      let browser;
      try {
        browser = await getBrowser();
      } catch (err) {
        logger.error('chromium_launch_failed', { err: err.message });
        throw new HttpError(503, 'RENDER_UNAVAILABLE', 'Máy chủ chưa xuất được bài lúc này, vui lòng thử lại sau ít phút');
      }
      const page = await browser.newPage();
      const timer = setTimeout(() => page.close().catch(() => {}), timeoutMs);
      try {
        page.setDefaultTimeout(timeoutMs);
        await page.setRequestInterception(true);
        page.on('request', (req) => {
          const url = req.url();
          if (url.startsWith('data:') || url === 'about:blank') req.continue();
          else req.abort('blockedbyclient');
        });
        await page.setViewport(viewport);
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => (window.__deck ? window.__deck.ready : null));
        return await fn(page);
      } catch (err) {
        if (err instanceof HttpError) throw err;
        logger.warn('render_failed', { err: err.message });
        throw new HttpError(503, 'RENDER_FAILED', 'Xuất bài không thành công (quá thời gian hoặc trình duyệt lỗi), vui lòng thử lại');
      } finally {
        clearTimeout(timer);
        await page.close().catch(() => {});
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
