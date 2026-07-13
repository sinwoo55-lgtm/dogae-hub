import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase-admin.js';
import { allowJson, text } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const ACTS = db.collection('career_acts');
const TRASH = db.collection('career_trash');
const idOk = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);

function normalizeAct(value) {
  const fields = ['name', 'grade', 'stream', 'sem', 'count', 'time', 'desc', 'date'];
  const limits = { name: 100, grade: 20, stream: 20, sem: 20, count: 40, time: 80, desc: 2000, date: 30 };
  if (!value || typeof value !== 'object') return null;
  const result = {};
  for (const field of fields) {
    const item = value[field] ?? '';
    if (typeof item !== 'string' || item.length > limits[field]) return null;
    result[field] = item.trim();
  }
  if (!result.name || !result.grade || !result.stream || !result.sem || !Array.isArray(value.tags) || !value.tags.length || value.tags.length > 30) return null;
  result.tags = value.tags.map((tag) => text(tag, 60));
  if (result.tags.some((tag) => !tag)) return null;
  return result;
}

async function sendSnapshot(res) {
  const [acts, trash] = await Promise.all([
    ACTS.orderBy('ts', 'desc').get(),
    TRASH.orderBy('deletedAt', 'desc').get(),
  ]);
  return res.status(200).json({
    acts: acts.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    trash: trash.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
  });
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  try {
    if (req.method === 'GET') return sendSnapshot(res);
    const { action, id, data } = req.body || {};
    if (action === 'act:save') {
      const next = normalizeAct(data);
      if (!next) return res.status(400).json({ error: '활동 입력값이 올바르지 않습니다.' });
      if (id && idOk(id)) await ACTS.doc(id).update(next);
      else await ACTS.add({ ...next, ts: FieldValue.serverTimestamp() });
    } else if (action === 'trash:move' && idOk(id)) {
      await db.runTransaction(async (tx) => {
        const source = ACTS.doc(id); const snap = await tx.get(source);
        if (!snap.exists) throw new Error('활동을 찾을 수 없습니다.');
        tx.set(TRASH.doc(), { ...snap.data(), deletedAt: Date.now(), deletedDate: new Date().toLocaleDateString('ko-KR'), origId: id });
        tx.delete(source);
      });
    } else if (action === 'trash:restore' && idOk(id)) {
      await db.runTransaction(async (tx) => {
        const source = TRASH.doc(id); const snap = await tx.get(source);
        if (!snap.exists) throw new Error('휴지통 항목을 찾을 수 없습니다.');
        const restored = { ...snap.data() }; delete restored.deletedAt; delete restored.deletedDate; delete restored.origId;
        tx.set(ACTS.doc(), { ...restored, ts: FieldValue.serverTimestamp() }); tx.delete(source);
      });
    } else if (action === 'trash:delete' && idOk(id)) {
      await TRASH.doc(id).delete();
    } else if (action === 'trash:clear') {
      const snap = await TRASH.get(); const batch = db.batch(); snap.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit();
    } else return res.status(400).json({ error: '알 수 없는 작업입니다.' });
    return sendSnapshot(res);
  } catch (error) {
    console.error('career API error', error);
    return res.status(500).json({ error: '진로 활동 데이터를 처리하지 못했습니다.' });
  }
}
