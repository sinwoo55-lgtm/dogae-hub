import test from 'node:test';
import assert from 'node:assert/strict';
import {createDistributionHandler} from '../lib/desktop-distribution-store.js';

test('필수 업데이트 이후 일반 업데이트도 최소 필수 버전을 유지한다',async()=>{
 let saved=null;const ref={get:async()=>({exists:!!saved,data:()=>saved}),set:async value=>{saved=value}};
 const handler=createDistributionHandler({db:{collection:()=>({doc:()=>ref})},authorize:async()=>true,network:()=>true});
 const response=()=>({setHeader(){},status(code){this.code=code;return this},json(value){this.value=value;return this}});
 const release=version=>({version,url:'https://github.com/a/b/releases/download/v'+version+'/app.exe',sha256:'a'.repeat(64),size:5,kind:'installer'});
 let res=response();await handler({method:'POST',headers:{},body:{action:'release',data:{...release('1.3.0'),required:true}}},res);assert.equal(res.code,200);assert.equal(saved.minimumVersion,'1.3.0');
 res=response();await handler({method:'POST',headers:{},body:{action:'release',data:release('1.3.1')}},res);assert.equal(res.code,200);assert.equal(saved.minimumVersion,'1.3.0');
});
