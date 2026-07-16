import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase-admin.js';
import { allowJson, text } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const STUDENTS = db.collection('student_roster');
const ACTIVITIES = db.collection('student_activities');
const ROSTER_META = db.collection('student_meta').doc('roster');
const idOk = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);
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
  return res.status(200).json({ students: students.docs.map(doc => ({ id: doc.id, ...doc.data() })), activities: activities.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
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
      if (req.query?.meta === '1') return res.status(200).json({ classes: await rosterMeta() });
      const selectedClass = typeof req.query?.classKey === 'string' ? req.query.classKey : '';
      if (selectedClass) {
        if (!/^\d{1,10}-\d{1,10}$/.test(selectedClass)) return res.status(400).json({ error: '학급 정보가 올바르지 않습니다.' });
        const students = await STUDENTS.where('classKey', '==', selectedClass).get();
        return res.status(200).json({ students: students.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
      }
      return snapshot(res);
    }
    const { action, id, data } = req.body || {};
    if (action === 'roster:upload') {
      if (!Array.isArray(data) || !data.length || data.length > 2000) return res.status(400).json({ error: '업로드할 명단은 1~2000명이어야 합니다.' });
      const rows = data.map(normalizeStudent); if (rows.some(row => !row)) return res.status(400).json({ error: '명단 열(학년, 반, 번호, 이름)을 확인해주세요.' });
      for (let offset = 0; offset < rows.length; offset += 450) {
        const batch = db.batch();
        rows.slice(offset, offset + 450).forEach(row => batch.set(STUDENTS.doc(row.key), { ...row, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
        await batch.commit();
      }
      await mergeRosterMeta(rows);
    } else if (action === 'roster:save') {
      const row = normalizeStudent(data); if (!row) return res.status(400).json({ error: '학생 정보를 확인해주세요.' });
      const ref = idOk(id) ? STUDENTS.doc(id) : STUDENTS.doc(row.key); await ref.set({ ...row, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await mergeRosterMeta([row]);
    } else if (action === 'activity:save') {
      const activity = normalizeActivity(data); if (!activity) return res.status(400).json({ error: '활동 정보를 확인해주세요.' });
      if (idOk(id)) await ACTIVITIES.doc(id).set({ ...activity, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      else await ACTIVITIES.add({ ...activity, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    } else if (action === 'activity:delete' && idOk(id)) await ACTIVITIES.doc(id).delete();
    else return res.status(400).json({ error: '알 수 없는 작업입니다.' });
    return snapshot(res);
  } catch (error) { console.error('students API error', error); return res.status(500).json({ error: '학생관리 데이터를 처리하지 못했습니다.' }); }
}
