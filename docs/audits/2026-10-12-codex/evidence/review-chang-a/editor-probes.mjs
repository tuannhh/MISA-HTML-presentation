import { register } from 'node:module';
import assert from 'node:assert/strict';
register('./audit-loader.mjs', import.meta.url);
const { useEditor } = await import('../../../../../frontend/src/composables/useEditor.js');
const { useOutline } = await import('../../../../../frontend/src/composables/useOutline.js');
globalThis.window = { addEventListener() {}, removeEventListener() {} };
const clone = x => JSON.parse(JSON.stringify(x));
const results = [];
for (const initiallyDirty of [false, true]) {
  const db = { id:'D1', title:'T', ratio:'16:9', status:'ready', isOwner:true, canEdit:true, assets:[], specVersion:1, spec:{title:'T',slides:[{id:'s1',layout:'bullets',title:'Original',subtitle:'',items:[]}]}};
  let release;
  const gate = new Promise(r => { release = r; });
  globalThis.__fakeApi = async (method, path, body) => {
    if (method === 'PATCH') { await gate; db.ratio = body.ratio; }
    return { data: clone(db) };
  };
  const editor = useEditor('D1');
  await editor.load();
  if (initiallyDirty) editor.draft.value.spec.slides[0].title = 'Before metadata request';
  const pending = editor.updateMeta({ratio:'4:3'});
  editor.draft.value.spec.slides[0].title = 'Typed while metadata in flight';
  release(); await pending;
  const actual = editor.draft.value.spec.slides[0].title;
  // This probe asserts reproduction of the defect, not acceptance of incorrect behavior.
  assert.notEqual(actual, 'Typed while metadata in flight');
  results.push({case:`metadata initially ${initiallyDirty?'dirty':'clean'}`,expected:'Typed while metadata in flight',actual,defectReproduced:true});
}
{
  const db = { id:'D2', title:'T', status:'outline', isOwner:true, assets:[], outlineVersion:1, outline:{title:'T',slides:[{id:'s1',layout:'bullets',title:'Original',subtitle:'',notes:'',points:['P'],images:[],video:null}]}};
  let release; const gate = new Promise(r => {release=r;});
  globalThis.__fakeApi = async (method,path,body) => {
    if(method==='PUT') { await gate; db.outline=clone(body.outline); db.outlineVersion++; }
    return {data:clone(db)};
  };
  const editor = useOutline('D2'); await editor.load();
  editor.draft.value.slides[0].title='Before save';
  const pending = editor.save();
  editor.draft.value.slides[0].title='Typed while outline save in flight';
  release(); assert.equal(await pending,true);
  const actual=editor.draft.value.slides[0].title;
  assert.equal(actual,'Before save');
  results.push({case:'outline save',expected:'Typed while outline save in flight',actual,defectReproduced:true});
}
console.log(JSON.stringify(results,null,2));
