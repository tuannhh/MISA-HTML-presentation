import puppeteer from 'puppeteer-core';
import {readFile,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import sharp from 'sharp';
import {renderDeck} from '/app/src/services/renderService.js';
import {normalizeSpec} from '/app/src/services/specService.js';
const aid='11111111-1111-4111-8111-111111111111',vid='22222222-2222-4222-8222-222222222222';
const attack='</text><img src=x onerror="window.__ctXss=1">';
const {spec}=normalizeSpec({title:'Audit render',transition:'push',slides:[{id:'c',layout:'chart',title:'Biểu đồ',chart:{categories:[attack,'B'],series:[{name:attack,values:[12,30]}]},callout:{tone:'warn',text:attack}},{id:'i',transition:'zoom',layout:'image',title:'Ảnh',image:{asset:aid,alt:attack}},{id:'v',layout:'image',title:'Video',video:{provider:'file',asset:vid,title:attack,muted:true,fs:false}},{id:'end',layout:'closing',title:'Cảm ơn quý khách',subtitle:'Nội dung giữ nguyên'}]});
const png=await sharp({create:{width:800,height:450,channels:3,background:'#1255aa'}}).png().toBuffer();const tiny=await readFile('/app/test/fixtures/tiny.mp4');
const opts={ratio:'16:9',embedFont:true,assetUrl:id=>id===aid?'data:image/png;base64,'+png.toString('base64'):null,videoEmbed:id=>id===vid?'embedded-test':null,embeds:[{id:'embedded-test',mime:'video/mp4',b64:tiny.toString('base64')}]};
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
const p=await b.newPage();await p.setViewport({width:1280,height:720});const net=[];await p.setRequestInterception(true);p.on('request',r=>{if(/^(data:|blob:|about:)/.test(r.url()))r.continue();else{net.push(r.url());r.abort();}});
await p.setContent(renderDeck(spec,opts),{waitUntil:'load'});await p.evaluate(()=>window.__deck.ready);const xss=await p.evaluate(()=>({executed:!!window.__ctXss,injectedImgs:document.querySelectorAll('img[onerror]').length,chartTexts:document.querySelectorAll('.slide svg text').length}));
await p.evaluate(()=>window.__deck.goto(1));await new Promise(r=>setTimeout(r,500));await p.click('.slide.on [data-lb]');const lightbox=await p.$('#lbx')!==null;await p.keyboard.press('Escape');
await p.evaluate(()=>window.__deck.goto(2));await new Promise(r=>setTimeout(r,500));await p.click('.slide.on .vplay');await new Promise(r=>setTimeout(r,500));const video=await p.evaluate(()=>[...document.querySelectorAll('video')].map(v=>({readyState:v.readyState,error:v.error?.code||null,blob:v.src.startsWith('blob:')})));
await p.setContent(renderDeck(spec,opts));await p.evaluate(()=>window.__deck.ready);await p.keyboard.press('ArrowRight');const override=await p.$eval('#deck',e=>e.getAttribute('data-tr'));for(const k of ['ArrowRight','ArrowRight','ArrowLeft','ArrowLeft','ArrowRight','ArrowLeft'])await p.keyboard.press(k);await new Promise(r=>setTimeout(r,1100));const fast=await p.evaluate(()=>({on:document.querySelectorAll('.slide.on').length,off:document.querySelectorAll('.slide.off').length,pre:document.querySelectorAll('.slide.pre').length}));
await p.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await p.setContent(renderDeck(spec,opts));await p.evaluate(()=>window.__deck.ready);await p.keyboard.press('ArrowRight');const reduced=await p.evaluate(()=>({transition:document.querySelector('#deck').getAttribute('data-tr')}));
await p.setContent(renderDeck(spec,{...opts,mode:'edit'}));await p.evaluate(()=>window.__deck.ready);await p.evaluate(()=>window.__deck.goto(3));await p.click('.slide.on .cl-t');await p.evaluate(()=>{const el=document.querySelector('.slide.on .cl-t');const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});await p.keyboard.down('Control');await p.keyboard.press('b');await p.keyboard.up('Control');await p.click('body',{offset:{x:5,y:5}});const closing=await p.$eval('.slide.on .cl-t',el=>el.textContent);
await p.setContent(renderDeck(spec,{...opts,mode:'print'}));await p.evaluate(()=>window.__deck.ready);const pdf=await p.pdf({width:'1920px',height:'1080px',printBackground:true});const pages=(await PDFDocument.load(pdf)).getPageCount();await writeFile('/app/audit-out/render-new-blocks.pdf',pdf);
console.log(JSON.stringify({case:'renderer-runtime',xss,lightbox,video,override,fast,reduced,closing,pdfPages:pages,externalRequests:net}));
}finally{await b.close();}
