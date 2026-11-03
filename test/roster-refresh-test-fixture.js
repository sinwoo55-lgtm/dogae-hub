import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function firebase() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Firebase 설정이 없습니다.');
  return getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
}
export default async function handler(req, res) {
  const origin = req.headers.origin, allowed = process.env.SCHOOL_GUARD_WEB_ORIGIN;
  if (!allowed || origin !== allowed) return res.status(403).json({ error: '허용되지 않은 접근입니다.' });
  res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    if (!match) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const app = firebase(), identity = await getAuth(app).verifyIdToken(match[1], true);
    const account = await getFirestore(app).collection('users').doc(identity.uid).get();
    const user = account.exists ? account.data() : null;
    if (!user || user.status !== 'active' || !['teacher', 'admin'].includes(user.role)) return res.status(403).json({ error: '권한이 없습니다.' });
    const target = new URL(process.env.SCHOOL_HUB_ROSTER_BRIDGE_URL || '');
    const secret = process.env.SCHOOL_GUARD_ROSTER_SECRET;
    if (target.protocol !== 'https:' || target.pathname !== '/api/roster-bridge' || !secret || secret.length < 32) throw new Error('연동 설정이 올바르지 않습니다.');
    const response = await fetch(target, { method: 'POST', headers: { 'x-roster-bridge': secret }, signal: AbortSignal.timeout(90000) });
    const payload = await response.json();
    if (!response.ok) throw new Error('정보 허브 동기화가 실패했습니다.');
    return res.status(200).json(payload);
  } catch (error) { console.error('roster refresh failed', error); return res.status(502).json({ error: '학생 명단을 갱신하지 못했습니다.' }); }
}
