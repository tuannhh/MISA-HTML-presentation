import mysql from '../../../../../node_modules/mysql2/promise.js';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createPresentationRepository } from '../../../../../src/repositories/presentationRepository.js';
const db='codex_review_recovery';
const c=await mysql.createConnection({host:'127.0.0.1',port:Number(process.env.REVIEW_DB_PORT),user:'root',password:process.env.REVIEW_DB_PASSWORD,multipleStatements:true});
try {
  await c.query(`CREATE DATABASE ${db}`);
  await c.query(readFileSync(new URL('../../../../../startup/database/schema.sql',import.meta.url),'utf8').replace(/misa_presentation/g,db));
  const owner=randomUUID(), id=randomUUID();
  await c.execute('INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)',[owner,'review@example.test','Review','x'.repeat(60)]);
  const repo=createPresentationRepository(c);
  await repo.createCopy(owner,{id,code:'review01',title:'Incomplete copy',ratio:'16:9',status:'generating',spec:{title:'T',slides:[]},outline:{title:'T',slides:[{images:[{asset:'not-copied-yet'}]}]}});
  await repo.failStaleGenerating();
  const [[row]]=await c.execute('SELECT status,source_kind,error_message FROM presentations WHERE id=?',[id]);
  assert.equal(row.status,'outline');
  console.log(JSON.stringify({case:'restart incomplete owner copy with outline',expected:'failed or explicit copy recovery',actual:row,defectReproduced:true},null,2));
} finally { await c.query(`DROP DATABASE IF EXISTS ${db}`); await c.end(); }
