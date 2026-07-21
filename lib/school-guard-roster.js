import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebase-admin.js';

const STUDENTS = db.collection('student_roster');
const META = db.collection('student_meta').doc('school_guard_sync');

function configured() {
  return Boolean(process.env.SCHOOL_GUARD_ROSTER_URL && process.env.SCHOOL_GUARD_ROSTER_SECRET);
}

export async function syncSchoolGuardRoster() {
  if (!configured()) return { skipped: true, reason: 'school guard roster sync is not configured' };
  const snapshot = await STUDENTS.get();
  const candidates = snapshot.docs.map((doc) => {
    const row = doc.data();
    return { grade: String(row.grade || ''), classNo: String(row.classNo || ''), number: String(row.number || ''), name: String(row.name || ''), status: row.status || '재학', updatedAt: row.updatedAt?.toMillis?.() || 0 };
  }).filter((row) => row.grade && row.classNo && row.number && row.name);
  const unique = new Map();
  for (const row of candidates) {
    const key = `${row.grade}-${row.classNo}-${row.number}`, previous = unique.get(key);
    const rowActive = row.status !== '전출', previousActive = previous?.status !== '전출';
    if (!previous || (rowActive && !previousActive) || (rowActive === previousActive && row.updatedAt >= previous.updatedAt)) unique.set(key, row);
  }
  const students = [...unique.values()].map(({ updatedAt, ...row }) => row);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SCHOOL_GUARD_ROSTER_SECRET}` };
  if (process.env.SCHOOL_GUARD_VERCEL_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.SCHOOL_GUARD_VERCEL_BYPASS_SECRET;
  const response = await fetch(process.env.SCHOOL_GUARD_ROSTER_URL, {
    method: 'POST', headers,
    body: JSON.stringify({ students })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    const detail = typeof payload?.error === 'string' ? payload.error : JSON.stringify(payload?.error || payload || {});
    throw new Error(`school guard roster sync failed (${response.status}): ${detail}`);
  }
  await META.set({ syncedAt: FieldValue.serverTimestamp(), studentCount: students.length, lastResult: 'success' }, { merge: true });
  return { synced: true, students: students.length };
}

export async function markSchoolGuardSyncFailure(error) {
  await META.set({ attemptedAt: FieldValue.serverTimestamp(), lastResult: 'failed', lastError: String(error?.message || error).slice(0, 400) }, { merge: true });
}
