import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { app, db, firebaseProjectId } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const SESSION_MS = 8 * 60 * 60 * 1000;
const REALTIME_META = db.collection('dashboard_meta').doc('realtime_schema');

async function ensureRealtimeFields() {
  const schema = await REALTIME_META.get();
  if (schema.exists && schema.data().version === 1) return;

  // 기존 일정은 한 번만 보완한다. 이후에는 저장 시 realtimeUntil이 함께 기록된다.
  const posts = await db.collection('dashboard_posts').get();
  for (let offset = 0; offset < posts.docs.length; offset += 450) {
    const batch = db.batch();
    posts.docs.slice(offset, offset + 450).forEach((doc) => {
      const post = doc.data();
      const isNotice = post.isNotice === true || (!(post.start || post.deadline) && !(post.end || post.deadline));
      const realtimeUntil = isNotice ? '9999-12-31' : (post.end || post.deadline || post.start || '');
      batch.set(doc.ref, { isNotice, realtimeUntil }, { merge: true });
    });
    await batch.commit();
  }
  await REALTIME_META.set({ version: 1, updatedAt: FieldValue.serverTimestamp() });
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;

  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: '실시간 일정 인증이 아직 설정되지 않았습니다.' });
  }

  try {
    await ensureRealtimeFields();
    const accessUntil = Date.now() + SESSION_MS;
    const token = await getAuth(app).createCustomToken('school-network-schedule-reader', {
      scheduleReader: true,
      scheduleAccessUntil: accessUntil,
    });
    return res.status(200).json({
      token,
      refreshAfter: Math.floor(SESSION_MS * 0.66),
      firebase: {
        apiKey,
        authDomain: `${firebaseProjectId}.firebaseapp.com`,
        projectId: firebaseProjectId,
      },
    });
  } catch (error) {
    console.error('realtime token error', error);
    return res.status(500).json({ error: '실시간 일정 인증을 준비하지 못했습니다.' });
  }
}
