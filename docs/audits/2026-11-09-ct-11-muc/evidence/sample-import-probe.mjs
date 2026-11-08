import {readFile} from 'node:fs/promises';
import {createBrowserService} from '/app/src/services/browserService.js';
import {stripHeavyMedia} from '/app/src/services/htmlDeckService.js';
const t=Date.now();const buffer=await readFile('/app/sample.html');const cut=stripHeavyMedia(buffer,{maxVideos:10,maxVideoBytes:200*1048576});
console.log(JSON.stringify({phase:'strip',bytes:buffer.length,lightChars:cut.html.length,videos:cut.videos.length,skipped:cut.skipped,ms:Date.now()-t}));
const b=createBrowserService({chromePath:'/usr/bin/chromium',noSandbox:true,concurrency:1});
try{const r=await b.inspectHtmlDeck(cut.html,{width:1920,height:1080,shots:true,refs:cut.videos.map(v=>v.ref),maxSlides:40,tooMany:true});console.log(JSON.stringify({phase:'inspect',total:r.total,slides:r.slides.length,shots:r.slides.filter(s=>s.shot?.length).length,videoFrames:r.slides.filter(s=>s.vbox).length,mode:r.mode,ms:Date.now()-t,rssBytes:process.memoryUsage().rss}));}catch(e){console.log(JSON.stringify({phase:'error',code:e.code,message:e.message,ms:Date.now()-t}));process.exitCode=1;}finally{await b.close();}
