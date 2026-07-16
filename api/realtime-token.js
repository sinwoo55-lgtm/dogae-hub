import { getAuth } from 'firebase-admin/auth';
import { app, firebaseProjectId } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const SESSION_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;

  const apiKey = process.env.FIREBASE_WEB_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: '실시간 일정 인증이 아직 설정되지 않았습니다.' });
  }

  try {
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
