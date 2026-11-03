import { db } from '../lib/firebase-admin.js';
import { rosterBridgeAuthorized } from '../lib/roster-bridge-auth.js';
import { createRosterSyncCoordinator } from '../lib/roster-sync-coordinator.js';
import { syncSchoolGuardRoster, markSchoolGuardSyncFailure } from '../lib/school-guard-roster.js';

const synchronize = createRosterSyncCoordinator({ db, ref: db.collection('student_meta').doc('school_guard_revision'), sync: syncSchoolGuardRoster });
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!await rosterBridgeAuthorized(req.headers)) return res.status(401).json({ error: 'Unauthorized' });
  if (process.env.SCHOOL_GUARD_DEFERRED_SYNC !== 'true') return res.status(200).json({ status: 'disabled' });
  try { return res.status(200).json(await synchronize()); }
  catch (error) { console.error('deferred roster sync failed', error); await markSchoolGuardSyncFailure(error).catch(() => {}); return res.status(502).json({ error: '명단 동기화에 실패했습니다.' }); }
}
