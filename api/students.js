import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase-admin.js';
import { allowJson, text } from '../lib/http.js';
import { requireSchoolNetwork, isSchoolNetwork } from '../lib/school-access.js';
import { desktopAdminAccess } from '../lib/desktop-admin.js';
import { authorizedDelegate } from '../lib/delegated-handler.js';
import { studentActionRequiresAdmin, allowLegacyStudentWrite } from '../lib/delegated-access.js';
import { markSchoolGuardSyncFailure, syncSchoolGuardRoster } from '../lib/school-guard-roster.js';
import { createRosterSyncCoordinator } from '../lib/roster-sync-coordinator.js';
import { applyRosterBatch, rosterRevision } from '../lib/roster-batch.js';
import { hasRosterUploadData } from '../lib/roster-upload.js';
import { markDisciplineSyncFailure, syncDisciplineRecords } from './discipline-sync.js';

const STUDENTS = db.collection('student_roster');
const ACTIVITIES = db.collection('student_activities');
const ROSTER_META = db.collection('student_meta').doc('roster');
const SYNC_REVISION = db.collection('student_meta').doc('school_guard_revision');
const deferredRosterSync = () => process.env.SCHOOL_GUARD_DEFERRED_SYNC === 'true';
const syncDeferredRoster = createRosterSyncCoordinator({ db, ref: SYNC_REVISION, sync: syncSchoolGuardRoster });
function markRosterChange(batch) { if (deferredRosterSync()) batch.set(SYNC_REVISION, { revision: FieldValue.increment(1) }, { merge: true }); }
const idOk = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);
const studentIdOk = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 150 && !value.includes('/');
const dateOk = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

function studentKey(student) { return `${student.grade}-${student.classNo}-${student.number}-${student.name}`; }
function classKey(student) { return `${student.grade}-${student.classNo}`; }
function normalizeStudent(value) {
  if (!value || typeof value !== 'object') return null;
  const grade = text(String(value.grade ?? ''), 10);
  const classNo = text(String(value.classNo ?? value.class ?? ''), 10);
  const number = text(String(value.number ?? ''), 10);
  const name = text(value.name, 40);
  const status = ['재학', '전입', '전출'].includes(value.status) ? value.status : '재학';
  const changedAt = dateOk(value.changedAt) ? value.changedAt : '';
  if (!grade || !classNo || !number || !name) return null;
  return { grade, classNo, number, name, status, changedAt, key: studentKey({ grade, classNo, number, name }), classKey: classKey({ grade, classNo }) };
}
function normalizeActivity(value) {
  if (!value || typeof value !== 'object') return null;
  const teacher = text(value.teacher, 40), title = text(value.title, 100), description = text(value.description ?? '', 2000);
  const startDate = text(value.startDate, 10), endDate = text(value.endDate, 10);
  if (!teacher || !title || description === null || !dateOk(startDate) || !dateOk(endDate) || startDate > endDate || !Array.isArray(value.participants) || !value.participants.length || value.participants.length > 500) return null;
  const participants = [...new Set(value.participants.filter(idOk))];
  if (!participants.length) return null;
  return { teacher, title, description, startDate, endDate, participants };
}
async function snapshot(res) {
  const [students, activities] = await Promise.all([STUDENTS.get(), ACTIVITIES.orderBy('startDate').get()]);
  return res.status(200).json({ students: students.docs.map(doc => ({ id: doc.id, ...doc.data(), _revision: rosterRevision(doc) })), activities: activities.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
}

function classList(rows) {
  return [...new Set(rows.map((row) => row.classKey || classKey(row)))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
}

async function rosterMeta() {
  const meta = await ROSTER_META.get();
  if (meta.exists && Array.isArray(meta.data().classes)) return meta.data().classes;

  // 기존 명렬은 최초 1회만 읽어 classKey를 보완한다. 이후 학급 조회는 해당 반만 읽는다.
  const all = await STUDENTS.get();
  const updates = all.docs.filter((doc) => doc.data().classKey !== classKey(doc.data()));
  for (let offset = 0; offset < updates.length; offset += 450) {
    const batch = db.batch();
    updates.slice(offset, offset + 450).forEach((doc) => batch.update(doc.ref, { classKey: classKey(doc.data()) }));
    await batch.commit();
  }
  const classes = classList(all.docs.map((doc) => doc.data()));
  await ROSTER_META.set({ classes, updatedAt: FieldValue.serverTimestamp() });
  return classes;
}

async function mergeRosterMeta(rows) {
  const existing = await ROSTER_META.get();
  const oldClasses = existing.exists && Array.isArray(existing.data().classes) ? existing.data().classes : [];
  const classes = [...new Set(oldClasses.concat(classList(rows)))].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
  await ROSTER_META.set({ classes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  try {
    if (req.method === 'GET') {
      if (req.query?.meta === '1') return res.status(200).json({ classes: await rosterMeta(), batchEditVersion: 2 });
      const selectedClass = typeof req.query?.classKey === 'string' ? req.query.classKey : '';
      if (selectedClass) {
        if (!/^(?:\d{1,10}|중[1-3])-\d{1,10}$/.test(selectedClass)) return res.status(400).json({ error: '학급 정보가 올바르지 않습니다.' });
        const students = await STUDENTS.where('classKey', '==', selectedClass).get();
        return res.status(200).json({ students: students.docs.map(doc => ({ id: doc.id, ...doc.data(), _revision: rosterRevision(doc) })) });
      }
      return snapshot(res);
    }
    const { action, id, data } = req.body || {};
    if (studentActionRequiresAdmin(action)) {
      if (!await desktopAdminAccess(req.headers) && !await authorizedDelegate(req.headers,'students') && !allowLegacyStudentWrite(req.headers,isSchoolNetwork(req.headers))) return res.status(403).json({error:'학생관리 관리자 인증이 필요합니다.'});
    }
    if (action === 'roster:batch') {
      if (!deferredRosterSync()) return res.status(503).json({ error: '서버의 일괄 편집 설정을 확인해 주세요.' });
      const requestId = req.body?.requestId, adds = data?.adds, updates = data?.updates ?? [], deletes = data?.deletes;
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(requestId) || !Array.isArray(adds) || !Array.isArray(updates) || !Array.isArray(deletes) || !adds.length && !updates.length && !deletes.length || adds.length + updates.length + deletes.length > 200) return res.status(400).json({ error: '변경사항을 확인해 주세요. 한 번에 최대 200명까지 저장할 수 있습니다.' });
      const rows = adds.map(normalizeStudent);
      const changed = updates.map(row => { const normalized = normalizeStudent(row); return normalized ? { ...normalized, id: row.id, revision: row.revision } : null; });
      const invalidVersion = row => !studentIdOk(row?.id) || typeof row?.revision !== 'string' || !/^\d+:\d+$/.test(row.revision);
      if (rows.some(row => !row || !studentIdOk(row.key)) || changed.some(row => !row || !studentIdOk(row.key) || invalidVersion(row)) || deletes.some(invalidVersion)) return res.status(400).json({ error: '학생 정보 또는 변경 확인 정보가 올바르지 않습니다.' });
      try {
        const result = await applyRosterBatch({ db, students: STUDENTS, rosterMeta: ROSTER_META, syncRevision: SYNC_REVISION, receiptRef: ROSTER_META.collection('batch_receipts').doc(requestId), adds: rows, updates: changed, deletes: deletes.map(row => ({ id: row.id, revision: row.revision })), requestId, timestamp: FieldValue.serverTimestamp, increment: FieldValue.increment });
        return res.status(200).json(result);
      } catch (error) { if (error.status === 400 || error.status === 409) return res.status(error.status).json({ error: error.message }); throw error; }
    } else if (action === 'roster:sync') {
      try {
        if (deferredRosterSync()) {
          await SYNC_REVISION.set({ revision: FieldValue.increment(1) }, { merge: true });
          if (req.body?.queueOnly === true) return res.status(200).json({ rosterSync: { queued: true } });
          const result = await syncDeferredRoster();
          if (result.status !== 'synced') return res.status(409).json({ error: '명단 동기화가 진행 중입니다. 잠시 후 다시 확인해 주세요.' });
          return res.status(200).json({ rosterSync: { synced: true, students: result.students } });
        }
        const rosterSync = await syncSchoolGuardRoster();
        if (!rosterSync.synced) return res.status(503).json({ error: '선도부 명단 연동 설정이 완료되지 않았습니다.', detail: rosterSync.reason || null });
        return res.status(200).json({ rosterSync });
      }
      catch (error) {
        console.error('manual school guard roster sync error', error);
        await markSchoolGuardSyncFailure(error);
        return res.status(502).json({ error: '선도부 명단 최신화에 실패했습니다.' });
      }
    } else if (action === 'discipline:sync') {
      try {
        const disciplineSync = await syncDisciplineRecords();
        if (!disciplineSync.synced) return res.status(503).json({ error: '지적사항 연동 설정이 완료되지 않았습니다.', detail: disciplineSync.reason || null });
        return res.status(200).json({ disciplineSync });
      }
      catch (error) {
        console.error('manual discipline sync error', error);
        await markDisciplineSyncFailure(error);
        return res.status(502).json({ error: '지적사항 동기화에 실패했습니다.' });
      }
    } else if (action === 'roster:upload') {
      if (!Array.isArray(data) || !data.length || data.length > 2000) return res.status(400).json({ error: '업로드할 명단은 1~2000명이어야 합니다.' });
      const uploadedRows = data.filter(hasRosterUploadData);
      if (!uploadedRows.length) return res.status(400).json({ error: '업로드할 학생 정보를 찾지 못했습니다.' });
      const rows = uploadedRows.map(normalizeStudent); if (rows.some(row => !row)) return res.status(400).json({ error: '명단 열(학년, 반, 번호, 이름)을 확인해주세요.' });
      for (let offset = 0; offset < rows.length; offset += 450) {
        const batch = db.batch();
        rows.slice(offset, offset + 450).forEach(row => batch.set(STUDENTS.doc(row.key), { ...row, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
        markRosterChange(batch);
        await batch.commit();
      }
      await mergeRosterMeta(rows);
    } else if (action === 'roster:save') {
      const row = normalizeStudent(data); if (!row) return res.status(400).json({ error: '학생 정보를 확인해주세요.' });
      const ref = studentIdOk(id) ? STUDENTS.doc(id) : STUDENTS.doc(row.key);
      if (deferredRosterSync()) { const batch = db.batch(); batch.set(ref, { ...row, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); markRosterChange(batch); await batch.commit(); }
      else await ref.set({ ...row, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await mergeRosterMeta([row]);
    } else if (action === 'roster:delete' && studentIdOk(id)) {
      if (deferredRosterSync()) { const batch = db.batch(); batch.delete(STUDENTS.doc(id)); markRosterChange(batch); await batch.commit(); }
      else await STUDENTS.doc(id).delete();
    } else if (action === 'activity:save') {
      const activity = normalizeActivity(data); if (!activity) return res.status(400).json({ error: '활동 정보를 확인해주세요.' });
      if (idOk(id)) await ACTIVITIES.doc(id).set({ ...activity, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      else await ACTIVITIES.add({ ...activity, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    } else if (action === 'activity:delete' && idOk(id)) await ACTIVITIES.doc(id).delete();
    else return res.status(400).json({ error: '알 수 없는 작업입니다.' });
    let rosterSync = null;
    if (action.startsWith('roster:') && !deferredRosterSync()) {
      try { rosterSync = await syncSchoolGuardRoster({ includeSnapshot: true }); }
      catch (error) { console.error('school guard roster sync error', error); await markSchoolGuardSyncFailure(error); rosterSync = { synced: false }; }
    }
    if (req.headers?.prefer === 'return=minimal') return res.status(200).json({ ok: true, rosterSync });
    const [students, activities] = await Promise.all([rosterSync?.snapshot || STUDENTS.get(), ACTIVITIES.orderBy('startDate').get()]);
    return res.status(200).json({ students: students.docs.map(doc => ({ id: doc.id, ...doc.data() })), activities: activities.docs.map(doc => ({ id: doc.id, ...doc.data() })), rosterSync });
  } catch (error) { console.error('students API error', error); return res.status(500).json({ error: '학생관리 데이터를 처리하지 못했습니다.' }); }
}
