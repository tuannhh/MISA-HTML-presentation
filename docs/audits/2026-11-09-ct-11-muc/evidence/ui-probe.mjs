import {loadConfig} from '/app/src/config/index.js';
import {setupTestDb} from '/app/test/integration/helpers/testDb.mjs';
import {startHttpApp} from '/app/test/integration/helpers/httpApp.mjs';
import puppeteer from 'puppeteer-core';
import {writeFile} from 'node:fs/promises';
const db=await setupTestDb(loadConfig());let app,browser;
try{
app=await startHttpApp(loadConfig(),db);const user=await app.newUser('ct-ui');const deck=await app.readyDeck(user);const outline=await app.createOutline(user);
const spec=structuredClone(deck.spec);spec.slides[0]={id:'ctchart',layout:'chart',title:'Biểu đồ thử nghiệm',chart:{categories:['Tỷ lệ','Quý 2'],series:[{name:'Dữ liệu',values:[0.123,1.234]}]},callout:{tone:'info',text:'Chú thích thử nghiệm'}};
let save=await user.patch('/api/presentations/'+deck.id,{spec,specVersion:deck.specVersion});if(save.status!==200)throw Error('save '+save.status);
browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const cookie=user.cookie.split('; ').map(c=>{const i=c.indexOf('=');return {name:c.slice(0,i),value:c.slice(i+1),domain:'127.0.0.1',path:'/'};});await browser.defaultBrowserContext().setCookie(...cookie);
const rows=[];
for(const mobile of [false,true]){const page=await browser.newPage();await page.setViewport({width:mobile?390:1440,height:mobile?844:1000,isMobile:mobile,hasTouch:mobile});page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const [name,route] of [['decks','/decks'],['create','/create'],['outline',`/audit/${outline.code}/outline`],['edit',`/audit/${deck.code}/edit`],['view',`/audit/${deck.code}/view`]]){
 await page.goto(app.base+route,{waitUntil:'networkidle0'});await new Promise(r=>setTimeout(r,350));
 const metrics=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,login:location.pathname==='/login',smallButtons:[...document.querySelectorAll('button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&(r.width<44||r.height<44)&&r.bottom>0&&r.top<innerHeight}).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,60),width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height)}))}));
 rows.push({surface:mobile?'mobile':'desktop',route:name,...metrics,errors:[...errors]});
 if(name==='edit'){
const details=await page.evaluate(()=>{const f=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Đổi sang bố cục khác'));const r=f?.getBoundingClientRect();const el=document.querySelector('input[inputmode=decimal]');const before=el?.value;if(el){el.value='0,124';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('blur',{bubbles:true}));}return {familyButton:r?{width:r.width,height:r.height}:null,numericBefore:before};});
await new Promise(r=>setTimeout(r,100));details.numericAfter=await page.$eval('input[inputmode=decimal]',e=>e.value).catch(()=>null);console.log(JSON.stringify({case:'ui-editor-details',surface:mobile?'mobile':'desktop',...details}));
}
await page.screenshot({path:`/app/audit-out/ui-${mobile?'mobile':'desktop'}-${name}.png`,fullPage:true});
}
await page.close();}
console.log(JSON.stringify({case:'ui-route-matrix',rows}));await writeFile('/app/audit-out/ui-matrix.json',JSON.stringify(rows,null,2));
}finally{await browser?.close();await app?.close();await db.teardown();console.log(JSON.stringify({case:'ui-cleanup',databaseDropped:true,realAiCalls:0}));}
