import test from 'node:test';
import assert from 'node:assert/strict';
import { backupItemId, koreaDateKey } from '../lib/backup-utils.js';

test('백업 날짜는 한국 시간 기준으로 생성한다', () => {
  assert.equal(koreaDateKey(new Date('2026-08-22T15:30:00Z')), '2026-08-23');
});

test('백업 문서 식별자는 Firestore 문서 ID로 안전하다', () => {
  const id = backupItemId('seating_classes/1-2/history/a/b');
  assert.match(id, /^[A-Za-z0-9_-]+$/);
  assert.equal(Buffer.from(id, 'base64url').toString('utf8'), 'seating_classes/1-2/history/a/b');
});
