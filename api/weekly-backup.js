import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';
import { createWeeklyBackup, latestWeeklyBackup } from '../lib/weekly-backup.js';

function isCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

// GET은 교내망 상태 확인, POST는 기존 CRON_SECRET으로 인증한 사전 점검만 허용한다.
export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  if (req.method === 'GET' && !requireSchoolNetwork(req, res)) return;
  if (req.method === 'POST' && !isCronRequest(req)) return res.status(401).json({ error: '예약 작업 인증이 필요합니다.' });
  try {
    if (req.method === 'POST') return res.status(200).json({ backup: await createWeeklyBackup() });
    return res.status(200).json({ backup: await latestWeeklyBackup() });
  } catch (error) {
    console.error('weekly backup API error', error);
    return res.status(500).json({ error: req.method === 'POST' ? '주간 백업을 실행하지 못했습니다.' : '백업 상태를 불러오지 못했습니다.' });
  }
}
