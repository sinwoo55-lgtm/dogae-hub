import test from 'node:test';
import assert from 'node:assert/strict';
import { createRosterSyncCoordinator } from '../lib/roster-sync-coordinator.js';

function fixture(initial = {}) {
  let state = { ...initial }, queue = Promise.resolve();
  const ref = {}, db = { runTransaction(callback) {
    const run = queue.then(async () => {
      const tx = { get: async () => ({ exists: true, data: () => ({ ...state }) }), set: (_ref, patch) => { state = { ...state, ...patch }; } };
      return callback(tx);
    });
    queue = run.catch(() => {}); return run;
  } };
  return { db, ref, state: () => state, update: patch => { state = { ...state, ...patch }; } };
}
test('변경이 없으면 전체 명단을 읽지 않는다', async () => {
  const f = fixture({ revision: 3, completedRevision: 3 }); let calls = 0;
  const run = createRosterSyncCoordinator({ ...f, sync: async () => { calls++; return { synced: true }; } });
  assert.equal((await run()).status, 'unchanged'); assert.equal(calls, 0);
});
test('변경 누적은 한 번 동기화하며 동시에 요청해도 중복하지 않는다', async () => {
  const f = fixture({ revision: 30, completedRevision: 0 }); let calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const run = createRosterSyncCoordinator({ ...f, sync: async () => { calls++; await gate; return { synced: true }; } });
  const first = run(); await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal((await run()).status, 'busy'); release();
  assert.equal((await first).status, 'synced'); assert.equal(calls, 1); assert.equal(f.state().completedRevision, 30);
});
test('동기화 중 생긴 변경은 다음 동기화를 위해 남긴다', async () => {
  const f = fixture({ revision: 3, completedRevision: 2 }); let calls = 0;
  const run = createRosterSyncCoordinator({ ...f, sync: async () => { calls++; if (calls === 1) f.update({ revision: 4 }); return { synced: true }; } });
  assert.equal((await run()).pending, true); assert.equal(f.state().completedRevision, 3);
  assert.equal((await run()).pending, false); assert.equal(f.state().completedRevision, 4);
});
test('동기화 실패는 완료 처리하지 않고 재시도를 허용한다', async () => {
  const f = fixture({ revision: 1, completedRevision: 0 }); let calls = 0;
  const run = createRosterSyncCoordinator({ ...f, sync: async () => { if (!calls++) throw Error('실패'); return { synced: true }; } });
  await assert.rejects(run(), /실패/); assert.equal(f.state().completedRevision, 0);
  assert.equal((await run()).status, 'synced');
});
test('작업 시간이 만료된 오래된 동기화는 재동기화를 예약한다', async () => {
  const f = fixture({ revision: 1, completedRevision: 0 }); let time = 0, release;
  const gate = new Promise(resolve => { release = resolve; }); let calls = 0;
  const run = createRosterSyncCoordinator({ ...f, now: () => time, leaseMs: 10, sync: async () => { if (++calls === 1) await gate; return { synced: true }; } });
  const old = run(); await new Promise(resolve => setTimeout(resolve, 5)); time = 11;
  assert.equal((await run()).status, 'synced'); release(); await assert.rejects(old, /만료/);
  assert.equal(f.state().revision, 2); assert.equal(f.state().completedRevision, 1);
  assert.equal((await run()).status, 'synced');
});
