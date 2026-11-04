import test from 'node:test';import assert from 'node:assert/strict';import {boardOrder,mergeBoardOrder} from '../lib/board-order.js';
const ids=Array.from({length:4},(_,i)=>`0000000${i}-0000-0000-0000-000000000000`);
test('배치 저장은 유효한 중복 없는 게시물만 허용한다',()=>{assert.deepEqual(boardOrder(ids),ids);assert.equal(boardOrder([ids[0],ids[0]]),null);assert.equal(boardOrder(['bad']),null);assert.equal(boardOrder(Array(301).fill(ids[0])),null);});
test('편집한 순서를 우선하고 숨겨진 게시물과 새 게시물을 보존한다',()=>{assert.deepEqual(mergeBoardOrder([ids[2],ids[0]],[ids[0],ids[1],ids[2]],ids),[ids[2],ids[0],ids[1],ids[3]]);});
