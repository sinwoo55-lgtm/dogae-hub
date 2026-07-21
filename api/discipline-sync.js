import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const RECORDS = db.collection('discipline_records');
const SUMMARIES = db.collection('discipline_summaries');
const META = db.collection('discipline_meta').doc('latest');
const chunk = (rows, size = 400) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
const clean = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const classKey = (row) => `${clean(row.grade, 10)}-${clean(row.classNo, 10)}`;
const studentKey = (row) => `${classKey(row)}-${clean(row.number, 10)}`;

function cronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

function configured() {
  return Boolean(process.env.DISCIPLINE_EXPORT_URL && process.env.DISCIPLINE_SYNC_SECRET);
}

async function writeSnapshot(collection, rows, mapper) {
  const existing = await collection.get();
  const incoming = new Set(rows.map((row) => row.id));
  for (const rowsToWrite of chunk(rows)) {
    const batch = db.batch();
    rowsToWrite.forEach((row) => batch.set(collection.doc(row.id), mapper(row), { merge: false }));
    await batch.commit();
  }
  const removed = existing.docs.filter((doc) => !incoming.has(doc.id));
  for (const rowsToDelete of chunk(removed)) {
    const batch = db.batch();
    rowsToDelete.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

function record(row) {
  const grade = clean(row.grade, 10), classNo = clean(row.classNo, 10), number = clean(row.number, 10), studentName = clean(row.studentName, 60);
  if (!clean(row.id, 150) || !grade || !classNo || !number || !studentName) return null;
  return {
    id: clean(row.id, 150), grade, classNo, number, studentName,
    classKey: `${grade}-${classNo}`, studentKey: `${grade}-${classNo}-${number}`,
    reason: clean(row.reason, 120), reasonDetail: clean(row.reasonDetail, 1000), date: clean(row.date, 10),
    counted: row.counted === true, isExtraService: row.isExtraService === true,
    source: 'school-guard', syncedAt: FieldValue.serverTimestamp()
  };
}

function summary(row) {
  const grade = clean(row.grade, 10), classNo = clean(row.classNo, 10), number = clean(row.number, 10), studentName = clean(row.studentName, 60);
  const id = clean(row.studentId, 150);
  if (!id || !grade || !classNo || !number || !studentName) return null;
  return {
    id, grade, classNo, number, studentName, classKey: `${grade}-${classNo}`, studentKey: `${grade}-${classNo}-${number}`,
    violationCount: Math.max(0, Number(row.violationCount) || 0), serviceCompletedCount: Math.max(0, Number(row.serviceCompletedCount) || 0),
    extraServiceOrders: Math.max(0, Number(row.extraServiceOrders) || 0), source: 'school-guard', syncedAt: FieldValue.serverTimestamp()
  };
}

export async function syncDisciplineRecords() {
  if (!configured()) return { skipped: true, reason: 'discipline sync is not configured' };
  const response = await fetch(process.env.DISCIPLINE_EXPORT_URL, { headers: { Authorization: `Bearer ${process.env.DISCIPLINE_SYNC_SECRET}` } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) throw new Error(payload?.error || `discipline export failed (${response.status})`);
  const records = (Array.isArray(payload.records) ? payload.records : []).map(record).filter(Boolean);
  const summaries = (Array.isArray(payload.summaries) ? payload.summaries : []).map(summary).filter(Boolean);
  await writeSnapshot(RECORDS, records, ({ id, ...data }) => data);
  await writeSnapshot(SUMMARIES, summaries, ({ id, ...data }) => data);
  await META.set({ source: 'school-guard', exportedAt: clean(payload.exportedAt, 40), recordCount: records.length, summaryCount: summaries.length, syncedAt: FieldValue.serverTimestamp() });
  return { synced: true, records: records.length, summaries: summaries.length };
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!cronAuthorized(req) && !requireSchoolNetwork(req, res)) return;
  try { return res.status(200).json(await syncDisciplineRecords()); }
  catch (error) { console.error('discipline sync error', error); return res.status(502).json({ error: '지적사항 동기화에 실패했습니다.' }); }
}
