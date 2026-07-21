import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';
import { refreshCalendarYear } from './calendar-events.js';
import { syncDisciplineRecords } from './discipline-sync.js';

function koreaYear() {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric' }).format(new Date()));
}

function isCronRequest(req) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.authorization === `Bearer ${secret}`;
}

async function runWithConcurrency(items, limit, task) {
  const queue = items.slice();
  const results = [];
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { results.push({ year: item, ok: true, value: await task(item) }); }
      catch (error) { console.error('calendar refresh error', item, error); results.push({ year: item, ok: false }); }
    }
  }));
  return results;
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!isCronRequest(req) && !requireSchoolNetwork(req, res)) return;
  const center = Number(req.query?.year) || koreaYear();
  const span = req.query?.span === undefined ? 2 : Number(req.query.span);
  if (!Number.isInteger(center) || center < 2020 || center > 2100 || !Number.isInteger(span) || span < 0 || span > 10) return res.status(400).json({ error: '기준 연도 또는 저장 범위가 올바르지 않습니다.' });
  const years = Array.from({ length: (span * 2) + 1 }, (_, index) => center - span + index).filter((year) => year >= 2020 && year <= 2100);
  const results = await runWithConcurrency(years, 3, refreshCalendarYear);
  let discipline = { skipped: true, reason: 'manual refresh' };
  if (isCronRequest(req)) {
    try { discipline = await syncDisciplineRecords(); }
    catch (error) { console.error('discipline cron sync error', error); discipline = { synced: false, error: '지적사항 동기화 실패' }; }
  }
  return res.status(200).json({ center, span, refreshed: results.filter((item) => item.ok).map((item) => item.year), failed: results.filter((item) => !item.ok).map((item) => item.year), discipline });
}
