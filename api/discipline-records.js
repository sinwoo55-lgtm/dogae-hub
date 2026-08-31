import { db } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';
import { isSchoolGuardClassEligible } from '../lib/school-guard-eligibility.js';
import { needsDisciplineRefresh } from '../lib/discipline-freshness.js';
import { markDisciplineSyncFailure, syncDisciplineRecords } from './discipline-sync.js';

const validClass = (value) => typeof value === 'string' && /^\d{1,10}-\d{1,10}$/.test(value) && isSchoolGuardClassEligible(value);
const META = db.collection('discipline_meta').doc('latest');
const SYNC_LOCK = db.collection('discipline_meta').doc('on_demand_sync_lock');
const LOCK_MS = 2 * 60 * 1000;
const RETRY_COOLDOWN_MS = 10 * 60 * 1000;

async function claimOnDemandSync() {
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const lock = await tx.get(SYNC_LOCK);
    const data = lock.exists ? lock.data() : {};
    if (Number(data.expiresAt || 0) > now) return { claimed: false, status: 'in-progress' };
    if (Number(data.retryAfter || 0) > now) return { claimed: false, status: 'cooldown' };
    tx.set(SYNC_LOCK, { status: 'in-progress', startedAt: now, expiresAt: now + LOCK_MS });
    return { claimed: true, status: 'updated' };
  });
}

async function refreshIfStale(meta) {
  if (!needsDisciplineRefresh(meta)) return { status: 'fresh' };
  const claim = await claimOnDemandSync();
  if (!claim.claimed) return { status: claim.status };
  try {
    const result = await syncDisciplineRecords();
    if (!result.synced) throw new Error(result.reason || '지적사항 연동 설정이 완료되지 않았습니다.');
    await SYNC_LOCK.delete();
    return { status: 'updated', result };
  } catch (error) {
    await markDisciplineSyncFailure(error);
    const now = Date.now();
    await SYNC_LOCK.set({ status: 'failed', lastError: String(error?.message || error).slice(0, 400), retryAfter: now + RETRY_COOLDOWN_MS, expiresAt: now + RETRY_COOLDOWN_MS });
    return { status: 'failed' };
  }
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  const classKey = req.query?.classKey;
  if (!validClass(classKey)) return res.status(400).json({ error: '지적사항은 선도부 관리 대상인 고등 학급만 조회할 수 있습니다.' });
  try {
    const initialMeta = await META.get();
    const freshness = await refreshIfStale(initialMeta.exists ? initialMeta.data() : null);
    const [records, summaries, meta] = await Promise.all([
      db.collection('discipline_records').where('classKey', '==', classKey).get(),
      db.collection('discipline_summaries').where('classKey', '==', classKey).get(),
      META.get()
    ]);
    return res.status(200).json({
      records: records.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      summaries: summaries.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      syncedAt: meta.exists ? meta.data().syncedAt?.toDate?.().toISOString() || null : null,
      freshness: { status: freshness.status }
    });
  } catch (error) { console.error('discipline records error', error); return res.status(500).json({ error: '지적사항을 불러오지 못했습니다.' }); }
}
