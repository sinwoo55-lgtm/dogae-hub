import test from 'node:test';
import assert from 'node:assert/strict';
import { boardDateStart, boardPublicationWindow, boardPublicationState } from '../lib/board-lifecycle.js';

test('게시 종료일을 한국 시간 자정까지 포함하고 7일간 휴지통에 보관한다', () => {
  const window = boardPublicationWindow('2026-10-30', '2026-11-01');
  assert.equal(new Date(window.startsAt).toISOString(), '2026-10-29T15:00:00.000Z');
  assert.equal(new Date(window.expiresAt).toISOString(), '2026-11-01T15:00:00.000Z');
  assert.equal(boardPublicationState(window, window.startsAt - 1), 'scheduled');
  assert.equal(boardPublicationState(window, window.startsAt), 'published');
  assert.equal(boardPublicationState(window, window.expiresAt - 1), 'published');
  assert.equal(boardPublicationState(window, window.expiresAt), 'trash');
  assert.equal(boardPublicationState(window, window.purgeAt - 1), 'trash');
  assert.equal(boardPublicationState(window, window.purgeAt), 'purge');
});

test('유효하지 않은 날짜와 역순 기간을 거부한다', () => {
  assert.equal(boardDateStart('2026-02-29'), null);
  assert.equal(boardDateStart('2026-13-01'), null);
  assert.equal(boardPublicationWindow('2026-11-01', '2026-10-30'), null);
  assert.notEqual(boardDateStart('2024-02-29'), null);
});
