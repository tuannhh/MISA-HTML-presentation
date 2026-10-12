import assert from 'node:assert/strict';
import { createPresentationService } from '../../../../../src/services/presentationService.js';
import { loadConfig } from '../../../../../src/config/index.js';
process.env.NODE_ENV='test';
const row={id:'D1',tenant_id:'owner',access_role:'owner',status:'ready',visibility:'private'};
const calls=[];
const svc=createPresentationService({config:loadConfig(),repos:{presentations:{
  async findReadable(){return {...row};},
  async updateOwned(t,id,fields){calls.push('updateOwned'); Object.assign(row,fields);return 1;},
},assets:{},versions:{async ensureBaseline(){calls.push('ensureBaseline');throw new Error('injected baseline write failure');}}},storage:{},gemini:{},browser:{},signer:{},audit:{async record(){calls.push('audit');}},stock:{}});
await assert.rejects(svc.update({id:'owner'},'D1',{visibility:'public'},'127.0.0.1'),/injected baseline/);
assert.equal(row.visibility,'public');
console.log(JSON.stringify({case:'public visibility update, baseline write fails',expected:'remain private or roll back publication',actual:row.visibility,calls,defectReproduced:true},null,2));
