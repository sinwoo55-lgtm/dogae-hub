import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../lib/firebase-admin.js';
import { allowJson, text } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';

const POSTS = db.collection('dashboard_posts');
const LINKS = db.collection('dashboard_links');
const DEPARTMENTS = db.collection('dashboard_meta').doc('departments');

function asJson(value) {
  if (Array.isArray(value)) return value.map(asJson);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function') return value.toDate().toISOString();
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, asJson(item)]));
  }
  return value;
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(value);
}

function date(value) {
  return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : null;
}

function postData(value) {
  const author = text(value.author, 20);
  const content = text(value.content, 400);
  const link = value.link === '' ? '' : text(value.link, 1000);
  const dept = value.dept === '' ? '' : text(value.dept, 80);
  const start = date(value.start ?? '');
  const end = date(value.end ?? '');
  if (!author || !content || link === null || dept === null || start === null || end === null) return null;
  if (link && !/^https?:\/\//i.test(link)) return null;
  if (start && end && start > end) return null;
  return { author, content, link, dept, start, end, deadline: end || start || '' };
}

function linkData(value) {
  const title = text(value.title, 40);
  const url = text(value.url, 1000);
  const desc = value.desc === '' ? '' : text(value.desc, 200);
  const dept = value.dept === '' ? '' : text(value.dept, 80);
  if (!title || !url || desc === null || dept === null || !/^https?:\/\//i.test(url)) return null;
  return { title, url, desc, dept };
}

function departmentList(value) {
  if (!Array.isArray(value) || value.length > 30) return null;
  const list = value.map((item) => ({
    id: text(item?.id, 40),
    name: text(item?.name, 30),
    color: text(item?.color, 20),
  }));
  if (list.some((item) => !item.id || !item.name || !/^#[0-9A-Fa-f]{6}$/.test(item.color))) return null;
  return list;
}

async function snapshot(res) {
  const [posts, links, departments] = await Promise.all([
    POSTS.orderBy('ts', 'desc').get(),
    LINKS.orderBy('ts', 'desc').get(),
    DEPARTMENTS.get(),
  ]);
  res.status(200).json({
    posts: posts.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })),
    links: links.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })),
    departments: departments.exists ? asJson(departments.data().list || []) : null,
  });
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  if (!requireSchoolNetwork(req, res)) return;

  try {
    if (req.method === 'GET') return snapshot(res);

    const { action, id, ids, data } = req.body || {};
    if (action === 'post:save') {
      const next = postData(data || {});
      if (!next) return res.status(400).json({ error: '게시물 입력값이 올바르지 않습니다.' });
      if (id && validId(id)) await POSTS.doc(id).update(next);
      else await POSTS.add({ ...next, createdAt: new Date().toLocaleDateString('ko-KR'), ts: FieldValue.serverTimestamp() });
    } else if (action === 'post:delete' && validId(id)) {
      await POSTS.doc(id).delete();
    } else if (action === 'post:delete-many' && Array.isArray(ids) && ids.length <= 100 && ids.every(validId)) {
      const batch = db.batch();
      ids.forEach((postId) => batch.delete(POSTS.doc(postId)));
      await batch.commit();
    } else if (action === 'link:save') {
      const next = linkData(data || {});
      if (!next) return res.status(400).json({ error: '링크 입력값이 올바르지 않습니다.' });
      if (id && validId(id)) await LINKS.doc(id).update(next);
      else await LINKS.add({ ...next, createdAt: new Date().toLocaleDateString('ko-KR'), createdTs: Date.now(), ts: FieldValue.serverTimestamp() });
    } else if (action === 'link:delete' && validId(id)) {
      await LINKS.doc(id).delete();
    } else if (action === 'departments:save') {
      const list = departmentList(data);
      if (!list) return res.status(400).json({ error: '부서 목록 입력값이 올바르지 않습니다.' });
      await DEPARTMENTS.set({ list });
    } else {
      return res.status(400).json({ error: '알 수 없는 작업입니다.' });
    }

    return snapshot(res);
  } catch (error) {
    console.error('dashboard API error', error);
    return res.status(500).json({ error: '대시보드 데이터를 처리하지 못했습니다.' });
  }
}
