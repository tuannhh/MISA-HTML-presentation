import http from 'node:http';
import {createBrowserService} from '/app/src/services/browserService.js';
const hits=[];
const server=http.createServer((req,res)=>{hits.push(req.url);res.writeHead(200,{'Content-Type':'text/html'});res.end('<title>probe-owned</title>');});
server.on('upgrade',(req,socket)=>{hits.push(req.url);socket.destroy();});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=createBrowserService({chromePath:'/usr/bin/chromium',noSandbox:true,concurrency:1,timeoutMs:10000});
try {
const html=`<html><body><section class="slide"><h1>Audit local test</h1></section><script>fetch('http://127.0.0.1:${port}/fetch-control').catch(()=>{});window.open('http://127.0.0.1:${port}/popup-probe');try{new WebSocket('ws://127.0.0.1:${port}/websocket-probe')}catch(e){}</script></body></html>`;
const result=await browser.inspectHtmlDeck(html,{width:800,height:450,maxSlides:2,shots:false,settleMs:0,maxSteps:1,timeout:15000});
await new Promise(r=>setTimeout(r,250));
console.log(JSON.stringify({slides:result.total,localRequests:hits,fetchBlocked:!hits.includes('/fetch-control'),popupEscaped:hits.includes('/popup-probe'),webSocketEscaped:hits.includes('/websocket-probe')}));
}catch(e){console.log(JSON.stringify({importError:e.code,localRequests:hits,fetchBlocked:!hits.includes("/fetch-control"),popupEscaped:hits.includes("/popup-probe"),webSocketEscaped:hits.includes("/websocket-probe")}));}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
