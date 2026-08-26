import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRosterUploadData } from '../lib/roster-upload.js';

test('학생 열이 비어 있는 안내 행은 업로드 명단에서 제외한다', () => {
  assert.equal(hasRosterUploadData({ grade: '', classNo: '', number: '', name: '', guide: '중학생은 중1로 입력' }), false);
  assert.equal(hasRosterUploadData({ grade: '중1', classNo: '1', number: '1', name: '홍길동' }), true);
});
