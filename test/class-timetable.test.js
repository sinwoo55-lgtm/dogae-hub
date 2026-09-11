import test from 'node:test';
import assert from 'node:assert/strict';
import { classTimetableData } from '../lib/class-timetable.js';

const cells = () => Array.from({ length: 35 }, (_, index) => ({ subject: index ? '' : '국어', teacher: index ? '' : '이신우' }));
const design = { backgroundImage: '', backgroundOpacity: 0.45, cellOpacity: 0.72, colors: { paper: '#FFFCEF', head: '#D7E5F5', grid: '#263A5F', ink: '#101827' }, imageFit: 'cover', imagePosition: 'center' };

test('학급 시간표는 5일 7교시의 35개 수업 칸을 저장한다', () => {
  const result = classTimetableData({ title: '1학년 1반', theme: 'blue', ...design, cells: cells() });
  assert.equal(result.cells.length, 35);
  assert.deepEqual(result.cells[0], { subject: '국어', teacher: '이신우' });
});

test('학급 시간표의 잘못된 테마, 칸 수, 배경 이미지를 거부한다', () => {
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'unknown', ...design, cells: cells() }), null);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', ...design, cells: cells().slice(1) }), null);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', ...design, backgroundImage: 'https://example.com/image.png', cells: cells() }), null);
});

test('배경 투명도와 셀 입력 길이를 제한한다', () => {
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', ...design, backgroundOpacity: 1.1, cells: cells() }), null);
  const longCells = cells(); longCells[0].subject = '가'.repeat(31);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', ...design, cells: longCells }), null);
  assert.equal(classTimetableData({ title: '1학년 1반', theme: 'blue', ...design, colors: { ...design.colors, ink: 'navy' }, cells: cells() }), null);
});
