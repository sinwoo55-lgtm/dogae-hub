import test from 'node:test';
import assert from 'node:assert/strict';
import { nextScheduleVersion, versionedScheduleChanges } from '../lib/schedule-changes.js';

test('일정 변경은 항상 다음 버전을 사용한다', () => {
  assert.equal(nextScheduleVersion(5), 6);
  assert.equal(nextScheduleVersion(undefined), 1);
});

test('일정 삭제와 등록은 동일한 버전의 변경 묶음으로 기록한다', () => {
  const result = versionedScheduleChanges(8, [{ type: 'delete', id: 'old' }, { type: 'upsert', post: { id: 'new' } }], 123);
  assert.deepEqual(result, { version: 9, changes: [{ version: 9, type: 'delete', id: 'old', changedAt: 123 }, { version: 9, type: 'upsert', post: { id: 'new' }, changedAt: 123 }] });
});
