export function timetableTerm(value) {
  const academicYear = Number(value?.academicYear);
  const semester = String(value?.semester ?? '');
  if (!Number.isInteger(academicYear) || academicYear < 2020 || academicYear > 2100 || !['1', '2'].includes(semester)) return null;
  return { academicYear, semester };
}

export function timetableTermLabel(value) {
  const term = timetableTerm(value);
  return term ? `${term.academicYear}학년도 ${term.semester}학기` : '';
}
