import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';
import { refreshCalendarYear } from './calendar-events.js';

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
  if (!Number.isInteger(center) || center < 2020 || center > 2100) return res.status(400).json({ error: '기준 연도가 올바르지 않습니다.' });
  const years = Array.from({ length: 21 }, (_, index) => center - 10 + index).filter((year) => year >= 2020 && year <= 2100);
  const results = await runWithConcurrency(years, 3, refreshCalendarYear);
  return res.status(200).json({ center, refreshed: results.filter((item) => item.ok).map((item) => item.year), failed: results.filter((item) => !item.ok).map((item) => item.year) });
}
