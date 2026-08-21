import { FieldValue } from 'firebase-admin/firestore';
import { db, firebaseProjectId } from './firebase-admin.js';
import { backupItemId, koreaDateKey } from './backup-utils.js';

const BACKUPS = db.collection('weekly_backups');
const RETAIN_COUNT = 8;
const EXCLUDED_ROOT_COLLECTIONS = new Set(['weekly_backups']);

async function collectDocuments(collection, records) {
  const snapshot = await collection.get();
  for (const document of snapshot.docs) {
    records.push({ path: document.ref.path, data: document.data() });
    const children = await document.ref.listCollections();
    for (const child of children) await collectDocuments(child, records);
  }
}

async function removeExpiredBackups() {
  const snapshots = await BACKUPS.orderBy('startedAt', 'desc').get();
  const expired = snapshots.docs.slice(RETAIN_COUNT);
  for (const backup of expired) {
    const items = await backup.ref.collection('items').get();
    for (let offset = 0; offset < items.docs.length; offset += 450) {
      const batch = db.batch();
      items.docs.slice(offset, offset + 450).forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
    await backup.ref.delete();
  }
}

// 전체 복제는 주 1회 예약 작업에서만 수행한다. 백업 컬렉션은 재귀 복제에서 제외한다.
export async function createWeeklyBackup() {
  const backupId = koreaDateKey();
  const backup = BACKUPS.doc(backupId);
  const existing = await backup.get();
  // Vercel이 같은 예약 요청을 재시도해도 이미 완성된 주간 백업을 다시 쓰지 않는다.
  if (existing.exists && existing.data().status === 'completed') {
    return { backupId, documentCount: Number(existing.data().documentCount || 0), firebaseProjectId, reused: true };
  }
  const collections = await db.listCollections();
  const records = [];

  await backup.set({
    status: 'running',
    firebaseProjectId,
    startedAt: FieldValue.serverTimestamp(),
    completedAt: null,
    documentCount: 0,
    error: null,
  }, { merge: true });

  try {
    for (const collection of collections) {
      if (!EXCLUDED_ROOT_COLLECTIONS.has(collection.id)) await collectDocuments(collection, records);
    }

    for (let offset = 0; offset < records.length; offset += 450) {
      const batch = db.batch();
      records.slice(offset, offset + 450).forEach((record) => {
        batch.set(backup.collection('items').doc(backupItemId(record.path)), {
          sourcePath: record.path,
          data: record.data,
        });
      });
      await batch.commit();
    }

    await backup.set({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      documentCount: records.length,
      error: null,
    }, { merge: true });
    await removeExpiredBackups();
    return { backupId, documentCount: records.length, firebaseProjectId };
  } catch (error) {
    console.error('weekly backup error', error);
    await backup.set({
      status: 'failed',
      completedAt: FieldValue.serverTimestamp(),
      documentCount: records.length,
      error: error instanceof Error ? error.message.slice(0, 500) : '알 수 없는 오류',
    }, { merge: true });
    throw error;
  }
}

export async function latestWeeklyBackup() {
  const snapshot = await BACKUPS.orderBy('startedAt', 'desc').limit(1).get();
  if (snapshot.empty) return null;
  const document = snapshot.docs[0];
  return { id: document.id, ...document.data() };
}
