import test from 'node:test';
import assert from 'node:assert/strict';
import { backupStateDifferences, restorePlan } from '../lib/backup-utils.js';

function cloneRecords(records) {
  return structuredClone(records);
}

// Firestore에 연결하지 않는 격리 복원 모의훈련: 실제 복원과 같은 삭제 → 재기록 → 검증 순서를 검증한다.
function runRestoreDrill({ backupRecords, currentRecords, afterRestore }) {
  const safetyBackupRecords = cloneRecords(currentRecords);
  const plan = restorePlan(currentRecords.map((record) => record.path), backupRecords.map((record) => record.path));
  const restored = new Map(currentRecords.map((record) => [record.path, record.data]));
  plan.deletePaths.forEach((path) => restored.delete(path));
  backupRecords.forEach((record) => restored.set(record.path, record.data));
  afterRestore?.(restored);
  const restoredRecords = [...restored.entries()].map(([path, data]) => ({ path, data }));
  const differences = backupStateDifferences(restoredRecords, backupRecords);
  return {
    safetyBackupRecords,
    deleteCount: plan.deletePaths.length,
    restoreCount: plan.restorePaths.length,
    verification: differences,
    status: differences.matches ? 'completed' : 'failed',
  };
}

test('격리 복원 모의훈련은 현재 전용 문서를 삭제하고 백업 시점과 일치하게 복원한다', () => {
  const backupRecords = [
    { path: 'dashboard_posts/a', data: { title: '백업 제목' } },
    { path: 'student_roster/1001', data: { name: '학생 A' } },
  ];
  const currentRecords = [
    { path: 'dashboard_posts/a', data: { title: '변경된 제목' } },
    { path: 'dashboard_posts/new', data: { title: '백업 후 생성' } },
  ];

  const drill = runRestoreDrill({ backupRecords, currentRecords });
  assert.equal(drill.status, 'completed');
  assert.equal(drill.deleteCount, 1);
  assert.equal(drill.restoreCount, 2);
  assert.equal(drill.verification.matches, true);
  assert.deepEqual(drill.safetyBackupRecords, currentRecords);
});

test('격리 복원 모의훈련은 복원 뒤 변경이 생기면 실패로 기록하고 안전 백업을 보존한다', () => {
  const backupRecords = [{ path: 'dashboard_posts/a', data: { title: '백업 제목' } }];
  const currentRecords = [{ path: 'dashboard_posts/a', data: { title: '현재 제목' } }];

  const drill = runRestoreDrill({
    backupRecords,
    currentRecords,
    afterRestore: (records) => records.set('dashboard_posts/a', { title: '충돌로 변경됨' }),
  });
  assert.equal(drill.status, 'failed');
  assert.deepEqual(drill.verification.changedPaths, ['dashboard_posts/a']);
  assert.deepEqual(drill.safetyBackupRecords, currentRecords);
});
