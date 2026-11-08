// Hồi quy F01: media gửi kèm khi tạo bài + ảnh minh hoạ AI phải lưu vào ĐÚNG tenant/bài (asset + khoá tệp).
// Dùng repository/storage/AI giả; service thật chạy toàn bộ nhánh create → generateOutline → storeUserMedia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createPresentationService } from './snapshot/src/services/presentationService.js';
import { loadConfig } from './snapshot/src/config/index.js';

const USER = { id: '11111111-1111-4111-8111-111111111111', email: 'a@misa.com.vn' };

async function pngFile(dir, name) {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 60, b: 60 } } }).png().toBuffer();
  const path = join(dir, name);
  writeFileSync(path, buffer);
  return { path, originalname: name, size: buffer.length, buffer };
}

function world(extra = {}) {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const config = loadConfig();
  process.env.NODE_ENV = prev;
  const created = [];
  const stored = [];
  const state = { outline: null, failed: null, rows: new Map() };
  const repos = {
    presentations: {
      async createForTenant(_t, row) { state.rows.set(row.id, { ...row, tenant_id: USER.id }); },
      async setOutlineResult(_t, id, r) { state.outline = r.outline; Object.assign(state.rows.get(id), { outline: r.outline, status: 'outline', outline_version: 1 }); },
      async setGenerationResult(_t, _id, r) { if (r.status === 'ready') state.spec = r.spec; else state.failed = r; },
      async findOwned(_t, id) { return state.rows.get(id) || null; },
      async startBuildOwned() { return 1; },
      async buildFailed(_t, _id, msg) { state.buildFailed = msg; },
    },
    assets: { async create(tenantId, row) { created.push({ tenantId, ...row }); }, async listMediaForPresentation() { return created.map((a) => ({ id: a.id, kind: a.kind })); } },
    versions: {},
  };
  const storage = { async put(key, buf) { stored.push({ key, bytes: buf.length }); }, async putFile(key) { stored.push({ key, bytes: 0 }); } };
  const gemini = {
    async generateOutline({ userImages }) {
      return { title: 'Bài thử', theme: 'ocean', slides: [{ layout: 'cover', title: 'Mở đầu', points: ['a'], images: userImages.map((_, i) => ({ ref: `UIMG${i + 1}` })) }, { layout: 'bullets', title: 'Nội dung', points: ['x', 'y'] }, { layout: 'closing', title: 'Cảm ơn', points: [] }] };
    },
    async designDeck() {
      return { slides: [{ ref: 'S1', layout: 'cover', title: 'Mở đầu', imagePrompt: 'a conference hall' }, { ref: 'S2', layout: 'bullets', title: 'Nội dung', items: [{ title: 'x' }, { title: 'y' }] }, { ref: 'S3', layout: 'closing', title: 'Cảm ơn' }] };
    },
    async generateImage() { return { buffer: await sharp({ create: { width: 800, height: 600, channels: 3, background: '#336' } }).png().toBuffer() }; },
  };
  const audit = { async record() {} };
  const svc = createPresentationService({ config, repos, storage, gemini, browser: {}, signer: { url: (id) => `/a/${id}` }, audit, stock: {}, ...extra });
  return { svc, created, stored, state, config, gemini };
}

async function until(fn, ms = 8000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('quá hạn chờ job');
}


const emit=(caseName,detail)=>console.log(JSON.stringify({case:caseName,...detail}));
const w=world();
let calls=0, requestedPages=null;
w.gemini.generateOutline=async o=>{calls++;requestedPages=o.pages;return {title:'Test',slides:[{layout:'bullets',title:'Trang một',points:Array.from({length:13},(_,i)=>'Dòng nguồn '+(i+1))},{layout:'bullets',title:'Trang hai',points:['Trang hai']}]} };
await w.svc.create(USER,{text:'Trang nguồn một đủ dài để kiểm tra.\n---\nTrang nguồn hai đủ dài để kiểm tra.\n---\nTrang nguồn ba đủ dài để kiểm tra.',keepOriginal:'1'},'127.0.0.1');
await until(()=>w.state.outline||w.state.failed);
emit('keep-original',{requestedPages,actualPages:w.state.outline?.slides.length,firstPagePoints:w.state.outline?.slides[0]?.points.length,failed:w.state.failed,realAiCalls:0});
let inspected=0;
const v=world({videos:{async inspect(){inspected++;return {info:null,poster:null,broken:true}},enqueue(){}}});
const dir=mkdtempSync(join(new URL('.', import.meta.url).pathname,'invalid-video-'));
const p=join(dir,'invalid.mp4');const buf=Buffer.alloc(64);buf.write('ftypisom',4);writeFileSync(p,buf);
await v.svc.create(USER,{text:'Nội dung thử kèm một video giả dạng MP4.',media:[{path:p,originalname:'invalid.mp4',size:buf.length}],ratio:'16:9'},'127.0.0.1');
await until(()=>v.state.outline||v.state.failed);
emit('invalid-video-create',{inspected,storedVideos:v.created.filter(x=>x.kind==='video').length,outlineReady:!!v.state.outline,failed:v.state.failed});
const over=world();let paid=0;over.gemini.generateOutline=async()=>{paid++;throw Error('must not run')};
try{await over.svc.create(USER,{text:Array.from({length:41},(_,i)=>'Nguồn trang '+i).join('\n---\n'),keepOriginal:'1'},'127.0.0.1');await until(()=>over.state.failed||over.state.outline);emit('over40',{paid,failed:over.state.failed});}catch(e){emit('over40',{paid,status:e.status,code:e.code});}
await (await import('node:fs/promises')).rm(dir,{recursive:true,force:true});
