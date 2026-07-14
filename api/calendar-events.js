import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const cache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;

function monthRange(year, month) {
  const start = `${year}${String(month).padStart(2, '0')}01`;
  const end = `${year}${String(month).padStart(2, '0')}${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
  return { start, end };
}

function dayKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
}

function addEvent(target, date, type, label) {
  const key = dayKey(date);
  const name = String(label || '').trim();
  if (!key || !name) return;
  const list = target[key] || (target[key] = []);
  if (!list.some((item) => item.type === type && item.label === name)) list.push({ type, label: name });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`외부 일정 API 응답 오류 (${response.status})`);
  return response.json();
}

async function schoolSchedules(year, month, events) {
  const key = process.env.NEIS_API_KEY;
  const office = process.env.NEIS_OFFICE_CODE;
  const schools = String(process.env.NEIS_SCHOOL_CODE || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!key || !office || !schools.length) return false;
  const range = monthRange(year, month);
  for (const school of schools) {
    const query = new URLSearchParams({ KEY: key, Type: 'json', pIndex: '1', pSize: '1000', ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: school, AA_FROM_YMD: range.start, AA_TO_YMD: range.end });
    const data = await getJson(`https://open.neis.go.kr/hub/SchoolSchedule?${query}`);
    const rows = data?.SchoolSchedule?.[1]?.row || [];
    rows.forEach((row) => addEvent(events, row.AA_YMD, 'academic', row.EVENT_NM));
  }
  return true;
}

async function holidays(year, month, events) {
  const key = process.env.HOLIDAY_API_KEY;
  if (!key) return false;
  const query = new URLSearchParams({ serviceKey: decodeURIComponent(key), solYear: String(year), solMonth: String(month).padStart(2, '0'), _type: 'json', numOfRows: '100' });
  const data = await getJson(`https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?${query}`);
  const items = data?.response?.body?.items?.item || [];
  (Array.isArray(items) ? items : [items]).forEach((item) => addEvent(events, item.locdate, 'holiday', item.dateName));
  return true;
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  const year = Number(req.query?.year), month = Number(req.query?.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ error: '연도 또는 월이 올바르지 않습니다.' });
  const cacheKey = `${year}-${month}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < CACHE_MS) return res.status(200).json(cached.value);
  const events = {};
  const warnings = [];
  let academicConfigured = false;
  let holidayConfigured = false;
  try { academicConfigured = await schoolSchedules(year, month, events); } catch (error) { warnings.push('학사일정을 불러오지 못했습니다.'); console.warn(error); }
  try { holidayConfigured = await holidays(year, month, events); } catch (error) { warnings.push('공휴일을 불러오지 못했습니다.'); console.warn(error); }
  const value = { events, configured: { academic: academicConfigured, holiday: holidayConfigured }, warnings };
  cache.set(cacheKey, { savedAt: Date.now(), value });
  return res.status(200).json(value);
}
