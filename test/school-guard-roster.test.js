import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateRoster } from '../lib/roster-dedup.js';

test('같은 학번은 재학생을 우선해 선도부에 하나만 전송한다', () => {
  const result = deduplicateRoster([
    { grade: '1', classNo: '2', number: '3', name: '이전학생', status: '전출', updatedAt: 50 },
    { grade: '1', classNo: '2', number: '3', name: '현재학생', status: '재학', updatedAt: 10 },
  ]);
  assert.deepEqual(result, [{ grade: '1', classNo: '2', number: '3', name: '현재학생', status: '재학' }]);
});

test('같은 상태의 중복은 가장 최근 명단을 사용한다', () => {
  const result = deduplicateRoster([
    { grade: '2', classNo: '1', number: '8', name: '김학생', status: '재학', updatedAt: 10 },
    { grade: '2', classNo: '1', number: '8', name: '김학생', status: '재학', updatedAt: 20 },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].number, '8');
});
