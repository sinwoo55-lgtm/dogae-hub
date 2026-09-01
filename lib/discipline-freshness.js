const KOREA_TIME_ZONE = 'Asia/Seoul';

function dateParts(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  const year = pick('year'), month = pick('month'), day = pick('day');
  return year && month && day ? { year, month, day } : null;
}

export function koreaDateKey(value) {
  const parts = dateParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : '';
}

export function koreaYesterdayKey(now = new Date()) {
  const parts = dateParts(now);
  if (!parts) return '';
  const yesterday = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) - 1));
  return `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterday.getUTCDate()).padStart(2, '0')}`;
}

export function needsDisciplineRefresh(meta, now = new Date()) {
  const syncedAt = meta?.syncedAt?.toDate ? meta.syncedAt.toDate() : meta?.syncedAt;
  const lastSuccess = koreaDateKey(syncedAt);
  // 예약 실행이 누락되더라도, 그날 처음 지적사항을 조회할 때 한 번은 최신
  // 스냅샷을 받는다. 동시 조회는 API의 잠금으로 하나의 요청만 실행된다.
  return meta?.lastResult !== 'success' || !lastSuccess || lastSuccess < koreaDateKey(now);
}
