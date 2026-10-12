import child from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import assert from 'node:assert/strict';
// No Docker command or HTTP request is executed: only the real provisioner control flow is exercised.
const calls=[];
child.execFileSync=(file,args)=>{calls.push({kind:'process',file,args});return 'Mật khẩu tạm: fakeTemporaryPassword';};
syncBuiltinESMExports();
delete process.env.SMOKE_ADMIN_EMAIL; delete process.env.SMOKE_ADMIN_PASSWORD;
const {createProvisioner,TEST_PASSWORD}=await import('../../../../../test/smoke/provision.mjs');
const makeClient=(role)=>({async init(){},async req(method,path,body){
  calls.push({kind:'http',role,method,path,fixedPassword:body?.newPassword===TEST_PASSWORD});
  if(path==='/api/auth/register') return {status:403,json:{error:{code:'REGISTRATION_CLOSED'}}};
  if(path==='/api/admin/users') return {status:201,json:{data:{temporaryPassword:'fakeUserTemporary'}}};
  return {status:200,json:{data:{}}};
}});
const provision=createProvisioner(()=>makeClient('admin'),'fixture-run');
assert.equal((await provision(makeClient('user'),'fixture@example.test','Fixture')).status,201);
assert.ok(calls.some(c=>c.role==='admin' && c.path==='/api/auth/change-password' && c.fixedPassword));
console.log(JSON.stringify({case:'closed registration smoke bootstrap',actual:'new admin changed to fixed source-code password; no cleanup operation in provisioner',calls,defectReproduced:true},null,2));
