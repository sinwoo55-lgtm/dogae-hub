export function deduplicateRoster(rows) {
  const unique = new Map();
  for (const row of rows) {
    const key = `${row.grade}-${row.classNo}-${row.number}`, previous = unique.get(key);
    const rowActive = row.status !== '전출', previousActive = previous?.status !== '전출';
    if (!previous || (rowActive && !previousActive) || (rowActive === previousActive && row.updatedAt >= previous.updatedAt)) unique.set(key, row);
  }
  return [...unique.values()].map(({ updatedAt, ...row }) => row);
}
