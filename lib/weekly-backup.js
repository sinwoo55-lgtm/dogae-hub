import { FieldValue } from 'firebase-admin/firestore';
import { db, firebaseProjectId } from './firebase-admin.js';
import { backupItemId, backupStateDifferences, isRestorableBackupId, koreaDateKey, recentRestoreResults, restorePlan } from './backup-utils.js';

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

async function collectCurrentDocuments() {
  const records = [];
  const collections = await db.listCollections();
  for (const collection of collections) {
    if (!EXCLUDED_ROOT_COLLECTIONS.has(collection.id)) await collectDocuments(collection, records);
  }
  return records;
}

function backupRecords(items) {
  const records = items.docs.map((item) => ({ path: item.data().sourcePath, data: item.data().data }));
  if (records.some((record) => !isSourcePath(record.path)) || new Set(records.map((record) => record.path)).size !== records.length) throw new Error('백업 데이터 경로가 올바르지 않습니다.');
  return records;
}

function verificationSummary(differences) {
  return { verified: differences.matches, extraCount: differences.extraPaths.length, missingCount: differences.missingPaths.length, changedCount: differences.changedPaths.length };
}

async function removeExpiredBackups(protectedBackupIds = new Set()) {
  const snapshots = await BACKUPS.orderBy('startedAt', 'desc').get();
  const retained = snapshots.docs.filter((backup) => protectedBackupIds.has(backup.id));
  for (const backup of snapshots.docs) {
    if (retained.length >= RETAIN_COUNT) break;
    if (!retained.includes(backup)) retained.push(backup);
  }
  const expired = snapshots.docs.filter((backup) => !retained.includes(backup));
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
export async function createWeeklyBackup(options = {}) {
  const backupId = options.backupId || koreaDateKey();
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
    await removeExpiredBackups(new Set(options.protectedBackupIds || []));
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

export async function recentWeeklyRestoreResults(limit = 12) {
  const backups = await BACKUPS.orderBy('startedAt', 'desc').limit(RETAIN_COUNT).get();
  const results = await Promise.all(backups.docs.map(async (backup) => {
    const snapshot = await backup.ref.collection('restore_results').orderBy('startedAt', 'desc').limit(limit).get();
    return snapshot.docs.map((result) => ({ id: result.id, backupId: backup.id, ...result.data() }));
  }));
  return recentRestoreResults(results.flat(), limit);
}

export async function previewWeeklyBackup(backupId) {
  if (!isRestorableBackupId(backupId)) throw new Error('백업 ID가 올바르지 않습니다.');
  const backup = BACKUPS.doc(backupId);
  const [meta, items] = await Promise.all([backup.get(), backup.collection('items').get()]);
  if (!meta.exists || meta.data().status !== 'completed') throw new Error('완료된 백업을 찾을 수 없습니다.');
  const savedRecords = backupRecords(items);
  const backupPaths = savedRecords.map((record) => record.path);
  const currentRecords = await collectCurrentDocuments();
  const plan = restorePlan(currentRecords.map((record) => record.path), backupPaths);
  return { backupId, documentCount: items.size, currentDocumentCount: currentRecords.length, restoreCount: plan.restorePaths.length, deleteCount: plan.deletePaths.length, samplePaths: backupPaths.slice(0, 20), plan };
}

export async function restoreWeeklyBackup(backupId) {
  const preview = await previewWeeklyBackup(backupId);
  const backup = BACKUPS.doc(backupId);
  const result = backup.collection('restore_results').doc(`restore-${Date.now()}`);
  let safetyBackupId = null;
  await result.set({ status: 'running', sourceBackupId: backupId, safetyBackupId: null, documentCount: preview.documentCount, restoreCount: preview.restoreCount, deleteCount: preview.deleteCount, startedAt: FieldValue.serverTimestamp(), completedAt: null, error: null });
  try {
    const items = await backup.collection('items').get();
    const savedRecords = backupRecords(items);
    const safetyBackup = await createWeeklyBackup({ backupId: `pre-restore-${Date.now()}`, protectedBackupIds: [backupId] });
    safetyBackupId = safetyBackup.backupId;
    await result.set({ safetyBackupId }, { merge: true });
    const valuesByPath = new Map(savedRecords.map((record) => [record.path, record.data]));
    for (let offset = 0; offset < preview.plan.deletePaths.length; offset += 450) {
      const batch = db.batch();
      preview.plan.deletePaths.slice(offset, offset + 450).forEach((path) => batch.delete(db.doc(path)));
      await batch.commit();
    }
    const restoreEntries = [...valuesByPath.entries()];
    for (let offset = 0; offset < restoreEntries.length; offset += 450) {
      const batch = db.batch();
      restoreEntries.slice(offset, offset + 450).forEach(([path, data]) => batch.set(db.doc(path), data));
      await batch.commit();
    }
    const verification = verificationSummary(backupStateDifferences(await collectCurrentDocuments(), savedRecords));
    if (!verification.verified) {
      const error = new Error('복원 후 데이터 검증에 실패했습니다. 안전 백업으로 되돌릴 수 있습니다.');
      error.verification = verification;
      throw error;
    }
    await result.set({ status: 'completed', verification, verifiedAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp(), error: null }, { merge: true });
    await backup.set({ lastRestoredAt: FieldValue.serverTimestamp(), lastSafetyBackupId: safetyBackupId }, { merge: true });
    return { backupId, safetyBackupId, restoreCount: preview.restoreCount, deleteCount: preview.deleteCount, documentCount: preview.documentCount, verification, status: 'completed' };
  } catch (error) {
    console.error('weekly backup restore error', error);
    await result.set({ status: 'failed', safetyBackupId, verification: error?.verification || null, completedAt: FieldValue.serverTimestamp(), error: error instanceof Error ? error.message.slice(0, 500) : '알 수 없는 오류' }, { merge: true });
    if (error && typeof error === 'object') error.safetyBackupId = safetyBackupId;
    throw error;
  }
}

function isSourcePath(path) {
  const segments = typeof path === 'string' ? path.split('/') : [];
  return segments.length > 0 && segments.length % 2 === 0 && segments.every(Boolean) && !EXCLUDED_ROOT_COLLECTIONS.has(segments[0]);
}
