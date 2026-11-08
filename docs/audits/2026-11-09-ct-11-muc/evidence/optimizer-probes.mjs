import {createVideoOptimizer} from './snapshot/src/services/videoOptimizer.js';
const logger={info(){},warn(){},error(){}};
let release;const barrier=new Promise(r=>release=r);let active=0,peak=0;
const o=createVideoOptimizer({assets:{},storage:{},logger,tmpDir:'/tmp',video:{async available(){return true},async probe(){active++;peak=Math.max(peak,active);await barrier;active--;return {vcodec:'h264',duration:1}},async poster(){return null}}});
const probes=Array.from({length:30},()=>o.inspect('/dummy',{wantPoster:true}));await new Promise(r=>setTimeout(r,25));release();await Promise.all(probes);console.log(JSON.stringify({case:'probe-concurrency',requests:30,maxConcurrentProbes:peak,optimizerStats:o.stats()}));
const stored=new Set(['original.mov']);const removed=[];let final;
const fail=createVideoOptimizer({logger,tmpDir:new URL('.', import.meta.url).pathname,assets:{async findById(){return {kind:'video',process_state:'pending',storage_key:'original.mov',bytes:1000,tenant_id:'t',presentation_id:'p'}},async setProcessState(id,s){final=s},async replaceVideoFile(){throw Object.assign(Error('simulated DB disconnect'),{code:'ECONNRESET'})}},storage:{pathOf:k=>k,async putFile(k){stored.add(k)},async remove(k){removed.push(k);stored.delete(k)}},video:{async available(){return true},async probe(){return {vcodec:'hevc',width:0,height:0,duration:1}},async transcode(){return 200}}});
fail.enqueue('asset');while(fail.stats().active||fail.stats().pending)await new Promise(r=>setTimeout(r,10));
console.log(JSON.stringify({case:'orphan-after-db-failure',finalState:final,newFilesLeft:[...stored].filter(x=>x!=='original.mov'),removed}));
