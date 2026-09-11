import test from 'node:test';
import assert from 'node:assert/strict';
import { classTimetablePrintSettings, tileBackgroundPosition } from '../lib/class-timetable-print.js';

test('A4와 B4 인쇄 용지 및 분할 인쇄 구성을 검증한다', () => {
  assert.deepEqual(classTimetablePrintSettings({ paper: 'A4', mode: 'tile4' }).mode, { kind: 'tile', rows: 2, columns: 2, count: 4 });
  assert.deepEqual(classTimetablePrintSettings({ paper: 'B4', mode: 'tile9' }).paper, { name: 'B4', widthMm: 257, heightMm: 364 });
  assert.equal(classTimetablePrintSettings({ paper: 'A3', mode: 'tile4' }), null);
});

test('분할 인쇄 조각은 원본 이미지의 모서리와 중앙을 정확히 사용한다', () => {
  assert.deepEqual(tileBackgroundPosition(0, 3, 3), { xPercent: 0, yPercent: 0 });
  assert.deepEqual(tileBackgroundPosition(4, 3, 3), { xPercent: 50, yPercent: 50 });
  assert.deepEqual(tileBackgroundPosition(8, 3, 3), { xPercent: 100, yPercent: 100 });
});

test('축소 인쇄는 용지 한 장에 선택한 시간표 수를 배치한다', () => {
  assert.deepEqual(classTimetablePrintSettings({ paper: 'A4', mode: 'mini6' }).mode, { kind: 'mini', rows: 3, columns: 2, count: 6 });
  assert.deepEqual(classTimetablePrintSettings({ paper: 'B4', mode: 'mini9' }).mode, { kind: 'mini', rows: 3, columns: 3, count: 9 });
});
