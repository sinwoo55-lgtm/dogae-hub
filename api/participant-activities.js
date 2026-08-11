import { db } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

function asJson(value) {
  if (Array.isArray(value)) return value.map(asJson);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asJson(item)]));
  }
  return value;
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  try {
    const posts = await db.collection('dashboard_posts').orderBy('ts', 'desc').get();
    const activities = posts.docs
      .map((doc) => ({ id: doc.id, ...asJson(doc.data()) }))
      .filter((post) => Array.isArray(post.participants) && post.participants.length && (post.start || post.deadline) && (post.end || post.deadline || post.start));
    return res.status(200).json({ activities });
  } catch (error) {
    console.error('participant activities API error', error);
    return res.status(500).json({ error: '참여 학생 일정을 불러오지 못했습니다.' });
  }
}
