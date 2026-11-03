import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../api/students.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replace('export default async function handler', 'async function handler');

async function save({ minimal, configured, deferred = false }) {
  let reads = 0;
  const writes = [];
  const snapshot = { docs: [{ id: 'student-1', data: () => ({ name: '학생' }) }] };
  const ref = { set: async () => {}, get: async () => ({ exists: true, data: () => ({ classes: ['1-1'] }) }) };
  const students = { doc: () => ref, get: async () => { reads++; return snapshot; } };
  const activities = { orderBy: () => ({ get: async () => ({ docs: [] }) }) };
  const meta = { doc: () => ref };
  const context = vm.createContext({ db: { collection: name => name === 'student_roster' ? students : name === 'student_activities' ? activities : meta, batch: () => ({ set: (...args) => writes.push(args), commit: async () => {} }) },
    FieldValue: { serverTimestamp: () => 1, increment: value => value }, allowJson: () => true, requireSchoolNetwork: () => true,
    studentActionRequiresAdmin: () => true, desktopAdminAccess: async () => true, authorizedDelegate: async () => false, allowLegacyStudentWrite: () => false, isSchoolNetwork: () => false, text: value => value, console, process: { env: deferred ? { SCHOOL_GUARD_DEFERRED_SYNC: 'true' } : {} }, createRosterSyncCoordinator: () => async () => ({}),
    syncSchoolGuardRoster: async options => { if (!configured) return { skipped: true }; reads++; const result = { synced: true }; if (options.includeSnapshot) Object.defineProperty(result, 'snapshot', { value: snapshot }); return result; },
    markSchoolGuardSyncFailure: async () => {} });
  vm.runInContext(source, context);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await context.handler({ method: 'POST', headers: minimal ? { prefer: 'return=minimal' } : {}, body: { action: 'roster:save', data: { grade: '1', classNo: '1', number: '1', name: '학생' } } }, response);
  return { reads, response, writes };
}

test('새 앱의 간결한 저장 응답은 불필요한 전체 조회를 하지 않는다', async () => {
  assert.equal((await save({ minimal: true, configured: false })).reads, 0);
  assert.equal((await save({ minimal: true, configured: true })).reads, 1);
});

test('지연 연동에서는 학생 저장과 변경 번호를 함께 기록하며 명단을 읽지 않는다', async () => {
  const { reads, response, writes } = await save({ minimal: true, configured: true, deferred: true });
  assert.equal(reads, 0); assert.equal(response.code, 200); assert.equal(writes.length, 2);
  assert.equal(writes[1][1].revision, 1);
});

test('이전 앱의 전체 응답은 선도부 동기화에 사용한 명단을 재사용한다', async () => {
  for (const configured of [true, false]) {
    const { reads, response } = await save({ minimal: false, configured });
    assert.equal(reads, 1);
    assert.equal(response.body.students[0].id, 'student-1');
    assert.equal(response.body.activities.length, 0);
  }
});

test('동기화 예약은 관리자 검증 후 전체 명단 조회 없이 변경 번호만 올린다', async () => {
  let writes = 0, syncs = 0;
  const doc = { set: async () => { writes++; } };
  const context = vm.createContext({ db: { collection: () => ({ doc: () => doc }) }, FieldValue: { increment: () => 1 },
    process: { env: { SCHOOL_GUARD_DEFERRED_SYNC: 'true' } }, console, allowJson: () => true, requireSchoolNetwork: () => true,
    studentActionRequiresAdmin: () => true, desktopAdminAccess: async () => true, authorizedDelegate: async () => false, allowLegacyStudentWrite: () => false, isSchoolNetwork: () => false,
    syncSchoolGuardRoster: async () => ({}), createRosterSyncCoordinator: () => async () => { syncs++; return {}; } });
  vm.runInContext(source, context);
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await context.handler({ method: 'POST', headers: {}, body: { action: 'roster:sync', queueOnly: true } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.rosterSync.queued, true); assert.equal(writes, 1); assert.equal(syncs, 0);
});
