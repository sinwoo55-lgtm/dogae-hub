import test from 'node:test';
import assert from 'node:assert/strict';
import {SCHOOL_MENU_IDS,normalizeSavedMenu} from '../lib/school-menu.js';
import {normalizedMenuOrder} from '../lib/menu-order.js';

test('도구 모음은 공용 메뉴의 표시 설정과 기존 순서에 포함된다',()=>{
 const old=SCHOOL_MENU_IDS.filter(id=>id!=='tools'&&id!=='onlineBoard'),input=Object.fromEntries(old.map(id=>[id,true]));
 assert.equal(normalizeSavedMenu({...input,tools:false}).tools,false);
 assert.equal(normalizeSavedMenu(input,{tools:false}).tools,false);
 assert.equal(normalizeSavedMenu(input,{tools:true}).tools,true);
 assert.equal(normalizeSavedMenu(input).tools,true);
 assert.deepEqual(normalizedMenuOrder(SCHOOL_MENU_IDS,old),SCHOOL_MENU_IDS);
 assert.equal(normalizeSavedMenu({...input,tools:'false'}),null);
 assert.equal(normalizeSavedMenu({...input,calendar:undefined}),null);
});
