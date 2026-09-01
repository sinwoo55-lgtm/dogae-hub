import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR_REFRESH_SPAN, calendarRefreshYears } from '../lib/calendar-refresh-window.js';

test('나이스 학사일정은 올해 앞뒤 1년을 기본으로 갱신한다', () => {
  assert.equal(DEFAULT_CALENDAR_REFRESH_SPAN, 1);
  assert.deepEqual(calendarRefreshYears(2026), [2025, 2026, 2027]);
  assert.deepEqual(calendarRefreshYears(2026, 2), [2024, 2025, 2026, 2027, 2028]);
});
