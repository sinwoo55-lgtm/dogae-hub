import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizedMenuOrder } from '../lib/menu-order.js';

test('새 메뉴가 추가되어도 기존에 저장한 메뉴 순서를 보존한다', () => {
  const current = ['calendar', 'links', 'resources', 'organization'];
  assert.deepEqual(normalizedMenuOrder(current, ['links', 'calendar', 'organization']), ['links', 'calendar', 'organization', 'resources']);
  assert.equal(normalizedMenuOrder(current, ['links', 'links']), null);
});
