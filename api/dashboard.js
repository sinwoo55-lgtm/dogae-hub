import { FieldValue } from 'firebase-admin/firestore';
import { db, firebaseProjectId } from '../lib/firebase-admin.js';
import { allowJson, text } from '../lib/http.js';
import { requireSchoolNetwork } from '../lib/school-access.js';
import { versionedScheduleChanges } from '../lib/schedule-changes.js';
import { assertNoRestoreInProgress, previewWeeklyBackup, recentWeeklyRestoreResults, restoreWeeklyBackup } from '../lib/weekly-backup.js';

const POSTS = db.collection('dashboard_posts');
const POST_TRASH = db.collection('dashboard_post_trash');
const LINKS = db.collection('dashboard_links');
const DEPARTMENTS = db.collection('dashboard_meta').doc('departments');
const MENU_SETTINGS = db.collection('dashboard_meta').doc('menu_settings');
const SCHEDULE_VERSION = db.collection('dashboard_meta').doc('schedule_version');
const SCHEDULE_CHANGES = db.collection('schedule_changes');
const MENU_IDS = ['calendar', 'links', 'organization', 'students', 'career', 'seating'];

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

function validParticipantId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 150 && !value.includes('/');
}

function date(value) {
  return value === '' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ? value : null;
}

function postData(value) {
  const author = text(value.author, 20);
  const title = text(value.title ?? value.content, 80);
  const content = value.content === '' || value.content === undefined ? '' : text(value.content, 400);
  const link = value.link === '' ? '' : text(value.link, 1000);
  const dept = value.dept === '' ? '' : text(value.dept, 80);
  const start = date(value.start ?? '');
  const end = date(value.end ?? '');
  const isNotice = value.isNotice === true;
  const rawParticipants = value.participants === undefined ? [] : value.participants;
  if (!Array.isArray(rawParticipants) || rawParticipants.length > 500) return null;
  const participants = [...new Set(rawParticipants.filter(validParticipantId))];
  if (!author || !title || content === null || link === null || dept === null || start === null || end === null) return null;
  if (link && !/^https?:\/\//i.test(link)) return null;
  if (start && end && start > end) return null;
  return { author, title, content, link, dept, isNotice, start, end, participants, deadline: end || start || '', realtimeUntil: isNotice ? '9999-12-31' : (end || start || '') };
}

function linkData(value) {
  const title = text(value.title, 40);
  const url = text(value.url, 1000);
  const desc = value.desc === '' || value.desc === undefined ? '' : text(value.desc, 200);
  const dept = value.dept === '' || value.dept === undefined ? '' : text(value.dept, 80);
  const rawTags = value.tags === undefined ? [] : value.tags;
  if (!Array.isArray(rawTags) || rawTags.length > 10) return null;
  const tags = [...new Set(rawTags.map((tag) => text(tag, 20)))];
  if (!title || !url || desc === null || dept === null || tags.some((tag) => !tag) || !/^https?:\/\//i.test(url)) return null;
  return { title, url, desc, dept, tags };
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

function menuList(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const list = {};
  for (const id of MENU_IDS) {
    if (typeof value[id] !== 'boolean') return null;
    list[id] = value[id];
  }
  return list;
}

async function menuSnapshot(res) {
  const settings = await MENU_SETTINGS.get();
  const items = settings.exists && settings.data().items && typeof settings.data().items === 'object' ? settings.data().items : {};
  return res.status(200).json({ menu: Object.fromEntries(MENU_IDS.map((id) => [id, items[id] !== false])) });
}

async function connectionSnapshot(res) {
  const [version, roster, discipline, backups] = await Promise.all([
    SCHEDULE_VERSION.get(),
    db.collection('student_meta').doc('school_guard_sync').get(),
    db.collection('discipline_meta').doc('latest').get(),
    db.collection('weekly_backups').orderBy('startedAt', 'desc').limit(8).get(),
  ]);
  const rosterData = roster.exists ? asJson(roster.data()) : null;
  const disciplineData = discipline.exists ? asJson(discipline.data()) : null;
  return res.status(200).json({
    firebaseProjectId,
    environment: process.env.VERCEL_ENV || 'development',
    scheduleVersion: version.exists ? Number(version.data().version || 0) : 0,
    scheduleUpdatedAt: version.exists && version.data().updatedAt?.toDate ? version.data().updatedAt.toDate().toISOString() : null,
    rosterSync: rosterData ? { result: rosterData.lastResult || 'unknown', at: rosterData.syncedAt || rosterData.attemptedAt || null, count: Number(rosterData.studentCount || 0), excludedMiddleSchoolCount: Number(rosterData.excludedMiddleSchoolCount || 0), error: rosterData.lastError || null } : null,
    disciplineSync: disciplineData ? { result: disciplineData.lastResult || 'success', at: disciplineData.syncedAt || disciplineData.attemptedAt || null, count: Number(disciplineData.recordCount || 0), error: disciplineData.lastError || null } : null,
    backups: backups.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })),
  });
}

async function backupPreview(res, id) {
  const preview = await previewWeeklyBackup(id);
  const { plan, ...publicPreview } = preview;
  return res.status(200).json({ preview: asJson(publicPreview) });
}

async function restoreHistory(res) {
  return res.status(200).json({ restores: asJson(await recentWeeklyRestoreResults()) });
}

function recordScheduleChanges(tx, versionSnap, changes) {
  const result = versionedScheduleChanges(versionSnap.exists ? versionSnap.data().version : 0, changes, Date.now());
  const version = result.version;
  tx.set(SCHEDULE_VERSION, { version, updatedAt: FieldValue.serverTimestamp() });
  result.changes.forEach((change) => tx.set(SCHEDULE_CHANGES.doc(), change));
}

function changedPost(id, post) {
  return { type: 'upsert', post: { id, ...asJson(post) } };
}

async function snapshot(res) {
  const now = Date.now();
  const expired = await POST_TRASH.where('expiresAt', '<=', now).get();
  if (!expired.empty) { const batch = db.batch(); expired.docs.forEach((doc) => batch.delete(doc.ref)); await batch.commit(); }
  const [posts, trash, links, departments] = await Promise.all([
    POSTS.orderBy('ts', 'desc').get(),
    POST_TRASH.orderBy('deletedAt', 'desc').get(),
    LINKS.orderBy('ts', 'desc').get(),
    DEPARTMENTS.get(),
  ]);
  res.status(200).json({
    posts: posts.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })),
    trash: trash.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })),
    links: links.docs.map((doc) => ({ id: doc.id, ...asJson(doc.data()) })),
    departments: departments.exists ? asJson(departments.data().list || []) : null,
  });
}

export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  if (!requireSchoolNetwork(req, res)) return;

  try {
    if (req.method === 'GET') {
      if (req.query?.scope === 'menu') return menuSnapshot(res);
      if (req.query?.scope === 'connection') return connectionSnapshot(res);
      if (req.query?.scope === 'backup-preview') return backupPreview(res, req.query?.id);
      if (req.query?.scope === 'restore-history') return restoreHistory(res);
      return snapshot(res);
    }

    const { action, id, ids, data, confirmation } = req.body || {};
    if (action === 'backup:restore') {
      if (confirmation !== id) return res.status(400).json({ error: '대상 백업 ID를 다시 정확히 입력해야 합니다.' });
      return res.status(200).json({ restore: asJson(await restoreWeeklyBackup(id)) });
    }
    await assertNoRestoreInProgress();
    if (action === 'post:save') {
      const next = postData(data || {});
      if (!next) return res.status(400).json({ error: '게시물 입력값이 올바르지 않습니다.' });
      const ref = id && validId(id) ? POSTS.doc(id) : POSTS.doc();
      await db.runTransaction(async (tx) => {
        const [existing, version] = await Promise.all([id && validId(id) ? tx.get(ref) : Promise.resolve(null), tx.get(SCHEDULE_VERSION)]);
        if (existing && !existing.exists) throw new Error('일정을 찾을 수 없습니다.');
        const stored = existing ? { ...existing.data(), ...next } : { ...next, createdAt: new Date().toLocaleDateString('ko-KR'), newUntil: Date.now() + (24 * 60 * 60 * 1000), ts: new Date().toISOString() };
        tx.set(ref, { ...stored, ts: FieldValue.serverTimestamp() });
        recordScheduleChanges(tx, version, [changedPost(ref.id, stored)]);
      });
    } else if (action === 'post:delete' && validId(id)) {
      await db.runTransaction(async (tx) => {
        const source = POSTS.doc(id); const [snap, version] = await Promise.all([tx.get(source), tx.get(SCHEDULE_VERSION)]);
        if (!snap.exists) throw new Error('일정을 찾을 수 없습니다.');
        const deletedAt = Date.now();
        tx.set(POST_TRASH.doc(), { ...snap.data(), deletedAt, expiresAt: deletedAt + (14 * 24 * 60 * 60 * 1000), origId: id });
        tx.delete(source);
        recordScheduleChanges(tx, version, [{ type: 'delete', id }]);
      });
    } else if (action === 'post:trash-restore' && validId(id)) {
      await db.runTransaction(async (tx) => {
        const source = POST_TRASH.doc(id); const [snap, version] = await Promise.all([tx.get(source), tx.get(SCHEDULE_VERSION)]);
        if (!snap.exists) throw new Error('휴지통에서 일정을 찾을 수 없습니다.');
        const item = snap.data();
        if (Number(item.expiresAt || 0) <= Date.now()) { tx.delete(source); throw new Error('보관 기간이 지나 복원할 수 없습니다.'); }
        const restored = { ...item }; delete restored.deletedAt; delete restored.expiresAt; delete restored.origId;
        tx.set(POSTS.doc(item.origId), { ...restored, ts: FieldValue.serverTimestamp() }); tx.delete(source);
        recordScheduleChanges(tx, version, [changedPost(item.origId, restored)]);
      });
    } else if (action === 'post:delete-many' && Array.isArray(ids) && ids.length <= 100 && ids.every(validId)) {
      await db.runTransaction(async (tx) => {
        const version = await tx.get(SCHEDULE_VERSION);
        ids.forEach((postId) => tx.delete(POSTS.doc(postId)));
        recordScheduleChanges(tx, version, ids.map((postId) => ({ type: 'delete', id: postId })));
      });
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
    } else if (action === 'menu:save') {
      const items = menuList(data);
      if (!items) return res.status(400).json({ error: '메뉴 표시 설정이 올바르지 않습니다.' });
      await MENU_SETTINGS.set({ items, updatedAt: FieldValue.serverTimestamp() });
      return res.status(200).json({ menu: items });
    } else {
      return res.status(400).json({ error: '알 수 없는 작업입니다.' });
    }

    return snapshot(res);
  } catch (error) {
    console.error('dashboard API error', error);
    if (req.method === 'POST' && error?.code === 'restore-in-progress') return res.status(409).json({ error: error.message });
    if (req.method === 'POST' && req.body?.action === 'backup:restore') return res.status(500).json({ error: '복원 중 실패했습니다. 복원 직전 안전 백업을 확인하세요.', recoveryBackupId: error?.safetyBackupId || null });
    return res.status(500).json({ error: '대시보드 데이터를 처리하지 못했습니다.' });
  }
}
