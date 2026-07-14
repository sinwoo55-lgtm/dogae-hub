import { db } from '../lib/firebase-admin.js';
import { allowJson } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const CACHE = db.collection('calendar_cache');

function dayKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 8 ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}` : '';
}

function addEvent(target, date, type, label) {
  const key = dayKey(date);
  const name = String(label || '').trim();
  if (!key || !name || (type === 'academic' && name.includes('토요휴업일'))) return;
  const list = target[key] || (target[key] = []);
  if (!list.some((item) => item.type === type && item.label === name)) list.push({ type, label: name });
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`외부 일정 API 응답 오류 (${response.status})`);
  return response.json();
}

async function schoolSchedules(year, events) {
  const key = process.env.NEIS_API_KEY;
  const office = process.env.NEIS_OFFICE_CODE;
  const schools = String(process.env.NEIS_SCHOOL_CODE || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!key || !office || !schools.length) return false;
  await Promise.all(schools.map(async (school) => {
    const query = new URLSearchParams({ KEY: key, Type: 'json', pIndex: '1', pSize: '1000', ATPT_OFCDC_SC_CODE: office, SD_SCHUL_CODE: school, AA_FROM_YMD: `${year}0101`, AA_TO_YMD: `${year}1231` });
    const data = await getJson(`https://open.neis.go.kr/hub/SchoolSchedule?${query}`);
    (data?.SchoolSchedule?.[1]?.row || []).forEach((row) => addEvent(events, row.AA_YMD, 'academic', row.EVENT_NM));
  }));
  return true;
}

async function holidays(year, events) {
  const key = process.env.HOLIDAY_API_KEY;
  if (!key) return false;
  await Promise.all(Array.from({ length: 12 }, async (_, index) => {
    const query = new URLSearchParams({ serviceKey: decodeURIComponent(key), solYear: String(year), solMonth: String(index + 1).padStart(2, '0'), _type: 'json', numOfRows: '100' });
    const data = await getJson(`https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?${query}`);
    const items = data?.response?.body?.items?.item || [];
    (Array.isArray(items) ? items : [items]).forEach((item) => addEvent(events, item.locdate, 'holiday', item.dateName));
  }));
  return true;
}

export async function refreshCalendarYear(year) {
  const events = {};
  const warnings = [];
  let academicConfigured = false;
  let holidayConfigured = false;
  try { academicConfigured = await schoolSchedules(year, events); } catch (error) { warnings.push('학사일정을 불러오지 못했습니다.'); console.warn(error); }
  try { holidayConfigured = await holidays(year, events); } catch (error) { warnings.push('공휴일을 불러오지 못했습니다.'); console.warn(error); }
  const value = { events, configured: { academic: academicConfigured, holiday: holidayConfigured }, warnings, refreshedAt: new Date().toISOString() };
  await CACHE.doc(String(year)).set(value);
  return value;
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET'])) return;
  if (!requireSchoolNetwork(req, res)) return;
  const year = Number(req.query?.year), month = Number(req.query?.month);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return res.status(400).json({ error: '연도 또는 월이 올바르지 않습니다.' });
  try {
    const snapshot = await CACHE.doc(String(year)).get();
    const cached = snapshot.exists ? snapshot.data() : { events: {}, configured: { academic: false, holiday: false }, warnings: ['일정 캐시를 준비 중입니다.'] };
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    const events = Object.fromEntries(Object.entries(cached.events || {}).filter(([date]) => date.startsWith(prefix)));
    return res.status(200).json({ events, configured: cached.configured, warnings: cached.warnings || [], refreshedAt: cached.refreshedAt || null, cached: snapshot.exists });
  } catch (error) {
    console.error('calendar cache read error', error);
    return res.status(500).json({ error: '저장된 일정 정보를 불러오지 못했습니다.' });
  }
}
