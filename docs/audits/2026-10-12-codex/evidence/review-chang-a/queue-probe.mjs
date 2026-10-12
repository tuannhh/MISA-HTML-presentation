import assert from 'node:assert/strict';
import { createPresentationService } from '../../../../../src/services/presentationService.js';
import { loadConfig } from '../../../../../src/config/index.js';
process.env.NODE_ENV='test';
const config=loadConfig();
let enter=0,release,allEntered;
const gate=new Promise(r=>{release=r;});
const waiting=new Promise(r=>{allEntered=r;});
const svc=createPresentationService({config,repos:{presentations:{
  async findOwned(user,id){return {id,tenant_id:user,status:'outline',outline_version:1,outline:{title:'T',slides:[]}};},
  async startBuildOwned(){if(++enter===50)allEntered();await gate;return 1;},
},assets:{},versions:{}},storage:{},gemini:{async designDeck(){await new Promise(()=>{});}},browser:{},signer:{},audit:{async record(){}},stock:{}});
const requests=Array.from({length:50},(_,i)=>svc.build({id:`user-${i}`},`deck-${i}`,{outlineVersion:1},'127.0.0.1'));
await waiting; release();
const results=await Promise.allSettled(requests);
const accepted=results.filter(r=>r.status==='fulfilled').length;
const pending=svc.queueStats().pending;
assert.equal(accepted,50); assert.equal(pending,50-config.limits.generationConcurrency); assert.ok(pending>20);
console.log(JSON.stringify({case:'50 concurrent builds, repository barrier before enqueue',generationConcurrency:config.limits.generationConcurrency,documentedMaxPending:20,accepted,pending,expected:'at most concurrency + 20 admitted',defectReproduced:true},null,2));
// The held fake AI promises do not keep Node alive; no external provider or background resource was started.
