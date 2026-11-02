import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGrant, hashPin, verifyPin, grantId, issueSession, readSession, studentActionRequiresAdmin, allowLegacyStudentWrite } from '../lib/delegated-access.js';

test('교사 이름과 네 자리 번호 및 허용된 메뉴를 검증한다', () => {
  assert.deepEqual(normalizeGrant({name:' 교사 ',pin:'0031',menus:['students','students']}),{name:'교사',pin:'0031',menus:['students']});
  for (const pin of ['123','12345','abcd',1234]) assert.throws(()=>normalizeGrant({name:'교사',pin,menus:['students']}));
  assert.throws(()=>normalizeGrant({name:'교사',pin:'1234',menus:['settings']}));
});
test('인증 세션의 위조와 만료를 거부한다',()=>{
  const token=issueSession('교사','revision','server-secret',1000);
  assert.equal(readSession(token,'server-secret',1001).name,'교사');
  assert.equal(readSession(token,'wrong-secret',1001),null);
  assert.equal(readSession(token,'server-secret',1000+8*60*60*1000),null);
  assert.equal(readSession(token+'x','server-secret',1001),null);
});
test('학생 명렬 관리와 지적사항 동기화는 권한을 요구하지만 일반 활동은 유지한다',()=>{
  for(const action of ['roster:sync','roster:upload','roster:save','roster:delete','discipline:sync'])assert.equal(studentActionRequiresAdmin(action),true);
  for(const action of ['activity:save','activity:delete',null])assert.equal(studentActionRequiresAdmin(action),false);
});
test('기존 프로그램의 인증 없는 요청은 교내망에서만 허용하며 새 인증 실패는 우회하지 않는다',()=>{
 assert.equal(allowLegacyStudentWrite({},true),true);
 assert.equal(allowLegacyStudentWrite({},false),false);
 assert.equal(allowLegacyStudentWrite({'x-dogae-delegated':'invalid'},true),false);
 assert.equal(allowLegacyStudentWrite({'x-dogae-scoped-client':'1'},true),false);
});
test('번호는 임의 솔트와 함께 저장하고 올바른 번호만 검증한다', () => {
  const first=hashPin('0031'),second=hashPin('0031');
  assert.notEqual(first.hash,second.hash);
  assert.equal(verifyPin('0031',first),true);
  assert.equal(verifyPin('0032',first),false);
  assert.equal(verifyPin('0031',{}),false);
  assert.equal(grantId(' 교사 ','key'),grantId('교사','key'));
});
