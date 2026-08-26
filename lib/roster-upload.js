const ROSTER_COLUMNS = ['grade', 'classNo', 'class', 'number', 'name'];

// 업로드 시트의 안내 영역처럼 학생 정보 열이 모두 비어 있는 행은 명단으로 처리하지 않는다.
export function hasRosterUploadData(value) {
  return Boolean(value && typeof value === 'object' && ROSTER_COLUMNS.some((column) => String(value[column] ?? '').trim() !== ''));
}
