// A posting date includes the entire day in Korea, independent of server time zone.
const DAY_MS = 24 * 60 * 60 * 1000;
const KOREA_OFFSET_MS = 9 * 60 * 60 * 1000;
export const BOARD_TRASH_RETENTION_MS = 7 * DAY_MS;

export function boardDateStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const utc = new Date(0);
  utc.setUTCFullYear(year, month - 1, day);
  utc.setUTCHours(0, 0, 0, 0);
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return utc.getTime() - KOREA_OFFSET_MS;
}

export function boardPublicationWindow(startDate, endDate) {
  const start = boardDateStart(startDate), end = boardDateStart(endDate);
  if (start === null || end === null || start > end) return null;
  return { startsAt: start, expiresAt: end + DAY_MS, purgeAt: end + DAY_MS + BOARD_TRASH_RETENTION_MS };
}

export function boardPublicationState(window, now = Date.now()) {
  if (!window || !Number.isFinite(now)) throw new TypeError('Invalid board publication window');
  if (now < window.startsAt) return 'scheduled';
  if (now < window.expiresAt) return 'published';
  if (now < window.purgeAt) return 'trash';
  return 'purge';
}
