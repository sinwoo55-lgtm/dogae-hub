import test from 'node:test';
import assert from 'node:assert/strict';
import {createDelegatedService} from '../lib/delegated-service.js';

function setup(){
 const records=new Map(),snapshot=id=>({exists:records.has(id),data:()=>records.get(id)});
 const db={collection:()=>({doc:id=>({id,get:async()=>snapshot(id),set:async value=>records.set(id,value),delete:async()=>records.delete(id)}),get:async()=>({docs:[...records.values()].map(value=>({data:()=>value}))})}),runTransaction:async fn=>fn({get:async ref=>snapshot(ref.id),update:(ref,patch)=>records.set(ref.id,{...records.get(ref.id),...patch})})};
 const secret='test-only-secret-0123456789abcdef0123456789';
 const svc=createDelegatedService({db,secret:()=>secret,network:()=>true,authorize:async h=>h.admin==='yes'});
 async function call(body,headers={}){const result={};const res={setHeader(){},status(code){result.status=code;return this},json(data){result.data=data;return this},end(){return this}};await svc.delegatedHandler({method:'POST',body,headers},res);return result;}
 return {svc,call};
}
test('격리된 저장소에서 권한 부여, 인증, 번호 변경과 해제를 검증한다',async()=>{
 const {svc,call}=setup();const grant={action:'save',name:'테스트교사',pin:'0246',menus:['students']};
 assert.equal((await call(grant)).status,403);
 assert.equal((await call(grant,{admin:'yes'})).status,200);
 assert.equal((await call({action:'login',name:grant.name,pin:'1111'})).status,401);
 const login=await call({action:'login',name:grant.name,pin:'0246'});assert.equal(login.status,200);
 const headers={'x-dogae-delegated':login.data.token};assert.equal(await svc.authorizedDelegate(headers,'students'),true);assert.equal(await svc.authorizedDelegate(headers,'settings'),false);
 const list=await call({action:'list'},{admin:'yes'});assert.deepEqual(list.data.grants,[{name:grant.name,menus:['students'],enabled:true}]);assert.ok(!JSON.stringify(list).includes('0246'));
 await call({...grant,pin:'1357'},{admin:'yes'});assert.equal(await svc.authorizedDelegate(headers,'students'),false);
 const next=await call({action:'login',name:grant.name,pin:'1357'});assert.equal(next.status,200);
 await call({action:'remove',name:grant.name},{admin:'yes'});assert.equal(await svc.authorizedDelegate({'x-dogae-delegated':next.data.token},'students'),false);
});
test('인증번호를 다섯 번 틀리면 일시적으로 인증을 제한한다',async()=>{
 const {call}=setup();await call({action:'save',name:'교사',pin:'1234',menus:['students']},{admin:'yes'});
 for(let i=0;i<5;i++)assert.equal((await call({action:'login',name:'교사',pin:'0000'})).status,401);
 assert.equal((await call({action:'login',name:'교사',pin:'1234'})).status,429);
});
