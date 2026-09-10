import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 실제 API의 조회 분기를 실행하되 데이터베이스와 네트워크 접근은 대체한다.
const source = readFileSync(new URL('../api/students.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default async function handler', 'async function handler');

async function query(classKey) {
  const calls = [];
  const collection = {
    doc: () => ({}),
    where(field, operator, value) {
      calls.push({ field, operator, value });
      return { get: async () => ({ docs: [{ id: 'test-student', data: () => ({ classKey: value, name: '테스트학생' }) }] }) };
    },
  };
  const context = vm.createContext({
    db: { collection: () => collection },
    allowJson: () => true,
    requireSchoolNetwork: () => true,
    console,
  });
  vm.runInContext(source, context);
  const response = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await context.handler({ method: 'GET', query: { classKey } }, response);
  return { response, calls };
}

test('중학교와 고등학교 모든 학년을 원래 학급 키로 조회한다', async () => {
  for (const key of ['중1-1', '중2-2', '중3-10', '1-1', '2-2', '3-10']) {
    const { response, calls } = await query(key);
    assert.equal(response.code, 200, key);
    assert.equal(response.body.students[0].classKey, key);
    assert.deepEqual(calls, [{ field: 'classKey', operator: '==', value: key }]);
  }
});

test('잘못된 학급 형식은 데이터베이스 조회 전에 차단한다', async () => {
  for (const key of ['중4-1', '중1', '중1-1/other', '중1-1-extra', 'abc-1']) {
    const { response, calls } = await query(key);
    assert.equal(response.code, 400, key);
    assert.equal(calls.length, 0);
  }
});
