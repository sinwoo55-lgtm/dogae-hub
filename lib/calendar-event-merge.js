const HOLIDAY_ALIASES = {
  '석가탄신일': '부처님오신날',
  '부처님오신날': '부처님오신날',
  '기독탄신일': '성탄절',
  '성탄절': '성탄절'
};

export function comparableCalendarLabel(value) {
  const label = String(value || '').replace(/\s+/g, '').trim();
  return HOLIDAY_ALIASES[label] || label;
}

function holidayGroup(value) {
  const label = comparableCalendarLabel(value);
  if (label.includes('대체공휴일')) return 'substitute-holiday';
  if (label.includes('설날') || label.includes('설연휴')) return 'lunar-new-year';
  if (label.includes('추석') || label.includes('추석연휴')) return 'chuseok';
  return '';
}

// 나이스 일정과 공휴일 API가 같은 날의 같은 공휴일을 서로 다른 표현으로
// 제공할 때, 학교 일정에 적힌 표현만 남긴다. 서로 관련 없는 일정은 보존한다.
export function mergeCalendarDayEvents(items) {
  const unique = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const type = item?.type === 'holiday' ? 'holiday' : 'academic';
    const label = String(item?.label || '').trim();
    const comparable = comparableCalendarLabel(label);
    const key = `${type}:${comparable}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    unique.push({ type, label });
  });

  const academicLabels = unique.filter((item) => item.type === 'academic').map((item) => item.label);
  return unique.filter((item) => {
    if (item.type !== 'holiday') return true;
    const comparable = comparableCalendarLabel(item.label);
    const group = holidayGroup(item.label);
    return !academicLabels.some((academic) => {
      const academicComparable = comparableCalendarLabel(academic);
      return academicComparable === comparable || (group && holidayGroup(academic) === group);
    });
  });
}
