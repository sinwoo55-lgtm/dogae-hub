import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase-admin.js';
import { allowJson, text } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

function classId(value) {
  return typeof value === 'string' && /^[가-힣A-Za-z0-9 _-]{1,40}$/.test(value) ? value.trim() : null;
}

function serialize(value) {
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return { _timestamp: value.toDate().toISOString() };
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function cleanObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const json = JSON.stringify(value);
  if (json.length > 800000 || /"__(proto|constructor|prototype)__"\s*:/.test(json)) return null;
  return value;
}

function refFor(id) {
  return db.collection('seating_classes').doc(id);
}

async function classSnapshot(res, id) {
  const snap = await refFor(id).get();
  return res.status(200).json({ exists: snap.exists, data: snap.exists ? serialize(snap.data()) : null });
}

async function historySnapshot(res, id, limit) {
  const snap = await refFor(id).collection('history').orderBy('savedAt', 'desc').limit(limit).get();
  return res.status(200).json({
    items: snap.docs.map((doc) => ({ id: doc.id, data: serialize(doc.data()) })),
  });
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  if (!requireSchoolNetwork(req, res)) return;

  try {
    if (req.method === 'GET') {
      const id = classId(req.query.classId);
      if (!id) return res.status(400).json({ error: '학급 정보가 올바르지 않습니다.' });
      if (req.query.history === '1') return historySnapshot(res, id, Math.min(Math.max(Number(req.query.limit) || 20, 1), 30));
      return classSnapshot(res, id);
    }

    const { action, classId: rawClassId, data, id } = req.body || {};
    const classKey = classId(rawClassId);
    if (!classKey) return res.status(400).json({ error: '학급 정보가 올바르지 않습니다.' });
    const ref = refFor(classKey);

    if (action === 'class:set') {
      const next = cleanObject(data);
      if (!next) return res.status(400).json({ error: '저장할 자리 배치 데이터가 올바르지 않습니다.' });
      await ref.set(next, { merge: true });
      return classSnapshot(res, classKey);
    }
    if (action === 'history:add') {
      const next = cleanObject(data);
      const label = text(next?.label, 100);
      if (!next || !label || !Array.isArray(next.layout)) return res.status(400).json({ error: '저장 기록이 올바르지 않습니다.' });
      await ref.collection('history').add({ ...next, label, savedAt: FieldValue.serverTimestamp() });
      return historySnapshot(res, classKey, 30);
    }
    if (action === 'history:delete' && typeof id === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(id)) {
      await ref.collection('history').doc(id).delete();
      return historySnapshot(res, classKey, 30);
    }
    return res.status(400).json({ error: '알 수 없는 작업입니다.' });
  } catch (error) {
    console.error('seating API error', error);
    return res.status(500).json({ error: '자리 배치 데이터를 처리하지 못했습니다.' });
  }
}
