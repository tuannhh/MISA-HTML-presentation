import mysql from 'mysql2/promise';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const conn=await mysql.createConnection({host:'codex-ct-mysql-20261109',user:'root',password:'',multipleStatements:true});
const names=['ct_old_'+randomBytes(4).toString('hex'),'ct_new_'+randomBytes(4).toString('hex')];
const shape=async name=>{
const [cols]=await conn.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,ORDINAL_POSITION',[name]);
const [indexes]=await conn.query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=? ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX',[name]);
const [fks]=await conn.query('SELECT TABLE_NAME,CONSTRAINT_NAME,REFERENCED_TABLE_NAME,UPDATE_RULE,DELETE_RULE FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? ORDER BY TABLE_NAME,CONSTRAINT_NAME',[name]);
return {cols,indexes,fks};};
try{
for(let i=0;i<2;i++){await conn.query('CREATE DATABASE `'+names[i]+'`');const sql=await readFile(i?'/app/startup/database/schema.sql':'/app/base-schema.sql','utf8');await conn.query(sql.replaceAll('misa_presentation',names[i]));}
await conn.query('USE `'+names[0]+'`');
const files=['changelog_database_20261108_100000.sql','changelog_database_20261108_200000.sql'];
for(let pass=0;pass<3;pass++)for(const f of files)await conn.query(await readFile('/app/startup/database/changelogs/'+f,'utf8'));
const a=await shape(names[0]),b=await shape(names[1]);const result={case:'migration-upgrade-replay',passes:3,columnsMatch:JSON.stringify(a.cols)===JSON.stringify(b.cols),indexesMatch:JSON.stringify(a.indexes)===JSON.stringify(b.indexes),foreignKeysMatch:JSON.stringify(a.fks)===JSON.stringify(b.fks)};console.log(JSON.stringify(result));
if(!result.columnsMatch||!result.indexesMatch||!result.foreignKeysMatch)console.log(JSON.stringify({a,b}));
}finally{for(const n of names)await conn.query('DROP DATABASE IF EXISTS `'+n+'`');await conn.end();console.log(JSON.stringify({case:'migration-cleanup',databasesDropped:2}));}
