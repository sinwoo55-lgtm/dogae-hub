import { db } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const validClass = (value) => typeof value === 'string' && /^\d{1,10}-\d{1,10}$/.test(value);

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  const classKey = req.query?.classKey;
  if (!validClass(classKey)) return res.status(400).json({ error: '학급 정보가 올바르지 않습니다.' });
  try {
    const [records, summaries, meta] = await Promise.all([
      db.collection('discipline_records').where('classKey', '==', classKey).get(),
      db.collection('discipline_summaries').where('classKey', '==', classKey).get(),
      db.collection('discipline_meta').doc('latest').get()
    ]);
    return res.status(200).json({
      records: records.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      summaries: summaries.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      syncedAt: meta.exists ? meta.data().syncedAt?.toDate?.().toISOString() || null : null
    });
  } catch (error) { console.error('discipline records error', error); return res.status(500).json({ error: '지적사항을 불러오지 못했습니다.' }); }
}
