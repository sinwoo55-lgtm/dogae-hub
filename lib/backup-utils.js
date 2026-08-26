export function koreaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function backupItemId(path) {
  return Buffer.from(path, 'utf8').toString('base64url');
}

export function isRestorableBackupId(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') || /^pre-restore-\d{13}$/.test(value || '');
}

export function restorePlan(currentPaths, backupPaths) {
  const current = new Set(currentPaths);
  const backup = new Set(backupPaths);
  return {
    deletePaths: [...current].filter((path) => !backup.has(path)),
    restorePaths: [...backup],
  };
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (typeof left.isEqual === 'function') return left.isEqual(right);
  if (left instanceof Date || right instanceof Date) return left instanceof Date && right instanceof Date && left.getTime() === right.getTime();
  if (Buffer.isBuffer(left) || Buffer.isBuffer(right)) return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]));
}

export function backupStateDifferences(currentRecords, backupRecords) {
  const current = new Map(currentRecords.map((record) => [record.path, record.data]));
  const backup = new Map(backupRecords.map((record) => [record.path, record.data]));
  const extraPaths = [...current.keys()].filter((path) => !backup.has(path));
  const missingPaths = [...backup.keys()].filter((path) => !current.has(path));
  const changedPaths = [...backup.keys()].filter((path) => current.has(path) && !valuesEqual(current.get(path), backup.get(path)));
  return { extraPaths, missingPaths, changedPaths, matches: extraPaths.length === 0 && missingPaths.length === 0 && changedPaths.length === 0 };
}

export function recentRestoreResults(records, limit = 12) {
  const timestamp = (value) => value?.toMillis ? value.toMillis() : Number(value || 0);
  return [...records].sort((left, right) => timestamp(right.startedAt) - timestamp(left.startedAt)).slice(0, limit);
}
