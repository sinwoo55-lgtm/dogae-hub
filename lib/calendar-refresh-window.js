export const DEFAULT_CALENDAR_REFRESH_SPAN = 1;

export function calendarRefreshYears(center, span = DEFAULT_CALENDAR_REFRESH_SPAN) {
  return Array.from({ length: (span * 2) + 1 }, (_, index) => center - span + index).filter((year) => year >= 2020 && year <= 2100);
}
