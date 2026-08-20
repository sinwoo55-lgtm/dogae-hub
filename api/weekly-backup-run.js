import { allowJson } from '../lib/http.js';
import { createWeeklyBackup } from '../lib/weekly-backup.js';

function isCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

// 예약 작업과 같은 CRON_SECRET을 가진 요청만 전체 백업을 수동 실행할 수 있다.
// 브라우저 주소로는 호출할 수 없도록 POST만 허용한다.
export default async function handler(req, res) {
  if (!allowJson(req, res, ['POST'])) return;
  if (!isCronRequest(req)) return res.status(401).json({ error: '예약 작업 인증이 필요합니다.' });
  try {
    return res.status(200).json({ backup: await createWeeklyBackup() });
  } catch (error) {
    console.error('manual weekly backup error', error);
    return res.status(500).json({ error: '주간 백업을 실행하지 못했습니다.' });
  }
}
