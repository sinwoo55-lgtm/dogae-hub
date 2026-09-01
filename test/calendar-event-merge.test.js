import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeCalendarDayEvents } from '../lib/calendar-event-merge.js';

test('학사일정의 추석연휴와 공휴일 API의 추석은 한 항목으로 표시한다', () => {
  assert.deepEqual(mergeCalendarDayEvents([
    { type: 'academic', label: '추석연휴' },
    { type: 'holiday', label: '추석' }
  ]), [{ type: 'academic', label: '추석연휴' }]);
});

test('같은 날의 대체공휴일은 공휴일 API 항목을 중복 표시하지 않는다', () => {
  assert.deepEqual(mergeCalendarDayEvents([
    { type: 'holiday', label: '대체 공휴일' },
    { type: 'academic', label: '대체공휴일' }
  ]), [{ type: 'academic', label: '대체공휴일' }]);
});

test('공휴일과 관련 없는 학사일정은 함께 보존한다', () => {
  assert.deepEqual(mergeCalendarDayEvents([
    { type: 'academic', label: '재량휴업일' },
    { type: 'holiday', label: '광복절' }
  ]), [
    { type: 'academic', label: '재량휴업일' },
    { type: 'holiday', label: '광복절' }
  ]);
});
