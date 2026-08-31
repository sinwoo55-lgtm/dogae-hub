import test from 'node:test';
import assert from 'node:assert/strict';
import { classCode, findSwapOptions, normalizeTeacherName } from '../lib/timetable-swap.js';

const timetable = {
  teachers: [
    { id: 'a', name: '교사 A', hours: [{ day: '월', period: 3, label: '103\n수학', classCode: '103' }] },
    { id: 'b', name: '교사 B', hours: [{ day: '화', period: 2, label: '103\n영어', classCode: '103' }] },
    { id: 'c', name: '교사 C', hours: [{ day: '월', period: 3, label: '201\n과학', classCode: '201' }, { day: '화', period: 2, label: '103\n국어', classCode: '103' }] },
    { id: 'd', name: '교사 D', hours: [{ day: '월', period: 3, label: '101\n사회', classCode: '101' }, { day: '화', period: 2, label: '103\n사회', classCode: '103' }] },
  ],
};

test('시간표 셀에서 중·고등 학급 코드를 분리한다', () => {
  assert.equal(classCode('101\n영어2'), '101');
  assert.equal(classCode('중1-2\n과학'), '중1-2');
  assert.equal(classCode('동아리'), '');
  assert.equal(normalizeTeacherName('홍길동(16)'), '홍길동');
});

test('같은 학급 수업과 상호 공강을 모두 만족하는 교체만 찾는다', () => {
  const result = findSwapOptions(timetable, { teacherId: 'a', day: '월', period: 3 });
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].teacher.id, 'b');
  assert.deepEqual(result.options[0].returnSlot, { day: '화', period: 2, label: '103\n영어' });
});

test('학급 수업이 아닌 칸은 교체 대상에서 제외한다', () => {
  const result = findSwapOptions({ teachers: [{ id: 'a', name: 'A', hours: [{ day: '월', period: 1, label: '동아리', classCode: '' }] }] }, { teacherId: 'a', day: '월', period: 1 });
  assert.match(result.error, /학급 수업/);
});
