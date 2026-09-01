import test from 'node:test';
import assert from 'node:assert/strict';
import { timetableTerm, timetableTermLabel } from '../lib/timetable-term.js';

test('시간표 학년도와 학기는 유효한 학기 정보만 저장한다', () => {
  assert.deepEqual(timetableTerm({ academicYear: '2026', semester: '2' }), { academicYear: 2026, semester: '2' });
  assert.equal(timetableTermLabel({ academicYear: 2026, semester: 2 }), '2026학년도 2학기');
  assert.equal(timetableTerm({ academicYear: '2019', semester: '1' }), null);
  assert.equal(timetableTerm({ academicYear: '2026', semester: '3' }), null);
});
