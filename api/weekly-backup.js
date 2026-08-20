import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';
import { latestWeeklyBackup } from '../lib/weekly-backup.js';

// 백업 실행은 예약 작업만 할 수 있다. 이 API는 관리자 화면에서 상태를 읽는 용도다.
export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  try {
    return res.status(200).json({ backup: await latestWeeklyBackup() });
  } catch (error) {
    console.error('weekly backup status error', error);
    return res.status(500).json({ error: '백업 상태를 불러오지 못했습니다.' });
  }
}
