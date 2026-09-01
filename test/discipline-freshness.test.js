import test from 'node:test';
import assert from 'node:assert/strict';
import { koreaDateKey, koreaYesterdayKey, needsDisciplineRefresh } from '../lib/discipline-freshness.js';

test('지적사항 최신화는 한국 시간 같은 날짜의 성공 기록만 최신으로 본다', () => {
  const now = new Date('2026-08-30T15:30:00.000Z'); // 한국 시간 8월 31일 00:30
  assert.equal(koreaDateKey(new Date('2026-08-30T14:30:00.000Z')), '2026-08-30');
  assert.equal(koreaYesterdayKey(now), '2026-08-30');
  assert.equal(needsDisciplineRefresh({ lastResult: 'success', syncedAt: new Date('2026-08-30T14:30:00.000Z') }, now), true);
  assert.equal(needsDisciplineRefresh({ lastResult: 'success', syncedAt: new Date('2026-08-30T15:20:00.000Z') }, now), false);
});

test('지적사항 최신화는 전날 기록 또는 실패 기록이면 필요하다', () => {
  const now = new Date('2026-08-31T03:00:00.000Z'); // 한국 시간 8월 31일 12:00
  assert.equal(needsDisciplineRefresh({ lastResult: 'success', syncedAt: new Date('2026-08-30T14:30:00.000Z') }, now), true);
  assert.equal(needsDisciplineRefresh({ lastResult: 'failed', syncedAt: new Date('2026-08-30T14:30:00.000Z') }, now), true);
});
