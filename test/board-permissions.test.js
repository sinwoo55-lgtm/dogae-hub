import test from 'node:test';
import assert from 'node:assert/strict';
import { mayManageBoardPost } from '../lib/board-permissions.js';

test('같은 이름과 검증된 관리자만 게시물을 관리할 수 있다', () => {
  assert.equal(mayManageBoardPost('김교사', ' 김교사 '), true);
  assert.equal(mayManageBoardPost('김교사', '이교사'), false);
  assert.equal(mayManageBoardPost('김교사', '이교사', true), true);
  assert.equal(mayManageBoardPost('', ''), false);
  assert.equal(mayManageBoardPost('김교사', '이교사', 'true'), false);
});
