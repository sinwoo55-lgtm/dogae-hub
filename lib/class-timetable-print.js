const PAPERS = {
  A4: { name: 'A4', widthMm: 210, heightMm: 297 },
  B4: { name: 'B4', widthMm: 257, heightMm: 364 },
};

const MODES = {
  single: { kind: 'single', rows: 1, columns: 1, count: 1 },
  tile4: { kind: 'tile', rows: 2, columns: 2, count: 4 },
  tile9: { kind: 'tile', rows: 3, columns: 3, count: 9 },
  mini2: { kind: 'mini', rows: 2, columns: 1, count: 2 },
  mini4: { kind: 'mini', rows: 2, columns: 2, count: 4 },
  mini6: { kind: 'mini', rows: 3, columns: 2, count: 6 },
  mini9: { kind: 'mini', rows: 3, columns: 3, count: 9 },
};

export function classTimetablePrintSettings(value = {}) {
  const paper = PAPERS[value.paper] || null;
  const mode = MODES[value.mode] || null;
  return paper && mode ? { paper: { ...paper }, mode: { ...mode } } : null;
}

export function tileBackgroundPosition(index, rows, columns) {
  if (!Number.isInteger(index) || index < 0 || index >= rows * columns || rows < 1 || columns < 1) return null;
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    xPercent: columns === 1 ? 50 : (column / (columns - 1)) * 100,
    yPercent: rows === 1 ? 50 : (row / (rows - 1)) * 100,
  };
}

export const CLASS_TIMETABLE_PRINT_MODES = Object.keys(MODES);
export const CLASS_TIMETABLE_PAPERS = Object.keys(PAPERS);
