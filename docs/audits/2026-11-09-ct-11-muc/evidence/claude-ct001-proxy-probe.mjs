// Thử phương án chặn mạng cấp tiến trình Chromium cho CT-001: proxy chết + bỏ ngoại lệ loopback + chặn popup + CSP meta.
// Máy chủ thử nghe 127.0.0.1 (HTTP + nâng cấp WebSocket); HTML lạ thử fetch / img / iframe / popup / WebSocket / EventSource / Worker / sendBeacon / navigation.
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire('/Users/tuanbui/MISA-HTML-presentation/package.json');
const puppeteer = require('puppeteer-core');

const hits = [];
const srv = http.createServer((req, res) => { hits.push(`${req.method} ${req.url}`); res.end('ok'); });
srv.on('upgrade', (req, sock) => { hits.push(`UPGRADE ${req.url}`); sock.destroy(); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const T = `http://127.0.0.1:${port}`;
const html = (csp) => `<!doctype html><html><head>${csp ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'unsafe-inline' data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:">` : ''}</head><body>
<img src="${T}/img"><iframe src="${T}/iframe"></iframe>
<script>
try { fetch('${T}/fetch').catch(()=>{}); } catch(e){}
try { window.open('${T}/popup'); } catch(e){}
try { new WebSocket('ws://127.0.0.1:${port}/ws'); } catch(e){}
try { new EventSource('${T}/sse'); } catch(e){}
try { navigator.sendBeacon('${T}/beacon', 'x'); } catch(e){}
try { new Worker(URL.createObjectURL(new Blob(["fetch('${T}/worker').catch(()=>{})"]))); } catch(e){}
setTimeout(() => { try { location.href = '${T}/nav'; } catch(e){} }, 300);
</script></body></html>`;

async function run(label, args, { csp = false, popupGuard = false } = {}) {
  hits.length = 0;
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args });
  if (popupGuard) b.on('targetcreated', async (t) => { if (t.type() === 'page' && t.opener()) (await t.page())?.close().catch(() => {}); });
  const p = await b.newPage();
  await p.setRequestInterception(true);
  p.on('request', (r) => (r.url().startsWith('data:') || r.url().startsWith('blob:') || r.url() === 'about:blank' ? r.continue() : r.abort('blockedbyclient')));
  await p.setContent(html(csp), { waitUntil: 'load' }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  await b.close();
  console.log(label.padEnd(44), hits.length ? `LỌT: ${[...new Set(hits)].join(', ')}` : '0 request');
}
await run('Hiện tại (chỉ chặn request của trang)', ['--no-sandbox']);
await run('+ proxy chết, bỏ ngoại lệ loopback', ['--no-sandbox', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>']);
await run('+ proxy chết + chặn popup + CSP meta', ['--no-sandbox', '--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'], { csp: true, popupGuard: true });
srv.close();
