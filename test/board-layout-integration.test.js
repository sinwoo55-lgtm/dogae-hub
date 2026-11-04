import {test,mock} from 'node:test';import assert from 'node:assert/strict';
if(!process.execArgv.includes('--experimental-test-module-mocks')){test('게시판 통합 검증은 모듈 모킹 옵션으로 실행',{skip:true},()=>{});}else{
const ids=Array.from({length:3},(_,i)=>`0000000${i}-0000-0000-0000-000000000000`),records=new Map(),meta=new Map();let reads=0;
const clone=x=>x===undefined?undefined:structuredClone(x);
const ref=(kind,id)=>({id,kind,get:async()=>snapshot(kind,id),collection:()=>({doc:()=>ref('image',id)})});
function snapshot(kind,id){const source=kind==='post'?records:meta;return {id,ref:ref(kind,id),exists:source.has(id),data:()=>clone(source.get(id))};}
const posts={doc:id=>ref('post',id),orderBy:()=>({limit:n=>({query:true,limit:n})})};
const db={collection:name=>name==='online_board_posts'?posts:{doc:id=>ref('meta',id)},getAll:async(...refs)=>{reads+=refs.length;return refs.map(r=>snapshot(r.kind,r.id));},runTransaction:async fn=>fn({get:async item=>item.query?{size:records.size,docs:[...records.keys()].slice(0,item.limit).map(id=>snapshot('post',id))}:snapshot(item.kind,item.id),set:(r,value)=>meta.set(r.id,clone(value)),update:(r,value)=>{const source=r.kind==='post'?records:meta;source.set(r.id,{...source.get(r.id),...clone(value)});},create:(r,value)=>{if(r.kind==='post')records.set(r.id,clone(value));},delete:r=>{if(r.kind==='post')records.delete(r.id);}})};
mock.module('../lib/firebase-admin.js',{namedExports:{db}});mock.module('../lib/school-access.js',{namedExports:{requireSchoolNetwork:()=>true}});mock.module('../lib/desktop-admin.js',{namedExports:{desktopAdminAccess:async headers=>headers.admin==='yes'}});mock.module('../lib/delegated-handler.js',{namedExports:{authorizedDelegate:async(headers,menu)=>headers.delegate===menu}});
const {default:handler}=await import('../lib/online-board-handler.js');
async function call(method,body={},headers={},query={}){const result={};const res={setHeader(){},status(code){result.status=code;return this},json(data){result.data=data;return this},end(){return this}};await handler({method,body,headers,query},res);return result;}
test('공유 배치 저장, 권한 확인, 추가 게시물, 동시 수정 충돌을 처리한다',async()=>{records.clear();meta.clear();for(let i=0;i<ids.length;i++)records.set(ids[i],{title:'제목'+i,author:'교사',startsAt:0,expiresAt:Date.now()+86400000,purgeAt:Date.now()+90000000,createdAt:i+1});
 assert.equal((await call('POST',{action:'layout-save',ids:[ids[2],ids[0],ids[1]],revision:null})).status,403);
 assert.equal((await call('POST',{action:'layout-save',ids:[ids[2],ids[0],ids[1]],revision:null},{delegate:'students'})).status,403);
 assert.equal((await call('POST',{action:'layout-save',ids:[ids[2],ids[0],ids[1]],revision:null},{delegate:'onlineBoard'})).status,200);
 let listed=await call('GET');assert.deepEqual(listed.data.posts.map(p=>p.id),[ids[2],ids[0],ids[1]]);assert.equal(reads,3);const revision=listed.data.layoutRevision;
 assert.equal((await call('POST',{action:'layout-save',ids:[ids[0]],revision:null},{admin:'yes'})).status,409);
 assert.equal((await call('POST',{action:'layout-save',ids:[ids[1]],revision},{admin:'yes'})).status,200);listed=await call('GET');assert.deepEqual(listed.data.posts.map(p=>p.id),[ids[1],ids[2],ids[0]]);
 const bytes=Buffer.alloc(24);bytes.write('RIFF',0);bytes.write('WEBP',8);const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const created=await call('POST',{action:'create',author:'교사',title:'새 글',startDate:day,endDate:day,image:bytes.toString('base64'),thumbnail:bytes.toString('base64')});assert.equal(created.status,201);listed=await call('GET');assert.equal(listed.data.posts[0].id,created.data.id);
 const edit={action:'edit',id:ids[0],title:'수정',author:'교사',startDate:day,endDate:day};assert.equal((await call('POST',edit,{delegate:'links'})).status,403);assert.equal((await call('POST',edit,{delegate:'onlineBoard'})).status,200);assert.equal(records.get(ids[0]).title,'수정');
});

}
