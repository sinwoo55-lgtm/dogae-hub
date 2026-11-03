import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRosterBatch } from '../lib/roster-batch.js';

function setup(){
  const records=new Map([['student/old',{grade:'1',classNo:'1',number:'1',name:'기존',status:'재학',classKey:'1-1',rev:'10:1'}],['meta',{classes:['1-1']}]]);
  const ref=id=>({id:id.split('/').at(-1),path:id}), students={doc:id=>ref('student/'+id),where:(_k,_op,key)=>({query:key})},meta=ref('meta'),revision=ref('revision'),receipt=ref('receipt');let writes=0;
  const db={runTransaction:async fn=>{const operations=[],tx={get:async r=>{if(r.query)return {docs:[...records.entries()].filter(([p,v])=>p.startsWith('student/')&&v.classKey===r.query).map(([p,v])=>({id:p.split('/').at(-1),data:()=>v}))};const v=records.get(r.path),parts=(v?.rev||'0:0').split(':').map(Number);return {exists:!!v,data:()=>v,updateTime:{seconds:parts[0],nanoseconds:parts[1]}}},set:(r,v,opts)=>operations.push(()=>records.set(r.path,opts?.merge?{...records.get(r.path),...v}:v)),delete:r=>operations.push(()=>records.delete(r.path))};const result=await fn(tx);operations.forEach(f=>f());writes+=operations.length;return result;}};
  const args={db,students,rosterMeta:meta,syncRevision:revision,receiptRef:receipt,requestId:'0123456789abcdef',timestamp:()=>1,increment:()=>1,adds:[{grade:'1',classNo:'2',number:'2',name:'새학생',status:'재학',classKey:'1-2',key:'1-2-2-새학생'}],deletes:[{id:'old',revision:'10:1'}]};
  return {args,records,writes:()=>writes};
}
test('추가·삭제·선도부 변경 신호를 함께 저장하고 재시도는 중복하지 않는다',async()=>{
  const f=setup(),first=await applyRosterBatch(f.args);assert.equal(first.replayed,false);assert.equal(f.records.has('student/old'),false);assert.equal(f.records.has('student/1-2-2-새학생'),true);assert.equal(f.records.get('revision').revision,1);const count=f.writes();assert.equal((await applyRosterBatch(f.args)).replayed,true);assert.equal(f.writes(),count);
});
test('다른 사람이 변경한 삭제 대상은 전체 저장을 거부한다',async()=>{
  const f=setup();f.records.get('student/old').rev='11:1';await assert.rejects(applyRosterBatch(f.args),e=>e.status===409);assert.equal(f.writes(),0);assert.equal(f.records.has('student/old'),true);assert.equal(f.records.has('student/1-2-2-새학생'),false);
});
test('기존 학생 번호와 중복되면 전체 저장을 거부한다',async()=>{
  const f=setup();f.args.deletes=[];f.args.adds=[{grade:'1',classNo:'1',number:'1',name:'다른이름',status:'재학',classKey:'1-1',key:'1-1-1-다른이름'}];await assert.rejects(applyRosterBatch(f.args),e=>e.status===409);assert.equal(f.writes(),0);
});
test('기존 학생 정보는 같은 문서에 원자적으로 수정하고 재시도해도 중복하지 않는다',async()=>{
  const f=setup();f.args.adds=[];f.args.deletes=[];f.args.updates=[{id:'old',revision:'10:1',grade:'1',classNo:'1',number:'1',name:'수정된 이름',status:'재학',classKey:'1-1',key:'1-1-1-수정된 이름'}];
  const result=await applyRosterBatch(f.args);assert.equal(result.updated,1);assert.equal(f.records.get('student/old').name,'수정된 이름');assert.equal(f.records.get('student/old').revision,undefined);const count=f.writes();assert.equal((await applyRosterBatch(f.args)).replayed,true);assert.equal(f.writes(),count);
});
test('다른 곳에서 수정된 학생은 수정과 나머지 변경을 함께 거부한다',async()=>{
  const f=setup();f.args.deletes=[];f.args.updates=[{id:'old',revision:'9:1',grade:'1',classNo:'1',number:'1',name:'변경',status:'재학',classKey:'1-1',key:'1-1-1-변경'}];await assert.rejects(applyRosterBatch(f.args),e=>e.status===409);assert.equal(f.writes(),0);assert.equal(f.records.get('student/old').name,'기존');assert.equal(f.records.has('student/1-2-2-새학생'),false);
});
