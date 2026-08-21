import test from 'node:test';
import assert from 'node:assert/strict';
import { backupItemId, isRestorableBackupId, koreaDateKey, restorePlan } from '../lib/backup-utils.js';

test('백업 날짜는 한국 시간 기준으로 생성한다', () => {
  assert.equal(koreaDateKey(new Date('2026-08-22T15:30:00Z')), '2026-08-23');
});

test('백업 문서 식별자는 Firestore 문서 ID로 안전하다', () => {
  const id = backupItemId('seating_classes/1-2/history/a/b');
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(id, 'base64url').toString('utf8'), 'seating_classes/1-2/history/a/b');
});

test('복원 계획은 백업에 없는 현재 문서를 삭제하고 모든 백업 문서를 복원한다', () => {
  const plan = restorePlan(['posts/a', 'posts/b', 'classes/1/students/a'], ['posts/a', 'classes/1/students/c']);
  assert.deepEqual(plan.deletePaths.sort(), ['classes/1/students/a', 'posts/b']);
  assert.deepEqual(plan.restorePaths.sort(), ['classes/1/students/c', 'posts/a']);
});

test('정기 백업과 복원 전 안전 백업 ID만 복원 대상으로 허용한다', () => {
  assert.equal(isRestorableBackupId('2026-08-20'), true);
  assert.equal(isRestorableBackupId('pre-restore-1787270400000'), true);
  assert.equal(isRestorableBackupId('weekly_backups'), false);
});
