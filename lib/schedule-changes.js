export function nextScheduleVersion(currentVersion) {
  return Math.max(0, Number(currentVersion) || 0) + 1;
}

export function versionedScheduleChanges(currentVersion, changes, changedAt) {
  const version = nextScheduleVersion(currentVersion);
  return { version, changes: changes.map((change) => ({ version, ...change, changedAt })) };
}
