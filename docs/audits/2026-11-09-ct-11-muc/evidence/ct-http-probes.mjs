import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '/app/src/config/index.js';
import {setupTestDb} from '/app/test/integration/helpers/testDb.mjs';
import {startHttpApp} from '/app/test/integration/helpers/httpApp.mjs';
const emit=(name,data)=>console.log(JSON.stringify({case:name,...data}));
const db=await setupTestDb(loadConfig());let app;
try{
 app=await startHttpApp(loadConfig(),db,{patch:c=>({video:{...c.video,transcode:false}})});
 const a=await app.newUser('ct-a'),b=await app.newUser('ct-b');
 const da=await app.readyDeck(a),dbb=await app.readyDeck(b),dc=await app.readyDeck(a);
 const make=async(c,name,parentId=null)=>{const r=await c.post('/api/folders',{name,parentId});assert.equal(r.status,201);return r.json.data;};
 const fa=await make(a,'Folder A'),fb=await make(b,'Folder B'),child=await make(a,'Child',fa.id);
 const forbidden={parent:(await b.post('/api/folders',{name:'Foreign parent',parentId:fa.id})).status,edit:(await b.patch('/api/folders/'+fa.id,{name:'Foreign edit'})).status,delete:(await b.del('/api/folders/'+fa.id)).status,moveTarget:(await b.post('/api/folders/move-decks',{ids:[dbb.id],folderId:fa.id})).status};
 assert.ok(Object.values(forbidden).every(x=>x===404));
 const mixed=await a.post('/api/folders/move-decks',{ids:[da.id,dbb.id],folderId:child.id});assert.equal(mixed.json.data.moved,1);
 const cycle=await a.patch('/api/folders/'+fa.id,{parentId:child.id});assert.equal(cycle.json.error.code,'FOLDER_CYCLE');
 await a.del('/api/folders/'+child.id);
 const [[deck]]=await db.pool.execute('SELECT folder_id FROM presentations WHERE id=?',[da.id]);assert.equal(deck.folder_id,fa.id);
 emit('folder-tenant-delete',{forbidden,mixedMoved:mixed.json.data.moved,cycle:cycle.json.error.code,deckMovedToParent:true});
 let races=[];
 for(let i=0;i<5;i++){const x=await make(a,'X'+i),y=await make(a,'Y'+i);const rs=await Promise.all([a.patch('/api/folders/'+x.id,{parentId:y.id}),a.patch('/api/folders/'+y.id,{parentId:x.id})]);const [tree]=await db.pool.execute('SELECT id,parent_id FROM folders WHERE id IN (?,?)',[x.id,y.id]);assert.ok(!(tree[0].parent_id===tree[1].id&&tree[1].parent_id===tree[0].id));races.push(rs.map(r=>({status:r.status,code:r.json.error?.code})));}
 emit('folder-cycle-race',{rounds:5,results:races,noCycles:true});
 const vv=Buffer.from(await readFile('/app/test/fixtures/tiny.mp4'));const vf=new FormData();vf.set('file',new Blob([vv],{type:'video/mp4'}),'test.mp4');
 let r=await a.post('/api/presentations/'+da.id+'/videos',undefined,{form:vf});
 if(r.status!==201) throw Error('video upload '+r.status+' '+JSON.stringify(r.json));
 const aid=r.json.data.video.asset;
 const videoIdor={own:(await a.get(`/api/presentations/${da.id}/videos/${aid}`)).status,foreignDeck:(await b.get(`/api/presentations/${da.id}/videos/${aid}`)).status,foreignAsset:(await b.get(`/api/presentations/${dbb.id}/videos/${aid}`)).status,sameTenantOtherDeck:(await a.get(`/api/presentations/${dc.id}/videos/${aid}`)).status,addLink:(await b.post(`/api/presentations/${da.id}/video-link`,{url:'https://vimeo.com/123456789'})).status};
 assert.deepEqual(Object.values(videoIdor),[200,404,404,404,404]);emit('video-idor',videoIdor);
 r=await a.post('/api/templates',{name:'CT template',presentationId:da.id,design:{theme:'ocean'}});assert.equal(r.status,201);const tpl=r.json.data;
 await a.patch('/api/templates/'+tpl.id,{visibility:'public'});assert.ok((await b.get('/api/templates')).json.data.some(t=>t.id===tpl.id));await a.patch('/api/templates/'+tpl.id,{visibility:'private'});
 const f=new FormData();f.set('text','Tạo thử với mẫu đã ngừng chia sẻ');f.set('templateId',tpl.id);
 const revoked=(await b.post('/api/presentations',undefined,{form:f})).status;assert.equal(revoked,404);emit('template-revoked',{createStatus:revoked});
 emit('complete',{realAiCalls:0});
}finally{await app?.close();await db.teardown();emit('cleanup',{appClosed:true,databaseDropped:true});}
