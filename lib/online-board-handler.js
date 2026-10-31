import { randomUUID } from 'node:crypto';
import { db } from './firebase-admin.js';
import { allowJson, text } from './http.js';
import { requireSchoolNetwork } from './school-access.js';
import { desktopAdminAccess } from './desktop-admin.js';
import { boardPublicationWindow, boardPublicationState, BOARD_TRASH_RETENTION_MS } from './board-lifecycle.js';
import { mayManageBoardPost } from './board-permissions.js';
import { createBoardDrive } from './board-drive.js';

const posts = db.collection('online_board_posts'), limits = posts.doc('_limits');
const MAX_POSTS = 300, DAILY_POSTS = 30, PAGE_SIZE = 30;
const MAX_FULL = 700 * 1024, MAX_THUMB = 20 * 1024;
const MAX_ORIGINAL = 20 * 1024 * 1024, IMAGE_PART = 1024 * 1024;
let driveInstance;
function drive() {
  if (!driveInstance) driveInstance = createBoardDrive({ clientId:process.env.BOARD_GOOGLE_CLIENT_ID, clientSecret:process.env.BOARD_GOOGLE_CLIENT_SECRET, refreshToken:process.env.BOARD_GOOGLE_REFRESH_TOKEN });
  return driveInstance;
}
async function boardFolderId() {
  const ref = db.collection('online_board_config').doc('drive');
  let snapshot = await ref.get();
  if (!snapshot.exists || !snapshot.data().folderId) {
    const candidate = await drive().reserveId();
    const id = await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.exists && current.data().folderId) return current.data().folderId;
      tx.set(ref, { folderId:candidate }, { merge:true });
      return candidate;
    });
    await drive().ensureFolder(id);
    return id;
  }
  const id = snapshot.data().folderId;
  await drive().ensureFolder(id);
  return id;
}
const idOk = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value);
const imageUrl = (id, kind) => `/api/online-board?id=${encodeURIComponent(id)}&image=${kind}`;
const today = now => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(now));
function image(value, limit) {
  if (typeof value !== 'string' || value.length > Math.ceil(limit * 4 / 3) + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length < 20 || bytes.length > limit || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  return bytes;
}
function effectiveState(post, now) {
  if (post.pending || post.purging) return 'purge';
  if (post.deletedAt) return now < post.purgeAt ? 'trash' : 'purge';
  return boardPublicationState(post, now);
}
function publicPost(doc) {
  const { title, author, startsAt, expiresAt, createdAt, deletedAt, purgeAt } = doc.data();
  return { id:doc.id, title, author, startsAt, expiresAt, createdAt, deletedAt:deletedAt || null, purgeAt };
}
export async function purgeBoard(now = Date.now()) {
  const snapshot = await posts.where('purgeAt', '<=', now).limit(100).get();
  let deleted = 0;
  for (const doc of snapshot.docs) {
    try {
      const claimed = await db.runTransaction(async tx => {
        const current = await tx.get(doc.ref);
        if (!current.exists || current.data().purgeAt > now) return null;
        tx.update(doc.ref, { purging:true });
        return current.data();
      });
      if (!claimed) continue;
      if (claimed.driveId) await drive().remove(claimed.driveId);
      const removed = await db.runTransaction(async tx => {
        const [current, quota] = await Promise.all([tx.get(doc.ref), tx.get(limits)]);
        if (!current.exists || current.data().purgeAt > now) return false;
        const count = Math.max(0, Number(quota.exists ? quota.data().count : 0) - 1);
        tx.delete(doc.ref.collection('images').doc('full'));
        tx.delete(doc.ref.collection('images').doc('thumb'));
        tx.delete(doc.ref);
        tx.set(limits, { count }, { merge:true });
        return true;
      });
      if (removed) deleted++;
    } catch (error) { console.error('board purge failed', doc.id, error.message); }
  }
  return { deleted };
}
export default async function handler(req, res) {
  if (!allowJson(req, res, ['GET', 'POST'])) return;
  const cron = req.method === 'GET' && req.query?.cleanup === '1' && process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`;
  if (!cron && !requireSchoolNetwork(req, res)) return;
  try {
    if (cron) return res.status(200).json(await purgeBoard());
    const now = Date.now();
    if (req.method === 'GET') {
      const docId = req.query?.id;
      if (docId) {
        if (!idOk(docId)) return res.status(400).json({ error:'게시물 정보가 올바르지 않습니다.' });
        const ref = posts.doc(docId), doc = await ref.get();
        if (!doc.exists || effectiveState(doc.data(), now) === 'purge') return res.status(404).json({ error:'게시물을 찾을 수 없습니다.' });
        const kind = req.query?.image;
        if (kind) {
          if (!['full','thumb'].includes(kind)) return res.status(400).json({ error:'이미지 종류가 올바르지 않습니다.' });
          if (kind === 'full' && doc.data().driveId && req.query?.part !== undefined) {
            const size = Number(doc.data().imageSize), part = Number(req.query?.part);
            if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ORIGINAL || !Number.isSafeInteger(part) || part < 0 || part * IMAGE_PART >= size) return res.status(400).json({ error:'이미지 요청을 확인하세요.' });
            const from = part * IMAGE_PART, to = Math.min(size - 1, from + IMAGE_PART - 1);
            const remote = await drive().read(doc.data().driveId, `bytes=${from}-${to}`);
            const bytes = Buffer.from(await remote.arrayBuffer());
            if (remote.status !== 206 || bytes.length !== to - from + 1) throw new Error('Invalid Drive range response');
            res.setHeader('Content-Type', 'application/octet-stream'); res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('X-Content-Type-Options','nosniff');
            return res.status(200).end(bytes);
          }
          const stored = await ref.collection('images').doc(kind === 'full' && doc.data().driveId ? 'thumb' : kind).get();
          if (!stored.exists || !stored.data().bytes) return res.status(404).json({ error:'이미지를 찾을 수 없습니다.' });
          res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('X-Content-Type-Options','nosniff');
          return res.status(200).end(stored.data().bytes);
        }
        if (!['published','scheduled'].includes(effectiveState(doc.data(), now))) return res.status(404).json({ error:'게시물을 찾을 수 없습니다.' });
        return res.status(200).json({ ...publicPost(doc), imageUrl:imageUrl(docId,'full'), ...(doc.data().driveId ? { imageSize:doc.data().imageSize, imageType:doc.data().imageType, imagePartSize:IMAGE_PART } : {}) });
      }
      const target = req.query?.trash === '1' ? 'trash' : req.query?.scheduled === '1' ? 'scheduled' : 'published';
      let query = posts.orderBy('createdAt', 'desc');
      if (req.query?.cursor) {
        if (!idOk(req.query.cursor)) return res.status(400).json({ error:'목록 위치가 올바르지 않습니다.' });
        const cursor = await posts.doc(req.query.cursor).get();
        if (!cursor.exists) return res.status(409).json({ error:'목록이 변경되었습니다. 다시 불러오세요.' });
        query = query.startAfter(cursor);
      }
      const snapshot = await query.limit(PAGE_SIZE).get();
      const rows = snapshot.docs.filter(doc => effectiveState(doc.data(), now) === target).map(doc => ({ ...publicPost(doc), thumbnailUrl:imageUrl(doc.id,'thumb') }));
      return res.status(200).json({ posts:rows, nextCursor:snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null });
    }
    const { action, author, id } = req.body || {};
    if (action === 'prepare-original') {
      const title = text(req.body.title,80), name = text(author,40), window = boardPublicationWindow(req.body.startDate,req.body.endDate);
      const thumb = image(req.body.thumbnail,MAX_THUMB), size = Number(req.body.imageSize), mime = req.body.imageType;
      if (!title || !name || !window || window.expiresAt <= now || !thumb || !Number.isSafeInteger(size) || size < 1 || size > MAX_ORIGINAL || !/^image\/(png|jpeg|webp)$/.test(mime)) return res.status(400).json({ error:'제목, 게시 기간과 이미지를 확인하세요.' });
      const docId = randomUUID(), fileId = await drive().reserveId(), ref = posts.doc(docId), day = today(now);
      const result = await db.runTransaction(async tx => {
        const snapshot = await tx.get(limits), quota = snapshot.exists ? snapshot.data() : {};
        const count = Number(quota.count) || 0, daily = quota.day === day ? Number(quota.daily) || 0 : 0;
        if (count >= MAX_POSTS) return 'full'; if (daily >= DAILY_POSTS) return 'daily';
        tx.create(ref,{ title,author:name,...window,createdAt:now, pending:true, purgeAt:now+3600000, driveId:fileId, imageSize:size,imageType:mime, publication:window });
        tx.create(ref.collection('images').doc('thumb'),{ bytes:thumb });
        tx.set(limits,{ count:count+1,day,daily:daily+1 },{ merge:true }); return 'ok';
      });
      if (result !== 'ok') return res.status(429).json({ error:'게시판 등록 한도에 도달했습니다.' });
      const folderId = await boardFolderId();
      const uploadUrl = await drive().beginUpload(fileId,`board-${docId}`,mime,size,folderId);
      return res.status(201).json({ id:docId,uploadUrl });
    }
    if (action === 'complete-original') {
      if (!idOk(id)) return res.status(400).json({ error:'게시물 정보를 확인하세요.' });
      const ref = posts.doc(id), doc = await ref.get();
      if (!doc.exists || !doc.data().pending || doc.data().purging || doc.data().purgeAt <= now) return res.status(404).json({ error:'업로드가 만료되었습니다.' });
      const item = await drive().metadata(doc.data().driveId);
      if (item.id !== doc.data().driveId || item.name !== `board-${id}` || item.mimeType !== doc.data().imageType || Number(item.size) !== doc.data().imageSize || item.trashed) return res.status(400).json({ error:'업로드된 이미지를 확인할 수 없습니다.' });
      const saved = await db.runTransaction(async tx => {
        const current = await tx.get(ref); if (!current.exists || !current.data().pending || current.data().purging || current.data().purgeAt <= Date.now()) return false;
        tx.update(ref,{ ...current.data().publication,pending:false,publication:null }); return true;
      });
      if (!saved) return res.status(409).json({ error:'업로드가 만료되었습니다.' });
      return res.status(201).json({ id });
    }
    if (action === 'create') {
      const title = text(req.body.title,80), name = text(author,40), window = boardPublicationWindow(req.body.startDate,req.body.endDate);
      const full = image(req.body.image,MAX_FULL), thumb = image(req.body.thumbnail,MAX_THUMB);
      if (!title || !name || !window || window.expiresAt <= now || !full || !thumb) return res.status(400).json({ error:'제목, 게시 기간과 이미지를 확인하세요.' });
      const docId = randomUUID(), ref = posts.doc(docId), day = today(now);
      const result = await db.runTransaction(async tx => {
        const snapshot = await tx.get(limits), quota = snapshot.exists ? snapshot.data() : {};
        const count = Number(quota.count) || 0, daily = quota.day === day ? Number(quota.daily) || 0 : 0;
        if (count >= MAX_POSTS) return 'full'; if (daily >= DAILY_POSTS) return 'daily';
        tx.create(ref,{ title,author:name,...window,createdAt:now });
        tx.create(ref.collection('images').doc('full'),{ bytes:full });
        tx.create(ref.collection('images').doc('thumb'),{ bytes:thumb });
        tx.set(limits,{ count:count+1, day, daily:daily+1 },{ merge:true }); return 'ok';
      });
      if (result !== 'ok') return res.status(429).json({ error:result === 'full' ? '게시판 보관 한도에 도달했습니다. 만료된 게시물이 정리된 뒤 다시 시도하세요.' : '오늘의 게시물 등록 한도에 도달했습니다. 내일 다시 시도하세요.' });
      return res.status(201).json({ id:docId });
    }
    if (action === 'delete' || action === 'restore') {
      const name = text(author,40); if (!idOk(id) || !name) return res.status(400).json({ error:'게시물 정보를 확인하세요.' });
      const administrator = await desktopAdminAccess(req.headers), ref = posts.doc(id);
      const changed = await db.runTransaction(async tx => {
        const doc = await tx.get(ref); if (!doc.exists) return 'missing';
        if (!mayManageBoardPost(doc.data().author,name,administrator)) return 'forbidden';
        const state = effectiveState(doc.data(),now);
        if (action === 'restore') {
          const window = boardPublicationWindow(req.body.startDate,req.body.endDate);
          if (state !== 'trash') return 'missing'; if (!window || window.expiresAt <= now) return 'invalid';
          tx.update(ref,{ ...window,deletedAt:null }); return 'ok';
        }
        if (state !== 'published' && state !== 'scheduled') return 'missing';
        tx.update(ref,{ deletedAt:now,purgeAt:now+BOARD_TRASH_RETENTION_MS }); return 'ok';
      });
      if (changed !== 'ok') return res.status(changed === 'forbidden' ? 403 : changed === 'invalid' ? 400 : 404).json({ error:changed === 'forbidden' ? '작성자 또는 관리자만 관리할 수 있습니다.' : changed === 'invalid' ? '게시 기간을 확인하세요.' : '게시물을 찾을 수 없습니다.' });
      return res.status(200).json({ ok:true });
    }
    return res.status(400).json({ error:'지원하지 않는 요청입니다.' });
  } catch (error) { console.error('online board error',error.message); return res.status(503).json({ error:'게시판에 연결하지 못했습니다. 잠시 후 다시 시도하세요.' }); }
}
