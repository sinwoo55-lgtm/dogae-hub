import {test} from 'node:test';
import assert from 'node:assert/strict';
import {desktopAdminAccess} from '../lib/desktop-admin.js';
import {requireSchoolNetwork} from '../lib/school-access.js';
import middleware from '../middleware.js';
test('교외 관리자 API 요청은 서버 인증키가 일치할 때만 IP 제한을 통과한다',async()=>{
  const old=process.env.DESKTOP_ADMIN_ACCESS_KEY,oldCidr=process.env.SCHOOL_ALLOWED_CIDRS,key='TEST_ONLY_'+ 'A'.repeat(32);process.env.DESKTOP_ADMIN_ACCESS_KEY=key;process.env.SCHOOL_ALLOWED_CIDRS='';
  const res={status(){return this;},json(){return this;}};
  try{const valid={'x-forwarded-for':'8.8.8.8','x-dogae-desktop-admin':key};assert.equal(await desktopAdminAccess(valid),true);assert.equal(requireSchoolNetwork({headers:valid},res),true);assert.equal(requireSchoolNetwork({headers:{'x-forwarded-for':'8.8.8.8'}},res),false);assert.equal(requireSchoolNetwork({headers:{'x-forwarded-for':'117.110.113.2'}},res),true);assert.equal(await middleware(new Request('https://example.test/api/students',{headers:valid})),undefined);assert.equal((await middleware(new Request('https://example.test/index.html',{headers:valid}))).status,403);assert.equal((await middleware(new Request('https://example.test/api/students',{headers:{'x-forwarded-for':'8.8.8.8','x-dogae-desktop-admin':'wrong'}}))).status,403);delete process.env.DESKTOP_ADMIN_ACCESS_KEY;assert.equal(requireSchoolNetwork({headers:valid},res),false);}finally{if(old===undefined)delete process.env.DESKTOP_ADMIN_ACCESS_KEY;else process.env.DESKTOP_ADMIN_ACCESS_KEY=old;if(oldCidr===undefined)delete process.env.SCHOOL_ALLOWED_CIDRS;else process.env.SCHOOL_ALLOWED_CIDRS=oldCidr;}
});
