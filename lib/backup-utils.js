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
