import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { rosterBridgeAuthorized } from '../lib/roster-bridge-auth.js';
import { createRosterSyncCoordinator } from '../lib/roster-sync-coordinator.js';

const source = readFileSync(new URL('./roster-refresh-test-fixture.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default async function handler', 'async function handler');
async function request({ token = 'valid', role = 'teacher', status = 'active', origin = 'https://school.example', method = 'POST' } = {}) {
  let calls = 0;
  const context = vm.createContext({ console, URL, AbortSignal, process: { env: { SCHOOL_GUARD_WEB_ORIGIN: 'https://school.example', SCHOOL_HUB_ROSTER_BRIDGE_URL: 'https://hub.example/api/roster-bridge', SCHOOL_GUARD_ROSTER_SECRET: 'a'.repeat(32), FIREBASE_SERVICE_ACCOUNT_JSON: '{}' } },
    getApps: () => [{}], getAuth: () => ({ verifyIdToken: async value => { if (value !== 'valid') throw Error('invalid'); return { uid: 'u' }; } }),
    getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role, status }) }) }) }) }),
    fetch: async (_url, options) => { calls++; assert.equal(options.headers['x-roster-bridge'], 'a'.repeat(32)); return { ok: true, json: async () => ({ status: 'synced' }) }; } });
  vm.runInContext(source, context);
  const response = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(v) { this.code=v; return this; }, json(v) { this.body=v; return this; }, end() { return this; } };
  await context.handler({ method, headers: { origin, authorization: 'Bearer '+token } }, response);
  return { response, calls };
}
test('승인된 교사의 요청만 서버에서 허브에 전달한다', async () => {
  assert.equal((await request()).calls, 1);
  for (const options of [{ role: 'student' }, { status: 'pending' }, { origin: 'https://other.example' }, { token: 'invalid' }]) assert.equal((await request(options)).calls, 0);
});
test('허브 서버는 올바른 연동키만 수락한다', async () => {
  const secret='a'.repeat(32);
  assert.equal(await rosterBridgeAuthorized({ 'x-roster-bridge': secret }, secret), true);
  assert.equal(await rosterBridgeAuthorized({ 'x-roster-bridge': 'bad' }, secret), false);
  assert.equal(await rosterBridgeAuthorized({ 'x-roster-bridge': 'short' }, 'short'), false);
});

test('선도부 요청이 허브 변경분을 한 번 반영하고 이후 재조회는 생략한다', async () => {
  let state = { revision: 7, completedRevision: 2 }, fullReads = 0;
  const ref = {}, db = { runTransaction: async fn => fn({ get: async () => ({ exists: true, data: () => ({ ...state }) }), set: (_ref, patch) => { state = { ...state, ...patch }; } }) };
  const synchronize = createRosterSyncCoordinator({ db, ref, sync: async () => { fullReads++; return { synced: true }; } });
  const context = vm.createContext({ console, URL, AbortSignal, process: { env: { SCHOOL_GUARD_WEB_ORIGIN: 'https://school.example', SCHOOL_HUB_ROSTER_BRIDGE_URL: 'https://hub.example/api/roster-bridge', SCHOOL_GUARD_ROSTER_SECRET: 'a'.repeat(32), FIREBASE_SERVICE_ACCOUNT_JSON: '{}' } },
    getApps: () => [{}], getAuth: () => ({ verifyIdToken: async () => ({ uid: 'teacher' }) }), getFirestore: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'teacher', status: 'active' }) }) }) }) }),
    fetch: async (_url, options) => { assert.equal(await rosterBridgeAuthorized(options.headers, 'a'.repeat(32)), true); return { ok: true, json: synchronize }; } });
  vm.runInContext(source, context);
  async function trigger() { const res={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}}; await context.handler({method:'POST',headers:{origin:'https://school.example',authorization:'Bearer valid'}},res);return res.body; }
  assert.equal((await trigger()).status, 'synced'); assert.equal((await trigger()).status, 'unchanged');
  assert.equal(fullReads, 1); assert.equal(state.completedRevision, 7);
});
