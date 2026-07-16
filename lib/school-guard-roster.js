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
  const students = snapshot.docs.map((doc) => {
    const row = doc.data();
    return { grade: String(row.grade || ''), classNo: String(row.classNo || ''), number: String(row.number || ''), name: String(row.name || ''), status: row.status || '재학' };
  }).filter((row) => row.grade && row.classNo && row.number && row.name);
  const response = await fetch(process.env.SCHOOL_GUARD_ROSTER_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SCHOOL_GUARD_ROSTER_SECRET}` },
    body: JSON.stringify({ students })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.error || `school guard roster sync failed (${response.status})`);
  await META.set({ syncedAt: FieldValue.serverTimestamp(), studentCount: students.length, lastResult: 'success' }, { merge: true });
  return { synced: true, students: students.length };
}

export async function markSchoolGuardSyncFailure(error) {
  await META.set({ attemptedAt: FieldValue.serverTimestamp(), lastResult: 'failed', lastError: String(error?.message || error).slice(0, 400) }, { merge: true });
}
