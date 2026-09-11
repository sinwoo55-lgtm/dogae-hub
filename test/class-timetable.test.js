import test from 'node:test';
import assert from 'node:assert/strict';
import { classTimetableData } from '../lib/class-timetable.js';

const cells = () => Array.from({ length: 35 }, (_, index) => ({ subject: index ? '' : '국어', teacher: index ? '' : '이신우' }));

test('학급 시간표는 5일 7교시의 35개 수업 칸을 저장한다', () => {
  const result = classTimetableData({ title: '1학년 1반', theme: 'blue', backgroundImage: '', backgroundOpacity: 0.15, cells: cells() });
  assert.equal(result.cells.length, 35);
  assert.deepEqual(result.cells[0], { subject: '국어', teacher: '이신우' });
});

test('학급 시간표의 잘못된 테마, 칸 수, 배경 이미지를 거부한다', () => {
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'unknown', backgroundImage: '', backgroundOpacity: 0.15, cells: cells() }), null);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', backgroundImage: '', backgroundOpacity: 0.15, cells: cells().slice(1) }), null);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', backgroundImage: 'https://example.com/image.png', backgroundOpacity: 0.15, cells: cells() }), null);
});

test('배경 투명도와 셀 입력 길이를 제한한다', () => {
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', backgroundImage: '', backgroundOpacity: 0.8, cells: cells() }), null);
  const longCells = cells(); longCells[0].subject = '가'.repeat(31);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', backgroundImage: '', backgroundOpacity: 0.15, cells: longCells }), null);
});
