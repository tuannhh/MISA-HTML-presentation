// CT-001: HTML lạ (nhập bài HTML) không được tạo bất kỳ kết nối mạng nào — kể cả popup, WebSocket, EventSource, beacon, Worker,
// chuyển trang, iframe, WebRTC. Máy chủ thử nghe loopback phải nhận 0 request. Chạy Chromium thật; không có Chromium thì bỏ qua.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { existsSync } from 'node:fs';
import { createBrowserService, withImportCsp, IMPORT_CSP } from '../../src/services/browserService.js';

const CHROME = [process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => p && existsSync(p));
const skip = CHROME ? false : 'không có Chromium';

test('withImportCsp: chèn sau <head>, không đặt trước doctype, giữ nguyên phần còn lại', () => {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${IMPORT_CSP}">`;
  assert.equal(withImportCsp('<!doctype html><html><head><title>x</title></head><body></body></html>'), `<!doctype html><html><head>${meta}<title>x</title></head><body></body></html>`);
  assert.ok(withImportCsp('<HTML lang="vi"><HEAD data-x="1"><title>x').includes(`<HEAD data-x="1">${meta}`));
  assert.ok(withImportCsp('<!doctype html><html><body>a</body></html>').startsWith(`<!doctype html><html><head>${meta}</head><body>`));
  assert.ok(withImportCsp('<!DOCTYPE html><body>a').startsWith(`<!DOCTYPE html><head>${meta}</head>`));
  assert.ok(withImportCsp('<p>chỉ là đoạn</p>').startsWith(`<head>${meta}</head><p>`));
});

test('HTML lạ: 10 kênh ra mạng + WebRTC đều 0 request; trang vẫn chạy JS của chính nó; PDF bài thường vẫn xuất được', { skip, timeout: 90000 }, async () => {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.end('ok');
  });
  srv.on('upgrade', (req, sock) => {
    hits.push(`UPGRADE ${req.url}`);
    sock.destroy();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const T = `http://127.0.0.1:${port}`;
  const html = `<!doctype html><html><head><title>Bài thử</title></head><body>
<img src="${T}/img"><iframe src="${T}/iframe"></iframe><link rel="stylesheet" href="${T}/css">
<script>
window.__ran = 'js-chay';
try { fetch('${T}/fetch').catch(()=>{}); } catch(e){}
try { window.open('${T}/popup'); } catch(e){}
try { new WebSocket('ws://127.0.0.1:${port}/ws'); } catch(e){}
try { new EventSource('${T}/sse'); } catch(e){}
try { navigator.sendBeacon('${T}/beacon', 'x'); } catch(e){}
try { new Worker(URL.createObjectURL(new Blob(["fetch('${T}/worker').catch(()=>{})"]))); } catch(e){}
try { const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${port}' }] }); pc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o)); } catch(e){}
setTimeout(() => { try { location.href = '${T}/nav'; } catch(e){} }, 300);
</script></body></html>`;
  const b = createBrowserService({ chromePath: CHROME, noSandbox: process.platform === 'linux', timeoutMs: 30000 });
  let ran;
  try {
    // inspectHtmlDeck = đường nhập HTML lạ (context riêng + CSP). Trang không có slide → có thể trả rỗng, không quan tâm kết quả.
    await b.inspectHtmlDeck(html, { width: 800, height: 450, timeout: 20000 }).catch(() => null);
    await new Promise((r) => setTimeout(r, 1200));
    ran = await b.pdf('<html><body>chỉ là trang thường</body></html>', { width: 800, height: 450 });
  } finally {
    await b.close();
    srv.close();
  }
  assert.deepEqual([...new Set(hits)], [], `máy chủ thử nhận request: ${hits.join(', ')}`);
  assert.ok(ran.length > 100, 'PDF của bài thường vẫn xuất được');
});

test('chặn cấp tiến trình: kể cả trang thường (không CSP, không context riêng) cũng không ra được mạng bằng popup/WebSocket', { skip, timeout: 60000 }, async () => {
  const hits = [];
  const srv = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.end('ok');
  });
  srv.on('upgrade', (req, sock) => {
    hits.push(`UPGRADE ${req.url}`);
    sock.destroy();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const html = `<html><body><script>
try { window.open('http://127.0.0.1:${port}/popup'); } catch(e){}
try { new WebSocket('ws://127.0.0.1:${port}/ws'); } catch(e){}
</script>trang</body></html>`;
  const b = createBrowserService({ chromePath: CHROME, noSandbox: process.platform === 'linux', timeoutMs: 30000 });
  try {
    await b.pdf(html, { width: 800, height: 450 });
    await new Promise((r) => setTimeout(r, 1000));
  } finally {
    await b.close();
    srv.close();
  }
  assert.deepEqual([...new Set(hits)], [], `máy chủ thử nhận request: ${hits.join(', ')}`);
});
