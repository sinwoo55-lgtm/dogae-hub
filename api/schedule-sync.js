import { db } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const POSTS = db.collection('dashboard_posts');
const VERSION = db.collection('dashboard_meta').doc('schedule_version');
const CHANGES = db.collection('schedule_changes');
const MAX_DELTAS = 200;

function asJson(value) {
  if (Array.isArray(value)) return value.map(asJson);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asJson(item)]));
  }
  return value;
}

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function fullSnapshot(version) {
  const posts = await POSTS.where('realtimeUntil', '>=', todayKey()).get();
  return { version, mode: 'full', posts: posts.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })) };
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;

  try {
    const versionSnap = await VERSION.get();
    const current = Number(versionSnap.exists ? versionSnap.data().version : 0);
    const since = Number(req.query?.version);
    if (Number.isInteger(since) && since === current) return res.status(200).json({ version: current, mode: 'unchanged' });

    if (!Number.isInteger(since) || since < 0 || since > current || current - since > MAX_DELTAS) {
      return res.status(200).json(await fullSnapshot(current));
    }

    const changes = await CHANGES.where('version', '>', since).orderBy('version').limit(MAX_DELTAS + 1).get();
    const rows = changes.docs.map((doc) => asJson(doc.data()));
    const complete = rows.length === current - since && rows.every((row, index) => row.version === since + index + 1);
    if (!complete) return res.status(200).json(await fullSnapshot(current));
    return res.status(200).json({ version: current, mode: 'delta', changes: rows });
  } catch (error) {
    console.error('schedule sync error', error);
    return res.status(500).json({ error: '일정 동기화 정보를 불러오지 못했습니다.' });
  }
}
